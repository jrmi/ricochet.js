import multer from 'multer';
import mime from 'mime-types';
import path from 'path';
import fs from 'fs';

import { uid } from '../../uid.js';

const DiskFileBackend = ({ destination }) => {
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

export default DiskFileBackend;
