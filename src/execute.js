import express from 'express';
import http from 'http';
import vm from 'vm';

/* Roadmap
- Encrypt setyp.js
- Allow to register new site
  - Return public key if no key pair is given
- Allow to sign code
*/

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    // console.log(error);
    next(error);
  }
};

// Execute Middleware
export const exec = ({
  prefix = 'execute',
  context = {},
  remote,
  setup = 'setup',
  disableCache = false,
} = {}) => {
  const router = express.Router();
  const functionCache = {};

  /**
   * Get and cache the script designed by name from remote
   * @param {string} functionName script name.
   * @param {string} extraCommands to be concatened at the end of script.
   */
  const cacheOrFetch = async (functionName, extraCommands = '') => {
    if (functionCache[functionName]) {
      return functionCache[functionName];
    } else {
      return new Promise((resolve, reject) => {
        const functionUrl = `${remote}/${functionName}.js`;

        http
          .get(functionUrl, (resp) => {
            if (resp.statusCode === 404) {
              resolve(null);
              return;
            }

            let data = '';
            resp.on('data', (chunk) => {
              data += chunk;
            });
            resp.on('end', () => {
              data += extraCommands;
              try {
                const script = new vm.Script(data, { filename: functionUrl });
                if (!disableCache) functionCache[functionName] = script;
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
  };

  const getConfig = async () => {
    const toRun = await cacheOrFetch(setup, '\nmain(__params);');
    if (toRun) {
      const setupContext = {
        console,
        __params: { ...context },
      };
      return await toRun.runInNewContext(setupContext);
    } else {
      return {};
    }
  };

  let configPromise = getConfig();

  // Route all query to correct script
  router.all(
    `/${prefix}/:functionName/:id?`,
    errorGuard(async (req, res) => {
      const {
        body,
        params: { functionName, id },
        query,
        method,
        authenticatedUser = null,
      } = req;

      const toRun = await cacheOrFetch(functionName, '\nmain(__params);');
      if (!toRun) {
        res.status(404).send('Not found');
        return;
      }

      if (!configPromise || disableCache) {
        configPromise = getConfig();
      }

      // Wait to be sure config is resolved
      const config = await configPromise;

      const fullContext = {
        console,
        __params: {
          query,
          body,
          method,
          id,
          userId: authenticatedUser,
          ...context,
          ...config,
        },
      };

      const result = await toRun.runInNewContext(fullContext);
      res.json(result);
    })
  );

  router.use((err, req, res, _next) => {
    res
      .status(err.statusCode || 500)
      .json({ message: err.message, stackTrace: err.stack });
  });

  return router;
};

export default exec;
