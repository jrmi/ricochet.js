import { nanoid } from 'nanoid';
import Datastore from 'nedb';

const throwError = (message, code = 400) => {
  const errorObject = new Error(message);
  errorObject.statusCode = code;
  throw errorObject;
};

// Memory backend for proof of concept
export const memoryBackend = () => {
  const dataMemoryStore = {};
  const boxOptions = {};

  const getOrCreateBox = (boxId) => {
    if (typeof dataMemoryStore[boxId] !== 'object') {
      dataMemoryStore[boxId] = {};
    }
    return dataMemoryStore[boxId];
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
      if (!boxOptions[boxId]) {
        // Not secured
        if (key) {
          // Set security
          boxOptions[boxId] = {};

          if (id) {
            // Id -> it's resource security
            boxOptions[boxId][id] = key;
          } else {
            // No id -> it's box security
            boxOptions[boxId]._box = key;
          }
        }
        return true;
      }

      if (id) {
        if (boxOptions[boxId][id] === undefined) {
          boxOptions[boxId][id] = key;
          return true;
        }
        return boxOptions[boxId][id] === key;
      } else {
        return (
          boxOptions[boxId]._box !== undefined && boxOptions[boxId]._box === id
        );
      }
    },

    async createOrUpdateBox(boxId, options = {}) {
      getOrCreateBox(boxId);
      boxOptions[boxId] = options;
      return { box: boxId, ...options };
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
      if (dataMemoryStore[boxId] === undefined) {
        throwError('Box not found', 404);
      }

      let result = Object.values(dataMemoryStore[boxId]);

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
      if (!dataMemoryStore[boxId]) {
        throwError('Box not found', 404);
      }
      if (!dataMemoryStore[boxId][id]) {
        throwError('Resource not found', 404);
      }
      return dataMemoryStore[boxId][id];
    },

    async save(boxId, id, data) {
      if (dataMemoryStore[boxId] === undefined) {
        throwError('Box not found', 404);
      }

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      const actualId = id || nanoid();
      const box = dataMemoryStore[boxId];

      let newRessource = null;
      if (box[actualId]) {
        // Update
        newRessource = {
          ...cleanedData,
          _id: actualId,
          _createdOn: box[actualId]._createdOn,
          _updatedOn: Date.now(),
        };
        box[actualId] = newRessource;
      } else {
        newRessource = {
          ...cleanedData,
          _id: actualId,
          _createdOn: Date.now(),
        };
        box[actualId] = newRessource;
      }
      return newRessource;
    },

    async update(boxId, id, data) {
      if (!dataMemoryStore[boxId]) {
        throwError('Box not found', 404);
      }
      if (!dataMemoryStore[boxId][id]) {
        throwError('Ressource not found', 404);
      }

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      // To prevent created modification
      const currentData = dataMemoryStore[boxId][id];
      const updatedItem = {
        ...currentData,
        ...cleanedData,
        _id: id,
        _updatedOn: Date.now(),
      };
      dataMemoryStore[boxId][id] = updatedItem;
      return updatedItem;
    },

    async delete(boxId, id) {
      if (!dataMemoryStore[boxId]) {
        return 0;
      }
      if (dataMemoryStore[boxId][id] !== undefined) {
        delete dataMemoryStore[boxId][id];
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

  // const createOrUpdateBoxRecord = (boxId, options = {}) => {};

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
      /*if (!boxRecord) {
        return [];
      }*/
      if (!boxRecord) {
        throwError('Box not found', 404);
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

    async createOrUpdateBox(boxId, options) {
      return new Promise((resolve, reject) => {
        db.boxes.update(
          { box: boxId },
          { ...options, box: boxId },
          { upsert: true },
          (err, doc) => {
            if (err) {
              /* istanbul ignore next */
              reject(err);
            }
            resolve(doc);
          }
        );
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

    async save(boxId, id, data) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      /*if (!boxRecord) {
        createOrUpdateBoxRecord(boxId);
      }*/
      const boxDB = getBoxDB(boxId);
      const actualId = id || nanoid();

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      return new Promise((resolve, reject) => {
        // Creation with id or update with id
        boxDB.findOne({ _id: actualId }, (err, doc) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          if (!doc) {
            // Creation
            boxDB.insert(
              { ...cleanedData, _createdOn: Date.now(), _id: actualId },
              (err, doc) => {
                if (err) {
                  /* istanbul ignore next */
                  reject(err);
                }
                resolve(doc);
              }
            );
          } else {
            // Update
            boxDB.update(
              { _id: actualId },
              {
                ...cleanedData,
                _updatedOn: Date.now(),
                _createdOn: doc._createdOn,
                _id: actualId,
              },
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
          }
        });
      });
    },
    async update(boxId, id, data) {
      const boxRecord = await getBoxRecord(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      const boxDB = getBoxDB(boxId);

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      return new Promise((resolve, reject) => {
        boxDB.update(
          { _id: id },
          {
            $set: {
              ...cleanedData,
              _updatedOn: Date.now(),
              _id: id,
            },
          },
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
