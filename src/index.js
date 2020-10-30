import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import requestLanguage from 'express-request-language';
import cookieSession from 'cookie-session';
import nodemailer from 'nodemailer';

import fileStore from './fileStore.js';
import store from './store.js';
import { defineSocket } from './socket.js';

import { NeDBBackend, memoryBackend } from './storeBackends.js';

import execute from './execute.js';
import auth from './authentication.js';

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
} from './settings.js';

let _transporter = null;

const getTransporter = () => {
  if (_transporter === null) {
    _transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: false,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      },
    });
  }
  return _transporter;
};

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
app.use(
  requestLanguage({
    languages: ['en-US', 'fr-FR'],
    localizations,
  })
);
app.use(
  express.json({
    parameterLimit: 100000,
    limit: '50mb',
  })
);
app.use(express.urlencoded({ extended: true }));

console.log(SITE_NAME);

const onSendToken = async ({ origin, userEmail, userId, token, req }) => {
  let l = req.localizations;
  console.log(`Link to connect: ${origin}/login/${userId}/${token}`);
  // if fake host, link is only logged
  if (EMAIL_HOST === 'fake') {
    console.log(
      l('Auth mail text_message', {
        url: `${origin}/login/${userId}/${token}`,
        siteName: SITE_NAME,
      })
    );
    return;
  }

  await getTransporter().sendMail({
    from: EMAIL_FROM,
    to: userEmail,
    subject: l('Your authentication link', { siteName: SITE_NAME }),
    text: l('Auth mail text_message', {
      url: `${origin}/login/${userId}/${token}`,
      siteName: SITE_NAME,
    }),
    html: l('Auth mail html message', {
      url: `${origin}/login/${userId}/${token}`,
      siteName: SITE_NAME,
    }),
  });

  console.log('Auth mail sent');
};
const onLogin = (userId, req) => {
  req.session.userId = userId;
};

const onLogout = (req) => {
  req.session = null;
};

// Session middleware
app.use(
  cookieSession({
    name: 'session',
    keys: [SECRET],
    httpOnly: true,

    // Cookie Options
    //maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
);

// authenticate middleware
app.use((req, res, next) => {
  if (req.session.userId) {
    console.log('Authenticated');
    req.authenticatedUser = req.session.userId;
  } else {
    console.log('Not authenticated');
    req.authenticatedUser = null;
  }
  next();
});

// Auth middleware
app.use(auth({ onSendToken, onLogin, onLogout, secret: SECRET }));

// File store
app.use(
  fileStore(FILE_STORE_TYPE, {
    url: API_URL,
    destination: DISK_DESTINATION,
    bucket: S3_BUCKET,
    endpoint: S3_ENDPOINT,
    accessKey: S3_ACCESS_KEY,
    secretKey: S3_SECRET_KEY,
  })
);

// JSON store
let storeBackend;
switch (STORE_BACKEND) {
  case 'nedb':
    storeBackend = NeDBBackend({ dirname: NEDB_BACKEND_DIRNAME });
    app.use(
      store({
        prefix: STORE_PREFIX,
        backend: storeBackend,
      })
    );
    break;
  default:
    storeBackend = memoryBackend();
    app.use(store({ prefix: STORE_PREFIX, backend: storeBackend }));
}

// Execute middleware
app.use(
  execute({
    context: { store: storeBackend },
    disableCache: DISABLE_CACHE,
  })
);

defineSocket(httpServer);

httpServer.listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT}`);
});

export default app;
