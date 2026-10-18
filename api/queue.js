import fs from 'fs';
import path from 'path';
import os from 'os';

// Ephemeral / local persistent store for scheduled video publishing queue
const DATA_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'autovid_queue.json')
  : path.join(process.cwd(), '.queue_cache.json');

function loadQueue() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Queue] Failed to read queue file, starting fresh:', e.message);
  }
  return { items: [], processedKeys: {} };
}

function saveQueue(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Queue] Failed to write queue file:', e.message);
  }
}

export function getQueueState() {
  return loadQueue();
}

export function enqueueItems(newItems = []) {
  const state = loadQueue();
  newItems.forEach(item => {
    const existingIndex = state.items.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) {
      // Do not overwrite already published items
      if (state.items[existingIndex].status !== 'Published') {
        state.items[existingIndex] = { ...state.items[existingIndex], ...item };
      }
    } else {
      state.items.push({
        id: item.id || 'vid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title: item.title || 'Untitled Video',
        caption: item.caption || '',
        videoUrl: item.videoUrl || item.downloadUrl || '',
        scheduledDate: item.scheduledDate || new Date().toISOString(),
        platforms: item.platforms || ['Facebook'],
        pageId: item.pageId || process.env.FB_PAGE_ID || null,
        status: item.status || 'Pending', // Pending | Processing | Published | Failed
        idempotencyKey: item.idempotencyKey || `key_${item.id}_${item.scheduledDate}`,
        retries: 0,
        error: null,
        publishedAt: null,
        postId: null,
        postUrl: null,
        createdAt: new Date().toISOString()
      });
    }
  });
  saveQueue(state);
  return state.items;
}

export function updateQueueItem(id, updates) {
  const state = loadQueue();
  const item = state.items.find(i => i.id === id);
  if (item) {
    Object.assign(item, updates);
    if (updates.status === 'Published' && item.idempotencyKey) {
      state.processedKeys[item.idempotencyKey] = {
        postId: item.postId,
        postUrl: item.postUrl,
        publishedAt: new Date().toISOString()
      };
    }
    saveQueue(state);
  }
  return item;
}

export function isIdempotencyKeyProcessed(key) {
  if (!key) return null;
  const state = loadQueue();
  return state.processedKeys[key] || null;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const state = loadQueue();
    return res.status(200).json({
      success: true,
      total: state.items.length,
      pending: state.items.filter(i => i.status === 'Pending').length,
      published: state.items.filter(i => i.status === 'Published').length,
      failed: state.items.filter(i => i.status === 'Failed').length,
      items: state.items
    });
  }

  if (req.method === 'POST') {
    const { items = [] } = req.body || {};
    const updatedItems = enqueueItems(Array.isArray(items) ? items : [items]);
    return res.status(200).json({
      success: true,
      count: updatedItems.length,
      items: updatedItems
    });
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
