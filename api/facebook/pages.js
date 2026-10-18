import {
  persistFacebookPages,
  getSanitizedPages,
  getActivePageSanitized,
  getPageAccessToken
} from './credentials.js';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
      message: 'Facebook Access Token অনুপস্থিত। অনুগ্রহ করে Meta Graph Explorer থেকে একটি Access Token দিন।'
    });
  }

  try {
    // 1. Inspect Token with Meta debug_token (minimal check)
    let debugInfo = null;
    try {
      const debugRes = await fetch(`${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
      const debugJson = await debugRes.json();
      if (debugJson.data) {
        debugInfo = debugJson.data;
      }
    } catch (e) {
      console.warn('[Facebook Discovery] debug_token notice:', e.message);
    }

    if (debugInfo && debugInfo.is_valid === false) {
      const err = debugInfo.error || {};
      const isExpired = err.code === 190 || err.subcode === 463 || (debugInfo.expires_at && debugInfo.expires_at < Date.now() / 1000);
      return res.status(200).json({
        success: false,
        status: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        tokenValid: false,
        pages: [],
        errorCode: err.code || 190,
        errorSubcode: err.subcode || null,
        error: err.message || 'Token is invalid or expired',
        message: isExpired
          ? 'Facebook Access Token-এর মেয়াদ শেষ হয়ে গেছে (Expired - Code 190)। অনুগ্রহ করে Graph API Explorer থেকে নতুন টোকেন নিন।'
          : `Facebook Access Token অকার্যকর (${err.message || 'Invalid Token'})। অনুগ্রহ করে সঠিক টোকেন দিন।`
      });
    }

    const scopes = Array.isArray(debugInfo?.scopes) ? debugInfo.scopes : [];
    const requiredScopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'publish_video'];
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s));

    // 2. Query /me with minimal supported field set (only id,name)
    let meData = null;
    let meError = null;

    try {
      const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
      meData = await meRes.json();
      if (!meRes.ok || meData.error) {
        meError = meData.error;
        meData = null;
      }
    } catch (e) {
      console.warn('[Facebook Discovery] /me network error:', e.message);
    }

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
          ? 'Facebook Access Token expired (Code 190)। অনুগ্রহ করে নতুন টোকেন জেনারেট করুন।'
          : `Facebook API ত্রুটি (${meError.code}): ${meError.message}`
      });
    }

    // 3. Check if token is already a PAGE Token (from debug_token or direct Page query)
    const isExplicitPageToken = debugInfo?.type === 'PAGE';

    if (isExplicitPageToken && meData?.id) {
      // Query Page details with supported fields: id,name,category,link
      let pageCategory = 'Facebook Business Page';
      let pageLink = `https://facebook.com/${meData.id}`;
      try {
        const pageRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(meData.id)}?fields=id,name,category,link&access_token=${encodeURIComponent(token)}`);
        const pData = await pageRes.json();
        if (pageRes.ok && pData.id) {
          pageCategory = pData.category || pageCategory;
          pageLink = pData.link || pageLink;
        }
      } catch (e) {}

      const pageItem = {
        id: meData.id,
        name: meData.name,
        category: pageCategory,
        access_token: token,
        link: pageLink
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
          link: pageItem.link,
          canPublish: true
        }],
        selectedPageId: pageItem.id,
        selectedPageName: pageItem.name,
        scopes,
        missingScopes,
        message: `✅ Facebook Page "${pageItem.name}" (ID: ${pageItem.id}) সরাসরি Page Access Token দ্বারা সফলভাবে শনাক্ত ও প্রস্তুত হয়েছে!`
      });
    }

    // 4. Try USER Access Token Flow: /me/accounts with minimal fields: id,name,access_token,category
    let accountsData = null;
    let accountsError = null;

    try {
      const accountsRes = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(token)}`);
      accountsData = await accountsRes.json();
      if (!accountsRes.ok || accountsData.error) {
        accountsError = accountsData.error;
        accountsData = null;
      }
    } catch (e) {
      console.warn('[Facebook Discovery] /me/accounts network error:', e.message);
    }

    // If /me/accounts succeeded and returned pages, this is a valid User Access Token
    if (accountsData && Array.isArray(accountsData.data) && accountsData.data.length > 0) {
      const userProfile = {
        id: meData?.id,
        name: meData?.name
      };

      persistFacebookPages({
        userToken: token,
        user: userProfile,
        pages: accountsData.data
      });

      const sanitizedPages = getSanitizedPages();
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
        selectedPageToken: selectedPage.accessToken || '',
        scopes,
        missingScopes,
        message: `🎉 ${sanitizedPages.length}টি Facebook Page পাওয়া গেছে! লক্ষ্য পেজ: "${selectedPage.name}" (ID: ${selectedPage.id})।`
      });
    }

    // If /me/accounts returned an error, check if the token is actually a Page Access Token
    // (In Graph API, calling /me/accounts with a Page token fails because a Page has no accounts edge)
    if (accountsError && meData?.id) {
      try {
        const pageCheckRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(meData.id)}?fields=id,name,category,link&access_token=${encodeURIComponent(token)}`);
        const pageCheckData = await pageCheckRes.json();
        if (pageCheckRes.ok && pageCheckData.id) {
          // This token is indeed a Page Access Token!
          const pageItem = {
            id: pageCheckData.id,
            name: pageCheckData.name || meData.name,
            category: pageCheckData.category || 'Facebook Business Page',
            access_token: token,
            link: pageCheckData.link || `https://facebook.com/${pageCheckData.id}`
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
              link: pageItem.link,
              accessToken: pageItem.access_token,
              canPublish: true
            }],
            selectedPageId: pageItem.id,
            selectedPageName: pageItem.name,
            selectedPageToken: pageItem.access_token,
            scopes,
            missingScopes,
            message: `✅ Facebook Page "${pageItem.name}" (ID: ${pageItem.id}) Page Access Token হিসেবে সরাসরি শনাক্ত ও প্রস্তুত হয়েছে!`
          });
        }
      } catch (e) {}

      // If page check also failed, return the /me/accounts error
      const isExpired = accountsError.code === 190 || accountsError.error_subcode === 463;
      return res.status(200).json({
        success: false,
        status: isExpired ? 'TOKEN_EXPIRED' : 'PAGE_DISCOVERY_ERROR',
        tokenValid: !isExpired,
        userName: meData?.name,
        userId: meData?.id,
        pages: [],
        errorCode: accountsError.code,
        errorSubcode: accountsError.error_subcode,
        error: accountsError.message,
        message: isExpired
          ? 'Facebook Access Token expired (Code 190)। অনুগ্রহ করে নতুন টোকেন জেনারেট করুন।'
          : `Facebook Page তালিকা প্রাপ্তিতে ত্রুটি (${accountsError.code}): ${accountsError.message}`
      });
    }

    // If /me/accounts returned empty array
    const userProfile = {
      id: meData?.id,
      name: meData?.name
    };

    return res.status(200).json({
      success: false,
      status: 'NO_PAGES_FOUND',
      tokenValid: true,
      userName: userProfile.name,
      userId: userProfile.id,
      pages: [],
      scopes,
      missingScopes,
      message: `ব্যবহারকারী "${userProfile.name}" (User ID: ${userProfile.id})-এর কোনো পরিচালিত Facebook Page পাওয়া যায়নি।\n\nসম্ভাব্য কারণ:\n1. টোকেন তৈরি করার সময় "pages_show_list" পারমিশন সিলেক্ট করা হয়নি।\n2. এই ফেসবুক অ্যাকাউন্টে 'Chiku bd' পেজের Admin অথবা Task এক্সেস নেই।\n3. মেটা অ্যাপ Development মোডে থাকলে এই ফেসবুক একাউন্টটি Meta App-এর Roles (Roles -> Testers/Developers) তালিকায় যুক্ত থাকতে হবে।`
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
