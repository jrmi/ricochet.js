import NeDBBackend from './nedb';
import MongoDBBackend from './mongodb';
import MemoryBackend from './memory';

export { default as NeDBBackend } from './nedb';
export { default as MongoDBBackend } from './mongodb';
export { default as MemoryBackend } from './memory';
export { wrapBackend } from './utils';

export const getStoreBackend = (type, options = {}) => {
  switch (type) {
    case 'nedb':
      return NeDBBackend(options);
    case 'mongodb':
      return MongoDBBackend(options);
    default:
      return MemoryBackend();
  }
};

// Backend interface
/*export const Backend = () => {
  return {
    async checkSecurity(boxId, id, key) {},
    async createOrUpdateBox(boxId, options = { ...DEFAULT_BOX_OPTIONS }) {},
    async list(boxId, { limit, sort, skip, onlyFields, q }) {},
    async get(boxId, id) {},
    async create(boxId, data) {},
    async update(boxId, id, body) {},
    async delete(boxId, id) {},
  };
};*/
