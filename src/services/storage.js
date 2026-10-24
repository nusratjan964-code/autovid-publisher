// LocalStorage & State Management with Zero Fake Data
import { deleteVideoBlob } from './videoStore.js';
import { getMasterChikuBdProject, getMasterAccountRecord, MASTER_FB_TOKEN } from './masterAccount.js';

const STORAGE_KEY = 'omniflow_studio_clean_state_v2';

const emptyInitialState = {
  currentUser: {
    id: null,
    name: '',
    email: '',
    avatar: '',
    isLoggedIn: false
  },
  activeProjectId: null,
  projects: []
};

class StorageService {
  constructor() {
    this.cloudSyncTimeout = null;
    this.lastSyncedAt = null;
    this.state = this.loadState();
  }

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed?.projects)) {
          const cachedFbToken = (typeof localStorage !== 'undefined' ? (localStorage.getItem('omni_fb_page_token') || localStorage.getItem('omni_fb_access_token')) : '') || MASTER_FB_TOKEN || '';
          const cachedYtToken = (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_access_token') : '') || '';

          // Ensure Chiku bd project is present if user is md nahid or if projects have 0 videos
          const isNahid = (parsed.currentUser?.email || '').toLowerCase().includes('nahid') || 
                          (parsed.currentUser?.name || '').toLowerCase().includes('nahid') || 
                          (parsed.currentUser?.email || '').includes('7653959');
          const hasProjectWithVideos = parsed.projects.some(p => p.videos && p.videos.length > 0);

          if (!parsed.projects.some(p => p.name === 'chiku bd') && (isNahid || !hasProjectWithVideos)) {
            const masterProj = getMasterChikuBdProject();
            parsed.projects.unshift(masterProj);
            if (!parsed.activeProjectId || !hasProjectWithVideos) {
              parsed.activeProjectId = masterProj.id;
            }
          }

          parsed.projects.forEach(p => {
            if (Array.isArray(p.socialAccounts)) {
              p.socialAccounts.forEach(a => {
                if (a.id === 'facebook') {
                  const tokenToUse = a.accessToken || a.token || cachedFbToken || '';
                  if (tokenToUse) {
                    a.accessToken = tokenToUse;
                    a.token = tokenToUse;
                  }
                  a.tokenConfigured = true;
                  a.isPermanent = true;
                  if (a.name === 'Facebook Reels') {
                    a.name = 'Facebook Reels & Page';
                  }
                  if (!a.pageId) a.pageId = '1309863422219233';
                  if (!a.pageName) a.pageName = 'Chiku bd';
                  if (!a.handle) a.handle = '@chikubd';
                  if (a.connected === undefined) a.connected = true;
                  if (a.active === undefined) a.active = true;
                }
                if (a.id === 'youtube') {
                  // Purge mock Bob Channel or unwanted mock channels
                  if (a.channelTitle === 'Bob Channel' || a.channelId === 'UC_BOB') {
                    a.channelTitle = 'chiku bd';
                    a.channelId = 'UCCOo5jxEtLRgJQUkBMnt-QQ';
                    a.handle = '@chikubd';
                    a.accessToken = '';
                    a.token = '';
                    a.refreshToken = '';
                    a.hasRefreshToken = false;
                    a.tokenConfigured = false;
                    a.connected = false;
                    a.active = false;
                  }

                  const ytToUse = (a.accessToken || a.token || cachedYtToken || '').trim();
                  if (ytToUse && ytToUse !== 'server_vault_yt_token' && !ytToUse.includes('bob')) {
                    a.accessToken = ytToUse;
                    a.token = ytToUse;
                  } else if (ytToUse.includes('bob')) {
                    a.accessToken = '';
                    a.token = '';
                  }

                  // Check if actual YouTube token or permanent refresh token exists
                  const hasRealToken = !!(
                    (a.accessToken && !a.accessToken.includes('bob')) ||
                    a.refreshToken ||
                    a.hasRefreshToken ||
                    a.tokenConfigured ||
                    (cachedYtToken && cachedYtToken !== 'server_vault_yt_token' && !cachedYtToken.includes('bob'))
                  );

                  if (!hasRealToken) {
                    a.connected = false;
                    a.active = false;
                    a.tokenConfigured = false;
                    a.hasRefreshToken = false;
                  } else {
                    a.connected = true;
                    a.active = true;
                    a.tokenConfigured = true;
                    if (a.hasRefreshToken || a.refreshToken) {
                      a.hasRefreshToken = true;
                      a.isPermanent = true;
                    }
                  }

                  if (!a.channelTitle || a.channelTitle === 'md nahid') {
                    a.channelTitle = 'chiku bd';
                  }
                  if (!a.channelId) {
                    a.channelId = 'UCCOo5jxEtLRgJQUkBMnt-QQ';
                  }
                  if (!a.handle || a.handle === '@mdnahid-du5ln') {
                    a.handle = '@chikubd';
                  }
                }
              });
            }

            if (p.scheduleSettings) {
              if (Array.isArray(p.scheduleSettings.targetPlatforms)) {
                if (!p.scheduleSettings.targetPlatforms.includes('facebook')) {
                  p.scheduleSettings.targetPlatforms.push('facebook');
                }
                const ytAccount = p.socialAccounts?.find(a => a.id === 'youtube');
                if (ytAccount && ytAccount.connected && ytAccount.active) {
                  if (!p.scheduleSettings.targetPlatforms.includes('youtube')) {
                    p.scheduleSettings.targetPlatforms.push('youtube');
                  }
                } else {
                  p.scheduleSettings.targetPlatforms = p.scheduleSettings.targetPlatforms.filter(id => id !== 'youtube');
                }
              }
              if (!p.scheduleSettings.frequency || p.scheduleSettings.frequency === 1) {
                p.scheduleSettings.frequency = 3;
              }
              if (!Array.isArray(p.scheduleSettings.times) || p.scheduleSettings.times.length === 0) {
                p.scheduleSettings.times = ['19:00', '21:00', '23:00'];
              }
              if (!p.scheduleSettings.preferredTime) {
                p.scheduleSettings.preferredTime = '19:00';
              }
            }
          });

          // If active project is empty or 'md' with 0 videos, switch to Chiku bd
          const active = parsed.projects.find(p => p.id === parsed.activeProjectId);
          if (active && (!active.videos || active.videos.length === 0)) {
            const chiku = parsed.projects.find(p => p.name === 'chiku bd' && p.videos && p.videos.length > 0);
            if (chiku) {
              parsed.activeProjectId = chiku.id;
            }
          }

          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load from localStorage, initializing clean state', e);
    }
    
    // Default fallback to master Chiku bd project
    const defaultState = {
      currentUser: {
        id: 'usr_md_nahid',
        name: 'md nahid',
        email: 'mdnahid7653959@gmail.com',
        avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=md%20nahid&backgroundColor=4f46e5&textColor=ffffff',
        isLoggedIn: true
      },
      activeProjectId: 'proj_chikubd_main',
      projects: [getMasterChikuBdProject()]
    };
    this.saveState(defaultState);
    return defaultState;
  }

  saveState(stateToSave = null, skipCloudSync = false) {
    if (stateToSave) {
      this.state = stateToSave;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }

    if (!skipCloudSync && this.state.currentUser?.isLoggedIn) {
      this.scheduleCloudSync();
    }
  }

  scheduleCloudSync() {
    if (this.cloudSyncTimeout) clearTimeout(this.cloudSyncTimeout);
    this.cloudSyncTimeout = setTimeout(() => {
      this.syncToCloud().catch(err => console.warn('[Storage] Auto cloud sync note:', err.message));
    }, 2000);
  }

  async syncToCloud() {
    const user = this.state.currentUser;
    if (!user || (!user.email && !user.name)) return false;

    try {
      const res = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.name,
          email: user.email,
          state: {
            projects: this.state.projects,
            activeProjectId: this.state.activeProjectId,
            currentUser: user,
            updatedAt: new Date().toISOString()
          }
        })
      });

      if (res.ok) {
        this.lastSyncedAt = new Date();
        return true;
      }
    } catch (e) {
      console.warn('[Storage] syncToCloud notice:', e.message);
    }
    return false;
  }

  async syncFromCloud(username, email) {
    const uName = (username || '').trim();
    const uEmail = (email || '').trim();
    if (!uName && !uEmail) return { success: false, found: false };

    try {
      const q = new URLSearchParams({
        action: 'sync',
        username: uName,
        email: uEmail
      }).toString();

      const res = await fetch(`/api/account?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.account?.state) {
          const remoteState = data.account.state;
          if (Array.isArray(remoteState.projects) && remoteState.projects.length > 0) {
            this.state.projects = remoteState.projects;
            this.state.activeProjectId = remoteState.activeProjectId || remoteState.projects[0].id;
          }

          this.state.currentUser = {
            id: remoteState.currentUser?.id || 'usr_' + Date.now(),
            name: uName || data.account.username || this.state.currentUser.name,
            email: uEmail || data.account.email || this.state.currentUser.email,
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(uName || 'Creator')}&backgroundColor=4f46e5&textColor=ffffff`,
            isLoggedIn: true
          };

          this.lastSyncedAt = new Date();
          this.saveState(null, true);
          return { success: true, found: true, projectCount: this.state.projects.length };
        }
      }
    } catch (e) {
      console.warn('[Storage] syncFromCloud notice:', e.message);
    }

    // Resilient fallback for Nahid / Chiku bd
    const isNahid = uEmail.toLowerCase().includes('nahid') || uName.toLowerCase().includes('nahid') || uEmail.includes('7653959') || uName === 'md';
    if (isNahid) {
      this.restoreMasterAccount(uEmail, uName);
      return { success: true, found: true, projectCount: this.state.projects.length };
    }

    // If no remote state found, but user has local projects, upload them as initial cloud backup
    if (this.state.projects.length > 0) {
      this.syncToCloud().catch(() => {});
    }

    return { success: true, found: false, projectCount: this.state.projects.length };
  }

  restoreMasterAccount(email = 'mdnahid7653959@gmail.com', username = 'md nahid') {
    const masterProj = getMasterChikuBdProject();
    const existingIndex = this.state.projects.findIndex(p => p.name === 'chiku bd' || p.id === masterProj.id);
    if (existingIndex >= 0) {
      this.state.projects[existingIndex] = masterProj;
    } else {
      this.state.projects.unshift(masterProj);
    }
    this.state.activeProjectId = masterProj.id;
    this.state.currentUser = {
      id: 'usr_md_nahid',
      name: username || 'md nahid',
      email: email || 'mdnahid7653959@gmail.com',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username || 'md nahid')}&backgroundColor=4f46e5&textColor=ffffff`,
      isLoggedIn: true
    };
    try {
      localStorage.setItem('omni_fb_page_token', MASTER_FB_TOKEN);
    } catch (e) {}
    this.lastSyncedAt = new Date();
    this.saveState(null, false);
    return { success: true, project: masterProj };
  }

  getState() {
    return this.state;
  }

  getCurrentUser() {
    return this.state.currentUser;
  }

  loginUser({ name, email }) {
    const uName = (name || '').trim();
    const uEmail = (email || '').trim();
    const isNahid = uEmail.toLowerCase().includes('nahid') || uName.toLowerCase().includes('nahid') || uEmail.includes('7653959') || uName === 'md';

    if (isNahid && (!this.state.projects.some(p => p.videos && p.videos.length > 0))) {
      return this.restoreMasterAccount(uEmail, uName).project;
    }

    this.state.currentUser = {
      id: 'usr_' + Date.now(),
      name: uName || 'Creator',
      email: uEmail || 'creator@example.com',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(uName || 'Creator')}&backgroundColor=4f46e5&textColor=ffffff`,
      isLoggedIn: true
    };
    this.saveState();
    return this.state.currentUser;
  }

  logoutUser() {
    this.state.currentUser = {
      id: null,
      name: '',
      email: '',
      avatar: '',
      isLoggedIn: false
    };
    this.saveState(null, true);
  }

  getActiveProject() {
    if (!this.state.activeProjectId || this.state.projects.length === 0) {
      return null;
    }
    return this.state.projects.find(p => p.id === this.state.activeProjectId) || this.state.projects[0];
  }

  setActiveProjectId(projectId) {
    if (this.state.projects.some(p => p.id === projectId)) {
      this.state.activeProjectId = projectId;
      this.saveState();
    }
  }

  createProject({ name, niche, description, targetPlatforms = ['insta', 'youtube', 'tiktok'] }) {
    const id = 'proj_' + Date.now();
    const newProject = {
      id,
      name: name.trim() || 'My Video Project',
      niche: niche || 'General Content',
      description: description ? description.trim() : '',
      createdAt: new Date().toISOString(),
      driveConfig: {
        folderUrl: '',
        folderName: '',
        lastSync: null,
        status: 'unlinked',
        totalScanned: 0
      },
      socialAccounts: [
        { id: 'insta', name: 'Instagram Reels', icon: 'instagram', color: '#E1306C', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' },
        { id: 'youtube', name: 'YouTube Shorts', icon: 'youtube', color: '#FF0000', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' },
        { id: 'tiktok', name: 'TikTok', icon: 'video', color: '#000000', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' },
        { id: 'facebook', name: 'Facebook Reels & Page', icon: 'facebook', color: '#1877F2', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' },
        { id: 'linkedin', name: 'LinkedIn Video', icon: 'linkedin', color: '#0A66C2', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' },
        { id: 'twitter', name: 'X / Twitter', icon: 'twitter', color: '#0f172a', handle: '', connected: false, active: false, followers: '0', lastPost: 'Never' }
      ],
      aiSettings: {
        provider: 'gemini',
        apiKey: '',
        tone: 'Viral & High Energy',
        hashtagCount: 6,
        customPrompt: 'Create a high-retention hook in the first line, 2 engaging body lines, and trending hashtags for high organic reach.',
        callToAction: 'Follow for more daily content!',
        autoGenerateOnSync: true
      },
      scheduleSettings: {
        enabled: true,
        frequency: 3,
        preferredTime: '19:00',
        times: ['19:00', '21:00', '23:00'],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka',
        postingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        targetPlatforms: targetPlatforms
      },
      videos: [],
      logs: []
    };

    this.state.projects.push(newProject);
    this.state.activeProjectId = id;
    this.saveState();
    return newProject;
  }

  updateActiveProject(partialData) {
    const project = this.getActiveProject();
    if (!project) return null;
    Object.assign(project, partialData);
    this.saveState();
    return project;
  }

  deleteProject(projectId) {
    this.state.projects = this.state.projects.filter(p => p.id !== projectId);
    if (this.state.activeProjectId === projectId) {
      this.state.activeProjectId = this.state.projects.length > 0 ? this.state.projects[0].id : null;
    }
    this.saveState();
  }

  addVideoToActiveProject(videoData) {
    const project = this.getActiveProject();
    if (!project) return null;
    if (!Array.isArray(project.videos)) {
      project.videos = [];
    }
    const targetPlatforms = project.scheduleSettings?.targetPlatforms || ['facebook', 'youtube'];
    const newVideo = {
      id: 'vid_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      status: 'ready',
      scheduledDate: null,
      publishedAt: null,
      caption: '',
      hook: '',
      platforms: targetPlatforms,
      ...videoData
    };
    project.videos.unshift(newVideo);
    this.saveState();
    return newVideo;
  }

  updateVideo(videoId, partialData) {
    const project = this.getActiveProject();
    if (!project) return null;
    const video = project.videos.find(v => v.id === videoId);
    if (video) {
      Object.assign(video, partialData);
      this.saveState();
    }
    return video;
  }

  deleteVideo(videoId) {
    const project = this.getActiveProject();
    if (!project) return;
    project.videos = project.videos.filter(v => v.id !== videoId);
    this.saveState();
    try {
      deleteVideoBlob(videoId);
    } catch (e) {
      // safe fallback
    }
  }

  addLog(logItem) {
    const project = this.getActiveProject();
    if (!project) return;
    const log = {
      id: 'log_' + Date.now(),
      timestamp: new Date().toLocaleString(),
      ...logItem
    };
    if (!project.logs) project.logs = [];
    project.logs.unshift(log);
    this.saveState();
    return log;
  }

  resetAllData() {
    this.state = JSON.parse(JSON.stringify(emptyInitialState));
    this.saveState();
    return this.state;
  }
}

export const storage = new StorageService();
