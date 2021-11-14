import { RawSource } from 'webpack-sources';
import { encrypt } from './crypt.js';

export const RICOCHET_FILE = process.env.RICOCHET_FILE || 'ricochet.json';

class EncryptPlugin {
  constructor({ algorithm = 'aes-256-cbc', key }) {
    this.algorithm = algorithm;
    this.key = key;
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('EncryptPlugin', (compilation) => {
      compilation.hooks.afterProcessAssets.tap('EncryptPlugin', () => {
        console.log(`Encrypt ${RICOCHET_FILE} content.`);
        compilation.updateAsset(RICOCHET_FILE, (rawSource) => {
          return new RawSource(
            JSON.stringify(
              encrypt(rawSource.buffer(), this.key, this.algorithm)
            )
          );
        });
      });
    });
  }
}

export default EncryptPlugin;
