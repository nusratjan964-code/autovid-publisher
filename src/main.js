import './style.css';
import { createIcons, icons } from 'lucide';
import { storage } from './services/storage.js';
import { DriveSyncService } from './services/driveSync.js';
import { SocialManagerService, AVAILABLE_PLATFORMS } from './services/socialManager.js';
import { AICaptionService } from './services/aiCaption.js';
import { SchedulerService } from './services/scheduler.js';
import { GoogleAuthService } from './services/googleAuth.js';

class OmniFlowApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.init();
  }

  init() {
    this.render();
    this.bindGlobalEvents();
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
              <button class="btn btn-primary btn-sm" id="btn-header-publish" ${project.videos.length === 0 ? 'disabled' : ''}>
                <i data-lucide="send"></i>
                <span>Simulate Auto-Publish</span>
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
            <h3 class="card-title"><i data-lucide="cloud"></i> Add Google Drive Folder Link</h3>
            <p class="card-description">Paste your shared Google Drive link. All video files inside the folder will be scanned and loaded.</p>
          </div>
        </div>

        <div id="drive-alert-container"></div>

        <div style="display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
          <input 
            type="url" 
            class="form-input" 
            id="input-drive-url" 
            placeholder="https://drive.google.com/drive/folders/YOUR_FOLDER_ID" 
            value="${drive.folderUrl || ''}"
            style="flex:1; min-width:300px;"
          />
          <button class="btn btn-primary" id="btn-sync-drive-action">
            <i data-lucide="refresh-cw"></i>
            <span>Sync Drive Link</span>
          </button>
        </div>

        <p style="font-size:0.8rem; color:var(--text-muted);">
          Note: Ensure the folder permission is set to <strong>"Anyone with the link can view"</strong> so video files can be indexed. If the folder has no videos, the system will alert you immediately.
        </p>
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
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="list-video"></i> Loaded Videos (${project.videos.length})</h3>
            <p class="card-description">Active video library for project: <strong>${project.name}</strong></p>
          </div>
        </div>

        ${project.videos.length > 0 ? `
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
            <button class="btn btn-primary" id="btn-schedule-pipeline-view">
              <i data-lucide="calendar"></i>
              <span>Auto-Schedule All</span>
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

          <div class="caption-preview-box ${!video.caption ? 'empty' : ''}">
            ${video.caption 
              ? `<strong>AI Caption:</strong> ${video.caption.substring(0, 110)}...`
              : '⚡ No AI caption generated yet. Click "AI Caption" below.'
            }
          </div>

          <div class="video-actions">
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
    const scheduledVideos = project.videos.filter(v => v.status === 'scheduled');
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Daily Timing Schedule & Queue</h1>
          <p class="page-subtitle">Configure your daily posting time. The automated scheduler will release one video each day with AI captions.</p>
        </div>
        <div style="display:flex; gap:10px;">
          ${project.videos.length > 0 ? `
            <button class="btn btn-primary" id="btn-run-auto-scheduler">
              <i data-lucide="sparkles"></i>
              <span>Auto-Schedule Unscheduled Videos</span>
            </button>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="clock"></i> Daily Posting Frequency & Time</h3>
            <p class="card-description">Set the exact time when your videos should be published to connected channels.</p>
          </div>
          <button class="btn btn-outline btn-sm" id="btn-save-schedule-settings">Save Schedule</button>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:20px;">
          <div class="form-group">
            <label class="form-label">Daily Post Time</label>
            <input type="time" class="form-input" id="sched-time-input" value="${sched.preferredTime || '18:00'}" />
          </div>

          <div class="form-group">
            <label class="form-label">Posting Cadence</label>
            <select class="form-select" id="sched-cadence-select">
              <option value="1" ${sched.frequency === 1 ? 'selected' : ''}>1 Video Every Day (Recommended)</option>
              <option value="2" ${sched.frequency === 2 ? 'selected' : ''}>2 Videos Every Day</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Timezone</label>
            <input type="text" class="form-input" id="sched-timezone-input" value="${sched.timezone || 'Asia/Dhaka'}" readonly style="background:var(--bg-subtle);" />
          </div>
        </div>

        <div style="margin-top:14px;">
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
        <div class="card-header">
          <div>
            <h3 class="card-title"><i data-lucide="calendar"></i> Upcoming Scheduled Dispatch Timeline</h3>
            <p class="card-description">${scheduledVideos.length} video(s) sequentially scheduled.</p>
          </div>
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
                ? 'You have loaded videos ready! Click "Auto-Schedule Unscheduled Videos" above to assign upcoming daily dates.' 
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

      // Select page on server
      await SocialManagerService.selectFacebookPage(selectedId);

      // Verify page status with server-side token
      const status = await SocialManagerService.checkFacebookStatus(selectedId);
      btn.innerHTML = originalText;
      btn.disabled = false;

      const finalPageId = status.pageId || selectedId;
      const finalPageName = status.pageName || selectedName;
      const cleanHandle = `@${finalPageName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      SocialManagerService.connectFacebookPage(project, {
        pageId: finalPageId,
        pageName: finalPageName,
        handle: cleanHandle,
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
    const myDefaultClientId = ['489789622156-nokptei8ilkral58vf8vqopsbe1hf6u5', 'apps.googleusercontent.com'].join('.');
    let currentClientId = GoogleAuthService.getClientId();
    if (!currentClientId) {
      GoogleAuthService.setClientId(myDefaultClientId);
      currentClientId = myDefaultClientId;
    }

    this.openModal(`
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title" style="display:flex; align-items:center; gap:10px;">
              <span style="width:32px; height:32px; border-radius:var(--radius-sm); background:#FF0000; color:white; display:flex; align-items:center; justify-content:center;">
                <i data-lucide="youtube"></i>
              </span>
              Connect YouTube Channel
            </h3>
            <button class="btn-icon-soft btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; padding:10px 0 16px;">
              <div style="width:56px; height:56px; border-radius:50%; background:#fef2f2; color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 10px; border:2px solid #fca5a5;">
                <i data-lucide="youtube" style="width:32px; height:32px;"></i>
              </div>
              <h4 style="font-size:1.2rem; font-weight:800; color:var(--text-primary);">Google & YouTube OAuth 2.0</h4>
              <p style="font-size:0.86rem; color:var(--text-muted); margin-top:2px;">
                Connect your YouTube channel in 1 step using your Google OAuth Client ID.
              </p>
            </div>

            <div style="background:var(--bg-subtle); padding:14px; border-radius:var(--radius-md); font-size:0.82rem; margin-bottom:16px; border:1px solid var(--border-light);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:700; color:var(--text-primary);">Google Client ID:</span>
                <span class="badge badge-success">Configured</span>
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" class="form-input" id="input-oauth-client-id" value="${currentClientId}" placeholder="Enter Client ID" style="font-size:0.78rem; font-family:var(--font-mono);" />
                <button class="btn btn-outline btn-sm" id="btn-save-client-id">Save</button>
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
                Required Origin in Google Cloud Console: <strong>${window.location.origin}</strong>
              </div>
            </div>

            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-md); padding:10px 14px; font-size:0.82rem; color:#166534; margin-bottom:16px;">
              <strong><i data-lucide="check-shield"></i> Official YouTube Integration:</strong>
              <div style="margin-top:2px; line-height:1.45;">
                • Auto-fetches your authentic channel name, avatar, and subscribers<br>
                • Uploads videos directly as YouTube Shorts
              </div>
            </div>

            <button class="btn btn-primary btn-lg" id="btn-trigger-google-oauth" style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; background:#FF0000; border-color:#FF0000; font-weight:700;">
              <i data-lucide="play-circle"></i>
              <span>1-Step Connect YouTube with Google</span>
            </button>

            <div style="margin:16px 0; display:flex; align-items:center; gap:10px;">
              <div style="flex:1; height:1px; background:var(--border-light);"></div>
              <span style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">or link handle manually</span>
              <div style="flex:1; height:1px; background:var(--border-light);"></div>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <input type="text" class="form-input" id="manual-yt-handle" placeholder="Enter channel name or @handle manually" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline btn-close-modal">Cancel</button>
            <button class="btn btn-outline" id="btn-save-manual-yt">Save Handle</button>
          </div>
        </div>
      </div>
    `);

    const saveClientIdBtn = document.getElementById('btn-save-client-id');
    if (saveClientIdBtn) {
      saveClientIdBtn.addEventListener('click', () => {
        const val = document.getElementById('input-oauth-client-id').value.trim() || myDefaultClientId;
        GoogleAuthService.setClientId(val);
        this.showToast('Google Client ID saved!', 'success');
      });
    }

    document.getElementById('btn-trigger-google-oauth').addEventListener('click', async () => {
      const btn = document.getElementById('btn-trigger-google-oauth');
      let id = GoogleAuthService.getClientId();
      if (!id) {
        const val = document.getElementById('input-oauth-client-id').value.trim() || myDefaultClientId;
        GoogleAuthService.setClientId(val);
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
        createIcons({ icons });

        alert(`Google OAuth Notice:\n${err.message || 'Popup closed or origin not authorized'}\n\nNote: If you see origin_mismatch, make sure ${window.location.origin} is added to Authorized JavaScript Origins in your Google Cloud Console.`);
      }
    });

    document.getElementById('btn-save-manual-yt').addEventListener('click', () => {
      const handle = document.getElementById('manual-yt-handle').value.trim();
      SocialManagerService.connectPlatform(project, 'youtube', handle || '@mychannel');
      storage.saveState();
      this.closeModal();
      this.showToast('YouTube connected!', 'success');
      this.render();
    });
  }

  // --- VIDEO PLAYER MODAL ---
  openVideoPlayerModal(videoId) {
    const project = storage.getActiveProject();
    const video = project.videos.find(v => v.id === videoId);
    if (!video) return;

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
                  <video src="${video.videoUrl}" controls autoplay muted playsinline style="width:100%; height:100%; object-fit:cover;"></video>
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
      headerPublish.addEventListener('click', () => this.runPublishAction());
    }

    const dashAutoSched = document.getElementById('btn-dash-auto-schedule') || document.getElementById('btn-run-auto-scheduler') || document.getElementById('btn-schedule-pipeline-view');
    if (dashAutoSched) {
      dashAutoSched.addEventListener('click', async () => {
        const project = storage.getActiveProject();
        if (project.videos.length === 0) {
          this.showToast('Please add videos before scheduling.', 'warning');
          return;
        }
        const res = await SchedulerService.autoScheduleVideos(project);
        storage.saveState();
        this.showToast(res.message, 'success');
        this.render();
      });
    }

    // Video card actions
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

    // Drive Sync Events
    const syncDriveBtn = document.getElementById('btn-sync-drive-action');
    if (syncDriveBtn) {
      syncDriveBtn.addEventListener('click', () => this.syncDriveFromCurrentInput());
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
        project.scheduleSettings.preferredTime = document.getElementById('sched-time-input').value;
        project.scheduleSettings.frequency = parseInt(document.getElementById('sched-cadence-select').value, 10);
        project.scheduleSettings.postingDays = days;
        storage.saveState();
        this.showToast('Schedule settings saved!', 'success');
      });
    }
  }

  // --- DRIVE SYNC LOGIC ---
  async syncDriveFromCurrentInput() {
    const input = document.getElementById('input-drive-url');
    const alertContainer = document.getElementById('drive-alert-container');
    const syncBtn = document.getElementById('btn-sync-drive-action');

    const url = input ? input.value.trim() : '';

    if (!url) {
      if (alertContainer) {
        alertContainer.innerHTML = `
          <div class="alert-box alert-warning">
            <i data-lucide="alert-triangle"></i>
            <div class="alert-content">
              <h4>Missing Google Drive Link</h4>
              <p>Please paste your Google Drive folder link in the field above.</p>
            </div>
          </div>
        `;
        createIcons({ icons });
      }
      return;
    }

    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Scanning Folder...';
      createIcons({ icons });
    }

    const scanResult = await DriveSyncService.scanDriveFolder(url);

    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Sync Drive Link';
      createIcons({ icons });
    }

    // Honest error / empty feedback (as requested!)
    if (!scanResult.success) {
      if (alertContainer) {
        alertContainer.innerHTML = `
          <div class="alert-box alert-danger">
            <i data-lucide="alert-circle" style="width:24px; height:24px; flex-shrink:0;"></i>
            <div class="alert-content">
              <h4>No Videos Found in Google Drive</h4>
              <p>${scanResult.message}</p>
            </div>
          </div>
        `;
        createIcons({ icons });
      }
      this.showToast(scanResult.message, 'error');
      return;
    }

    const project = storage.getActiveProject();
    scanResult.videos.forEach(v => storage.addVideoToActiveProject(v));
    storage.saveState();
    this.showToast(`Imported ${scanResult.count} videos from Drive!`, 'success');
    this.render();
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
  async runPublishAction() {
    const project = storage.getActiveProject();
    if (project.videos.length === 0) {
      this.showToast('No videos available in library.', 'warning');
      return;
    }

    const activeChannels = project.socialAccounts.filter(a => a.connected && a.active);
    if (activeChannels.length === 0) {
      this.showToast('Please connect at least 1 social channel first.', 'warning');
      this.currentTab = 'social';
      this.render();
      return;
    }

    try {
      this.showToast('Publishing scheduled video...', 'info');
      await SchedulerService.publishVideo(project);
      storage.saveState();
      this.showToast('Video published successfully across connected channels!', 'success');
      this.render();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  }
}

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  new OmniFlowApp();
});
