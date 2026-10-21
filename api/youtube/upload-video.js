// Server-side YouTube Shorts Resumable Upload Relay
import { getValidYouTubeAccessToken } from '../../lib/youtubeTokenManager.js';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Content-Length, X-Upload-Content-Type, X-Action');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const query = req.query || {};
  const directToken = (query.token || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();

  let token = (directToken && directToken !== 'server_vault_yt_token' && directToken !== 'undefined') ? directToken : '';
  if (!token) {
    try {
      token = await getValidYouTubeAccessToken();
    } catch (tokenErr) {
      console.warn('[YouTube Upload] Automated pre-flight token resolution note:', tokenErr.message);
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'YOUTUBE_TOKEN_REQUIRED',
      message: 'YouTube / Google Access Token অনুপস্থিত। অনুগ্রহ করে Google OAuth 1-Click Connect দিয়ে চ্যানেল কানেক্ট করুন।'
    });
  }

  const title = (query.title || 'YouTube Short').trim();
  const description = (query.description || '').trim();

  // Handle Resumable Upload Session Initialization (No large binary sent to Vercel!)
  const isInitSession = query.action === 'init_session' || req.headers['x-action'] === 'init_session';
  if (isInitSession) {
    const fileSize = query.size || req.headers['x-upload-content-length'] || '';
    const uploadContentType = query.contentType || req.headers['x-upload-content-type'] || 'video/mp4';

    const metadata = {
      snippet: {
        title: title.substring(0, 100),
        description: `${description}\n\n#Shorts #Viral #Trending`,
        tags: ['Shorts', 'Viral', 'YouTubeShorts', 'Trending'],
        categoryId: '22'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    };

    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const initHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': uploadContentType
    };
    if (fileSize) {
      initHeaders['X-Upload-Content-Length'] = String(fileSize);
    }
    if (origin) {
      try {
        const u = new URL(origin);
        initHeaders['Origin'] = u.origin;
      } catch (e) {
        initHeaders['Origin'] = origin;
      }
    }

    try {
      const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify(metadata)
      });

      if (initRes.ok) {
        const uploadUrl = initRes.headers.get('location');
        if (uploadUrl) {
          console.log('[YouTube Upload] Created direct Google Resumable Upload URL for client');
          return res.status(200).json({
            success: true,
            action: 'init_session',
            uploadUrl,
            title
          });
        }
      }

      // If token expired (HTTP 401), attempt automated pre-flight token refresh
      if (initRes.status === 401) {
        try {
          const freshToken = await refreshYouTubeAccessToken();
          if (freshToken && freshToken !== token) {
            initHeaders['Authorization'] = `Bearer ${freshToken}`;
            const retryRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
              method: 'POST',
              headers: initHeaders,
              body: JSON.stringify(metadata)
            });
            if (retryRes.ok) {
              const retryUrl = retryRes.headers.get('location');
              if (retryUrl) {
                console.log('[YouTube Upload] Resumable session created successfully on auto-refresh retry!');
                return res.status(200).json({
                  success: true,
                  action: 'init_session',
                  uploadUrl: retryUrl,
                  title
                });
              }
            }
          }
        } catch (rfErr) {
          console.warn('[YouTube Upload] Auto-refresh retry note:', rfErr.message);
        }
      }

      let errorData = null;
      try {
        errorData = await initRes.json();
      } catch (e) {}

      const errMsg = errorData?.error?.message || `Google Resumable Upload Session failed (HTTP ${initRes.status})`;
      console.warn(`[YouTube Upload Session] Google init returned HTTP ${initRes.status}:`, errMsg);
      return res.status(initRes.status || 400).json({
        success: false,
        error: 'YOUTUBE_UPLOAD_INIT_FAILED',
        status: initRes.status,
        message: errMsg
      });
    } catch (e) {
      console.warn('[YouTube Upload Session] Init exception:', e.message);
      return res.status(500).json({
        success: false,
        error: 'YOUTUBE_UPLOAD_EXCEPTION',
        message: e.message
      });
    }
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
      console.warn('[YouTube Upload] Stream chunk read error:', e.message);
    }
  }

  if (!videoBuffer || videoBuffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VIDEO_BUFFER_REQUIRED',
      message: 'ভিডিও ফাইলের বাইনারি ডেটা অনুপস্থিত।'
    });
  }

  const contentType = req.headers['content-type'] || 'video/mp4';
  const sizeMb = (videoBuffer.length / (1024 * 1024)).toFixed(2);
  console.log(`[YouTube Shorts Upload] Starting resumable upload for ${sizeMb} MB video ("${title}")...`);

  try {
    // 1. Initiate Resumable Upload Session
    const metadata = {
      snippet: {
        title: title.substring(0, 100),
        description: `${description}\n\n#Shorts #Viral #Trending`,
        tags: ['Shorts', 'Viral', 'YouTubeShorts', 'Trending'],
        categoryId: '22'
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    };

    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(videoBuffer.length),
        'X-Upload-Content-Type': contentType
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      let errMsg = `YouTube upload initiation failed (HTTP ${initRes.status})`;
      try {
        const errJson = await initRes.json();
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch (e) {}

      console.warn(`[YouTube Shorts Upload] Google upload initiation failed: ${errMsg}`);
      return res.status(initRes.status || 400).json({
        success: false,
        error: 'YOUTUBE_INIT_FAILED',
        message: errMsg
      });
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return res.status(500).json({
        success: false,
        error: 'MISSING_UPLOAD_URL',
        message: 'Google Did not return resumable upload URL.'
      });
    }

    console.log(`[YouTube Shorts Upload] Session established. Streaming binary to YouTube CDN...`);

    // 2. Upload binary payload to uploadUrl
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(videoBuffer.length)
      },
      body: videoBuffer
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.id) {
      const errDetail = uploadData.error?.message || `YouTube PUT returned status ${uploadRes.status}`;
      console.warn(`[YouTube Shorts Upload] Upload failed: ${errDetail}`);
      return res.status(uploadRes.status || 400).json({
        success: false,
        error: 'YOUTUBE_STREAM_FAILED',
        message: errDetail
      });
    }

    const videoId = uploadData.id;
    const postUrl = `https://www.youtube.com/shorts/${videoId}`;

    console.log(`[YouTube Shorts Upload] Success! Video ID: ${videoId}, URL: ${postUrl}`);

    return res.status(200).json({
      success: true,
      videoId,
      postUrl,
      message: '🎉 YouTube Shorts-এ আসল ভিডিও সফলভাবে আপলোড হয়েছে!'
    });

  } catch (err) {
    console.error('[YouTube Shorts Upload] Exception:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      message: `YouTube আপলোড এক্সেপশন: ${err.message}`
    });
  }
}
