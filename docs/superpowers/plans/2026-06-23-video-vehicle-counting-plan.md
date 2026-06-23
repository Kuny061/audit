# 视频航拍车辆统计 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add video upload and aerial vehicle counting to the audit platform — users upload drone footage, capture frames, and count vehicles via GLM Vision API.

**Architecture:** A standalone `VideoAnalysisModal` object in `js/app.js` manages a new modal (`#aiVideoModal`) with three views (capture/analyzing/results). Video files are detected in `handleFileSelect()` and routed to the modal. Uses existing `AuditAPI._callAPI()` for API calls. No new files — all changes in existing HTML/CSS/JS.

**Tech Stack:** Vanilla JS, HTML5 `<video>` + Canvas API, existing GLM-4V API (OpenAI-compatible)

---

## File Structure

| File | Role | Responsibility |
|------|------|---------------|
| `audit_agent.html` (modify) | Structure | Add `#aiVideoModal` markup after `#aiResultModal`; update upload `accept` to include video formats |
| `css/styles.css` (modify) | Presentation | Styles for video modal: player area, controls, frame thumbnails, result display |
| `js/app.js` (modify) | Logic | Video detection in `handleFileSelect`; `VideoAnalysisModal` object with capture/analyze/render |

---

### Task 1: HTML — Video Modal + Upload Accept (`audit_agent.html`)

**Files:**
- Modify: `audit_agent.html` — add modal markup after `#aiResultModal`; update upload accept

- [ ] **Step 1: Add `#aiVideoModal` HTML after `#aiResultModal` closing tag (after line 761)**

Insert the following HTML between `</div>` (end of `#aiResultModal`) and `<!-- Custom JavaScript -->`:

```html
  <!-- Video Analysis Modal -->
  <div id="aiVideoModal" class="ai-modal ai-hidden">
    <div class="ai-modal-overlay"></div>
    <div class="ai-modal-content ai-video-modal-content">
      <div class="ai-modal-header">
        <h3 class="ai-modal-title">
          <i class="fas fa-video"></i>
          <span>视频截图分析 — 渣土车航拍统计</span>
        </h3>
        <button class="ai-modal-close" onclick="VideoAnalysisModal.close()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="ai-modal-body ai-video-modal-body">

        <!-- View 1: Capture -->
        <div id="aiVideoCaptureView" class="ai-video-view">
          <div class="ai-video-main">
            <div class="ai-video-player-wrapper">
              <video id="aiVideoPlayer" class="ai-video-player" controls></video>
            </div>
            <div class="ai-video-controls-extra">
              <button class="ai-video-ctrl-btn" onclick="VideoAnalysisModal.skip(-5)" title="后退5秒">
                <i class="fas fa-backward"></i> -5s
              </button>
              <button class="ai-video-ctrl-btn" onclick="VideoAnalysisModal.togglePlay()" title="播放/暂停">
                <i class="fas fa-play" id="aiVideoPlayIcon"></i>
              </button>
              <button class="ai-video-ctrl-btn" onclick="VideoAnalysisModal.skip(5)" title="前进5秒">
                +5s <i class="fas fa-forward"></i>
              </button>
              <span class="ai-video-time" id="aiVideoTime">00:00 / 00:00</span>
              <input type="range" id="aiVideoTimeline" class="ai-video-timeline" min="0" max="100" value="0"
                     oninput="VideoAnalysisModal.seekTo(this.value)">
            </div>
            <button class="ai-video-capture-btn" onclick="VideoAnalysisModal.captureFrame()">
              <i class="fas fa-camera"></i> 截取当前帧
            </button>
          </div>
          <div class="ai-video-frames-panel">
            <div class="ai-video-frames-header">
              <span>已截帧 <strong id="aiFrameCount">0</strong> 张</span>
            </div>
            <div id="aiFrameList" class="ai-video-frames-list">
              <div class="ai-video-frames-empty">点击"截取当前帧"添加截图</div>
            </div>
            <div class="ai-video-frames-actions">
              <button class="ai-video-frames-clear" onclick="VideoAnalysisModal.clearAllFrames()">
                <i class="fas fa-undo"></i> 清空重截
              </button>
              <button id="aiVideoAnalyzeBtn" class="ai-video-frames-analyze" disabled
                      onclick="VideoAnalysisModal.analyzeAll()">
                <i class="fas fa-cloud-upload-alt"></i> 上传分析
              </button>
            </div>
          </div>
        </div>

        <!-- View 2: Analyzing -->
        <div id="aiVideoAnalyzingView" class="ai-video-view ai-hidden">
          <div class="ai-video-analyzing">
            <div class="ai-video-spinner"></div>
            <p>正在调用 AI 模型分析截帧中的车辆...</p>
            <p class="ai-video-analyzing-progress" id="aiVideoAnalyzeProgress"></p>
          </div>
        </div>

        <!-- View 3: Results -->
        <div id="aiVideoResultView" class="ai-video-view ai-hidden">
          <div class="ai-video-result-tabs" id="aiVideoResultTabs"></div>
          <div class="ai-video-result-body">
            <div class="ai-video-result-image">
              <img id="aiVideoResultImage" src="" alt="截帧图片">
            </div>
            <div class="ai-video-result-info">
              <div class="ai-video-result-count">
                <span id="aiVideoResultCount">0</span>
                <span class="ai-video-result-unit">辆</span>
              </div>
              <div class="ai-video-result-detail-title">位置描述：</div>
              <div id="aiVideoResultVehicles" class="ai-video-result-vehicles"></div>
            </div>
          </div>
          <div class="ai-video-result-actions">
            <button class="ai-btn ai-btn-secondary" onclick="VideoAnalysisModal.backToCapture()">
              <i class="fas fa-redo"></i> 重新截图
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
```

- [ ] **Step 2: Update upload area `accept` attribute to include video formats (line 291-292)**

Change:
```html
            <input type="file" id="aiFileInput" class="ai-hidden" multiple 
                   accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp">
```
To:
```html
            <input type="file" id="aiFileInput" class="ai-hidden" multiple 
                   accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.mp4,.mov,.avi,.webm,.mkv">
```

- [ ] **Step 3: Verify HTML**

Open `audit_agent.html` in browser. Inspect that `#aiVideoModal` exists in DOM and `accept` attribute on `#aiFileInput` includes `.mp4,.mov,.avi,.webm,.mkv`.

- [ ] **Step 4: Commit**

```bash
git add audit_agent.html
git commit -m "feat: add video analysis modal HTML markup and upload accept"
```

---

### Task 2: CSS — Video Modal Styles (`css/styles.css`)

**Files:**
- Modify: `css/styles.css` — append video modal styles at end of file

- [ ] **Step 1: Append video modal styles to `css/styles.css`**

```css
/* ── Video Analysis Modal ───────────────────────────── */

.ai-video-modal-content {
  max-width: 900px;
  width: 95vw;
  max-height: 90vh;
}

.ai-video-modal-body {
  padding: calc(var(--ai-spacing-unit) * 1.5);
  overflow-y: auto;
}

.ai-video-view {
  display: flex;
  gap: calc(var(--ai-spacing-unit) * 1.5);
  min-height: 400px;
}

/* Video player area */
.ai-video-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--ai-spacing-unit) * 1);
}

.ai-video-player-wrapper {
  background: #000;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid var(--ai-color-border);
}

.ai-video-player {
  width: 100%;
  display: block;
  max-height: 360px;
}

.ai-video-controls-extra {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ai-video-ctrl-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: rgba(30, 42, 74, 0.5);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.375rem;
  color: var(--ai-color-text-secondary);
  font-size: 0.6875rem;
  padding: 0.375rem 0.625rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-video-ctrl-btn:hover {
  color: var(--ai-color-text-primary);
  border-color: rgba(0, 212, 255, 0.3);
}

.ai-video-time {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.ai-video-timeline {
  flex: 1;
  min-width: 120px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.ai-video-timeline::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--ai-color-cyan);
  cursor: pointer;
}

.ai-video-capture-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, var(--ai-color-cyan), var(--ai-color-blue));
  border: none;
  border-radius: 0.5rem;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.625rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ai-video-capture-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

/* Frames panel */
.ai-video-frames-panel {
  flex: 0 0 150px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(148, 163, 184, 0.1);
  padding-left: calc(var(--ai-spacing-unit) * 1.25);
}

.ai-video-frames-header {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
  margin-bottom: 0.5rem;
}

.ai-video-frames-header strong {
  color: var(--ai-color-cyan);
}

.ai-video-frames-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  overflow-y: auto;
  max-height: 280px;
}

.ai-video-frames-empty {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
  text-align: center;
  padding: 1rem 0;
}

.ai-video-frame-item {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 0.375rem;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.ai-video-frame-item:hover {
  border-color: rgba(0, 212, 255, 0.4);
}

.ai-video-frame-item img {
  width: 100%;
  height: 65px;
  object-fit: cover;
  display: block;
}

.ai-video-frame-time {
  font-size: 0.5rem;
  padding: 0.125rem 0.25rem;
  color: var(--ai-color-text-secondary);
  background: rgba(15, 23, 42, 0.8);
}

.ai-video-frame-delete {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.85);
  border: none;
  color: #fff;
  font-size: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.ai-video-frame-item:hover .ai-video-frame-delete {
  opacity: 1;
}

.ai-video-frames-actions {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.ai-video-frames-clear {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.375rem;
  color: var(--ai-color-text-secondary);
  font-size: 0.6875rem;
  padding: 0.375rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-video-frames-clear:hover {
  color: var(--ai-color-text-primary);
  border-color: rgba(239, 68, 68, 0.3);
}

.ai-video-frames-analyze {
  background: linear-gradient(135deg, var(--ai-color-cyan), var(--ai-color-blue));
  border: none;
  border-radius: 0.375rem;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.375rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ai-video-frames-analyze:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.ai-video-frames-analyze:not(:disabled):hover {
  transform: translateY(-1px);
}

/* Analyzing view */
.ai-video-analyzing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 300px;
  flex: 1;
}

.ai-video-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(0, 212, 255, 0.15);
  border-top-color: var(--ai-color-cyan);
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}

@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

.ai-video-analyzing p {
  color: var(--ai-color-text-secondary);
  font-size: 0.875rem;
}

.ai-video-analyzing-progress {
  font-size: 0.75rem;
  color: var(--ai-color-cyan);
}

/* Result view */
.ai-video-result-tabs {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  align-items: center;
}

.ai-video-result-tab {
  padding: 0.375rem 0.75rem;
  background: rgba(30, 42, 74, 0.3);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.375rem;
  color: var(--ai-color-text-secondary);
  font-size: 0.6875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ai-video-result-tab:hover {
  color: var(--ai-color-text-primary);
  border-color: rgba(0, 212, 255, 0.3);
}

.ai-video-result-tab.active {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.3);
  color: var(--ai-color-cyan);
}

.ai-video-result-total {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--ai-color-text-secondary);
}

.ai-video-result-total strong {
  color: var(--ai-color-cyan);
}

.ai-video-result-body {
  display: flex;
  gap: 1.5rem;
  flex: 1;
}

.ai-video-result-image {
  flex: 0 0 50%;
}

.ai-video-result-image img {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--ai-color-border);
}

.ai-video-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-video-result-count {
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 0.5rem;
  padding: 1rem;
  text-align: center;
}

.ai-video-result-count span:first-child {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--ai-color-cyan);
}

.ai-video-result-unit {
  font-size: 0.8125rem;
  color: var(--ai-color-text-secondary);
  margin-left: 0.25rem;
}

.ai-video-result-detail-title {
  font-size: 0.6875rem;
  color: var(--ai-color-text-secondary);
  margin-bottom: 0.25rem;
}

.ai-video-result-vehicles {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 250px;
  overflow-y: auto;
}

.ai-video-vehicle-item {
  background: rgba(30, 42, 74, 0.25);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.6875rem;
  line-height: 1.5;
}

.ai-video-vehicle-item strong {
  color: var(--ai-color-cyan);
}

.ai-video-result-actions {
  margin-top: 1rem;
  display: flex;
  justify-content: center;
}

/* Result view layout override — needs to be column for tabs+body */
#aiVideoResultView {
  flex-direction: column;
}

/* Frame error state */
.ai-video-frame-item.error {
  border-color: rgba(239, 68, 68, 0.3);
}

.ai-video-frame-error {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
  font-size: 0.5rem;
  padding: 0.125rem 0.25rem;
  text-align: center;
}

/* Analyzing badge on frame */
.ai-video-frame-analyzing {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-video-frame-analyzing .ai-video-spinner {
  width: 20px;
  height: 20px;
  border-width: 2px;
}
```

- [ ] **Step 2: Verify styles**

Open `audit_agent.html` in browser. Temporarily remove `ai-hidden` class from `#aiVideoModal` and `#aiVideoCaptureView` to verify layout renders correctly:
- Video player area takes ~2/3 width
- Frames panel on right ~150px
- Controls bar with buttons and timeline slider
- Capture button styled with gradient

Re-add `ai-hidden` after verification. Or simply use browser devtools to toggle visibility.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "feat: add video modal styles"
```

---

### Task 3: JavaScript — Video Detection + VideoAnalysisModal (`js/app.js`)

**Files:**
- Modify: `js/app.js` — add video detection in `handleFileSelect`; add `VideoAnalysisModal` object

- [ ] **Step 1: Add video routing in `handleFileSelect` (line 64-65)**

Change the beginning of `handleFileSelect` to detect video files:

```js
  function handleFileSelect(files) {
    for (const file of files) {
      // Route video files to VideoAnalysisModal
      if (file.type.startsWith('video/')) {
        VideoAnalysisModal.open(file);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        addLog('warning', `跳过非图片文件: ${file.name}`);
        continue;
      }
      // ... rest of existing image handling stays unchanged
```

- [ ] **Step 2: Add `VideoAnalysisModal` object before `window.App` (before line 1175)**

Insert the entire `VideoAnalysisModal` object:

```js
  // ── Video Analysis Modal ──────────────────────────────────

  const VideoAnalysisModal = {
    _file: null,
    _url: null,
    _frames: [],       // [{ id, base64, timestamp, result, error }]
    _currentResultIdx: 0,

    open(file) {
      this._file = file;
      this._url = URL.createObjectURL(file);
      this._frames = [];
      this._currentResultIdx = 0;

      const video = $('#aiVideoPlayer');
      video.src = this._url;

      // Wait for metadata before showing
      video.onloadedmetadata = () => {
        $('#aiVideoTimeline').max = Math.floor(video.duration);
        this._updateTimeDisplay();
      };

      video.ontimeupdate = () => {
        const t = Math.floor(video.currentTime);
        $('#aiVideoTimeline').value = t;
        this._updateTimeDisplay();
      };

      video.onerror = () => {
        alert('不支持该视频格式，请使用 MP4/MOV 等常见格式');
        this.close();
      };

      // Show capture view
      this._showView('capture');
      $('#aiVideoModal').classList.remove('ai-hidden');
      $('#aiVideoAnalyzeBtn').disabled = true;
      this._renderFrameList();
    },

    close() {
      if (this._url) {
        URL.revokeObjectURL(this._url);
        this._url = null;
      }
      this._file = null;
      this._frames = [];
      const video = $('#aiVideoPlayer');
      video.pause();
      video.src = '';
      $('#aiVideoModal').classList.add('ai-hidden');
    },

    togglePlay() {
      const video = $('#aiVideoPlayer');
      if (video.paused) {
        video.play();
        $('#aiVideoPlayIcon').className = 'fas fa-pause';
      } else {
        video.pause();
        $('#aiVideoPlayIcon').className = 'fas fa-play';
      }
    },

    skip(seconds) {
      const video = $('#aiVideoPlayer');
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    },

    seekTo(value) {
      const video = $('#aiVideoPlayer');
      video.currentTime = parseFloat(value);
    },

    _updateTimeDisplay() {
      const video = $('#aiVideoPlayer');
      const cur = this._fmtTime(video.currentTime || 0);
      const dur = this._fmtTime(video.duration || 0);
      $('#aiVideoTime').textContent = `${cur} / ${dur}`;
    },

    _fmtTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    captureFrame() {
      const video = $('#aiVideoPlayer');
      if (!video.duration) return;

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.9);

      this._frames.push({
        id: 'f_' + Date.now(),
        base64,
        timestamp: video.currentTime,
        result: null,
        error: null
      });

      this._renderFrameList();
      $('#aiVideoAnalyzeBtn').disabled = false;
    },

    deleteFrame(id) {
      this._frames = this._frames.filter(f => f.id !== id);
      this._renderFrameList();
      if (this._frames.length === 0) {
        $('#aiVideoAnalyzeBtn').disabled = true;
      }
    },

    clearAllFrames() {
      this._frames = [];
      this._renderFrameList();
      $('#aiVideoAnalyzeBtn').disabled = true;
    },

    _renderFrameList() {
      const list = $('#aiFrameList');
      const countEl = $('#aiFrameCount');
      countEl.textContent = this._frames.length;

      if (this._frames.length === 0) {
        list.innerHTML = '<div class="ai-video-frames-empty">点击"截取当前帧"添加截图</div>';
        return;
      }

      list.innerHTML = this._frames.map(f => {
        const timeLabel = this._fmtTime(f.timestamp);
        let overlay = '';
        let errorClass = '';
        if (f.result) {
          overlay = `<span class="ai-video-frame-time">${f.result.count} 辆</span>`;
        } else if (f.error) {
          overlay = '<div class="ai-video-frame-error">失败</div>';
          errorClass = ' error';
        } else {
          overlay = `<span class="ai-video-frame-time">${timeLabel}</span>`;
        }
        return `
          <div class="ai-video-frame-item${errorClass}" onclick="VideoAnalysisModal._previewFrame('${f.id}')">
            <img src="${f.base64}" alt="${timeLabel}">
            <button class="ai-video-frame-delete" onclick="event.stopPropagation(); VideoAnalysisModal.deleteFrame('${f.id}')">
              <i class="fas fa-times"></i>
            </button>
            ${overlay}
          </div>`;
      }).join('');
    },

    _previewFrame(id) {
      const frame = this._frames.find(f => f.id === id);
      if (!frame) return;
      const modalImg = $('#aiPreviewImage');
      const modal = $('#aiImageModal');
      if (modalImg) modalImg.src = frame.base64;
      if (modal) modal.classList.remove('ai-hidden');
    },

    async analyzeAll() {
      if (this._frames.length === 0) return;
      if (!AuditAPI.isConfigured()) {
        alert('请先配置 API Key');
        const panel = $('#aiConfigPanel');
        if (panel) panel.classList.remove('ai-hidden');
        return;
      }

      this._showView('analyzing');
      const config = AuditAPI.loadConfig();

      for (let i = 0; i < this._frames.length; i++) {
        const frame = this._frames[i];
        $('#aiVideoAnalyzeProgress').textContent = `正在分析第 ${i + 1}/${this._frames.length} 张截帧...`;

        try {
          const messages = [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: frame.base64 } },
              { type: 'text', text: '这是一张航拍图片。请统计图片中渣土车（自卸货车）的数量，并描述每辆车在图片中的大致位置。\n\n请仅返回JSON（不要其他内容）：\n{"count": 数字, "vehicles": [{"id": 序号, "position": "位置描述", "color": "颜色", "status": "行驶中/停靠"}]}' }
            ]
          }];
          const result = await AuditAPI._callAPI(messages, config);
          // Parse JSON from result, stripping markdown fences if present
          const clean = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const jsonMatch = clean.match(/\{[\s\S]*\}/);
          frame.result = jsonMatch ? JSON.parse(jsonMatch[0]) : { count: 0, vehicles: [], raw: result };
        } catch (e) {
          frame.error = e.message;
        }
      }

      this._currentResultIdx = 0;
      this._renderResults();
    },

    _renderResults() {
      this._showView('result');
      const completed = this._frames.filter(f => f.result);
      const totalCount = completed.reduce((sum, f) => sum + (f.result.count || 0), 0);

      // Tabs
      const tabsEl = $('#aiVideoResultTabs');
      tabsEl.innerHTML = this._frames.map((f, i) => {
        const label = this._fmtTime(f.timestamp);
        const count = f.result ? `${f.result.count}辆` : f.error ? '失败' : '--';
        const active = i === this._currentResultIdx ? ' active' : '';
        return `<button class="ai-video-result-tab${active}" onclick="VideoAnalysisModal._showResult(${i})">${label} · ${count}</button>`;
      }).join('') + `<span class="ai-video-result-total">合计: <strong>${totalCount} 辆</strong></span>`;

      this._showResult(this._currentResultIdx);
    },

    _showResult(idx) {
      this._currentResultIdx = idx;
      const frame = this._frames[idx];
      if (!frame) return;

      // Update tab highlighting
      const tabs = document.querySelectorAll('.ai-video-result-tab');
      tabs.forEach((t, i) => t.classList.toggle('active', i === idx));

      // Render result
      $('#aiVideoResultImage').src = frame.base64;

      if (frame.error) {
        $('#aiVideoResultCount').textContent = '--';
        $('#aiVideoResultVehicles').innerHTML = `<div style="color:var(--ai-color-red);font-size:0.75rem;">分析失败: ${frame.error}</div>`;
        return;
      }

      const result = frame.result || { count: 0, vehicles: [] };
      $('#aiVideoResultCount').textContent = result.count || 0;

      const vehicles = result.vehicles || [];
      if (vehicles.length === 0) {
        $('#aiVideoResultVehicles').innerHTML = '<div style="color:var(--ai-color-text-secondary);font-size:0.6875rem;">未检测到车辆</div>';
      } else {
        $('#aiVideoResultVehicles').innerHTML = vehicles.map(v =>
          `<div class="ai-video-vehicle-item">
            <strong>#${v.id}</strong> ${v.position || ''}${v.color ? ' · ' + v.color : ''}${v.status ? ' · ' + v.status : ''}
          </div>`
        ).join('');
      }
    },

    backToCapture() {
      this._showView('capture');
    },

    _showView(name) {
      $('#aiVideoCaptureView').classList.toggle('ai-hidden', name !== 'capture');
      $('#aiVideoAnalyzingView').classList.toggle('ai-hidden', name !== 'analyzing');
      $('#aiVideoResultView').classList.toggle('ai-hidden', name !== 'result');
    }
  };
```

- [ ] **Step 3: Verify video routing**

Open `audit_agent.html` in browser. Upload a video file (e.g., `.mp4`). Expected:
- Video modal opens automatically
- Existing image upload flow is NOT triggered

Upload an image file. Expected:
- Normal image upload flow proceeds as before

- [ ] **Step 4: Verify capture flow**

In the video modal:
1. Click play, verify video plays
2. Click +/-5s buttons, verify time jumps
3. Drag timeline, verify video seeks
4. Click "截取当前帧" at different timestamps, verify thumbnails appear in right panel with time labels
5. Click delete (✕) on a thumbnail, verify it's removed
6. Click "清空重截", verify all frames cleared
7. Click "上传分析" with no frames — should be disabled

- [ ] **Step 5: Verify API integration (requires valid API Key)**

1. Ensure API Key is configured
2. Upload a drone footage video
3. Capture 1-2 frames
4. Click "上传分析"
5. Expected: analyzing view shows, progress text updates per frame
6. Expected: result view appears with tabs, vehicle count, and position descriptions

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat: add VideoAnalysisModal for drone video frame capture and vehicle counting"
```

---

## Summary

| Task | Files | Steps | Description |
|------|-------|-------|-------------|
| 1 | `audit_agent.html` (modify) | 4 | Add `#aiVideoModal` markup; update upload accept |
| 2 | `css/styles.css` (modify) | 3 | Add video modal component styles |
| 3 | `js/app.js` (modify) | 6 | Add video routing + VideoAnalysisModal object |
