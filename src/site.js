import fs from 'fs';
import express from 'express';

import log from './log.js';

import { generateKey } from './crypt.js';
import { errorGuard, errorMiddleware, throwError } from './error.js';

const writeConfigFile = (configFilePath, data) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(configFilePath, JSON.stringify(data, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const loadConfigFile = (configFilePath, createIfMissing = false) => {
  return new Promise((resolve, reject) => {
    // Read config file
    fs.readFile(configFilePath, 'utf-8', (err, jsonString) => {
      if (err) {
        const { code } = err;
        if (code === 'ENOENT') {
          const data = {};
          if (createIfMissing) {
            log.info('No config file, create default');
            writeConfigFile(configFilePath, data).then(() => {
              resolve(data);
            });
          } else {
            reject(`File ${configFilePath} is missing`);
          }
        } else {
          reject(`Failed to load ${configFilePath} configuration file`);
        }
      } else {
        try {
          const data = JSON.parse(jsonString);
          resolve(data);
        } catch (e) {
          console.log('Fails to parse config file...\n', e);
          reject('Fails to parse config file...');
        }
      }
    });
  });
};

const siteMiddleware = ({ storeBackend, configFile, getTransporter }) => {
  const router = express.Router();

  const siteConfig = {};
  let configLoaded = false;

  const loadSites = async () => {
    try {
      const sites = await storeBackend.list('_site');
      sites.forEach((site) => {
        siteConfig[site._id] = site;
      });
      configLoaded = true;
      console.log('Site config loaded!');
    } catch (e) {
      if (e.statusCode === 404 && e.message === 'Box not found') {
        await storeBackend.createOrUpdateBox('_site');
        await storeBackend.createOrUpdateBox('_pending');
        try {
          // Try to load deprecated config file if any
          const siteConfigFile = await loadConfigFile(configFile);
          Object.entries(siteConfigFile).forEach(async ([id, data]) => {
            await storeBackend.save('_site', id, data);
          });
          console.log('Migrate deprecated config file to store.');
        } catch (e) {
          console.log('No valid deprecated config file to load.');
        }
        await loadSites();
      } else {
        console.log('Error while loading configuration', e);
        process.exit(-1);
      }
    }
  };

  loadSites();

  router.use((req, res, next) => {
    if (!configLoaded) {
      throwError('Server not ready, try again later.', 503);
    }
    req.siteConfig = siteConfig;
    next();
  });

  router.post(
    '/_register/:siteId',
    errorGuard(async (req, res) => {
      const { siteId } = req.params;
      if (siteConfig[siteId]) {
        // The site already exists
        throwError('A site with the same name already exists.', 403);
      } else {
        const { name, emailFrom, owner } = req.body;
        const key = generateKey();

        const newSite = await storeBackend.save('_site', siteId, {
          name,
          owner,
          emailFrom,
          key,
        });
        siteConfig[siteId] = newSite;

        res.json({ ...siteConfig[siteId] });
      }
    })
  );

  router.patch(
    '/_register/:siteId',
    errorGuard(async (req, res) => {
      const { siteId } = req.params;
      if (!siteConfig[siteId]) {
        // The site doesn't exist
        throwError("Site doesn't exist. Use POST query to create it.", 403);
      } else {
        const { name, emailFrom } = req.body;
        const previous = await storeBackend.get('_site', siteId);
        const updated = await storeBackend.update('_site', siteId, {
          ...previous,
          name,
          emailFrom,
        });
        siteConfig[siteId] = updated;
        const response = { ...updated };
        delete response.key;
        res.json({ ...response });
      }
    })
  );

  router.use(errorMiddleware);

  return router;
};

export default siteMiddleware;
