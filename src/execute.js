import express from 'express';
import http from 'http';
import https from 'https';
import vm from 'vm';
import log from './log.js';

/* Roadmap
- Encrypt setup.js
- Allow to register new site
  - Return public key if no key pair is given
- Allow to sign code
*/

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    console.log(error);
    next(error);
  }
};

// Execute Middleware
export const exec = ({
  prefix = 'execute',
  context = {},
  functions = {},
} = {}) => {
  const router = express.Router();

  /*router.all(
    `/${prefix}/_register/`,
    errorGuard(async (req, res) => {
      console.log('here');
      const {
        query: { clearCache },
        headers: { 'x-spc-host': remote = '' },
      } = req;

      if (!remote) {
        throwError('X-SPC-Host header is required', 400);
      }

      if (clearCache) {
        delete functionCache[remote];
      }

      if (!configPromise || disableCache) {
        configPromise = getConfig(remote);
      }

      res.send('ok');
    })
  );*/

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

      if (!functions[functionName]) {
        res.status(404).send('Not found');
        return;
      }

      const result = await functions[functionName]({
        query,
        body,
        method,
        id,
        userId: authenticatedUser,
        ...context,
      });
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
