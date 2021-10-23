import express from 'express';
import { errorGuard } from './error.js';

/* Roadmap
- Allow to register new site
  - Return public key if no key pair is given
- Allow to sign code
*/

// Execute Middleware
export const exec = ({
  prefix = 'execute',
  context = {},
  functions = {},
} = {}) => {
  const router = express.Router();

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

      let allFunctions = functions;
      if (typeof functions === 'function') {
        allFunctions = functions(req);
      }

      if (!allFunctions[functionName]) {
        res.status(404).send('Not found');
        return;
      }

      let contextAddition = context;

      if (typeof context === 'function') {
        contextAddition = context(req);
      }

      const result = await allFunctions[functionName]({
        query,
        body,
        method,
        id,
        userId: authenticatedUser,
        ...contextAddition,
      });
      res.json(result);
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

export default exec;
