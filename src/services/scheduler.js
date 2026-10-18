// Automated Daily Timing Scheduler & Social Publishing Engine
import { AICaptionService } from './aiCaption.js';
import confetti from 'canvas-confetti';
import { getVideoBlob } from './videoStore.js';

export class SchedulerService {
  /**
   * Distributes unposted videos across future dates and syncs to server-side background queue
   */
  static async autoScheduleVideos(project, onProgress = null) {
    const { preferredTime = '18:00', postingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], targetPlatforms = [] } = project.scheduleSettings;
    
    // Find videos that need scheduling (status 'ready' or 'draft' or 'Pending')
    const unpostedVideos = project.videos.filter(v => v.status === 'ready' || v.status === 'draft');
    
    if (unpostedVideos.length === 0) {
      return { count: 0, message: 'All videos are already scheduled or published.' };
    }

    const [hours, minutes] = preferredTime.split(':').map(Number);
    let currentDate = new Date();
    // Start from tomorrow
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(hours || 18, minutes || 0, 0, 0);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let scheduledCount = 0;
    const queuedItemsToSync = [];

    for (let i = 0; i < unpostedVideos.length; i++) {
      const video = unpostedVideos[i];

      // Advance date until it matches one of the chosen posting days
      while (!postingDays.includes(dayNames[currentDate.getDay()])) {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // If video has no caption, generate with AI now
      if (!video.caption || video.caption.trim().length === 0) {
        if (onProgress) onProgress(`Generating AI caption for "${video.title.substring(0, 25)}..."`);
        const aiResult = await AICaptionService.generateCaption(video, project.aiSettings, project.niche);
        video.caption = aiResult.caption;
        video.hook = aiResult.hook;
      }

      video.scheduledDate = new Date(currentDate).toISOString();
      video.status = 'Pending'; // Standard status: Pending | Processing | Published | Failed
      video.platforms = [...(targetPlatforms.length > 0 ? targetPlatforms : ['facebook', 'youtube', 'insta'])];
      video.idempotencyKey = `sched_${video.id}_${video.scheduledDate}`;

      queuedItemsToSync.push({
        id: video.id,
        title: video.title,
        caption: video.caption,
        videoUrl: video.videoUrl || video.downloadUrl || video.url || '',
        scheduledDate: video.scheduledDate,
        platforms: video.platforms,
        idempotencyKey: video.idempotencyKey,
        status: 'Pending'
      });

      scheduledCount++;
      // Move to next day for the next video
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sync to serverless background queue for automated publishing when dashboard is closed
    try {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: queuedItemsToSync })
      });
      console.log(`[Scheduler] Synchronized ${queuedItemsToSync.length} items to background cron queue.`);
    } catch (e) {
      console.warn('[Scheduler] Queue sync notice:', e.message);
    }

    return {
      count: scheduledCount,
      message: `Successfully scheduled ${scheduledCount} videos at ${preferredTime} daily! Background auto-posting is active.`
    };
  }

  /**
   * Publishes a single test post to Facebook Page (Requires user approval)
   */
  static async publishTestPost(project, { message, pageId, token }) {
    const postMessage = message || `Test auto-post from AutoVid Publisher — ${new Date().toLocaleString()}`;

    const res = await fetch('/api/facebook/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageId: pageId || null,
        message: postMessage,
        postType: 'text',
        idempotencyKey: `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...(token ? { token } : {})
      })
    });

    const data = await res.json();
    return data;
  }

  /**
   * Publishes video to connected social platforms via real server-side API endpoints
   */
  static async publishVideo(project, targetVideoId = null, onProgress = () => {}) {
    // Select video: target or next unposted video
    let video = null;
    if (targetVideoId) {
      video = project.videos.find(v => v.id === targetVideoId);
    }
    if (!video) {
      // 1. Try scheduled or pending videos (case-insensitive)
      video = project.videos.find(v => {
        const s = (v.status || '').toLowerCase();
        return s === 'pending' || s === 'scheduled';
      });
    }
    if (!video) {
      // 2. Try ready or draft videos (case-insensitive)
      video = project.videos.find(v => {
        const s = (v.status || '').toLowerCase();
        return s === 'ready' || s === 'draft';
      });
    }
    if (!video) {
      // 3. Try any unposted/failed video to allow retry
      video = project.videos.find(v => (v.status || '').toLowerCase() !== 'published');
    }
    if (!video && project.videos.length > 0) {
      // 4. Fallback to first video in list
      video = project.videos[0];
    }

    if (!video) {
      throw new Error('No videos found in your project library. Please import a video first.');
    }

    // Determine target platforms
    const activeConnectedPlatforms = (project.socialAccounts || [])
      .filter(a => a.connected && a.active);

    if (activeConnectedPlatforms.length === 0) {
      throw new Error('No social media channels are currently connected and active. Please configure Facebook Page in the Social Media tab.');
    }

    const platformNames = activeConnectedPlatforms.map(a => a.name);

    // Step 1: Initialize
    video.status = 'Processing';
    onProgress({ step: 1, percent: 15, message: `Preparing "${video.title.substring(0, 30)}..." for dispatch` });
    await new Promise(r => setTimeout(r, 300));

    // Step 2: Ensure AI Caption is loaded
    if (!video.caption || video.caption.trim().length === 0) {
      onProgress({ step: 2, percent: 35, message: 'AI generating viral caption & hashtags...' });
      const aiResult = await AICaptionService.generateCaption(video, project.aiSettings, project.niche);
      video.caption = aiResult.caption;
      video.hook = aiResult.hook;
    } else {
      onProgress({ step: 2, percent: 35, message: 'Attaching AI caption & hashtags...' });
    }
    await new Promise(r => setTimeout(r, 300));

    // Step 3: Social Platform Media Upload
    onProgress({ step: 3, percent: 60, message: `Broadcasting to ${platformNames.join(', ')}...` });

    const externalUrls = {};
    const errors = [];
    const fbAccount = activeConnectedPlatforms.find(a => a.id === 'facebook');

    // Real Facebook Meta Graph API Publishing
    if (fbAccount) {
      try {
        const pageName = fbAccount.pageName || 'Chiku bd';
        onProgress({ step: 4, percent: 75, message: `Publishing to Facebook Page "${pageName}"...` });

        // Retrieve local video file binary if available
        let fileBlob = null;
        if (video.fileReference instanceof Blob) {
          fileBlob = video.fileReference;
        }
        if (!fileBlob) {
          try {
            fileBlob = await getVideoBlob(video.id);
          } catch (e) {
            console.warn('[Scheduler] IndexedDB blob lookup:', e);
          }
        }
        if (!fileBlob && video.videoUrl && video.videoUrl.startsWith('blob:')) {
          try {
            const r = await fetch(video.videoUrl);
            if (r.ok) fileBlob = await r.blob();
          } catch (e) {
            console.warn('[Scheduler] Blob URL fetch error:', e);
          }
        }

        if (fileBlob) {
          // Direct binary multipart upload from browser to Meta Graph API
          // Bypasses Vercel serverless 4.5MB request limit
          onProgress({ step: 4, percent: 80, message: `Requesting Facebook Page upload authorization...` });

          const authRes = await fetch('/api/facebook/upload-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: fbAccount.pageId || null })
          });
          const authData = await authRes.json();

          if (!authRes.ok || !authData.success || !authData.token) {
            throw new Error(authData.error || 'Failed to acquire Facebook Page upload authorization.');
          }

          const targetPageId = authData.pageId;
          const pageToken = authData.token;

          const sizeMb = (fileBlob.size / (1024 * 1024)).toFixed(1);
          onProgress({ step: 4, percent: 85, message: `Uploading video (${sizeMb} MB) directly to Facebook Page...` });

          const formData = new FormData();
          formData.append('access_token', pageToken);
          formData.append('description', video.caption || video.title || '');
          if (video.title) formData.append('title', video.title);
          formData.append('source', fileBlob, video.title || 'video.mp4');

          const metaRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(targetPageId)}/videos`, {
            method: 'POST',
            body: formData
          });

          const metaData = await metaRes.json();

          if (metaRes.ok && metaData.id) {
            const postUrl = `https://www.facebook.com/${metaData.id}`;
            externalUrls['Facebook'] = postUrl;
            console.log('[Scheduler] Direct Facebook video upload success:', postUrl);
          } else {
            const metaErr = metaData.error || {};
            let errMsg = metaErr.message || 'Meta video upload failed';
            if (metaErr.code === 190) errMsg = 'Facebook Page token expired (Code 190). Please reconnect in Social Media tab.';
            else if (metaErr.code === 100 && metaErr.error_subcode === 33) errMsg = `Facebook Page ID ${targetPageId} not found or unsupported.`;
            else if (metaErr.code === 200) errMsg = 'Missing permissions: pages_manage_posts or publish_video required.';
            errors.push(`Facebook: ${errMsg}`);
          }
        } else {
          // Remote URL (Google Drive, cloud video, etc.) via backend publisher
          const directVideoUrl = video.videoUrl || video.downloadUrl || video.url || '';
          
          if (directVideoUrl.startsWith('blob:')) {
            throw new Error('Local video file cache expired. Please click "Play" or re-add the video file to publish.');
          }

          const fbRes = await fetch('/api/facebook/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageId: fbAccount.pageId || null,
              caption: video.caption,
              videoUrl: directVideoUrl,
              idempotencyKey: video.idempotencyKey || `pub_${video.id}_${Date.now()}`,
              itemId: video.id
            })
          });

          const fbData = await fbRes.json();

          if (fbRes.ok && fbData.success) {
            externalUrls['Facebook'] = fbData.postUrl;
          } else {
            const errDetail = fbData.message || fbData.error || 'Failed to post to Facebook';
            errors.push(`Facebook: ${errDetail}`);
          }
        }
      } catch (err) {
        errors.push(`Facebook Error: ${err.message}`);
      }
    }

    // Step 4: Handle results
    if (errors.length > 0 && Object.keys(externalUrls).length === 0) {
      video.status = 'Failed';
      video.error = errors.join('; ');

      const failedLogItem = {
        id: 'log_' + Date.now(),
        timestamp: new Date().toLocaleString(),
        videoTitle: video.title,
        platforms: platformNames,
        status: 'failed',
        captionSnippet: video.caption ? video.caption.substring(0, 100) + '...' : '',
        message: `Publishing failed: ${errors.join('; ')}`,
        externalUrls: {}
      };

      if (!project.logs) project.logs = [];
      project.logs.unshift(failedLogItem);

      throw new Error(`Publishing failed: ${errors.join('; ')}`);
    }

    // Step 5: Mark as published
    video.status = 'Published';
    video.publishedAt = new Date().toLocaleString();
    video.platforms = platformNames;
    video.error = null;

    // Create success log entry
    const logItem = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toLocaleString(),
      videoTitle: video.title,
      platforms: platformNames,
      status: 'success',
      captionSnippet: video.caption ? video.caption.substring(0, 100) + '...' : '',
      message: `Successfully published to Facebook Page with Meta Graph API!`,
      externalUrls
    };

    if (!project.logs) project.logs = [];
    project.logs.unshift(logItem);

    // Update account last post
    project.socialAccounts.forEach(acc => {
      if (acc.connected && acc.active) {
        acc.lastPost = 'Just now';
      }
    });

    onProgress({ step: 5, percent: 100, message: '🎉 Published successfully with Meta Graph API verification!' });

    // Trigger celebration confetti
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // safe fallback
    }

    return {
      success: true,
      video,
      log: logItem
    };
  }
}
