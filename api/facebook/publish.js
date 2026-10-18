import { isIdempotencyKeyProcessed, updateQueueItem } from '../queue.js';
import { getPageAccessToken, getActivePageSanitized } from './credentials.js';

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

  const activePage = getActivePageSanitized();
  const pageId = cleanPageId(rawPageId || activePage?.pageId || process.env.FB_PAGE_ID || '');
  const postText = (message || caption || '').trim();
  const token = (requestToken || req.headers['x-fb-token'] || getPageAccessToken(pageId) || '').trim();

  // Validate Page ID presence
  if (!pageId) {
    if (itemId) {
      updateQueueItem(itemId, { status: 'Failed', error: 'Facebook Page ID not configured' });
    }
    return res.status(400).json({
      success: false,
      status: 'Failed',
      error: 'Facebook Page ID not configured',
      message: 'কোনো Facebook Page নির্বাচন করা হয়নি। অনুগ্রহ করে Social Media ট্যাব থেকে পেজ কানেক্ট করুন।'
    });
  }

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
        message: 'পোস্টটি ইতোমধ্যেই প্রকাশিত হয়েছে (ডুপ্লিকেট প্রতিরোধ করা হয়েছে)।'
      });
    }
  }

  // 2. Validate token presence
  if (!token) {
    if (itemId) {
      updateQueueItem(itemId, { status: 'Failed', error: 'Facebook Page Access Token missing' });
    }
    return res.status(400).json({
      success: false,
      status: 'Failed',
      error: 'Facebook Page Access Token missing',
      message: 'Facebook Page Access Token পাওয়া যায়নি। অনুগ্রহ করে Social Media ট্যাবে পেজটি পুনরায় কানেক্ট করুন।'
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
        throw new Error('পোস্ট টেক্সট বা ক্যাপশন খালি রাখা যাবে না।');
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

      console.error(`[Facebook Publish] Error from Meta Graph API (Code ${fbErr.code}, Subcode ${fbErr.error_subcode}): ${errorMsg}`);

      if (itemId) {
        updateQueueItem(itemId, {
          status: 'Failed',
          error: errorMsg,
          errorCode: fbErr.code
        });
      }

      let actionableMessage = `Facebook Graph API ত্রুটি (${fbErr.code}): ${errorMsg}`;
      if (isExpired) {
        actionableMessage = 'Facebook Page Access Token expired (Code 190)। অনুগ্রহ করে নতুন টোকেন দিয়ে পেজ কানেক্ট করুন।';
      } else if (fbErr.code === 100 && fbErr.error_subcode === 33) {
        actionableMessage = `Page ID '${pageId}' খুঁজে পাওয়া যায়নি বা এটি কোনো User Profile ID। অনুগ্রহ করে Social Media ট্যাবে সঠিক Page ID নিশ্চিত করুন।`;
      } else if (fbErr.code === 200) {
        actionableMessage = 'অনুমতির অভাব: টোকেনে pages_manage_posts অথবা publish_video অনুমতি নেই।';
      }

      return res.status(graphRes.status || 400).json({
        success: false,
        status: 'Failed',
        errorCode: fbErr.code,
        errorSubcode: fbErr.error_subcode,
        error: errorMsg,
        message: actionableMessage
      });
    }

    const postId = graphData.id || graphData.post_id;
    let postUrl = `https://www.facebook.com/${postId.includes('_') ? postId : `${pageId}_${postId}`}`;
    if (effectiveType === 'video' && graphData.id) {
      postUrl = `https://www.facebook.com/${pageId}/videos/${graphData.id}`;
    }

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
      message: `পোস্ট প্রকাশ ব্যর্থ হয়েছে: ${err.message}`
    });
  }
}
