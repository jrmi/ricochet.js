import express from 'express';
import { MemoryBackend, wrapBackend } from './backends';
import { MemoryFileBackend } from '../fileStore/backends';
import fileStore from '../fileStore';
import { throwError, errorGuard, errorMiddleware } from '../error';

// Utility functions

// ROADMAP
// - Add bulk operations with atomicity
// - Add Queries
// - Add relationship
// - Add http2 relationship ?
// - Add multiple strategies
//   - Read / Write
//   - Read only
//   - No access (only from execute)

const SAFE_METHOD = ['GET', 'OPTIONS', 'HEAD'];

// Store Middleware
export const store = ({
  prefix = 'store',
  backend = MemoryBackend(),
  fileBackend = MemoryFileBackend(),
  hooks = {},
} = {}) => {
  const router = express.Router();

  const applyHooks = async (
    type,
    req,
    roContextAddition,
    writableContextAddition = {}
  ) => {
    let hooksMap = hooks;
    if (typeof hooks === 'function') {
      hooksMap = hooks(req);
    }

    const {
      body,
      params: { boxId, id },
      query,
      method,
      authenticatedUser = null,
    } = req;

    const roContext = {
      method,
      boxId: boxId,
      resourceId: id,
      userId: authenticatedUser,
      ...roContextAddition,
    };

    let context = {
      query,
      body,
      ...writableContextAddition,
      ...roContext,
    };

    const hookList = hooksMap[type] || [];

    for (const hook of hookList) {
      const newContext = await hook(context);
      context = { ...newContext, ...roContext };
    }

    return context;
  };

  // Resource list
  router.get(
    `/${prefix}/:boxId/`,
    errorGuard(async (req, res) => {
      const { boxId } = req.params;
      const { siteId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      const { query, allow = false } = await applyHooks('before', req, {
        store: wrappedBackend,
      });

      if (!allow && !(await wrappedBackend.checkSecurity(boxId, null))) {
        throwError('You need read access for this box', 403);
      }

      const {
        limit = '50',
        sort = '_createdOn',
        skip = '0',
        q,
        fields,
      } = query;

      const onlyFields = fields ? fields.split(',') : [];

      const parsedLimit = parseInt(limit, 10);
      const parsedSkip = parseInt(skip, 10);

      let sortProperty = sort;
      let asc = true;

      // If prefixed with '-' inverse order
      if (sort[0] === '-') {
        sortProperty = sort.substring(1);
        asc = false;
      }

      const response = await wrappedBackend.list(boxId, {
        sort: sortProperty,
        asc,
        limit: parsedLimit,
        skip: parsedSkip,
        onlyFields: onlyFields,
        q,
      });

      const { response: hookedResponse } = await applyHooks(
        'after',
        req,
        {
          query,
          store: wrappedBackend,
        },
        { response }
      );

      res.json(hookedResponse);
    })
  );

  // One object
  router.get(
    `/${prefix}/:boxId/:id`,
    errorGuard(async (req, res) => {
      const { boxId, id } = req.params;

      const { siteId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      if (boxId[0] === '_') {
        throwError(
          "'_' char is forbidden as first letter of a box id parameter",
          400
        );
      }

      const { allow = false } = await applyHooks('before', req, {
        store: wrappedBackend,
      });

      if (!allow && !(await wrappedBackend.checkSecurity(boxId, id))) {
        throwError('You need read access for this box', 403);
      }

      const response = await wrappedBackend.get(boxId, id);

      const { response: hookedResponse } = await applyHooks(
        'after',
        req,
        {
          store: wrappedBackend,
        },
        { response }
      );

      res.json(hookedResponse);
    })
  );

  // Create / replace object
  router.post(
    `/${prefix}/:boxId/:id?`,
    errorGuard(async (req, res) => {
      const {
        params: { boxId, id },
        siteId,
        authenticatedUser,
      } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      if (boxId[0] === '_') {
        throwError(
          "'_' char is forbidden for first letter of a box id parameter",
          400
        );
      }

      const { body, allow = false } = await applyHooks('before', req, {
        store: wrappedBackend,
      });

      if (!allow && !(await wrappedBackend.checkSecurity(boxId, id, true))) {
        throwError('You need write access for this box', 403);
      }

      const response = await wrappedBackend.save(boxId, id, body);

      const { response: hookedResponse } = await applyHooks('after', req, {
        response,
        store: wrappedBackend,
      });

      return res.json(hookedResponse);
    })
  );

  // Update existing object
  router.put(
    `/${prefix}/:boxId/:id`,
    errorGuard(async (req, res) => {
      const { boxId, id } = req.params;

      const { siteId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      if (boxId[0] === '_') {
        throwError(
          "'_' char is forbidden for first letter of a letter of a box id parameter",
          400
        );
      }

      const { body, allow = false } = await applyHooks('before', req, {
        store: wrappedBackend,
      });

      if (!allow && !(await wrappedBackend.checkSecurity(boxId, id, true))) {
        throwError('You need write access for this resource', 403);
      }

      const response = await wrappedBackend.update(boxId, id, body);

      const { response: hookedResponse } = await applyHooks('after', req, {
        response,
        store: wrappedBackend,
      });

      return res.json(hookedResponse);
    })
  );

  // Delete object
  router.delete(
    `/${prefix}/:boxId/:id`,
    errorGuard(async (req, res) => {
      const { boxId, id } = req.params;

      const { siteId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      if (boxId[0] === '_') {
        throwError(
          "'_' char is forbidden for first letter of a box id parameter",
          400
        );
      }

      const { allow = false } = await applyHooks('before', req, {
        store: wrappedBackend,
      });

      if (!allow && !(await wrappedBackend.checkSecurity(boxId, id, true))) {
        throwError('You need write access for this resource', 403);
      }

      const result = await wrappedBackend.delete(boxId, id);

      await applyHooks('after', req, {
        store: wrappedBackend,
      });

      if (result === 1) {
        res.json({ message: 'Deleted' });
        return;
      }

      throwError('Box or resource not found', 404);
    })
  );

  router.use(
    `/${prefix}/:boxId/:id/file`,
    errorGuard(async (req, _, next) => {
      const { boxId, id } = req.params;

      const { siteId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      const { allow = false } = await applyHooks('beforeFile', req, {
        store: wrappedBackend,
      });

      if (
        !allow &&
        !(await wrappedBackend.checkSecurity(
          boxId,
          id,
          !SAFE_METHOD.includes(req.method)
        ))
      ) {
        throwError('You need write access for this resource', 403);
      }

      req.boxId = boxId;
      req.resourceId = id;
      next();
    }),
    fileStore(fileBackend, { prefix }),
    errorGuard(async (req, _, next) => {
      const { siteId, authenticatedUser } = req;
      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      console.log('execute after file hooks');

      await applyHooks('afterFile', req, {
        store: wrappedBackend,
      });

      next();
    })
  );

  router.use(errorMiddleware);

  return router;
};

export default store;
