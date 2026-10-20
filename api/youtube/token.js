import {
  exchangeYouTubeAuthCode,
  exchangeRefreshTokenForAccessToken,
  getValidYouTubeAccessToken,
  refreshYouTubeAccessToken,
  getSanitizedYouTube,
  disconnectYouTube,
  fetchChannelProfile,
  getYouTubeAuthUrl
} from '../../lib/youtubeTokenManager.js';
import { saveYouTubeCredentials } from '../../lib/tokenStorage.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // Handle GET - Return sanitized YouTube connection status & channel info
  if (req.method === 'GET') {
    try {
      // Support generating server-side OAuth authorization URL
      if (req.query.action === 'auth_url' || req.query.authUrl === '1') {
        const reqOrigin = req.headers['origin'] || (req.headers['referer'] ? new URL(req.headers['referer']).origin : 'https://autovid-publisher.vercel.app');
        const redirectUri = req.query.redirectUri || (req.query.mode === 'popup' ? 'postmessage' : reqOrigin);
        const prompt = req.query.prompt || 'consent';
        const authUrl = getYouTubeAuthUrl({ redirectUri, prompt });
        return res.status(200).json({ success: true, authUrl });
      }

      const sanitized = getSanitizedYouTube();

      // If refresh token exists and token is expired or close to expiry, trigger automatic background refresh
      if (sanitized.hasRefreshToken && (sanitized.isExpired || req.query.refresh === '1')) {
        try {
          await getValidYouTubeAccessToken();
          const refreshed = getSanitizedYouTube();
          return res.status(200).json({
            success: true,
            ...refreshed
          });
        } catch (refreshErr) {
          console.warn('[YouTube Token GET] Automated pre-flight refresh notice:', refreshErr.message);
          return res.status(200).json({
            success: true,
            ...getSanitizedYouTube(),
            warning: refreshErr.message
          });
        }
      }

      return res.status(200).json({
        success: true,
        ...sanitized
      });
    } catch (err) {
      console.error('[YouTube Token GET] Error checking token status:', err);
      return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
  }

  // Handle POST - Exchange authorization code, refresh token, or save manual token
  if (req.method === 'POST') {
    const body = req.body || {};
    const { code, redirectUri, action, token: directToken, refreshToken: explicitRefreshToken } = body;

    // Action 1: Explicit server-side refresh request
    if (action === 'refresh') {
      try {
        await refreshYouTubeAccessToken();
        const updated = getSanitizedYouTube();
        return res.status(200).json({
          success: true,
          message: 'YouTube access token refreshed successfully.',
          ...updated
        });
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
          reconnectRequired: err.message.includes('RECONNECT_REQUIRED')
        });
      }
    }

    // Action 2: OAuth 2.0 Authorization Code exchange (Offline access + Refresh token)
    if (code) {
      try {
        const result = await exchangeYouTubeAuthCode({
          code,
          redirectUri: redirectUri || 'postmessage'
        });

        return res.status(200).json({
          success: true,
          message: `Connected YouTube Channel: "${result.channel.title}"`,
          channel: result.channel,
          hasRefreshToken: true,
          isPermanent: true,
          ...result.sanitized
        });
      } catch (err) {
        console.error('[YouTube Token POST] Code exchange failed:', err.message);
        return res.status(400).json({
          success: false,
          error: err.message
        });
      }
    }

    // Action 3: Explicit or Auto-detected Refresh Token (Permanent token starting with '1//')
    const possibleRefreshToken = (explicitRefreshToken || (typeof directToken === 'string' && directToken.trim().startsWith('1//') ? directToken.trim() : null));

    if (possibleRefreshToken) {
      try {
        const result = await exchangeRefreshTokenForAccessToken(possibleRefreshToken);
        return res.status(200).json({
          success: true,
          message: `🎉 চিরস্থায়ী Refresh Token কনফিগার সম্পন্ন! চ্যানেল: "${result.channel.title}"। টোকেন প্রতি ১ ঘণ্টা পর পর সার্ভার নিজে থেকেই অটো রিনিউ করবে।`,
          channel: result.channel,
          hasRefreshToken: true,
          isPermanent: true,
          ...result.sanitized
        });
      } catch (err) {
        console.error('[YouTube Token POST] Refresh token exchange failed:', err.message);
        return res.status(400).json({
          success: false,
          error: err.message,
          message: `Refresh Token গ্রহণ করা যায়নি: ${err.message}`
        });
      }
    }

    // Action 4: Direct access token paste (ya29... fallback)
    if (directToken && typeof directToken === 'string') {
      try {
        const cleanToken = directToken.trim();
        const channel = await fetchChannelProfile(cleanToken);

        saveYouTubeCredentials({
          channelId: channel.id,
          channelTitle: channel.title,
          customUrl: channel.customUrl,
          avatar: channel.avatar,
          accessToken: cleanToken,
          refreshToken: explicitRefreshToken || null,
          expiresInSeconds: 3599
        });

        const currentStatus = getSanitizedYouTube();

        return res.status(200).json({
          success: true,
          message: currentStatus.hasRefreshToken
            ? `Linked channel "${channel.title}" with permanent Auto-Renew enabled!`
            : `Linked channel "${channel.title}" via access token (১ ঘণ্টা পর পর অটো-রিনিউ করতে Refresh Token যোগ করুন)।`,
          channel,
          ...currentStatus
        });
      } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'NO_PAYLOAD_PROVIDED',
      message: 'Please provide an authorization code, refresh token, or access token.'
    });
  }

  // Handle DELETE - Disconnect YouTube account
  if (req.method === 'DELETE') {
    try {
      disconnectYouTube();
      return res.status(200).json({
        success: true,
        message: 'YouTube account disconnected and tokens securely removed.'
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
