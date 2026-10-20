import {
  saveFacebookPages,
  getDecryptedPageAccessToken,
  getSanitizedFacebookPages,
  clearFacebookCredentials,
  loadVault,
  saveVault
} from './tokenStorage.js';

/**
 * Returns stored credentials state (server-side only)
 */
export function getCredentialsState() {
  return loadVault().facebook;
}

/**
 * Save user token and discovered pages with their page-specific access tokens
 * Automatically encrypts tokens at rest
 */
export function persistFacebookPages({ userToken = null, user = null, pages = [], activePageId = null }) {
  return saveFacebookPages({
    userToken,
    user,
    pages,
    activePageId
  });
}

/**
 * Set the currently active page ID
 */
export function setActivePageId(pageId) {
  const vault = loadVault();
  vault.facebook.activePageId = pageId;
  saveVault(vault);
  return getSanitizedFacebookPages();
}

/**
 * Get decrypted Page Access Token for a specific Page ID or active page (SERVER-SIDE ONLY)
 */
export function getPageAccessToken(requestedPageId = null) {
  return getDecryptedPageAccessToken(requestedPageId);
}

/**
 * Get active Page details (sanitized, NEVER leaks tokens)
 */
export function getActivePageSanitized() {
  const sanitized = getSanitizedFacebookPages();
  return sanitized.activePage;
}

/**
 * Returns discovered pages with sanitized metadata (NEVER returns raw access token)
 */
export function getSanitizedPages(includeTokens = false) {
  const sanitized = getSanitizedFacebookPages();
  return sanitized.pages.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    link: p.link,
    tokenConfigured: p.tokenConfigured,
    expiresAt: p.expiresAt,
    isPermanent: p.isPermanent,
    canPublish: p.canPublish
  }));
}

/**
 * Disconnect and remove credentials
 */
export function clearCredentials() {
  clearFacebookCredentials();
}
