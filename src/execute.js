import express from 'express';
import http from 'http';
import vm from 'vm';

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
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
            reject(err);
          });
      });
    }
  };

  let config = {};

  // Load config
  cacheOrFetch(setup, '\nmain();').then((toRun) => {
    if (toRun) {
      config = toRun.runInNewContext();
    }
  });

  const router = express.Router();
  // One object
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
        ...config,
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
