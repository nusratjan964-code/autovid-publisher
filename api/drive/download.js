import fs from 'fs';
import path from 'path';

const CREDENTIALS_FILE = path.join(process.cwd(), '.credentials_cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const query = req.query || {};
  const fileId = (query.fileId || query.id || '').trim();
  const inputToken = (query.token || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();

  if (!fileId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'FILE_ID_REQUIRED', message: 'File ID is required.' }));
  }

  const cache = loadCache();
  const token = inputToken || cache.youtube?.accessToken || '';
  const apiKey = query.apiKey || process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || '';

  console.log(`[Drive Download Proxy] Fetching Drive file ${fileId} (Has Token: ${!!token})...`);

  // Method 1: Google Drive API v3 alt=media (For authorized requests or service)
  if (token) {
    try {
      const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const apiRes = await fetch(driveApiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (apiRes.ok) {
        const contentType = apiRes.headers.get('content-type') || 'video/mp4';
        const contentLength = apiRes.headers.get('content-length');

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Disposition', `inline; filename="drive_video_${fileId}.mp4"`);

        const arrayBuffer = await apiRes.arrayBuffer();
        return res.end(Buffer.from(arrayBuffer));
      } else {
        console.warn(`[Drive Download Proxy] API v3 alt=media returned status ${apiRes.status}`);
      }
    } catch (e) {
      console.warn('[Drive Download Proxy] Token download error, trying direct export:', e.message);
    }
  }

  // Method 2: Direct uc?export=download with Cookie / Confirmation handling
  try {
    const ucUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
    const ucRes = await fetch(ucUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      redirect: 'follow'
    });

    const contentType = ucRes.headers.get('content-type') || '';

    // If Google returned HTML, it might be a large-file virus scan warning or login page
    if (contentType.includes('text/html')) {
      const html = await ucRes.text();

      // Check for confirm token (Google Drive large file download warning)
      const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/) || html.match(/name="confirm" value="([^"]+)"/);
      if (confirmMatch) {
        const confirmToken = confirmMatch[1];
        const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmToken}`;
        const cookies = ucRes.headers.get('set-cookie') || '';

        const secondRes = await fetch(confirmUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': cookies
          },
          redirect: 'follow'
        });

        if (secondRes.ok) {
          const secondType = secondRes.headers.get('content-type') || 'video/mp4';
          const secondLength = secondRes.headers.get('content-length');

          res.statusCode = 200;
          res.setHeader('Content-Type', secondType.includes('html') ? 'video/mp4' : secondType);
          if (secondLength) res.setHeader('Content-Length', secondLength);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Disposition', `inline; filename="drive_video_${fileId}.mp4"`);

          const arrayBuffer = await secondRes.arrayBuffer();
          return res.end(Buffer.from(arrayBuffer));
        }
      }

      // If it returned Google login or access denied page
      if (html.includes('accounts.google.com') || html.includes('Sign in') || html.includes('Permission required')) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          success: false,
          error: 'ACCESS_RESTRICTED',
          message: 'Google Drive file is restricted or private. Please ensure file permission is set to "Anyone with the link can view" or connect Google Account.'
        }));
      }
    }

    if (ucRes.ok) {
      const contentLength = ucRes.headers.get('content-length');
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType || 'video/mp4');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="drive_video_${fileId}.mp4"`);

      const arrayBuffer = await ucRes.arrayBuffer();
      return res.end(Buffer.from(arrayBuffer));
    }
  } catch (err) {
    console.error('[Drive Download Proxy] Download failed:', err);
  }

  // If all failed
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    success: false,
    error: 'DOWNLOAD_FAILED',
    message: 'Could not download video from Google Drive. Please check permissions.'
  }));
}
