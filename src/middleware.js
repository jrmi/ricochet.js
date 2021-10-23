import fs from 'fs';
import express from 'express';
import cookieSession from 'cookie-session';
import nodemailer from 'nodemailer';
import schedule from 'node-schedule';

import log from './log.js';
import oldFileStore from './oldFileStore.js';
import store from './store.js';

import { getStoreBackend, wrapBackend } from './storeBackends.js';
import {
  getFileStoreBackend,
  wrapBackend as wrapFileBackend,
} from './fileStoreBackend.js';

import remote from './remote.js';
import execute from './execute.js';
import auth from './authentication.js';

import { decrypt, generateKey } from './crypt.js';

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

export const ricochetMiddleware = ({
  secret,
  storeBackend,
  fileStoreBackend,
  storePrefix,
  disableCache = false,
  setupFunction = 'setup',
  emailConfig = { host: 'fake' },
  siteConfig,
} = {}) => {
  const router = express.Router();

  // Remote Function map
  const functionsBySite = {};
  // Schedule map
  const schedulesBySite = {};
  // Hooks map
  const hooksBySite = {};

  const decryptPayload = (script, siteId) => {
    const data = JSON.parse(script);

    if (!siteConfig[siteId]) {
      throw `Site ${siteId} not registered on ricochet.js`;
    }

    const { key } = siteConfig[siteId];
    const decrypted = decrypt(data, key);
    return decrypted;
  };

  // Remote code
  router.use(
    remote({
      context: (req) => {
        const { siteId, authenticatedUser } = req;
        const wrappedBackend = wrapBackend(
          storeBackend,
          siteId,
          authenticatedUser
        );
        const wrappedFileBackend = wrapFileBackend(
          fileStoreBackend,
          siteId,
          authenticatedUser
        );
        if (!functionsBySite[siteId]) {
          functionsBySite[siteId] = {};
        }
        if (!schedulesBySite[siteId]) {
          schedulesBySite[siteId] = { hourly: [], daily: [] };
        }
        if (!hooksBySite[siteId]) {
          hooksBySite[siteId] = {};
        }
        return {
          store: wrappedBackend,
          fileStore: wrappedFileBackend,
          functions: functionsBySite[siteId],
          schedules: schedulesBySite[siteId],
          hooks: hooksBySite[siteId],
        };
      },
      disableCache,
      setupFunction,
      preProcess: decryptPayload,
    })
  );

  let _transporter = null;

  const getTransporter = () => {
    if (_transporter === null) {
      _transporter = nodemailer.createTransport({
        ...emailConfig,
      });
    }
    return _transporter;
  };

  const onSendToken = async ({ remote, userEmail, userId, token, req }) => {
    const { siteId, t } = req;

    if (!siteConfig[siteId]) {
      throw { error: 'Site not registered', status: 'error' };
    }

    const { name: siteName, emailFrom } = siteConfig[siteId];

    log.debug(`Link to connect: ${remote}/login/${userId}/${token}`);
    // if fake host, link is only loggued
    if (emailConfig.host === 'fake') {
      log.info(
        t('Auth mail text message', {
          url: `${remote}/login/${userId}/${token}`,
          siteName: siteName,
          interpolation: { escapeValue: false },
        })
      );
      return;
    }

    await getTransporter().sendMail({
      from: emailFrom,
      to: userEmail,
      subject: t('Your authentication link', {
        siteName,
        interpolation: { escapeValue: false },
      }),
      text: t('Auth mail text message', {
        url: `${remote}/login/${userId}/${token}`,
        siteName,
      }),
      html: t('Auth mail html message', {
        url: `${remote}/login/${userId}/${token}`,
        siteName,
      }),
    });

    log.info('Auth mail sent');
  };

  const onLogin = (userId, req) => {
    req.session.userId = userId;
  };

  const onLogout = (req) => {
    req.session = null;
  };

  // Session middleware
  router.use(
    cookieSession({
      name: 'session',
      keys: [secret],
      httpOnly: true,

      // Cookie Options
      maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
    })
  );

  // Re-set cookie on activity
  router.use((req, res, next) => {
    req.session.nowInMinutes = Math.floor(Date.now() / (60 * 1000));
    next();
  });

  // authenticate middleware
  router.use((req, res, next) => {
    if (req.session.userId) {
      req.authenticatedUser = req.session.userId;
    } else {
      req.authenticatedUser = null;
    }
    next();
  });

  // Auth middleware
  router.use(auth({ onSendToken, onLogin, onLogout, secret: secret }));

  // JSON store
  router.use(
    store({
      prefix: storePrefix,
      backend: storeBackend,
      fileBackend: fileStoreBackend,
      hooks: (req) => {
        const { siteId } = req;
        return hooksBySite[siteId];
      },
    })
  );

  // Execute middleware
  router.use(
    execute({
      context: (req) => {
        const { siteId, authenticatedUser } = req;
        const wrappedBackend = wrapBackend(
          storeBackend,
          siteId,
          authenticatedUser
        );
        const wrappedFileBackend = wrapFileBackend(
          fileStoreBackend,
          siteId,
          authenticatedUser
        );
        return { store: wrappedBackend, fileStore: wrappedFileBackend };
      },
      functions: (req) => {
        const { siteId } = req;
        return functionsBySite[siteId];
      },
    })
  );

  // Schedule daily and hourly actions
  schedule.scheduleJob('22 * * * *', () => {
    log.info('Execute hourly actions');
    for (const key in schedulesBySite) {
      const { hourly } = schedulesBySite[key];
      hourly.forEach((callback) => {
        callback();
      });
    }
  });

  schedule.scheduleJob('42 3 * * *', () => {
    log.info('Execute daily actions');
    for (const key in schedulesBySite) {
      const { daily } = schedulesBySite[key];
      daily.forEach((callback) => {
        callback();
      });
    }
  });

  return router;
};

export const mainMiddleware = ({
  fileStoreConfig = {},
  storeConfig = {},
  configFile = './site.json',
  ...rest
} = {}) => {
  const router = express.Router();

  // Store backends
  const storeBackend = getStoreBackend(storeConfig.type, storeConfig);
  const fileStoreBackend = getFileStoreBackend(fileStoreConfig.type, {
    url: fileStoreConfig.apiUrl,
    destination: fileStoreConfig.diskDestination,
    bucket: fileStoreConfig.s3Bucket,
    endpoint: fileStoreConfig.s3Endpoint,
    accessKey: fileStoreConfig.s3AccesKey,
    secretKey: fileStoreConfig.s3SecretKey,
    region: fileStoreConfig.s3Region,
    proxy: fileStoreConfig.s3Proxy,
    cdn: fileStoreConfig.s3Cdn,
    signedUrl: fileStoreConfig.s3SignedUrl,
  });

  const siteConfig = {};
  let configLoaded = false;

  const loadSites = async () => {
    try {
      const sites = await storeBackend.list('_site');
      sites.forEach((site) => {
        siteConfig[site._id] = site;
      });
      // Object.assign(siteConfig, sites);
      console.log(siteConfig);
      configLoaded = true;
      console.log('Site config loaded!');
    } catch (e) {
      if (e.statusCode === 404 && e.message === 'Box not found') {
        await storeBackend.createOrUpdateBox('_site');
        try {
          // Try to load deprecated config file if any
          const siteConfigFile = await loadConfigFile(configFile);
          console.log('Load deprecated config file');
          Object.entries(siteConfigFile).forEach(async ([id, data]) => {
            await storeBackend.save('_site', id, data);
          });
          await loadSites();
        } catch (e) {
          console.log('No deprecated config file. Ignored.', e);
        }
      } else {
        console.log('Error while loading configuration', e);
        process.exit(-1);
      }
    }
  };

  loadSites();

  // File store
  // TO BE REMOVED
  router.use(
    oldFileStore(fileStoreConfig.type, {
      url: fileStoreConfig.apiUrl,
      destination: fileStoreConfig.diskDestination,
      bucket: fileStoreConfig.s3Bucket,
      endpoint: fileStoreConfig.s3Endpoint,
      accessKey: fileStoreConfig.s3AccesKey,
      secretKey: fileStoreConfig.s3SecretKey,
      region: fileStoreConfig.s3Region,
      proxy: fileStoreConfig.s3Proxy,
      cdn: fileStoreConfig.s3Cdn,
      signedUrl: fileStoreConfig.s3SignedUrl,
    })
  );

  router.post('/_register/:siteId', async (req, res) => {
    const { siteId } = req.params;
    if (configLoaded) {
      console.log('un', siteConfig);
      if (siteConfig[siteId]) {
        // The site already exists
        res.status(403).json({
          status: 'error',
          reason: 'A site with the same name already exists.',
        });
      } else {
        const { name, emailFrom } = req.body;
        const key = generateKey();

        const newSite = await storeBackend.save('_site', siteId, {
          name,
          emailFrom,
          key,
        });
        siteConfig[siteId] = newSite;

        res.json({ ...siteConfig[siteId], status: 'success' });
      }
    } else {
      res.status(503).json({
        status: 'error',
        message: 'Server not ready, try again later.',
      });
    }
  });

  router.patch('/_register/:siteId', async (req, res) => {
    const { siteId } = req.params;
    if (configLoaded) {
      if (!siteConfig[siteId]) {
        // The site doesn't exist
        res.status(404).json({
          status: 'error',
          reason: "Site doesn't exist. Use POST to create it.",
        });
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
        console.log(siteConfig);
        res.json({ ...response, status: 'success' });
      }
    } else {
      res.status(503).json({
        status: 'error',
        message: 'Server not ready, try again later.',
      });
    }
  });

  router.use(
    '/:siteId',
    (req, res, next) => {
      req.siteId = req.params.siteId;
      next();
    },
    ricochetMiddleware({
      siteConfig,
      storePrefix: storeConfig.prefix,
      storeBackend,
      fileStoreBackend,
      ...rest,
    })
  );
  return router;
};

export default mainMiddleware;
