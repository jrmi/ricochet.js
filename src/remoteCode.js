import { config } from 'dotenv/types';
import http from 'http';
import https from 'https';
import vm from 'vm';

class RemoteCode {
  constructor({
    disableCache = false,
    preProcess = (script) => script,
    configFile = 'config.json',
  }) {
    Objects.assign(this, {
      disableCache,
      decryptKey,
      scriptCache: {},
      configCache: {},
      configFile,
      preProcess,
    });
  }

  getConfig(remote) {
    const httpClient = remote.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      httpClient
        .get(`${remote}/${this.configFile}`.replace('//', '/'), (resp) => {
          if (resp.statusCode === 404) {
            reject('Config not found');
            return;
          }

          let data = '';
          resp.on('data', (chunk) => {
            data += chunk;
          });
          resp.on('end', () => {
            try {
              const { siteId, scriptPath } = JSON.parse(data);
              resolve({ siteId, scriptPath });
            } catch (e) {
              reject(e);
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
    if (this.scriptCache[remote][scriptName] || this.disableCache) {
      return this.scriptCache[remote][scriptName];
    } else {
      if (!this.scriptCache[remote]) {
        this.scriptCache[remote] = {};
      }

      const httpClient = remote.startsWith('https') ? https : http;
      const config = this.configCache[remote];
      return new Promise((resolve, reject) => {
        const scriptUrl = `${remote}/${config.scriptBase}/${scriptName}`.replace(
          '//',
          '/'
        );

        httpClient
          .get(scriptUrl, (resp) => {
            if (resp.statusCode === 404) {
              resolve(null);
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
                const script = new vm.Script(script, { filename: scriptUrl });
                this.scriptCache[remote][scriptPath] = script;
                resolve(script);
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', (err) => {
            /* istanbul ignore next */
            reject(err);
          });
      });
    }
  }

  async exec(remote, scriptName, context) {
    // Ensure config is loaded
    if (!this.configCache[remote] || this.disableCache) {
      this.configCache[remote] = await this.getConfig(remote);
    }

    const toRun = await cacheOrFetch(
      remote,
      scriptName,
      '\nmain.default(__params);'
    );
    if (toRun) {
      const scriptContext = {
        console,
        __params: { ...context },
      };
      return await toRun.runInNewContext(scriptContext);
    } else {
      throw 'Script not found on remote';
    }
  }
}

export default RemoteCode;
