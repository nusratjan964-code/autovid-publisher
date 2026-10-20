import './envLoader.js';
import { saveEnvVariable } from './envLoader.js';
import {
  saveFacebookPages,
  getDecryptedPageAccessToken,
  getSanitizedFacebookPages,
  clearFacebookCredentials
} from './tokenStorage.js';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Resolves Meta App credentials from server-only environment variables
 */
export function getMetaAppCredentials() {
  const appId = (process.env.FB_APP_ID || process.env.VITE_FB_APP_ID || '').trim();
  const appSecret = (process.env.FB_APP_SECRET || process.env.VITE_FB_APP_SECRET || '').trim();

  return { appId, appSecret };
}

/**
 * Exchanges a short-lived User Access Token for a long-lived User Access Token (~60 days)
 * Supported Meta endpoint: GET /oauth/access_token?grant_type=fb_exchange_token
 */
export async function exchangeForLongLivedUserToken(shortLivedToken) {
  const { appId, appSecret } = getMetaAppCredentials();

  if (!appId || !appSecret) {
    console.warn('[FacebookOAuth] FB_APP_ID or FB_APP_SECRET not configured. Proceeding with provided token without 60-day exchange.');
    return { accessToken: shortLivedToken, isLongLived: false, expiresIn: null };
  }

  try {
    const exchangeUrl = `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;

    const res = await fetch(exchangeUrl);
    const data = await res.json();

    if (res.ok && data.access_token) {
      console.log(`[FacebookOAuth] Successfully exchanged short-lived token for long-lived User Token (expires in ${data.expires_in || '60 days'})`);
      return {
        accessToken: data.access_token,
        isLongLived: true,
        expiresIn: data.expires_in || 5184000 // 60 days in seconds
      };
    } else {
      console.warn('[FacebookOAuth] Exchange endpoint response:', data.error?.message || data);
      return { accessToken: shortLivedToken, isLongLived: false, error: data.error?.message };
    }
  } catch (err) {
    console.warn('[FacebookOAuth] Long-lived exchange failed:', err.message);
    return { accessToken: shortLivedToken, isLongLived: false, error: err.message };
  }
}

/**
 * Inspects any Meta access token using /debug_token
 */
export async function inspectToken(token) {
  if (!token) {
    return { isValid: false, error: 'Token is empty' };
  }

  try {
    const debugUrl = `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(debugUrl);
    const json = await res.json();

    if (json.data) {
      const d = json.data;
      const isExpired = d.is_valid === false && (d.error?.code === 190 || d.error?.subcode === 463 || (d.expires_at && d.expires_at < Date.now() / 1000));

      return {
        isValid: d.is_valid === true,
        isExpired,
        type: d.type || (d.profile_id ? 'PAGE' : 'USER'),
        appId: d.app_id,
        userId: d.user_id,
        profileId: d.profile_id,
        expiresAtUnix: d.expires_at || 0,
        // Meta convention: expires_at === 0 represents a token that does not expire (such as Page Tokens from long-lived user tokens)
        isPermanent: d.expires_at === 0,
        expiresAtIso: d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000).toISOString() : (d.expires_at === 0 ? 'Never (Permanent Page Token)' : null),
        scopes: Array.isArray(d.scopes) ? d.scopes : [],
        error: d.error || null
      };
    }
  } catch (err) {
    console.warn('[FacebookOAuth] debug_token inspection failed:', err.message);
  }

  return { isValid: null, type: 'UNKNOWN', scopes: [] };
}

/**
 * Discovers Facebook Pages, exchanges token for long-lived credentials, and stores them securely
 */
export async function discoverAndStoreFacebookPages(inputToken, options = {}) {
  if (!inputToken || typeof inputToken !== 'string') {
    throw new Error('TOKEN_REQUIRED: Facebook Access Token is required.');
  }

  // Persist App ID / Secret if passed dynamically
  if (options.appId && options.appSecret) {
    saveEnvVariable('FB_APP_ID', options.appId.trim());
    saveEnvVariable('FB_APP_SECRET', options.appSecret.trim());
  }

  const cleanToken = inputToken.trim();

  // 1. Inspect the provided token
  const debugInfo = await inspectToken(cleanToken);

  if (debugInfo.isValid === false) {
    const err = debugInfo.error || {};
    const isExpired = debugInfo.isExpired || err.code === 190 || err.subcode === 463;
    return {
      success: false,
      status: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      tokenValid: false,
      errorCode: err.code || 190,
      errorSubcode: err.subcode || null,
      message: isExpired
        ? 'Facebook Access Token expired (Code 190). Please generate a new token from Graph API Explorer or reconnect.'
        : `Facebook Access Token invalid: ${err.message || 'Invalid OAuth Token'}`
    };
  }

  // 2. Query /me to get basic identity
  let meData = null;
  try {
    const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name,category,link&access_token=${encodeURIComponent(cleanToken)}`);
    meData = await meRes.json();
    if (!meRes.ok) meData = null;
  } catch (e) {}

  // 3. Scenario A: Provided token is ALREADY a Page Access Token
  const isDirectPageToken = debugInfo.type === 'PAGE' || !!meData?.category;

  if (isDirectPageToken && meData?.id) {
    console.log(`[FacebookOAuth] Detected direct Page Access Token for Page "${meData.name}" (${meData.id})`);

    const pageItem = {
      id: meData.id,
      name: meData.name || 'Facebook Page',
      category: meData.category || 'Facebook Business Page',
      link: meData.link || `https://facebook.com/${meData.id}`,
      access_token: cleanToken,
      expiresAt: debugInfo.expiresAtIso,
      isPermanent: debugInfo.isPermanent,
      scopes: debugInfo.scopes,
      canPublish: true
    };

    saveFacebookPages({
      pages: [pageItem],
      activePageId: pageItem.id
    });

    return {
      success: true,
      tokenType: 'PAGE',
      tokenValid: true,
      pages: [{
        id: pageItem.id,
        name: pageItem.name,
        category: pageItem.category,
        link: pageItem.link,
        expiresAt: pageItem.expiresAt,
        isPermanent: pageItem.isPermanent,
        tokenConfigured: true,
        canPublish: true
      }],
      selectedPageId: pageItem.id,
      selectedPageName: pageItem.name,
      scopes: debugInfo.scopes,
      message: `✅ Facebook Page "${pageItem.name}" (ID: ${pageItem.id}) directly linked with Page Access Token!`
    };
  }

  // 4. Scenario B: Provided token is a USER Access Token
  // Step B1: Upgrade to Long-Lived User Token if App ID & Secret are available
  const exchangeResult = await exchangeForLongLivedUserToken(cleanToken);
  const effectiveUserToken = exchangeResult.accessToken;

  // Step B2: Query /me/accounts using the effective User Token
  let accountsData = null;
  let accountsError = null;

  try {
    const accountsRes = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,category,link,tasks,perms&access_token=${encodeURIComponent(effectiveUserToken)}`);
    accountsData = await accountsRes.json();
    if (!accountsRes.ok || accountsData.error) {
      accountsError = accountsData.error;
      accountsData = null;
    }
  } catch (e) {
    accountsError = { message: e.message };
  }

  if (accountsData && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
    const discoveredPages = [];

    for (const rawPage of accountsData.data) {
      // Validate Page Access Token obtained from /me/accounts
      let pageExpiresAt = 'Never (Permanent with Long-Lived User Token)';
      let isPermanent = true;

      if (rawPage.access_token) {
        const pageDebug = await inspectToken(rawPage.access_token);
        if (pageDebug.isValid) {
          pageExpiresAt = pageDebug.expiresAtIso || pageExpiresAt;
          isPermanent = pageDebug.isPermanent;
        }
      }

      discoveredPages.push({
        id: rawPage.id,
        name: rawPage.name,
        category: rawPage.category || 'Digital creator',
        link: rawPage.link || `https://facebook.com/${rawPage.id}`,
        access_token: rawPage.access_token,
        expiresAt: pageExpiresAt,
        isPermanent,
        scopes: debugInfo.scopes,
        canPublish: true
      });
    }

    // Persist to encrypted server vault
    saveFacebookPages({
      userToken: effectiveUserToken,
      user: { id: meData?.id, name: meData?.name },
      pages: discoveredPages
    });

    // Auto-select "Chiku bd" if present
    const chiku = discoveredPages.find(p => (p.name || '').toLowerCase().includes('chiku'));
    const selectedPage = chiku || discoveredPages[0];

    return {
      success: true,
      tokenType: 'USER',
      isLongLived: exchangeResult.isLongLived,
      tokenValid: true,
      userName: meData?.name,
      userId: meData?.id,
      pages: discoveredPages.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        link: p.link,
        expiresAt: p.expiresAt,
        isPermanent: p.isPermanent,
        tokenConfigured: true,
        canPublish: true
      })),
      selectedPageId: selectedPage.id,
      selectedPageName: selectedPage.name,
      scopes: debugInfo.scopes,
      message: `🎉 Discovered ${discoveredPages.length} Facebook Page(s). Target: "${selectedPage.name}" (ID: ${selectedPage.id}).`
    };
  }

  // If no pages were returned or error occurred
  if (accountsError) {
    const isExpired = accountsError.code === 190 || accountsError.error_subcode === 463;
    return {
      success: false,
      status: isExpired ? 'TOKEN_EXPIRED' : 'ACCOUNTS_QUERY_FAILED',
      tokenValid: !isExpired,
      errorCode: accountsError.code,
      errorSubcode: accountsError.error_subcode,
      message: isExpired
        ? 'Facebook Access Token expired (Code 190). Please generate a fresh token.'
        : `Failed to retrieve Facebook Pages (${accountsError.code}): ${accountsError.message}`
    };
  }

  return {
    success: false,
    status: 'NO_PAGES_FOUND',
    tokenValid: true,
    message: `No Facebook Pages managed by user "${meData?.name || 'User'}". Ensure "pages_show_list" and "pages_manage_posts" permissions are granted.`
  };
}

/**
 * Validates active Facebook Page connection and token status
 */
export async function validateFacebookConnection(pageId = null, overrideToken = null) {
  const token = overrideToken || getDecryptedPageAccessToken(pageId);

  if (!token) {
    return {
      connected: false,
      status: 'MISSING_TOKEN',
      message: 'Facebook Page Access Token missing. Re-authorization required.'
    };
  }

  const debug = await inspectToken(token);
  if (debug.isValid === false) {
    const isExpired = debug.isExpired;
    return {
      connected: false,
      status: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      errorCode: debug.error?.code || 190,
      message: isExpired
        ? 'Facebook Access Token expired (Code 190). Please click Reconnect.'
        : `Facebook Token invalid: ${debug.error?.message || 'Invalid Token'}`
    };
  }

  const requiredScopes = ['pages_manage_posts', 'publish_video'];
  const missingScopes = requiredScopes.filter(s => !debug.scopes.includes(s));

  return {
    connected: true,
    status: 'VERIFIED',
    tokenType: debug.type,
    expiresAt: debug.expiresAtIso,
    isPermanent: debug.isPermanent,
    scopes: debug.scopes,
    missingScopes,
    canPublish: debug.type === 'PAGE' || missingScopes.length === 0,
    message: 'Facebook Page Token is valid and ready for publishing.'
  };
}

export {
  getDecryptedPageAccessToken,
  getSanitizedFacebookPages,
  clearFacebookCredentials
};
