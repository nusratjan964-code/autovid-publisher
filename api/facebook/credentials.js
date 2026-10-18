import fs from 'fs';
import path from 'path';
import os from 'os';

// Secure server-side credential storage for Facebook Page & User tokens
// Tokens are stored in server memory / local cache and NEVER exposed to frontend responses
const CREDENTIALS_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'autovid_fb_credentials.json')
  : path.join(process.cwd(), '.credentials_cache.json');

function loadCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Credentials] Failed reading credentials cache:', err.message);
  }
  return {
    userToken: null,
    user: null,
    activePageId: null,
    pages: {} // map of pageId => { id, name, category, accessToken, link }
  };
}

function saveCredentials(data) {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Credentials] Failed saving credentials cache:', err.message);
  }
}

/**
 * Returns stored credentials
 */
export function getCredentialsState() {
  return loadCredentials();
}

/**
 * Save user token and discovered pages with their page-specific access tokens
 */
export function persistFacebookPages({ userToken = null, user = null, pages = [], activePageId = null }) {
  const state = loadCredentials();
  if (userToken) state.userToken = userToken;
  if (user) state.user = user;

  pages.forEach(p => {
    state.pages[p.id] = {
      id: p.id,
      name: p.name,
      category: p.category || 'Facebook Page',
      accessToken: p.access_token || p.accessToken || '',
      link: p.link || `https://facebook.com/${p.id}`,
      updatedAt: new Date().toISOString()
    };
  });

  if (activePageId) {
    state.activePageId = activePageId;
  } else if (!state.activePageId && pages.length > 0) {
    // If "Chiku bd" exists in pages, prioritize it as active page
    const chiku = pages.find(p => (p.name || '').toLowerCase().includes('chiku'));
    state.activePageId = chiku ? chiku.id : pages[0].id;
  }

  saveCredentials(state);
  return state;
}

/**
 * Set the currently active page ID
 */
export function setActivePageId(pageId) {
  const state = loadCredentials();
  state.activePageId = pageId;
  saveCredentials(state);
  return state;
}

/**
 * Get Page Access Token for a specific Page ID or active page
 */
export function getPageAccessToken(requestedPageId = null) {
  const state = loadCredentials();
  const pageId = requestedPageId || state.activePageId || process.env.FB_PAGE_ID;

  // 1. Check if specific page token is in server storage
  if (pageId && state.pages[pageId]?.accessToken) {
    return state.pages[pageId].accessToken;
  }

  // 2. Check environment variable FB_PAGE_ACCESS_TOKEN
  if (process.env.FB_PAGE_ACCESS_TOKEN) {
    if (!requestedPageId || !process.env.FB_PAGE_ID || process.env.FB_PAGE_ID === requestedPageId) {
      return process.env.FB_PAGE_ACCESS_TOKEN.trim();
    }
  }

  // 3. Fallback: if single page is stored and active
  if (state.activePageId && state.pages[state.activePageId]?.accessToken) {
    return state.pages[state.activePageId].accessToken;
  }

  // 4. Fallback: if user token exists and can be used
  return state.userToken || null;
}

/**
 * Get the active Page details (sanitized, NO token)
 */
export function getActivePageSanitized() {
  const state = loadCredentials();
  const pageId = state.activePageId || process.env.FB_PAGE_ID;

  if (pageId && state.pages[pageId]) {
    const page = state.pages[pageId];
    return {
      pageId: page.id,
      pageName: page.name,
      category: page.category,
      link: page.link,
      tokenConfigured: !!page.accessToken
    };
  }

  if (process.env.FB_PAGE_ID) {
    return {
      pageId: process.env.FB_PAGE_ID,
      pageName: 'Facebook Page (Env Configured)',
      tokenConfigured: !!process.env.FB_PAGE_ACCESS_TOKEN
    };
  }

  return null;
}

/**
 * Returns all discovered pages with access tokens for client authentication
 */
export function getSanitizedPages(includeTokens = true) {
  const state = loadCredentials();
  return Object.values(state.pages).map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    link: p.link,
    accessToken: includeTokens ? (p.accessToken || '') : undefined,
    canPublish: true
  }));
}

/**
 * Disconnect and remove credentials
 */
export function clearCredentials() {
  saveCredentials({
    userToken: null,
    user: null,
    activePageId: null,
    pages: {}
  });
}
