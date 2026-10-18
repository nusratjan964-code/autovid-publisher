import { getPageAccessToken, getActivePageSanitized } from '../../lib/facebookCredentials.js';

const GRAPH_VERSION = 'v21.0';
 
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const query = req.query || {};
  const activePage = getActivePageSanitized();
  const pageId = (query.pageId || activePage?.pageId || process.env.FB_PAGE_ID || '').trim();
  const providedToken = (query.token || req.headers['x-fb-token'] || getPageAccessToken(pageId) || '').trim();

  if (!pageId) {
    return res.status(400).json({
      success: false,
      error: 'FACEBOOK_PAGE_MISSING',
      message: 'Facebook Page ID পাওয়া যায়নি। অনুগ্রহ করে Social Media ট্যাব থেকে পেজ সিলেক্ট করুন।'
    });
  }

  if (!providedToken) {
    return res.status(400).json({
      success: false,
      error: 'FACEBOOK_TOKEN_REQUIRED',
      message: 'Facebook Page Access Token অনুপস্থিত। অনুগ্রহ করে নতুন টোকেন প্রদান করুন।'
    });
  }

  let videoBuffer = req.rawBuffer;
  if (!videoBuffer) {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        videoBuffer = Buffer.concat(chunks);
      }
    } catch (e) {
      console.warn('[UploadVideo] Stream chunk read error:', e.message);
    }
  }

  if (!videoBuffer || videoBuffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VIDEO_BINARY_REQUIRED',
      message: 'ভিডিও ফাইলের বাইনারি ডেটা পাওয়া যায়নি।'
    });
  }

  // Auto-resolve Page Access Token if User Access Token was passed
  let effectiveToken = providedToken;
  try {
    const pageCheckRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(providedToken)}`);
    const pageCheckData = await pageCheckRes.json();
    if (pageCheckRes.ok && pageCheckData.access_token) {
      effectiveToken = pageCheckData.access_token;
    } else {
      const accRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${encodeURIComponent(providedToken)}`);
      if (accRes.ok) {
        const accData = await accRes.json();
        const found = (accData.data || []).find(p => String(p.id) === String(pageId));
        if (found && found.access_token) {
          effectiveToken = found.access_token;
        }
      }
    }
  } catch (e) {
    console.warn('[UploadVideo] Page token check note:', e.message);
  }

  try {
    console.log(`[Facebook Video Upload] Streaming ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB video to Page ${pageId}...`);

    const fbRes = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/videos?access_token=${encodeURIComponent(effectiveToken)}`, {
      method: 'POST',
      headers: {
        'content-type': req.headers['content-type'] || 'multipart/form-data',
        'content-length': String(videoBuffer.length)
      },
      body: videoBuffer
    });

    const fbData = await fbRes.json();

    if (!fbRes.ok || fbData.error) {
      const fbErr = fbData.error || {};
      console.error('[Facebook Video Upload] Meta Error:', fbErr);

      let isExpired = fbErr.code === 190 || fbErr.error_subcode === 463;
      let errMsg = fbErr.message || 'Facebook Graph API video upload failed';

      if (isExpired) {
        return res.status(401).json({
          success: false,
          error: 'FACEBOOK_TOKEN_EXPIRED',
          message: 'Facebook Page Access Token expired (Code 190)। নতুন টোকেন প্রদান করুন।',
          details: fbErr
        });
      }

      return res.status(fbRes.status || 400).json({
        success: false,
        error: errMsg,
        code: fbErr.code,
        message: `Facebook Video আপলোড ব্যর্থ (${fbErr.code}): ${errMsg}`,
        details: fbErr
      });
    }

    const videoId = fbData.id;
    const postUrl = `https://www.facebook.com/${pageId}/videos/${videoId}`;

    console.log(`[Facebook Video Upload] Success! Video ID: ${videoId}, URL: ${postUrl}`);

    return res.status(200).json({
      success: true,
      videoId,
      postUrl,
      message: '🎉 Facebook Page-এ আসল ভিডিও সফলভাবে আপলোড হয়েছে!'
    });

  } catch (err) {
    console.error('[Facebook Video Upload] Exception:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      message: `ভিডিও আপলোড প্রক্রিয়াকরণে ত্রুটি: ${err.message}`
    });
  }
}
