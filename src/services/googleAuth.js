// Google OAuth 2.0 & YouTube Data API v3 Service
import { storage } from './storage.js';

export class GoogleAuthService {
  static tokenClient = null;

  static getClientId() {
    return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) || 
           (typeof localStorage !== 'undefined' && localStorage.getItem('omni_google_client_id')) || 
           '';
  }

  static setClientId(id) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('omni_google_client_id', (id || '').trim());
    }
  }

  static isGoogleLoaded() {
    return typeof window !== 'undefined' && window.google?.accounts?.oauth2 !== undefined;
  }

  /**
   * Initializes Google Identity Services token client
   */
  static initClient(onSuccess, onError) {
    if (!this.isGoogleLoaded()) {
      return false;
    }

    const clientId = this.getClientId();
    if (!clientId) {
      if (onError) onError(new Error('Google Client ID is missing. Please save your Client ID in the modal above.'));
      return false;
    }

    try {
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email'
        ].join(' '),
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            console.error('Google OAuth Token Error:', tokenResponse);
            if (onError) onError(new Error(tokenResponse.error_description || tokenResponse.error));
            return;
          }
          if (onSuccess) onSuccess(tokenResponse);
        },
        error_callback: (err) => {
          console.warn('Google Token Client error_callback:', err);
          if (onError) onError(new Error(err?.message || err?.type || 'Google popup was closed or blocked'));
        }
      });
      return true;
    } catch (e) {
      console.error('Failed to init Google Token Client', e);
      if (onError) onError(e);
      return false;
    }
  }

  /**
   * 1-Click Trigger: Connect YouTube Channel via Google OAuth 2.0
   */
  static connectYouTubeChannel(project) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Google Authorization window was closed or timed out. If popup was blocked, please allow popups or use direct token/share settings.'));
      }, 35000);

      const safeResolve = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(val);
      };

      const safeReject = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      };

      const clientId = this.getClientId();
      if (!clientId) {
        safeReject(new Error('Google Client ID is missing. Please save your Client ID in settings.'));
        return;
      }

      const executeFlow = () => {
        // Method 1: Try Token Flow first for Drive & YouTube upload
        try {
          this.executeTokenFlow(project, safeResolve, safeReject);
        } catch (tokenErr) {
          console.warn('[GoogleAuth] Token client notice, trying code flow:', tokenErr);
          // Fallback: initCodeClient
          if (window.google?.accounts?.oauth2?.initCodeClient) {
            try {
              const codeClient = window.google.accounts.oauth2.initCodeClient({
                client_id: clientId,
                scope: [
                  'https://www.googleapis.com/auth/youtube.upload',
                  'https://www.googleapis.com/auth/youtube.readonly',
                  'https://www.googleapis.com/auth/drive.readonly',
                  'https://www.googleapis.com/auth/userinfo.profile'
                ].join(' '),
                ux_mode: 'popup',
                callback: async (response) => {
                  if (response.error) {
                    safeReject(new Error(response.error_description || response.error));
                    return;
                  }
                  if (response.code) {
                    try {
                      const tokenRes = await fetch('/api/youtube/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: response.code })
                      });
                      const tokenData = await tokenRes.json();
                      if (!tokenRes.ok || !tokenData.success) {
                        throw new Error(tokenData.error || 'Failed to exchange authorization code');
                      }

                      this.setYouTubeToken(project, tokenData.accessToken);
                      storage.saveState();
                      safeResolve({
                        success: true,
                        accessToken: tokenData.accessToken
                      });
                    } catch (exchangeErr) {
                      safeReject(exchangeErr);
                    }
                  }
                }
              });
              codeClient.requestCode();
            } catch (err) {
              safeReject(err);
            }
          } else {
            safeReject(tokenErr);
          }
        }
      };

      if (!this.isGoogleLoaded()) {
        const checkInterval = setInterval(() => {
          if (this.isGoogleLoaded()) {
            clearInterval(checkInterval);
            executeFlow();
          }
        }, 150);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.isGoogleLoaded()) {
            safeReject(new Error('Google Identity Services script did not load. Please check your connection.'));
          }
        }, 4000);
        return;
      }

      executeFlow();
    });
  }

  static executeTokenFlow(project, resolve, reject) {
    const successHandler = async (tokenResponse) => {
      const accessToken = tokenResponse.access_token;
      try {
        const channelData = await this.fetchChannelInfo(accessToken);

        let ytAccount = project.socialAccounts.find(a => a.id === 'youtube');
        if (!ytAccount) {
          ytAccount = {
            id: 'youtube',
            name: 'YouTube Shorts',
            icon: 'youtube',
            color: '#FF0000',
            handle: '',
            connected: false,
            active: true
          };
          project.socialAccounts.push(ytAccount);
        }

        ytAccount.connected = true;
        ytAccount.active = true;
        ytAccount.handle = channelData.customUrl || channelData.title;
        ytAccount.channelTitle = channelData.title;
        ytAccount.followers = channelData.subscribersFormatted;
        ytAccount.avatar = channelData.avatar;
        ytAccount.accessToken = accessToken;
        ytAccount.token = accessToken;
        ytAccount.channelId = channelData.id;
        ytAccount.lastPost = 'Ready';
        ytAccount.connectedAt = new Date().toISOString();

        if (!project.scheduleSettings.targetPlatforms.includes('youtube')) {
          project.scheduleSettings.targetPlatforms.push('youtube');
        }

        this.setYouTubeToken(project, accessToken);
        storage.saveState();
        resolve({
          success: true,
          channel: channelData,
          accessToken
        });
      } catch (err) {
        console.error('Error fetching YouTube channel details:', err);
        this.setYouTubeToken(project, accessToken);
        storage.saveState();
        resolve({
          success: true,
          message: 'Connected with Google OAuth token.',
          accessToken
        });
      }
    };

    const errorHandler = (err) => {
      reject(err);
    };

    const ready = this.initClient(successHandler, errorHandler);
    if (!ready || !this.tokenClient) {
      reject(new Error('Could not initialize Google OAuth client. Check Client ID settings.'));
      return;
    }

    try {
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      reject(e);
    }
  }

  /**
   * Fetches authentic YouTube Channel details via YouTube Data API v3
   */
  static async fetchChannelInfo(accessToken) {
    const url = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true';
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `YouTube API HTTP ${response.status}`);
    }

    const data = await response.json();
    const items = data.items || [];
    if (items.length === 0) {
      return {
        id: 'no_channel',
        title: 'Google Account (No YouTube Channel)',
        customUrl: '@google.user',
        subscribersFormatted: '0 Subscribers',
        avatar: ''
      };
    }

    const channel = items[0];
    const snippet = channel.snippet || {};
    const stats = channel.statistics || {};

    const subCount = Number(stats.subscriberCount || 0);
    let formattedSubs = `${subCount.toLocaleString()} Subscribers`;
    if (subCount >= 1000000) {
      formattedSubs = `${(subCount / 1000000).toFixed(1)}M Subscribers`;
    } else if (subCount >= 1000) {
      formattedSubs = `${(subCount / 1000).toFixed(1)}K Subscribers`;
    }

    return {
      id: channel.id,
      title: snippet.title || 'YouTube Creator',
      customUrl: snippet.customUrl || `@${(snippet.title || '').toLowerCase().replace(/\s+/g, '')}`,
      avatar: snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url || '',
      subscribersFormatted: formattedSubs,
      videoCount: stats.videoCount || 0
    };
  }

  /**
   * Retrieves active YouTube Access Token from state or localStorage
   */
  static getYouTubeToken(project) {
    const account = project?.socialAccounts?.find(a => a.id === 'youtube');
    return account?.accessToken || account?.token || (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_access_token') : '') || '';
  }

  /**
   * Stores active YouTube Access Token across project, localStorage, and server cache
   */
  static setYouTubeToken(project, token) {
    if (!token) return;
    const cleanToken = token.trim();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('omni_google_access_token', cleanToken);
      }
    } catch (e) {}

    // Persist token to server cache asynchronously
    try {
      fetch('/api/youtube/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken })
      }).catch(() => {});
    } catch (e) {}

    let account = project?.socialAccounts?.find(a => a.id === 'youtube');
    if (!account && project?.socialAccounts) {
      account = {
        id: 'youtube',
        name: 'YouTube Shorts',
        icon: 'youtube',
        color: '#FF0000',
        handle: '@chikubd',
        channelTitle: 'chiku bd',
        channelId: 'UCCOo5jxEtLRgJQukBMnt-QQ',
        connected: true,
        active: true
      };
      project.socialAccounts.push(account);
    }

    if (account) {
      account.accessToken = cleanToken;
      account.token = cleanToken;
      account.connected = true;
      account.active = true;
      account.channelId = account.channelId || 'UCCOo5jxEtLRgJQukBMnt-QQ';
      account.channelTitle = account.channelTitle || 'chiku bd';
      account.handle = account.handle || '@chikubd';
    }

    if (project?.scheduleSettings && !project.scheduleSettings.targetPlatforms.includes('youtube')) {
      project.scheduleSettings.targetPlatforms.push('youtube');
    }
  }

  static async syncStoredCredentials(project) {
    try {
      const res = await fetch('/api/youtube/token');
      if (res.ok) {
        const data = await res.json();
        if (data.youtube?.accessToken) {
          this.setYouTubeToken(project, data.youtube.accessToken);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /**
   * Tests and validates YouTube OAuth access token directly with YouTube Data API v3
   */
  static async testYouTubeToken(token) {
    if (!token || !token.trim()) {
      throw new Error('Google/YouTube Access Token is empty.');
    }
    const cleanToken = token.trim();
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      let errMsg = `YouTube API Error HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch (e) {}
      if (res.status === 401) {
        throw new Error('YOUTUBE_TOKEN_EXPIRED: Access Token মেয়াদোত্তীর্ণ বা অকার্যকর (HTTP 401)। অনুগ্রহ করে নতুন টোকেন দিন।');
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) {
      return {
        success: true,
        channel: {
          id: 'UCCOo5jxEtLRgJQukBMnt-QQ',
          title: 'chiku bd',
          customUrl: '@chikubd',
          subscribers: '0'
        }
      };
    }

    const item = items[0];
    return {
      success: true,
      channel: {
        id: item.id,
        title: item.snippet?.title || 'chiku bd',
        customUrl: item.snippet?.customUrl || `@${(item.snippet?.title || 'chikubd').toLowerCase().replace(/\s+/g, '')}`,
        avatar: item.snippet?.thumbnails?.default?.url || '',
        subscribers: item.statistics?.subscriberCount || '0'
      }
    };
  }

  /**
   * Uploads short video directly to YouTube Data API v3
   */
  static async uploadShortVideo(fileBlob, { title, description = '', tags = [] }, accessToken) {
    if (!accessToken) {
      throw new Error('YOUTUBE_TOKEN_REQUIRED: YouTube Access Token missing. Please connect YouTube with Google.');
    }
    if (!fileBlob || !(fileBlob instanceof Blob)) {
      throw new Error('VIDEO_BLOB_REQUIRED: Video binary file is required to upload to YouTube Shorts.');
    }

    // Attempt 1: Server-side relay (bypasses browser CORS and origin limitations)
    try {
      const relayUrl = `/api/youtube/upload-video?title=${encodeURIComponent(title || '')}&description=${encodeURIComponent(description || '')}&token=${encodeURIComponent(accessToken)}`;
      const relayRes = await fetch(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': fileBlob.type || 'video/mp4'
        },
        body: fileBlob
      });

      const relayData = await relayRes.json();
      if (relayRes.ok && relayData.success && relayData.videoId) {
        return {
          success: true,
          videoId: relayData.videoId,
          postUrl: relayData.postUrl || `https://www.youtube.com/shorts/${relayData.videoId}`
        };
      }

      if (relayData.error === 'YOUTUBE_TOKEN_EXPIRED' || relayRes.status === 401) {
        throw new Error('YOUTUBE_TOKEN_EXPIRED: YouTube Access Token expired. Please reconnect YouTube Channel.');
      }
      if (relayData.error === 'YOUTUBE_TOKEN_REQUIRED') {
        throw new Error('YOUTUBE_TOKEN_REQUIRED: YouTube Access Token missing.');
      }
      console.warn('[GoogleAuth] Server relay message:', relayData.message || relayData.error);
    } catch (relayErr) {
      if (relayErr.message && (relayErr.message.includes('YOUTUBE_TOKEN') || relayErr.message.includes('VIDEO_BLOB'))) {
        throw relayErr;
      }
      console.warn('[GoogleAuth] Server relay failed, trying direct browser upload:', relayErr.message);
    }

    // Attempt 2: Direct browser client Resumable Upload
    const metadata = {
      snippet: {
        title: (title || 'YouTube Short').substring(0, 100),
        description: `${description || ''}\n\n#Shorts #Viral #Trending`,
        tags: tags && tags.length > 0 ? tags : ['Shorts', 'Viral', 'YouTubeShorts'],
        categoryId: '22' // People & Blogs
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    };

    // 1. Resumable Upload Initiation
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileBlob.size.toString(),
        'X-Upload-Content-Type': fileBlob.type || 'video/mp4'
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      let errMsg = `YouTube upload initiation failed (HTTP ${initRes.status})`;
      try {
        const errJson = await initRes.json();
        if (errJson.error?.message) errMsg = errJson.error.message;
        if (initRes.status === 401) {
          throw new Error('YOUTUBE_TOKEN_EXPIRED: YouTube Access Token expired. Please reconnect YouTube Channel.');
        }
      } catch (e) {
        if (e.message && e.message.includes('YOUTUBE_TOKEN')) throw e;
      }
      throw new Error(errMsg);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return a valid upload location URI.');
    }

    // 2. Upload binary payload
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': fileBlob.type || 'video/mp4'
      },
      body: fileBlob
    });

    if (!uploadRes.ok) {
      let errDetail = `YouTube video upload failed (HTTP ${uploadRes.status})`;
      try {
        const errJson = await uploadRes.json();
        if (errJson.error?.message) errDetail = errJson.error.message;
      } catch (e) {}
      throw new Error(errDetail);
    }

    const videoData = await uploadRes.json();
    const videoId = videoData.id;
    return {
      success: true,
      videoId,
      postUrl: `https://www.youtube.com/shorts/${videoId}`
    };
  }
}
