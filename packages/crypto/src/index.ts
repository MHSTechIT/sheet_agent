import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.APP_ENC_KEY;
  if (!raw) {
    throw new Error('APP_ENC_KEY is required (32-byte base64)');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`APP_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

/**
 * Encrypts plaintext into a base64 string of: iv (12) || tag (16) || ciphertext.
 * Returns the original empty string for empty input so optional fields stay round-trippable.
 */
export function encrypt(plaintext: string): string {
  if (plaintext === '' || plaintext == null) return '';
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('Ciphertext too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string | null | undefined, visible = 4): string {
  if (!value) return '';
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
