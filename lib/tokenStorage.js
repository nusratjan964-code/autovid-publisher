import fs from 'fs';
import path from 'path';
import os from 'os';
import { encryptText, decryptText, isEncrypted, redactCredentials } from './cryptoVault.js';

// Primary vault file location
// In production Vercel serverless, writes go to /tmp/autovid_credentials_vault.json
// In local development, writes go to project root .credentials_vault.json (ignored by git)
const VAULT_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'autovid_credentials_vault.json')
  : path.join(process.cwd(), '.credentials_vault.json');

// Legacy unencrypted cache file (for automatic migration)
const LEGACY_CACHE_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'autovid_fb_credentials.json')
  : path.join(process.cwd(), '.credentials_cache.json');

// In-memory cache to minimize disk I/O in serverless execution
let memoryCache = null;

/**
 * Returns empty initial state with multi-user isolation
 */
function getDefaultState() {
  return {
    version: 2,
    migratedAt: new Date().toISOString(),
    youtube: null,
    facebook: {
      activePageId: null,
      userTokenEncrypted: null,
      user: null,
      pages: {}
    },
    users: {}, // userKey => { youtube, facebook } for multi-tenant isolation
    updatedAt: new Date().toISOString()
  };
}

/**
 * Resolves user-partitioned storage scope to guarantee multi-user credential isolation
 */
export function resolveUserScope(vault, userKey = 'default') {
  const key = (userKey || 'default').trim().toLowerCase();
  if (key === 'default') {
    return {
      get youtube() { return vault.youtube; },
      set youtube(v) { vault.youtube = v; },
      get facebook() { return vault.facebook; },
      set facebook(v) { vault.facebook = v; }
    };
  }

  if (!vault.users) vault.users = {};
  if (!vault.users[key]) {
    vault.users[key] = {
      youtube: null,
      facebook: {
        activePageId: null,
        userTokenEncrypted: null,
        user: null,
        pages: {}
      }
    };
  }
  return vault.users[key];
}

/**
 * Automatically migrates legacy unencrypted .credentials_cache.json to encrypted vault
 */
function tryMigrateLegacy(targetState) {
  try {
    if (fs.existsSync(LEGACY_CACHE_FILE)) {
      const legacyRaw = fs.readFileSync(LEGACY_CACHE_FILE, 'utf8');
      const legacy = JSON.parse(legacyRaw);

      let migrated = false;

      // Migrate Facebook pages
      if (legacy.pages && typeof legacy.pages === 'object') {
        for (const [pageId, p] of Object.entries(legacy.pages)) {
          if (!targetState.facebook.pages[pageId] && p) {
            const rawToken = p.accessToken || p.access_token || '';
            targetState.facebook.pages[pageId] = {
              id: p.id || pageId,
              name: p.name || 'Facebook Page',
              category: p.category || 'Digital creator',
              accessTokenEncrypted: rawToken ? (isEncrypted(rawToken) ? rawToken : encryptText(rawToken)) : null,
              link: p.link || `https://facebook.com/${pageId}`,
              expiresAt: null,
              isPermanent: false,
              updatedAt: p.updatedAt || new Date().toISOString()
            };
            migrated = true;
          }
        }
      }

      if (legacy.activePageId && !targetState.facebook.activePageId) {
        targetState.facebook.activePageId = legacy.activePageId;
        migrated = true;
      }

      // Migrate YouTube if available
      if (legacy.youtube && !targetState.youtube) {
        const rawAccess = legacy.youtube.accessToken || '';
        const rawRefresh = legacy.youtube.refreshToken || '';
        targetState.youtube = {
          channelId: legacy.youtube.channelId || null,
          channelTitle: legacy.youtube.channelTitle || 'YouTube Channel',
          customUrl: legacy.youtube.customUrl || '',
          avatar: legacy.youtube.avatar || '',
          accessTokenEncrypted: rawAccess ? (isEncrypted(rawAccess) ? rawAccess : encryptText(rawAccess)) : null,
          refreshTokenEncrypted: rawRefresh ? (isEncrypted(rawRefresh) ? rawRefresh : encryptText(rawRefresh)) : null,
          expiresAt: legacy.youtube.expiresAt || null,
          updatedAt: legacy.youtube.updatedAt || new Date().toISOString(),
          status: rawRefresh ? 'CONNECTED' : 'EXPIRED'
        };
        migrated = true;
      }

      if (migrated) {
        console.log('[TokenStorage] Successfully migrated legacy credentials to encrypted vault format.');
      }
    }
  } catch (err) {
    console.warn('[TokenStorage] Migration notice:', err.message);
  }
}

/**
 * Loads vault state from disk or memory
 */
export function loadVault() {
  if (memoryCache) {
    return memoryCache;
  }

  let state = getDefaultState();

  try {
    if (fs.existsSync(VAULT_FILE)) {
      const raw = fs.readFileSync(VAULT_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
      if (!state.facebook) state.facebook = getDefaultState().facebook;
      if (!state.facebook.pages) state.facebook.pages = {};
      if (!state.users) state.users = {};
    } else {
      // First run: attempt migration from legacy cache
      tryMigrateLegacy(state);
      saveVault(state);
    }
  } catch (err) {
    console.warn('[TokenStorage] Failed to read vault file, initializing clean state:', err.message);
    tryMigrateLegacy(state);
  }

  memoryCache = state;
  return state;
}

/**
 * Atomically writes vault state to disk
 */
export function saveVault(data) {
  try {
    data.updatedAt = new Date().toISOString();
    memoryCache = data;

    const tmpPath = `${VAULT_FILE}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
    const serialized = JSON.stringify(data, null, 2);

    try {
      fs.writeFileSync(tmpPath, serialized, 'utf8');
      fs.renameSync(tmpPath, VAULT_FILE);
    } catch (renameErr) {
      // Windows file lock / EPERM fallback: write directly to VAULT_FILE
      fs.writeFileSync(VAULT_FILE, serialized, 'utf8');
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[TokenStorage] Failed writing vault file:', err.message);
  }
}

// ==================== YOUTUBE PERSISTENCE ====================

/**
 * Securely stores YouTube credentials partitioned by userKey
 */
export function saveYouTubeCredentials({
  userKey = 'default',
  channelId,
  channelTitle,
  customUrl,
  avatar,
  accessToken,
  refreshToken,
  clientId,
  clientSecret,
  expiresInSeconds,
  scope,
  status = 'CONNECTED'
}) {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  const existing = scopeObj.youtube || {};

  // Preserve existing refresh token if not returned by Google in re-auth
  let refreshTokenEncrypted = existing.refreshTokenEncrypted || null;
  if (refreshToken) {
    refreshTokenEncrypted = isEncrypted(refreshToken) ? refreshToken : encryptText(refreshToken);
  }

  let accessTokenEncrypted = existing.accessTokenEncrypted || null;
  if (accessToken) {
    accessTokenEncrypted = isEncrypted(accessToken) ? accessToken : encryptText(accessToken);
  }

  let clientSecretEncrypted = existing.clientSecretEncrypted || null;
  if (clientSecret) {
    clientSecretEncrypted = isEncrypted(clientSecret) ? clientSecret : encryptText(clientSecret);
  }

  let expiresAt = existing.expiresAt;
  if (typeof expiresInSeconds === 'number') {
    expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  }

  scopeObj.youtube = {
    channelId: channelId || existing.channelId || null,
    channelTitle: channelTitle || existing.channelTitle || 'YouTube Creator',
    customUrl: customUrl || existing.customUrl || '',
    avatar: avatar || existing.avatar || '',
    clientId: clientId || existing.clientId || null,
    clientSecretEncrypted,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    expiresAt,
    scope: scope || existing.scope || 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    status,
    lastError: null,
    lastRefreshedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveVault(vault);
  return getSanitizedYouTube(userKey);
}

/**
 * Updates YouTube access token after refresh
 */
export function updateYouTubeAccessToken(newAccessToken, expiresInSeconds, newRefreshToken = null, userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  if (!scopeObj.youtube) return null;

  scopeObj.youtube.accessTokenEncrypted = encryptText(newAccessToken);
  if (expiresInSeconds) {
    scopeObj.youtube.expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  }
  if (newRefreshToken) {
    scopeObj.youtube.refreshTokenEncrypted = encryptText(newRefreshToken);
  }
  scopeObj.youtube.status = 'CONNECTED';
  scopeObj.youtube.lastError = null;
  scopeObj.youtube.lastRefreshedAt = new Date().toISOString();
  scopeObj.youtube.updatedAt = new Date().toISOString();

  saveVault(vault);
  return getSanitizedYouTube(userKey);
}

/**
 * Records YouTube error (e.g. invalid_grant, testing mode expired)
 */
export function recordYouTubeError(errorType, message, userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  if (scopeObj.youtube) {
    scopeObj.youtube.status = 'RECONNECT_REQUIRED';
    scopeObj.youtube.lastError = {
      type: errorType,
      message,
      occurredAt: new Date().toISOString()
    };
    saveVault(vault);
  }
}

/**
 * Retrieves raw decrypted YouTube credentials (SERVER-SIDE ONLY)
 */
export function getDecryptedYouTubeCredentials(userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  const yt = scopeObj.youtube;
  if (!yt) return null;

  try {
    const accessToken = yt.accessTokenEncrypted ? decryptText(yt.accessTokenEncrypted) : null;
    const refreshToken = yt.refreshTokenEncrypted ? decryptText(yt.refreshTokenEncrypted) : null;
    const clientSecret = yt.clientSecretEncrypted ? decryptText(yt.clientSecretEncrypted) : null;

    return {
      channelId: yt.channelId,
      channelTitle: yt.channelTitle,
      customUrl: yt.customUrl,
      avatar: yt.avatar,
      clientId: yt.clientId || null,
      clientSecret,
      accessToken,
      refreshToken,
      expiresAt: yt.expiresAt,
      status: yt.status,
      scope: yt.scope,
      lastError: yt.lastError,
      lastRefreshedAt: yt.lastRefreshedAt
    };
  } catch (err) {
    console.error('[TokenStorage] Error decrypting YouTube credentials:', err.message);
    return null;
  }
}

/**
 * Returns sanitized YouTube status (SAFE TO RETURN TO CLIENT)
 */
export function getSanitizedYouTube(userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  const yt = scopeObj.youtube;
  if (!yt) {
    return {
      connected: false,
      status: 'NOT_CONNECTED',
      channel: null,
      expiresAt: null,
      hasRefreshToken: false,
      tokenConfigured: false
    };
  }

  const hasRefresh = !!yt.refreshTokenEncrypted;
  const isExpired = yt.expiresAt ? new Date(yt.expiresAt) <= new Date() : false;

  return {
    connected: yt.status === 'CONNECTED' && hasRefresh && !isExpired,
    status: yt.status || 'CONNECTED',
    channel: {
      id: yt.channelId,
      title: yt.channelTitle,
      customUrl: yt.customUrl,
      avatar: yt.avatar
    },
    expiresAt: yt.expiresAt,
    isExpired,
    hasRefreshToken: hasRefresh,
    tokenConfigured: !!yt.accessTokenEncrypted,
    lastError: yt.lastError,
    lastRefreshedAt: yt.lastRefreshedAt
  };
}

/**
 * Disconnects and securely removes YouTube credentials for specific user
 */
export function disconnectYouTube(userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  scopeObj.youtube = null;
  saveVault(vault);
}

// ==================== FACEBOOK PERSISTENCE ====================

/**
 * Securely stores Facebook Page credentials partitioned by userKey
 */
export function saveFacebookPages({
  userKey = 'default',
  pages = [],
  activePageId = null,
  userToken = null,
  user = null
}) {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);

  if (user) scopeObj.facebook.user = user;
  if (userToken) {
    scopeObj.facebook.userTokenEncrypted = isEncrypted(userToken) ? userToken : encryptText(userToken);
  }

  pages.forEach(p => {
    const rawToken = p.access_token || p.accessToken || '';
    const existing = scopeObj.facebook.pages[p.id] || {};

    scopeObj.facebook.pages[p.id] = {
      id: p.id,
      name: p.name,
      category: p.category || existing.category || 'Facebook Business Page',
      link: p.link || existing.link || `https://facebook.com/${p.id}`,
      accessTokenEncrypted: rawToken ? (isEncrypted(rawToken) ? rawToken : encryptText(rawToken)) : (existing.accessTokenEncrypted || null),
      expiresAt: p.expiresAt !== undefined ? p.expiresAt : (existing.expiresAt || null),
      isPermanent: p.isPermanent !== undefined ? p.isPermanent : (existing.isPermanent || false),
      scopes: p.scopes || existing.scopes || [],
      canPublish: p.canPublish !== undefined ? p.canPublish : true,
      updatedAt: new Date().toISOString()
    };
  });

  if (activePageId) {
    scopeObj.facebook.activePageId = activePageId;
  } else if (!scopeObj.facebook.activePageId && pages.length > 0) {
    const chiku = pages.find(p => (p.name || '').toLowerCase().includes('chiku'));
    scopeObj.facebook.activePageId = chiku ? chiku.id : pages[0].id;
  }

  saveVault(vault);
  return getSanitizedFacebookPages(userKey);
}

/**
 * Retrieves decrypted Page Access Token for publishing (SERVER-SIDE ONLY)
 */
export function getDecryptedPageAccessToken(pageId = null, userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  const targetId = pageId || scopeObj.facebook.activePageId || process.env.FB_PAGE_ID;

  if (targetId && scopeObj.facebook.pages[targetId]?.accessTokenEncrypted) {
    try {
      return decryptText(scopeObj.facebook.pages[targetId].accessTokenEncrypted);
    } catch (err) {
      console.error('[TokenStorage] Error decrypting FB page token:', err.message);
    }
  }

  // Fallback to FB_PAGE_ACCESS_TOKEN environment variable if configured
  if (process.env.FB_PAGE_ACCESS_TOKEN) {
    return process.env.FB_PAGE_ACCESS_TOKEN.trim();
  }

  return null;
}

/**
 * Returns sanitized Facebook pages list (SAFE TO RETURN TO CLIENT)
 */
export function getSanitizedFacebookPages(userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  const pagesList = Object.values(scopeObj.facebook.pages).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    link: p.link,
    tokenConfigured: !!p.accessTokenEncrypted,
    expiresAt: p.expiresAt,
    isPermanent: p.isPermanent,
    canPublish: p.canPublish,
    scopes: p.scopes || []
  }));

  const activePageId = scopeObj.facebook.activePageId || process.env.FB_PAGE_ID;
  const activePage = pagesList.find(p => p.id === activePageId) || pagesList[0] || null;

  return {
    pages: pagesList,
    activePageId: activePage?.id || null,
    activePage,
    hasCredentials: pagesList.some(p => p.tokenConfigured) || !!process.env.FB_PAGE_ACCESS_TOKEN
  };
}

/**
 * Disconnects and removes stored Facebook credentials for specific user
 */
export function clearFacebookCredentials(userKey = 'default') {
  const vault = loadVault();
  const scopeObj = resolveUserScope(vault, userKey);
  scopeObj.facebook = {
    activePageId: null,
    userTokenEncrypted: null,
    user: null,
    pages: {}
  };
  saveVault(vault);
}
