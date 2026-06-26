# UI 样式重设计 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将审计智能分析平台从旧深色主题重构为深蓝冷色调科技风，包括配色、Header 居中、流式处理展示、粒子扫描动画、报告弹窗、缩略图优化。

**Architecture:** 三层改动——`css/styles.css` 负责全部视觉变量和样式，`audit_agent.html` 负责 DOM 结构调整，`js/app.js` 负责渲染逻辑和动画。内部功能逻辑（analysis-engine.js / api.js / image-lib.js）完全不碰。

**Tech Stack:** Vanilla HTML/CSS/JS, Canvas 2D API, CSS Custom Properties, Font Awesome 6

---

## 文件职责

| 文件 | 职责 |
|------|------|
| `css/styles.css` | CSS 变量、全局样式、Header、卡片毛玻璃、缩略图、弹窗、扫描线动画样式 |
| `audit_agent.html` | Header 标题改名+居中重构、左侧面板结构、报告弹窗模板 |
| `js/app.js` | 报告弹窗控制、流式处理卡片渲染、Canvas 扫描线动画、左侧面板汇总数据 |

---

### Task 1: 替换 CSS 变量 + 全局背景统一

**Files:**
- Modify: `css/styles.css:1-16`

- [ ] **Step 1: 替换 `:root` 中全部 CSS 变量**

将 `css/styles.css` 第 2-16 行的 `:root` 块替换为：

```css
:root {
  --ai-color-bg: #060d1f;
  --ai-color-card: rgba(16, 30, 70, 0.5);
  --ai-color-border: rgba(30, 80, 180, 0.2);
  --ai-color-cyan: #1a5cff;
  --ai-color-blue: #3d7fff;
  --ai-color-purple: #8b5cf6;
  --ai-color-red: #ff3b5c;
  --ai-color-orange: #f5a623;
  --ai-color-green: #0ed9b4;
  --ai-color-text-primary: #e8edf5;
  --ai-color-text-secondary: #7b8fb5;
  --ai-spacing-unit: 8px;
  --ai-font-size-base: 14px;
  --ai-glow-blue: 0 0 16px rgba(26, 92, 255, 0.3);
  --ai-glow-card: 0 0 20px rgba(26, 92, 255, 0.06);
}
```

- [ ] **Step 2: 统一全局背景色**

将 `css/styles.css` 第 63-71 行 `.ai-audit-header` 的背景改为纯色：

```css
.ai-audit-header {
  background: var(--ai-color-bg);
  border-bottom: 1px solid var(--ai-color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}
```

- [ ] **Step 3: 统一卡片基础样式**

将 `css/styles.css` 第 286-291 行 `.ai-card` 改为毛玻璃效果：

```css
.ai-card {
  background: var(--ai-color-card);
  border: 1px solid var(--ai-color-border);
  border-radius: 1rem;
  overflow: hidden;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

- [ ] **Step 4: 提交**

```bash
git add css/styles.css
git commit -m "style: 替换CSS变量配色方案，全局统一深蓝背景+毛玻璃卡片

- :root变量全部更新为新配色(深蓝冷色调)
- Header背景改为纯色#060d1f
- 卡片添加backdrop-filter毛玻璃效果
- 边框统一为微弱蓝光rgba

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Header 标题栏样式重构

**Files:**
- Modify: `css/styles.css:63-243`

- [ ] **Step 1: 重构 header 布局为居中**

将 `css/styles.css` 第 73-78 行 `.ai-header-content` 改为居中弹性布局：

```css
.ai-header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(var(--ai-spacing-unit) * 1.5) calc(var(--ai-spacing-unit) * 3);
}
```

- [ ] **Step 2: 隐藏旧的 header-left/header-right，新增居中标题样式**

在第 79 行之前插入新样式，替换旧的 `.ai-header-left`、`.ai-header-right`、`.ai-header-divider`、`.ai-system-status`：

```css
/* 旧布局隐藏 */
.ai-header-left,
.ai-header-right,
.ai-header-divider,
.ai-system-status {
  display: none;
}

/* 新布局：标题行居中 */
.ai-header-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--ai-spacing-unit) * 1.5);
}

.ai-logo-icon {
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--ai-color-cyan), var(--ai-color-blue));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  box-shadow: var(--ai-glow-blue);
}

.ai-logo-text h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.125rem;
  text-shadow: 0 0 20px rgba(26, 92, 255, 0.3);
}

.ai-logo-text p {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
}
```

- [ ] **Step 3: 导航栏样式改为深蓝底栏 + 白字**

将 `css/styles.css` 第 193-243 行的导航栏样式替换为：

```css
/* 导航栏 — 深蓝底栏 */
.ai-nav-bar {
  margin-top: calc(var(--ai-spacing-unit) * 1.25);
  background: #0a1229;
  border: 1px solid #162147;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 900px;
}

.ai-nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc(var(--ai-spacing-unit) * 2);
}

/* 系统状态 — 左 */
.ai-nav-status {
  display: flex;
  align-items: center;
  gap: calc(var(--ai-spacing-unit) * 0.75);
  font-size: 0.6875rem;
  color: var(--ai-color-text-secondary);
  white-space: nowrap;
}

.ai-nav-status .ai-status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ai-color-green);
  box-shadow: 0 0 6px var(--ai-color-green);
}

/* 导航菜单 — 中 */
.ai-nav-menu {
  display: flex;
  align-items: center;
  gap: calc(var(--ai-spacing-unit) * 0.5);
}

.ai-nav-item {
  display: flex;
  align-items: center;
  gap: calc(var(--ai-spacing-unit) * 0.5);
  padding: calc(var(--ai-spacing-unit) * 0.875) calc(var(--ai-spacing-unit) * 1.5);
  color: var(--ai-color-text-primary);
  text-decoration: none;
  font-size: 0.75rem;
  border-radius: 0.375rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.ai-nav-item:hover {
  background: rgba(26, 92, 255, 0.1);
}

.ai-nav-active {
  color: var(--ai-color-cyan);
  font-weight: 600;
  text-shadow: 0 0 10px rgba(26, 92, 255, 0.3);
}

.ai-nav-active::before {
  display: none;
}

.ai-nav-badge {
  background: var(--ai-color-red);
  color: white;
  font-size: 0.5625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.5rem;
}

/* 快捷信息 — 右 */
.ai-nav-stats {
  display: flex;
  align-items: center;
  gap: calc(var(--ai-spacing-unit) * 1.5);
  font-size: 0.6875rem;
  color: var(--ai-color-text-secondary);
  white-space: nowrap;
}

.ai-nav-stats span {
  display: flex;
  align-items: center;
  gap: calc(var(--ai-spacing-unit) * 0.375);
}

.ai-nav-user-avatar {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ai-color-cyan), var(--ai-color-blue));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 600;
  color: white;
}
```

- [ ] **Step 4: 原 stat-item / stat-alert / header 旧元素隐藏样式补全**

在 `.ai-user-avatar` 之后添加：

```css
.ai-stat-item,
.ai-stat-alert,
.ai-stat-user {
  display: none;
}
```

- [ ] **Step 5: 提交**

```bash
git add css/styles.css
git commit -m "style: Header标题居中+导航栏深蓝底白字重构

- 标题行居中，Logo添加蓝光阴影
- 导航栏改为#0a1229深蓝底+白色字体
- 选中选项卡蓝色#1a5cff+发光
- 三区布局：状态(左)+菜单(中)+统计(右)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 缩略图样式改进

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: 上传预览缩略图 — contain + 加高**

找到 `.ai-file-thumbnail`（约第 638 行），替换为：

```css
.ai-file-thumbnail {
  width: 100%;
  height: 120px;
  object-fit: contain;
  background: #0a1229;
  border-radius: 0.375rem;
}
```

- [ ] **Step 2: 图像库缩略图 — contain**

找到 `.ai-library-item img`（约第 2252 行），替换 `object-fit: cover` 为 `contain`：

```css
.ai-library-item img {
  width: 100%;
  height: 80px;
  object-fit: contain;
  background: #0a1229;
  border-radius: 0.375rem;
}
```

- [ ] **Step 3: 审查列表缩略图 — contain**

找到 `.ai-review-thumb`（约第 2309 行），添加 `object-fit: contain`：

```css
.ai-review-thumb {
  width: 52px;
  height: 52px;
  border-radius: 0.375rem;
  object-fit: contain;
  background: #0a1229;
  border: 1px solid rgba(148, 163, 184, 0.15);
}
```

- [ ] **Step 4: 阶段卡片缩略图 — contain**

找到 `.ai-stage-item-thumb`（约第 3280 行和第 3404 行），两处均合并修改为：

```css
.ai-stage-item-thumb {
  width: 48px;
  height: 48px;
  border-radius: 0.375rem;
  object-fit: contain;
  background: #0a1229;
  border: 1px solid rgba(148, 163, 184, 0.15);
  cursor: pointer;
  transition: opacity 0.2s;
}
.ai-stage-item-thumb:hover {
  opacity: 0.8;
}
.ai-stage-item-thumb-empty {
  background: rgba(15, 23, 42, 0.5);
}
```

- [ ] **Step 5: 提交**

```bash
git add css/styles.css
git commit -m "style: 缩略图object-fit改为contain，上传预览高度提至120px

- .ai-file-thumbnail: 60px→120px, cover→contain
- .ai-library-item img: cover→contain
- .ai-review-thumb: 添加contain
- .ai-stage-item-thumb: 添加contain
- 全部添加深色背景避免留白刺眼

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 报告弹窗样式 + 左侧面板"审计分析报告"样式

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: 报告弹窗专属样式**

在 `css/styles.css` 末尾追加以下样式：

```css
/* ── 审计分析报告弹窗 ── */
.ai-report-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(6, 13, 31, 0.6);
  backdrop-filter: blur(4px);
}

.ai-report-modal-content {
  position: relative;
  max-width: 800px;
  max-height: 88vh;
  width: 95%;
  background: rgba(6, 13, 31, 0.92);
  border: 1px solid rgba(30, 80, 180, 0.3);
  border-radius: 0.75rem;
  box-shadow: 0 0 40px rgba(26, 92, 255, 0.12);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: ai-modal-in 0.3s ease-out;
}

.ai-report-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(30, 80, 180, 0.2);
}

.ai-report-modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ai-color-text-primary);
}

.ai-report-modal-title i {
  color: var(--ai-color-cyan);
}

.ai-report-modal-date {
  font-size: 0.6875rem;
  color: var(--ai-color-text-secondary);
  font-weight: 400;
}

.ai-report-modal-close {
  width: 2rem;
  height: 2rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  color: var(--ai-color-text-secondary);
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.ai-report-modal-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ai-color-text-primary);
}

.ai-report-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.ai-report-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid rgba(30, 80, 180, 0.2);
}

/* ── 左侧面板 审计分析报告 ── */
.ai-report-summary-card {
  background: var(--ai-color-card);
  border: 1px solid var(--ai-color-border);
  border-radius: 1rem;
  overflow: hidden;
  backdrop-filter: blur(8px);
  padding: 1rem;
}

.ai-report-summary-grid-2x2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.ai-report-summary-cell {
  background: rgba(16, 30, 70, 0.35);
  border: 1px solid rgba(30, 80, 180, 0.12);
  border-radius: 0.5rem;
  padding: 0.625rem;
  text-align: center;
}

.ai-report-summary-cell .ai-rs-val {
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.2;
}

.ai-report-summary-cell .ai-rs-label {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
  margin-top: 0.125rem;
}

.ai-report-summary-recent {
  margin-top: 0.75rem;
  padding-top: 0.625rem;
  border-top: 1px solid rgba(30, 80, 180, 0.12);
}

.ai-report-summary-recent-label {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
  margin-bottom: 0.375rem;
}

.ai-report-summary-recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.625rem;
  background: rgba(26, 92, 255, 0.06);
  border: 1px solid rgba(26, 92, 255, 0.1);
  border-radius: 0.375rem;
  font-size: 0.6875rem;
  color: var(--ai-color-text-primary);
  cursor: pointer;
  transition: background 0.2s;
}

.ai-report-summary-recent-item:hover {
  background: rgba(26, 92, 255, 0.1);
}

.ai-report-summary-view-all {
  display: block;
  text-align: center;
  font-size: 0.6875rem;
  color: var(--ai-color-cyan);
  margin-top: 0.5rem;
  cursor: pointer;
  text-decoration: none;
}

.ai-report-summary-view-all:hover {
  text-decoration: underline;
}
```

- [ ] **Step 2: 提交**

```bash
git add css/styles.css
git commit -m "style: 报告弹窗+左侧面板审计分析报告样式

- .ai-report-modal-* 弹窗完整样式(毛玻璃+蓝光边框)
- .ai-report-summary-* 左侧面板2x2汇总卡片+最近报告
- 弹窗带fade-in动画

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: HTML — Header 结构重构 + 标题改名

**Files:**
- Modify: `audit_agent.html:1-100`

- [ ] **Step 1: 修改 `<title>`**

将第 6 行：

```html
<title>AI智能审计分析平台</title>
```

改为：

```html
<title>江苏审计智能分析平台</title>
```

- [ ] **Step 2: 重构 Header HTML 结构**

将 `audit_agent.html` 第 22-100 行的 header 部分替换为：

```html
<header class="ai-audit-header">
  <div class="ai-header-content">
    <!-- 标题行：Logo + 标题居中 -->
    <div class="ai-header-title-row">
      <div class="ai-logo-icon">
        <i class="fas fa-shield-halved"></i>
      </div>
      <div class="ai-logo-text">
        <h1>江苏审计智能分析平台</h1>
        <p>Jiangsu Intelligent Audit Analysis System</p>
      </div>
    </div>

    <!-- 导航栏：状态(左) + 菜单(中) + 统计(右) -->
    <nav class="ai-nav-bar">
      <div class="ai-nav-content">
        <div class="ai-nav-status">
          <span class="ai-status-dot"></span>
          <span>系统运行中</span>
          <span style="color:#162147;margin:0 2px;">|</span>
          <span>大模型: <strong class="ai-text-cyan">glm-5v-turbo</strong></span>
          <span style="color:#162147;margin:0 2px;">|</span>
          <span>知识库: <strong class="ai-text-cyan">v3.2.1</strong></span>
        </div>
        <div class="ai-nav-menu">
          <a class="ai-nav-item ai-nav-active" data-tab="dashboard">
            <i class="fas fa-home"></i><span>审计驾驶舱</span>
          </a>
          <a href="http://suguan.cdeep2.cstor.cn/#/agent" target="_blank" class="ai-nav-item">
            <i class="fas fa-robot"></i><span>智能体平台</span>
          </a>
          <a class="ai-nav-item" data-tab="recognition">
            <i class="fas fa-search"></i><span>智能识别</span>
          </a>
          <a class="ai-nav-item ai-nav-risk" data-tab="risk">
            <i class="fas fa-exclamation-triangle"></i><span>风险检测</span>
            <span class="ai-nav-badge">3</span>
          </a>
          <a class="ai-nav-item" data-tab="knowledge">
            <i class="fas fa-book"></i><span>知识库管理</span>
          </a>
        </div>
        <div class="ai-nav-stats">
          <span><i class="fas fa-database"></i> 2,847</span>
          <span><i class="fas fa-brain"></i> 15,392</span>
          <span class="ai-stat-alert-new"><i class="fas fa-bell" style="color:var(--ai-color-red);"></i> <span style="background:var(--ai-color-red);color:#fff;padding:1px 5px;border-radius:8px;font-size:0.625rem;">3</span></span>
          <span class="ai-nav-user-avatar">A</span>
        </div>
      </div>
    </nav>
  </div>
</header>
```

- [ ] **Step 3: 提交**

```bash
git add audit_agent.html
git commit -m "feat: Header标题改名+居中，导航栏三区布局重构

- 'AI智能审计分析平台'→'江苏审计智能分析平台'
- Logo+标题居中，蓝光阴影
- 导航栏: 系统状态(左)+菜单(中)+统计(右)
- <title>同步更新

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: HTML — 左侧面板"审计分析报告" + 报告弹窗模板

**Files:**
- Modify: `audit_agent.html:105-175` (左侧面板)
- Modify: `audit_agent.html:732-762` (结果弹窗)

- [ ] **Step 1: 替换左侧面板知识库卡片**

将 `audit_agent.html` 第 107-175 行的 `.ai-card-knowledge` 整个 div 替换为：

```html
<!-- Audit Report Summary Card -->
<div class="ai-card ai-card-knowledge">
  <div class="ai-card-header">
    <h3 class="ai-card-title">
      <i class="fas fa-file-alt"></i>
      <span>审计分析报告</span>
    </h3>
    <span class="ai-card-badge" id="aiReportSummaryBadge">--</span>
  </div>
  <div class="ai-report-summary-card" id="aiReportSummaryCard">
    <div class="ai-report-summary-grid-2x2">
      <div class="ai-report-summary-cell">
        <div class="ai-rs-val" id="aiRsTotal" style="color:#e8edf5;">--</div>
        <div class="ai-rs-label">分析总数</div>
      </div>
      <div class="ai-report-summary-cell">
        <div class="ai-rs-val" id="aiRsRisk" style="color:var(--ai-color-red);">--</div>
        <div class="ai-rs-label">风险项</div>
      </div>
      <div class="ai-report-summary-cell">
        <div class="ai-rs-val" id="aiRsAttention" style="color:var(--ai-color-orange);">--</div>
        <div class="ai-rs-label">关注项</div>
      </div>
      <div class="ai-report-summary-cell">
        <div class="ai-rs-val" id="aiRsNormal" style="color:var(--ai-color-green);">--</div>
        <div class="ai-rs-label">正常项</div>
      </div>
    </div>
    <div class="ai-report-summary-recent" id="aiReportRecent">
      <div class="ai-report-summary-recent-label">最近报告</div>
      <div class="ai-report-summary-recent-item" id="aiReportRecentItem" onclick="App.openRecentReport()">
        <span>暂无报告</span>
        <span id="aiReportRecentRisk"></span>
      </div>
    </div>
    <a class="ai-report-summary-view-all" id="aiReportViewAll" onclick="App.viewAllReports()">查看全部报告 →</a>
  </div>
</div>
```

- [ ] **Step 2: 改造 `#aiResultModal` 弹窗内容区**

将 `audit_agent.html` 第 745-749 行 `#aiResultContent` 内的加载占位替换为报告渲染目标：

```html
<div id="aiResultContent" class="ai-modal-body">
  <div class="ai-loading" id="aiResultLoading">
    <div class="ai-spinner"></div>
    <span>正在生成报告...</span>
  </div>
  <div id="aiResultReportContent" class="ai-hidden"></div>
</div>
```

- [ ] **Step 3: 弹窗添加 report-modal 样式类**

将第 735 行 `ai-modal-content ai-modal-content-large` 改为：

```html
<div class="ai-modal-content ai-report-modal-content">
```

- [ ] **Step 4: 提交**

```bash
git add audit_agent.html
git commit -m "feat: 左侧面板改为审计分析报告汇总+报告弹窗模板

- 知识库概览→审计分析报告，2x2汇总(总数/风险/关注/正常)
- #aiResultModal改为report弹窗样式
- 最近报告快捷入口

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: JS — 报告弹窗渲染（showReport 改为弹窗模式）

**Files:**
- Modify: `js/app.js:1054-1128` (showReport 函数)
- Modify: `js/app.js:970-975` (viewReportFromModal)
- Modify: `js/app.js:1569-1575` (closeResultModal)

- [ ] **Step 1: 重写 `showReport` 函数，渲染到弹窗**

将 `js/app.js` 第 1056-1128 行的 `showReport` 函数替换为：

```javascript
function showReport(reportMarkdown, summary) {
  const modal = $('#aiResultModal');
  const loading = $('#aiResultLoading');
  const reportContent = $('#aiResultReportContent');
  if (!modal || !reportContent) return;

  // Hide loading spinner, show report content
  if (loading) loading.classList.add('ai-hidden');
  reportContent.classList.remove('ai-hidden');

  // Build report content — same as before, no changes
  const total = summary.totalUploaded;
  const suspiciousCount = summary.suspiciousItems.length;
  const high = summary.stats.high;
  const medium = summary.stats.medium;
  const low = summary.stats.low;

  let html = '';

  // Summary box
  html += '<div class="ai-report-summary-box">';
  html += '<div class="ai-report-summary-title"><i class="fas fa-clipboard-check"></i> 审计总览</div>';
  html += '<div class="ai-report-summary-grid">';
  html += `<div class="ai-report-summary-item"><div class="ai-report-summary-val">${total}</div><div class="ai-report-summary-label">上传图片</div></div>`;
  html += `<div class="ai-report-summary-item"><div class="ai-report-summary-val ai-text-red">${suspiciousCount}</div><div class="ai-report-summary-label">可疑项</div></div>`;
  html += `<div class="ai-report-summary-item"><div class="ai-report-summary-val ai-text-red">${high}</div><div class="ai-report-summary-label">高风险</div></div>`;
  html += `<div class="ai-report-summary-item"><div class="ai-report-summary-val ai-text-orange">${medium}</div><div class="ai-report-summary-label">中风险</div></div>`;
  html += `<div class="ai-report-summary-item"><div class="ai-report-summary-val ai-text-cyan">${low}</div><div class="ai-report-summary-label">低风险</div></div>`;
  html += '</div></div>';

  // Suspicious items list
  if (suspiciousCount > 0) {
    html += '<div class="ai-report-suspicious-section">';
    html += '<div class="ai-report-section-title"><i class="fas fa-exclamation-triangle"></i> 可疑项详情</div>';
    for (const item of summary.suspiciousItems) {
      const badgeCls = item.riskLevel === 'high' ? 'ai-risk-badge-high' : item.riskLevel === 'medium' ? 'ai-risk-badge-medium' : 'ai-risk-badge-low';
      const label = item.riskLevel === 'high' ? '高风险' : item.riskLevel === 'medium' ? '中风险' : '低风险';
      html += '<div class="ai-report-suspicious-item">';
      html += `<div class="ai-report-suspicious-header">`;
      html += `<span class="ai-report-suspicious-name"><i class="fas fa-image"></i> ${item.uploadName}</span>`;
      html += `<span class="ai-risk-badge ${badgeCls}">${label}</span>`;
      html += `</div>`;
      html += `<div class="ai-report-suspicious-body">`;
      html += `<div><strong>匹配基准图：</strong>${item.matchName}</div>`;
      if (item.similarity) html += `<div><strong>相似度：</strong>${item.similarity}%</div>`;
      html += `<div><strong>判定依据：</strong>${item.reason}</div>`;
      html += `</div></div>`;
    }
    html += '</div>';
  }

  // AI report body
  html += '<div class="ai-report-section-title"><i class="fas fa-robot"></i> AI分析报告</div>';
  html += '<div class="ai-report-body">';
  html += markdownToHTML(reportMarkdown);
  html += '</div>';

  reportContent.innerHTML = html;

  // Update modal header date
  const dateEl = modal.querySelector('.ai-report-modal-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }

  // Show modal
  modal.classList.remove('ai-hidden');

  // Update left panel summary
  updateReportSummary(total, high, medium, total - suspiciousCount);

  // Hide old inline report section
  const section = $('#aiReportSection');
  if (section) section.classList.add('ai-hidden');
}
```

- [ ] **Step 2: 添加 `updateReportSummary` 函数更新左侧面板**

在 `showReport` 函数之后添加：

```javascript
function updateReportSummary(total, risk, attention, normal) {
  const elTotal = $('#aiRsTotal');
  const elRisk = $('#aiRsRisk');
  const elAtt = $('#aiRsAttention');
  const elNormal = $('#aiRsNormal');
  const badge = $('#aiReportSummaryBadge');
  const recentItem = $('#aiReportRecentItem');
  const recentRisk = $('#aiReportRecentRisk');

  if (elTotal) elTotal.textContent = total;
  if (elRisk) elRisk.textContent = risk;
  if (elAtt) elAtt.textContent = attention;
  if (elNormal) elNormal.textContent = normal;
  if (badge) badge.textContent = `共 ${total} 份`;

  // Update recent report entry
  if (recentItem) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    recentItem.innerHTML = `<span>📄 ${dateStr}</span>`;
    if (recentRisk) {
      const riskText = risk > 0 ? `风险 ${risk} 项` : '正常';
      const riskColor = risk > 0 ? 'var(--ai-color-red)' : 'var(--ai-color-green)';
      recentRisk.textContent = riskText;
      recentRisk.style.cssText = `font-size:0.625rem;background:rgba(${risk > 0 ? '255,59,92' : '14,217,180'},0.1);padding:1px 6px;border-radius:3px;color:${riskColor};`;
    }
  }
}
```

- [ ] **Step 3: 修改 `viewReportFromModal`**

将 `js/app.js` 第 970-975 行替换为：

```javascript
function viewReportFromModal() {
  closeAnalysisModal();
  // Report is now in #aiResultModal — just show it
  const modal = $('#aiResultModal');
  if (modal) modal.classList.remove('ai-hidden');
}
```

- [ ] **Step 4: 修改 `UI.closeResultModal` 重置弹窗状态**

将 `js/app.js` 第 1572-1575 行替换为：

```javascript
window.UI.closeResultModal = () => {
  const modal = $('#aiResultModal');
  const loading = $('#aiResultLoading');
  const reportContent = $('#aiResultReportContent');
  if (modal) modal.classList.add('ai-hidden');
  // Reset for next analysis
  if (loading) loading.classList.remove('ai-hidden');
  if (reportContent) {
    reportContent.classList.add('ai-hidden');
    reportContent.innerHTML = '';
  }
};
```

- [ ] **Step 5: 添加 `App.openRecentReport` 和 `App.viewAllReports`**

在 `window.App` 导出区域（约 app.js 末尾）添加：

```javascript
window.App.openRecentReport = () => {
  const modal = $('#aiResultModal');
  if (modal) modal.classList.remove('ai-hidden');
};
window.App.viewAllReports = () => {
  const modal = $('#aiResultModal');
  if (modal) modal.classList.remove('ai-hidden');
};
```

- [ ] **Step 6: 提交**

```bash
git add js/app.js
git commit -m "feat: 审计分析报告改为弹窗展示+左侧面板汇总更新

- showReport改为渲染到#aiResultModal弹窗
- 新增updateReportSummary更新左侧面板2x2数据
- closeResultModal支持重置弹窗状态
- viewReportFromModal改为直接打开报告弹窗

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: JS — 流式处理卡片渲染

**Files:**
- Modify: `js/app.js:119-148` (renderUploadPreview)
- Modify: `js/app.js:274-334` (renderReviewList — 扩展阶段展示)
- Modify: `js/app.js:886-905` (回调绑定区域)

- [ ] **Step 1: 在处理卡片区域添加流式容器 HTML**

在 `audit_agent.html` 的处理日志区域（`#aiProcessingLog` 之上）插入流式处理卡片容器。找到约第 525 行：

```html
<!-- Streaming Processing Cards -->
<div class="ai-stream-cards" id="aiStreamCards"></div>

<div class="ai-processing-log" id="aiProcessingLog">
```

- [ ] **Step 2: 实现流式处理卡片渲染函数**

在 `js/app.js` 的 `renderReviewList` 函数附近（约第 334 行后）添加：

```javascript
// ── Streaming Processing Cards ─────────────────────────

function renderStreamCards() {
  const container = $('#aiStreamCards');
  if (!container) return;

  container.innerHTML = uploadedFiles.map(f => {
    const stage1 = f.selfValidationStatus || 'pending'; // done|running|pending
    const stage2 = f.crossCheckStatus || 'pending';
    const stage3 = f.compareStatus || 'pending'; // done|running|pending|error

    const stageIcon = (s) => {
      if (s === 'done') return '<span style="color:var(--ai-color-green);">✓</span>';
      if (s === 'running') return '<span class="ai-stage-running">⏳</span>';
      if (s === 'error') return '<span style="color:var(--ai-color-red);">✗</span>';
      return '<span style="color:#3a4f70;">○</span>';
    };
    const stageLabel = (s, name) => {
      if (s === 'done') return `<span style="color:var(--ai-color-green);font-size:0.6875rem;">${name}</span>`;
      if (s === 'running') return `<span style="color:var(--ai-color-cyan);font-size:0.6875rem;animation:pulse-text 1s infinite;">${name}</span>`;
      return `<span style="color:#3a4f70;font-size:0.6875rem;">${name}</span>`;
    };

    const isProcessing = stage1 === 'running' || stage2 === 'running' || stage3 === 'running';
    const isPending = stage1 === 'pending' && stage2 === 'pending' && stage3 === 'pending';
    const cardClass = isProcessing ? 'ai-stream-card-processing' : isPending ? 'ai-stream-card-pending' : 'ai-stream-card-done';

    return `
      <div class="ai-stream-card ${cardClass}" data-file-id="${f.id}">
        <div class="ai-stream-card-thumb">
          <img src="${f.base64}" alt="${f.name}">
          ${isProcessing ? '<canvas class="ai-scan-canvas" data-file-id="' + f.id + '"></canvas>' : ''}
        </div>
        <div class="ai-stream-card-body">
          <div class="ai-stream-card-name" title="${f.name}">${f.name}</div>
          <div class="ai-stream-card-stages">
            <span>${stageIcon(stage1)} ${stageLabel(stage1, '阶段1: 自校验')}</span>
            <span>${stageIcon(stage2)} ${stageLabel(stage2, '阶段2: 交叉比对')}</span>
            <span>${stageIcon(stage3)} ${stageLabel(stage3, '阶段3: 入库对比')}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Pulse animation for running text ──
const pulseStyle = document.createElement('style');
pulseStyle.textContent = `@keyframes pulse-text{0%,100%{opacity:1;}50%{opacity:0.5;}}`;
document.head.appendChild(pulseStyle);
```

- [ ] **Step 3: 更新回调和文件状态追踪**

将 `js/app.js` 第 886-905 行的回调绑定处修改 `_onImageUpdate` 和 `_onStageChange`：

```javascript
engine._onImageUpdate = (img, idx) => {
  const realIdx = uploadedFiles.findIndex(f => f.id === img.id);
  if (realIdx !== -1) {
    // Preserve stage statuses
    const old = uploadedFiles[realIdx];
    uploadedFiles[realIdx] = { ...old, ...img };
  }
  renderReviewList();
  renderStreamCards();  // <-- NEW: update streaming cards

  // Update stage item in analysis modal
  if (currentStage === 1 && window._stage1Images) {
    const si = window._stage1Images.findIndex(s => s.id === img.id);
    if (si !== -1) window._stage1Images[si] = img;
    _renderStageItems(1, window._stage1Images);
  }
  // ... (rest of existing logic unchanged)
};

engine._onStageChange = (stageNum, status, data) => {
  updateStageCard(stageNum, status, data);

  // Update stream card stage statuses based on stage change
  if (status === 'start' && data && data.images) {
    data.images.forEach(img => {
      const f = uploadedFiles.find(uf => uf.id === img.id);
      if (f) {
        if (stageNum === 1) f.selfValidationStatus = 'running';
        if (stageNum === 2) f.crossCheckStatus = 'running';
        if (stageNum === 3) f.compareStatus = 'running';
      }
    });
  }
  if (status === 'end') {
    uploadedFiles.forEach(f => {
      if (stageNum === 1 && f.selfValidationStatus === 'running') f.selfValidationStatus = 'done';
      if (stageNum === 2 && f.crossCheckStatus === 'running') f.crossCheckStatus = 'done';
      if (stageNum === 3 && f.compareStatus === 'running') f.compareStatus = 'done';
    });
  }
  renderStreamCards();  // <-- NEW
};
```

- [ ] **Step 4: 初始化文件状态字段**

在 `startAnalysis` 函数中（约 `js/app.js` 第 870 行），分析启动前初始化阶段状态：

```javascript
// Before engine.runAnalysis(uploadedFiles)
uploadedFiles.forEach(f => {
  f.selfValidationStatus = 'pending';
  f.crossCheckStatus = 'pending';
  f.compareStatus = 'pending';
});
```

- [ ] **Step 5: 分析完成时更新流式卡片**

在 `_stopProcessingTimer` 调用之后（约 `js/app.js` 第 1050 行），更新所有卡片为完成状态：

```javascript
renderStreamCards();
```

- [ ] **Step 6: CSS 流式卡片样式**

在 `css/styles.css` 末尾追加：

```css
/* ── 流式处理卡片 ── */
.ai-stream-cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  max-height: 320px;
  overflow-y: auto;
}

.ai-stream-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem;
  border-radius: 0.5rem;
  background: rgba(16, 30, 70, 0.35);
  border: 1px solid rgba(30, 80, 180, 0.15);
  transition: border-color 0.3s;
}

.ai-stream-card-processing {
  border-color: rgba(26, 92, 255, 0.35);
  box-shadow: 0 0 12px rgba(26, 92, 255, 0.08);
}

.ai-stream-card-pending {
  border-style: dashed;
  opacity: 0.5;
}

.ai-stream-card-done {
  border-color: rgba(14, 217, 180, 0.15);
}

.ai-stream-card-thumb {
  position: relative;
  width: 64px;
  height: 48px;
  flex-shrink: 0;
  background: #0a1229;
  border-radius: 0.375rem;
  overflow: hidden;
}

.ai-stream-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ai-stream-card-body {
  flex: 1;
  min-width: 0;
}

.ai-stream-card-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ai-color-text-primary);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-stream-card-stages {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.ai-stream-card-stages span {
  white-space: nowrap;
}

/* ── Scan canvas ── */
.ai-scan-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
```

- [ ] **Step 7: 提交**

```bash
git add js/app.js css/styles.css audit_agent.html
git commit -m "feat: 照片处理流式输出+逐阶段处理卡片

- 每张图片渲染为独立处理卡片(缩略图+三阶段状态)
- 利用现有_onImageUpdate/_onStageChange回调实时更新
- ✓完成(绿)/⏳进行中(蓝+脉冲)/○等待(灰)
- 处理中卡片蓝光边框高亮

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: JS — Canvas 扫描线粒子动画

**Files:**
- Modify: `js/app.js`（新增 Canvas 动画函数）

- [ ] **Step 1: 添加扫描线 Canvas 动画函数**

在 `js/app.js` 中（约 `renderStreamCards` 之后）添加：

```javascript
// ── Scan Line Canvas Animation ─────────────────────────

const _scanAnimations = new Map(); // fileId -> { animId, progress }

function startScanAnimation(fileId) {
  if (_scanAnimations.has(fileId)) return;

  const canvas = document.querySelector(`.ai-scan-canvas[data-file-id="${fileId}"]`);
  if (!canvas) return;

  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const ctx = canvas.getContext('2d');
  let progress = 0; // 0 to 1

  function draw() {
    if (!canvas.isConnected) {
      _scanAnimations.delete(fileId);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const y = progress * h;

    // Glow band above scan line
    const glowGrad = ctx.createLinearGradient(0, y - 18, 0, y);
    glowGrad.addColorStop(0, 'rgba(100,160,255,0)');
    glowGrad.addColorStop(1, 'rgba(100,160,255,0.04)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, y - 18, w, 18);

    // Scan line — soft gradient
    const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
    lineGrad.addColorStop(0, 'rgba(100,160,255,0)');
    lineGrad.addColorStop(0.15, 'rgba(100,160,255,0.3)');
    lineGrad.addColorStop(0.5, 'rgba(130,180,255,0.45)');
    lineGrad.addColorStop(0.85, 'rgba(100,160,255,0.3)');
    lineGrad.addColorStop(1, 'rgba(100,160,255,0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    // Corner markers
    const cm = 0.25; // opacity
    const cl = 8;    // corner length
    ctx.strokeStyle = `rgba(100,160,255,${cm})`;
    ctx.lineWidth = 1;
    // top-left
    ctx.beginPath(); ctx.moveTo(4, 4+cl); ctx.lineTo(4, 4); ctx.lineTo(4+cl, 4); ctx.stroke();
    // top-right
    ctx.beginPath(); ctx.moveTo(w-4-cl, 4); ctx.lineTo(w-4, 4); ctx.lineTo(w-4, 4+cl); ctx.stroke();
    // bottom-left
    ctx.beginPath(); ctx.moveTo(4, h-4-cl); ctx.lineTo(4, h-4); ctx.lineTo(4+cl, h-4); ctx.stroke();
    // bottom-right
    ctx.beginPath(); ctx.moveTo(w-4-cl, h-4); ctx.lineTo(w-4, h-4); ctx.lineTo(w-4, h-4-cl); ctx.stroke();

    // Progress text (bottom overlay)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - 18, w, 18);
    ctx.fillStyle = 'rgba(100,160,255,0.75)';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillText('⏳ 处理中...  ' + Math.round(progress * 100) + '%', 6, h - 5);

    // Advance
    progress += 0.008;
    if (progress > 1) progress = 0;

    const id = requestAnimationFrame(draw);
    _scanAnimations.set(fileId, { animId: id, progress });
  }

  const id = requestAnimationFrame(draw);
  _scanAnimations.set(fileId, { animId: id, progress });
}

function stopScanAnimation(fileId) {
  const entry = _scanAnimations.get(fileId);
  if (entry) {
    cancelAnimationFrame(entry.animId);
    _scanAnimations.delete(fileId);
  }
}

function stopAllScanAnimations() {
  _scanAnimations.forEach((entry) => cancelAnimationFrame(entry.animId));
  _scanAnimations.clear();
}
```

- [ ] **Step 2: 在流式卡片渲染后启动扫描动画**

在 `renderStreamCards` 函数末尾添加：

```javascript
// After innerHTML assignment, start scan animations for processing cards
requestAnimationFrame(() => {
  uploadedFiles.forEach(f => {
    const isProcessing = f.selfValidationStatus === 'running' ||
                         f.crossCheckStatus === 'running' ||
                         f.compareStatus === 'running';
    if (isProcessing) {
      startScanAnimation(f.id);
    } else {
      stopScanAnimation(f.id);
    }
  });
});
```

- [ ] **Step 3: 分析完成时停止所有扫描动画**

在 `_stopProcessingTimer` 调用处添加：

```javascript
stopAllScanAnimations();
```

- [ ] **Step 4: 提交**

```bash
git add js/app.js
git commit -m "feat: Canvas扫描线粒子动画(淡蓝柔光+四角定位)

- startScanAnimation在缩略图上绘制扫描线动画
- 淡蓝色柔和实线+两端渐隐+微光晕+四角定位
- 底部显示处理进度百分比
- requestAnimationFrame驱动，60fps
- 处理完成自动停止动画

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 最终验证与清理

**Files:**
- 检查: 全部三个文件

- [ ] **Step 1: 确认 css/styles.css 完整覆盖所有修改**

检查清单：
- [ ] `:root` CSS 变量已替换为深蓝冷色调
- [ ] Header 背景已改为 `#060d1f`（无渐变）
- [ ] 卡片添加毛玻璃 `backdrop-filter`
- [ ] 缩略图 `object-fit: contain` + 高度 120px
- [ ] 导航栏深蓝底 `#0a1229` + 白字
- [ ] 流式卡片样式完整
- [ ] 报告弹窗样式完整
- [ ] 左侧面板汇总样式完整

- [ ] **Step 2: 确认 audit_agent.html 完整覆盖所有修改**

检查清单：
- [ ] `<title>` 改为 "江苏审计智能分析平台"
- [ ] Header 标题居中 + 改名
- [ ] 导航栏三区布局
- [ ] 左侧面板改为审计分析报告汇总
- [ ] 流式卡片容器 `#aiStreamCards` 已添加
- [ ] `#aiResultModal` 已改为 report-modal 样式类

- [ ] **Step 3: 确认 js/app.js 不改动分析逻辑**

检查清单：
- [ ] `analysis-engine.js` 未被修改 ✓
- [ ] `api.js` 未被修改 ✓
- [ ] `image-lib.js` 未被修改 ✓
- [ ] `showReport` 改为弹窗模式但报告内容渲染逻辑一致
- [ ] 回调扩展仅追加 UI 更新，不改变引擎调用

- [ ] **Step 4: 启动服务器验证**

```bash
node server.js
```

用浏览器打开应用，验证：
1. 页面配色为深蓝冷色调，全局统一背景
2. Header 标题居中，"江苏审计智能分析平台"
3. 导航栏深蓝底 + 白字，点击正常
4. 上传图片 → 缩略图 120px contain
5. 开始分析 → 流式卡片逐张出现 + 扫描线动画
6. 分析完成 → 弹窗展示报告（非页面内嵌）
7. 左侧面板显示汇总数据
8. 弹窗可关闭、可导出

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: 最终核查，确认所有样式修改完整

- 配色/Header/缩略图/流式卡片/扫描线/报告弹窗/左侧面板
- 内部功能逻辑未修改
- 所有文件自审通过

Co-Authored-By: Claude <noreply@anthropic.com>"
```
