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
  EXECUTE_SCRIPT_HOST,
} from './settings.js';

const app = express();
const httpServer = createServer(app);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const onSendToken = (userEmail, userHash, token) => {
  console.log(`/auth/${token}/?userHash=${userHash}`);
};
const onLogin = (userHash, req) => {
  req.session.userHash = userHash;
};

const onLogout = (req) => {
  req.session = null;
};

const SECRET = 'mysecret';

app.use(
  cookieSession({
    name: 'session',
    keys: [SECRET],

    // Cookie Options
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
);

app.use(auth({ onSendToken, onLogin, onLogout, secret: SECRET }));

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

app.use(
  execute({ context: { store: storeBackend }, remote: EXECUTE_SCRIPT_HOST })
);

defineSocket(httpServer);

httpServer.listen(PORT, HOST, () => {
  console.log(`listening on ${HOST}:${PORT}`);
});

export default app;
