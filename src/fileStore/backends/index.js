import MemoryFileBackend from './memory.js';
import DiskFileBackend from './disk.js';
import S3FileBackend from './s3.js';

export { default as MemoryFileBackend } from './memory.js';
export { default as DiskFileBackend } from './disk.js';
export { default as S3FileBackend } from './s3.js';

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

export const wrapBackend = (backend, siteId) => {
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
    async clearAll(boxId, id) {
      return await Promise.all(
        (await this.list(boxId, id)).map((filename) => {
          return this.delete(boxId, id, filename);
        })
      );
    },
  };
};
