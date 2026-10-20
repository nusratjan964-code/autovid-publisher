import {
  discoverAndStoreFacebookPages,
  getSanitizedFacebookPages
} from '../../lib/facebookTokenManager.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // Handle GET - Return currently stored pages & active page (SANITIZED, NO TOKENS)
  if (req.method === 'GET') {
    const { pages, activePage, hasCredentials, activePageId } = getSanitizedFacebookPages();

    return res.status(200).json({
      success: true,
      hasCredentials,
      activePageId,
      activePage,
      pages,
      message: pages.length > 0 ? `Loaded ${pages.length} stored Page(s).` : 'No Facebook Pages discovered yet.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  const token = (body.token || req.headers['x-fb-token'] || '').trim();
  const { appId, appSecret } = body;

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
    const result = await discoverAndStoreFacebookPages(token, { appId, appSecret });

    if (!result.success) {
      return res.status(200).json({
        ...result,
        tokenValid: result.tokenValid !== false
      });
    }

    return res.status(200).json({
      ...result,
      tokenValid: true
    });
  } catch (err) {
    console.error('[Facebook Pages API] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      status: 'INTERNAL_ERROR',
      error: err.message,
      message: `সার্ভার ত্রুটি: ${err.message}`
    });
  }
}
