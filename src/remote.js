import express from 'express';
import log from './log.js';
import RemoteCode from './remoteCode.js';

const throwError = (message, code = 400) => {
  const errorObject = new Error(message);
  errorObject.statusCode = code;
  throw errorObject;
};

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    // console.log(error);
    next(error);
  }
};

// Remote setup Middleware
export const remote = ({
  prefix = 'remote',
  setupFunction = 'setup.js',
  configFile = 'config.json',
  context = {},
  disableCache,
  preProcess,
} = {}) => {
  const router = express.Router();

  const setupLoaded = {};

  // Remote code caller
  const remoteCode = new RemoteCode({
    disableCache,
    preProcess,
    configFile,
  });

  router.use(
    errorGuard(async (req, res, next) => {
      const {
        query: { clearCache },
        headers: { 'x-spc-host': spcHost = '', origin },
      } = req;

      let remote = null;
      if (spcHost) {
        remote = spcHost;
      } else {
        if (origin) {
          remote = origin;
        }
      }

      if (!remote) {
        throwError('X-SPC-Host or Origin header is required', 400);
      }

      if (clearCache) {
        remoteCode.clearCache(remote);
        log.info(`Clear cache for ${remote}`);
      }

      if (!setupLoaded[remote] || disableCache || clearCache) {
        try {
          await remoteCode.exec(remote, setupFunction, { ...context });
          setupLoaded[remote] = true;
          log.info(`Setup successfully loaded from ${remote}`);
        } catch (e) {
          log.warn({ error: e }, `Fails to load setup from ${remote}`);
          throw e;
        }
      }

      next();
    })
  );

  router.all(
    `/${prefix}/register/`,
    errorGuard(async (req, res) => {
      const {
        headers: { 'x-spc-host': remote = '' },
      } = req;

      if (!remote) {
        throwError('X-SPC-Host header is required', 400);
      }

      res.send('ok');
    })
  );

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    res
      .status(err.statusCode || 500)
      .json({ message: err.message, stackTrace: err.stack });
  });

  return router;
};

export default remote;
