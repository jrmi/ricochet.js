import crypto from 'crypto';

const key = Buffer.from(crypto.randomBytes(32)).toString('base64');

console.log(`Key: ${key}`);
