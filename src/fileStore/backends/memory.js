import multer from 'multer';
import mime from 'mime-types';
import { Duplex } from 'stream';

import { uid } from '../../uid.js';

const bufferToStream = (buffer) => {
  let stream = new Duplex();
  stream.push(buffer);
  stream.push(null);
  return stream;
};

const MemoryFileBackend = () => {
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

export default MemoryFileBackend;
