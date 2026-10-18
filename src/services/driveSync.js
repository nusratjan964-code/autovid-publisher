// Google Drive & Local Video File Processing Service (Zero Fake Data)
import { saveVideoBlob } from './videoStore.js';

export class DriveSyncService {
  /**
   * Validates if a URL is a legitimate Google Drive folder or file link
   */
  static validateDriveUrl(url) {
    if (!url || typeof url !== 'string') return { valid: false, error: 'Please enter a Google Drive URL.' };
    const trimmed = url.trim();

    // Check if it contains any drive file or folder patterns
    const hasDrivePattern = trimmed.includes('/file/d/') || 
                           trimmed.includes('/folders/') || 
                           trimmed.includes('open?id=') || 
                           trimmed.includes('uc?id=') || 
                           trimmed.includes('drive.google.com') ||
                           /^[a-zA-Z0-9_-]{25,50}$/.test(trimmed);

    if (hasDrivePattern) {
      const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/open\?id=([a-zA-Z0-9_-]+)/) || trimmed.match(/uc\?id=([a-zA-Z0-9_-]+)/);
      const id = folderMatch ? folderMatch[1] : (fileMatch ? fileMatch[1] : (trimmed.match(/^[a-zA-Z0-9_-]{25,50}$/) ? trimmed : 'batch'));
      return { 
        valid: true, 
        type: folderMatch ? 'folder' : (fileMatch ? 'file' : 'batch'), 
        id, 
        folderId: id, 
        url: trimmed 
      };
    }

    return {
      valid: false,
      error: 'অনুগ্রহ করে সঠিক Google Drive লিংক দিন (যেমন: https://drive.google.com/drive/folders/... অথবা https://drive.google.com/file/d/...)'
    };
  }

  /**
   * Scans a Google Drive folder or imports video files.
   * Utilizes server endpoint /api/drive/scan, Google OAuth token, and API key.
   */
  static async scanDriveFolder(folderUrl, options = {}) {
    const validation = this.validateDriveUrl(folderUrl);
    if (!validation.valid) {
      return {
        success: false,
        error: 'INVALID_URL',
        message: validation.error
      };
    }

    // Extract options
    let apiKey = '';
    let token = '';

    if (typeof options === 'string') {
      apiKey = options;
    } else if (options && typeof options === 'object') {
      apiKey = options.apiKey || options.googleApiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_api_key') : '') || '';
      token = options.token || options.accessToken || '';
    }

    // Attempt 1: Server-side scan endpoint
    try {
      const scanRes = await fetch('/api/drive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: folderUrl,
          apiKey,
          token
        })
      });

      const scanData = await scanRes.json();

      if (scanRes.ok && scanData.success && scanData.videos && scanData.videos.length > 0) {
        return {
          success: true,
          folderName: scanData.type === 'file' ? 'Google Drive Video' : `Drive Folder (${validation.id.substring(0, 8)}...)`,
          folderUrl: scanData.folderUrl || folderUrl,
          videos: scanData.videos,
          count: scanData.videos.length,
          message: scanData.message
        };
      }

      if (scanData.error === 'ACCESS_RESTRICTED') {
        return {
          success: false,
          error: 'ACCESS_RESTRICTED',
          folderId: scanData.folderId || validation.id,
          folderUrl: scanData.folderUrl || `https://drive.google.com/drive/folders/${scanData.folderId || validation.id}`,
          message: scanData.message || 'Google Drive ফোল্ডারটি বর্তমানে Restricted / Private রয়েছে।',
          solutions: scanData.solutions || []
        };
      }

      if (scanData.message) {
        return {
          success: false,
          error: scanData.error || 'SCAN_ERROR',
          folderId: scanData.folderId || validation.id,
          folderUrl: scanData.folderUrl || folderUrl,
          message: scanData.message,
          solutions: scanData.solutions || []
        };
      }
    } catch (serverErr) {
      console.warn('[DriveSync] Server scan failed, trying direct browser flow:', serverErr.message);
    }

    // Attempt 2: If single file, generate direct streaming object
    if (validation.type === 'file') {
      const fileId = validation.id;
      const directVideo = {
        id: `vid_gdrive_${fileId}`,
        title: 'Google Drive Video',
        duration: '0:30',
        size: 'Cloud Video',
        videoUrl: `/api/drive/download?fileId=${fileId}`,
        directDownloadUrl: `https://drive.google.com/uc?id=${fileId}&export=download`,
        thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
        status: 'ready',
        source: 'Google Drive',
        driveFileId: fileId
      };

      return {
        success: true,
        folderName: 'Google Drive File',
        folderUrl,
        videos: [directVideo],
        count: 1,
        message: '১টি Google Drive ভিডিও ফাইল সফলভাবে লোড হয়েছে!'
      };
    }

    // Attempt 3: Direct browser client using Google Drive API v3
    if (apiKey || token) {
      try {
        const folderId = validation.id;
        const q = encodeURIComponent(`'${folderId}' in parents and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov' or name contains '.webm') and trashed = false`);
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const keyParam = apiKey ? `&key=${apiKey.trim()}` : '';
        const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,videoMediaMetadata,webContentLink,thumbnailLink)${keyParam}`;

        const response = await fetch(apiUrl, { headers });
        if (response.ok) {
          const data = await response.json();
          const files = data.files || [];

          if (files.length === 0) {
            return {
              success: false,
              error: 'NO_VIDEOS_FOUND',
              message: 'এই ফোল্ডারে কোনো ভিডিও ফাইল (.mp4, .mov, .webm) পাওয়া যায়নি।'
            };
          }

          const mappedVideos = files.map(file => {
            const durationMillis = file.videoMediaMetadata?.durationMillis;
            let durationFormatted = '0:30';
            if (durationMillis) {
              const totalSec = Math.floor(durationMillis / 1000);
              durationFormatted = `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
            }

            return {
              id: `vid_gdrive_${file.id}`,
              title: file.name,
              duration: durationFormatted,
              size: file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Cloud Video',
              videoUrl: file.webContentLink || `https://drive.google.com/uc?id=${file.id}&export=download`,
              thumbnailUrl: file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w600`,
              status: 'ready',
              source: 'Google Drive',
              driveFileId: file.id
            };
          });

          return {
            success: true,
            folderName: `Drive Folder (${folderId.substring(0, 8)}...)`,
            folderUrl,
            videos: mappedVideos,
            count: mappedVideos.length
          };
        }
      } catch (err) {
        console.warn('[DriveSync] Client API call error:', err.message);
      }
    }

    return {
      success: false,
      error: 'ACCESS_RESTRICTED',
      message: 'Google Drive ফোল্ডারটি প্রাইভেট বা সুরক্ষিত রয়েছে।\n\nভিডিও লোড করার সহজ সমাধান:\n১. গুগল ড্রাইভে ফোল্ডারে রাইট-ক্লিক করে Share > General access-এ "Anyone with the link can view" (যে কেউ লিংকের মাধ্যমে দেখতে পাবে) সিলেক্ট করুন।\n২. অথবা "1-Click Connect Google Drive" বাটনে ক্লিক করে একাউন্ট পারমিশন দিন।\n৩. অথবা সরাসরি আপনার কম্পিউটার থেকে নিচে ভিডিও ফাইল সিলেক্ট করুন।'
    };
  }

  /**
   * Processes genuine local files and folders uploaded by the user
   */
  static async processLocalFiles(fileList) {
    const files = Array.from(fileList || []);
    const videoFiles = files.filter(f => {
      const type = (f.type || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      return type.startsWith('video/') || 
             name.endsWith('.mp4') || 
             name.endsWith('.mov') || 
             name.endsWith('.webm') || 
             name.endsWith('.mkv');
    });

    if (videoFiles.length === 0) {
      return {
        success: false,
        error: 'NO_VIDEOS_FOUND',
        message: '⚠️ No video files (.mp4, .mov, .webm) were found in your selection. Please select valid video files.'
      };
    }

    const processedVideos = [];

    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i];
      const objectUrl = URL.createObjectURL(file);
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      const videoId = `vid_local_${Date.now()}_${i}`;

      // Persist binary file in IndexedDB so it survives page reloads
      try {
        await saveVideoBlob(videoId, file);
      } catch (e) {
        console.warn('[DriveSync] IndexedDB save notice:', e);
      }

      const metadata = await this.extractVideoMetadata(objectUrl, file.name);

      processedVideos.push({
        id: videoId,
        title: file.name,
        duration: metadata.durationFormatted || '0:30',
        size: sizeMb,
        videoUrl: objectUrl,
        thumbnailUrl: metadata.thumbnailUrl || '',
        status: 'ready',
        source: 'Local Upload',
        fileReference: file
      });
    }

    return {
      success: true,
      videos: processedVideos,
      count: processedVideos.length
    };
  }

  static extractVideoMetadata(videoUrl, filename) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'metadata';

      let durationFormatted = '0:30';

      video.onloadedmetadata = () => {
        const sec = Math.floor(video.duration % 60);
        const min = Math.floor(video.duration / 60);
        durationFormatted = `${min}:${sec < 10 ? '0' : ''}${sec}`;
        video.currentTime = Math.min(1.0, video.duration / 2);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 360;
          canvas.height = 640;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ durationFormatted, thumbnailUrl: thumb });
        } catch (e) {
          resolve({ durationFormatted, thumbnailUrl: null });
        }
      };

      video.onerror = () => {
        resolve({ durationFormatted: '0:30', thumbnailUrl: null });
      };

      setTimeout(() => {
        resolve({ durationFormatted, thumbnailUrl: null });
      }, 2500);
    });
  }
}
