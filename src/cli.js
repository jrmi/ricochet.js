import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import startServer from './server.js';
import { generateKey } from './crypt.js';
import repl from 'repl';
import { getStoreBackend, wrapBackend } from './storeBackends.js';

import {
  STORE_BACKEND,
  STORE_PREFIX,
  NEDB_BACKEND_DIRNAME,
} from './settings.js';

yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .command(
    '$0',
    'Start the ricochetjs server',
    () => {},
    (argv) => {
      if (argv.generateKey) {
        const key = generateKey();
        console.log(`Key: ${key}`);
        return;
      }
      console.log('Should start the server');
      startServer();
    }
  )
  .command(
    ['generatekey', 'generateKey'],
    'Generate random encryption key',
    () => {},
    () => {
      const key = generateKey();
      console.log(`Key: ${key}`);
    }
  )
  .command(
    'shell <siteId>',
    'Open a shell for specified siteId',
    () => {},
    (argv) => {
      const siteId = argv.siteId;

      const storeConfig = {
        prefix: STORE_PREFIX,
        dirname: NEDB_BACKEND_DIRNAME,
      };

      // Create JSON wrapped store backend
      const storeBackend = getStoreBackend(STORE_BACKEND, storeConfig);
      const store = wrapBackend(storeBackend, siteId);

      const r = repl.start('> ');
      r.context.store = store;
    }
  )
  .boolean(['generate-key'])
  .describe('generate-key', 'Generate random encryption key')
  .help('h')
  .version()
  .alias('h', 'help').argv;
