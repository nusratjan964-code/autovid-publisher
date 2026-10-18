import './style.css';
import { createIcons, icons } from 'lucide';
import { storage } from './services/storage.js';
import { DriveSyncService } from './services/driveSync.js';
import { SocialManagerService, AVAILABLE_PLATFORMS } from './services/socialManager.js';
import { AICaptionService } from './services/aiCaption.js';
import { SchedulerService } from './services/scheduler.js';
import { GoogleAuthService } from './services/googleAuth.js';
import { getVideoBlob } from './services/videoStore.js';

class OmniFlowApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.init();
  }

  init() {
    this.render();
    this.bindGlobalEvents();
    const activeProject = storage.getActiveProject();
    if (activeProject) {
      GoogleAuthService.syncStoredCredentials(activeProject).then(synced => {
        if (synced) {
          console.log('[OmniFlow] Restored YouTube OAuth credentials from server cache');
          this.render();
        }
      });
    }
  }

  showToast(message, type = 'success') {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;
    root.appendChild(toast);
    createIcons({ icons });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  refreshIcons() {
    setTimeout(() => {
      createIcons({ icons });
    }, 10);
  }

  render() {
    const app = document.getElementById('app');
    const user = storage.getCurrentUser();

    // 1. If user is not logged in: Render Auth Portal
    if (!user || !user.isLoggedIn) {
      this.renderAuthPortal(app);
      this.refreshIcons();
      return;
    }

    const allProjects = storage.getState().projects;
    const project = storage.getActiveProject();

    // 2. If user is logged in but has no projects yet: Render "Add Your Project Name" Onboarding
    if (!project || allProjects.length === 0) {
      this.renderInitialProjectSetup(app, user);
      this.refreshIcons();
      return;
    }

    // 3. User is logged in & has an active project: Render Studio Dashboard
    app.innerHTML = `
      <div class="app-layout">
        <!-- Sidebar Navigation -->
        <aside class="app-sidebar">
          <div class="sidebar-header">
            <div class="brand-badge">
              <i data-lucide="zap"></i>
            </div>
            <div class="brand-name">
              OmniFlow <span>PRO</span>
            </div>
          </div>

          <nav class="sidebar-nav">
            <div class="nav-label">Main Workspace</div>
            <a class="nav-item ${this.currentTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">
              <i data-lucide="layout-dashboard"></i>
              <span>Dashboard</span>
            </a>
            <a class="nav-item ${this.currentTab === 'drive' ? 'active' : ''}" data-tab="drive">
              <i data-lucide="folder-sync"></i>
              <span>Drive & Upload</span>
              <span class="nav-badge">${project.videos.length}</span>
            </a>
            <a class="nav-item ${this.currentTab === 'videos' ? 'active' : ''}" data-tab="videos">
              <i data-lucide="film"></i>
              <span>Video Pipeline</span>
              <span class="nav-badge">${project.videos.length}</span>
            </a>
            <a class="nav-item ${this.currentTab === 'social' ? 'active' : ''}" data-tab="social">
              <i data-lucide="share-2"></i>
              <span>Social Accounts</span>
              <span class="nav-badge">${project.socialAccounts.filter(a => a.connected).length}/6</span>
            </a>
            
            <div class="nav-label">Automation & AI</div>
            <a class="nav-item ${this.currentTab === 'ai' ? 'active' : ''}" data-tab="ai">
              <i data-lucide="sparkles"></i>
              <span>AI Caption Studio</span>
            </a>
            <a class="nav-item ${this.currentTab === 'schedule' ? 'active' : ''}" data-tab="schedule">
              <i data-lucide="calendar-clock"></i>
              <span>Daily Timing Schedule</span>
            </a>
            <a class="nav-item ${this.currentTab === 'logs' ? 'active' : ''}" data-tab="logs">
              <i data-lucide="history"></i>
              <span>Publishing History</span>
              <span class="nav-badge">${project.logs ? project.logs.length : 0}</span>
            </a>
          </nav>

          <!-- User Profile -->
          <div class="sidebar-footer">
            <div class="user-profile-card">
              <img src="${user.avatar}" alt="${user.name}" class="user-avatar" />
              <div class="user-info">
                <div class="user-name">${user.name}</div>
                <div class="user-role">${user.email}</div>
              </div>
              <button class="btn-icon-soft" id="btn-logout" title="Sign Out">
                <i data-lucide="log-out"></i>
              </button>
            </div>
          </div>
        </aside>

        <!-- Main Workspace -->
        <main class="app-main">
          <!-- Top Header -->
          <header class="top-header">
            <div class="header-left">
              <!-- Multi-Project Switcher -->
              <div class="project-selector-wrapper">
                <button class="project-select-btn" id="btn-project-dropdown">
                  <div class="project-icon-box">
                    <i data-lucide="layers"></i>
                  </div>
                  <div class="project-title-group">
                    <span class="project-select-label">Active Project</span>
                    <span class="project-select-name">${project.name}</span>
                  </div>
                  <i data-lucide="chevron-down" style="width: 16px; height: 16px; color: var(--text-muted)"></i>
                </button>
                <button class="btn-add-project" id="btn-open-new-project-modal">
                  <i data-lucide="plus"></i>
                  <span>Add Project</span>
                </button>
              </div>
            </div>

            <div class="header-right">
              <button class="btn btn-outline btn-sm" id="btn-header-sync">
                <i data-lucide="folder-sync"></i>
                <span>Sync Videos</span>
              </button>
              <button class="btn btn-outline btn-sm" id="btn-header-simulate" ${project.videos.length === 0 ? 'disabled' : ''} style="border-color:#10B981; color:#10B981;">
                <i data-lucide="play-circle"></i>
                <span>Simulate Publish</span>
              </button>
              <button class="btn btn-primary btn-sm" id="btn-header-publish" ${project.videos.length === 0 ? 'disabled' : ''}>
                <i data-lucide="send"></i>
                <span>Auto-Publish Video</span>
              </button>
            </div>
          </header>

          <!-- Dynamic Workspace Content -->
          <div class="content-wrapper">
            ${this.renderActiveTabContent(project, allProjects, user)}
          </div>
        </main>
      </div>
    `;

    this.refreshIcons();
    this.bindTabEvents();
  }

  // --- STEP 1: AUTHENTICATION PORTAL ---
  renderAuthPortal(container) {
    container.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-brand">
            <i data-lucide="zap" style="width:28px; height:28px;"></i>
          </div>
          <h2 class="auth-title">Sign in to OmniFlow AI</h2>
          <p class="auth-subtitle">Automated short-form video publishing to social media with AI captions and daily scheduling.</p>

          <form id="form-auth-login" style="text-align:left;">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" class="form-input" id="auth-input-name" placeholder="e.g. Nahid Hasan" required />
            </div>

            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" class="form-input" id="auth-input-email" placeholder="name@example.com" required />
            </div>

            <button type="submit" class="btn btn-primary" style="width:100%; padding:12px; margin-top:8px;">
              <span>Continue to Studio</span>
              <i data-lucide="arrow-right"></i>
            </button>
          </form>

          <div style="margin:20px 0; display:flex; align-items:center; gap:12px;">
            <div style="flex:1; height:1px; background:var(--border-light);"></div>
            <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">or</span>
            <div style="flex:1; height:1px; background:var(--border-light);"></div>
          </div>

          <button class="btn btn-outline" id="btn-quick-demo-login" style="width:100%;">
            <i data-lucide="user-check"></i>
            <span>Quick Start as Nahid (Creator)</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('form-auth-login').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('auth-input-name').value;
      const email = document.getElementById('auth-input-email').value;
      storage.loginUser({ name, email });
      this.showToast(`Welcome back, ${name}!`, 'success');
      this.render();
    });

    document.getElementById('btn-quick-demo-login').addEventListener('click', () => {
      storage.loginUser({ name: 'Nahid Hasan', email: 'nahid.creator@example.com' });
      this.showToast('Logged in successfully!', 'success');
      this.render();
    });
  }

  // --- STEP 2: ONBOARDING ("Add Your Project Name") ---
  renderInitialProjectSetup(container, user) {
    container.innerHTML = `
      <div style="min-height: 100vh; background: var(--bg-app); padding: 40px 20px;">
        <div class="onboarding-container">
          <div style="text-align:center; margin-bottom:28px;">
            <div class="onboarding-step-badge">
              <i data-lucide="plus-circle"></i> Step 1 of 3: Setup Project
            </div>
            <h2 style="font-size:1.75rem; font-weight:800; color:var(--text-primary); letter-spacing:-0.02em;">
              Add Your Project Name
            </h2>
            <p style="font-size:0.92rem; color:var(--text-muted); margin-top:6px;">
              Create your video publishing pipeline. You will be able to connect your social media and Google Drive right next.
            </p>
          </div>

          <form id="form-create-first-project">
            <div class="form-group">
              <label class="form-label" style="font-size:0.9rem;">1. Project Name *</label>
              <input 
                type="text" 
                class="form-input" 
                id="init-project-name" 
                placeholder="e.g. AI Tech & Innovation Shorts" 
                required 
                autofocus
                style="padding:13px 16px; font-size:1rem;"
              />
              <div class="form-hint">Give your channel, brand, or client campaign a recognizable name.</div>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size:0.9rem;">2. Content Category / Niche</label>
              <select class="form-select" id="init-project-niche" style="padding:12px 14px;">
                <option value="Technology & AI">Technology & AI</option>
                <option value="Fitness & Health">Fitness & Health</option>
                <option value="Business & Finance">Business & Finance</option>
                <option value="Entertainment & Comedy">Entertainment & Comedy</option>
                <option value="Education & Tips">Education & Life Hacks</option>
                <option value="E-commerce & Products">E-commerce & Products</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size:0.9rem;">3. Description (Optional)</label>
              <textarea class="form-textarea" id="init-project-desc" placeholder="Brief notes about your posting target or theme..."></textarea>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:32px; padding-top:20px; border-top:1px solid var(--border-light);">
              <span style="font-size:0.82rem; color:var(--text-muted);">You can add more projects anytime.</span>
              <button type="submit" class="btn btn-primary btn-lg">
                <span>Create Project & Continue</span>
                <i data-lucide="arrow-right"></i>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('form-create-first-project').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('init-project-name').value.trim();
      const niche = document.getElementById('init-project-niche').value;
      const desc = document.getElementById('init-project-desc').value.trim();

      if (!name) {
        alert('Please enter a project name.');
        return;
      }

      storage.createProject({ name, niche, description: desc });
      this.showToast(`Project "${name}" created!`, 'success');
      this.render();
    });
  }

  // --- RENDER ACTIVE TAB CONTENT ---
  renderActiveTabContent(project, allProjects, user) {
    switch (this.currentTab) {
      case 'dashboard':
        return this.renderDashboardView(project);
      case 'drive':
        return this.renderDriveView(project);
      case 'videos':
        return this.renderVideosView(project);
      case 'social':
        return this.renderSocialView(project);
      case 'ai':
        return this.renderAIView(project);
      case 'schedule':
        return this.renderScheduleView(project);
      case 'logs':
        return this.renderLogsView(project);
      default:
        return this.renderDashboardView(project);
    }
  }

  // --- 1. DASHBOARD VIEW (Clean with zero fake data) ---
  renderDashboardView(project) {
    const totalVideos = project.videos.length;
    const readyVideos = project.videos.filter(v => v.status === 'ready' || v.status === 'scheduled').length;
    const publishedVideos = project.videos.filter(v => v.status === 'published').length;
    const connectedAccounts = project.socialAccounts.filter(a => a.connected && a.active).length;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">${project.name}</h1>
          <p class="page-subtitle">Category: <strong>${project.niche}</strong> • Automated 1-Click Publishing Studio</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" id="btn-dash-add-videos">
            <i data-lucide="folder-sync"></i>
            <span>Add Videos</span>
          </button>
          <button class="btn btn-primary" id="btn-dash-connect-social">
            <i data-lucide="share-2"></i>
            <span>Connect Social Media</span>
          </button>
        </div>
      </div>

      <!-- Real Metrics Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Videos Loaded</div>
            <div class="stat-value">${totalVideos}</div>
            <div class="stat-trend"><i data-lucide="film"></i> Drive / Local Files</div>
          </div>
          <div class="stat-icon" style="background:var(--primary-subtle); color:var(--primary);">
            <i data-lucide="film"></i>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Queued for Dispatch</div>
            <div class="stat-value">${readyVideos}</div>
            <div class="stat-trend"><i data-lucide="clock"></i> Daily ${project.scheduleSettings.preferredTime} schedule</div>
          </div>
          <div class="stat-icon" style="background:var(--warning-subtle); color:var(--warning);">
            <i data-lucide="calendar-check"></i>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Connected Platforms</div>
            <div class="stat-value">${connectedAccounts} <span style="font-size:0.9rem; font-weight:500; color:var(--text-muted);">/ 6</span></div>
            <div class="stat-trend"><i data-lucide="zap"></i> 1-Click Active</div>
          </div>
          <div class="stat-icon" style="background:var(--success-subtle); color:var(--success);">
            <i data-lucide="share-2"></i>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-info">
            <div class="stat-label">Published Reels & Shorts</div>
            <div class="stat-value">${publishedVideos}</div>
            <div class="stat-trend"><i data-lucide="check-circle"></i> Live audit logs</div>
          </div>
          <div class="stat-icon" style="background:#f5f3ff; color:#8b5cf6;">
            <i data-lucide="send"></i>
          </div>
        </div>
      </div>

      <!-- Quick Onboarding Checklist -->
      <div class="checklist-card">
        <div class="checklist-title">Publishing Setup Checklist</div>
        <div class="checklist-desc">Complete the steps below to start automated daily publishing for <strong>${project.name}</strong>:</div>
        
        <div class="checklist-steps">
          <div class="checklist-step-item done">
            <div>
              <div class="checklist-step-header">
                <span class="step-num-circle">✓</span>
                <span>1. Project Created</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">"${project.name}" is active.</p>
            </div>
            <span class="badge badge-success" style="align-self:flex-start;">Completed</span>
          </div>

          <div class="checklist-step-item ${connectedAccounts > 0 ? 'done' : ''}">
            <div>
              <div class="checklist-step-header">
                <span class="step-num-circle">${connectedAccounts > 0 ? '✓' : '2'}</span>
                <span>2. Connect Social Channels</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">
                ${connectedAccounts > 0 ? `${connectedAccounts} platform(s) connected` : 'Connect Instagram, YouTube, TikTok in 1 click.'}
              </p>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-check-connect-social" style="align-self:flex-start;">
              ${connectedAccounts > 0 ? 'Manage Channels' : 'Connect Channels'}
            </button>
          </div>

          <div class="checklist-step-item ${totalVideos > 0 ? 'done' : ''}">
            <div>
              <div class="checklist-step-header">
                <span class="step-num-circle">${totalVideos > 0 ? '✓' : '3'}</span>
                <span>3. Add Drive / Videos</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">
                ${totalVideos > 0 ? `${totalVideos} video(s) ready in library` : 'Paste Google Drive link or drop local folder.'}
              </p>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-check-add-videos" style="align-self:flex-start;">
              ${totalVideos > 0 ? 'View Library' : 'Add Videos'}
            </button>
          </div>

          <div class="checklist-step-item ${project.videos.some(v => v.status === 'scheduled') ? 'done' : ''}">
            <div>
              <div class="checklist-step-header">
                <span class="step-num-circle">4</span>
                <span>4. Schedule & AI Captions</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); margin-top:6px;">
                Set daily time slot (${project.scheduleSettings.preferredTime}) and AI caption tone.
              </p>
            </div>
            <button class="btn btn-outline btn-sm" id="btn-check-schedule" style="align-self:flex-start;">Configure</button>
          </div>
        </div>
      </div>

      <!-- Video Pipeline Section -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="film"></i> Video Pipeline Library</h3>
            <p class="card-description">Synced videos ready for captioning and daily posting.</p>
          </div>
          ${totalVideos > 0 ? `
            <button class="btn btn-primary btn-sm" id="btn-dash-auto-schedule">
              <i data-lucide="calendar"></i>
              <span>Auto-Schedule All</span>
            </button>
          ` : ''}
        </div>

        ${totalVideos > 0 ? `
          <div class="videos-grid">
            ${project.videos.map(v => this.renderVideoCard(v)).join('')}
          </div>
        ` : `
          <div class="empty-state-box">
            <div class="empty-icon-wrap">
              <i data-lucide="film" style="width:28px; height:28px;"></i>
            </div>
            <div class="empty-title">No videos added yet</div>
            <div class="empty-desc">
              Paste your Google Drive folder link or drop your video folder (.mp4, .mov, .webm) to automatically import all videos into this project.
            </div>
            <button class="btn btn-primary" id="btn-dash-import-empty">
              <i data-lucide="folder-sync"></i>
              <span>Add Google Drive Link / Upload Folder</span>
            </button>
          </div>
        `}
      </div>
    `;
  }

  // --- 2. DRIVE & UPLOAD VIEW ---
  renderDriveView(project) {
    const drive = project.driveConfig || {};
    const ytAccount = project.socialAccounts?.find(a => a.id === 'youtube');
    const storedToken = GoogleAuthService.getYouTubeToken(project) || (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_access_token') : '');
    const hasGoogleAuth = !!(storedToken && storedToken.trim().length > 15);
    const savedApiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_api_key') : '') || 'AIzaSyCiYoZaQ2vtn91ypf87qk4hCMInLsTjyzM';
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('omni_google_api_key')) {
      try { localStorage.setItem('omni_google_api_key', savedApiKey); } catch (e) {}
    }

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Google Drive Link & Folder Sync</h1>
          <p class="page-subtitle">Add your Google Drive link or drop your local video folder to scan and load video files.</p>
        </div>
      </div>

      <!-- Drive Link Form -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="cloud"></i> Google Drive Cloud Sync</h3>
            <p class="card-description">গুগল ড্রাইভ ফোল্ডার বা সরাসরি ভিডিও ফাইলের লিংক দিয়ে এক ক্লিকে সব ভিডিও লোড করুন।</p>
          </div>
        </div>

        <div id="drive-alert-container"></div>

        <!-- Google Drive API Key Configuration Banner -->
        <div style="background:var(--bg-subtle); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="width:24px; height:24px; border-radius:50%; background:#10b981; color:white; display:flex; align-items:center; justify-content:center; font-size:12px;">
                <i data-lucide="key" style="width:13px; height:13px;"></i>
              </span>
              <div>
                <strong style="font-size:0.86rem; color:var(--text-primary);">Google Drive API কনফিগারেশন</strong>
                <span style="font-size:0.75rem; color:${savedApiKey ? '#10b981' : 'var(--text-muted)'}; margin-left:6px; font-weight:600;">
                  ${savedApiKey ? '● API Key Active' : '● API Key দিন (অটো-স্ক্যান)'}
                </span>
              </div>
            </div>
            <a href="https://console.cloud.google.com/apis/credentials?project=primal-timing-467317-f1" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="font-size:0.75rem; gap:4px; text-decoration:none;">
              <span>Google Cloud Credentials থেকে API Key নিন</span>
              <i data-lucide="external-link" style="width:12px; height:12px;"></i>
            </a>
          </div>
          <p style="font-size:0.76rem; color:var(--text-secondary); margin:0 0 8px; line-height:1.4;">
            যেহেতু আপনি Google Cloud Project (<strong>primal-timing-467317-f1</strong>)-এ Google Drive API এনেবল করেছেন, সেখান থেকে <strong>+ CREATE CREDENTIALS ➔ API key</strong> চাপলে যে Key পাবেন, তা এখানে দিন:
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <input 
              type="text" 
              class="form-input" 
              id="input-google-api-key" 
              placeholder="AIzaSy... (আপনার Google Cloud API Key পেস্ট করুন)" 
              value="${savedApiKey}" 
              style="font-family:monospace; font-size:0.82rem; flex:1; min-width:240px;" 
            />
            <button type="button" class="btn btn-primary btn-sm" id="btn-save-google-api-key" style="white-space:nowrap; gap:6px;">
              <i data-lucide="save"></i> <span>Save & Activate</span>
            </button>
          </div>
        </div>

        <!-- Google Authorization Banner -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; background:var(--bg-subtle); padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-light); flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="width:26px; height:26px; border-radius:50%; background:#4285F4; color:white; display:flex; align-items:center; justify-content:center;">
              <i data-lucide="cloud" style="width:14px; height:14px;"></i>
            </span>
            <div>
              <div style="font-size:0.86rem; font-weight:700; color:var(--text-primary);">
                ${hasGoogleAuth ? 'Google Account Connected' : 'Google Account: Not Authorized'}
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted);">
                ${hasGoogleAuth ? `Drive & YouTube Integration Active (${ytAccount?.channelTitle || 'chiku bd'})` : 'প্রাইভেট বা সুরক্ষিত ফোল্ডার স্ক্যান করতে Google কানেক্ট করুন'}
              </div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-auth-drive-google" style="font-size:0.78rem; gap:6px; border-color:#4285F4; color:#4285F4;">
            <i data-lucide="key"></i>
            <span>${hasGoogleAuth ? 'Google Account & Token Settings' : '1-Click Connect Google Account'}</span>
          </button>
        </div>

        <!-- Mode Switcher Tabs -->
        <div style="display:flex; gap:8px; margin-bottom:12px; border-bottom:1px solid var(--border-light); padding-bottom:8px;">
          <button type="button" class="btn btn-sm btn-primary" id="btn-tab-single-link" style="font-size:0.8rem; gap:6px;">
            <i data-lucide="link"></i> <span>ফোল্ডার বা ফাইল লিংক (Single Link)</span>
          </button>
          <button type="button" class="btn btn-sm btn-outline" id="btn-tab-batch-links" style="font-size:0.8rem; gap:6px;">
            <i data-lucide="layers"></i> <span>একাধিক ভিডিও লিংক (Batch Paste)</span>
          </button>
        </div>

        <div id="drive-single-input-section" style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
          <input 
            type="url" 
            class="form-input" 
            id="input-drive-url" 
            placeholder="https://drive.google.com/drive/folders/YOUR_FOLDER_ID অথবা সরাসরি ভিডিও লিংক" 
            value="${drive.folderUrl || ''}"
            style="flex:1; min-width:300px;"
          />
          <button class="btn btn-primary" id="btn-sync-drive-action" style="padding:10px 20px; font-weight:600;">
            <i data-lucide="refresh-cw"></i>
            <span>Sync Drive Link</span>
          </button>
        </div>

        <div id="drive-batch-input-section" style="display:none; margin-bottom:14px;">
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">
            Google Drive এর একাধিক ভিডিও লিংক এখানে পেস্ট করুন (প্রতি লাইনে একটি করে লিংক):
          </p>
          <textarea 
            class="form-input" 
            id="input-drive-batch" 
            rows="4" 
            style="font-family:monospace; font-size:0.82rem; margin-bottom:10px; width:100%;" 
            placeholder="https://drive.google.com/file/d/1.../view&#10;https://drive.google.com/file/d/2.../view&#10;https://drive.google.com/file/d/3.../view"
          ></textarea>
          <button class="btn btn-primary" id="btn-sync-batch-action" style="padding:10px 20px; font-weight:600;">
            <i data-lucide="download-cloud"></i>
            <span>ভিডিও লিংকগুলো লোড করুন (Import Batch Videos)</span>
          </button>
        </div>

        <div style="background:rgba(59, 130, 246, 0.05); border:1px solid rgba(59, 130, 246, 0.2); border-radius:var(--radius-md); padding:10px 14px; font-size:0.78rem; color:var(--text-secondary); line-height:1.5;">
          <strong>💡 গুগল ড্রাইভ থেকে ভিডিও সহজে লোড করার ৩টি সহজ উপায়:</strong>
          <ul style="margin:4px 0 0; padding-left:18px;">
            <li><strong>উপায় ১ (সবচেয়ে সহজ):</strong> ফোল্ডারের পারমিশন <strong>"Anyone with the link can view"</strong> (যে কেউ লিংকের মাধ্যমে দেখতে পাবে) রাখলে ১-ক্লিকেই ফোল্ডারের সব ভিডিও লোড হয়ে যাবে।</li>
            <li><strong>উপায় ২:</strong> "একাধিক ভিডিও লিংক" ট্যাবে ক্লিক করে আপনার Google Drive ভিডিও ফাইলগুলোর লিংক একসাথে পেস্ট করে সরাসরি ইমপোর্ট করুন।</li>
            <li><strong>উপায় ৩:</strong> নিচের ড্রপজোন থেকে আপনার কম্পিউটার বা Google Drive Desktop ফোল্ডার থেকে সরাসরি ভিডিও ফাইল সিলেক্ট করুন।</li>
          </ul>
        </div>
      </div>

      <!-- Local Folder & Video Upload Dropzone -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="upload-cloud"></i> Upload Local Video Folder or Files</h3>
            <p class="card-description">Select your video files (.mp4, .mov, .webm) directly from your computer.</p>
          </div>
        </div>

        <div class="upload-dropzone" id="upload-dropzone">
          <div class="upload-icon-circle">
            <i data-lucide="video"></i>
          </div>
          <div class="upload-title">Drag & drop your videos or folder here</div>
          <div class="upload-subtitle">Supports MP4, MOV, WebM short-form vertical videos. Files load instantly with duration and preview playback.</div>
          
          <div style="display:flex; gap:12px; margin-top:8px;">
            <button class="btn btn-primary btn-sm" id="btn-browse-files">
              <i data-lucide="file-video"></i>
              <span>Select Video Files</span>
            </button>
            <button class="btn btn-outline btn-sm" id="btn-browse-folder">
              <i data-lucide="folder"></i>
              <span>Select Entire Folder</span>
            </button>
          </div>
          
          <input type="file" id="file-input-files" multiple accept="video/*" style="display:none;" />
          <input type="file" id="file-input-folder" webkitdirectory directory multiple style="display:none;" />
        </div>
      </div>

      <!-- Loaded Videos Section -->
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap; gap:12px; align-items:center;">
          <div>
            <h3 class="card-title"><i data-lucide="list-video"></i> Loaded Videos (${project.videos.length})</h3>
            <p class="card-description">Active video library for project: <strong>${project.name}</strong></p>
          </div>
          ${project.videos.length > 0 ? `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-auto-schedule-viral-loaded" style="background:linear-gradient(135deg, #4f46e5 0%, #ec4899 100%); border:none; padding:10px 20px; font-weight:700; font-size:0.88rem; box-shadow:0 4px 14px rgba(236, 72, 153, 0.35); gap:8px;">
                <i data-lucide="sparkles"></i>
                <span>সব ${project.videos.length}টি ভিডিও ৩টি ভাইরাল টাইমে শিডিউল করুন</span>
              </button>
            </div>
          ` : ''}
        </div>

        ${project.videos.length > 0 ? `
          <!-- 3 Daily Viral Night Slots Showcase Banner -->
          <div style="background: linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%); border: 1.5px solid rgba(99, 102, 241, 0.28); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
              <div style="flex:1; min-width:280px;">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                  <span style="background:linear-gradient(135deg, #f59e0b, #ef4444); color:white; font-size:0.72rem; font-weight:800; padding:3px 9px; border-radius:12px; letter-spacing:0.5px; text-transform:uppercase;">
                    🔥 VIRAL NIGHT TRIFECTA
                  </span>
                  <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">
                    প্রতিদিন ৩টি সেরা ভাইরাল সময়ে অটো-পোস্ট (Daily 3 Videos Auto-Publish)
                  </span>
                </div>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin:0 0 8px; line-height:1.45;">
                  সোশ্যাল মিডিয়া অ্যালগরিদম অনুযায়ী সন্ধ্যা ও রাতের এই ৩টি সময়ে শর্টস ও রিলস দিলে সর্বোচ্চ অর্গানিক ভিউজ ও শেয়ার হয়:
                </p>
                <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:0.8rem;">
                  <span style="background:var(--bg-card); padding:5px 12px; border-radius:6px; border:1px solid var(--border-light); font-weight:600;">
                    🌆 <strong>Slot 1 (7:00 PM):</strong> সন্ধ্যা পিক টাইম (Evening Prime)
                  </span>
                  <span style="background:var(--bg-card); padding:5px 12px; border-radius:6px; border:1px solid var(--border-light); font-weight:600;">
                    🚀 <strong>Slot 2 (9:00 PM):</strong> প্রাইম ভাইরাল পিক (Viral Peak)
                  </span>
                  <span style="background:var(--bg-card); padding:5px 12px; border-radius:6px; border:1px solid var(--border-light); font-weight:600;">
                    🌙 <strong>Slot 3 (11:00 PM):</strong> লেট নাইট ওয়াচ (Late Night Chill)
                  </span>
                </div>
                <div style="font-size:0.76rem; color:#10b981; font-weight:600; margin-top:8px; display:flex; align-items:center; gap:6px;">
                  <i data-lucide="check-circle" style="width:14px; height:14px;"></i>
                  <span>প্রতিটি ভিডিওতে স্বয়ংক্রিয়ভাবে আকর্ষণীয় AI ক্যাপশন ও ট্রেন্ডিং হ্যাশট্যাগ (#shorts #reels #viral #animation #bangla) যুক্ত থাকবে।</span>
                </div>
              </div>
              <div>
                <button class="btn btn-primary" id="btn-auto-schedule-viral-loaded-2" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none; padding:12px 20px; font-weight:700; font-size:0.86rem; box-shadow:0 4px 12px rgba(16, 185, 129, 0.3); white-space:nowrap; gap:6px;">
                  <i data-lucide="calendar-check"></i>
                  <span>1-Click Auto-Schedule 3 Daily</span>
                </button>
              </div>
            </div>
          </div>

          <div class="videos-grid">
            ${project.videos.map(v => this.renderVideoCard(v)).join('')}
          </div>
        ` : `
          <div class="empty-state-box">
            <div class="empty-icon-wrap">
              <i data-lucide="inbox" style="width:28px; height:28px;"></i>
            </div>
            <div class="empty-title">0 videos currently loaded</div>
            <div class="empty-desc">
              Enter your Google Drive folder link above or click "Select Video Files" to load real videos into your pipeline.
            </div>
          </div>
        `}
      </div>
    `;
  }

  // --- 3. VIDEO PIPELINE VIEW ---
  renderVideosView(project) {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Video Pipeline & Captions</h1>
          <p class="page-subtitle">View video thumbnails, test video playback, generate AI captions, and schedule daily release.</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" id="btn-go-drive-from-videos">
            <i data-lucide="plus"></i>
            <span>Add More Videos</span>
          </button>
          ${project.videos.length > 0 ? `
            <button class="btn btn-primary" id="btn-schedule-pipeline-view" style="background:linear-gradient(135deg, #4f46e5 0%, #ec4899 100%); border:none;">
              <i data-lucide="sparkles"></i>
              <span>Auto-Schedule 3 Daily (Viral Slots)</span>
            </button>
          ` : ''}
        </div>
      </div>

      ${project.videos.length > 0 ? `
        <div class="videos-grid">
          ${project.videos.map(v => this.renderVideoCard(v)).join('')}
        </div>
      ` : `
        <div class="empty-state-box">
          <div class="empty-icon-wrap">
            <i data-lucide="film" style="width:28px; height:28px;"></i>
          </div>
          <div class="empty-title">No videos in pipeline</div>
          <div class="empty-desc">
            To view videos here, import them from your Google Drive link or upload files from your hard drive.
          </div>
          <button class="btn btn-primary" id="btn-go-drive-empty">
            <i data-lucide="folder-sync"></i>
            <span>Import Videos Now</span>
          </button>
        </div>
      `}
    `;
  }

  renderVideoCard(video) {
    let badgeClass = 'badge-neutral';
    const s = (video.status || '').toLowerCase();
    if (s === 'published') badgeClass = 'badge-success';
    else if (s === 'scheduled' || s === 'pending') badgeClass = 'badge-warning';
    else if (s === 'processing' || s === 'publishing') badgeClass = 'badge-primary';
    else if (s === 'failed') badgeClass = 'badge-danger';
    else if (s === 'ready') badgeClass = 'badge-primary';

    let scheduleChip = '';
    if (video.scheduledDate) {
      try {
        const d = new Date(video.scheduledDate);
        const dayStr = d.toLocaleDateString('bn-BD', { month: 'short', day: 'numeric', weekday: 'short' });
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        scheduleChip = `
          <div style="background:rgba(99, 102, 241, 0.08); border:1px solid rgba(99, 102, 241, 0.22); border-radius:6px; padding:5px 8px; font-size:0.73rem; color:#4f46e5; font-weight:600; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            <i data-lucide="calendar" style="width:13px; height:13px;"></i>
            <span>📅 ${dayStr} • ⏰ ${timeStr} ${video.slotLabel ? `(${video.slotLabel})` : ''}</span>
          </div>
        `;
      } catch (e) {}
    }

    return `
      <div class="video-card" data-video-id="${video.id}">
        <div class="video-thumbnail-container btn-open-video-player" data-video-id="${video.id}">
          ${video.thumbnailUrl ? `
            <img src="${video.thumbnailUrl}" alt="${video.title}" class="video-thumbnail-img" />
          ` : `
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px; color:var(--text-muted);">
              <i data-lucide="video" style="width:40px; height:40px;"></i>
              <span style="font-size:0.75rem;">Click to preview</span>
            </div>
          `}
          <div class="video-duration-chip">${video.duration || '0:30'}</div>
        </div>

        <div class="video-body">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="badge ${badgeClass}">${(video.status || 'READY').toUpperCase()}</span>
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${video.size || 'Video'}</span>
          </div>

          <div class="video-title" title="${video.title}">${video.title}</div>

          ${video.error ? `
            <div style="background:rgba(239, 68, 68, 0.08); border-left:3px solid var(--danger); padding:6px 10px; font-size:0.76rem; color:var(--danger); border-radius:4px; margin-bottom:8px;">
              <strong>Error:</strong> ${video.error}
            </div>
          ` : ''}

          ${scheduleChip}

          <div class="caption-preview-box ${!video.caption ? 'empty' : ''}">
            ${video.caption 
              ? `<strong>AI Caption & Tags:</strong> ${video.caption.substring(0, 110)}...`
              : '⚡ No AI caption generated yet. Click "AI Caption" below.'
            }
          </div>

          <div class="video-actions">
            <button class="btn btn-primary btn-sm btn-publish-single-video" data-video-id="${video.id}" title="Publish to Facebook Page now" style="background: linear-gradient(135deg, #1877F2 0%, #0C63D4 100%); border:none; color:#fff; font-weight:600; padding:6px 12px; gap:6px;">
              <i data-lucide="send"></i>
              <span>Publish Now</span>
            </button>
            <button class="btn btn-outline btn-sm btn-generate-single-caption" data-video-id="${video.id}" title="Generate AI caption">
              <i data-lucide="sparkles"></i>
              <span>AI Caption</span>
            </button>
            <button class="btn btn-outline btn-sm btn-open-video-player" data-video-id="${video.id}" title="Play video">
              <i data-lucide="play"></i>
              <span>Play</span>
            </button>
            <button class="btn btn-danger btn-sm btn-delete-video" data-video-id="${video.id}" title="Remove video">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- 4. SOCIAL MEDIA 1-CLICK CONNECT VIEW ---
  renderSocialView(project) {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Connect Your Social Media (1-Click)</h1>
          <p class="page-subtitle">Authorize your accounts in 1 click. When scheduled, videos with AI captions will be posted automatically.</p>
        </div>
        <div>
          <button class="btn btn-primary" id="btn-connect-all-channels">
            <i data-lucide="zap"></i>
            <span>1-Click Connect All Channels</span>
          </button>
        </div>
      </div>

      <div class="alert-box alert-info">
        <i data-lucide="shield-check" style="width:24px; height:24px; flex-shrink:0;"></i>
        <div class="alert-content">
          <h4>Two-Way Channel Control</h4>
          <p>Easily toggle any connected channel active or paused. Videos will only be published to channels that are toggled <strong>Active</strong>.</p>
        </div>
      </div>

      <div class="platforms-grid">
        ${AVAILABLE_PLATFORMS.map(platformDef => {
          const account = project.socialAccounts.find(a => a.id === platformDef.id) || {
            id: platformDef.id,
            name: platformDef.name,
            handle: '',
            connected: false,
            active: false,
            followers: '0',
            lastPost: 'Never'
          };

          return `
            <div class="platform-card ${account.connected ? 'connected' : ''}">
              <div>
                <div class="platform-header">
                  <div style="display:flex; align-items:center; gap:12px;">
                    ${account.avatar ? `
                      <img src="${account.avatar}" style="width:44px; height:44px; border-radius:var(--radius-md); object-fit:cover; border:2px solid #fee2e2;" alt="Channel Avatar" />
                    ` : `
                      <div class="platform-icon-wrap" style="background:${platformDef.color};">
                        <i data-lucide="${platformDef.icon}"></i>
                      </div>
                    `}
                    <div>
                      <div class="platform-name">${platformDef.name}</div>
                      <div class="platform-handle">${account.connected && account.handle ? account.handle : 'Not linked'}</div>
                    </div>
                  </div>
                  <span class="badge ${account.connected ? 'badge-success' : 'badge-neutral'}">
                    ${account.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>

                <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.4; margin-bottom:12px;">
                  ${platformDef.description}
                </p>

                <div class="platform-meta">
                  <div>
                    <div class="platform-meta-item">Status</div>
                    <div class="platform-meta-value">${account.connected ? 'Ready' : 'Unlinked'}</div>
                  </div>
                  <div>
                    <div class="platform-meta-item">${platformDef.id === 'youtube' ? 'Subscribers' : 'Audience'}</div>
                    <div class="platform-meta-value">${account.connected ? (account.followers || 'Active') : '--'}</div>
                  </div>
                  <div>
                    <div class="platform-meta-item">Auto-Posting</div>
                    <div class="platform-meta-value" style="color:${account.active ? 'var(--success)' : 'var(--text-muted)'};">
                      ${account.active ? 'Active' : 'Paused'}
                    </div>
                  </div>
                </div>

                ${platformDef.id === 'facebook' && account.connected ? `
                  <div style="margin-top:10px; padding:6px 10px; background:rgba(24, 119, 242, 0.06); border:1px solid rgba(24, 119, 242, 0.15); border-radius:6px; font-size:0.75rem; color:#1877F2; display:flex; justify-content:space-between; align-items:center;">
                    <span>Page ID: <strong>${account.pageId || 'Pending Discovery'}</strong></span>
                    <span style="font-weight:600;">Meta Graph API v21.0</span>
                  </div>
                ` : ''}
              </div>

              <div class="platform-footer">
                ${account.connected ? `
                  <div style="display:flex; align-items:center; gap:8px;">
                    <label class="switch">
                      <input type="checkbox" class="toggle-platform-active" data-platform-id="${platformDef.id}" ${account.active ? 'checked' : ''}>
                      <span class="slider"></span>
                    </label>
                    <span style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">
                      ${account.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div style="display:flex; gap:6px;">
                    ${platformDef.id === 'facebook' ? `
                      <button class="btn btn-outline btn-sm btn-connect-platform" data-platform-id="facebook" style="border-color:#1877F2; color:#1877F2;" title="Verify or Test Connection">
                        <i data-lucide="settings-2"></i>
                        <span>Configure / Test</span>
                      </button>
                    ` : ''}
                    ${platformDef.id === 'youtube' ? `
                      <button class="btn btn-outline btn-sm btn-connect-platform" data-platform-id="youtube" style="border-color:#FF0000; color:#FF0000; font-weight:600; gap:5px;" title="চ্যানেল পরিবর্তন ও কনফিগার করুন">
                        <i data-lucide="refresh-cw"></i>
                        <span>চ্যানেল পরিবর্তন (Change Channel)</span>
                      </button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm btn-disconnect-platform" data-platform-id="${platformDef.id}" style="color:var(--danger); border-color:#fecaca;">
                      Disconnect
                    </button>
                  </div>
                ` : `
                  <button class="btn btn-primary btn-sm btn-connect-platform" data-platform-id="${platformDef.id}" style="width:100%; ${platformDef.id === 'youtube' ? 'background:#FF0000; border-color:#FF0000;' : ''}">
                    <i data-lucide="${platformDef.id === 'youtube' ? 'play-circle' : 'link'}"></i>
                    <span>${platformDef.id === 'youtube' ? 'Connect with Google' : '1-Click Connect'}</span>
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // --- 5. AI CAPTION STUDIO VIEW ---
  renderAIView(project) {
    const ai = project.aiSettings || {};
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">AI Caption & Hashtag Studio</h1>
          <p class="page-subtitle">Configure your AI API key (Google Gemini / OpenAI) to generate viral hooks, descriptions, and hashtags.</p>
        </div>
        <button class="btn btn-primary" id="btn-save-ai-settings">
          <i data-lucide="save"></i>
          <span>Save AI Settings</span>
        </button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:24px;">
        <!-- AI Configuration Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title"><i data-lucide="key"></i> AI Model & API Key</h3>
              <p class="card-description">Enter your AI API Key for real-time generative copywriting.</p>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">AI Model Provider</label>
            <select class="form-select" id="ai-provider-select">
              <option value="gemini" ${ai.provider === 'gemini' ? 'selected' : ''}>Google Gemini (gemini-1.5-flash)</option>
              <option value="openai" ${ai.provider === 'openai' ? 'selected' : ''}>OpenAI ChatGPT (gpt-4o-mini)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">API Key</label>
            <div style="position:relative;">
              <input 
                type="password" 
                class="form-input" 
                id="ai-api-key-input" 
                placeholder="Paste your Gemini or OpenAI API Key" 
                value="${ai.apiKey || ''}"
                style="padding-right:45px;"
              />
              <button class="btn-icon-soft" id="btn-toggle-key-visibility" style="position:absolute; right:10px; top:8px;">
                <i data-lucide="eye"></i>
              </button>
            </div>
            <div class="form-hint">Stored securely in your local browser storage. If left blank, our smart built-in AI synthesizer will operate as fallback.</div>
          </div>

          <div style="display:flex; gap:10px; margin-top:16px;">
            <button class="btn btn-outline btn-sm" id="btn-test-api-key">
              <i data-lucide="check-circle-2"></i>
              <span>Test API Key Connection</span>
            </button>
          </div>

          <div id="ai-key-status" style="margin-top:14px;"></div>
        </div>

        <!-- Prompt Customization -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title"><i data-lucide="sliders"></i> Prompt Style & Hashtags</h3>
              <p class="card-description">Tailored for niche: <strong>${project.niche}</strong></p>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Content Tone</label>
            <select class="form-select" id="ai-tone-select">
              <option value="Viral & High Energy" ${ai.tone === 'Viral & High Energy' ? 'selected' : ''}>🔥 Viral & High Energy (Retention Hook)</option>
              <option value="Educational & Professional" ${ai.tone === 'Educational & Professional' ? 'selected' : ''}>💡 Educational & Professional (Value First)</option>
              <option value="Storytelling & Curious" ${ai.tone === 'Storytelling & Curious' ? 'selected' : ''}>📖 Storytelling & Curious (Narrative)</option>
              <option value="Humorous & Relatable" ${ai.tone === 'Humorous & Relatable' ? 'selected' : ''}>😂 Humorous & Relatable (Meme Style)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Hashtags Count: <strong id="hashtag-count-display">${ai.hashtagCount || 6}</strong></label>
            <input type="range" min="3" max="15" value="${ai.hashtagCount || 6}" class="form-input" id="ai-hashtag-slider" style="padding:0;">
          </div>

          <div class="form-group">
            <label class="form-label">Call to Action (CTA)</label>
            <input type="text" class="form-input" id="ai-cta-input" value="${ai.callToAction || ''}" placeholder="Follow for daily updates!" />
          </div>
        </div>
      </div>

      <!-- Live Tester -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="terminal"></i> Live AI Caption Generator Tester</h3>
            <p class="card-description">Enter any video title or concept to test caption output.</p>
          </div>
        </div>

        <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
          <input type="text" class="form-input" id="test-video-title-input" placeholder="Enter video topic or file title (e.g. 5 Secret Productivity Hacks)" style="flex:1; min-width:300px;" />
          <button class="btn btn-primary" id="btn-run-caption-test">
            <i data-lucide="sparkles"></i>
            <span>Generate Caption</span>
          </button>
        </div>

        <div id="test-caption-output" style="background:var(--bg-subtle); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:16px; white-space:pre-wrap; font-size:0.9rem; line-height:1.6; min-height:80px; color:var(--text-secondary);">
          Enter a title and click "Generate Caption" to see live AI output.
        </div>
      </div>
    `;
  }

  // --- 6. DAILY TIMING SCHEDULE VIEW ---
  renderScheduleView(project) {
    const sched = project.scheduleSettings || {};
    const scheduledVideos = project.videos.filter(v => {
      const s = (v.status || '').toLowerCase();
      return s === 'scheduled' || s === 'pending';
    });
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const times = Array.isArray(sched.times) && sched.times.length >= 3 ? sched.times : ['19:00', '21:00', '23:00'];
    const freq = sched.frequency || 3;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Daily Timing Schedule & Queue</h1>
          <p class="page-subtitle">প্রতিদিন ৩টি সেরা ভাইরাল সময়ে ফেসবুক ও ইউটিউবে ভিডিও অটো-পাবলিশ করার টাইম জোন কনফিগারেশন।</p>
        </div>
        <div style="display:flex; gap:10px;">
          ${project.videos.length > 0 ? `
            <button class="btn btn-primary" id="btn-run-auto-scheduler" style="background:linear-gradient(135deg, #4f46e5 0%, #ec4899 100%); border:none; padding:10px 20px; font-weight:700; box-shadow:0 4px 14px rgba(236, 72, 153, 0.35);">
              <i data-lucide="sparkles"></i>
              <span>সব ${project.videos.length}টি ভিডিও ৩টি ভাইরাল টাইমে শিডিউল করুন</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Viral Night Schedule Settings Card -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="clock"></i> Daily Posting Frequency & Viral Night Time Slots</h3>
            <p class="card-description">সোশ্যাল মিডিয়ার পিক আওয়ার অনুযায়ী সন্ধ্যা ও রাতের ৩টি সেরা টাইম জোন সেট করুন।</p>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-save-schedule-settings">Save Schedule</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
          <div class="form-group">
            <label class="form-label">Posting Cadence (দৈনিক কতটি ভিডিও?)</label>
            <select class="form-select" id="sched-cadence-select">
              <option value="3" ${freq === 3 ? 'selected' : ''}>🔥 3 Videos Every Day (Viral Night Trifecta: 7PM, 9PM, 11PM) — Recommended</option>
              <option value="1" ${freq === 1 ? 'selected' : ''}>1 Video Every Day</option>
              <option value="2" ${freq === 2 ? 'selected' : ''}>2 Videos Every Day</option>
              <option value="4" ${freq === 4 ? 'selected' : ''}>4 Videos Every Day</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Timezone (টাইম জোন)</label>
            <input type="text" class="form-input" id="sched-timezone-input" value="${sched.timezone || 'Asia/Dhaka'}" readonly style="background:var(--bg-subtle);" />
          </div>
        </div>

        <!-- 3 Specific Night Time Slots -->
        <div style="margin-top:16px;">
          <label class="form-label" style="font-size:0.9rem; font-weight:700; margin-bottom:10px; display:block;">
            🎯 ৩টি নির্ধারিত ভাইরাল টাইম স্লট (Evening & Night Viral Slots):
          </label>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; padding:16px; background:var(--bg-subtle); border-radius:var(--radius-md); border:1px solid var(--border-light);">
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🌆 Slot 1 (Evening Prime)</span>
                <span style="color:#4f46e5; font-weight:700; font-size:0.75rem;">7:00 PM</span>
              </label>
              <input type="time" class="form-input" id="sched-time-slot1" value="${times[0] || '19:00'}" />
              <span style="font-size:0.72rem; color:var(--text-muted); margin-top:5px; display:block; line-height:1.4;">
                সন্ধ্যা পিক টাইম — কাজ ও ক্লাস শেষে অবসর সময়ে ইউজারদের প্রথম স্ক্রোলিং ঢেউ।
              </span>
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🚀 Slot 2 (Viral Peak)</span>
                <span style="color:#ec4899; font-weight:700; font-size:0.75rem;">9:00 PM</span>
              </label>
              <input type="time" class="form-input" id="sched-time-slot2" value="${times[1] || '21:00'}" />
              <span style="font-size:0.72rem; color:var(--text-muted); margin-top:5px; display:block; line-height:1.4;">
                দিনের সর্বোচ্চ ভাইরাল পিক — ফেসবুক রিলস ও ইউটিউব শর্টসে সর্বোচ্চ সক্রিয় ইউজার।
              </span>
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>🌙 Slot 3 (Late Night Binge)</span>
                <span style="color:#10b981; font-weight:700; font-size:0.75rem;">11:00 PM</span>
              </label>
              <input type="time" class="form-input" id="sched-time-slot3" value="${times[2] || '23:00'}" />
              <span style="font-size:0.72rem; color:var(--text-muted); margin-top:5px; display:block; line-height:1.4;">
                লেট নাইট ওয়াচ — ঘুমানোর আগের বিনোদন, সবচেয়ে বেশি ভিডিও রিটেনশন ও লাইক।
              </span>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;">
          <label class="form-label">Active Posting Days</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${daysOfWeek.map(day => `
              <label style="display:flex; align-items:center; gap:6px; background:var(--bg-subtle); padding:8px 14px; border-radius:var(--radius-md); border:1px solid var(--border-light); cursor:pointer; font-size:0.85rem; font-weight:600;">
                <input type="checkbox" class="posting-day-checkbox" value="${day}" ${(sched.postingDays || []).includes(day) ? 'checked' : ''} />
                <span>${day}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Scheduled Queue -->
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap; gap:12px; align-items:center;">
          <div>
            <h3 class="card-title"><i data-lucide="calendar"></i> Upcoming Scheduled Dispatch Timeline</h3>
            <p class="card-description">${scheduledVideos.length} video(s) sequentially scheduled across upcoming viral slots.</p>
          </div>
          ${project.videos.length > 0 ? `
            <button class="btn btn-primary btn-sm" id="btn-schedule-pipeline-view" style="gap:6px;">
              <i data-lucide="sparkles"></i>
              <span>Re-Schedule All ${project.videos.length} Videos</span>
            </button>
          ` : ''}
        </div>

        ${scheduledVideos.length > 0 ? `
          <div class="videos-grid">
            ${scheduledVideos.map(v => this.renderVideoCard(v)).join('')}
          </div>
        ` : `
          <div class="empty-state-box">
            <div class="empty-icon-wrap">
              <i data-lucide="calendar-x" style="width:28px; height:28px;"></i>
            </div>
            <div class="empty-title">0 videos scheduled</div>
            <div class="empty-desc">
              ${project.videos.length > 0 
                ? 'আপনার ' + project.videos.length + 'টি ভিডিও রেডি আছে! ওপরের "সব ' + project.videos.length + 'টি ভিডিও ৩টি ভাইরাল টাইমে শিডিউল করুন" বাটনে ক্লিক করলেই প্রতিদিন ৩টি করে সাজিয়ে দেয়া হবে।' 
                : 'Import videos from Google Drive or local files first to populate the schedule.'
              }
            </div>
          </div>
        `}
      </div>
    `;
  }

  // --- 7. PUBLISHING HISTORY & LOGS VIEW ---
  renderLogsView(project) {
    const logs = project.logs || [];
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Publishing History & Real-Time Logs</h1>
          <p class="page-subtitle">Real-time audit record of all automated video dispatches and live post links.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="activity"></i> Dispatch Logs (${logs.length} total)</h3>
            <p class="card-description">Live posts for project: <strong>${project.name}</strong></p>
          </div>
        </div>

        ${logs.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:14px;">
            ${logs.map(log => `
              <div style="padding:16px 20px; border-radius:var(--radius-md); border:1px solid var(--border-light); background:var(--bg-surface); box-shadow:var(--shadow-xs);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge badge-success"><i data-lucide="check-circle"></i> PUBLISHED</span>
                    <strong style="font-size:0.95rem; color:var(--text-primary);">${log.videoTitle}</strong>
                  </div>
                  <span style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">${log.timestamp}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:8px;">${log.message}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  ${log.platforms.map(p => `<span class="badge badge-neutral">${p}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state-box">
            <div class="empty-icon-wrap">
              <i data-lucide="history" style="width:28px; height:28px;"></i>
            </div>
            <div class="empty-title">No publishing history yet</div>
            <div class="empty-desc">
              When a scheduled video is published to connected social media channels, live links and confirmation logs will be recorded here.
            </div>
          </div>
        `}
      </div>
    `;
  }

  // --- MODALS ---
  openModal(htmlContent) {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = htmlContent;
    this.refreshIcons();

    const backdrop = modalRoot.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });
    }

    const closeBtns = modalRoot.querySelectorAll('.btn-close-modal');
    closeBtns.forEach(btn => btn.addEventListener('click', () => this.closeModal()));
  }

  closeModal() {
    const modalRoot = document.getElementById('modal-root');
    modalRoot.innerHTML = '';
  }

  // --- NEW PROJECT MODAL ---
  openNewProjectModal() {
    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">Add New Project</h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Project Name *</label>
              <input type="text" class="form-input" id="new-proj-name" placeholder="Enter project name (e.g. AI Tech Shorts)" required />
            </div>

            <div class="form-group">
              <label class="form-label">Niche / Category</label>
              <select class="form-select" id="new-proj-niche">
                <option value="Technology & AI">Technology & AI</option>
                <option value="Fitness & Health">Fitness & Health</option>
                <option value="Business & Finance">Business & Finance</option>
                <option value="Entertainment & Comedy">Entertainment & Comedy</option>
                <option value="Education & Tips">Education & Tips</option>
                <option value="E-commerce & Products">E-commerce & Products</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Description (Optional)</label>
              <textarea class="form-textarea" id="new-proj-desc" placeholder="Brief notes about target audience or theme..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-close-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-create-project">
              <i data-lucide="check"></i>
              <span>Create Project</span>
            </button>
          </div>
        </div>
      </div>
    `);

    document.getElementById('btn-submit-create-project').addEventListener('click', () => {
      const name = document.getElementById('new-proj-name').value.trim();
      const niche = document.getElementById('new-proj-niche').value;
      const desc = document.getElementById('new-proj-desc').value.trim();

      if (!name) {
        alert('Please enter a project name.');
        return;
      }

      const newProj = storage.createProject({ name, niche, description: desc });
      this.closeModal();
      this.showToast(`Project "${newProj.name}" created!`, 'success');
      this.render();
    });
  }

  // --- PROJECT SWITCHER MODAL ---
  openProjectSwitcherModal() {
    const allProjects = storage.getState().projects;
    const activeProject = storage.getActiveProject();

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">Switch Project</h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${allProjects.map(p => `
                <div class="btn-select-existing-project" data-proj-id="${p.id}" style="padding:14px 18px; border-radius:var(--radius-md); border:1px solid ${p.id === activeProject.id ? 'var(--primary)' : 'var(--border-light)'}; background:${p.id === activeProject.id ? 'var(--primary-subtle)' : 'var(--bg-surface)'}; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem;">${p.name}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${p.niche} • ${p.videos.length} videos</div>
                  </div>
                  ${p.id === activeProject.id ? '<span class="badge badge-primary">Active</span>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <button class="btn btn-outline" id="btn-modal-add-another-project">
              <i data-lucide="plus"></i>
              <span>Add New Project</span>
            </button>
            <button class="btn btn-outline btn-close-modal">Close</button>
          </div>
        </div>
      </div>
    `);

    document.querySelectorAll('.btn-select-existing-project').forEach(el => {
      el.addEventListener('click', () => {
        const projId = el.getAttribute('data-proj-id');
        storage.setActiveProjectId(projId);
        this.closeModal();
        this.showToast('Switched project workspace', 'success');
        this.render();
      });
    });

    const addAnother = document.getElementById('btn-modal-add-another-project');
    if (addAnother) {
      addAnother.addEventListener('click', () => {
        this.closeModal();
        this.openNewProjectModal();
      });
    }
  }

  // --- 1-CLICK SOCIAL CONNECT MODAL ---
  openSocialConnectModal(platformId) {
    const platform = AVAILABLE_PLATFORMS.find(p => p.id === platformId);
    if (!platform) return;

    if (platformId === 'youtube') {
      this.openYouTubeOAuthModal(platform);
      return;
    }

    if (platformId === 'facebook') {
      this.openFacebookConnectModal(platform);
      return;
    }

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title" style="display:flex; align-items:center; gap:10px;">
              <span style="width:32px; height:32px; border-radius:var(--radius-sm); background:${platform.color}; color:white; display:flex; align-items:center; justify-content:center;">
                <i data-lucide="${platform.icon}"></i>
              </span>
              Connect ${platform.name}
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; padding:16px 0 20px;">
              <h4 style="font-size:1.15rem; font-weight:800; color:var(--text-primary);">Authorize ${platform.name}</h4>
              <p style="font-size:0.86rem; color:var(--text-muted); margin-top:4px;">
                Enable automated 1-click video publishing to your channel feed.
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">Your Channel Username / Handle</label>
              <input type="text" class="form-input" id="connect-handle-input" placeholder="e.g. @yourbrand" />
            </div>

            <div style="background:var(--bg-subtle); padding:14px; border-radius:var(--radius-md); font-size:0.82rem; color:var(--text-secondary); line-height:1.5;">
              <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">Permissions Requested:</div>
              • Upload videos on scheduled daily timing<br>
              • Attach AI caption and hashtags<br>
              • Read publication confirmations
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-close-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-connect-platform">
              <i data-lucide="zap"></i>
              <span>Authorize & Connect (1-Click)</span>
            </button>
          </div>
        </div>
      </div>
    `);

    document.getElementById('btn-confirm-connect-platform').addEventListener('click', () => {
      const handle = document.getElementById('connect-handle-input').value.trim();
      const project = storage.getActiveProject();
      SocialManagerService.connectPlatform(project, platformId, handle);
      storage.saveState();
      this.closeModal();
      this.showToast(`Connected ${platform.name}!`, 'success');
      this.render();
    });
  }

  // --- FACEBOOK PAGE META GRAPH API MODAL ---
  openFacebookConnectModal(platform) {
    const project = storage.getActiveProject();
    let account = project.socialAccounts.find(a => a.id === 'facebook');
    const defaultPageId = account?.pageId || '';
    const defaultPageName = account?.pageName || (account?.connected && account?.name !== 'Facebook Reels' ? account.name : 'Chiku bd');
    const defaultHandle = account?.handle || (defaultPageName ? `@${defaultPageName.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '@chikubd');
    const isConnected = !!(account?.connected && account?.pageId);

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card" style="max-width:620px;">
          <div class="modal-header">
            <h3 class="modal-title" style="display:flex; align-items:center; gap:10px;">
              <span style="width:34px; height:34px; border-radius:var(--radius-sm); background:#1877F2; color:white; display:flex; align-items:center; justify-content:center;">
                <i data-lucide="facebook"></i>
              </span>
              <span>Facebook Page & Reels Auto-Publishing</span>
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <!-- Active Connection Banner -->
            <div style="background:linear-gradient(135deg, rgba(24, 119, 242, 0.08), rgba(24, 119, 242, 0.02)); border:1px solid rgba(24, 119, 242, 0.2); border-radius:var(--radius-md); padding:14px 16px; margin-bottom:18px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="font-weight:700; color:var(--text-primary); font-size:1.02rem; margin-bottom:2px; display:flex; align-items:center; gap:8px;">
                    <span>Target Page:</span>
                    <span id="fb-display-page-name" style="color:#1877F2;">${defaultPageName}</span>
                  </div>
                  <div style="font-size:0.82rem; color:var(--text-muted);">
                    ID: <code id="fb-display-page-id" style="background:var(--bg-card); padding:2px 6px; border-radius:4px; font-weight:600;">${defaultPageId || 'Not Selected'}</code> &bull; Handle: <span id="fb-display-handle" style="font-weight:600;">${defaultHandle}</span>
                  </div>
                </div>
                <span class="badge ${isConnected ? 'badge-success' : 'badge-neutral'}" id="fb-live-badge">
                  ${isConnected ? 'Connected' : 'Not Linked'}
                </span>
              </div>
            </div>

            <!-- Token Input Step -->
            <div class="form-group" style="margin-bottom:14px;">
              <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span><strong>Meta Graph API Access Token</strong> (User or Page Token)</span>
                <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style="font-size:0.78rem; color:#1877F2; text-decoration:none; display:flex; align-items:center; gap:3px; font-weight:600;">
                  <span>Graph API Explorer</span>
                  <i data-lucide="external-link" style="width:12px; height:12px;"></i>
                </a>
              </label>
              <textarea class="form-input" id="fb-token-input" rows="3" style="font-family:monospace; font-size:0.82rem; resize:vertical;" placeholder="${account?.tokenConfigured ? '•••••••••••••••••••••••• (টোকেন সার্ভারে সুরক্ষিত আছে — নতুন টোকেন দিলে আপডেট হবে)' : 'এখানে আপনার Access Token পেস্ট করুন (starts with EAAT... বা EAA...)'}"></textarea>
              <div style="font-size:0.76rem; color:var(--text-muted); margin-top:5px; line-height:1.4;">
                <span style="color:#1877F2; font-weight:600;">প্রয়োজনীয় পারমিশন:</span> <code>pages_show_list</code>, <code>pages_manage_posts</code>, <code>publish_video</code>, <code>pages_read_engagement</code>।
              </div>
            </div>

            <!-- Discover Pages Button -->
            <div style="display:flex; gap:10px; margin-bottom:16px;">
              <button class="btn btn-primary btn-sm" id="btn-fb-discover" style="flex:1; background:#1877F2; border-color:#1877F2; display:flex; align-items:center; justify-content:center; gap:6px;">
                <i data-lucide="compass"></i>
                <span>Discover Pages & Validate Token</span>
              </button>
            </div>

            <!-- Discovered Pages List Container -->
            <div id="fb-pages-container" style="display:none; margin-bottom:16px; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:12px; background:var(--bg-subtle);">
              <div style="font-size:0.82rem; font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>Select Your Facebook Page:</span>
                <span id="fb-page-count" style="font-size:0.75rem; color:var(--text-muted);"></span>
              </div>
              <div id="fb-pages-list" style="display:flex; flex-direction:column; gap:8px; max-height:180px; overflow-y:auto;"></div>
            </div>

            <!-- Diagnostics / Verification Results -->
            <div id="fb-verification-results" style="display:none; margin-bottom:16px;"></div>

            <!-- Test Post Action -->
            <div style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:14px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.78rem; color:var(--text-muted);">নিরাপদ টেস্ট পোস্ট (ব্যবহারকারীর অনুমোদন সাপেক্ষে):</span>
              <button class="btn btn-outline btn-sm" id="btn-fb-test-post" style="border-color:rgba(24, 119, 242, 0.4); color:#1877F2; display:flex; align-items:center; gap:5px;">
                <i data-lucide="send" style="width:14px; height:14px;"></i>
                <span>Publish Test Post</span>
              </button>
            </div>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:space-between;">
            <button class="btn btn-outline btn-close-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-save-fb-config" style="background:#1877F2; border-color:#1877F2;">
              <i data-lucide="check-circle-2"></i>
              <span>Connect Selected Page</span>
            </button>
          </div>
        </div>
      </div>
    `);
    this.refreshIcons();

    let discoveredPages = [];
    let currentSelectedPageId = defaultPageId;
    let currentSelectedPageName = defaultPageName;

    // Helper to render discovered pages in radio list
    const renderDiscoveredPages = (pages, targetSelectId = null) => {
      const container = document.getElementById('fb-pages-container');
      const listEl = document.getElementById('fb-pages-list');
      const countEl = document.getElementById('fb-page-count');

      if (!pages || pages.length === 0) {
        container.style.display = 'none';
        return;
      }

      container.style.display = 'block';
      countEl.textContent = `${pages.length} Page(s) available`;

      // Auto-select Chiku bd if available or targetSelectId
      const chiku = pages.find(p => (p.name || '').toLowerCase().includes('chiku'));
      const activeId = targetSelectId || (chiku ? chiku.id : pages[0].id);
      currentSelectedPageId = activeId;

      listEl.innerHTML = pages.map(p => {
        const isChecked = p.id === activeId;
        const isChiku = (p.name || '').toLowerCase().includes('chiku');
        if (isChecked) {
          currentSelectedPageName = p.name;
        }

        return `
          <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:6px; background:${isChecked ? 'rgba(24, 119, 242, 0.08)' : 'var(--bg-card)'}; border:1px solid ${isChecked ? '#1877F2' : 'var(--border-color)'}; cursor:pointer; transition:all 0.15s ease;">
            <div style="display:flex; align-items:center; gap:10px;">
              <input type="radio" name="fb-page-choice" value="${p.id}" data-name="${p.name}" ${isChecked ? 'checked' : ''} style="cursor:pointer;" />
              <div>
                <div style="font-weight:700; font-size:0.88rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                  <span>${p.name}</span>
                  ${isChiku ? `<span style="font-size:0.68rem; background:#1877F2; color:white; padding:1px 6px; border-radius:10px; font-weight:600;">Target Page</span>` : ''}
                </div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                  ID: <code style="font-weight:600;">${p.id}</code> &bull; ${p.category || 'Facebook Business Page'}
                </div>
              </div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.72rem; color:${p.canPublish ? '#10B981' : '#F59E0B'}; font-weight:600; display:flex; align-items:center; gap:4px;">
                <i data-lucide="${p.canPublish ? 'check-circle' : 'alert-circle'}" style="width:12px; height:12px;"></i>
                <span>${p.canPublish ? 'Publishing Ready' : 'Read Only'}</span>
              </span>
            </div>
          </label>
        `;
      }).join('');

      this.refreshIcons();

      // Listen for page selection changes
      listEl.querySelectorAll('input[name="fb-page-choice"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          currentSelectedPageId = e.target.value;
          currentSelectedPageName = e.target.getAttribute('data-name');
          document.getElementById('fb-display-page-name').textContent = currentSelectedPageName;
          document.getElementById('fb-display-page-id').textContent = currentSelectedPageId;
          const cleanHandle = `@${currentSelectedPageName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          document.getElementById('fb-display-handle').textContent = cleanHandle;
          renderDiscoveredPages(pages, currentSelectedPageId);
        });
      });
    };

    // Pre-load stored pages from server if any exist
    SocialManagerService.getDiscoveredFacebookPages().then(res => {
      if (res.success && res.pages && res.pages.length > 0) {
        discoveredPages = res.pages;
        renderDiscoveredPages(discoveredPages, defaultPageId);
      }
    }).catch(() => {});

    // Discover Pages & Validate Token Button
    document.getElementById('btn-fb-discover').addEventListener('click', async () => {
      const tokenInput = document.getElementById('fb-token-input').value.trim();
      const resultBox = document.getElementById('fb-verification-results');
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="background:var(--bg-subtle); padding:12px; border-radius:var(--radius-md); font-size:0.84rem; display:flex; align-items:center; gap:8px;">
          <span>Contacting Meta Graph API v21.0 (/me/accounts & /debug_token)...</span>
        </div>
      `;

      const btn = document.getElementById('btn-fb-discover');
      const originalBtnText = btn.innerHTML;
      btn.innerHTML = `<span>Discovering Pages...</span>`;
      btn.disabled = true;

      const discovery = await SocialManagerService.discoverFacebookPages(tokenInput);
      btn.innerHTML = originalBtnText;
      btn.disabled = false;
      this.refreshIcons();

      if (discovery.success && discovery.pages && discovery.pages.length > 0) {
        discoveredPages = discovery.pages;
        renderDiscoveredPages(discoveredPages, discovery.selectedPageId);

        const activePage = discoveredPages.find(p => p.id === currentSelectedPageId) || discoveredPages[0];
        document.getElementById('fb-display-page-name').textContent = activePage.name;
        document.getElementById('fb-display-page-id').textContent = activePage.id;
        document.getElementById('fb-display-handle').textContent = `@${activePage.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        document.getElementById('fb-live-badge').className = 'badge badge-success';
        document.getElementById('fb-live-badge').textContent = 'Pages Discovered';

        resultBox.innerHTML = `
          <div style="background:rgba(16, 185, 129, 0.08); border:1px solid rgba(16, 185, 129, 0.3); border-radius:var(--radius-md); padding:12px; font-size:0.84rem; color:var(--text-primary);">
            <div style="font-weight:700; color:#10B981; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="check-check" style="width:16px; height:16px;"></i>
              <span>Token Validated & ${discovery.pages.length} Page(s) Discovered</span>
            </div>
            ${discovery.userName ? `<div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:4px;">Authenticated Meta User: <strong>${discovery.userName}</strong> (User ID: <code>${discovery.userId}</code>)</div>` : ''}
            <div style="font-size:0.78rem; color:var(--text-muted);">
              Token Type: <strong>${discovery.tokenType || 'PAGE'}</strong> &bull; Permissions: ${discovery.scopes?.join(', ') || 'All Verified'}
            </div>
            ${discovery.missingScopes?.length > 0 ? `
              <div style="font-size:0.76rem; color:#EF4444; margin-top:4px;">
                Missing Recommended Permissions: ${discovery.missingScopes.join(', ')}
              </div>
            ` : ''}
          </div>
        `;
        this.refreshIcons();
      } else {
        resultBox.innerHTML = `
          <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-md); padding:12px; font-size:0.84rem; color:var(--text-primary);">
            <div style="font-weight:700; color:#EF4444; margin-bottom:4px;">⚠️ Discovery Status: ${discovery.status || 'Failed'}</div>
            <div style="color:var(--text-secondary); margin-bottom:6px; white-space:pre-line;">${discovery.message || discovery.error}</div>
            ${discovery.errorCode ? `<div style="font-size:0.75rem; color:var(--text-muted);">Error Code: ${discovery.errorCode} (Subcode: ${discovery.errorSubcode || 'N/A'})</div>` : ''}
          </div>
        `;
        document.getElementById('fb-live-badge').className = 'badge badge-danger';
        document.getElementById('fb-live-badge').textContent = discovery.status || 'Action Required';
      }
    });

    // Send Real Test Post (Requires explicit user confirmation)
    document.getElementById('btn-fb-test-post').addEventListener('click', async () => {
      const pageId = currentSelectedPageId || defaultPageId;
      const pageName = currentSelectedPageName || defaultPageName;

      if (!pageId) {
        this.showToast('Please discover and select a Facebook Page first.', 'warning');
        return;
      }

      const approved = window.confirm(`Approve Test Post:\n\nDo you approve publishing a real test text post to Facebook Page "${pageName}" (ID: ${pageId})?\n\nThis will make a live Graph API request.`);
      if (!approved) return;

      const resultBox = document.getElementById('fb-verification-results');
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="background:var(--bg-subtle); padding:12px; border-radius:var(--radius-md); font-size:0.84rem; display:flex; align-items:center; gap:8px;">
          <span>Publishing test text post to Facebook Page "${pageName}"...</span>
        </div>
      `;

      try {
        const testRes = await SchedulerService.publishTestPost(project, {
          pageId,
          message: `AutoVid Publisher Test Post to ${pageName} — ${new Date().toLocaleString()}`
        });

        if (testRes.success) {
          resultBox.innerHTML = `
            <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.3); border-radius:var(--radius-md); padding:12px; font-size:0.84rem;">
              <div style="font-weight:700; color:#10B981; margin-bottom:4px;">🎉 Real Test Post Published to Facebook!</div>
              <div>Page: <strong>${pageName}</strong> (ID: <code>${pageId}</code>)</div>
              <div>Post ID: <code>${testRes.postId}</code></div>
              <div style="margin-top:6px;">
                <a href="${testRes.postUrl}" target="_blank" rel="noopener noreferrer" style="color:#1877F2; text-decoration:underline; font-weight:600;">
                  View Live Post on Facebook &rarr;
                </a>
              </div>
            </div>
          `;
          this.showToast('Test post published to Facebook!', 'success');
        } else {
          resultBox.innerHTML = `
            <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-md); padding:12px; font-size:0.84rem;">
              <div style="font-weight:700; color:#EF4444; margin-bottom:4px;">❌ Test Post Failed</div>
              <div style="color:var(--text-secondary);">${testRes.message || testRes.error}</div>
            </div>
          `;
          this.showToast(testRes.message || 'Test post failed', 'error');
        }
      } catch (err) {
        resultBox.innerHTML = `
          <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3); border-radius:var(--radius-md); padding:12px; font-size:0.84rem;">
            <div style="font-weight:700; color:#EF4444; margin-bottom:4px;">❌ Network Error</div>
            <div style="color:var(--text-secondary);">${err.message}</div>
          </div>
        `;
      }
    });

    // Connect Selected Page Button
    document.getElementById('btn-save-fb-config').addEventListener('click', async () => {
      const selectedId = currentSelectedPageId;
      const selectedName = currentSelectedPageName || defaultPageName;

      if (!selectedId) {
        this.showToast('অনুগ্রহ করে টোকেন দিয়ে প্রথমে একটি Facebook Page আবিষ্কার ও নির্বাচন করুন।', 'warning');
        return;
      }

      const btn = document.getElementById('btn-save-fb-config');
      const originalText = btn.innerHTML;
      btn.innerHTML = `<span>সংযুক্ত করা হচ্ছে...</span>`;
      btn.disabled = true;

      // Select page on server & get token
      const selectRes = await SocialManagerService.selectFacebookPage(selectedId);
      const chosenPage = discoveredPages.find(p => p.id === selectedId);
      const tokenInput = (document.getElementById('fb-token-input')?.value || '').trim();
      const chosenToken = selectRes?.token || chosenPage?.accessToken || tokenInput || SocialManagerService.getFacebookToken(project);

      // Verify page status with token
      const status = await SocialManagerService.checkFacebookStatus(selectedId, chosenToken);
      btn.innerHTML = originalText;
      btn.disabled = false;

      const finalPageId = status.pageId || selectedId;
      const finalPageName = status.pageName || selectedName;
      const cleanHandle = `@${finalPageName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      SocialManagerService.connectFacebookPage(project, {
        pageId: finalPageId,
        pageName: finalPageName,
        handle: cleanHandle,
        token: chosenToken || '',
        tokenConfigured: true
      });

      storage.saveState();
      this.closeModal();

      if (status.success && status.connected) {
        this.showToast(`🎉 Facebook Page "${finalPageName}" সফলভাবে সংযুক্ত হয়েছে!`, 'success');
      } else {
        this.showToast(`Facebook সংযুক্ত হয়েছে (টোকেন যাচাই সতর্কবার্তা: ${status.message || 'অনুমতি চেক করুন'})`, 'warning');
      }

      this.render();
    });
  }

  // --- GOOGLE OAUTH 2.0 YOUTUBE MODAL ---
  openYouTubeOAuthModal(platform) {
    const project = storage.getActiveProject();
    const currentClientId = GoogleAuthService.getClientId();

    const existingToken = GoogleAuthService.getYouTubeToken(project);
    const ytAccount = project.socialAccounts.find(a => a.id === 'youtube');
    const defaultHandle = ytAccount?.handle || '@chikubd';

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card" style="max-width:580px;">
          <div class="modal-header">
            <h3 class="modal-title" style="display:flex; align-items:center; gap:10px;">
              <span style="width:34px; height:34px; border-radius:var(--radius-sm); background:#FF0000; color:white; display:flex; align-items:center; justify-content:center;">
                <i data-lucide="youtube"></i>
              </span>
              <span>Connect YouTube Shorts (Data API v3)</span>
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; padding:4px 0 10px;">
              <div style="width:48px; height:48px; border-radius:50%; background:#fef2f2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 8px; border:2px solid #fca5a5;">
                <i data-lucide="youtube" style="width:26px; height:26px;"></i>
              </div>
              <h4 style="font-size:1.15rem; font-weight:800; color:var(--text-primary);">YouTube চ্যানেল পরিবর্তন ও কনফিগারেশন</h4>
              <p style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">
                আপনার পছন্দমতো যেকোনো YouTube চ্যানেল সিলেক্ট বা পরিবর্তন করুন।
              </p>
            </div>

            <!-- Current Connected Channel Preview Bar -->
            <div style="background:var(--bg-subtle); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:10px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">বর্তমানে সিলেক্টেড চ্যানেল:</div>
                <div style="font-size:0.95rem; font-weight:800; color:var(--text-primary);">
                  ${ytAccount?.channelTitle || 'chiku bd'} 
                  <span style="font-size:0.8rem; font-weight:600; color:#FF0000; margin-left:4px;">(${ytAccount?.handle || '@chikubd'})</span>
                </div>
              </div>
              <button type="button" class="btn btn-danger btn-sm" id="btn-modal-disconnect-yt" style="font-size:0.75rem; padding:5px 10px; gap:4px;">
                <i data-lucide="trash-2" style="width:13px; height:13px;"></i> <span>Disconnect</span>
              </button>
            </div>

            <!-- Option 1: 1-Click Instant Switch to chiku bd -->
            <div style="margin-bottom:12px;">
              <button class="btn btn-primary" id="btn-quick-activate-yt" style="width:100%; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none; padding:11px; font-weight:700; font-size:0.88rem; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.25);">
                <i data-lucide="check-circle-2"></i>
                <span>⚡ ১-ক্লিকে "chiku bd" (@chikubd) তে পরিবর্তন করুন</span>
              </button>
            </div>

            <!-- Option 2: Custom Channel Name & Handle Edit Form -->
            <div style="background:var(--bg-card); border:1.5px solid var(--border-light); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:14px;">
              <h5 style="margin:0 0 8px; font-size:0.84rem; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
                <i data-lucide="edit-3" style="width:14px; height:14px; color:#4f46e5;"></i>
                <span>অন্য যেকোনো চ্যানেলের নাম ও হ্যান্ডেল লিখুন:</span>
              </h5>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                <div>
                  <label class="form-label" style="font-size:0.73rem; margin-bottom:4px;">চ্যানেলের নাম (Title)</label>
                  <input type="text" class="form-input" id="input-custom-yt-title" value="${ytAccount?.channelTitle === 'md nahid' ? 'chiku bd' : (ytAccount?.channelTitle || 'chiku bd')}" placeholder="যেমন: chiku bd" style="font-size:0.82rem;" />
                </div>
                <div>
                  <label class="form-label" style="font-size:0.73rem; margin-bottom:4px;">চ্যানেল হ্যান্ডেল (@Handle)</label>
                  <input type="text" class="form-input" id="input-custom-yt-handle" value="${ytAccount?.handle === '@mdnahid-du5ln' ? '@chikubd' : (ytAccount?.handle || '@chikubd')}" placeholder="যেমন: @chikubd" style="font-size:0.82rem;" />
                </div>
              </div>
              <button type="button" class="btn btn-outline btn-sm" id="btn-save-custom-yt-channel" style="width:100%; border-color:#4f46e5; color:#4f46e5; font-weight:700; gap:6px;">
                <i data-lucide="save"></i>
                <span>এই চ্যানেলটি সেভ ও সক্রিয় করুন (Save & Switch)</span>
              </button>
            </div>

            <!-- Option 3: Switch Google Account Button -->
            <div style="margin-bottom:14px;">
              <button class="btn btn-outline" id="btn-trigger-google-oauth" style="width:100%; border-color:#FF0000; color:#FF0000; font-weight:700; padding:10px; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="user-check"></i>
                <span>🔄 অন্য Google Account দিয়ে লগইন করুন (Switch Google Account)</span>
              </button>
              <div style="font-size:0.72rem; color:var(--text-muted); text-align:center; margin-top:4px;">
                লগইন পপআপ আসলে আপনার মূল Gmail একাউন্ট সিলেক্ট করবেন।
              </div>
            </div>

            <!-- Option 4: Direct Token Paste & OAuth Playground helper -->
            <div style="background:var(--bg-subtle); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:12px 14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="font-size:0.8rem; font-weight:700; color:var(--text-primary); margin:0;">
                  Google OAuth Access Token:
                </label>
                <a href="https://developers.google.com/oauthplayground/#step1&apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload%2Chttps%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly" target="_blank" rel="noopener noreferrer" style="font-size:0.73rem; color:#FF0000; text-decoration:none; display:flex; align-items:center; gap:3px; font-weight:600;">
                  <span>Google OAuth Playground</span>
                  <i data-lucide="external-link" style="width:11px; height:11px;"></i>
                </a>
              </div>
              <textarea class="form-input" id="modal-yt-token-input" rows="2" style="font-family:monospace; font-size:0.78rem; resize:vertical;" placeholder="ya29... (Google Access Token পেস্ট করুন)">${existingToken || ''}</textarea>
              <div id="yt-token-verify-status" style="margin-top:8px; display:none;"></div>
              <div style="display:flex; gap:8px; margin-top:8px;">
                <button type="button" class="btn btn-primary btn-sm" id="btn-verify-save-yt-token" style="background:#FF0000; border-color:#FF0000; flex:1; display:flex; align-items:center; justify-content:center; gap:6px;">
                  <i data-lucide="check-circle-2"></i>
                  <span>টোকেন যাচাই ও সেভ করুন</span>
                </button>
              </div>
            </div>

            <!-- Advanced Client ID settings toggle -->
            <details style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:8px;">
              <summary style="cursor:pointer; font-weight:600; color:var(--text-muted);">Client ID কনফিগারেশন</summary>
              <div style="margin-top:8px; display:flex; gap:6px;">
                <input type="text" class="form-input" id="input-oauth-client-id" value="${currentClientId || ''}" placeholder="Enter Client ID" style="font-size:0.75rem; font-family:var(--font-mono);" />
                <button class="btn btn-outline btn-sm" id="btn-save-client-id">Save</button>
              </div>
            </details>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-close-modal">বাতিল</button>
          </div>
        </div>
      </div>
    `);
    this.refreshIcons();

    const saveClientIdBtn = document.getElementById('btn-save-client-id');
    if (saveClientIdBtn) {
      saveClientIdBtn.addEventListener('click', () => {
        const val = document.getElementById('input-oauth-client-id').value.trim();
        if (val) GoogleAuthService.setClientId(val);
        this.showToast('Google Client ID saved!', 'success');
      });
    }

    // Disconnect YouTube Channel from Modal
    const modalDisconnectBtn = document.getElementById('btn-modal-disconnect-yt');
    if (modalDisconnectBtn) {
      modalDisconnectBtn.addEventListener('click', () => {
        SocialManagerService.disconnectPlatform(project, 'youtube');
        storage.saveState();
        this.showToast('YouTube চ্যানেল ডিসকানেক্ট করা হয়েছে। আপনি এখন নতুন চ্যানেল কানেক্ট করতে পারেন।', 'info');
        this.closeModal();
        this.render();
      });
    }

    // 1-Click Switch to chiku bd
    const quickActivateBtn = document.getElementById('btn-quick-activate-yt');
    if (quickActivateBtn) {
      quickActivateBtn.addEventListener('click', () => {
        let ytAccount = project.socialAccounts.find(a => a.id === 'youtube');
        if (!ytAccount) {
          ytAccount = {
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
          project.socialAccounts.push(ytAccount);
        }
        ytAccount.connected = true;
        ytAccount.active = true;
        ytAccount.handle = '@chikubd';
        ytAccount.channelTitle = 'chiku bd';
        ytAccount.channelId = 'UCCOo5jxEtLRgJQukBMnt-QQ';
        ytAccount.followers = 'Active';
        ytAccount.avatar = '';
        ytAccount.lastPost = 'Ready';

        if (!project.scheduleSettings.targetPlatforms.includes('youtube')) {
          project.scheduleSettings.targetPlatforms.push('youtube');
        }

        storage.saveState();
        this.showToast('🎉 চ্যানেল সফলভাবে পরিবর্তন করে "chiku bd" (@chikubd) সেট করা হয়েছে!', 'success');
        this.closeModal();
        this.render();
      });
    }

    // Custom Channel Title & Handle Save
    const saveCustomChannelBtn = document.getElementById('btn-save-custom-yt-channel');
    if (saveCustomChannelBtn) {
      saveCustomChannelBtn.addEventListener('click', () => {
        const titleVal = (document.getElementById('input-custom-yt-title')?.value || '').trim() || 'chiku bd';
        let handleVal = (document.getElementById('input-custom-yt-handle')?.value || '').trim() || '@chikubd';
        if (!handleVal.startsWith('@')) handleVal = '@' + handleVal;

        let ytAccount = project.socialAccounts.find(a => a.id === 'youtube');
        if (!ytAccount) {
          ytAccount = {
            id: 'youtube',
            name: 'YouTube Shorts',
            icon: 'youtube',
            color: '#FF0000',
            connected: true,
            active: true
          };
          project.socialAccounts.push(ytAccount);
        }
        ytAccount.connected = true;
        ytAccount.active = true;
        ytAccount.channelTitle = titleVal;
        ytAccount.handle = handleVal;
        ytAccount.channelId = ytAccount.channelId || 'UCCOo5jxEtLRgJQukBMnt-QQ';
        ytAccount.followers = 'Active';
        ytAccount.avatar = '';
        ytAccount.lastPost = 'Ready';

        if (!project.scheduleSettings.targetPlatforms.includes('youtube')) {
          project.scheduleSettings.targetPlatforms.push('youtube');
        }

        storage.saveState();
        this.showToast(`🎉 চ্যানেল সফলভাবে পরিবর্তন করে "${titleVal}" (${handleVal}) সেট করা হয়েছে!`, 'success');
        this.closeModal();
        this.render();
      });
    }

    // 1. Google 1-Click Button
    document.getElementById('btn-trigger-google-oauth').addEventListener('click', async () => {
      const btn = document.getElementById('btn-trigger-google-oauth');
      let id = GoogleAuthService.getClientId();
      if (!id) {
        const val = document.getElementById('input-oauth-client-id').value.trim();
        if (val) GoogleAuthService.setClientId(val);
      }

      btn.disabled = true;
      btn.innerHTML = 'Connecting to Google OAuth...';

      try {
        const result = await GoogleAuthService.connectYouTubeChannel(project);
        this.closeModal();
        this.showToast(`Connected YouTube: ${result.channel?.title || 'YouTube Channel'}!`, 'success');
        this.render();
      } catch (err) {
        console.warn('Google OAuth error:', err);
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="play-circle"></i> Try Again with Google';
        this.refreshIcons();
        if (err.message && (err.message.includes('Service unavailable') || err.message.includes('servicestricted') || err.message.includes('restricted'))) {
          alert(`Google Service Notice:\nGoogle পপআপে ব্র্যান্ড চ্যানেল নামের ওপর ক্লিক না করে আপনার মূল Gmail ইমেইল সিলেক্ট করুন।\n\nএছাড়াও Google Cloud-এ YouTube Data API v3 এনেবল করা থাকতে হবে।\n\nআপনি চাইলে সহজে "⚡ চ্যানেল chiku bd সচল রাখুন" বাটন বা Google OAuth Playground ব্যবহার করতে পারেন।`);
        } else {
          alert(`Google OAuth Notice:\n${err.message || 'Popup closed or origin not authorized'}\n\nআপনি চাইলে উপরের Google OAuth Playground লিংক থেকে সরাসরি Access Token কপি করে নিচে পেস্ট করতে পারেন।`);
        }
      }
    });

    // 2. Token Verify & Save Button
    document.getElementById('btn-verify-save-yt-token').addEventListener('click', async () => {
      const tokenInput = (document.getElementById('modal-yt-token-input')?.value || '').trim();
      const statusBox = document.getElementById('yt-token-verify-status');

      if (!tokenInput) {
        alert('অনুগ্রহ করে Google/YouTube Access Token পেস্ট করুন।');
        return;
      }

      const btn = document.getElementById('btn-verify-save-yt-token');
      btn.disabled = true;
      btn.innerText = 'যাচাই হচ্ছে...';

      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<span style="font-size:0.78rem; color:var(--text-muted);">YouTube Data API v3 এর সাথে যোগাযোগ করা হচ্ছে...</span>';
      }

      try {
        const check = await GoogleAuthService.testYouTubeToken(tokenInput);
        GoogleAuthService.setYouTubeToken(project, tokenInput);

        const ch = check.channel;
        let ytAcc = project.socialAccounts.find(a => a.id === 'youtube');
        if (!ytAcc) {
          ytAcc = { id: 'youtube', name: 'YouTube Shorts', icon: 'youtube', color: '#FF0000', connected: true, active: true };
          project.socialAccounts.push(ytAcc);
        }
        ytAcc.connected = true;
        ytAcc.active = true;
        ytAcc.channelId = ch.id;
        ytAcc.channelTitle = ch.title;
        ytAcc.handle = ch.customUrl || `@${(ch.title || '').toLowerCase().replace(/\s+/g, '')}`;
        ytAcc.accessToken = tokenInput;
        ytAcc.token = tokenInput;
        ytAcc.lastPost = 'Ready';
        if (ch.avatar) ytAcc.avatar = ch.avatar;

        if (!project.scheduleSettings.targetPlatforms.includes('youtube')) {
          project.scheduleSettings.targetPlatforms.push('youtube');
        }

        storage.saveState();

        if (statusBox) {
          statusBox.innerHTML = `
            <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.3); border-radius:4px; padding:6px 10px; font-size:0.78rem; color:#10B981; font-weight:600;">
              ✓ চ্যানেল ভেরিফাইড: <strong>${ch.title}</strong> (${ch.id}) &bull; ${ch.subscribers} সাবস্ক্রাইবার
            </div>
          `;
        }

        this.showToast(`🎉 YouTube চ্যানেল "${ch.title}" সফলভাবে সংযুক্ত হয়েছে!`, 'success');
        setTimeout(() => {
          this.closeModal();
          this.render();
        }, 1200);

      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check-circle-2"></i> <span>টোকেন যাচাই ও সেভ করুন</span>';
        this.refreshIcons();

        if (statusBox) {
          statusBox.innerHTML = `
            <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); border-radius:4px; padding:6px 10px; font-size:0.78rem; color:#EF4444;">
              ⚠ ত্রুটি: ${err.message}
            </div>
          `;
        }
      }
    });
  }

  // --- VIDEO PLAYER MODAL ---
  async openVideoPlayerModal(videoId) {
    const project = storage.getActiveProject();
    const video = project.videos.find(v => v.id === videoId);
    if (!video) return;

    let playableUrl = video.videoUrl || video.downloadUrl || video.url || '';
    if (video.source === 'Local Upload' || (playableUrl && playableUrl.startsWith('blob:'))) {
      try {
        const dbBlob = await getVideoBlob(videoId);
        if (dbBlob) {
          playableUrl = URL.createObjectURL(dbBlob);
          video.videoUrl = playableUrl;
        }
      } catch (e) {
        console.warn('Could not restore blob from IndexedDB:', e);
      }
    }

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card" style="max-width:760px;">
          <div class="modal-header">
            <h3 class="modal-title" style="font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:600px;">
              ${video.title}
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" style="padding:20px;">
            <div style="display:grid; grid-template-columns: 280px 1fr; gap:20px;">
              <div>
                <div style="background:#000; border-radius:var(--radius-md); overflow:hidden; aspect-ratio:9/14; display:flex; align-items:center; justify-content:center;">
                  <video src="${playableUrl}" controls autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.75rem; color:var(--text-muted); font-weight:600;">
                  <span>Duration: ${video.duration}</span>
                  <span>Size: ${video.size}</span>
                </div>
              </div>

              <div style="display:flex; flex-direction:column;">
                <div style="margin-bottom:14px;">
                  <label class="form-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>AI Caption & Hashtags</span>
                    <button class="btn btn-outline btn-sm" id="btn-modal-regen-ai" style="padding:3px 8px; font-size:0.75rem;">
                      <i data-lucide="sparkles"></i> Generate AI Caption
                    </button>
                  </label>
                  <textarea class="form-textarea" id="modal-video-caption" style="min-height:180px; font-size:0.86rem;" placeholder="Click 'Generate AI Caption' or write caption here...">${video.caption || ''}</textarea>
                </div>

                <div class="form-group">
                  <label class="form-label">Scheduled Date & Time</label>
                  <input type="datetime-local" class="form-input" id="modal-video-date" value="${video.scheduledDate ? video.scheduledDate.substring(0, 16) : ''}" />
                </div>

                <div style="margin-top:auto; display:flex; gap:10px; justify-content:flex-end;">
                  <button class="btn btn-outline btn-sm" id="btn-save-video-details">Save Changes</button>
                  <button class="btn btn-primary btn-sm" id="btn-modal-publish-now" style="background:#1877F2; border-color:#1877F2; color:#fff; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="send"></i>
                    <span>Publish to Facebook Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

    document.getElementById('btn-save-video-details').addEventListener('click', () => {
      const newCaption = document.getElementById('modal-video-caption').value;
      const newDate = document.getElementById('modal-video-date').value;
      storage.updateVideo(videoId, {
        caption: newCaption,
        scheduledDate: newDate ? new Date(newDate).toISOString() : null,
        status: newDate ? 'scheduled' : video.status
      });
      this.closeModal();
      this.showToast('Video updated', 'success');
      this.render();
    });

    document.getElementById('btn-modal-publish-now')?.addEventListener('click', async () => {
      const activeFb = project.socialAccounts.find(a => a.id === 'facebook' && a.connected && a.active);
      const activeYt = project.socialAccounts.find(a => a.id === 'youtube' && a.connected && a.active);
      const targets = [];
      if (activeFb) targets.push(activeFb.pageName || 'Facebook Page');
      if (activeYt) targets.push(activeYt.channelTitle || 'YouTube Shorts');
      const targetName = targets.length > 0 ? targets.join(' & ') : 'Connected Social Accounts';

      const fbToken = SocialManagerService.getFacebookToken(project);
      const ytToken = GoogleAuthService.getYouTubeToken(project);

      if ((activeFb && !fbToken) || (activeYt && !ytToken)) {
        this.closeModal();
        this.openPublishTokenModal(project, videoId, 'ফেসবুক এবং ইউটিউবে একসাথে লাইভ ভিডিও পোস্ট করতে Token প্রয়োজন।');
        return;
      }

      if (!confirm(`Do you want to publish "${video.title}" to ${targetName} now?`)) return;

      this.closeModal();
      this.showToast(`Publishing "${video.title.substring(0, 25)}..."`, 'info');
      try {
        await SchedulerService.publishVideo(project, videoId, (p) => {
          if (p.message) this.showToast(p.message, 'info');
        });
        storage.saveState();
        this.showToast(`🎉 "${video.title}" published successfully to ${targetName}!`, 'success');
        this.render();
      } catch (err) {
        if (err.message && (err.message.includes('TOKEN') || err.message.includes('190') || err.message.includes('token') || err.message.includes('টোকেন') || err.message.includes('Access Token'))) {
          this.openPublishTokenModal(project, videoId, err.message);
        } else {
          this.showToast(err.message, 'error');
        }
        this.render();
      }
    });

    document.getElementById('btn-modal-regen-ai').addEventListener('click', async () => {
      const btn = document.getElementById('btn-modal-regen-ai');
      btn.innerHTML = 'Generating...';
      const aiResult = await AICaptionService.generateCaption(video, project.aiSettings, project.niche);
      document.getElementById('modal-video-caption').value = aiResult.caption;
      btn.innerHTML = '<i data-lucide="sparkles"></i> Generate AI Caption';
      createIcons({ icons });
      this.showToast('AI caption generated!', 'success');
    });
  }

  // --- GLOBAL EVENT BINDING ---
  bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const tabTarget = e.target.closest('[data-tab]');
      if (tabTarget) {
        e.preventDefault();
        this.currentTab = tabTarget.getAttribute('data-tab');
        this.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  bindTabEvents() {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        storage.logoutUser();
        this.showToast('Signed out', 'info');
        this.render();
      });
    }

    const projDropdown = document.getElementById('btn-project-dropdown');
    if (projDropdown) {
      projDropdown.addEventListener('click', () => this.openProjectSwitcherModal());
    }

    const openNewProjBtn = document.getElementById('btn-open-new-project-modal');
    if (openNewProjBtn) {
      openNewProjBtn.addEventListener('click', () => this.openNewProjectModal());
    }

    // Dashboard navigation links
    const dashAddVideos = document.getElementById('btn-dash-add-videos') || document.getElementById('btn-dash-import-empty') || document.getElementById('btn-check-add-videos');
    if (dashAddVideos) {
      dashAddVideos.addEventListener('click', () => { this.currentTab = 'drive'; this.render(); });
    }

    const dashConnectSocial = document.getElementById('btn-dash-connect-social') || document.getElementById('btn-check-connect-social');
    if (dashConnectSocial) {
      dashConnectSocial.addEventListener('click', () => { this.currentTab = 'social'; this.render(); });
    }

    const checkSchedule = document.getElementById('btn-check-schedule');
    if (checkSchedule) {
      checkSchedule.addEventListener('click', () => { this.currentTab = 'schedule'; this.render(); });
    }

    const headerSync = document.getElementById('btn-header-sync');
    if (headerSync) {
      headerSync.addEventListener('click', () => { this.currentTab = 'drive'; this.render(); });
    }

    const headerPublish = document.getElementById('btn-header-publish');
    if (headerPublish) {
      headerPublish.addEventListener('click', () => this.runPublishAction(false));
    }

    const headerSimulate = document.getElementById('btn-header-simulate');
    if (headerSimulate) {
      headerSimulate.addEventListener('click', () => this.runPublishAction(true));
    }

    const triggerViralScheduler = async (forceAll = true) => {
      const project = storage.getActiveProject();
      if (!project || !project.videos || project.videos.length === 0) {
        this.showToast('শিডিউল করার জন্য প্রথমে গুগল ড্রাইভ থেকে ভিডিও লোড করুন।', 'warning');
        return;
      }

      this.showToast(`সব ${project.videos.length}টি ভিডিওতে AI ক্যাপশন ও হ্যাশট্যাগ যুক্ত করে ৩টি ভাইরাল স্লটে শিডিউল করা হচ্ছে...`, 'info', 4000);

      try {
        const res = await SchedulerService.autoScheduleVideos(project, (msg) => {
          console.log('[Scheduler Progress]', msg);
        }, { forceAll: true });

        storage.saveState();

        try {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch (e) {}

        this.showToast(res.message, 'success', 7000);
        this.render();
      } catch (err) {
        console.error('[Scheduler Error]', err);
        this.showToast('শিডিউল করার সময় ত্রুটি: ' + err.message, 'danger');
      }
    };

    ['btn-dash-auto-schedule', 'btn-run-auto-scheduler', 'btn-schedule-pipeline-view', 'btn-auto-schedule-viral-loaded', 'btn-auto-schedule-viral-loaded-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          triggerViralScheduler(true);
        });
      }
    });

    // Video card actions
    document.querySelectorAll('.btn-publish-single-video').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const vidId = btn.getAttribute('data-video-id');
        const project = storage.getActiveProject();
        const video = project.videos.find(v => v.id === vidId);
        if (!video) return;

        const activeFb = project.socialAccounts.find(a => a.id === 'facebook' && a.connected && a.active);
        const activeYt = project.socialAccounts.find(a => a.id === 'youtube' && a.connected && a.active);
        const targets = [];
        if (activeFb) targets.push(activeFb.pageName || 'Facebook Page');
        if (activeYt) targets.push(activeYt.channelTitle || 'YouTube Shorts');
        const targetName = targets.length > 0 ? targets.join(' & ') : 'Connected Social Accounts';

        const fbToken = SocialManagerService.getFacebookToken(project);
        const ytToken = GoogleAuthService.getYouTubeToken(project);

        if ((activeFb && !fbToken) || (activeYt && !ytToken)) {
          this.openPublishTokenModal(project, vidId, 'ফেসবুক এবং ইউটিউবে একসাথে লাইভ ভিডিও পোস্ট করতে Token প্রয়োজন।');
          return;
        }

        if (!confirm(`Do you want to publish "${video.title}" to ${targetName} now?`)) {
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i><span>Publishing...</span>';
        createIcons({ icons });

        this.showToast(`Publishing "${video.title.substring(0, 25)}..."`, 'info');

        try {
          await SchedulerService.publishVideo(project, vidId, (p) => {
            if (p.message) this.showToast(p.message, 'info');
          });
          storage.saveState();
          this.showToast(`🎉 "${video.title}" published successfully to ${targetName}!`, 'success');
          this.render();
        } catch (err) {
          if (err.message && (err.message.includes('TOKEN') || err.message.includes('190') || err.message.includes('token') || err.message.includes('টোকেন') || err.message.includes('Access Token'))) {
            this.openPublishTokenModal(project, vidId, err.message);
          } else {
            this.showToast(err.message, 'error');
          }
          this.render();
        }
      });
    });

    document.querySelectorAll('.btn-open-video-player').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = el.getAttribute('data-video-id');
        this.openVideoPlayerModal(vidId);
      });
    });

    document.querySelectorAll('.btn-delete-video').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const vidId = el.getAttribute('data-video-id');
        if (confirm('Remove this video from project?')) {
          storage.deleteVideo(vidId);
          this.showToast('Video removed', 'info');
          this.render();
        }
      });
    });

    document.querySelectorAll('.btn-generate-single-caption').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const vidId = el.getAttribute('data-video-id');
        const project = storage.getActiveProject();
        const video = project.videos.find(v => v.id === vidId);
        if (video) {
          el.innerHTML = 'Generating...';
          const aiResult = await AICaptionService.generateCaption(video, project.aiSettings, project.niche);
          video.caption = aiResult.caption;
          video.hook = aiResult.hook;
          storage.saveState();
          this.showToast('AI Caption generated!', 'success');
          this.render();
        }
      });
    });

    // Google Drive API Key Save Event
    const saveApiKeyBtn = document.getElementById('btn-save-google-api-key');
    if (saveApiKeyBtn) {
      saveApiKeyBtn.addEventListener('click', () => {
        const keyInput = document.getElementById('input-google-api-key');
        const keyVal = keyInput ? keyInput.value.trim() : '';
        if (keyVal) {
          localStorage.setItem('omni_google_api_key', keyVal);
          const project = storage.getActiveProject();
          if (project) {
            project.aiSettings = project.aiSettings || {};
            project.aiSettings.googleApiKey = keyVal;
            storage.saveState();
          }
          this.showToast('Google Drive API Key সেভ ও সক্রিয় করা হয়েছে!', 'success');
          this.render();
          const folderInput = document.getElementById('input-drive-url');
          if (folderInput && folderInput.value.trim()) {
            this.syncDriveFromCurrentInput(folderInput.value.trim());
          }
        } else {
          localStorage.removeItem('omni_google_api_key');
          this.showToast('Google API Key সরানো হয়েছে', 'warning');
          this.render();
        }
      });
    }

    // Drive Sync Events
    const tabSingle = document.getElementById('btn-tab-single-link');
    const tabBatch = document.getElementById('btn-tab-batch-links');
    const secSingle = document.getElementById('drive-single-input-section');
    const secBatch = document.getElementById('drive-batch-input-section');

    if (tabSingle && tabBatch && secSingle && secBatch) {
      tabSingle.addEventListener('click', () => {
        tabSingle.classList.remove('btn-outline');
        tabSingle.classList.add('btn-primary');
        tabBatch.classList.remove('btn-primary');
        tabBatch.classList.add('btn-outline');
        secSingle.style.display = 'flex';
        secBatch.style.display = 'none';
      });

      tabBatch.addEventListener('click', () => {
        tabBatch.classList.remove('btn-outline');
        tabBatch.classList.add('btn-primary');
        tabSingle.classList.remove('btn-primary');
        tabSingle.classList.add('btn-outline');
        secSingle.style.display = 'none';
        secBatch.style.display = 'block';
      });
    }

    const syncDriveBtn = document.getElementById('btn-sync-drive-action');
    if (syncDriveBtn) {
      syncDriveBtn.addEventListener('click', () => this.syncDriveFromCurrentInput());
    }

    const syncBatchBtn = document.getElementById('btn-sync-batch-action');
    if (syncBatchBtn) {
      syncBatchBtn.addEventListener('click', () => {
        const batchVal = document.getElementById('input-drive-batch')?.value || '';
        this.syncDriveFromCurrentInput(batchVal);
      });
    }

    const authDriveBtn = document.getElementById('btn-auth-drive-google');
    if (authDriveBtn) {
      authDriveBtn.addEventListener('click', () => {
        this.openYouTubeOAuthModal({ id: 'youtube', name: 'YouTube Shorts & Google Drive' });
      });
    }

    // Local Upload Handlers
    const browseFilesBtn = document.getElementById('btn-browse-files');
    const inputFiles = document.getElementById('file-input-files');
    if (browseFilesBtn && inputFiles) {
      browseFilesBtn.addEventListener('click', () => inputFiles.click());
      inputFiles.addEventListener('change', async (e) => {
        await this.handleLocalFilesImport(e.target.files);
      });
    }

    const browseFolderBtn = document.getElementById('btn-browse-folder');
    const inputFolder = document.getElementById('file-input-folder');
    if (browseFolderBtn && inputFolder) {
      browseFolderBtn.addEventListener('click', () => inputFolder.click());
      inputFolder.addEventListener('change', async (e) => {
        await this.handleLocalFilesImport(e.target.files);
      });
    }

    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });
      dropzone.addEventListener('drop', async (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
          await this.handleLocalFilesImport(e.dataTransfer.files);
        }
      });
    }

    // Social Events
    const connectAllChannels = document.getElementById('btn-connect-all-channels');
    if (connectAllChannels) {
      connectAllChannels.addEventListener('click', () => {
        const project = storage.getActiveProject();
        SocialManagerService.connectAllPlatforms(project);
        storage.saveState();
        this.showToast('All 6 channels connected with 1-click!', 'success');
        this.render();
      });
    }

    document.querySelectorAll('.btn-connect-platform').forEach(btn => {
      btn.addEventListener('click', () => {
        const platId = btn.getAttribute('data-platform-id');
        this.openSocialConnectModal(platId);
      });
    });

    document.querySelectorAll('.btn-disconnect-platform').forEach(btn => {
      btn.addEventListener('click', () => {
        const platId = btn.getAttribute('data-platform-id');
        const project = storage.getActiveProject();
        SocialManagerService.disconnectPlatform(project, platId);
        storage.saveState();
        this.showToast('Platform disconnected', 'warning');
        this.render();
      });
    });

    document.querySelectorAll('.toggle-platform-active').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const platId = checkbox.getAttribute('data-platform-id');
        const project = storage.getActiveProject();
        SocialManagerService.toggleActiveStatus(project, platId, checkbox.checked);
        storage.saveState();
        this.showToast(`Auto-posting ${checkbox.checked ? 'activated' : 'paused'} for this channel`);
      });
    });

    // AI Tab Events
    const testApiKeyBtn = document.getElementById('btn-test-api-key');
    if (testApiKeyBtn) {
      testApiKeyBtn.addEventListener('click', async () => {
        const provider = document.getElementById('ai-provider-select').value;
        const key = document.getElementById('ai-api-key-input').value;
        const statusBox = document.getElementById('ai-key-status');
        statusBox.innerHTML = '<span style="color:var(--text-muted);">Testing connection...</span>';
        const res = await AICaptionService.testApiKey(provider, key);
        statusBox.innerHTML = `<span style="font-weight:600; color:${res.success ? 'var(--success)' : 'var(--danger)'};">${res.message}</span>`;
      });
    }

    const toggleKeyVisBtn = document.getElementById('btn-toggle-key-visibility');
    if (toggleKeyVisBtn) {
      toggleKeyVisBtn.addEventListener('click', () => {
        const keyInput = document.getElementById('ai-api-key-input');
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      });
    }

    const hashtagSlider = document.getElementById('ai-hashtag-slider');
    const hashtagDisplay = document.getElementById('hashtag-count-display');
    if (hashtagSlider && hashtagDisplay) {
      hashtagSlider.addEventListener('input', () => {
        hashtagDisplay.innerText = hashtagSlider.value;
      });
    }

    const saveAiBtn = document.getElementById('btn-save-ai-settings');
    if (saveAiBtn) {
      saveAiBtn.addEventListener('click', () => {
        const project = storage.getActiveProject();
        project.aiSettings = {
          provider: document.getElementById('ai-provider-select').value,
          apiKey: document.getElementById('ai-api-key-input').value.trim(),
          tone: document.getElementById('ai-tone-select').value,
          hashtagCount: parseInt(document.getElementById('ai-hashtag-slider').value, 10),
          callToAction: document.getElementById('ai-cta-input').value.trim()
        };
        storage.saveState();
        this.showToast('AI Settings saved successfully!', 'success');
      });
    }

    const runCaptionTestBtn = document.getElementById('btn-run-caption-test');
    if (runCaptionTestBtn) {
      runCaptionTestBtn.addEventListener('click', async () => {
        const title = document.getElementById('test-video-title-input').value.trim();
        if (!title) {
          alert('Please enter a video topic or title to test.');
          return;
        }
        const project = storage.getActiveProject();
        const output = document.getElementById('test-caption-output');
        output.innerText = '⚡ AI synthesizing viral hook, caption body, and hashtags...';

        const tempAiSettings = {
          provider: document.getElementById('ai-provider-select').value,
          apiKey: document.getElementById('ai-api-key-input').value.trim(),
          tone: document.getElementById('ai-tone-select').value,
          hashtagCount: parseInt(document.getElementById('ai-hashtag-slider').value, 10),
          callToAction: document.getElementById('ai-cta-input').value.trim()
        };

        const res = await AICaptionService.generateCaption({ title }, tempAiSettings, project.niche);
        output.innerText = res.caption;
      });
    }

    // Schedule Tab Events
    const saveScheduleBtn = document.getElementById('btn-save-schedule-settings');
    if (saveScheduleBtn) {
      saveScheduleBtn.addEventListener('click', () => {
        const project = storage.getActiveProject();
        const days = Array.from(document.querySelectorAll('.posting-day-checkbox:checked')).map(cb => cb.value);
        const cadenceEl = document.getElementById('sched-cadence-select');
        const freq = cadenceEl ? parseInt(cadenceEl.value, 10) : 3;

        const slot1 = document.getElementById('sched-time-slot1')?.value || '19:00';
        const slot2 = document.getElementById('sched-time-slot2')?.value || '21:00';
        const slot3 = document.getElementById('sched-time-slot3')?.value || '23:00';

        project.scheduleSettings.frequency = freq;
        project.scheduleSettings.preferredTime = slot1;
        project.scheduleSettings.times = [slot1, slot2, slot3];
        project.scheduleSettings.postingDays = days;
        storage.saveState();
        this.showToast('শিডিউল সেটিংস সেভ হয়েছে (প্রতিদিন ৩টি ভাইরাল টাইম: ৭:০০ PM, ৯:০০ PM, ১১:০০ PM)!', 'success');
      });
    }
  }

  // --- DRIVE SYNC LOGIC ---
  async syncDriveFromCurrentInput(customUrl = null) {
    const singleInput = document.getElementById('input-drive-url');
    const batchInput = document.getElementById('input-drive-batch');
    const alertContainer = document.getElementById('drive-alert-container');
    const syncBtn = document.getElementById('btn-sync-drive-action');
    const batchBtn = document.getElementById('btn-sync-batch-action');

    let url = (customUrl || (batchInput && batchInput.value.trim()) || (singleInput ? singleInput.value.trim() : '')).trim();

    if (!url) {
      if (alertContainer) {
        alertContainer.innerHTML = `
          <div class="alert-box alert-warning">
            <i data-lucide="alert-triangle"></i>
            <div class="alert-content">
              <h4>Missing Google Drive Link</h4>
              <p>অনুগ্রহ করে Google Drive এর ফোল্ডার বা ভিডিও ফাইল লিংক দিন।</p>
            </div>
          </div>
        `;
        createIcons({ icons });
      }
      return;
    }

    const activeBtn = syncBtn || batchBtn;
    if (activeBtn) {
      activeBtn.disabled = true;
      activeBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Scanning Drive...';
      createIcons({ icons });
    }

    const project = storage.getActiveProject();
    const apiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_api_key') : '') || project?.aiSettings?.googleApiKey || 'AIzaSyCiYoZaQ2vtn91ypf87qk4hCMInLsTjyzM';
    const token = GoogleAuthService.getYouTubeToken(project) || (typeof localStorage !== 'undefined' ? localStorage.getItem('omni_google_access_token') : '') || '';

    const scanResult = await DriveSyncService.scanDriveFolder(url, { apiKey, token, project });

    if (activeBtn) {
      activeBtn.disabled = false;
      activeBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync Drive Link';
      createIcons({ icons });
    }

    // Handle scan error or restricted folder
    if (!scanResult.success) {
      if (alertContainer) {
        const folderUrl = scanResult.folderUrl || url;
        const openDriveBtn = (folderUrl && folderUrl.includes('drive.google.com')) ? `
          <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-auth-and-autoscan" style="background:#4285F4; border-color:#4285F4; display:inline-flex; align-items:center; gap:6px; font-weight:700;">
              <i data-lucide="key"></i>
              <span>Google একাউন্ট কানেক্ট করে অটো-স্ক্যান করুন (1-Click Connect & Scan)</span>
            </button>
            <a href="${folderUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
              <i data-lucide="external-link"></i>
              <span>Google Drive-এ ফোল্ডার খুলুন (Open in Drive)</span>
            </a>
            <button type="button" class="btn btn-outline btn-sm" id="btn-drive-retry-action" style="display:inline-flex; align-items:center; gap:6px;">
              <i data-lucide="refresh-cw"></i>
              <span>পুনরায় স্ক্যান করুন (Retry Scan)</span>
            </button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-pick-folder-action" style="display:inline-flex; align-items:center; gap:6px;">
              <i data-lucide="folder"></i>
              <span>কম্পিউটার / Drive Desktop থেকে ফোল্ডার সিলেক্ট করুন</span>
            </button>
          </div>
        ` : '';

        const solutionsHtml = `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 12px 14px; margin-top: 10px;">
            <div style="font-size: 13px; font-weight: 700; color: #ef4444; margin-bottom: 6px;">💡 পুরো ফোল্ডারটি সহজে লোড করার ৩টি উপায়:</div>
            <ol style="margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.6; color: var(--text-secondary);">
              <li><strong>উপায় ১ (সবচেয়ে সহজ - ১ ক্লিক):</strong> নিচের নীল বাটনে চাপ দিয়ে Google একাউন্ট কানেক্ট করুন, স্বয়ংক্রিয়ভাবে ফোল্ডারের সব ভিডিও লোড হয়ে যাবে।</li>
              <li><strong>উপায় ২ (পারমিশন পরিবর্তন):</strong> "Open in Drive" বাটনে চাপ দিয়ে ফোল্ডারে যান ➔ Share অপশনে <strong>General access</strong> এ <strong>"Anyone with the link"</strong> করে Done চাপুন ➔ এরপর "Retry Scan" বাটনে চাপুন।</li>
              <li><strong>উপায় ৩ (কম্পিউটার থেকে):</strong> "কম্পিউটার / Drive Desktop থেকে ফোল্ডার সিলেক্ট করুন" বাটনে ক্লিক করে আপনার পিসি বা গুগল ড্রাইভ ফোল্ডার সিলেক্ট করুন।</li>
            </ol>
            ${openDriveBtn}
          </div>
        `;

        alertContainer.innerHTML = `
          <div class="alert-box alert-danger" style="display: block;">
            <div style="display: flex; gap: 10px; align-items: flex-start;">
              <i data-lucide="alert-circle" style="width:24px; height:24px; flex-shrink:0; color:#ef4444; margin-top: 2px;"></i>
              <div class="alert-content">
                <h4 style="margin:0 0 4px; font-weight:700;">Google Drive Video Scan Alert</h4>
                <p style="white-space: pre-line; line-height: 1.5; margin: 0;">${scanResult.message}</p>
              </div>
            </div>
            ${solutionsHtml}
          </div>
        `;
        createIcons({ icons });

        const authScanBtn = document.getElementById('btn-auth-and-autoscan');
        if (authScanBtn) {
          authScanBtn.addEventListener('click', async () => {
            try {
              authScanBtn.disabled = true;
              authScanBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Connecting Google...';
              createIcons({ icons });
              await GoogleAuthService.connectYouTubeChannel(project);
              this.showToast('Google Connected! Scanning Drive folder...', 'success');
              await this.syncDriveFromCurrentInput(url);
            } catch (authErr) {
              this.showToast(authErr.message, 'warning');
              authScanBtn.disabled = false;
              authScanBtn.innerHTML = '<i data-lucide="key"></i> <span>Google একাউন্ট কানেক্ট করে অটো-স্ক্যান করুন</span>';
              createIcons({ icons });
            }
          });
        }

        const retryBtn = document.getElementById('btn-drive-retry-action');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => this.syncDriveFromCurrentInput(url));
        }

        const pickFolderAction = document.getElementById('btn-pick-folder-action');
        if (pickFolderAction) {
          pickFolderAction.addEventListener('click', () => {
            const folderInput = document.getElementById('file-input-folder');
            if (folderInput) folderInput.click();
          });
        }
      }
      this.showToast(scanResult.error === 'ACCESS_RESTRICTED' ? 'Google Drive Access Restricted' : (scanResult.message || 'Drive Scan Error'), 'error');
      return;
    }

    if (project) {
      scanResult.videos.forEach(v => storage.addVideoToActiveProject(v));
      storage.saveState();
    }
    
    if (alertContainer) {
      alertContainer.innerHTML = `
        <div class="alert-box alert-success" style="display: flex; gap: 10px; align-items: center;">
          <i data-lucide="check-circle" style="width:24px; height:24px; color:#10b981; flex-shrink:0;"></i>
          <div class="alert-content">
            <h4 style="margin: 0; font-weight: 700; color: #10b981;">সফলভাবে ভিডিও লোড হয়েছে! (${scanResult.count}টি ভিডিও)</h4>
            <p style="margin: 3px 0 0; font-size: 13px;">Google Drive থেকে ভিডিওগুলো Video Pipeline-এ যুক্ত হয়েছে।</p>
          </div>
        </div>
      `;
      createIcons({ icons });
    }
    this.showToast(`Imported ${scanResult.count} videos from Drive!`, 'success');
    setTimeout(() => {
      this.render();
    }, 700);
  }

  // --- LOCAL FOLDER / MULTI-FILE IMPORT ---
  async handleLocalFilesImport(files) {
    if (!files || files.length === 0) return;

    this.showToast('Processing video files...', 'info');
    const result = await DriveSyncService.processLocalFiles(files);

    if (!result.success) {
      this.showToast(result.message, 'error');
      return;
    }

    result.videos.forEach(v => storage.addVideoToActiveProject(v));
    storage.saveState();
    this.showToast(`Imported ${result.count} video file(s) successfully!`, 'success');
    this.render();
  }

  // --- PUBLISH ACTION ---
  async runPublishAction(forceSim = false) {
    const project = storage.getActiveProject();
    if (!project || project.videos.length === 0) {
      this.showToast('No videos available in library. Please import a video first.', 'warning');
      return;
    }

    const activeChannels = (project.socialAccounts || []).filter(a => a.connected && a.active);
    if (activeChannels.length === 0) {
      this.showToast('Please connect at least 1 social channel first.', 'warning');
      this.currentTab = 'social';
      this.render();
      return;
    }

    const activeFb = activeChannels.find(a => a.id === 'facebook');
    const fbToken = SocialManagerService.getFacebookToken(project);

    const activeYt = activeChannels.find(a => a.id === 'youtube');
    const ytToken = GoogleAuthService.getYouTubeToken(project);

    if (!forceSim) {
      if ((activeFb && !fbToken) || (activeYt && !ytToken)) {
        const missing = [];
        if (activeFb && !fbToken) missing.push('Facebook Access Token');
        if (activeYt && !ytToken) missing.push('YouTube Access Token');
        this.openPublishTokenModal(project, null, `${missing.join(' এবং ')} অনুপস্থিত। ফেসবুক এবং ইউটিউবে একসাথে লাইভ ভিডিও আপলোড করতে টোকেন দিন অথবা টেস্ট করুন।`);
        return;
      }
    }

    try {
      this.showToast('Starting video publication...', 'info');
      const res = await SchedulerService.publishVideo(project, null, (p) => {
        if (p.message) this.showToast(p.message, 'info');
      }, { forceSimulation: forceSim });
      storage.saveState();
      this.showToast(`🎉 "${res.video?.title || 'Video'}" published successfully to ${res.video?.platforms?.join(', ') || 'Social Channels'}!`, 'success');
      this.render();
    } catch (err) {
      if (err.message && (err.message.includes('TOKEN') || err.message.includes('190') || err.message.includes('token') || err.message.includes('টোকেন') || err.message.includes('Access Token'))) {
        this.openPublishTokenModal(project, null, err.message);
      } else {
        this.showToast(err.message, 'error');
      }
      this.render();
    }
  }

  async openPublishTokenModal(project, targetVideoId = null, errorContext = '') {
    let targetVideo = targetVideoId ? project.videos.find(v => v.id === targetVideoId) : null;
    if (!targetVideo) {
      targetVideo = project.videos.find(v => v.status === 'Processing' || v.status === 'Pending' || v.status === 'Failed' || v.status === 'ready') || project.videos[0];
    }

    let currentBlob = null;
    if (targetVideo) {
      currentBlob = await SchedulerService.resolveVideoBlob(targetVideo);
    }

    const fbAccount = project.socialAccounts?.find(a => a.id === 'facebook');
    const pageName = fbAccount?.pageName || 'Chiku bd';
    const pageId = fbAccount?.pageId || '1309863422219233';
    const existingFbToken = SocialManagerService.getFacebookToken(project);

    const ytAccount = project.socialAccounts?.find(a => a.id === 'youtube');
    const ytChannelTitle = ytAccount?.channelTitle || ytAccount?.handle || 'chiku bd';
    const existingYtToken = GoogleAuthService.getYouTubeToken(project);

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card" style="max-width:620px;">
          <div class="modal-header">
            <h3 class="modal-title" style="display:flex; align-items:center; gap:10px;">
              <span style="width:34px; height:34px; border-radius:var(--radius-sm); background:linear-gradient(135deg, #1877F2, #FF0000); color:white; display:flex; align-items:center; justify-content:center;">
                <i data-lucide="send"></i>
              </span>
              <span>Social Media Video Publishing Dispatch Hub</span>
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <!-- 1. Video Attachment Status & Selector -->
            <div style="background:var(--bg-subtle); border:1px solid var(--border-light); border-radius:var(--radius-md); padding:14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                  <div style="font-weight:700; color:var(--text-primary); font-size:0.92rem;">
                    ভিডিও: <span style="color:var(--primary);">${targetVideo?.title || 'Selected Video'}</span>
                  </div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px;">
                    ${targetVideo?.duration || '0:30'} &bull; ${targetVideo?.size || 'Direct MP4'}
                  </div>
                </div>
                <span id="modal-video-blob-badge" class="badge ${currentBlob ? 'badge-success' : 'badge-danger'}">
                  ${currentBlob ? '✓ ফাইল প্রস্তুত' : '⚠ ফাইল সিলেক্ট করুন'}
                </span>
              </div>
              
              <div style="border-top:1px dashed var(--border-light); padding-top:10px; margin-top:8px;">
                <label style="font-size:0.78rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:4px;">
                  ভিডিও ফাইল (.mp4) সংযুক্ত / পরিবর্তন করুন:
                </label>
                <input type="file" id="modal-publish-file-input" accept="video/mp4,video/webm,video/quicktime" class="form-input" style="padding:6px; font-size:0.8rem;" />
                <div style="font-size:0.74rem; color:var(--text-muted); margin-top:3px;">
                  ফেসবুক এবং ইউটিউবে আসল ভিডিও ফাইল সরাসরি আপলোড করার জন্য ফাইলটি সিলেক্ট করুন।
                </div>
              </div>
            </div>

            <!-- Error / Context Banner if present -->
            ${errorContext ? `
              <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:var(--radius-md); padding:12px 14px; font-size:0.84rem; margin-bottom:14px; color:var(--text-primary);">
                <div style="font-weight:700; color:#EF4444; margin-bottom:3px; display:flex; align-items:center; gap:6px;">
                  <i data-lucide="alert-triangle" style="width:16px; height:16px;"></i>
                  <span>আপডেট বা যাচাই প্রয়োজন</span>
                </div>
                <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.45; margin:0;">
                  ${errorContext.replace(/^Publishing failed:\s*/i, '').replace(/^Facebook Error:\s*/i, '')}
                </p>
              </div>
            ` : ''}

            <!-- 2. Facebook Page Section -->
            <div style="background:linear-gradient(135deg, rgba(24, 119, 242, 0.06), rgba(24, 119, 242, 0.02)); border:1px solid rgba(24, 119, 242, 0.2); border-radius:var(--radius-md); padding:14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="width:26px; height:26px; border-radius:50%; background:#1877F2; color:white; display:flex; align-items:center; justify-content:center;">
                    <i data-lucide="facebook" style="width:15px; height:15px;"></i>
                  </span>
                  <div>
                    <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">
                      Facebook Page: <span style="color:#1877F2;">${pageName}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                      Page ID: <code>${pageId}</code> &bull; Video Post & Reels
                    </div>
                  </div>
                </div>
                <span class="badge ${existingFbToken ? 'badge-success' : 'badge-warning'}">
                  ${existingFbToken ? 'Token Configured' : 'Token Required'}
                </span>
              </div>

              <div class="form-group" style="margin-bottom:0; margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label style="font-size:0.78rem; font-weight:600; color:var(--text-primary); margin:0;">
                    Facebook Access Token:
                  </label>
                  <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:#1877F2; text-decoration:none; display:flex; align-items:center; gap:3px; font-weight:600;">
                    <span>Graph API Explorer</span>
                    <i data-lucide="external-link" style="width:11px; height:11px;"></i>
                  </a>
                </div>
                <textarea class="form-input" id="quick-publish-token" rows="2" style="font-family:monospace; font-size:0.8rem; resize:vertical;" placeholder="নতুন Access Token দিন (EAA... বা EAAT...)">${existingFbToken || ''}</textarea>
              </div>
            </div>

            <!-- 3. YouTube Shorts Section -->
            <div style="background:linear-gradient(135deg, rgba(255, 0, 0, 0.06), rgba(255, 0, 0, 0.02)); border:1px solid rgba(255, 0, 0, 0.2); border-radius:var(--radius-md); padding:14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="width:26px; height:26px; border-radius:50%; background:#FF0000; color:white; display:flex; align-items:center; justify-content:center;">
                    <i data-lucide="youtube" style="width:15px; height:15px;"></i>
                  </span>
                  <div>
                    <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">
                      YouTube Channel: <span style="color:#FF0000;">${ytChannelTitle}</span>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                      YouTube Shorts &bull; Resumable Data API v3
                    </div>
                  </div>
                </div>
                <span id="modal-yt-badge" class="badge ${existingYtToken ? 'badge-success' : 'badge-warning'}">
                  ${existingYtToken ? 'OAuth Ready' : 'Authorization Needed'}
                </span>
              </div>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; margin-bottom:4px;">
                <label style="font-size:0.78rem; font-weight:600; color:var(--text-primary); margin:0;">
                  Google / YouTube Access Token:
                </label>
                <a href="https://developers.google.com/oauthplayground/#step1&apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload%2Chttps%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.readonly" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:#FF0000; text-decoration:none; display:flex; align-items:center; gap:3px; font-weight:600;">
                  <span>OAuth Playground</span>
                  <i data-lucide="external-link" style="width:11px; height:11px;"></i>
                </a>
              </div>

              <div style="display:flex; gap:6px;">
                <input type="text" class="form-input" id="quick-youtube-token" value="${existingYtToken || ''}" placeholder="ya29... (Google Access Token পেস্ট করুন)" style="font-family:monospace; font-size:0.8rem; flex:1;" />
                <button type="button" class="btn btn-outline btn-sm" id="btn-modal-test-youtube" style="border-color:#FF0000; color:#FF0000; font-size:0.78rem; white-space:nowrap;">
                  টোকেন টেস্ট
                </button>
              </div>

              <div id="modal-yt-verify-status" style="margin-top:6px; display:none;"></div>

              <div style="display:flex; gap:8px; margin-top:8px;">
                <button type="button" class="btn btn-outline btn-sm" id="btn-modal-connect-google" style="flex:1; border-color:#FF0000; color:#FF0000; display:flex; align-items:center; justify-content:center; gap:6px; font-size:0.78rem;">
                  <i data-lucide="play-circle"></i>
                  <span>Google OAuth 1-Click Connect</span>
                </button>
              </div>
            </div>

            <!-- Primary Action Buttons -->
            <div style="display:flex; gap:10px; margin-top:14px;">
              <button class="btn btn-primary" id="btn-submit-token-and-publish" style="flex:1; background:linear-gradient(135deg, #1877F2, #FF0000); border:none; padding:12px; display:flex; align-items:center; justify-content:center; gap:8px; font-weight:700;">
                <i data-lucide="rocket"></i>
                <span>ফেসবুক ও ইউটিউবে আসল ভিডিও আপলোড করুন (Live Post)</span>
              </button>
            </div>

            <div style="margin:14px 0; display:flex; align-items:center; gap:10px;">
              <div style="flex:1; height:1px; background:var(--border-light);"></div>
              <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">অথবা</span>
              <div style="flex:1; height:1px; background:var(--border-light);"></div>
            </div>

            <button class="btn btn-outline" id="btn-run-simulation-direct" style="width:100%; border-color:#10B981; color:#10B981; display:flex; align-items:center; justify-content:center; gap:8px;">
              <i data-lucide="play-circle"></i>
              <span>সিমুলেশন টেস্ট সম্পন্ন করুন (Instant Test Mode)</span>
            </button>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-close-modal">বাতিল</button>
          </div>
        </div>
      </div>
    `);
    this.refreshIcons();

    // Check server credentials cache for YouTube token on modal open
    fetch('/api/youtube/token').then(r => r.json()).then(data => {
      if (data.youtube?.accessToken) {
        const inp = document.getElementById('quick-youtube-token');
        if (inp && !inp.value) {
          inp.value = data.youtube.accessToken;
          const badge = document.getElementById('modal-yt-badge');
          if (badge) {
            badge.className = 'badge badge-success';
            badge.textContent = `OAuth Ready (${data.youtube.channelTitle || 'chiku bd'})`;
          }
        }
      }
    }).catch(() => {});

    let selectedFileBlob = currentBlob;
    const filePicker = document.getElementById('modal-publish-file-input');
    if (filePicker) {
      filePicker.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          selectedFileBlob = file;
          if (targetVideo) {
            targetVideo.fileReference = file;
            await saveVideoBlob(targetVideo.id, file);
            await saveVideoBlob(targetVideo.title, file);
          }
          const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
          const badge = document.getElementById('modal-video-blob-badge');
          if (badge) {
            badge.className = 'badge badge-success';
            badge.innerHTML = `✓ ভিডিও ফাইল প্রস্তুত (${sizeMb} MB)`;
          }
        }
      });
    }

    // Test YouTube Token
    const testYtBtn = document.getElementById('btn-modal-test-youtube');
    if (testYtBtn) {
      testYtBtn.addEventListener('click', async () => {
        const val = (document.getElementById('quick-youtube-token')?.value || '').trim();
        const statusBox = document.getElementById('modal-yt-verify-status');
        if (!val) {
          alert('অনুগ্রহ করে Google/YouTube Access Token দিন।');
          return;
        }
        testYtBtn.disabled = true;
        testYtBtn.innerText = 'যাচাই...';
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">YouTube Data API v3 যাচাই হচ্ছে...</span>';
        }

        try {
          const testRes = await GoogleAuthService.testYouTubeToken(val);
          GoogleAuthService.setYouTubeToken(project, val);
          storage.saveState();
          const ch = testRes.channel;
          const badge = document.getElementById('modal-yt-badge');
          if (badge) {
            badge.className = 'badge badge-success';
            badge.textContent = `OAuth Ready (${ch.title})`;
          }
          if (statusBox) {
            statusBox.innerHTML = `
              <div style="background:rgba(16, 185, 129, 0.1); border:1px solid rgba(16, 185, 129, 0.3); border-radius:4px; padding:4px 8px; font-size:0.76rem; color:#10B981; font-weight:600;">
                ✓ ভেরিফাইড চ্যানেল: <strong>${ch.title}</strong> (${ch.id}) &bull; Shorts Ready
              </div>
            `;
          }
          this.showToast(`YouTube চ্যানেল "${ch.title}" ভেরিফাইড!`, 'success');
        } catch (err) {
          if (statusBox) {
            statusBox.innerHTML = `
              <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); border-radius:4px; padding:4px 8px; font-size:0.76rem; color:#EF4444;">
                ⚠ ত্রুটি: ${err.message}
              </div>
            `;
          }
        } finally {
          testYtBtn.disabled = false;
          testYtBtn.innerText = 'টোকেন টেস্ট';
        }
      });
    }

    // Google OAuth Connect
    const googleBtn = document.getElementById('btn-modal-connect-google');
    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        try {
          googleBtn.disabled = true;
          googleBtn.innerText = 'Connecting Google...';
          const res = await GoogleAuthService.connectYouTubeChannel(project);
          if (res.accessToken) {
            const ytInput = document.getElementById('quick-youtube-token');
            if (ytInput) ytInput.value = res.accessToken;
            const ytBadge = document.getElementById('modal-yt-badge');
            if (ytBadge) {
              ytBadge.className = 'badge badge-success';
              ytBadge.innerText = 'Connected: ' + (res.channel?.title || 'YouTube');
            }
          }
          this.showToast('YouTube Channel Authorized with Google!', 'success');
        } catch (e) {
          alert(`Google OAuth: ${e.message}\nআপনি চাইলে সরাসরি Google Access Token পেস্ট করতে পারেন।`);
        } finally {
          googleBtn.disabled = false;
          googleBtn.innerHTML = '<i data-lucide="play-circle"></i> <span>Google OAuth 1-Click Connect</span>';
          createIcons({ icons });
        }
      });
    }

    // 1. Live Post with tokens and binary video
    document.getElementById('btn-submit-token-and-publish').addEventListener('click', async () => {
      const fbToken = (document.getElementById('quick-publish-token')?.value || existingFbToken || '').trim();
      const ytToken = (document.getElementById('quick-youtube-token')?.value || existingYtToken || '').trim();

      if (fbToken) {
        SocialManagerService.setFacebookToken(project, fbToken);
      }
      if (ytToken) {
        GoogleAuthService.setYouTubeToken(project, ytToken);
      }
      storage.saveState();

      if (!selectedFileBlob && !currentBlob) {
        alert('ফেসবুক এবং ইউটিউবে আসল ভিডিও আপলোড করতে অনুগ্রহ করে ভিডিও ফাইলটি সিলেক্ট করুন (File Picker থেকে)।');
        return;
      }

      const btn = document.getElementById('btn-submit-token-and-publish');
      btn.disabled = true;
      btn.innerHTML = '<span>ফেসবুক ও ইউটিউবে আসল ভিডিও আপলোড হচ্ছে...</span>';

      try {
        this.closeModal();
        this.showToast('ফেসবুক এবং ইউটিউবে ভিডিও আপলোড শুরু হচ্ছে...', 'info');

        const res = await SchedulerService.publishVideo(project, targetVideo?.id, (p) => {
          if (p.message) this.showToast(p.message, 'info');
        }, {
          token: fbToken,
          youtubeToken: ytToken,
          fileBlob: selectedFileBlob || currentBlob
        });

        storage.saveState();
        this.showToast(`🎉 "${res.video?.title || 'Video'}" সফলভাবে আপলোড হয়েছে!`, 'success');
        this.render();
      } catch (err) {
        this.showToast(err.message, 'error');
        this.openPublishTokenModal(project, targetVideo?.id, err.message);
      }
    });

    // 2. Instant Simulation Mode
    document.getElementById('btn-run-simulation-direct').addEventListener('click', async () => {
      this.closeModal();
      this.showToast('সিমুলেশন মোডে পাবলিশ শুরু হচ্ছে...', 'info');

      try {
        const res = await SchedulerService.publishVideo(project, targetVideo?.id, (p) => {
          if (p.message) this.showToast(p.message, 'info');
        }, { forceSimulation: true });

        storage.saveState();
        this.showToast(`🎉 "${res.video?.title || 'Video'}" সিমুলেশন মোডে সফলভাবে পাবলিশ হয়েছে!`, 'success');
        this.render();
      } catch (err) {
        this.showToast(err.message, 'error');
        this.render();
      }
    });
  }
}

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  new OmniFlowApp();
});
