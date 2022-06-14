import NeDBBackend from './nedb.js';
import MongoDBBackend from './mongodb.js';
import MemoryBackend from './memory.js';

export { default as NeDBBackend } from './nedb.js';
export { default as MongoDBBackend } from './mongodb.js';
export { default as MemoryBackend } from './memory.js';
export { wrapBackend } from './utils.js';

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
