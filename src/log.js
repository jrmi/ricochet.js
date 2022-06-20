import pino from 'pino';

import { USE_PINO } from './settings.js';

const defaultLog = {
  debug: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  fatal: console.error,
};

let log;

if (USE_PINO) {
  log = pino();
} else {
  log = defaultLog;
}

export default log;
