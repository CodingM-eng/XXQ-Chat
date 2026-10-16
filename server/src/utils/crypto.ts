import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Derives a deterministic 32-byte key using scrypt from ENCRYPTION_KEY or JWT_DEV_SECRET.
 * Ensures AES-256 compatibility across development, test, and production environments.
 */
function getEncryptionKey(): Buffer {
  const secret = config.ENCRYPTION_KEY || config.JWT_DEV_SECRET || 'xxq-chat-default-secret-salt-32b';
  return crypto.scryptSync(secret, 'xxq-chat-encryption-salt-v1', 32);
}

/**
 * Encrypts a sensitive string (e.g., OAuth refresh token, Telegram bot token) using AES-256-GCM.
 * Output format: <12-byte IV in hex>:<16-byte AuthTag in hex>:<Encrypted ciphertext in hex>
 */
export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a payload previously encrypted with encryptSecret.
 * Verifies authenticity with GCM authentication tag before returning plaintext.
 */
export function decryptSecret(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Geçersiz şifrelenmiş veri formatı');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
