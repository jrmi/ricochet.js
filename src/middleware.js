import fs from 'fs';
import express from 'express';
import cookieSession from 'cookie-session';
import nodemailer from 'nodemailer';

import log from './log.js';
import fileStore from './fileStore.js';
import store from './store.js';

import { NeDBBackend, memoryBackend } from './storeBackends.js';

import remote from './remote.js';
import execute from './execute.js';
import auth from './authentication.js';

import { decrypt } from './crypt.js';

export const middleware = ({
  siteName,
  secret,
  storeConfig = {},
  fileStoreConfig = {},
  disableCache = false,
  setupFunction = 'setup',
  emailConfig = { host: 'fake' },
} = {}) => {
  const router = express.Router();

  let _transporter = null;

  const getTransporter = () => {
    if (_transporter === null) {
      _transporter = nodemailer.createTransport({
        ...emailConfig,
      });
    }
    return _transporter;
  };

  const site = {};

  fs.readFile('./site.json', 'utf-8', (err, jsonString) => {
    if (err) {
      throw 'Failed to load site.json configuration file';
    }

    const data = JSON.parse(jsonString);
    Object.assign(site, data);
  });

  const onSendToken = async ({ origin, userEmail, userId, token, req }) => {
    let l = req.localizations;
    log.debug(`Link to connect: ${origin}/login/${userId}/${token}`);
    // if fake host, link is only loggued
    if (emailConfig.host === 'fake') {
      log.debug(
        l('Auth mail text_message', {
          url: `${origin}/login/${userId}/${token}`,
          siteName: siteName,
        })
      );
      return;
    }

    await getTransporter().sendMail({
      from: emailConfig.from,
      to: userEmail,
      subject: l('Your authentication link', { siteName: siteName }),
      text: l('Auth mail text_message', {
        url: `${origin}/login/${userId}/${token}`,
        siteName: siteName,
      }),
      html: l('Auth mail html message', {
        url: `${origin}/login/${userId}/${token}`,
        siteName: siteName,
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

  // JSON store backend
  let storeBackend;
  switch (storeConfig.type) {
    case 'nedb':
      storeBackend = NeDBBackend({ dirname: storeConfig.dirname });
      break;
    default:
      storeBackend = memoryBackend();
  }

  // Remote Function map
  const functions = {};

  const decryptPayload = (script, { siteId }) => {
    const data = JSON.parse(script);

    if (!site[siteId]) {
      throw { error: 'Site not registered', status: 'error' };
    }

    const { key } = site[siteId];
    const decrypted = decrypt(data, key);
    return decrypted;
  };

  // Remote code
  router.use(
    remote({
      context: { store: storeBackend, functions },
      disableCache,
      setupFunction,
      preProcess: decryptPayload,
    })
  );

  // File store
  router.use(
    fileStore(fileStoreConfig.type, {
      url: fileStoreConfig.apiUrl,
      destination: fileStoreConfig.diskDestination,
      bucket: fileStoreConfig.s3Bucket,
      endpoint: fileStoreConfig.s3Endpoint,
      accessKey: fileStoreConfig.s3AccesKey,
      secretKey: fileStoreConfig.s3SecretKey,
    })
  );

  // JSON store
  router.use(store({ prefix: storeConfig.prefix, backend: storeBackend }));

  // Execute middleware
  router.use(
    execute({
      context: { store: storeBackend },
      functions,
    })
  );

  return router;
};
export default middleware;
