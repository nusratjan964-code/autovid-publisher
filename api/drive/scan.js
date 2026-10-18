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

async function getRefreshedToken(cache) {
  const yt = cache.youtube;
  if (!yt || !yt.refreshToken) return yt?.accessToken || '';

  try {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID || cache.googleClientId || '';
    const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET || cache.googleClientSecret || '';

    if (clientId && clientSecret) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: yt.refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      });

      const data = await res.json();
      if (res.ok && data.access_token) {
        yt.accessToken = data.access_token;
        yt.updatedAt = new Date().toISOString();
        cache.youtube = yt;
        saveCache(cache);
        return data.access_token;
      }
    }
  } catch (e) {
    console.warn('[Drive Scanner] Token refresh notice:', e.message);
  }

  return yt?.accessToken || '';
}

function extractAllDriveTargets(rawInput) {
  if (!rawInput) return [];
  const text = Array.isArray(rawInput) ? rawInput.join('\n') : String(rawInput);
  const targets = [];
  const seenIds = new Set();

  // 1. Match all file URLs
  const fileRegexes = [
    /\/file\/d\/([a-zA-Z0-9_-]{20,60})/g,
    /open\?id=([a-zA-Z0-9_-]{20,60})/g,
    /uc\?id=([a-zA-Z0-9_-]{20,60})/g,
    /uc\?export=download&id=([a-zA-Z0-9_-]{20,60})/g
  ];

  for (const regex of fileRegexes) {
    const matches = Array.from(text.matchAll(regex));
    for (const m of matches) {
      const id = m[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        targets.push({ type: 'file', id, url: `https://drive.google.com/file/d/${id}/view` });
      }
    }
  }

  // 2. Match folder URLs
  const folderRegexes = [
    /\/folders\/([a-zA-Z0-9_-]{20,60})/g,
    /drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]{20,60})/g
  ];

  for (const regex of folderRegexes) {
    const matches = Array.from(text.matchAll(regex));
    for (const m of matches) {
      const id = m[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        targets.push({ type: 'folder', id, url: `https://drive.google.com/drive/folders/${id}` });
      }
    }
  }

  // 3. Fallback: single raw ID
  const trimmed = text.trim();
  if (targets.length === 0 && /^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) {
    targets.push({ type: 'unknown', id: trimmed, url: trimmed });
  }

  return targets;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const queryParams = req.query || {};
  const bodyParams = req.body || {};

  const inputRaw = queryParams.url || bodyParams.url || queryParams.folderUrl || bodyParams.folderUrl || bodyParams.urls || '';
  const inputApiKey = (queryParams.apiKey || bodyParams.apiKey || '').trim();
  const inputToken = (queryParams.token || bodyParams.token || req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '').trim();

  if (!inputRaw || (typeof inputRaw === 'string' && !inputRaw.trim())) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_URL',
      message: 'অনুগ্রহ করে Google Drive এর ফোল্ডার বা ভিডিও ফাইল লিংক দিন।'
    });
  }

  const targets = extractAllDriveTargets(inputRaw);
  if (targets.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_URL',
      message: 'অনুগ্রহ করে একটি সঠিক Google Drive লিংক দিন (যেমন: https://drive.google.com/drive/folders/... অথবা https://drive.google.com/file/d/...)।'
    });
  }

  const cache = loadCache();
  let token = inputToken || await getRefreshedToken(cache);
  const apiKey = inputApiKey || process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY || '';

  console.log(`[Drive Scanner] Found ${targets.length} targets to process (Token: ${!!token}, Key: ${!!apiKey})`);

  // --- SCENARIO A: BATCH OF FILES OR SINGLE FILE(S) ---
  const fileTargets = targets.filter(t => t.type === 'file');
  const folderTargets = targets.filter(t => t.type === 'folder' || t.type === 'unknown');

  const allFoundVideos = [];

  // Process all direct file links first
  if (fileTargets.length > 0) {
    for (let i = 0; i < fileTargets.length; i++) {
      const fileTarget = fileTargets[i];
      const fileId = fileTarget.id;

      let videoObj = {
        id: `vid_gdrive_${fileId}`,
        title: `Google Drive Video ${fileTargets.length > 1 ? (i + 1) : ''}`.trim(),
        duration: '0:30',
        size: 'Cloud Video',
        videoUrl: `/api/drive/download?fileId=${fileId}`,
        directDownloadUrl: `https://drive.google.com/uc?id=${fileId}&export=download`,
        thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w600`,
        status: 'ready',
        source: 'Google Drive',
        driveFileId: fileId
      };

      // Try metadata enrichment if credentials available
      if (token || apiKey) {
        try {
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
          const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,videoMediaMetadata,thumbnailLink${keyParam}`, { headers });
          if (metaRes.ok) {
            const meta = await metaRes.json();
            videoObj.title = meta.name || videoObj.title;
            if (meta.size) {
              videoObj.size = `${(meta.size / (1024 * 1024)).toFixed(1)} MB`;
            }
            if (meta.thumbnailLink) {
              videoObj.thumbnailUrl = meta.thumbnailLink;
            }
            if (meta.videoMediaMetadata?.durationMillis) {
              const sec = Math.floor(meta.videoMediaMetadata.durationMillis / 1000);
              videoObj.duration = `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
            }
          }
        } catch (e) {}
      }

      allFoundVideos.push(videoObj);
    }

    if (folderTargets.length === 0) {
      return res.status(200).json({
        success: true,
        type: 'file',
        videos: allFoundVideos,
        count: allFoundVideos.length,
        message: `${allFoundVideos.length}টি Google Drive ভিডিও ফাইল সফলভাবে লোড হয়েছে!`
      });
    }
  }

  // --- SCENARIO B: FOLDER TARGET ---
  const mainFolderTarget = folderTargets[0];
  const folderId = mainFolderTarget.id;
  const folderShareUrl = `https://drive.google.com/drive/folders/${folderId}`;

  // 1. Query Official Google Drive API v3 (if Token or API key is present)
  if (token || apiKey) {
    try {
      const q = encodeURIComponent(`'${folderId}' in parents and (mimeType contains 'video/' or name contains '.mp4' or name contains '.mov' or name contains '.webm' or name contains '.mkv') and trashed = false`);
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
      const driveApiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,videoMediaMetadata,webContentLink,thumbnailLink)${keyParam}`;

      const apiRes = await fetch(driveApiUrl, { headers });
      if (apiRes.ok) {
        const data = await apiRes.json();
        const files = data.files || [];

        if (files.length > 0) {
          const folderVideos = files.map(file => {
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
              videoUrl: `/api/drive/download?fileId=${file.id}`,
              directDownloadUrl: file.webContentLink || `https://drive.google.com/uc?id=${file.id}&export=download`,
              thumbnailUrl: file.thumbnailLink || `https://drive.google.com/thumbnail?id=${file.id}&sz=w600`,
              status: 'ready',
              source: 'Google Drive',
              driveFileId: file.id
            };
          });

          const combined = [...allFoundVideos, ...folderVideos];
          return res.status(200).json({
            success: true,
            folderId,
            folderUrl: folderShareUrl,
            videos: combined,
            count: combined.length,
            message: `গুগল ড্রাইভ ফোল্ডার থেকে ${combined.length}টি ভিডিও ফাইল পাওয়া গেছে!`
          });
        } else {
          return res.status(404).json({
            success: false,
            error: 'EMPTY_FOLDER',
            folderUrl: folderShareUrl,
            message: 'এই Google Drive ফোল্ডারে কোনো ভিডিও ফাইল (.mp4, .mov, .webm) পাওয়া যায়নি। অনুগ্রহ করে নিশ্চিত করুন ফোল্ডারে ভিডিও ফাইল রয়েছে।'
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

  // 2. Query Public Shared Folder (Scrape initial payload for public folders)
  try {
    const pageRes = await fetch(folderShareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const idMatches = Array.from(html.matchAll(/\/file\/d\/([a-zA-Z0-9_-]{25,50})/g)).map(m => m[1]);
      const uniqueIds = Array.from(new Set(idMatches));

      if (uniqueIds.length > 0) {
        console.log(`[Drive Scanner] Found ${uniqueIds.length} files via public scraping`);
        const scrapedVideos = uniqueIds.map((fId, idx) => ({
          id: `vid_gdrive_${fId}`,
          title: `Drive Video ${idx + 1}`,
          duration: '0:30',
          size: 'Cloud Video',
          videoUrl: `/api/drive/download?fileId=${fId}`,
          directDownloadUrl: `https://drive.google.com/uc?id=${fId}&export=download`,
          thumbnailUrl: `https://drive.google.com/thumbnail?id=${fId}&sz=w600`,
          status: 'ready',
          source: 'Google Drive',
          driveFileId: fId
        }));

        const combined = [...allFoundVideos, ...scrapedVideos];
        return res.status(200).json({
          success: true,
          folderId,
          folderUrl: folderShareUrl,
          videos: combined,
          count: combined.length,
          message: `Google Drive থেকে ${combined.length}টি ভিডিও সফলভাবে লোড হয়েছে!`
        });
      }
    }
  } catch (scrapeErr) {
    console.warn('[Drive Scanner] Public scraping note:', scrapeErr.message);
  }

  // If we already had direct video files parsed from input, return them!
  if (allFoundVideos.length > 0) {
    return res.status(200).json({
      success: true,
      videos: allFoundVideos,
      count: allFoundVideos.length,
      message: `${allFoundVideos.length}টি ভিডিও ফাইল সফলভাবে লোড হয়েছে!`
    });
  }

  // 3. Folder is restricted or requires permission
  return res.status(403).json({
    success: false,
    error: 'ACCESS_RESTRICTED',
    folderId,
    folderUrl: folderShareUrl,
    message: 'Google Drive ফোল্ডারটি বর্তমানে Restricted / Private রয়েছে।',
    solutions: [
      `১. ফোল্ডারটির শেয়ার পারমিশন পরিবর্তন করুন: নিচের "Open Folder in Google Drive" বাটনে ক্লিক করে Share > General access-এ "Anyone with the link" (যে কেউ লিংকের মাধ্যমে দেখতে পাবে) সিলেক্ট করুন।`,
      `২. অথবা সরাসরি ভিডিও ফাইলের লিংকগুলো (/file/d/...) কপি করে পেস্ট করুন।`,
      `৩. অথবা আপনার গুগল একাউন্টটি রি-অথোরাইজ (Re-Authorize) করুন।`,
      `৪. অথবা সরাসরি আপনার কম্পিউটার থেকে নিচে ড্রপজোনে ভিডিও সিলেক্ট করুন।`
    ]
  });
}
