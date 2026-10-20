import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptText,
  decryptText,
  redactCredentials,
  isEncrypted
} from '../lib/cryptoVault.js';

describe('CryptoVault — AES-256-GCM & Secret Redaction', () => {
  test('encrypts and decrypts string accurately', () => {
    const secret = '1//04example_google_refresh_token_very_long_secret_value_12345';
    const encrypted = encryptText(secret);

    assert.notEqual(encrypted, secret);
    assert.equal(isEncrypted(encrypted), true);

    const decrypted = decryptText(encrypted);
    assert.equal(decrypted, secret);
  });

  test('generates unique ciphertexts for identical plaintexts (random IV)', () => {
    const text = 'identical_secret_payload';
    const enc1 = encryptText(text);
    const enc2 = encryptText(text);

    assert.notEqual(enc1, enc2);
    assert.equal(decryptText(enc1), text);
    assert.equal(decryptText(enc2), text);
  });

  test('fails decryption when ciphertext or auth tag is tampered', () => {
    const text = 'my_super_secret_token';
    const encrypted = encryptText(text);
    const parts = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCiphertext = parts[0] + ':' + parts[1] + ':' + parts[2].substring(0, parts[2].length - 2) + '00';

    assert.throws(() => {
      decryptText(tamperedCiphertext);
    }, /Decryption failed/);
  });

  test('redactCredentials strips all sensitive tokens and secrets recursively', () => {
    const sensitivePayload = {
      user: 'test_user',
      clientSecret: 'GOCSPX-secret123',
      refreshToken: '1//04refresh123',
      accessToken: 'ya29.access123',
      nested: {
        token: 'EAA123fbToken',
        app_secret: 'fbAppSecret999',
        publicField: 'visible_data'
      },
      list: [
        { name: 'channel1', access_token: 'secret_token_in_list' },
        { name: 'channel2', public_id: 123 }
      ]
    };

    const sanitized = redactCredentials(sensitivePayload);

    // Assert sensitive fields are redacted
    assert.equal(sanitized.clientSecret, '[REDACTED]');
    assert.equal(sanitized.has_clientSecret, true);
    assert.equal(sanitized.refreshToken, '[REDACTED]');
    assert.equal(sanitized.has_refreshToken, true);
    assert.equal(sanitized.accessToken, '[REDACTED]');
    assert.equal(sanitized.has_accessToken, true);
    assert.equal(sanitized.nested.token, '[REDACTED]');
    assert.equal(sanitized.nested.app_secret, '[REDACTED]');
    assert.equal(sanitized.nested.publicField, 'visible_data');
    assert.equal(sanitized.list[0].access_token, '[REDACTED]');
    assert.equal(sanitized.list[1].public_id, 123);
  });
});
