import './envLoader.js';
import crypto from 'crypto';

// Encryption algorithm: AES-256-GCM with 96-bit IV and 128-bit authentication tag
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128 bits

/**
 * Derives the primary 32-byte (256-bit) encryption key
 */
function getEncryptionKey() {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    return crypto.createHash('sha256').update(envKey).digest();
  }

  const fallbackSource = process.env.GOOGLE_CLIENT_SECRET ||
    process.env.VITE_GOOGLE_CLIENT_SECRET ||
    process.env.FB_APP_SECRET ||
    process.env.CRON_SECRET ||
    'autovid_default_secure_vault_salt_2026';

  return crypto.createHash('sha256').update(fallbackSource).digest();
}

/**
 * Returns list of potential decryption keys for 100% backward compatibility
 */
function getDecryptionKeys() {
  const keys = [];
  const primary = getEncryptionKey();
  keys.push(primary);

  const fallbackSources = [
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.VITE_GOOGLE_CLIENT_SECRET,
    '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',
    process.env.FB_APP_SECRET,
    'autovid_default_secure_vault_salt_2026'
  ].filter(Boolean);

  for (const src of fallbackSources) {
    const k = crypto.createHash('sha256').update(src).digest();
    if (!keys.some(existing => existing.equals(k))) {
      keys.push(k);
    }
  }

  return keys;
}

/**
 * Encrypts plaintext string using AES-256-GCM
 * Output format: "iv_hex:tag_hex:ciphertext_hex"
 */
export function encryptText(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
  } catch (err) {
    console.error('[CryptoVault] Encryption failed:', err.message);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypts AES-256-GCM encrypted string ("iv:tag:ciphertext")
 * Resiliently tests all valid historical keys
 */
export function decryptText(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') return '';
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    return encryptedString;
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const keys = getDecryptionKeys();

  for (const key of keys) {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let plaintext = decipher.update(ciphertextHex, 'hex', 'utf8');
      plaintext += decipher.final('utf8');
      if (plaintext) return plaintext;
    } catch (err) {
      // Try next key candidate
    }
  }

  throw new Error('Decryption failed');
}

/**
 * Deeply redacts sensitive keys from any object/array before sending to client or logging
 */
const SENSITIVE_KEYS = new Set([
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'accesstoken',
  'access_token',
  'usertoken',
  'user_token',
  'token',
  'appsecret',
  'app_secret',
  'fb_exchange_token',
  'password'
]);

export function redactCredentials(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactCredentials(item));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      if (typeof value === 'string' && value.length > 0) {
        redacted[key] = '[REDACTED]';
        redacted[`has_${key}`] = true;
      } else {
        redacted[key] = null;
      }
    } else if (value && typeof value === 'object') {
      redacted[key] = redactCredentials(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
}
