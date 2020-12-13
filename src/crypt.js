import crypto from 'crypto';

export const encrypt = (buffer, key, algorithm = 'aes-256-cbc') => {
  const iv = crypto.randomBytes(16);
  let cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'base64'), iv);
  let encrypted = cipher.update(buffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    iv: iv.toString('base64'),
    encryptedData: encrypted.toString('base64'),
  };
};

export const decrypt = (data, key, algorithm = 'aes-256-cbc') => {
  let iv = Buffer.from(data.iv, 'base64');
  let encryptedText = Buffer.from(data.encryptedData, 'base64');
  let decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(key, 'base64'),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

/* test
const algo = 'aes-256-cbc';
const key = Buffer.from(crypto.randomBytes(32)).toString('base64');
const result = encrypt(Buffer.from('toto'), key, algo);
const decrypted = decrypt(result, key, algo);
*/
