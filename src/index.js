import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

import fileStore from './fileStore.js';
import store from './store.js';
import { defineSocket } from './socket.js';

import { NeDBBackend, memoryBackend } from './storeBackends.js';

import execute from './execute.js';

import {
  HOST,
  PORT,
  API_URL,
  FILE_STORAGE,
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

app.use(
  fileStore(FILE_STORAGE, {
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
