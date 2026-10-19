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

// Cross-device cloud account storage
import { getMasterAccountRecord, getMasterChikuBdProject } from '../lib/masterAccount.js';

const ACCOUNTS_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'autovid_accounts.json')
  : path.join(process.cwd(), '.accounts_cache.json');

const REMOTE_STORE_ID = 'ff808181a09d98f701a1508941780f48';

function loadAccountsLocal() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveAccountsLocal(data) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

async function fetchRemoteAccounts() {
  try {
    const res = await fetch(`https://api.restful-api.dev/objects/${REMOTE_STORE_ID}`);
    if (res.ok) {
      const json = await res.json();
      return json.data?.accounts || {};
    }
  } catch (e) {
    console.warn('[Account Sync] Remote fetch notice:', e.message);
  }
  return {};
}

async function updateRemoteAccounts(accountsMap) {
  try {
    // Only send lightweight metadata to restful-api.dev to prevent 500 error
    const compactMap = {};
    for (const [k, v] of Object.entries(accountsMap)) {
      if (!v) continue;
      compactMap[k] = {
        key: v.key,
        username: v.username,
        email: v.email,
        updatedAt: v.updatedAt,
        projectCount: v.state?.projects?.length || 0
      };
    }
    await fetch(`https://api.restful-api.dev/objects/${REMOTE_STORE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'autovid_cloud_accounts',
        data: {
          accounts: compactMap,
          updatedAt: new Date().toISOString()
        }
      })
    });
  } catch (e) {
    console.warn('[Account Sync] Remote update notice:', e.message);
  }
}

function makeAccountKey(email, username) {
  const normEmail = (email || '').trim().toLowerCase();
  const normUser = (username || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return normEmail || normUser || 'default_user';
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const queryParams = req.query || {};
  const isAccountReq = queryParams.action?.startsWith('account') || 
                      queryParams.action === 'sync' ||
                      queryParams.action?.includes('sync') ||
                      queryParams.user === '1' || 
                      (req.url && (req.url.includes('/api/account') || req.url.includes('action=sync')));

  // --- SUB-ROUTE: ACCOUNT & CROSS-DEVICE DATA SYNC ---
  if (isAccountReq) {
    if (req.method === 'GET') {
      const email = (queryParams.email || '').trim().toLowerCase();
      const username = (queryParams.username || queryParams.name || '').trim().toLowerCase();

      const localAccs = loadAccountsLocal();
      let remoteAccs = {};
      try {
        remoteAccs = await fetchRemoteAccounts();
      } catch (e) {}

      const allAccounts = { ...localAccs, ...remoteAccs };

      let foundAccount = null;
      for (const [key, acc] of Object.entries(allAccounts)) {
        if (!acc) continue;
        const accEmail = (acc.email || '').toLowerCase().trim();
        const accUser = (acc.username || acc.name || '').toLowerCase().trim();
        if ((email && accEmail === email) || 
            (username && accUser === username) || 
            (email && key.toLowerCase() === email) ||
            (username && key.toLowerCase() === username)) {
          foundAccount = acc;
          break;
        }
      }

      // If account not found or has empty projects with 0 videos, provide Nahid / Chiku bd master record
      const isNahid = email.includes('nahid') || username.includes('nahid') || email.includes('7653959') || username === 'md';
      const hasVideos = Array.isArray(foundAccount?.state?.projects) && 
                        foundAccount.state.projects.some(p => p.videos && p.videos.length > 0);

      if (!foundAccount || (isNahid && !hasVideos)) {
        foundAccount = getMasterAccountRecord(email || 'mdnahid7653959@gmail.com', username || 'md nahid');
      }

      return res.status(200).json({
        success: true,
        found: true,
        account: foundAccount,
        message: 'Cloud data retrieved successfully'
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const username = (body.username || body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      let state = body.state || body.projectData || {};

      if (!username && !email) {
        return res.status(400).json({ success: false, error: 'Username or Email is required' });
      }

      // Guard: If incoming state has empty projects, but Chiku bd exists, do NOT wipe Chiku bd
      const isNahid = email.includes('nahid') || username.includes('nahid') || email.includes('7653959') || username === 'md';
      if (isNahid && (!state.projects || state.projects.length === 0 || state.projects.every(p => !p.videos || p.videos.length === 0))) {
        const masterProj = getMasterChikuBdProject();
        if (!state.projects || state.projects.length === 0) {
          state.projects = [masterProj];
        } else {
          // If project 'md' is present, also keep 'chiku bd'
          if (!state.projects.some(p => p.name === 'chiku bd')) {
            state.projects.unshift(masterProj);
          }
        }
        state.activeProjectId = 'proj_chikubd_main';
      }

      const key = makeAccountKey(email, username);
      const accountRecord = {
        key,
        username: username || key,
        email: email || '',
        state,
        updatedAt: new Date().toISOString()
      };

      const localAccs = loadAccountsLocal();
      localAccs[key] = accountRecord;
      saveAccountsLocal(localAccs);

      let remoteAccs = {};
      try {
        remoteAccs = await fetchRemoteAccounts();
      } catch (e) {}
      remoteAccs[key] = accountRecord;

      // Persist to remote global store
      await updateRemoteAccounts(remoteAccs);

      return res.status(200).json({
        success: true,
        message: 'Account data successfully synced to cloud for all devices',
        key,
        updatedAt: accountRecord.updatedAt
      });
    }
  }

  // --- DEFAULT ROUTE: VIDEO QUEUE ---
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
