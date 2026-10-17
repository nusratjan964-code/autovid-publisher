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
  const rawPageId = queryOrBody.pageId || process.env.FB_PAGE_ID || '1309863422219233';
  let pageId = cleanPageId(rawPageId);
  const token = (queryOrBody.token || req.headers['x-fb-token'] || process.env.FB_PAGE_ACCESS_TOKEN || '').trim();

  if (!token) {
    return res.status(200).json({
      success: true,
      connected: false,
      status: 'MISSING_TOKEN',
      pageId: pageId || '1309863422219233',
      pageName: 'Chiku bd',
      tokenValid: false,
      canPost: false,
      message: 'Facebook Page Access Token অনুপস্থিত। অনুগ্রহ করে Meta Graph Explorer থেকে একটি Page Access Token দিন।'
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
      console.warn('[Facebook Status] debug_token query notice:', e.message);
    }

    // 2. Try querying /me first (Handles Page Tokens automatically)
    let pageData = null;
    let effectivePageId = pageId;

    try {
      const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name,link,is_published,tasks&access_token=${encodeURIComponent(token)}`);
      const meData = await meRes.json();
      if (meRes.ok && meData.id) {
        // If debugInfo says type is PAGE or tasks exist, this token belongs to the page
        if (debugInfo?.type === 'PAGE' || meData.tasks || meData.id === pageId) {
          pageData = meData;
          effectivePageId = meData.id;
        }
      }
    } catch (e) {}

    // 3. If pageData not resolved via /me, query specified pageId directly
    if (!pageData && pageId) {
      const pageRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id,name,link,is_published,tasks&access_token=${encodeURIComponent(token)}`);
      const pData = await pageRes.json();
      if (pageRes.ok && pData.id) {
        pageData = pData;
        effectivePageId = pData.id;
      } else if (pData.error) {
        // Check if token is user token and has managed pages
        try {
          const accountsRes = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
          const accountsData = await accountsRes.json();
          if (accountsData.data && accountsData.data.length > 0) {
            const foundPage = accountsData.data.find(p => p.id === pageId) || accountsData.data[0];
            pageData = {
              id: foundPage.id,
              name: foundPage.name,
              is_published: true
            };
            effectivePageId = foundPage.id;
          }
        } catch (e) {}

        if (!pageData) {
          const err = pData.error || {};
          const isExpired = err.code === 190 || err.error_subcode === 463;
          return res.status(200).json({
            success: false,
            connected: false,
            status: isExpired ? 'TOKEN_EXPIRED' : 'AUTH_ERROR',
            pageId,
            tokenValid: false,
            canPost: false,
            errorCode: err.code || null,
            errorSubcode: err.error_subcode || null,
            error: err.message || 'Failed to authenticate with Facebook Graph API',
            message: isExpired
              ? 'Facebook Page Access Token expired (Code 190, Subcode 463)। অনুগ্রহ করে Meta Graph Explorer থেকে নতুন Page Access Token নিন।'
              : `Facebook API ত্রুটি: ${err.message || 'অনুমতি মেলেনি'}`
          });
        }
      }
    }

    if (!pageData) {
      return res.status(200).json({
        success: false,
        connected: false,
        status: 'PAGE_NOT_FOUND',
        pageId,
        tokenValid: false,
        canPost: false,
        message: 'Facebook Page যাচাই করা সম্ভব হয়নি। অনুগ্রহ করে Page ID এবং Access Token সঠিক কিনা নিশ্চিত করুন।'
      });
    }

    // Check permissions/scopes
    const scopes = Array.isArray(debugInfo?.scopes) ? debugInfo.scopes : [];
    const requiredScopes = ['pages_manage_posts', 'publish_video'];
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s));
    const tokenType = debugInfo?.type || (pageData.tasks ? 'PAGE' : 'USER');

    return res.status(200).json({
      success: true,
      connected: true,
      status: 'VERIFIED',
      pageId: pageData.id || effectivePageId,
      pageName: pageData.name || 'Facebook Page',
      pageLink: pageData.link || `https://facebook.com/${effectivePageId}`,
      isPublished: pageData.is_published ?? true,
      tokenValid: true,
      tokenType,
      expiresAt: debugInfo?.expires_at ? new Date(debugInfo.expires_at * 1000).toISOString() : 'Permanent (Page Token)',
      scopes,
      missingScopes,
      canPost: missingScopes.length === 0 || tokenType === 'PAGE',
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
