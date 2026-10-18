import {
  persistFacebookPages,
  getSanitizedPages,
  getActivePageSanitized,
  getPageAccessToken,
  getCredentialsState
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

  // Handle GET - Return currently stored pages & active page
  if (req.method === 'GET') {
    const pages = getSanitizedPages();
    const activePage = getActivePageSanitized();
    return res.status(200).json({
      success: true,
      hasCredentials: pages.length > 0 || !!process.env.FB_PAGE_ACCESS_TOKEN,
      activePage,
      pages,
      message: pages.length > 0 ? `Loaded ${pages.length} stored Page(s).` : 'No Facebook Pages discovered yet.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  let token = (body.token || req.headers['x-fb-token'] || getPageAccessToken() || '').trim();

  if (!token) {
    return res.status(400).json({
      success: false,
      status: 'MISSING_TOKEN',
      tokenValid: false,
      pages: [],
      error: 'Token is required',
      message: 'Facebook Access Token অনুপস্থিত। অনুগ্রহ করে Meta Graph Explorer থেকে একটি User বা Page Access Token দিন।'
    });
  }

  try {
    // 1. Inspect Token with debug_token (Meta Official Endpoint)
    let debugInfo = null;
    try {
      const debugRes = await fetch(`${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
      const debugJson = await debugRes.json();
      if (debugJson.data) {
        debugInfo = debugJson.data;
      } else if (debugJson.error) {
        console.warn('[Facebook Discovery] debug_token notice:', debugJson.error.message);
      }
    } catch (e) {
      console.warn('[Facebook Discovery] debug_token query network error:', e.message);
    }

    // Check if token is explicitly invalid according to debug_token
    if (debugInfo && debugInfo.is_valid === false) {
      const err = debugInfo.error || {};
      const isExpired = err.code === 190 || err.subcode === 463 || debugInfo.expires_at < Date.now() / 1000;
      return res.status(200).json({
        success: false,
        status: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        tokenValid: false,
        pages: [],
        errorCode: err.code || 190,
        errorSubcode: err.subcode || null,
        error: err.message || 'Token is invalid or expired',
        message: isExpired
          ? 'Facebook Access Token-এর মেয়াদ শেষ হয়ে গেছে (Expired - Code 190)। অনুগ্রহ করে Meta Graph Explorer থেকে নতুন টোকেন নিন।'
          : `Facebook Access Token অকার্যকর (${err.message || 'Invalid Token'})। অনুগ্রহ করে সঠিক টোকেন নিশ্চিত করুন।`
      });
    }

    const scopes = Array.isArray(debugInfo?.scopes) ? debugInfo.scopes : [];
    const requiredScopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'publish_video'];
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s));

    // 2. Query /me to determine authenticated identity (User or Page)
    let meData = null;
    let meError = null;

    try {
      const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name,category,tasks,is_published,link&access_token=${encodeURIComponent(token)}`);
      meData = await meRes.json();
      if (!meRes.ok || meData.error) {
        meError = meData.error;
        meData = null;
      }
    } catch (e) {
      console.warn('[Facebook Discovery] /me network error:', e.message);
    }

    // Handle /me errors (such as expired or invalid token)
    if (meError) {
      const isExpired = meError.code === 190 || meError.error_subcode === 463;
      return res.status(200).json({
        success: false,
        status: isExpired ? 'TOKEN_EXPIRED' : 'AUTH_ERROR',
        tokenValid: false,
        pages: [],
        errorCode: meError.code,
        errorSubcode: meError.error_subcode,
        error: meError.message,
        message: isExpired
          ? 'Facebook Access Token expired (Code 190)। অনুগ্রহ করে Meta Graph Explorer থেকে নতুন টোকেন জেনারেট করুন।'
          : `Facebook API ত্রুটি (${meError.code}): ${meError.message}`
      });
    }

    // 3. CASE A: Token is ALREADY a Page Access Token
    const isPageToken = debugInfo?.type === 'PAGE' || !!meData?.category || !!meData?.tasks;

    if (isPageToken && meData) {
      const pageItem = {
        id: meData.id,
        name: meData.name,
        category: meData.category || 'Facebook Page',
        tasks: meData.tasks || ['CREATE_CONTENT', 'MANAGE'],
        access_token: token,
        link: meData.link || `https://facebook.com/${meData.id}`,
        is_published: meData.is_published ?? true
      };

      persistFacebookPages({
        userToken: null,
        user: null,
        pages: [pageItem],
        activePageId: pageItem.id
      });

      return res.status(200).json({
        success: true,
        tokenType: 'PAGE',
        tokenValid: true,
        pages: [{
          id: pageItem.id,
          name: pageItem.name,
          category: pageItem.category,
          tasks: pageItem.tasks,
          link: pageItem.link,
          isPublished: pageItem.is_published,
          canPublish: true
        }],
        selectedPageId: pageItem.id,
        selectedPageName: pageItem.name,
        scopes,
        missingScopes,
        message: `✅ Facebook Page "${pageItem.name}" (ID: ${pageItem.id}) সরাসরি Page Access Token দ্বারা সফলভাবে শনাক্ত হয়েছে!`
      });
    }

    // 4. CASE B: Token is a USER Access Token -> Discover Pages using /me/accounts
    const userProfile = {
      id: meData?.id,
      name: meData?.name
    };

    let accountsData = null;
    let accountsError = null;

    try {
      const accountsRes = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,category,tasks,access_token,link,is_published&access_token=${encodeURIComponent(token)}`);
      accountsData = await accountsRes.json();
      if (!accountsRes.ok || accountsData.error) {
        accountsError = accountsData.error;
        accountsData = null;
      }
    } catch (e) {
      return res.status(500).json({
        success: false,
        status: 'NETWORK_ERROR',
        tokenValid: false,
        pages: [],
        error: e.message,
        message: `Meta Graph API-এর সাথে যোগাযোগ ব্যাহত হয়েছে: ${e.message}`
      });
    }

    if (accountsError) {
      return res.status(200).json({
        success: false,
        status: 'PAGE_DISCOVERY_ERROR',
        tokenValid: true,
        userName: userProfile.name,
        userId: userProfile.id,
        pages: [],
        errorCode: accountsError.code,
        errorSubcode: accountsError.error_subcode,
        error: accountsError.message,
        message: `Facebook Page তালিকা প্রাপ্তিতে ত্রুটি (${accountsError.code}): ${accountsError.message}`
      });
    }

    const rawPages = Array.isArray(accountsData?.data) ? accountsData.data : [];

    if (rawPages.length === 0) {
      return res.status(200).json({
        success: false,
        status: 'NO_PAGES_FOUND',
        tokenValid: true,
        userName: userProfile.name,
        userId: userProfile.id,
        pages: [],
        scopes,
        missingScopes,
        message: `ব্যবহারকারী "${userProfile.name}" (User ID: ${userProfile.id})-এর কোনো পরিচালিত Facebook Page পাওয়া যায়নি।\n\nসম্ভাব্য কারণ:\n1. টোকেনে "pages_show_list" পারমিশন অনুমোদিত নেই।\n2. ফেসবুক একাউন্টে Page-এর Admin বা Content Creator এক্সেস নেই।\n3. মেটা অ্যাপ Development মোডে থাকলে এই ফেসবুক আইডিটি অ্যাপের Roles (Testers/Developers) তালিকায় যুক্ত থাকতে হবে।`
      });
    }

    // Persist discovered pages with their Page Access Tokens securely on the server
    persistFacebookPages({
      userToken: token,
      user: userProfile,
      pages: rawPages
    });

    const sanitizedPages = getSanitizedPages();

    // Auto-detect "Chiku bd" if present
    const chiku = sanitizedPages.find(p => (p.name || '').toLowerCase().includes('chiku'));
    const selectedPage = chiku || sanitizedPages[0];

    return res.status(200).json({
      success: true,
      tokenType: 'USER',
      tokenValid: true,
      userName: userProfile.name,
      userId: userProfile.id,
      pages: sanitizedPages,
      selectedPageId: selectedPage.id,
      selectedPageName: selectedPage.name,
      scopes,
      missingScopes,
      message: `🎉 ${sanitizedPages.length}টি Facebook Page পাওয়া গেছে! লক্ষ্য পেজ: "${selectedPage.name}" (ID: ${selectedPage.id})।`
    });

  } catch (err) {
    console.error('[Facebook Discovery] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      status: 'INTERNAL_ERROR',
      error: err.message,
      message: `সার্ভার ত্রুটি: ${err.message}`
    });
  }
}
