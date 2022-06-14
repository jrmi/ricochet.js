import express from 'express';
import cookieSession from 'cookie-session';
import nodemailer from 'nodemailer';
import schedule from 'node-schedule';

import { throwError } from './error.js';
import log from './log.js';
import store from './store/index.js';
import site from './site.js';
import origin from './origin.js';

import { getStoreBackend, wrapBackend } from './store/backends/index.js';
import {
  getFileStoreBackend,
  wrapBackend as wrapFileBackend,
} from './fileStore/backends/index.js';

import remote from './remote.js';
import execute from './execute.js';
import auth from './authentication.js';

import { decrypt } from './crypt.js';

export const ricochetMiddleware = ({
  secret,
  fakeEmail = false,
  storeBackend,
  fileStoreBackend,
  storePrefix,
  disableCache = false,
  setupPath,
  getTransporter,
} = {}) => {
  const router = express.Router();

  // Remote Function map
  const functionsBySite = {};
  // Schedule map
  const schedulesBySite = {};
  // Hooks map
  const hooksBySite = {};

  const decryptPayload = (script, { siteConfig, siteId }) => {
    const data = JSON.parse(script);

    if (!siteConfig[siteId]) {
      throwError(`Site ${siteId} not registered on ricochet.js`, 404);
    }

    const { key } = siteConfig[siteId];
    try {
      const decrypted = decrypt(data, key);

      return decrypted;
    } catch (e) {
      log.warn(
        { error: e },
        `Fails to decrypt Ricochet setup file from ${remote}. Please check your encryption key.`
      );
      throwError(
        `Fails to decrypt Ricochet setup file from ${remote}. Please check your encryption key.`,
        500
      );
    }
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
      setupPath,
      preProcess: decryptPayload,
    })
  );

  const onSendToken = async ({ remote, userEmail, userId, token, req }) => {
    const { siteConfig, siteId, t } = req;

    if (!siteConfig[siteId]) {
      throwError(`Site ${siteId} not registered on ricochet.js`, 404);
    }

    const { name: siteName, emailFrom } = siteConfig[siteId];

    log.debug(`Link to connect: ${remote}/login/${userId}/${token}`);
    // if fake host, link is only loggued
    if (fakeEmail) {
      log.info(
        t('Auth mail text message', {
          url: `${remote}/login/${userId}/${token}`,
          siteName: siteName,
          interpolation: { escapeValue: false },
        })
      );
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
      sameSite: 'Lax',
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
  serverUrl,
  serverName,
  siteRegistrationEnabled,
  fileStoreConfig = {},
  storeConfig = {},
  configFile = './site.json',
  emailConfig = { host: 'fake' },
  ...rest
} = {}) => {
  const router = express.Router();
  const fakeEmail = emailConfig.host === 'fake';

  let _transporter = null;

  const getTransporter = () => {
    const transportConfig =
      emailConfig.host === 'fake'
        ? {
            streamTransport: true,
            newline: 'unix',
            buffer: true,
          }
        : emailConfig;
    if (_transporter === null) {
      _transporter = nodemailer.createTransport({
        ...transportConfig,
      });
    }
    return _transporter;
  };

  // Store backends
  const storeBackend = getStoreBackend(storeConfig.type, storeConfig);
  const fileStoreBackend = getFileStoreBackend(fileStoreConfig.type, {
    url: fileStoreConfig.apiUrl,
    destination: fileStoreConfig.diskDestination,
    bucket: fileStoreConfig.s3Bucket,
    endpoint: fileStoreConfig.s3Endpoint,
    accessKey: fileStoreConfig.s3AccessKey,
    secretKey: fileStoreConfig.s3SecretKey,
    region: fileStoreConfig.s3Region,
    proxy: fileStoreConfig.s3Proxy,
    cdn: fileStoreConfig.s3Cdn,
    signedUrl: fileStoreConfig.s3SignedUrl,
  });

  const onSiteCreation = async ({ req, site, confirmPath }) => {
    const { t } = req;
    const confirmURL = `${serverUrl}${confirmPath}`;

    if (fakeEmail) {
      log.info(
        t('Site creation text message', {
          url: confirmURL,
          siteId: site._id,
          siteName: serverName,
          interpolation: { escapeValue: false },
        })
      );
    }

    await getTransporter().sendMail({
      from: emailConfig.from,
      to: site.owner,
      subject: t('Please confirm site creation'),
      text: t('Site creation text message', {
        url: confirmURL,
        siteId: site._id,
        siteName: serverName,
      }),
      html: t('Site creation html message', {
        url: confirmURL,
        siteId: site._id,
        siteName: serverName,
      }),
    });
  };

  const onSiteUpdate = async ({ req, previous, confirmPath }) => {
    const { t } = req;
    const confirmURL = `${serverUrl}${confirmPath}`;

    if (fakeEmail) {
      log.info(
        t('Site update text message', {
          url: confirmURL,
          siteId: previous._id,
          siteName: serverName,
          interpolation: { escapeValue: false },
        })
      );
    }

    await getTransporter().sendMail({
      from: emailConfig.from,
      to: previous.owner,
      subject: t('Please confirm site update'),
      text: t('Site update text message', {
        url: confirmURL,
        siteId: previous._id,
        siteName: serverName,
      }),
      html: t('Site update html message', {
        url: confirmURL,
        siteId: previous._id,
        siteName: serverName,
      }),
    });
  };

  router.use(
    site({
      configFile,
      storeBackend,
      siteRegistrationEnabled,
      onSiteCreation,
      onSiteUpdate,
    })
  );

  router.use(
    '/:siteId',
    (req, res, next) => {
      req.siteId = req.params.siteId;
      next();
    },
    origin(),
    ricochetMiddleware({
      fakeEmail,
      storePrefix: storeConfig.prefix,
      storeBackend,
      fileStoreBackend,
      getTransporter,
      ...rest,
    })
  );
  return router;
};

export default mainMiddleware;
