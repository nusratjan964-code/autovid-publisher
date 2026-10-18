import { getPageAccessToken, getActivePageSanitized } from './credentials.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { pageId: rawPageId, token: directToken } = req.body || {};
  const activePage = getActivePageSanitized();
  const pageId = rawPageId || activePage?.pageId || process.env.FB_PAGE_ID;

  if (!pageId) {
    return res.status(400).json({
      success: false,
      error: 'No Facebook Page selected. Please connect a Page first in Social Media tab.'
    });
  }

  const token = (directToken || req.headers['x-fb-token'] || getPageAccessToken(pageId) || '').trim();

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Facebook Page Access Token missing for this Page. Please reconnect the Page in Social Media tab.'
    });
  }

  return res.status(200).json({
    success: true,
    pageId,
    token
  });
}
