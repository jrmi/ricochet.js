import { nanoid } from 'nanoid';
import Datastore from 'nedb';

const throwError = (message, code = 400) => {
  const errorObject = new Error(message);
  errorObject.statusCode = code;
  throw errorObject;
};

// Memory backend for proof of concept
export const memoryBackend = () => {
  const data = {};
  const security = {};

  const getOrCreateBox = (boxId) => {
    if (typeof data[boxId] !== 'object') {
      data[boxId] = {};
    }
    return data[boxId];
  };

  const filterObjectProperties = (obj, propArr) => {
    const newObj = {};
    for (let key in obj) {
      if (propArr.includes(key)) {
        newObj[key] = obj[key];
      }
    }
    return newObj;
  };

  return {
    async checkSecurity(boxId, id, key) {
      if (!security[boxId]) {
        // Not secured
        if (key) {
          // Set security
          security[boxId] = {};

          if (id) {
            // Id -> it's resource security
            security[boxId][id] = key;
          } else {
            // No id -> it's box security
            security[boxId]._box = key;
          }
        }
        return true;
      }

      if (id) {
        if (security[boxId][id] === undefined) {
          security[boxId][id] = key;
          return true;
        }
        return security[boxId][id] === key;
      } else {
        return (
          security[boxId]._box !== undefined && security[boxId]._box === id
        );
      }
    },
    async list(
      boxId,
      {
        limit = 50,
        sort = '_id',
        asc = true,
        skip = 0,
        onlyFields = [],
        q,
      } = {}
    ) {
      if (data[boxId] === undefined) {
        return [];
      }
      let result = Object.values(data[boxId]);

      result.sort((resource1, resource2) => {
        if (resource1[sort] < resource2[sort]) {
          return asc ? -1 : 1;
        }
        if (resource1[sort] > resource2[sort]) {
          return asc ? 1 : -1;
        }
        return 0;
      });

      result = result.slice(skip, skip + limit);

      if (onlyFields.length) {
        result = result.map((resource) =>
          filterObjectProperties(resource, onlyFields)
        );
      }
      return result;
    },
    async get(boxId, id) {
      if (!data[boxId]) {
        throwError('Box not found', 404);
      }
      if (!data[boxId][id]) {
        throwError('Resource not found', 404);
      }
      return data[boxId][id];
    },
    async create(boxId, data) {
      const newRessource = { ...data, _id: nanoid(), _createdOn: Date.now() };
      getOrCreateBox(boxId)[newRessource._id] = newRessource;
      return newRessource;
    },
    async update(boxId, id, body) {
      // To prevent created modification
      if (!data[boxId]) {
        throwError('Box not found', 404);
      }
      if (!data[boxId][id]) {
        throwError('Ressource not found', 404);
      }
      const { created } = data[boxId][id];
      const updatedItem = {
        ...data[boxId][id],
        ...body,
        _id: id,
        created,
        _updatedOn: Date.now(),
      };
      data[boxId][id] = updatedItem;
      return updatedItem;
    },
    async delete(boxId, id) {
      if (!data[boxId]) {
        return 0;
      }
      if (data[boxId][id] !== undefined) {
        delete data[boxId][id];
        return 1;
      }
      return 0;
    },
  };
};

// Nedb backend for proof of concept
export const NeDBBackend = (options) => {
  const db = {};

  db.boxes = new Datastore({
    filename: `${options.dirname}/boxes.json`,
    ...options,
    autoload: true,
  });

  const createBoxRecord = (boxId) => {
    return new Promise((resolve, reject) => {
      db.boxes.insert({ box: boxId }, (err, doc) => {
        if (err) {
          /* istanbul ignore next */
          reject(err);
        }
        resolve(doc);
      });
    });
  };

  const getBoxRecord = (boxId) => {
    return new Promise((resolve, reject) => {
      db.boxes.findOne({ box: boxId }, (err, doc) => {
        if (err) {
          /* istanbul ignore next */
          reject(err);
        }
        resolve(doc);
      });
    });
  };

  const getBoxDB = (boxId) => {
    if (!db[boxId]) {
      db[boxId] = new Datastore({
        ...options,
        filename: `${options.dirname}/${boxId}.json`,
        autoload: true,
      });
    }
    return db[boxId];
  };

  return {
    async checkSecurity(boxId, id, key) {
      return true;
    },
    async list(
      boxId,
      {
        limit = 50,
        sort = '_id',
        asc = true,
        skip = 0,
        onlyFields = [],
        q,
      } = {}
    ) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        return [];
      }
      const boxDB = getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB
          .find(
            {},
            onlyFields.length
              ? onlyFields.reduce((acc, field) => {
                  acc[field] = 1;
                  return acc;
                }, {})
              : {}
          )
          .limit(limit)
          .skip(skip)
          .sort({ [sort]: asc ? 1 : -1 })
          .exec((err, docs) => {
            if (err) {
              /* istanbul ignore next */
              reject(err);
            }
            resolve(docs);
          });
      });
    },
    async get(boxId, id) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      const boxDB = getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB.findOne({ _id: id }, (err, doc) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          if (!doc) {
            reject(new Error('Resource not found'));
          }
          resolve(doc);
        });
      });
    },
    async create(boxId, data) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        createBoxRecord(boxId);
      }
      const boxDB = getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB.insert({ ...data, _createdOn: Date.now() }, (err, doc) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          resolve(doc);
        });
      });
    },
    async update(boxId, id, body) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      const boxDB = getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB.update(
          { _id: id },
          body,
          { returnUpdatedDocs: true },
          (err, numAffected, affectedDoc) => {
            if (!numAffected) {
              reject(new Error('Resource not found'));
            }
            if (err) {
              /* istanbul ignore next */
              reject(err);
            }
            resolve(affectedDoc);
          }
        );
      });
    },
    async delete(boxId, id) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        return 0;
      }
      const boxDB = getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB.remove({ _id: id }, {}, (err, numRemoved) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          resolve(numRemoved);
        });
      });
    },
  };
};

// Backend interface
/*export const Backend = () => {
  return {
    async checkSecurity(boxId, id, key) {},
    async list(boxId, { limit, sort, skip, onlyFields, q }) {},
    async get(boxId, id) {},
    async create(boxId, data) {},
    async update(boxId, id, body) {},
    async delete(boxId, id) {},
  };
};*/
