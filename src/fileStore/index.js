import express from 'express';
import { MemoryFileBackend, wrapBackend } from './backends/index.js';
import { errorGuard } from '../error.js';

/* ROADMAP
 */

// In ms
//const FILE_CACHE_EXPIRATION = 60_000;

/**
 *
 * @param {object} options
 */
export const fileStorage = (backend = MemoryFileBackend(), { prefix }) => {
  const app = express.Router();

  // Store a file
  app.post(
    `/`,
    backend.uploadManager,
    errorGuard(async (req, res) => {
      const { siteId, boxId, resourceId, file, authenticatedUser } = req;

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

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

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      const result = await wrappedBackend.list(boxId, resourceId);

      const pathPrefix = `${siteId}/${prefix}/${boxId}/${resourceId}/file`;

      res.json(result.map((filename) => `${pathPrefix}/${filename}`));
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

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

      if (!(await wrappedBackend.exists(boxId, resourceId, filename))) {
        res.status(404).send('Not found');
        return;
      }

      const {
        stream,
        redirectTo,
        mimetype,
        length,
        lastModified,
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
      if (lastModified !== undefined) {
        res.set('Last-Modified', lastModified);
      }
      if (eTag !== undefined) {
        res.set('ETag', eTag);
      }
      res.set('Content-Type', mimetype);

      // Set a minimal cache
      /* res.setHeader(
        'Cache-Control',
        'public, max-age=' + FILE_CACHE_EXPIRATION / 1000
      );
      res.setHeader(
        'Expires',
        new Date(Date.now() + FILE_CACHE_EXPIRATION).toUTCString()
      );*/

      if (statusCode < 300) {
        res.status(statusCode);
        stream.on('error', next).pipe(res);
      } else {
        if (statusCode === 304) {
          res.status(statusCode);
          res.end();
        } else {
          res.status(statusCode);
          res.end('Unknown Error');
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

      const wrappedBackend = wrapBackend(backend, siteId, authenticatedUser);

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
