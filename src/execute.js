import express from 'express';
import http from 'http';
import vm from 'vm';

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    // console.log(error);
    next(error);
  }
};

// Exec Middleware
export const exec = ({
  prefix = 'execute',
  context = {},
  remote,
  setup = 'setup',
} = {}) => {
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
                functionCache[functionName] = script;
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

  let _config = null;
  const getConfig = async () => {
    if (!_config) {
      const toRun = await cacheOrFetch(setup, '\nmain();');
      if (toRun) {
        _config = toRun.runInNewContext();
      } else {
        _config = {};
      }
    }
    return _config;
  };

  const router = express.Router();

  router.all(
    `/${prefix}/:functionName/:id?`,
    errorGuard(async (req, res) => {
      const {
        body,
        params: { functionName, id },
        query,
        method,
      } = req;

      const toRun = await cacheOrFetch(functionName, '\nmain();');
      if (!toRun) {
        res.status(404).send('Not found');
        return;
      }

      const fullContext = {
        console,
        query,
        body,
        method,
        id,
        ...context,
        ...(await getConfig()),
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
