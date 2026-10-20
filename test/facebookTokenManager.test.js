import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverAndStoreFacebookPages,
  validateFacebookConnection,
  exchangeForLongLivedUserToken,
  inspectToken
} from '../lib/facebookTokenManager.js';
import {
  clearFacebookCredentials,
  getDecryptedPageAccessToken,
  getSanitizedFacebookPages
} from '../lib/tokenStorage.js';

describe('FacebookTokenManager — Meta Graph API & Token Lifecycle', () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FB_APP_ID;
  const originalAppSecret = process.env.FB_APP_SECRET;

  beforeEach(() => {
    process.env.FB_APP_ID = '1234567890_mock_app';
    process.env.FB_APP_SECRET = 'mock_fb_secret_abc123';
    clearFacebookCredentials();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.FB_APP_ID = originalAppId;
    process.env.FB_APP_SECRET = originalAppSecret;
    clearFacebookCredentials();
  });

  test('exchangeForLongLivedUserToken exchanges short-lived user token for 60-day token', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('grant_type=fb_exchange_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'EAAMockLongLivedUserToken60Days',
            token_type: 'bearer',
            expires_in: 5184000 // 60 days
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const result = await exchangeForLongLivedUserToken('EAAShortLivedUserToken');
    assert.equal(result.isLongLived, true);
    assert.equal(result.accessToken, 'EAAMockLongLivedUserToken60Days');
    assert.equal(result.expiresIn, 5184000);
  });

  test('discoverAndStoreFacebookPages discovers pages and stores permanent Page token', async () => {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);

      // 1. debug_token
      if (urlStr.includes('/debug_token')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              is_valid: true,
              type: 'USER',
              app_id: '1234567890_mock_app',
              user_id: 'user_456',
              expires_at: 1799999999,
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'publish_video']
            }
          })
        };
      }

      // 2. long-lived exchange
      if (urlStr.includes('grant_type=fb_exchange_token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'EAALongLivedUserToken',
            expires_in: 5184000
          })
        };
      }

      // 3. /me identity
      if (urlStr.includes('/me?fields=')) {
        return {
          ok: true,
          json: async () => ({
            id: 'user_456',
            name: 'Md Nahid'
          })
        };
      }

      // 4. /me/accounts
      if (urlStr.includes('/me/accounts')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: '1309863422219233',
                name: 'Chiku bd',
                category: 'Digital creator',
                link: 'https://facebook.com/1309863422219233',
                access_token: 'EAAPageAccessTokenForChikuBd'
              }
            ]
          })
        };
      }

      return { ok: false, status: 404 };
    };

    const result = await discoverAndStoreFacebookPages('EAAShortUserToken');

    assert.equal(result.success, true);
    assert.equal(result.tokenType, 'USER');
    assert.equal(result.isLongLived, true);
    assert.equal(result.pages.length, 1);
    assert.equal(result.selectedPageId, '1309863422219233');
    assert.equal(result.selectedPageName, 'Chiku bd');

    // Crucially: Sanitized response MUST NOT contain raw tokens!
    assert.equal(result.pages[0].accessToken, undefined);
    assert.equal(result.pages[0].tokenConfigured, true);

    // Stored token must be securely accessible server-side
    const storedPageToken = getDecryptedPageAccessToken('1309863422219233');
    assert.equal(storedPageToken, 'EAAPageAccessTokenForChikuBd');
  });

  test('handles expired Facebook token (Code 190, Subcode 463) gracefully', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/debug_token')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              is_valid: false,
              error: {
                code: 190,
                subcode: 463,
                message: 'Error validating access token: Session has expired on Monday, 19-Oct-26.'
              }
            }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const result = await discoverAndStoreFacebookPages('EAAExpiredToken');

    assert.equal(result.success, false);
    assert.equal(result.status, 'TOKEN_EXPIRED');
    assert.equal(result.errorCode, 190);
    assert.equal(result.errorSubcode, 463);
    assert.equal(result.message.includes('expired'), true);
  });

  test('validateFacebookConnection detects missing required publishing permissions', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/debug_token')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              is_valid: true,
              type: 'USER',
              // Missing 'publish_video' and 'pages_manage_posts'
              scopes: ['email', 'public_profile']
            }
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const status = await validateFacebookConnection('page_123', 'EAAMockTokenMissingPerms');

    assert.equal(status.connected, true);
    assert.equal(status.canPublish, false);
    assert.equal(status.missingScopes.includes('pages_manage_posts'), true);
    assert.equal(status.missingScopes.includes('publish_video'), true);
  });
});
