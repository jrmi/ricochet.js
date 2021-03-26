import http from 'http';
import https from 'https';
import vm from 'vm';

import NodeCache from 'node-cache';

class RemoteCode {
  constructor({ disableCache = false, preProcess = (script) => script }) {
    const cacheConfig = {
      useClones: false,
      stdTTL: 200,
      checkperiod: 250,
    };
    Object.assign(this, {
      disableCache,
      scriptCache: new NodeCache(cacheConfig),
      cacheConfig,
      preProcess,
    });
  }

  /**
   * Get and cache the script designed by name from remote
   * @param {string} scriptName script name.
   * @param {string} extraCommands to be concatened at the end of script.
   */
  async cacheOrFetch(siteId, remote, scriptName, extraCommands = '') {
    if (!this.scriptCache.has(remote)) {
      this.scriptCache.set(remote, new NodeCache(this.cacheConfig));
    }

    const cache = this.scriptCache.get(remote);

    if (cache.has(scriptName) && !this.disableCache) {
      return cache.get(scriptName);
    } else {
      const httpClient = remote.startsWith('https') ? https : http;
      return new Promise((resolve, reject) => {
        const scriptUrl = `${remote}/${scriptName}.js`.replace('//', '/');

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
                script = this.preProcess.bind(this)(script, siteId);
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

  async exec(siteId, remote, scriptName, context) {
    try {
      const toRun = await this.cacheOrFetch(
        siteId,
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
  }
}

export default RemoteCode;
