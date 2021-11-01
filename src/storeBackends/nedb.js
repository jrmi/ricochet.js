import parserExpression from 'pivotql-parser-expression';
import compilerMongodb from 'pivotql-compiler-mongodb';

import { throwError } from '../error';
import { uid } from '../uid';

import { DEFAULT_BOX_OPTIONS } from './utils';

// Nedb backend for proof of concept
export const NeDBBackend = (options) => {
  const db = {};
  let _Datastore;

  const getBoxDB = async (boxId) => {
    if (!db[boxId]) {
      if (!_Datastore) {
        try {
          _Datastore = (await import('@seald-io/nedb')).default;
        } catch (e) {
          console.log(
            'You must install "nedb" package in order to be able to use the NeDBStoreBackend!'
          );
          return undefined;
        }
      }
      db[boxId] = new _Datastore({
        filename: `${options.dirname}/${boxId}.json`,
        ...options,
        autoload: true,
      });
    }
    return db[boxId];
  };

  const getBoxOption = async (boxId) => {
    const boxes = await getBoxDB('boxes');
    return new Promise((resolve, reject) => {
      boxes.findOne({ box: boxId }, (err, doc) => {
        if (err) {
          /* istanbul ignore next */
          reject(err);
        }
        resolve(doc || undefined);
      });
    });
  };

  return {
    getBoxOption,
    async createOrUpdateBox(boxId, options = { ...DEFAULT_BOX_OPTIONS }) {
      const prevOptions = (await getBoxOption(boxId)) || {};
      const boxes = await getBoxDB('boxes');
      return new Promise((resolve, reject) => {
        boxes.update(
          { box: boxId },
          { ...prevOptions, ...options, box: boxId },
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
      const boxRecord = await getBoxOption(boxId);

      if (!boxRecord) {
        throwError('Box not found', 404);
      }

      const boxDB = await getBoxDB(boxId);

      let filter = {};
      if (q) {
        try {
          filter = compilerMongodb(parserExpression(q));
        } catch (e) {
          throwError('Invalid query expression.', 400);
        }
      }

      return new Promise((resolve, reject) => {
        boxDB
          .find(
            filter,
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
      const boxRecord = await getBoxOption(boxId);

      if (!boxRecord) {
        throwError('Box not found', 404);
      }

      const boxDB = await getBoxDB(boxId);
      return new Promise((resolve, reject) => {
        boxDB.findOne({ _id: id }, (err, doc) => {
          if (err) {
            /* istanbul ignore next */
            reject(err);
          }
          if (!doc) {
            const newError = new Error('Resource not found');
            newError.statusCode = 404;
            reject(newError);
          }
          resolve(doc);
        });
      });
    },

    async save(boxId, id, data) {
      const boxRecord = await getBoxOption(boxId);

      if (!boxRecord) {
        throwError('Box not found', 404);
      }

      const boxDB = await getBoxDB(boxId);
      const actualId = id || uid();

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
                  const newError = new Error('Resource not found');
                  newError.statusCode = 404;
                  reject(newError);
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
      const boxRecord = await getBoxOption(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      const boxDB = await getBoxDB(boxId);

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
              const newError = new Error('Resource not found');
              newError.statusCode = 404;
              reject(newError);
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
      const boxRecord = await getBoxOption(boxId);
      if (!boxRecord) {
        return 0;
      }
      const boxDB = await getBoxDB(boxId);
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

export default NeDBBackend;
