import http from 'http';
import https from 'https';
import vm from 'vm';

class RemoteCode {
  constructor({
    disableCache = false,
    preProcess = (script) => script,
    configFile = '/config.json',
  }) {
    Object.assign(this, {
      disableCache,
      scriptCache: {},
      configCache: {},
      configFile,
      preProcess,
    });
  }

  getConfig(remote) {
    const httpClient = remote.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      const configUrl = `${remote}${this.configFile}`;
      httpClient
        .get(configUrl, (resp) => {
          if (resp.statusCode === 404) {
            reject({
              status: 'not-found',
            });
            return;
          }

          let data = '';
          resp.on('data', (chunk) => {
            data += chunk;
          });
          resp.on('end', () => {
            try {
              const { siteId, scriptPath = '/' } = JSON.parse(data);
              resolve({ siteId, scriptPath });
            } catch (e) {
              reject({
                status: 'error',
                error: e,
              });
            }
          });
        })
        .on('error', (err) => {
          /* istanbul ignore next */
          reject(err);
        });
    });
  }

  /**
   * Get and cache the script designed by name from remote
   * @param {string} scriptName script name.
   * @param {string} extraCommands to be concatened at the end of script.
   */
  async cacheOrFetch(remote, scriptName, extraCommands = '') {
    if (!this.scriptCache[remote]) {
      this.scriptCache[remote] = {};
    }

    if (this.scriptCache[remote][scriptName] && !this.disableCache) {
      return this.scriptCache[remote][scriptName];
    } else {
      const httpClient = remote.startsWith('https') ? https : http;
      const config = this.configCache[remote];
      const { scriptPath } = config;
      return new Promise((resolve, reject) => {
        const scriptUrl = `${remote}${scriptPath}${scriptName}.js`.replace(
          '//',
          '/'
        );

        httpClient
          .get(scriptUrl, (resp) => {
            if (resp.statusCode === 404) {
              reject({ status: 'not-found' });
              return;
            }

            let script = '';
            resp.on('data', (chunk) => {
              script += chunk;
            });
            resp.on('end', () => {
              script = this.preProcess.bind(this)(script, config);
              script += extraCommands;
              try {
                const parsedScript = new vm.Script(script, {
                  filename: scriptUrl,
                });
                this.scriptCache[remote][scriptName] = parsedScript;
                resolve(parsedScript);
              } catch (e) {
                reject({ status: 'error', error: e });
              }
            });
          })
          .on('error', (err) => {
            /* istanbul ignore next */
            reject({ status: 'error', error: err });
          });
      });
    }
  }

  async exec(remote, scriptName, context) {
    // Ensure config is loaded
    if (!this.configCache[remote] || this.disableCache) {
      try {
        this.configCache[remote] = await this.getConfig(remote);
      } catch ({ status, error }) {
        if (status === 'not-found') {
          // File is missing. We quit.
          return;
        } else {
          throw error;
        }
      }
    }
    const scriptContext = {
      console,
      __params: { ...context },
    };

    try {
      const toRun = await this.cacheOrFetch(
        remote,
        scriptName,
        '\nmain(__params);'
      );
      return await toRun.runInNewContext(scriptContext);
    } catch (e) {
      if (e.status === 'not-found') {
        throw `Script ${scriptName} not found on remote ${remote}`;
      } else {
        throw e.error;
      }
    }
  }

  clearCache(remote) {
    this.scriptCache[remote] = {};
    this.configCache[remote] = {};
  }
}

export default RemoteCode;
