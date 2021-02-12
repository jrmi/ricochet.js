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

const getRemoteFromQuery = ({
  headers: {
    'x-spc-host': spcHost = '',
    'x-ricochet-origin': ricochetOrigin,
    origin,
    referer,
  },
}) => ricochetOrigin || origin || (referer ? new URL(referer).origin : spcHost);

// Remote setup Middleware
export const remote = ({
  setupFunction = 'setup.js',
  configFile = '/config.json',
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
      } = req;

      const remote = getRemoteFromQuery(req);

      if (!remote) {
        throwError(
          'One of x-ricochet-origin, Origin, Referer header is required',
          400
        );
      }

      req.ricochetOrigin = remote;

      if (clearCache) {
        remoteCode.clearCache(remote);
        log.info(`Clear cache for ${remote}`);
      }

      let config = null;
      try {
        // Add siteId to request
        config = await remoteCode.getConfig(remote);
        req.siteId = config.siteId;
      } catch ({ status, error }) {
        if (status === 'not-found') {
          // File is missing. We quit.
          throwError(
            'A config file must be available from remote to use this service',
            400
          );
        } else {
          throw error;
        }
      }

      if (!setupLoaded[remote] || disableCache || clearCache) {
        try {
          await remoteCode.exec(remote, setupFunction, {
            ...config,
            ...context,
          });
          setupLoaded[remote] = true;
          log.info(`Setup successfully loaded from ${remote}`);
        } catch (e) {
          log.warn({ error: e }, `Fails to load setup from ${remote}`);
          throwError(e, 500);
        }
      }

      next();
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
