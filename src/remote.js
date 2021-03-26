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
}) => ricochetOrigin || (referer ? new URL(referer).origin : origin || spcHost);

// Remote setup Middleware
export const remote = ({
  setupFunction = 'setup.js',
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
  });

  router.use(
    errorGuard(async (req, res, next) => {
      const {
        query: { clearCache },
      } = req;

      const remote = getRemoteFromQuery(req);

      if (!remote) {
        throwError(
          'One of X-Ricochet-Origin, Origin, Referer header is required',
          400
        );
      }

      req.ricochetOrigin = remote;

      if (clearCache) {
        remoteCode.clearCache(remote);
        log.info(`Clear cache for ${remote}`);
      }

      if (!setupLoaded[remote] || disableCache || clearCache) {
        try {
          let contextAddition = context;
          if (typeof context === 'function') {
            contextAddition = context(req);
          }

          await remoteCode.exec(req.siteId, remote, setupFunction, {
            ...contextAddition,
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

  router.get(`/ping`, async (req, res) => {
    res.send('ok');
  });

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    res
      .status(err.statusCode || 500)
      .json({ message: err.message, stackTrace: err.stack });
  });

  return router;
};

export default remote;
