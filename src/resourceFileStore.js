import express from 'express';
import { MemoryFileBackend, wrapBackend } from './fileStoreBackend.js';

const DEFAULT_PREFIX = 'file';

/* ROADMAP
- Add security
*/

const errorGuard = (func) => async (req, res, next) => {
  try {
    return await func(req, res, next);
  } catch (error) {
    console.log(error);
    next(error);
  }
};

/**
 *
 * @param {object} options
 */
//export const fileStorage = (type = 'memory', config = {}) => {
export const fileStorage = (backend = MemoryFileBackend(), { prefix }) => {
  const app = express.Router();

  //const { prefix = DEFAULT_PREFIX } = config;

  /*const getPathFromReq = (req) => {
    const { siteId, boxId, resourceId } = req;

    return `${siteId}/${prefix}/${boxId}/${resourceId}/file`;
  };*/

  /*const backendConfig = { pathFromReq: getPathFromReq, ...config };

  let backend = null;

  if (type === 'memory') {
    backend = MemoryFileBackend(backendConfig);
  }
  if (type === 'disk') {
    backend = DiskFileBackend(backendConfig);
  }
  if (type === 's3') {
    backend = S3FileBackend(backendConfig);
  }*/

  // Store a file
  app.post(
    `/`,
    backend.uploadManager,
    errorGuard(async (req, res) => {
      const { siteId, boxId, resourceId, file, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(
        backend,
        prefix,
        siteId,
        authenticatedUser
      );

      const filename = await wrappedBackend.store(boxId, resourceId, file);

      const pathPrefix = `${siteId}/${prefix}/${boxId}/${resourceId}/file`;

      res.send(`${pathPrefix}/${filename}`);
    })
  );

  // List stored file under namespace
  app.get(
    `/`,
    errorGuard(async (req, res) => {
      const { siteId, boxId, resourceId, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(
        backend,
        prefix,
        siteId,
        authenticatedUser
      );

      const result = await wrappedBackend.list(boxId, resourceId);

      const pathPrefix = `${siteId}/${prefix}/${boxId}/${resourceId}/file`;

      res.json(result.map((filename) => `${pathPrefix}/${filename}`));
      //res.json(result);
    })
  );

  // Get one file
  app.get(
    `/:filename`,
    errorGuard(async (req, res, next) => {
      const {
        siteId,
        boxId,
        resourceId,
        authenticatedUser,
        params: { filename },
      } = req;

      const wrappedBackend = wrapBackend(
        backend,
        prefix,
        siteId,
        authenticatedUser
      );

      if (!(await wrappedBackend.exists(boxId, resourceId, filename))) {
        res.status(404).send('Not found');
        return;
      }

      const {
        stream,
        redirectTo,
        mimetype,
        length,
        lastModifield,
        eTag,
        statusCode = 200,
      } = await wrappedBackend.get(boxId, resourceId, filename, req.headers);

      // Here the backend respond with another url so we redirect to it
      if (redirectTo) {
        res.redirect(redirectTo);
        return;
      }

      if (length !== undefined) {
        res.set('Content-Length', length);
      }
      if (lastModifield !== undefined) {
        res.set('Last-Modified', lastModifield);
      }
      if (eTag !== undefined) {
        res.set('ETag', eTag);
      }
      res.set('Content-Type', mimetype);

      if (statusCode < 300) {
        res.status(statusCode);
        stream.on('error', next).pipe(res);
      } else {
        if (statusCode === 304) {
          res.status(statusCode);
          res.end();
        } else {
          res.status(statusCode);
          res.end('Unknow Error');
        }
      }
    })
  );

  // Delete an entry
  app.delete(
    `/:filename`,
    errorGuard(async (req, res) => {
      const {
        siteId,
        boxId,
        resourceId,
        authenticatedUser,
        params: { filename },
      } = req;

      const wrappedBackend = wrapBackend(
        backend,
        prefix,
        siteId,
        authenticatedUser
      );

      if (!(await wrappedBackend.exists(boxId, resourceId, filename))) {
        res.status(404).send('Not found');
        return;
      }

      await wrappedBackend.delete(boxId, resourceId, filename);

      res.json({ message: 'Deleted' });
    })
  );

  return app;
};

export default fileStorage;
