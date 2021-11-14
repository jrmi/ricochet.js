import dotenv from 'dotenv';
dotenv.config();

// Settings

export const PORT = process.env.SERVER_PORT || process.env.PORT || 4000;
export const HOST = process.env.SERVER_HOST || 'localhost';

export const SERVER_URL = process.env.SERVER_URL || `http://${HOST}:${PORT}`;
export const SERVER_NAME = process.env.SERVER_NAME || 'Ricochet.js';

export const SITE_REGISTRATION_ENABLED =
  process.env.SITE_REGISTRATION_ENABLED !== '0';

export const SOCKET_PATH =
  process.env.SOCKET_PATH || process.env.REACT_APP_SOCKET_PATH || '/socket.io';

// File store related
export const FILE_STORE_TYPE = process.env.FILE_STORAGE || 'memory';
export const DISK_DESTINATION =
  process.env.DISK_DESTINATION || '/tmp/ricochet_file';

export const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
export const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const S3_BUCKET = process.env.S3_BUCKET;
export const S3_REGION = process.env.S3_REGION;
export const S3_PROXY = process.env.S3_PROXY === '1';
export const S3_CDN = process.env.S3_CDN || '';
export const S3_SIGNED_URL = process.env.S3_SIGNED_URL !== '0';

// JSON store related
export const STORE_BACKEND = process.env.STORE_BACKEND || 'memory';
export const STORE_PREFIX = process.env.STORE_PREFIX || 'store';
export const NEDB_BACKEND_DIRNAME = process.env.NEDB_BACKEND_DIRNAME || '/tmp/';
export const MONGODB_URI = process.env.MONGODB_URI;
export const MONGODB_DATABASE = process.env.MONGODB_DATABASE;

export const SECRET = process.env.RICOCHET_SECRET || process.env.SECRET;

export const DISABLE_CACHE = process.env.DISABLE_CACHE === '1';

export const EMAIL_HOST = process.env.EMAIL_HOST || 'fake';
export const EMAIL_PORT = process.env.EMAIL_PORT;
export const EMAIL_USER = process.env.EMAIL_USER;
export const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
export const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@example.com';

export const SETUP_PATH = process.env.SETUP_PATH || 'ricochet.js';

export const USE_PINO = process.env.USE_PINO === '1';
