// Automated Daily Timing Scheduler & Social Publishing Simulator
import { AICaptionService } from './aiCaption.js';
import confetti from 'canvas-confetti';

export class SchedulerService {
  /**
   * Distributes unposted videos across future dates based on daily frequency and preferred time
   */
  static async autoScheduleVideos(project, onProgress = null) {
    const { preferredTime = '18:00', postingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], targetPlatforms = [] } = project.scheduleSettings;
    
    // Find videos that need scheduling (status 'ready' or 'draft')
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
      video.status = 'scheduled';
      video.platforms = [...(targetPlatforms.length > 0 ? targetPlatforms : ['insta', 'youtube', 'tiktok'])];

      scheduledCount++;
      // Move to next day for the next video
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      count: scheduledCount,
      message: `Successfully scheduled ${scheduledCount} videos at ${preferredTime} daily!`
    };
  }

  /**
   * Simulates publishing a single video or the next queued video with real-time progress callbacks
   */
  static async publishVideo(project, targetVideoId = null, onProgress = () => {}) {
    // Select video: target or next scheduled or ready video
    let video = null;
    if (targetVideoId) {
      video = project.videos.find(v => v.id === targetVideoId);
    } else {
      video = project.videos.find(v => v.status === 'scheduled') || project.videos.find(v => v.status === 'ready');
    }

    if (!video) {
      throw new Error('No videos available in queue to publish.');
    }

    // Determine target platforms
    const activeConnectedPlatforms = project.socialAccounts
      .filter(a => a.connected && a.active)
      .map(a => a.name);

    if (activeConnectedPlatforms.length === 0) {
      throw new Error('No social media channels are currently connected and active. Please connect at least one channel in Social Media tab.');
    }

    // Step 1: Initialize
    video.status = 'publishing';
    onProgress({ step: 1, percent: 15, message: `Preparing "${video.title.substring(0, 30)}..." for daily dispatch` });
    await new Promise(r => setTimeout(r, 700));

    // Step 2: Ensure AI Caption is loaded
    if (!video.caption || video.caption.trim().length === 0) {
      onProgress({ step: 2, percent: 35, message: 'AI generating viral caption & hashtags via API...' });
      const aiResult = await AICaptionService.generateCaption(video, project.aiSettings, project.niche);
      video.caption = aiResult.caption;
      video.hook = aiResult.hook;
    } else {
      onProgress({ step: 2, percent: 35, message: 'Attaching pre-generated AI caption & verified hashtags...' });
    }
    await new Promise(r => setTimeout(r, 600));

    // Step 3: Social Platform Media Upload
    onProgress({ step: 3, percent: 65, message: `Uploading video to ${activeConnectedPlatforms.join(', ')}...` });
    await new Promise(r => setTimeout(r, 900));

    // Step 4: Finalize & Publish
    onProgress({ step: 4, percent: 90, message: 'Broadcasting live posts and verifying platform status...' });
    await new Promise(r => setTimeout(r, 700));

    // Mark as published
    video.status = 'published';
    video.publishedAt = new Date().toLocaleString();
    video.platforms = activeConnectedPlatforms;

    // Generate mock live URLs
    const randomId = Math.random().toString(36).substring(2, 8);
    const externalUrls = {};
    activeConnectedPlatforms.forEach(name => {
      if (name.includes('Instagram')) externalUrls['Instagram'] = `https://instagram.com/reel/C${randomId}`;
      if (name.includes('YouTube')) externalUrls['YouTube'] = `https://youtube.com/shorts/${randomId}`;
      if (name.includes('TikTok')) externalUrls['TikTok'] = `https://tiktok.com/@creator/video/${randomId}`;
      if (name.includes('Facebook')) externalUrls['Facebook'] = `https://fb.watch/${randomId}`;
      if (name.includes('LinkedIn')) externalUrls['LinkedIn'] = `https://linkedin.com/posts/video-${randomId}`;
      if (name.includes('Twitter')) externalUrls['X (Twitter)'] = `https://x.com/status/${randomId}`;
    });

    // Create log entry
    const logItem = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toLocaleString(),
      videoTitle: video.title,
      platforms: activeConnectedPlatforms,
      status: 'success',
      captionSnippet: video.caption ? video.caption.substring(0, 100) + '...' : '',
      message: `Successfully published to ${activeConnectedPlatforms.length} platform(s) with AI caption.`,
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

    onProgress({ step: 5, percent: 100, message: '🎉 Published successfully across all connected channels!' });

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
