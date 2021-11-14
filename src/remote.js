import express from 'express';
import log from './log.js';
import RemoteCode from './remoteCode.js';

import { throwError, errorGuard, errorMiddleware } from './error.js';

// Remote setup Middleware
export const remote = ({
  setupPath = 'setup.js',
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
        ricochetOrigin: remote,
      } = req;

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

          await remoteCode.exec(req, remote, setupPath, {
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

  router.use(errorMiddleware);

  return router;
};

export default remote;
