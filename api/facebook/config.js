import '../../lib/envLoader.js';
import { saveEnvVariable } from '../../lib/envLoader.js';
import { getMetaAppCredentials } from '../../lib/facebookTokenManager.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const { appId, appSecret } = getMetaAppCredentials();
    return res.status(200).json({
      success: true,
      configured: !!(appId && appSecret),
      appId: appId ? (appId.length > 6 ? appId.substring(0, 4) + '••••' + appId.slice(-2) : 'Configured') : '',
      hasSecret: !!appSecret
    });
  }

  if (req.method === 'POST') {
    const { appId, appSecret } = req.body || {};
    if (!appId || !appSecret) {
      return res.status(400).json({
        success: false,
        error: 'Both FB_APP_ID and FB_APP_SECRET are required.'
      });
    }

    const savedId = saveEnvVariable('FB_APP_ID', appId.trim());
    const savedSecret = saveEnvVariable('FB_APP_SECRET', appSecret.trim());

    if (savedId && savedSecret) {
      return res.status(200).json({
        success: true,
        message: 'Meta App ID এবং App Secret সফলভাবে .env.local এ সেভ করা হয়েছে! এখন যেকোনো Facebook Token অটো-রিনিউ হবে।'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to write credentials to .env.local'
    });
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
