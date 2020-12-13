import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import requestLanguage from 'express-request-language';
import pinoHttp from 'pino-http';

import log from './log.js';
import { defineSocket } from './socket.js';

import middleware from './middleware.js';

import localizations from './i18n/output/all.js';

import {
  HOST,
  PORT,
  API_URL,
  FILE_STORE_TYPE,
  DISK_DESTINATION,
  S3_SECRET_KEY,
  S3_ACCESS_KEY,
  S3_BUCKET,
  S3_ENDPOINT,
  STORE_BACKEND,
  STORE_PREFIX,
  NEDB_BACKEND_DIRNAME,
  SECRET,
  DISABLE_CACHE,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_USER,
  EMAIL_PASSWORD,
  EMAIL_FROM,
  SITE_NAME,
  SETUP_FUNCTION,
} from './settings.js';

const app = express();
const httpServer = createServer(app);

const corsOption = {
  credentials: true,
  origin: (origin, callback) => {
    // Allow ALL origins pls
    return callback(null, true);
  },
};

app.use(cors(corsOption));
app.use(pinoHttp({ logger: log }));
app.use(
  express.json({
    parameterLimit: 100000,
    limit: '50mb',
  })
);
app.use(
  requestLanguage({
    languages: ['en-US', 'fr-FR'],
    localizations,
  })
);
app.use(express.urlencoded({ extended: true }));

app.use(
  middleware({
    siteName: SITE_NAME,
    secret: SECRET,
    storeConfig: {
      type: STORE_BACKEND,
      prefix: STORE_PREFIX,
      dirname: NEDB_BACKEND_DIRNAME,
    },
    fileStoreConfig: {
      type: FILE_STORE_TYPE,
      diskDestination: DISK_DESTINATION,
      s3AccessKey: S3_ACCESS_KEY,
      s3Bucket: S3_BUCKET,
      s3Endpoint: S3_ENDPOINT,
      s3SecretKey: S3_SECRET_KEY,
      apiUrl: API_URL,
    },
    disableCache: DISABLE_CACHE,
    setupFunction: SETUP_FUNCTION,
    emailConfig: {
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      user: EMAIL_USER,
      password: EMAIL_PASSWORD,
      from: EMAIL_FROM,
    },
  })
);

defineSocket(httpServer);

httpServer.listen(PORT, HOST, () => {
  log.info(`listening on ${HOST}:${PORT}`);
});

export default app;
