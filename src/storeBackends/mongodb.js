import parserExpression from 'pivotql-parser-expression';
import compilerMongodb from 'pivotql-compiler-mongodb';

import { throwError } from '../error';
import { uid } from '../uid';

import { DEFAULT_BOX_OPTIONS } from './utils';

// Mongodb backend
export const MongoDBBackend = (options) => {
  let database;
  let _client;

  const getClient = async () => {
    if (!_client) {
      try {
        const { MongoClient } = await import('mongodb');
        _client = new MongoClient(options.uri, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        });
      } catch (e) {
        throw new Error(
          'You must install "mongodb" package in order to be able to use the MongoDBStoreBackend!'
        );
      }
    }
    return _client;
  };

  const close = async () => {
    const client = await getClient();
    if (client.isConnected()) {
      database = undefined;
      await client.close();
    }
  };

  const getBoxDb = async (boxId) => {
    const client = await getClient();
    if (!client.isConnected()) {
      await client.connect();
      database = await client.db(options.database);
    }

    return await database.collection(boxId);
  };

  const getBoxOption = async (boxId) => {
    const boxes = await getBoxDb('boxes');
    return await boxes.findOne({ box: boxId });
  };

  return {
    getBoxOption,
    _close: close,

    async createOrUpdateBox(boxId, options = { ...DEFAULT_BOX_OPTIONS }) {
      const prevOptions = (await getBoxOption(boxId)) || {};

      // TODO boxes should be prefixed ?
      const boxes = await getBoxDb('boxes');
      return await boxes.findOneAndUpdate(
        { box: boxId },
        { $set: { ...prevOptions, ...options, box: boxId } },
        { upsert: true, returnOriginal: false }
      ).value;
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

      const boxDB = await getBoxDb(boxId);

      const listOptions = {};

      let filter = {};
      if (q) {
        try {
          filter = compilerMongodb(parserExpression(q));
        } catch (e) {
          throwError('Invalid query expression.', 400);
        }
      }

      if (onlyFields.length) {
        listOptions.projection = onlyFields.reduce((acc, field) => {
          acc[field] = 1;
          return acc;
        }, {});
      }

      return await boxDB
        .find(filter, listOptions)
        .limit(limit)
        .skip(skip)
        .sort({ [sort]: asc ? 1 : -1 })
        .toArray();
    },
    async get(boxId, id) {
      const boxRecord = await getBoxOption(boxId);

      if (!boxRecord) {
        throwError('Box not found', 404);
      }

      const boxDB = await getBoxDb(boxId);

      const result = await boxDB.findOne({ _id: id });

      if (!result) {
        const newError = new Error('Resource not found');
        newError.statusCode = 404;
        throw newError;
      }

      return result;
    },

    async save(boxId, id, data) {
      const boxRecord = await getBoxOption(boxId);

      if (!boxRecord) {
        throwError('Box not found', 404);
      }

      const boxDB = await getBoxDb(boxId);
      const actualId = id || uid();

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      const found = await boxDB.findOne({ _id: actualId });

      if (!found) {
        return (
          await boxDB.insertOne({
            ...cleanedData,
            _createdOn: Date.now(),
            _id: actualId,
          })
        ).ops[0];
      } else {
        return (
          await boxDB.findOneAndReplace(
            { _id: actualId },
            {
              ...cleanedData,
              _updatedOn: Date.now(),
              _createdOn: found._createdOn,
              _id: actualId,
            },
            { returnOriginal: false }
          )
        ).value;
      }
    },

    async update(boxId, id, data) {
      const boxRecord = await getBoxOption(boxId);
      if (!boxRecord) {
        throwError('Box not found', 404);
      }
      const boxDB = await getBoxDb(boxId);

      const cleanedData = data;
      delete cleanedData._createdOn;
      delete cleanedData._modifiedOn;

      const found = await boxDB.findOne({ _id: id });

      if (!found) {
        const newError = new Error('Resource not found');
        newError.statusCode = 404;
        throw newError;
      }

      return (
        await boxDB.findOneAndUpdate(
          { _id: id },
          {
            $set: {
              ...cleanedData,
              _updatedOn: Date.now(),
              _id: id,
            },
          },
          { returnOriginal: false }
        )
      ).value;
    },

    async delete(boxId, id) {
      const boxRecord = await getBoxOption(boxId);
      if (!boxRecord) {
        return 0;
      }
      const boxDB = await getBoxDb(boxId);
      const { deletedCount } = await boxDB.deleteOne({ _id: id });
      return deletedCount;
    },
  };
};

export default MongoDBBackend;
