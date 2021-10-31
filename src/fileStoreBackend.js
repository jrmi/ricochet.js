import aws from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import mime from 'mime-types';
import path from 'path';
import fs from 'fs';
import { Duplex } from 'stream';

import { uid } from './uid.js';

const bufferToStream = (buffer) => {
  let stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

export const getFileStoreBackend = (type, backendConfig) => {
  switch (type) {
    case 's3':
      return S3FileBackend(backendConfig);
    case 'disk':
      return DiskFileBackend(backendConfig);
    default:
      return MemoryFileBackend(backendConfig);
  }
};

export const wrapBackend = (backend, siteId, userId) => {
  return {
    async store(boxId, resourceId, file) {
      return await backend.store(siteId, boxId, resourceId, file);
    },
    async list(boxId, resourceId) {
      return await backend.list(siteId, boxId, resourceId);
    },
    async exists(boxId, resourceId, filename) {
      return await backend.exists(siteId, boxId, resourceId, filename);
    },
    async get(boxId, resourceId, filename, headers) {
      return await backend.get(siteId, boxId, resourceId, filename, headers);
    },
    async delete(boxId, resourceId, filename) {
      return await backend.delete(siteId, boxId, resourceId, filename);
    },
  };
};

export const MemoryFileBackend = () => {
  const fileMap = {};
  const upload = multer({ storage: multer.memoryStorage() });

  return {
    uploadManager: upload.single('file'),

    async list(siteId, boxId, resourceId) {
      const store = fileMap[`${siteId}/${boxId}/${resourceId}`] || {};
      return Object.keys(store);
    },

    async store(siteId, boxId, resourceId, file) {
      const ext = mime.extension(file.mimetype);
      const filename = `${uid()}.${ext}`;

      file.filename = filename;

      const store = fileMap[`${siteId}/${boxId}/${resourceId}`] || {};

      store[filename] = {
        buffer: file.buffer,
        mimetype: file.mimetype,
      };

      fileMap[`${siteId}/${boxId}/${resourceId}`] = store;

      return filename;
    },

    async exists(siteId, boxId, resourceId, filename) {
      return (
        fileMap[`${siteId}/${boxId}/${resourceId}`] !== undefined &&
        fileMap[`${siteId}/${boxId}/${resourceId}`][filename] !== undefined
      );
    },

    async get(siteId, boxId, resourceId, filename) {
      const fileBuffer = fileMap[`${siteId}/${boxId}/${resourceId}`][filename];
      return {
        mimetype: fileBuffer.mimetype,
        stream: bufferToStream(fileBuffer.buffer),
      };
    },

    async delete(siteId, boxId, resourceId, filename) {
      delete fileMap[`${siteId}/${boxId}/${resourceId}`][filename];
    },
  };
};

export const DiskFileBackend = ({ destination }) => {
  const storage = multer.diskStorage({
    destination: (req, tt, cb) => {
      const destinationDir = path.join(
        destination,
        req.siteId,
        req.boxId,
        req.resourceId
      );

      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
      cb(null, destinationDir);
    },
    filename: (req, file, cb) => {
      const ext = mime.extension(file.mimetype);
      const filename = `${uid()}.${ext}`;
      cb(null, filename);
    },
  });

  const upload = multer({ storage: storage });

  return {
    uploadManager: upload.single('file'),

    async list(siteId, boxId, resourceId) {
      const dir = path.join(destination, siteId, boxId, resourceId);
      return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
          if (err) {
            /* istanbul ignore next */
            if (err.code === 'ENOENT') {
              resolve([]);
            } else {
              reject(err);
            }
          } else {
            resolve(files);
          }
        });
      });
    },

    async store(siteId, boxId, resourceId, file) {
      // Nothing to do here. Already done by upload manager
      return file.filename;
    },

    async exists(siteId, boxId, resourceId, filename) {
      const filePath = path.join(
        destination,
        siteId,
        boxId,
        resourceId,
        filename
      );
      return fs.existsSync(filePath);
    },

    async get(siteId, boxId, resourceId, filename) {
      const filePath = path.join(
        destination,
        siteId,
        boxId,
        resourceId,
        filename
      );
      const stream = fs.createReadStream(filePath);

      const mimetype = mime.lookup(filename);
      return { mimetype, stream };
    },

    async delete(siteId, boxId, resourceId, filename) {
      const filePath = path.join(
        destination,
        siteId,
        boxId,
        resourceId,
        filename
      );
      return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
};

// Help here https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html
export const S3FileBackend = ({
  bucket,
  secretKey,
  accessKey,
  endpoint,
  region,
  proxy = false,
  cdn = '',
  signedUrl = true,
}) => {
  aws.config.update({
    secretAccessKey: secretKey,
    accessKeyId: accessKey,
    endpoint,
    region,
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
        const keyPath = `${req.siteId}/${req.boxId}/${req.resourceId}`;

        const ext = mime.extension(file.mimetype);
        const filename = `${uid()}.${ext}`;
        // Add filname to file
        file.filename = filename;
        cb(null, `${keyPath}/${filename}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
  });

  return {
    uploadManager: upload.single('file'),

    async list(siteId, boxId, resourceId) {
      const params = {
        Bucket: bucket,
        Delimiter: '/',
        Prefix: `${siteId}/${boxId}/${resourceId}/`,
      };

      return new Promise((resolve, reject) => {
        s3.listObjects(params, (err, data) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          const toRemove = new RegExp(`^${siteId}/${boxId}/${resourceId}/`);
          resolve(data.Contents.map(({ Key }) => Key.replace(toRemove, '')));
        });
      });
    },

    async store(siteId, boxId, resourceId, file) {
      return file.filename;
    },

    async exists(siteId, boxId, resourceId, filename) {
      const headParams = {
        Bucket: bucket,
        Key: `${siteId}/${boxId}/${resourceId}/${filename}`,
      };

      try {
        await s3.headObject(headParams).promise();
        return true;
      } catch (headErr) {
        if (headErr.code === 'NotFound') {
          return false;
        }
        throw headErr;
      }
    },

    async get(
      siteId,
      boxId,
      resourceId,
      filename,
      {
        'if-none-match': IfNoneMatch,
        'if-match': IfMatch,
        'if-modified-since': IfModifiedSince,
        'if-unmodified-since': IfUnmodifiedSince,
        range: Range,
      }
    ) {
      // Here we proxy the image
      if (proxy) {
        const params = {
          Bucket: bucket,
          Key: `${siteId}/${boxId}/${resourceId}/${filename}`,
          IfNoneMatch,
          IfUnmodifiedSince,
          IfModifiedSince,
          IfMatch,
          Range,
        };
        return new Promise((resolve) => {
          s3.getObject(params)
            .on('httpHeaders', function (statusCode, headers) {
              const length = headers['content-length'];
              const mimetype = headers['content-type'];
              // const acceptRanges = headers['accept-ranges'];
              const eTag = headers['etag'];
              const lastModified = headers['last-modified'];
              if (statusCode === 304) {
                resolve({
                  mimetype,
                  stream: null,
                  length,
                  eTag,
                  lastModified,
                  statusCode,
                });
              } else {
                const stream = this.response.httpResponse.createUnbufferedStream();
                resolve({
                  mimetype,
                  stream,
                  length,
                  eTag,
                  lastModified,
                  statusCode,
                });
              }
            })
            .send();
        });
      }

      // Here we have a cdn in front
      if (cdn) {
        return {
          redirectTo: `${cdn}/${siteId}/${boxId}/${resourceId}/${filename}`,
        };
      }

      // We generate a signed url and we return it
      if (signedUrl) {
        const params = {
          Bucket: bucket,
          Key: `${siteId}/${boxId}/${resourceId}/${filename}`,
          Expires: 60 * 5,
        };
        const url = await new Promise((resolve, reject) => {
          s3.getSignedUrl('getObject', params, (err, url) => {
            if (err) {
              reject(err);
            } else {
              resolve(url);
            }
          });
        });

        return { redirectTo: url };
      }
      // Finnally we just use public URL
      return {
        redirectTo: `${endpoint}/${siteId}/${boxId}/${resourceId}/${filename}`,
      };
    },

    async delete(siteId, boxId, resourceId, filename) {
      const key = `${siteId}/${boxId}/${resourceId}/${filename}`;

      const headParams = {
        Bucket: bucket,
        Key: key,
      };

      await s3.deleteObject(headParams).promise();
    },
  };
};
