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

export const MemoryFileBackend = () => {
  const fileMap = {};
  const upload = multer({ storage: multer.memoryStorage() });

  return {
    uploadManager: upload.single('file'),

    async list(namespace) {
      const store = fileMap[namespace] || {};
      return Object.keys(store);
    },

    async store(namespace, file) {
      const ext = mime.extension(file.mimetype);
      const filename = `${uid()}.${ext}`;

      file.filename = filename;

      const store = fileMap[namespace] || {};

      store[filename] = {
        buffer: file.buffer,
        mimetype: file.mimetype,
      };

      fileMap[namespace] = store;

      return filename;
    },

    async exists(namespace, filename) {
      return (
        fileMap[namespace] !== undefined &&
        fileMap[namespace][filename] !== undefined
      );
    },

    async get(namespace, filename) {
      const fileBuffer = fileMap[namespace][filename];
      return {
        mimetype: fileBuffer.mimetype,
        stream: bufferToStream(fileBuffer.buffer),
      };
    },

    async delete(namespace, filename) {
      delete fileMap[namespace][filename];
    },
  };
};

export const DiskFileBackend = ({ destination, pathFromReq }) => {
  const storage = multer.diskStorage({
    destination: (req, tt, cb) => {
      const objPath = pathFromReq(req);

      const destinationDir = path.join(destination, objPath);
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
      }
      cb(null, path.join(destination, objPath));
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

    async list(namespace) {
      const dir = path.join(destination, namespace);
      return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          } else {
            resolve(files);
          }
        });
      });
    },

    async store() {
      // Nothing to do here. Already done by upload manager
      return;
    },

    async exists(namespace, filename) {
      const filePath = path.join(destination, namespace, filename);
      return fs.existsSync(filePath);
    },

    async get(namespace, filename) {
      const filePath = path.join(destination, namespace, filename);
      const stream = fs.createReadStream(filePath);

      const mimetype = mime.lookup(filename);
      return { mimetype, stream };
    },

    async delete(namespace, filename) {
      const filePath = path.join(destination, namespace, filename);
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
  pathFromReq,
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
        const namespace = pathFromReq(req);

        const ext = mime.extension(file.mimetype);
        const filename = `${uid()}.${ext}`;
        // Add filname to file
        file.filename = filename;
        cb(null, `${namespace}/${filename}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
  });

  return {
    uploadManager: upload.single('file'),

    async list(namespace) {
      const params = {
        Bucket: bucket,
        Delimiter: '/',
        Prefix: `${namespace}/`,
      };

      return new Promise((resolve, reject) => {
        s3.listObjects(params, (err, data) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          const toRemove = new RegExp(`^${namespace}/`);
          resolve(data.Contents.map(({ Key }) => Key.replace(toRemove, '')));
        });
      });
    },

    async store() {
      return;
    },

    async exists(namespace, filename) {
      const headParams = {
        Bucket: bucket,
        Key: `${namespace}/${filename}`,
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
      namespace,
      filename,
      {
        'if-none-match': IfNoneMatch,
        'if-match': IfMatch,
        'if-modified-since': IfModifiedSince,
        'if-unmodified-since': IfUnmodifiedSince,
        range: Range,
      }
    ) {
      // We generate a signed url and we return it
      if (!proxy) {
        const params = {
          Bucket: bucket,
          Key: `${namespace}/${filename}`,
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

      const params = {
        Bucket: bucket,
        Key: `${namespace}/${filename}`,
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
    },

    async delete(namespace, filename) {
      const key = path.join(namespace, filename);

      const headParams = {
        Bucket: bucket,
        Key: key,
      };

      await s3.deleteObject(headParams).promise();
    },
  };
};
