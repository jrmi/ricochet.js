import fs from 'fs';
import express from 'express';

import log from './log.js';

import { generateKey } from './crypt.js';
import { errorGuard, errorMiddleware, throwError } from './error.js';
import { longUid } from './uid.js';

const validateEmail = (email) => {
  let res = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return res.test(email);
};

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

const siteMiddleware = ({
  storeBackend,
  configFile,
  onSiteCreation,
  onSiteUpdate,
  siteRegistrationEnabled = true,
}) => {
  const router = express.Router();

  const siteConfig = {};
  let configLoaded = false;

  const getConfirmPath = (siteId, token) =>
    `/_register/${siteId}/confirm/${token}`;

  const loadSites = async () => {
    try {
      const sites = await storeBackend.list('_site');
      sites.forEach((site) => {
        siteConfig[site._id] = site;
      });
      configLoaded = true;
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
          fs.renameSync(configFile, `${configFile}.bak`);
          console.log('Migrate deprecated config file data to store.');
        } catch (e) {
          if (!e.includes('missing')) {
            console.log('Deprecated config file appears to be invalid.');
          }
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

  // Enable site registration
  if (siteRegistrationEnabled) {
    router.get(
      '/_register/:siteId/confirm/:token',
      errorGuard(async (req, res) => {
        const { siteId, token } = req.params;

        let pending;
        let previous;

        try {
          // Check if pending exists
          pending = await storeBackend.get('_pending', siteId);
        } catch (e) {
          if (e.statusCode === 404) {
            try {
              // Pending missing, check if site already exists
              await storeBackend.get('_site', siteId);
              // Yes, so token is already consumed
              throwError('Token already used.', 403);
            } catch (e) {
              if (e.statusCode === 404) {
                // If site not found so URL is wrong
                throwError('Bad site.', 404);
              } else {
                throw e;
              }
            }
          } else {
            throw e;
          }
        }

        try {
          // Get previous site if exists
          previous = await storeBackend.get('_site', siteId);
        } catch (e) {
          if (e.statusCode !== 404) {
            throw e;
          }
        }

        if (pending.token === token) {
          const toSave = { ...(previous || {}), ...pending };
          delete toSave.token;
          const saved = await storeBackend.save('_site', siteId, toSave);
          await storeBackend.delete('_pending', siteId);
          siteConfig[siteId] = { ...saved };
        } else {
          // Token can be invalid if another modification is sent in the meantime
          // or if the token is already consumed.
          throwError('Token invalid or already used.', 403);
        }

        if (previous) {
          // If previous, then we have just updated the site
          res.json({ message: 'Site updated' });
        } else {
          // otherwise we have created a new site
          res.json({ message: 'Site created' });
        }
      })
    );

    router.post(
      '/_register/',
      errorGuard(async (req, res) => {
        const { siteId, name, emailFrom, owner } = req.body;

        if (!siteId || !name || !emailFrom || !owner) {
          throwError(
            'The following data are required for site creation: siteId, name, emailFrom, owner.',
            400
          );
        }

        if (siteId.length < 3 || !siteId.match(/^[a-zA-Z0-9][a-zA-Z0-9_]*$/)) {
          throwError(
            "The siteId must contains at least 3 letters or '_' and can't start with '_'.",
            400
          );
        }

        if (siteConfig[siteId]) {
          // The site already exists
          throwError('A site with the same name already exists.', 403);
        }

        if (!validateEmail(emailFrom)) {
          throwError('emailFrom must be a valid email.', 400);
        }

        if (!validateEmail(owner)) {
          throwError('emailFrom must be a valid email.', 400);
        }

        const key = generateKey();
        const token = longUid();

        const newSite = await storeBackend.save('_pending', siteId, {
          name,
          owner,
          emailFrom,
          key,
          token,
        });

        await onSiteCreation({
          req,
          site: newSite,
          confirmPath: getConfirmPath(siteId, token),
        });

        const response = { ...newSite };
        delete response.token;

        res.json(response);
      })
    );

    router.patch(
      '/_register/:siteId',
      errorGuard(async (req, res) => {
        const { siteId } = req.params;
        const { name, emailFrom } = req.body;

        if (!siteId || !siteConfig[siteId]) {
          // The site doesn't exist
          throwError(
            `Site '${siteId}' doesn't exist. You must create it before.`,
            404
          );
        }

        if (!name || !emailFrom) {
          throwError(
            'The following data are required for site update: name, emailFrom.',
            400
          );
        }

        if (!validateEmail(emailFrom)) {
          throwError('emailFrom must be a valid email.', 400);
        }

        const previous = await storeBackend.get('_site', siteId);

        const token = longUid();

        const updated = await storeBackend.save('_pending', siteId, {
          name,
          emailFrom,
          token,
        });

        await onSiteUpdate({
          req,
          site: { ...updated },
          previous: { ...previous },
          confirmPath: getConfirmPath(siteId, token),
        });

        const response = { ...updated };
        delete response.key;
        delete response.token;
        res.json({ ...response });
      })
    );
  }

  router.get(
    '/site/settings',
    errorGuard(async (req, res) => {
      res.json({ registrationEnabled: siteRegistrationEnabled });
    })
  );

  router.use(errorMiddleware);

  return router;
};

export default siteMiddleware;
