import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  exchangeYouTubeAuthCode,
  refreshYouTubeAccessToken,
  getValidYouTubeAccessToken,
  getYouTubeAuthUrl,
  disconnectYouTube
} from '../lib/youtubeTokenManager.js';
import {
  saveYouTubeCredentials,
  getDecryptedYouTubeCredentials,
  getSanitizedYouTube
} from '../lib/tokenStorage.js';

describe('YouTubeTokenManager — Server-Side OAuth & Lifecycle', () => {
  const originalFetch = globalThis.fetch;
  const originalEnvClientId = process.env.GOOGLE_CLIENT_ID;
  const originalEnvSecret = process.env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test_google_client_id_123.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'GOCSPX_test_secret_456';
    disconnectYouTube();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_CLIENT_ID = originalEnvClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalEnvSecret;
    disconnectYouTube();
  });

  test('getYouTubeAuthUrl generates valid URL with offline access and prompt=consent', () => {
    const url = getYouTubeAuthUrl({ redirectUri: 'postmessage', prompt: 'consent' });

    assert.equal(url.includes('access_type=offline'), true);
    assert.equal(url.includes('prompt=consent'), true);
    assert.equal(url.includes('include_granted_scopes=true'), true);
    assert.equal(url.includes('response_type=code'), true);
    assert.equal(url.includes('youtube.upload'), true);
    assert.equal(url.includes('youtube.readonly'), true);
  });

  test('exchangeYouTubeAuthCode successfully exchanges code and persists refresh token', async () => {
    // Mock Google token exchange and YouTube channel lookup
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'ya29.mock_new_access_token',
            refresh_token: '1//04mock_refresh_token',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/youtube.upload'
          })
        };
      }
      if (urlStr.includes('youtube/v3/channels')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'UC_MOCK_CHANNEL',
                snippet: {
                  title: 'Chiku bd Animation',
                  customUrl: '@chikubd_mock',
                  thumbnails: { default: { url: 'https://example.com/avatar.jpg' } }
                },
                statistics: { subscriberCount: '15000' }
              }
            ]
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const result = await exchangeYouTubeAuthCode({
      code: '4/0mock_auth_code_xyz',
      redirectUri: 'postmessage'
    });

    assert.equal(result.success, true);
    assert.equal(result.channel.id, 'UC_MOCK_CHANNEL');
    assert.equal(result.channel.title, 'Chiku bd Animation');

    // Verify stored state
    const stored = getDecryptedYouTubeCredentials();
    assert.equal(stored.accessToken, 'ya29.mock_new_access_token');
    assert.equal(stored.refreshToken, '1//04mock_refresh_token');

    // Sanitized output must not contain tokens
    assert.equal(result.sanitized.accessToken, undefined);
    assert.equal(result.sanitized.refreshToken, undefined);
    assert.equal(result.sanitized.tokenConfigured, true);
  });

  test('getValidYouTubeAccessToken automatically executes pre-flight refresh when token is expired', async () => {
    // Seed an expired token in vault
    saveYouTubeCredentials({
      channelId: 'UC_EXPIRED',
      channelTitle: 'Expired Channel',
      accessToken: 'ya29.expired_token_123',
      refreshToken: '1//04valid_refresh_token_789',
      expiresInSeconds: -10 // expired 10 seconds ago
    });

    let refreshEndpointCalled = false;
    globalThis.fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        refreshEndpointCalled = true;
        return {
          ok: true,
          json: async () => ({
            access_token: 'ya29.refreshed_access_token_999',
            expires_in: 3600
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const validToken = await getValidYouTubeAccessToken();

    assert.equal(refreshEndpointCalled, true);
    assert.equal(validToken, 'ya29.refreshed_access_token_999');

    // Confirm updated in persistent store
    const updated = getDecryptedYouTubeCredentials();
    assert.equal(updated.accessToken, 'ya29.refreshed_access_token_999');
  });

  test('concurrent refresh calls are deduplicated to prevent race conditions', async () => {
    saveYouTubeCredentials({
      channelId: 'UC_CONCURRENT',
      channelTitle: 'Concurrent Channel',
      accessToken: 'ya29.expired_token',
      refreshToken: '1//04valid_refresh_token',
      expiresInSeconds: -50 // expired
    });

    let tokenRefreshCallCount = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        tokenRefreshCallCount++;
        // Simulate network delay
        await new Promise(r => setTimeout(r, 20));
        return {
          ok: true,
          json: async () => ({
            access_token: 'ya29.deduplicated_token',
            expires_in: 3600
          })
        };
      }
      return { ok: false, status: 404 };
    };

    // Fire 5 concurrent requests simultaneously
    const results = await Promise.all([
      getValidYouTubeAccessToken(),
      getValidYouTubeAccessToken(),
      getValidYouTubeAccessToken(),
      getValidYouTubeAccessToken(),
      getValidYouTubeAccessToken()
    ]);

    // All 5 must receive the fresh token
    for (const token of results) {
      assert.equal(token, 'ya29.deduplicated_token');
    }

    // Crucially: Exactly ONE HTTP request must have been made to Google!
    assert.equal(tokenRefreshCallCount, 1);
  });

  test('handles Google invalid_grant and Testing Mode 7-day expiration with actionable error', async () => {
    saveYouTubeCredentials({
      channelId: 'UC_REVOKED',
      channelTitle: 'Revoked Channel',
      accessToken: 'ya29.expired',
      refreshToken: '1//04expired_refresh_token',
      expiresInSeconds: -100
    });

    globalThis.fetch = async (url) => {
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.'
          })
        };
      }
      return { ok: false, status: 404 };
    };

    await assert.rejects(
      async () => {
        await getValidYouTubeAccessToken();
      },
      (err) => {
        assert.equal(err.message.includes('YOUTUBE_RECONNECT_REQUIRED'), true);
        assert.equal(err.message.includes('Testing Mode 7-day limit'), true);
        return true;
      }
    );

    const status = getSanitizedYouTube();
    assert.equal(status.status, 'RECONNECT_REQUIRED');
    assert.equal(status.lastError.type, 'INVALID_GRANT_EXPIRED');
  });

  test('handles missing refresh token gracefully', async () => {
    saveYouTubeCredentials({
      channelId: 'UC_NO_REFRESH',
      channelTitle: 'No Refresh Channel',
      accessToken: 'ya29.expired_no_refresh',
      refreshToken: null,
      expiresInSeconds: -20
    });

    await assert.rejects(
      async () => {
        await getValidYouTubeAccessToken();
      },
      (err) => {
        assert.equal(err.message.includes('YOUTUBE_RECONNECT_REQUIRED'), true);
        return true;
      }
    );
  });
});
