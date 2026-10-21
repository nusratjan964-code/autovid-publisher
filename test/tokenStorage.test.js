import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveYouTubeCredentials,
  updateYouTubeAccessToken,
  recordYouTubeError,
  getDecryptedYouTubeCredentials,
  getSanitizedYouTube,
  disconnectYouTube,
  saveFacebookPages,
  getDecryptedPageAccessToken,
  getSanitizedFacebookPages,
  clearFacebookCredentials,
  loadVault
} from '../lib/tokenStorage.js';
import { isEncrypted } from '../lib/cryptoVault.js';

describe('TokenStorage — Encrypted Vault & Sanitization', () => {
  beforeEach(() => {
    disconnectYouTube();
    clearFacebookCredentials();
  });

  test('saves YouTube credentials encrypted and retrieves decrypted server-side only', () => {
    const rawAccess = 'ya29.test_access_token_123';
    const rawRefresh = '1//04test_refresh_token_456';

    saveYouTubeCredentials({
      channelId: 'UC123456789',
      channelTitle: 'Chiku Tech',
      accessToken: rawAccess,
      refreshToken: rawRefresh,
      expiresInSeconds: 3600
    });

    // Verify storage at rest is encrypted
    const rawVault = loadVault();
    assert.equal(isEncrypted(rawVault.youtube.accessTokenEncrypted), true);
    assert.equal(isEncrypted(rawVault.youtube.refreshTokenEncrypted), true);
    assert.notEqual(rawVault.youtube.accessTokenEncrypted, rawAccess);
    assert.notEqual(rawVault.youtube.refreshTokenEncrypted, rawRefresh);

    // Verify decrypted retrieval works server-side
    const decrypted = getDecryptedYouTubeCredentials();
    assert.equal(decrypted.accessToken, rawAccess);
    assert.equal(decrypted.refreshToken, rawRefresh);
    assert.equal(decrypted.channelId, 'UC123456789');

    // Verify sanitized client view has NO secrets or tokens
    const sanitized = getSanitizedYouTube();
    assert.equal(sanitized.connected, true);
    assert.equal(sanitized.hasRefreshToken, true);
    assert.equal(sanitized.tokenConfigured, true);
    assert.equal(sanitized.accessToken, undefined);
    assert.equal(sanitized.refreshToken, undefined);
    assert.equal(sanitized.accessTokenEncrypted, undefined);
    assert.equal(sanitized.refreshTokenEncrypted, undefined);
  });

  test('preserves existing refresh token when re-auth omits refresh token', () => {
    saveYouTubeCredentials({
      channelId: 'UC_PRESERVE',
      channelTitle: 'Preserve Channel',
      accessToken: 'ya29.first_access_token',
      refreshToken: '1//04_durable_refresh_token',
      expiresInSeconds: 3600
    });

    // Simulate Google re-auth without consent prompt (Google returns new access token but no refresh token)
    saveYouTubeCredentials({
      channelId: 'UC_PRESERVE',
      channelTitle: 'Preserve Channel',
      accessToken: 'ya29.second_access_token',
      refreshToken: undefined, // Google omitted refresh token
      expiresInSeconds: 3600
    });

    const decrypted = getDecryptedYouTubeCredentials();
    assert.equal(decrypted.accessToken, 'ya29.second_access_token');
    assert.equal(decrypted.refreshToken, '1//04_durable_refresh_token'); // Durably preserved!
  });

  test('records YouTube errors without corrupting channel data', () => {
    saveYouTubeCredentials({
      channelId: 'UC_ERR_TEST',
      channelTitle: 'Error Channel',
      accessToken: 'ya29.token',
      refreshToken: '1//refresh',
      expiresInSeconds: 3600
    });

    recordYouTubeError('INVALID_GRANT_EXPIRED', 'Google Testing Mode 7-day expiration reached.');

    const sanitized = getSanitizedYouTube();
    assert.equal(sanitized.status, 'RECONNECT_REQUIRED');
    assert.equal(sanitized.lastError.type, 'INVALID_GRANT_EXPIRED');
    assert.equal(sanitized.lastError.message.includes('7-day expiration'), true);
  });

  test('saves Facebook Page credentials encrypted and sanitizes client representation', () => {
    const rawPageToken = 'EAA_facebook_page_access_token_secret_123';

    saveFacebookPages({
      activePageId: 'page_1001',
      pages: [
        {
          id: 'page_1001',
          name: 'Chiku bd Official',
          category: 'Digital creator',
          access_token: rawPageToken,
          isPermanent: true,
          expiresAt: 'Never (Permanent Page Token)'
        }
      ]
    });

    // Server-side decrypted lookup
    const decryptedToken = getDecryptedPageAccessToken('page_1001');
    assert.equal(decryptedToken, rawPageToken);

    // Sanitized client representation must NOT contain token
    const sanitized = getSanitizedFacebookPages();
    assert.equal(sanitized.pages.length, 1);
    assert.equal(sanitized.pages[0].id, 'page_1001');
    assert.equal(sanitized.pages[0].tokenConfigured, true);
    assert.equal(sanitized.pages[0].isPermanent, true);
    assert.equal(sanitized.pages[0].accessToken, undefined);
    assert.equal(sanitized.pages[0].access_token, undefined);
    assert.equal(sanitized.pages[0].accessTokenEncrypted, undefined);
  });

  test('isolates credentials across multiple users preventing cross-tenant access', () => {
    // User A credentials
    saveYouTubeCredentials({
      userKey: 'user_alice@example.com',
      channelId: 'UC_ALICE',
      channelTitle: 'Alice Channel',
      accessToken: 'ya29.alice_access_token',
      refreshToken: '1//alice_refresh_token',
      expiresInSeconds: 3600
    });

    // User B credentials
    saveYouTubeCredentials({
      userKey: 'user_bob@example.com',
      channelId: 'UC_BOB',
      channelTitle: 'Bob Channel',
      accessToken: 'ya29.bob_access_token',
      refreshToken: '1//bob_refresh_token',
      expiresInSeconds: 3600
    });

    // Verify User A gets ONLY User A's credentials
    const aliceYt = getDecryptedYouTubeCredentials('user_alice@example.com');
    assert.equal(aliceYt.channelId, 'UC_ALICE');
    assert.equal(aliceYt.accessToken, 'ya29.alice_access_token');
    assert.equal(aliceYt.refreshToken, '1//alice_refresh_token');

    // Verify User B gets ONLY User B's credentials
    const bobYt = getDecryptedYouTubeCredentials('user_bob@example.com');
    assert.equal(bobYt.channelId, 'UC_BOB');
    assert.equal(bobYt.accessToken, 'ya29.bob_access_token');
    assert.equal(bobYt.refreshToken, '1//bob_refresh_token');

    // Disconnecting Alice does NOT impact Bob
    disconnectYouTube('user_alice@example.com');
    assert.equal(getDecryptedYouTubeCredentials('user_alice@example.com'), null);
    assert.equal(getDecryptedYouTubeCredentials('user_bob@example.com').channelId, 'UC_BOB');

    // Clean up Bob as well so test residue never pollutes local vault
    disconnectYouTube('user_bob@example.com');
    assert.equal(getDecryptedYouTubeCredentials('user_bob@example.com'), null);
  });
});
