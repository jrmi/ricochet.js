import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import startServer from './server.js';
import { generateKey } from './crypt.js';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .boolean(['generate-key'])
  .describe('generate-key', 'Generate random encryption key')
  .help('h')
  .version()
  .alias('h', 'help').argv;

if (argv.generateKey) {
  const key = generateKey();
  console.log(`Key: ${key}`);
} else {
  startServer();
}
