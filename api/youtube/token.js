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

function saveCache(data) {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const cache = loadCache();
    let yt = cache.youtube || null;

    if (yt?.refreshToken) {
      try {
        const clientId = process.env.VITE_GOOGLE_CLIENT_ID || cache.googleClientId || '';
        const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET || cache.googleClientSecret || '';

        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: yt.refreshToken,
            grant_type: 'refresh_token'
          }).toString()
        });

        const refreshData = await refreshRes.json();
        if (refreshRes.ok && refreshData.access_token) {
          yt.accessToken = refreshData.access_token;
          yt.updatedAt = new Date().toISOString();
          cache.youtube = yt;
          saveCache(cache);
        }
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      youtube: yt
    });
  }

  if (req.method === 'POST') {
    const { code, token: directToken, refreshToken: directRefresh } = req.body || {};
    const cache = loadCache();

    const clientId = process.env.VITE_GOOGLE_CLIENT_ID || cache.googleClientId || '';
    const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET || cache.googleClientSecret || '';

    let accessToken = (directToken || '').trim();
    let refreshToken = (directRefresh || '').trim();

    if (code) {
      try {
        console.log('[YouTube Token] Exchanging authorization code for OAuth tokens...');
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: 'postmessage',
            grant_type: 'authorization_code'
          }).toString()
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || tokenData.error) {
          console.error('[YouTube Token] Token exchange error:', tokenData);
          return res.status(400).json({
            success: false,
            error: tokenData.error_description || tokenData.error || 'Failed to exchange authorization code'
          });
        }

        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token || '';
      } catch (err) {
        console.error('[YouTube Token] Exception during code exchange:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'NO_TOKEN_PROVIDED',
        message: 'No authorization code or access token provided.'
      });
    }

    // Fetch official YouTube Channel details
    let channelData = {
      id: 'UCCOo5jxEtLRgJQukBMnt-QQ',
      title: 'chiku bd',
      customUrl: '@chikubd',
      avatar: ''
    };

    try {
      const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      if (chRes.ok) {
        const cd = await chRes.json();
        if (cd.items && cd.items.length > 0) {
          const item = cd.items[0];
          channelData = {
            id: item.id,
            title: item.snippet?.title || 'chiku bd',
            customUrl: item.snippet?.customUrl || `@${(item.snippet?.title || 'chikubd').toLowerCase().replace(/\s+/g, '')}`,
            avatar: item.snippet?.thumbnails?.default?.url || '',
            subscribers: item.statistics?.subscriberCount || '0'
          };
        }
      }
    } catch (e) {
      console.warn('[YouTube Token] Notice fetching channel profile:', e.message);
    }

    // Save into server credentials cache
    const currentCache = loadCache();
    currentCache.youtube = {
      channelId: channelData.id,
      channelTitle: channelData.title,
      customUrl: channelData.customUrl,
      avatar: channelData.avatar,
      accessToken,
      refreshToken: refreshToken || currentCache.youtube?.refreshToken || '',
      updatedAt: new Date().toISOString()
    };
    saveCache(currentCache);

    console.log('[YouTube Token] Saved YouTube credentials for channel:', channelData.title, `(${channelData.id})`);

    return res.status(200).json({
      success: true,
      accessToken,
      channel: channelData
    });
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
