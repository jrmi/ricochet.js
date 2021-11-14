import log from '../log.js';

export const DEFAULT_BOX_OPTIONS = { security: 'private', personal: false };

export const wrapBackend = (backend, siteId, userId) => {
  const getBoxId = (userBoxId) => {
    return `_${siteId}__${userBoxId}`;
  };

  const migrationToApply = {
    async storeBySiteId(newBoxId) {
      const oldBoxId = newBoxId.split('__')[1];
      const exists = await backend.getBoxOption(oldBoxId);

      // Migrate only previously existing collection
      if (!exists) return;

      const data = await backend.list(oldBoxId);

      for (const item of data) {
        await backend.save(newBoxId, item.id, item);
      }
    },
  };

  const migrate = async (boxId) => {
    const options = (await backend.getBoxOption(boxId)) || {};
    const { migrations = [] } = options;
    const migrationApplied = [];

    for (const key of Object.keys(migrationToApply)) {
      if (!migrations.includes(key)) {
        log.debug(`Apply ${key} migration on box ${boxId}`);
        await migrationToApply[key](boxId);
        migrationApplied.push(key);
      }
    }

    await backend.createOrUpdateBox(boxId, {
      ...options,
      migrations: Array.from(new Set([...migrations, ...migrationApplied])),
    });
  };

  return {
    async checkSecurity(boxId, id, write = false) {
      const { security = 'private' } =
        (await backend.getBoxOption(getBoxId(boxId))) || {};
      switch (security) {
        case 'private':
          return false;
        case 'public':
          return true;
        case 'readOnly':
          return !write;
        default:
          return false;
      }
    },
    async createOrUpdateBox(boxId, options) {
      const result = await backend.createOrUpdateBox(getBoxId(boxId), options);
      // Apply migration if any
      await migrate(getBoxId(boxId));
      return result;
    },
    async list(boxId, options) {
      // find
      return await backend.list(getBoxId(boxId), options);
    },
    // has
    /*async has(boxId, id) {
      return await backend.has(getBoxId(boxId), id);
    },*/
    async get(boxId, id) {
      return await backend.get(getBoxId(boxId), id);
    },
    async set(boxId, id, data) {
      return await backend.save(getBoxId(boxId), id, data);
    },
    async save(boxId, id, data) {
      return await backend.save(getBoxId(boxId), id, data);
    },
    async update(boxId, id, data) {
      return await backend.update(getBoxId(boxId), id, data);
    },
    async delete(boxId, id) {
      return await backend.delete(getBoxId(boxId), id);
    },
  };
};
