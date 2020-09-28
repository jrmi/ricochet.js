import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

import fileStore from './fileStore.js';
import store from './store.js';
import { defineSocket } from './socket.js';

import { NeDBBackend, memoryBackend } from './storeBackends.js';

import execute from './execute.js';
import auth from './authentication.js';

import cookieSession from 'cookie-session';

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
  REMOTE_HOST,
  REMOTE_EXECUTE_URL,
  SECRET,
} from './settings.js';

const app = express();
const httpServer = createServer(app);

const corsOption = {
  credentials: true,
  origin: [REMOTE_HOST],
};

app.use(cors(corsOption));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const onSendToken = (userEmail, userHash, token) => {
  console.log(`${REMOTE_HOST}/login/${userHash}/${token}`);
};
const onLogin = (userHash, req) => {
  req.session.userHash = userHash;
};

const onLogout = (req) => {
  req.session = null;
};

// Session middleware
app.use(
  cookieSession({
    name: 'session',
    keys: [SECRET],

    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
);

// authenticate middleware
app.use((req, res, next) => {
  if (req.session.userHash) {
    console.log('Authenticated');
    req.authenticatedUser = req.session.userHash;
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
  execute({ context: { store: storeBackend }, remote: REMOTE_EXECUTE_URL })
);

defineSocket(httpServer);

httpServer.listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT}`);
});

export default app;
