import { parse as parserExpression } from 'pivotql-parser-expression';
import { compile as compilerJavascript } from 'pivotql-compiler-javascript';

import { throwError } from '../../error.js';
import { uid } from '../../uid.js';

import { DEFAULT_BOX_OPTIONS } from './utils.js';

// Memory backend for proof of concept
export const MemoryBackend = () => {
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
    async getBoxOption(boxId) {
      return boxOptions[boxId];
    },

    async createOrUpdateBox(boxId, options = { ...DEFAULT_BOX_OPTIONS }) {
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

      let filter = () => true;
      if (q) {
        try {
          filter = compilerJavascript(parserExpression(q));
        } catch (e) {
          throwError('Invalid query expression.', 400);
        }
      }

      let result = Object.values(dataMemoryStore[boxId]);

      result = result.filter(filter);

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

      const actualId = id || uid();
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

export default MemoryBackend;
