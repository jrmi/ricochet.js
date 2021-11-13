import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import pinoHttp from 'pino-http';
import i18next from 'i18next';
import i18nextMiddleware from 'i18next-http-middleware';
import i18nextBackend from 'i18next-fs-backend';

import log from './log.js';

import middleware from './middleware.js';
import path from 'path';
import fs from 'fs';

import {
  PORT,
  SERVER_URL,
  FILE_STORE_TYPE,
  DISK_DESTINATION,
  S3_SECRET_KEY,
  S3_ACCESS_KEY,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_REGION,
  S3_PROXY,
  S3_CDN,
  STORE_BACKEND,
  STORE_PREFIX,
  NEDB_BACKEND_DIRNAME,
  MONGODB_URI,
  MONGODB_DATABASE,
  SECRET,
  DISABLE_CACHE,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_USER,
  EMAIL_PASSWORD,
  SETUP_FUNCTION,
  S3_SIGNED_URL,
  SERVER_NAME,
  EMAIL_FROM,
  SITE_REGISTRATION_ENABLED,
} from './settings.js';

const startServer = () => {
  i18next
    .use(i18nextMiddleware.LanguageDetector)
    .use(i18nextBackend)
    .init({
      supportedLngs: ['en', 'fr'],
      initImmediate: false,
      fallbackLng: 'en',
      preload: fs
        .readdirSync(path.join(__dirname, '../locales'))
        .filter((fileName) => {
          const joinedPath = path.join(
            path.join(__dirname, '../locales'),
            fileName
          );
          const isDirectory = fs.statSync(joinedPath).isDirectory();
          return isDirectory;
        }),
      backend: {
        loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json'),
      },
    });

  if (!SECRET) {
    console.log(
      'You must define "RICOCHET_SECRET" environnement variable (tip: use .env file)'
    );
    process.exit(-1);
  }

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
    bodyParser.json({
      limit: '50mb',
    })
  );

  app.use(i18nextMiddleware.handle(i18next));

  app.use(bodyParser.urlencoded({ extended: true }));

  // Static files
  const root = path.join(__dirname, '../public');
  app.use(express.static(root));

  app.use(
    middleware({
      secret: SECRET,
      serverName: SERVER_NAME,
      serverUrl: SERVER_URL,
      siteRegistrationEnabled: SITE_REGISTRATION_ENABLED,
      storeConfig: {
        type: STORE_BACKEND,
        prefix: STORE_PREFIX,
        dirname: NEDB_BACKEND_DIRNAME,
        uri: MONGODB_URI,
        database: MONGODB_DATABASE,
      },
      fileStoreConfig: {
        type: FILE_STORE_TYPE,
        diskDestination: DISK_DESTINATION,
        s3AccessKey: S3_ACCESS_KEY,
        s3Bucket: S3_BUCKET,
        s3Endpoint: S3_ENDPOINT,
        s3SecretKey: S3_SECRET_KEY,
        s3Region: S3_REGION,
        s3Proxy: S3_PROXY,
        s3Cdn: S3_CDN,
        s3SignedUrl: S3_SIGNED_URL,
      },
      disableCache: DISABLE_CACHE,
      setupFunction: SETUP_FUNCTION,
      emailConfig: {
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        from: EMAIL_FROM,
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASSWORD,
        },
      },
    })
  );

  httpServer.listen(PORT, () => {
    log.info(`listening on ${PORT}`);
  });
  return app;
};

export default startServer;
