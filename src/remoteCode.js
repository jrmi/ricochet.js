import http from 'http';
import https from 'https';
import vm from 'vm';

import NodeCache from 'node-cache';

class RemoteCode {
  constructor({
    disableCache = false,
    preProcess = (script) => script,
    configFile = '/config.json',
  }) {
    const cacheConfig = {
      useClones: false,
      stdTTL: 200,
      checkperiod: 250,
    };
    Object.assign(this, {
      disableCache,
      scriptCache: new NodeCache(cacheConfig),
      configCache: new NodeCache(cacheConfig),
      cacheConfig,
      configFile,
      preProcess,
    });
  }

  /**
   * Load config from remote. Returns the config dict.
   * @param {string} remote
   */
  async getConfig(remote) {
    if (!this.configCache.has(remote) || this.disableCache) {
      const httpClient = remote.startsWith('https') ? https : http;
      const result = await new Promise((resolve, reject) => {
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
      this.configCache.set(remote, result);
    }

    return this.configCache.get(remote);
  }

  /**
   * Get and cache the script designed by name from remote
   * @param {string} scriptName script name.
   * @param {string} extraCommands to be concatened at the end of script.
   */
  async cacheOrFetch(remote, scriptName, extraCommands = '') {
    if (!this.scriptCache.has(remote)) {
      this.scriptCache.set(remote, new NodeCache(this.cacheConfig));
    }

    const cache = this.scriptCache.get(remote);

    if (cache.has(scriptName) && !this.disableCache) {
      return cache.get(scriptName);
    } else {
      const httpClient = remote.startsWith('https') ? https : http;
      const config = this.configCache.get(remote);
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
              try {
                script = this.preProcess.bind(this)(script, config);
              } catch (e) {
                reject({ status: 'error', error: e });
              }
              script += extraCommands;
              try {
                const parsedScript = new vm.Script(script, {
                  filename: scriptUrl,
                });
                cache.set(scriptName, parsedScript);
                this.scriptCache.set(remote, cache);

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
    try {
      await this.getConfig(remote);
    } catch ({ status, error }) {
      if (status === 'not-found') {
        // File is missing. We quit.
        return;
      } else {
        throw error;
      }
    }

    try {
      const toRun = await this.cacheOrFetch(
        remote,
        scriptName,
        '\nmain(__params);'
      );
      const scriptContext = {
        console,
        __params: { ...context },
      };
      return await toRun.runInNewContext(scriptContext);
    } catch (e) {
      if (e.status === 'not-found') {
        throw `Script ${scriptName} not found on remote ${remote}`;
      } else {
        if (e.error) {
          throw e.error;
        } else {
          throw e;
        }
      }
    }
  }

  clearCache(remote) {
    this.scriptCache.del(remote);
    this.configCache.del(remote);
  }
}

export default RemoteCode;
