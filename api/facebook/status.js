import {
  getPageAccessToken,
  getActivePageSanitized
} from './credentials.js';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Clean Page identifier / URL / handle
 */
function cleanPageId(raw) {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '');
  str = str.replace(/\/$/, '');
  str = str.replace(/^@/, '');
  const idMatch = str.match(/id=(\d+)/);
  if (idMatch) return idMatch[1];
  return str.split('?')[0].split('#')[0].trim();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const queryOrBody = req.method === 'POST' ? (req.body || {}) : req.query;
  const activePage = getActivePageSanitized();
  const rawPageId = queryOrBody.pageId || activePage?.pageId || process.env.FB_PAGE_ID || '';
  const pageId = cleanPageId(rawPageId);
  const token = (queryOrBody.token || req.headers['x-fb-token'] || getPageAccessToken(pageId) || '').trim();

  // If no token at all
  if (!token) {
    return res.status(200).json({
      success: true,
      connected: false,
      status: 'MISSING_TOKEN',
      pageId: pageId || null,
      pageName: activePage?.pageName || null,
      tokenValid: false,
      canPost: false,
      message: 'Facebook Access Token অনুপস্থিত। অনুগ্রহ করে Page Discovery টুল দিয়ে পেজ কানেক্ট করুন।'
    });
  }

  try {
    // 1. Inspect Token with Meta debug_token
    let debugInfo = null;
    try {
      const debugRes = await fetch(`${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
      const debugJson = await debugRes.json();
      if (debugJson.data) {
        debugInfo = debugJson.data;
      }
    } catch (e) {
      console.warn('[Facebook Status] debug_token notice:', e.message);
    }

    if (debugInfo && debugInfo.is_valid === false) {
      const err = debugInfo.error || {};
      const isExpired = err.code === 190 || err.subcode === 463;
      return res.status(200).json({
        success: false,
        connected: false,
        status: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        pageId,
        tokenValid: false,
        canPost: false,
        errorCode: err.code || 190,
        errorSubcode: err.subcode || null,
        error: err.message || 'Token is invalid or expired',
        message: isExpired
          ? 'Facebook Access Token-এর মেয়াদ শেষ (Code 190, Subcode 463)। অনুগ্রহ করে নতুন টোকেন জেনারেট করুন।'
          : `Facebook Token অকার্যকর: ${err.message}`
      });
    }

    // 2. Query /me with minimal supported fields (id,name,category,link)
    let meData = null;
    try {
      const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name,category,link&access_token=${encodeURIComponent(token)}`);
      meData = await meRes.json();
      if (!meRes.ok) meData = null;
    } catch (e) {}

    // Check if token belongs directly to a Page
    const isDirectPageToken = debugInfo?.type === 'PAGE' || !!meData?.category;

    let targetPageId = pageId;
    let pageData = null;

    if (isDirectPageToken && meData?.id) {
      pageData = meData;
      targetPageId = meData.id;
    } else if (targetPageId) {
      // Query specific Page with the token using supported fields
      const pageRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(targetPageId)}?fields=id,name,category,link&access_token=${encodeURIComponent(token)}`);
      const pData = await pageRes.json();

      if (pageRes.ok && pData.id) {
        pageData = pData;
      } else if (pData.error) {
        const err = pData.error;

        // If the query failed because targetPageId was actually a User ID (Error Code 100, Subcode 33)
        if (err.code === 100 && err.error_subcode === 33) {
          return res.status(200).json({
            success: false,
            connected: false,
            status: 'USER_ID_PROVIDED',
            pageId: targetPageId,
            tokenValid: true,
            canPost: false,
            errorCode: 100,
            errorSubcode: 33,
            error: err.message,
            message: `আইডি '${targetPageId}' কোনো Facebook Page নয় (বা User Profile ID)। অনুগ্রহ করে Page Discovery ব্যবহার করে আপনার কাঙ্ক্ষিত পেজ (যেমন 'Chiku bd') নির্বাচন করুন।`
          });
        }

        const isExpired = err.code === 190 || err.error_subcode === 463;
        return res.status(200).json({
          success: false,
          connected: false,
          status: isExpired ? 'TOKEN_EXPIRED' : 'AUTH_ERROR',
          pageId: targetPageId,
          tokenValid: !isExpired,
          canPost: false,
          errorCode: err.code || null,
          errorSubcode: err.error_subcode || null,
          error: err.message || 'Failed to authenticate Page',
          message: isExpired
            ? 'Facebook Access Token expired (Code 190)। অনুগ্রহ করে নতুন টোকেন নিন।'
            : `Facebook API ত্রুটি (${err.code}): ${err.message}`
        });
      }
    } else {
      return res.status(200).json({
        success: false,
        connected: false,
        status: 'PAGE_NOT_SPECIFIED',
        tokenValid: true,
        canPost: false,
        message: 'কোনো Facebook Page নির্বাচন করা হয়নি। অনুগ্রহ করে Page Discovery ব্যবহার করে আপনার পেজটি নির্বাচন করুন।'
      });
    }

    if (!pageData) {
      return res.status(200).json({
        success: false,
        connected: false,
        status: 'PAGE_NOT_FOUND',
        pageId: targetPageId,
        tokenValid: true,
        canPost: false,
        message: `Facebook Page (ID: ${targetPageId}) যাচাই করা সম্ভব হয়নি। সঠিক Page ID অথবা Discovery তালিকা থেকে নির্বাচন করুন।`
      });
    }

    // Check permissions/scopes
    const scopes = Array.isArray(debugInfo?.scopes) ? debugInfo.scopes : [];
    const requiredScopes = ['pages_manage_posts', 'publish_video'];
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s));
    const tokenType = debugInfo?.type || (pageData.category ? 'PAGE' : 'USER');

    const canPost = tokenType === 'PAGE' || missingScopes.length === 0;

    return res.status(200).json({
      success: true,
      connected: true,
      status: 'VERIFIED',
      pageId: pageData.id || targetPageId,
      pageName: pageData.name || 'Facebook Page',
      pageLink: pageData.link || `https://facebook.com/${targetPageId}`,
      tokenValid: true,
      tokenType,
      expiresAt: debugInfo?.expires_at ? new Date(debugInfo.expires_at * 1000).toISOString() : 'Permanent (Page Token)',
      scopes,
      missingScopes,
      canPost,
      message: `✅ Facebook Page "${pageData.name}" (ID: ${pageData.id}) সফলভাবে যাচাইকৃত ও প্রস্তুত!`
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      connected: false,
      status: 'NETWORK_ERROR',
      error: err.message,
      message: `Meta Graph API সার্ভারের সাথে যোগাযোগ করা যায়নি: ${err.message}`
    });
  }
}
