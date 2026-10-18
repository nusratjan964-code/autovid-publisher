// LocalStorage & State Management with Zero Fake Data
import { deleteVideoBlob } from './videoStore.js';

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
    this.state = this.loadState();
  }

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed?.projects)) {
          const cachedFbToken = (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_fb_page_token') : '') || '';
          const cachedYtToken = (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_access_token') : '') || '';

          parsed.projects.forEach(p => {
            if (Array.isArray(p.socialAccounts)) {
              p.socialAccounts.forEach(a => {
                if (a.id === 'facebook') {
                  if (a.token && !cachedFbToken && typeof localStorage !== 'undefined') {
                    try { localStorage.setItem('omni_fb_page_token', a.token); } catch (e) {}
                  }
                  if (cachedFbToken) {
                    a.accessToken = cachedFbToken;
                    a.token = cachedFbToken;
                  }
                  a.tokenConfigured = !!(a.accessToken || a.token || cachedFbToken);
                  if (a.name === 'Facebook Reels') {
                    a.name = 'Facebook Reels & Page';
                  }
                }
                if (a.id === 'youtube') {
                  if (a.connected === undefined) {
                    a.connected = true;
                    a.active = true;
                  }
                  if (cachedYtToken) {
                    a.accessToken = cachedYtToken;
                    a.token = cachedYtToken;
                  }
                  a.tokenConfigured = !!(a.accessToken || a.token || cachedYtToken);
                }
              });
            }

            if (p.scheduleSettings) {
              if (Array.isArray(p.scheduleSettings.targetPlatforms)) {
                if (!p.scheduleSettings.targetPlatforms.includes('facebook')) p.scheduleSettings.targetPlatforms.push('facebook');
                if (!p.scheduleSettings.targetPlatforms.includes('youtube')) p.scheduleSettings.targetPlatforms.push('youtube');
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
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not load from localStorage, initializing clean state', e);
    }
    this.saveState(emptyInitialState);
    return JSON.parse(JSON.stringify(emptyInitialState));
  }

  saveState(stateToSave = null) {
    if (stateToSave) {
      this.state = stateToSave;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  }

  getState() {
    return this.state;
  }

  getCurrentUser() {
    return this.state.currentUser;
  }

  loginUser({ name, email }) {
    this.state.currentUser = {
      id: 'usr_' + Date.now(),
      name: name.trim() || 'Creator',
      email: email.trim() || 'creator@example.com',
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Creator')}&backgroundColor=4f46e5&textColor=ffffff`,
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
    this.saveState();
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
    const newVideo = {
      id: 'vid_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      status: 'ready',
      scheduledDate: null,
      publishedAt: null,
      caption: '',
      hook: '',
      platforms: project.scheduleSettings.targetPlatforms || [],
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
