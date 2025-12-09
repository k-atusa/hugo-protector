const crypto = require('node:crypto');

const DEFAULT_ITERATIONS = 310_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32; // 256 bits
const ALGORITHM = 'aes-256-gcm';

const toBase64 = buffer => Buffer.from(buffer).toString('base64');

const fromBase64 = value => Buffer.from(value, 'base64');

const deriveKey = (password, salt, iterations) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required to derive encryption key.');
  }
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
};

const encryptText = (plaintext, password, options = {}) => {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Plaintext must be a non-empty string.');
  }
  if (!password) {
    throw new Error('Password is required for encryption.');
  }

  const iterations = Number(options.iterations) || DEFAULT_ITERATIONS;
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt, iterations);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = {
    v: 1,
    alg: 'AES-256-GCM',
    iter: iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    tag: toBase64(authTag)
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
};

const decryptPayload = (payloadBase64, password) => {
  if (!payloadBase64) {
    throw new Error('Payload is missing');
  }
  if (!password) {
    throw new Error('Password is required for decryption');
  }
  const json = Buffer.from(payloadBase64, 'base64').toString('utf8');
  const payload = JSON.parse(json);
  const { iter, salt, iv, ct, tag } = payload;
  const key = deriveKey(password, fromBase64(salt), iter || DEFAULT_ITERATIONS);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, fromBase64(iv));
  decipher.setAuthTag(fromBase64(tag));
  const plaintext = Buffer.concat([decipher.update(fromBase64(ct)), decipher.final()]);
  return plaintext.toString('utf8');
};

module.exports = {
  ALGORITHM,
  DEFAULT_ITERATIONS,
  encryptText,
  decryptPayload
};
