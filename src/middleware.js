import fs from 'fs';
import express from 'express';
import cookieSession from 'cookie-session';
import nodemailer from 'nodemailer';
import schedule from 'node-schedule';

import log from './log.js';
import fileStore from './fileStore.js';
import store from './store.js';

import { getStoreBackend, wrapBackend } from './storeBackends.js';

import remote from './remote.js';
import execute from './execute.js';
import auth from './authentication.js';

import { decrypt } from './crypt.js';

export const middleware = ({
  secret,
  storeConfig = {},
  fileStoreConfig = {},
  disableCache = false,
  setupFunction = 'setup',
  emailConfig = { host: 'fake' },
  configFile = './site.json',
} = {}) => {
  const router = express.Router();

  // File store
  router.use(
    fileStore(fileStoreConfig.type, {
      url: fileStoreConfig.apiUrl,
      destination: fileStoreConfig.diskDestination,
      bucket: fileStoreConfig.s3Bucket,
      endpoint: fileStoreConfig.s3Endpoint,
      accessKey: fileStoreConfig.s3AccesKey,
      secretKey: fileStoreConfig.s3SecretKey,
      region: fileStoreConfig.s3Region,
    })
  );

  // JSON store backend
  const storeBackend = getStoreBackend(storeConfig.type, storeConfig);

  const site = {};

  // Read config file
  fs.readFile(configFile, 'utf-8', (err, jsonString) => {
    if (err) {
      const { code } = err;
      if (code === 'ENOENT') {
        const data = {};
        log.info('No config file, create default');
        fs.writeFile(configFile, JSON.stringify(data, null, 2), () => {
          Object.assign(site, data);
        });
      } else {
        throw `Failed to load ${configFile} configuration file`;
      }
    } else {
      try {
        const data = JSON.parse(jsonString);
        Object.assign(site, data);
      } catch (e) {
        console.log('Fails to parse config file...\n', e);
        process.exit(-1);
      }
    }
  });

  // Remote Function map
  const functionsBySite = {};
  // Schedule map
  const schedulesBySite = {};

  const decryptPayload = (script, { siteId }) => {
    const data = JSON.parse(script);

    if (!site[siteId]) {
      throw `Site ${siteId} not registered on ricochet.js`;
    }

    const { key } = site[siteId];
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
        if (!functionsBySite[siteId]) {
          functionsBySite[siteId] = {};
        }
        if (!schedulesBySite[siteId]) {
          schedulesBySite[siteId] = { hourly: [], daily: [] };
        }
        return {
          store: wrappedBackend,
          functions: functionsBySite[siteId],
          schedules: schedulesBySite[siteId],
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

    if (!site[siteId]) {
      throw { error: 'Site not registered', status: 'error' };
    }

    const { name: siteName, emailFrom } = site[siteId];

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
      //maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })
  );

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
  router.use(store({ prefix: storeConfig.prefix, backend: storeBackend }));

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
        return { store: wrappedBackend };
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
export default middleware;
