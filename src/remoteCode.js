import http from 'http';
import https from 'https';
import { NodeVM } from 'vm2';

import NodeCache from 'node-cache';

const allowedModules = ['http', 'https', 'stream', 'url', 'zlib', 'encoding'];

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
    this.vm = new NodeVM({
      console: 'inherit',
      require: {
        builtin: allowedModules,
        root: './',
      },
    });
  }

  /**
   * Get and cache the script designed by name from remote
   * @param {string} scriptPath script name.
   * @param {string} extraCommands to be concatened at the end of script.
   */
  async cacheOrFetch(req, remote, scriptPath, extraCommands = '') {
    if (!this.scriptCache.has(remote)) {
      this.scriptCache.set(remote, new NodeCache(this.cacheConfig));
    }

    const cache = this.scriptCache.get(remote);

    if (cache.has(scriptPath) && !this.disableCache) {
      return cache.get(scriptPath);
    } else {
      const httpClient = remote.startsWith('https') ? https : http;
      return new Promise((resolve, reject) => {
        const scriptUrl = `${remote}/${scriptPath}`.replace('//', '/');

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
                script = this.preProcess.bind(this)(script, req);
              } catch (e) {
                reject({ status: 'error', error: e });
              }
              script += extraCommands;
              try {
                const scriptFunction = this.vm.run(script).default;
                cache.set(scriptPath, scriptFunction);
                this.scriptCache.set(remote, cache);

                resolve(scriptFunction);
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

  async exec(req, remote, scriptPath, context) {
    try {
      const toRun = await this.cacheOrFetch(req, remote, scriptPath);

      return toRun({ ...context });
    } catch (e) {
      if (e.status === 'not-found') {
        throw `Script ${scriptPath} not found on remote ${remote}`;
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
