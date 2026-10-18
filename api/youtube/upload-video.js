// Server-side YouTube Shorts Resumable Upload Relay
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const query = req.query || {};
  const token = (query.token || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();
  const title = (query.title || 'YouTube Short').trim();
  const description = (query.description || '').trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'YOUTUBE_TOKEN_REQUIRED',
      message: 'YouTube/Google Access Token অনুপস্থিত। অনুগ্রহ করে YouTube চ্যানেল কানেক্ট করুন।'
    });
  }

  if (!req.rawBuffer || req.rawBuffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VIDEO_BINARY_REQUIRED',
      message: 'ইউটিউবে আপলোড করার জন্য ভিডিও ফাইলের বাইনারি ডেটা পাওয়া যায়নি।'
    });
  }

  const contentType = req.headers['content-type'] || 'video/mp4';
  const sizeMb = (req.rawBuffer.length / (1024 * 1024)).toFixed(2);
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
        'X-Upload-Content-Length': String(req.rawBuffer.length),
        'X-Upload-Content-Type': contentType
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      let errMsg = `YouTube upload initiation failed (HTTP ${initRes.status})`;
      try {
        const errJson = await initRes.json();
        if (errJson.error?.message) errMsg = errJson.error.message;
        if (initRes.status === 401) {
          return res.status(401).json({
            success: false,
            error: 'YOUTUBE_TOKEN_EXPIRED',
            message: 'YouTube/Google Access Token expired (401)। অনুগ্রহ করে আবার YouTube কানেক্ট করুন।',
            details: errJson
          });
        }
      } catch (e) {}

      return res.status(initRes.status || 400).json({
        success: false,
        error: errMsg,
        message: `YouTube API Error: ${errMsg}`
      });
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      return res.status(502).json({
        success: false,
        error: 'YouTube did not return upload location header'
      });
    }

    console.log(`[YouTube Shorts Upload] Session established. Streaming binary to YouTube CDN...`);

    // 2. Upload binary payload to uploadUrl
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(req.rawBuffer.length)
      },
      body: req.rawBuffer
    });

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.id) {
      const errDetail = uploadData.error?.message || `YouTube PUT failed with status ${uploadRes.status}`;
      return res.status(uploadRes.status || 400).json({
        success: false,
        error: errDetail,
        message: `YouTube ভিডিও আপলোড সম্পন্ন হয়নি: ${errDetail}`
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
