import { isIdempotencyKeyProcessed, updateQueueItem } from '../queue.js';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

/**
 * Converts Google Drive links or video URLs to direct downloadable media links
 */
function resolveDirectMediaUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  // Extract fileId from Google Drive URLs
  const driveMatch = str.match(/\/d\/([a-zA-Z0-9_-]+)/) || str.match(/id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return str;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const {
    pageId: rawPageId,
    message,
    caption,
    title,
    postType = 'auto', // 'auto' | 'text' | 'video' | 'photo'
    videoUrl,
    imageUrl,
    idempotencyKey,
    itemId,
    token: requestToken
  } = req.body || {};

  const pageId = cleanPageId(rawPageId || process.env.FB_PAGE_ID || '1309863422219233');
  const postText = (message || caption || '').trim();
  const token = (requestToken || req.headers['x-fb-token'] || process.env.FB_PAGE_ACCESS_TOKEN || '').trim();

  // 1. Idempotency Check (Prevent duplicate posts)
  if (idempotencyKey) {
    const existingResult = isIdempotencyKeyProcessed(idempotencyKey);
    if (existingResult) {
      console.log(`[Facebook Publish] Idempotency match: Duplicate post prevented for key="${idempotencyKey}"`);
      return res.status(200).json({
        success: true,
        status: 'Published',
        duplicatePrevented: true,
        postId: existingResult.postId,
        postUrl: existingResult.postUrl,
        publishedAt: existingResult.publishedAt,
        message: 'Post was already published previously (duplicate prevented).'
      });
    }
  }

  // 2. Validate token
  if (!token) {
    if (itemId) {
      updateQueueItem(itemId, { status: 'Failed', error: 'Facebook Page Access Token missing' });
    }
    return res.status(400).json({
      success: false,
      status: 'Failed',
      error: 'Facebook Page Access Token missing',
      message: 'Facebook Page Access Token অনুপস্থিত। অনুগ্রহ করে Social Media ট্যাবে একটি বৈধ Page Access Token দিন।'
    });
  }

  // 3. Mark as Processing in queue if itemId exists
  if (itemId) {
    updateQueueItem(itemId, { status: 'Processing' });
  }

  // 4. Determine media type
  let effectiveType = postType;
  const directVideoUrl = resolveDirectMediaUrl(videoUrl);

  if (effectiveType === 'auto') {
    if (directVideoUrl && (directVideoUrl.startsWith('http://') || directVideoUrl.startsWith('https://'))) {
      effectiveType = 'video';
    } else if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      effectiveType = 'photo';
    } else {
      effectiveType = 'text';
    }
  }

  try {
    let endpoint = '';
    const formData = new URLSearchParams();
    formData.append('access_token', token);

    if (effectiveType === 'text') {
      if (!postText) {
        throw new Error('পোস্ট ক্যাপশন বা টেক্সট খালি রাখা যাবে না।');
      }
      endpoint = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`;
      formData.append('message', postText);
    } else if (effectiveType === 'video') {
      endpoint = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/videos`;
      if (postText) formData.append('description', postText);
      if (title) formData.append('title', title);
      if (directVideoUrl) formData.append('file_url', directVideoUrl);
    } else if (effectiveType === 'photo') {
      endpoint = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`;
      if (postText) formData.append('caption', postText);
      if (imageUrl) formData.append('url', imageUrl);
    }

    console.log(`[Facebook Publish] Dispatching ${effectiveType} post to Page ID: ${pageId}...`);

    const graphRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const graphData = await graphRes.json();

    if (!graphRes.ok || graphData.error) {
      const fbErr = graphData.error || {};
      const isExpired = fbErr.code === 190 || fbErr.error_subcode === 463;
      const errorMsg = fbErr.message || 'Unknown error occurred while publishing to Facebook';

      console.error(`[Facebook Publish] Error from Meta Graph API (Code ${fbErr.code}): ${errorMsg}`);

      if (itemId) {
        updateQueueItem(itemId, {
          status: 'Failed',
          error: errorMsg,
          errorCode: fbErr.code
        });
      }

      return res.status(graphRes.status || 400).json({
        success: false,
        status: 'Failed',
        errorCode: fbErr.code,
        errorSubcode: fbErr.error_subcode,
        error: errorMsg,
        message: isExpired
          ? 'Facebook Page Access Token expired (Code 190)। অনুগ্রহ করে Meta Graph Explorer থেকে pages_manage_posts সহ নতুন টোকেন নিন।'
          : `Facebook Graph API ত্রুটি (${fbErr.code}): ${errorMsg}`
      });
    }

    const postId = graphData.id || graphData.post_id;
    const postUrl = `https://www.facebook.com/${postId.includes('_') ? postId : `${pageId}_${postId}`}`;

    console.log(`[Facebook Publish] Successfully published to Facebook! Post ID: ${postId}`);

    if (itemId) {
      updateQueueItem(itemId, {
        status: 'Published',
        postId,
        postUrl,
        publishedAt: new Date().toISOString(),
        error: null
      });
    }

    return res.status(200).json({
      success: true,
      status: 'Published',
      postId,
      postUrl,
      publishedAt: new Date().toISOString(),
      message: `🎉 Facebook Page-এ সফলভাবে পোস্ট প্রকাশিত হয়েছে!`
    });

  } catch (err) {
    console.error(`[Facebook Publish] Publishing exception:`, err.message);

    if (itemId) {
      updateQueueItem(itemId, {
        status: 'Failed',
        error: err.message
      });
    }

    return res.status(500).json({
      success: false,
      status: 'Failed',
      error: err.message,
      message: `Publishing failed: ${err.message}`
    });
  }
}
