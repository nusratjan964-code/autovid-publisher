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

function parseDriveUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  // Check if it's a direct file link
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                    url.match(/open\?id=([a-zA-Z0-9_-]+)/) ||
                    url.match(/uc\?id=([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return { type: 'file', id: fileMatch[1], url };
  }

  // Check if it's a folder link
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || 
                      url.match(/id=([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    return { type: 'folder', id: folderMatch[1], url };
  }

  // Raw ID check (typically 25-45 characters alphanumeric with - and _)
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(url)) {
    return { type: 'unknown', id: url, url };
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const queryParams = req.query || {};
  const bodyParams = req.body || {};

  const inputUrl = (queryParams.url || bodyParams.url || queryParams.folderUrl || bodyParams.folderUrl || '').trim();
  const inputApiKey = (queryParams.apiKey || bodyParams.apiKey || '').trim();
  const inputToken = (queryParams.token || bodyParams.token || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();

  if (!inputUrl) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_URL',
      message: 'অনুগ্রহ করে Google Drive এর ফোল্ডার বা ভিডিও ফাইল লিংক দিন।'
    });
  }

  const parsed = parseDriveUrl(inputUrl);
  if (!parsed) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_URL',
      message: 'অনুগ্রহ করে একটি সঠিক Google Drive লিংক দিন (যেমন: https://drive.google.com/drive/folders/... অথবা https://drive.google.com/file/d/...)।'
    });
  }

  const cache = loadCache();
  const token = inputToken || cache.youtube?.accessToken || '';
  const apiKey = inputApiKey || process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  console.log(`[Drive Scanner] Scanning Drive target (${parsed.type}): ${parsed.id} (Has Token: ${!!token}, Has Key: ${!!apiKey})...`);

  // --- SCENARIO 1: SINGLE FILE LINK ---
  if (parsed.type === 'file') {
    const fileId = parsed.id;

    // Try fetching official metadata if credentials available
    if (token || apiKey) {
      try {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const keyQuery = apiKey ? `&key=${apiKey}` : '';
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,videoMediaMetadata,webContentLink,thumbnailLink${keyQuery}`, {
          headers
        });

        if (metaRes.ok) {
          const file = await metaRes.json();
          const durationMillis = file.videoMediaMetadata?.durationMillis;
          let durationFormatted = '0:30';
          if (durationMillis) {
            const totalSec = Math.floor(durationMillis / 1000);
            durationFormatted = `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
          }

          const video = {
            id: `vid_gdrive_${file.id}`,
            title: file.name || 'Google Drive Video',
            duration: durationFormatted,
            size: file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Cloud Video',
            videoUrl: file.webContentLink || `https://drive.google.com/uc?id=${file.id}&export=download`,
            thumbnailUrl: file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w600`,
            status: 'ready',
            source: 'Google Drive',
            driveFileId: file.id
          };

          return res.status(200).json({
            success: true,
            type: 'file',
            videos: [video],
            count: 1,
            message: `১টি ভিডিও ফাইল ("${video.title}") সফলভাবে লোড হয়েছে!`
          });
        }
      } catch (e) {
        console.warn('[Drive Scanner] Single file metadata note:', e.message);
      }
    }

    // Direct fallback for individual files
    const fallbackVideo = {
      id: `vid_gdrive_${fileId}`,
      title: 'Google Drive Video',
      duration: '0:30',
      size: 'Cloud Video',
      videoUrl: `https://drive.google.com/uc?id=${fileId}&export=download`,
      thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
      status: 'ready',
      source: 'Google Drive',
      driveFileId: fileId
    };

    return res.status(200).json({
      success: true,
      type: 'file',
      videos: [fallbackVideo],
      count: 1,
      message: 'গুগল ড্রাইভ ভিডিও ফাইল সফলভাবে লোড হয়েছে!'
    });
  }

  // --- SCENARIO 2: FOLDER LINK ---
  const folderId = parsed.id;

  // 1. Attempt API v3 via OAuth Token or API Key
  if (token || apiKey) {
    try {
      const q = encodeURIComponent(`'${folderId}' in parents and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov' or name contains '.webm' or name contains '.mkv') and trashed = false`);
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const keyQuery = apiKey ? `&key=${apiKey}` : '';
      const driveApiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,videoMediaMetadata,webContentLink,thumbnailLink)&key=${keyQuery ? apiKey : ''}`;

      const apiRes = await fetch(driveApiUrl, { headers });
      if (apiRes.ok) {
        const data = await apiRes.json();
        const files = data.files || [];

        if (files.length > 0) {
          const videos = files.map(file => {
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

          return res.status(200).json({
            success: true,
            folderId,
            videos,
            count: videos.length,
            message: `গুগল ড্রাইভ ফোল্ডার থেকে ${videos.length}টি ভিডিও ফাইল পাওয়া গেছে!`
          });
        } else {
          return res.status(404).json({
            success: false,
            error: 'EMPTY_FOLDER',
            message: 'এই Google Drive ফোল্ডারে কোনো ভিডিও ফাইল (.mp4, .mov, .webm) পাওয়া যায়নি। ফোল্ডারে ভিডিও আছে কিনা নিশ্চিত করুন।'
          });
        }
      } else {
        const errJson = await apiRes.json().catch(() => ({}));
        console.warn('[Drive Scanner] API v3 non-ok status:', apiRes.status, errJson);
      }
    } catch (apiErr) {
      console.warn('[Drive Scanner] API v3 error:', apiErr.message);
    }
  }

  // 2. Attempt Public HTML Parsing (for shared folders without API key)
  try {
    const publicFolderUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const pageRes = await fetch(publicFolderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (pageRes.ok) {
      const html = await pageRes.text();

      // Find file references in initial data
      const idMatches = Array.from(html.matchAll(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/g)).map(m => m[1]);
      const uniqueIds = Array.from(new Set(idMatches));

      if (uniqueIds.length > 0) {
        console.log(`[Drive Scanner] Found ${uniqueIds.length} files via public folder scraping`);
        const scrapedVideos = uniqueIds.map((fId, idx) => ({
          id: `vid_gdrive_${fId}`,
          title: `Drive Video ${idx + 1}`,
          duration: '0:30',
          size: 'Cloud Video',
          videoUrl: `https://drive.google.com/uc?id=${fId}&export=download`,
          thumbnailUrl: `https://drive.google.com/thumbnail?id=${fId}&sz=w600`,
          status: 'ready',
          source: 'Google Drive',
          driveFileId: fId
        }));

        return res.status(200).json({
          success: true,
          folderId,
          videos: scrapedVideos,
          count: scrapedVideos.length,
          message: `Google Drive থেকে ${scrapedVideos.length}টি ভিডিও সফলভাবে লোড হয়েছে!`
        });
      }
    }
  } catch (scrapeErr) {
    console.warn('[Drive Scanner] Public scraping note:', scrapeErr.message);
  }

  // 3. Folder is restricted or credentials required
  return res.status(403).json({
    success: false,
    error: 'ACCESS_RESTRICTED',
    folderId,
    message: 'Google Drive ফোল্ডারটি বর্তমানে Restricted / Private রয়েছে অথবা পারমিশন দেওয়া নেই।',
    solutions: [
      '১. ফোল্ডারের এক্সেস পরিবর্তন করুন: Google Drive-এ ফোল্ডারে রাইট-ক্লিক করে Share > General access-এ "Anyone with the link can view" (যে কেউ লিংকের মাধ্যমে দেখতে পাবে) সিলেক্ট করুন।',
      '২. অথবা "1-Click Connect Google Drive" বাটনে ক্লিক করে আপনার Google একাউন্ট অনুমোদিত করুন।',
      '৩. অথবা সরাসরি আপনার কম্পিউটার থেকে নিচে ভিডিও ফাইল সিলেক্ট / ড্রপ করুন।'
    ]
  });
}
