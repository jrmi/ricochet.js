import aws from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import mime from 'mime-types';
import { nanoid } from 'nanoid';
import express from 'express';
import path from 'path';
import fs from 'fs';
import log from './log.js';

const DEFAULT_PREFIX = 'file';

/* ROADMAP
- Add security

*/

/**
 *
 * @param {object} options
 */
export const fileStorage = (type = 'memory', config = {}) => {
  const app = express.Router();

  // Memory storage
  if (type === 'memory') {
    const { url = '', prefix = DEFAULT_PREFIX } = config;
    const fileMap = {};
    const upload = multer({ storage: multer.memoryStorage() });

    app.post(`/${prefix}/:namespace/`, upload.single('file'), (req, res) => {
      const { params: { namespace } = {} } = req;

      const ext = mime.extension(req.file.mimetype);
      const filename = `${nanoid()}.${ext}`;
      const store = fileMap[namespace] || {};

      store[filename] = {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
      };

      fileMap[namespace] = store;
      res.send(`${url}/${prefix}/${namespace}/${filename}`);
    });

    app.get(`/${prefix}/:namespace/`, (req, res) => {
      const {
        params: { namespace },
      } = req;

      const store = fileMap[namespace] || {};
      const result = Object.keys(store);
      res.json(
        result.map((filename) => `${url}/${prefix}/${namespace}/${filename}`)
      );
    });

    app.get(`/${prefix}/:namespace/:filename`, (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      if (!fileMap[namespace]) {
        res.status(404).send('Not found');
        return;
      }

      const fileBuffer = fileMap[namespace][filename];

      if (!fileBuffer) {
        res.status(404).send('Not found');
        return;
      }

      res.set('Content-type', fileBuffer.mimetype);
      res.send(fileBuffer.buffer);
    });

    app.delete(`/${prefix}/:namespace/:filename`, (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      if (!fileMap[namespace]) {
        res.status(404).send('Not found');
        return;
      }

      const fileBuffer = fileMap[namespace][filename];

      if (!fileBuffer) {
        res.status(404).send('Not found');
        return;
      }

      delete fileMap[namespace][filename];

      res.json({ message: 'Deleted' });
    });
  }

  // File storage
  if (type === 'disk') {
    const { url = '', prefix = DEFAULT_PREFIX, destination } = config;

    const storage = multer.diskStorage({
      destination: (req, tt, cb) => {
        const {
          params: { namespace },
        } = req;

        const destinationDir = path.join(destination, namespace);
        if (!fs.existsSync(destinationDir)) {
          fs.mkdirSync(destinationDir);
        }
        cb(null, path.join(destination, namespace));
      },
      filename: (req, file, cb) => {
        const ext = mime.extension(file.mimetype);
        const filename = `${nanoid()}.${ext}`;
        cb(null, filename);
      },
    });

    const upload = multer({ storage: storage });

    app.post(`/${prefix}/:namespace/`, upload.single('file'), (req, res) => {
      const {
        params: { namespace },
      } = req;

      res.send(`${url}/${prefix}/${namespace}/${req.file.filename}`);
    });

    app.get(`/${prefix}/:namespace/`, (req, res) => {
      const {
        params: { namespace },
      } = req;

      const dir = path.join(destination, namespace);

      fs.readdir(dir, (err, files) => {
        if (err) {
          /* istanbul ignore next */
          throw err;
        } else {
          res.json(
            files.map((filename) => `${url}/${prefix}/${namespace}/${filename}`)
          );
        }
      });
    });

    app.get(`/${prefix}/:namespace/:filename`, (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      const filePath = path.join(destination, namespace, filename);
      res.download(filePath);
    });

    app.delete(`/${prefix}/:namespace/:filename`, (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      const filePath = path.join(destination, namespace, filename);

      if (!fs.existsSync(filePath)) {
        res.status(404).send('Not found');
        return;
      }

      fs.unlink(filePath, (err) => {
        if (err) {
          /* istanbul ignore next */
          throw err;
        }

        res.json({ message: 'Deleted' });
      });
    });
  }

  // S3 storage
  if (type === 's3') {
    const {
      prefix = DEFAULT_PREFIX,
      bucket,
      secretKey,
      accessKey,
      endpoint,
      url,
    } = config;

    aws.config.update({
      secretAccessKey: secretKey,
      accessKeyId: accessKey,
      endpoint: endpoint,
    });

    const s3 = new aws.S3();

    const upload = multer({
      storage: multerS3({
        s3: s3,
        acl: 'public-read',
        bucket: bucket,
        //contentType: multerS3.AUTO_CONTENT_TYPE,
        contentType: (req, file, cb) => {
          cb(null, file.mimetype);
        },
        key: (req, file, cb) => {
          const {
            params: { namespace },
          } = req;

          const ext = mime.extension(file.mimetype);
          cb(null, `${namespace}/${nanoid()}.${ext}`);
        },
      }),
      limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
    });

    // Upload file
    app.post(`/${prefix}/:namespace/`, upload.single('file'), (req, res) => {
      const {
        params: { namespace },
      } = req;

      res.send(`${url}/${prefix}/${req.file.key}`);
    });

    // Get one file
    app.get(`/${prefix}/:namespace/:filename`, (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      const params = {
        Bucket: bucket,
        Key: `${namespace}/${filename}`,
      };
      s3.getObject(params, (err, fileData) => {
        if (err) {
          if (err.code === 'NoSuchKey') {
            res.status(404).send('Not found');
          } else {
            /* istanbul ignore next */
            throw err;
          }
        } else {
          res.set('Content-type', fileData.ContentType);
          res.send(fileData.Body);
        }
      });
    });

    // List files
    app.get(`/${prefix}/:namespace/`, (req, res) => {
      const {
        params: { namespace },
      } = req;

      const params = {
        Bucket: bucket,
        Delimiter: '/',
        Prefix: `${namespace}/`,
      };

      s3.listObjects(params, (err, data) => {
        if (err) {
          /* istanbul ignore next */
          throw error;
        }

        res.send(data.Contents.map(({ Key }) => `/${prefix}/${Key}`));
      });
    });

    // Delete file
    app.delete(`/${prefix}/:namespace/:filename`, async (req, res) => {
      const {
        params: { filename, namespace },
      } = req;

      const key = path.join(namespace, filename);

      const headParams = {
        Bucket: bucket,
        Key: key,
      };

      try {
        await s3.headObject(headParams).promise();
        await s3.deleteObject(headParams).promise();
        res.json({ message: 'Deleted' });
      } catch (headErr) {
        if (headErr.code === 'NotFound') {
          res.status(404).send('Not found');
        } else {
          /* istanbul ignore next */
          throw headErr;
        }
      }
    });
  }
  return app;
};

export default fileStorage;
