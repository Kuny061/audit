# 骗补行为图像检测改造 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the center panel into a fraud-detection pipeline that compares uploaded images against a library using GLM Vision API, detecting duplicate agricultural tool photos and barcode mismatches.

**Architecture:** Four JS modules with clear boundaries — image library (IndexedDB + pHash), API client (GLM Vision calls), analysis engine (3-phase pipeline orchestration), and main app (UI bindings). Two HTML sections modified: right panel (image library grid + uploaded review list) and center panel (add config entry above upload zone).

**Tech Stack:** Vanilla JS, IndexedDB, Canvas API (pHash), GLM-4V API (OpenAI-compatible), existing HTML/CSS base

---

## File Structure

| File | Role | Responsibility |
|------|------|---------------|
| `js/image-lib.js` (new) | Data layer | IndexedDB CRUD for benchmark images; perceptual hash computation from canvas |
| `js/api.js` (new) | External integration | GLM API calls (type ID, comparison, report); config load/save via localStorage |
| `js/analysis-engine.js` (new) | Business logic | 3-phase pipeline: classify → prefilter+compare → aggregate+report; emits progress callbacks |
| `js/app.js` (new) | UI orchestration | File upload, config panel, right-panel rendering, progress log, report display; imports the other three |
| `audit_agent.html` (modify) | Structure | Replace right-panel cards (gallery-intro, gallery-selection → image-library, upload-review); add config toggle above upload zone |
| `css/styles.css` (modify) | Presentation | Styles for config panel, image-library grid, upload-review list, status badges |

---

### Task 1: Image Library Module (`js/image-lib.js`)

**Files:**
- Create: `js/image-lib.js`

This module owns all IndexedDB operations for the benchmark image library plus client-side perceptual hash computation. No dependencies on other new modules.

- [ ] **Step 1: Create `js/image-lib.js` — IndexedDB schema and connection**

```js
// js/image-lib.js
const DB_NAME = 'audit-image-lib';
const DB_VERSION = 1;
const STORE_NAME = 'images';

class ImageLibrary {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('addedAt', 'addedAt', { unique: false });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async addImage(file) {
    const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const base64 = await this._fileToBase64(file);
    const pHash = await this._computePHash(base64);
    const record = {
      id,
      name: file.name,
      base64,
      pHash,
      addedAt: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteImage(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllImages() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getCount() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
```

- [ ] **Step 2: Add file-to-base64 converter and pHash computation**

```js
  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _computePHash(base64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const hash = this._pHashFromImage(img);
        resolve(hash);
      };
      img.src = base64;
    });
  }

  _pHashFromImage(img) {
    const size = 8;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      const gray = 0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2];
      pixels.push(gray);
    }
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    let hash = '';
    for (const p of pixels) {
      hash += p >= mean ? '1' : '0';
    }
    return hash;
  }

  hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) return Infinity;
    let dist = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) dist++;
    }
    return dist;
  }
}

window.ImageLibrary = ImageLibrary;
```

- [ ] **Step 3: Verify — open `audit_agent.html` in browser, run in console**

```js
const lib = new ImageLibrary();
await lib.init();
await lib.addImage(/* a File object from input */);
const images = await lib.getAllImages();
console.log('Library count:', images.length);
```

Expected: Console shows library count incrementing. No errors.

---

### Task 2: API Module (`js/api.js`)

**Files:**
- Create: `js/api.js`

Encapsulates all GLM API calls and localStorage config management. Depends on nothing else.

- [ ] **Step 1: Create `js/api.js` — Config management and base API call**

```js
// js/api.js
const CONFIG_KEY = 'audit_config';

class AuditAPI {
  static getDefaults() {
    return {
      apiKey: '',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4v-flash',
      similarityThreshold: 80,
      prefilterThreshold: 10
    };
  }

  static loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return { ...AuditAPI.getDefaults(), ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return AuditAPI.getDefaults();
  }

  static saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  static isConfigured() {
    return !!AuditAPI.loadConfig().apiKey;
  }

  static async _callAPI(messages, config) {
    const body = {
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: 2048
    };
    const response = await fetch(`${config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
  }

  static _imageContent(base64) {
    return {
      type: 'image_url',
      image_url: { url: base64 }
    };
  }
```

- [ ] **Step 2: Add Phase 1 — type identification**

```js
  static async identifyType(imageBase64) {
    const config = AuditAPI.loadConfig();
    const messages = [{
      role: 'user',
      content: [
        AuditAPI._imageContent(imageBase64),
        {
          type: 'text',
          text: '请判断这张图片属于以下哪种类型：\nA. 实物照片 — 拍摄的农业用具、机械设备等实物\nB. 条码/二维码 — 包含条形码或二维码的图片\n\n请用JSON格式回复（只回复JSON，不要其他内容）：\n{"type": "A或B", "description": "简短描述图片内容", "quality": "清晰/模糊/可疑"}'
        }
      ]
    }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse type identification result');
  }
```

- [ ] **Step 3: Add Phase 2 — image comparison (photo mode)**

```js
  static async comparePhoto(uploadBase64, uploadName, libraryImages) {
    const config = AuditAPI.loadConfig();
    const content = [
      AuditAPI._imageContent(uploadBase64),
      {
        type: 'text',
        text: `图A（"${uploadName}"）是待审的上传图片（报废农具）。\n请将图A与以下基准库图片逐一对比，判断是否拍摄于同一件物品（考虑拍摄角度、光照可能不同）。\n相似度阈值：${config.similarityThreshold}%。\n\n请仅返回JSON数组（不要其他内容）：\n[{"match_name": "库图名称", "similarity": 分数0-100, "is_suspicious": true/false, "reason": "简短判断依据"}]`
      }
    ];
    for (const libImg of libraryImages) {
      content.push(AuditAPI._imageContent(libImg.base64));
    }
    // Build reference list in text
    const refList = libraryImages.map((img, i) => `图${String.fromCharCode(66 + i)}: "${img.name}"`).join('\n');
    content.push({
      type: 'text',
      text: `基准库图片对照（按顺序）：\n${refList}`
    });

    const messages = [{ role: 'user', content }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  }
```

- [ ] **Step 4: Add Phase 2 — barcode comparison**

```js
  static async compareBarcode(uploadBase64, uploadName, libraryImages) {
    const config = AuditAPI.loadConfig();
    const content = [
      AuditAPI._imageContent(uploadBase64),
      {
        type: 'text',
        text: `这是待审图片"${uploadName}"中的条码。请先提取：\n1. 条码类型（EAN-13/Code-128/QR等）\n2. 条码下方/周围的数字文本\n3. 条码图案对应的编码内容\n\n然后与以下基准库条码图片逐一比对：\n- 条码图案是否与库中某图相同或高度相似？\n- 图案相同但数字文本不同 → 标记为is_suspicious=true\n- 图案相同且数字也相同 → 标记为is_suspicious=false（重复上传但内容一致）\n\n请仅返回JSON数组：\n[{"match_name": "库图名称", "barcode_type": "类型", "upload_numbers": "提取的数字", "match_numbers": "库图数字", "pattern_match": true/false, "numbers_differ": true/false, "is_suspicious": true/false, "reason": "判断依据"}]`
      }
    ];
    for (const libImg of libraryImages) {
      content.push(AuditAPI._imageContent(libImg.base64));
    }
    const refList = libraryImages.map((img, i) => `图${String.fromCharCode(66 + i)}: "${img.name}"`).join('\n');
    content.push({
      type: 'text',
      text: `基准库图片对照（按顺序）：\n${refList}`
    });

    const messages = [{ role: 'user', content }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  }
```

- [ ] **Step 5: Add Phase 3 — report generation**

```js
  static async generateReport(summary) {
    const config = AuditAPI.loadConfig();
    const messages = [{
      role: 'user',
      content: `以下是本次审计的图片比对汇总数据：\n${JSON.stringify(summary, null, 2)}\n\n请生成一份审计分析报告（Markdown格式），包含：\n\n## 总体评估\n（共上传X张，发现可疑Y项，其中高风险Z项）\n\n## 可疑项详情\n（每项：图片名、匹配来源、相似度/异常描述、风险等级）\n\n风险等级定义：\n- 高风险：相似度>90%，基本确认同一物品或条码图案相同但数字不同\n- 中风险：相似度70-90%，需要人工复核\n- 低风险：有疑点但证据不够充分\n\n## 统计概览\n（按类型/风险等级分布）\n\n## 整改建议\n（针对发现的骗补嫌疑提出审计处理建议）`
    }];
    const result = await AuditAPI._callAPI(messages, config);
    return result;
  }
}

window.AuditAPI = AuditAPI;
```

---

### Task 3: Analysis Engine (`js/analysis-engine.js`)

**Files:**
- Create: `js/analysis-engine.js`

Orchestrates the 3-phase pipeline. Uses `ImageLibrary` and `AuditAPI`. Emits progress callbacks for UI updates.

- [ ] **Step 1: Create `js/analysis-engine.js` — skeleton and batch helpers**

```js
// js/analysis-engine.js
class AnalysisEngine {
  constructor(imageLibrary) {
    this.lib = imageLibrary;
  }

  _log(level, message, data = null) {
    if (this._onLog) this._onLog(level, message, data);
  }

  _now() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  _extractEXIF(base64) {
    // Best-effort EXIF extraction from JPEG base64 in browser.
    // GLM Vision models will also read EXIF data from the image directly during analysis.
    try {
      const binary = atob(base64.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const view = new DataView(bytes.buffer);
      let offset = 2; // skip SOI marker
      while (offset < bytes.length - 1) {
        if (bytes[offset] === 0xFF && bytes[offset + 1] === 0xE1) break; // APP1/EXIF
        offset += 2 + view.getUint16(offset + 2, false);
      }
      if (offset >= bytes.length - 1) return { device: null, dateTaken: null, gps: null };
      offset += 4; // skip APP1 marker + length
      const tiff = new TextDecoder().decode(bytes.slice(offset, offset + 6));
      if (tiff !== 'Exif\0\0') return { device: null, dateTaken: null, gps: null };
      // Return limited info — full EXIF parsing needs a library; GLM handles the rest
      return { device: null, dateTaken: null, gps: null, rawAvailable: true };
    } catch (e) {
      return { device: null, dateTaken: null, gps: null };
    }
  }

  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
```

- [ ] **Step 2: Add Phase 1 — type identification for all uploads**

```js
  async _phase1Identify(uploadedImages) {
    this._log('info', `开始类型识别，共 ${uploadedImages.length} 张图片`);
    const results = [];
    const config = AuditAPI.loadConfig();

    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      this._log('info', `[${i + 1}/${uploadedImages.length}] 识别 "${img.name}"...`);

      try {
        const result = await AuditAPI.identifyType(img.base64);
        img.type = result.type === 'A' ? 'photo' : (result.type === 'B' ? 'barcode' : 'unknown');
        img.typeDescription = result.description || '';
        img.quality = result.quality || '未知';
        img.compareStatus = 'pending';
        // Compute pHash locally
        const hash = await this.lib._computePHash(img.base64);
        img.pHash = hash;
        this._log('success', `"${img.name}" 识别为 [${img.type === 'photo' ? '实物照片' : '条码'}] - ${img.typeDescription}`);
      } catch (e) {
        img.type = 'unknown';
        img.compareStatus = 'error';
        img.error = e.message;
        this._log('error', `"${img.name}" 识别失败: ${e.message}`);
      }
      results.push(img);

      if (this._onImageUpdate) this._onImageUpdate(img, i);
    }
    return results;
  }
```

- [ ] **Step 3: Add Phase 2 — comparison with pre-filtering**

```js
  async _phase2Compare(classifiedImages) {
    const allLibImages = await this.lib.getAllImages();
    if (allLibImages.length === 0) {
      this._log('warning', '图片库为空，跳过对比阶段。请先上传基准图到图片库。');
      return classifiedImages;
    }
    const config = AuditAPI.loadConfig();
    this._log('info', `图片库共 ${allLibImages.length} 张基准图，阈值: 汉明距离≤${config.prefilterThreshold}`);

    for (let i = 0; i < classifiedImages.length; i++) {
      const img = classifiedImages[i];
      if (img.type === 'unknown' || img.compareStatus === 'error') continue;

      // Pre-filter with pHash
      const candidates = allLibImages.filter(libImg => {
        if (!libImg.pHash || !img.pHash) return true; // fallback
        const dist = this.lib.hammingDistance(img.pHash, libImg.pHash);
        return dist <= config.prefilterThreshold;
      });
      this._log('info', `"${img.name}" 预筛选: 库${allLibImages.length}张 → 候选${candidates.length}张`);

      if (candidates.length === 0) {
        img.compareStatus = 'done';
        img.compareResults = [];
        this._log('success', `"${img.name}" 未发现相似匹配，无异常`);
        if (this._onImageUpdate) this._onImageUpdate(img, i);
        continue;
      }

      // Deep compare in batches
      img.compareStatus = 'analyzing';
      if (this._onImageUpdate) this._onImageUpdate(img, i);
      const allResults = [];
      const batches = this._chunkArray(candidates, 4);

      for (let b = 0; b < batches.length; b++) {
        this._log('info', `"${img.name}" GLM深度对比 批次${b + 1}/${batches.length}...`);
        try {
          let batchResults;
          if (img.type === 'photo') {
            batchResults = await AuditAPI.comparePhoto(img.base64, img.name, batches[b]);
          } else {
            batchResults = await AuditAPI.compareBarcode(img.base64, img.name, batches[b]);
          }
          allResults.push(...batchResults);

          const suspicious = batchResults.filter(r => r.is_suspicious);
          for (const r of suspicious) {
            this._log('warning', `⚠ "${img.name}" 与库中"${r.match_name}" ${img.type === 'photo' ? `相似度 ${r.similarity}%` : '图案相同但数字不同'}，标记可疑`);
          }
        } catch (e) {
          this._log('error', `"${img.name}" 批次${b + 1}对比失败: ${e.message}`);
        }
      }

      img.compareResults = allResults;
      img.compareStatus = 'done';
      if (this._onImageUpdate) this._onImageUpdate(img, i);
    }
    return classifiedImages;
  }
```

- [ ] **Step 4: Add batch internal cross-check and Phase 3 — report**

```js
  _crossCheckBatch(classifiedImages) {
    const photoImages = classifiedImages.filter(img => img.type === 'photo' && img.pHash);
    for (let i = 0; i < photoImages.length; i++) {
      for (let j = i + 1; j < photoImages.length; j++) {
        const dist = this.lib.hammingDistance(photoImages[i].pHash, photoImages[j].pHash);
        if (dist <= 5) {
          this._log('warning', `⚠ 批次内自查: "${photoImages[i].name}" 与 "${photoImages[j].name}" 高度相似（汉明距离=${dist}），可能为同一图片`);
        }
      }
    }
  }

  _buildReportSummary(classifiedImages) {
    const summary = {
      totalUploaded: classifiedImages.length,
      suspiciousItems: [],
      stats: { high: 0, medium: 0, low: 0 }
    };
    for (const img of classifiedImages) {
      const suspiciousResults = (img.compareResults || []).filter(r => r.is_suspicious);
      for (const r of suspiciousResults) {
        const riskLevel = (r.similarity || 0) >= 90 ? 'high' : ((r.similarity || 0) >= 70 ? 'medium' : 'low');
        const item = {
          uploadName: img.name,
          matchName: r.match_name,
          similarity: r.similarity || null,
          reason: r.reason,
          riskLevel
        };
        summary.suspiciousItems.push(item);
        summary.stats[riskLevel]++;
      }
    }
    return summary;
  }

  async _phase3Report(classifiedImages) {
    this._log('info', '汇总分析结果，生成审计报告...');
    this._crossCheckBatch(classifiedImages);
    const summary = this._buildReportSummary(classifiedImages);
    const report = await AuditAPI.generateReport(summary);
    this._log('success', '审计报告生成完成');
    return { report, summary };
  }
```

- [ ] **Step 5: Add main run method**

```js
  async runAnalysis(uploadedImages) {
    this._log('info', `===== 开始审计分析，共 ${uploadedImages.length} 张上传图片 =====`);
    const classified = await this._phase1Identify(uploadedImages);
    const compared = await this._phase2Compare(classified);
    const { report, summary } = await this._phase3Report(compared);
    return { images: compared, report, summary };
  }
}

window.AnalysisEngine = AnalysisEngine;
```

---

### Task 4: HTML — Right Panel Restructure (`audit_agent.html`)

**Files:**
- Modify: `audit_agent.html` — Replace right panel cards

Replace the 3 old right-panel cards (gallery-intro, gallery-list, gallery-selection) with 2 new ones: image library and upload review.

- [ ] **Step 1: Replace right panel HTML (lines 556-621)**

Find the right panel section starting at `<div class="ai-right-panel">` (line 556). Replace the entire content inside it:

```html
      <!-- Right Panel -->
      <div class="ai-right-panel">
        <!-- Card 1: Image Library -->
        <div class="ai-card ai-card-gallery-list">
          <div class="ai-card-header">
            <h3 class="ai-card-title">
              <i class="fas fa-images"></i>
              <span>审计图片库</span>
            </h3>
            <span class="ai-card-badge" id="aiLibCount">0 张基准图</span>
          </div>
          <div class="ai-lib-toolbar">
            <span class="ai-lib-toolbar-hint">所有图片均为基准对比图</span>
            <button id="aiAddToLibBtn" class="ai-gallery-action-btn">
              <i class="fas fa-plus"></i> 上传图片到库
            </button>
            <input type="file" id="aiLibFileInput" class="ai-hidden" multiple
                   accept=".png,.jpg,.jpeg,.gif,.bmp,.webp">
          </div>
          <div id="aiLibraryGrid" class="ai-library-grid">
            <div class="ai-library-empty">
              <i class="fas fa-inbox"></i>
              <p>图片库为空，请上传基准图</p>
            </div>
          </div>
        </div>

        <!-- Card 2: Uploaded Images Under Review -->
        <div class="ai-card ai-card-gallery-selection">
          <div class="ai-card-header">
            <h3 class="ai-card-title">
              <i class="fas fa-layer-group"></i>
              <span>本次上传待审</span>
            </h3>
            <span class="ai-card-badge" id="aiReviewCount">0 张</span>
          </div>
          <div id="aiReviewList" class="ai-review-list">
            <div class="ai-review-empty">
              <i class="fas fa-cloud-upload-alt"></i>
              <p>暂无待审图片，请先上传</p>
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Add config section above upload zone in center panel**

Find the upload section card (starts at `<div id="aiUploadSection"` around line 237). Add this config toggle bar inside the card, between the upload header and the upload zone:

```html
          <!-- Config Toggle Bar -->
          <div class="ai-config-bar">
            <button id="aiConfigToggleBtn" class="ai-config-toggle">
              <i class="fas fa-cog"></i>
              <span>API 配置</span>
              <i class="fas fa-chevron-down"></i>
            </button>
            <span id="aiConfigStatus" class="ai-config-status ai-config-unset">未配置 API Key</span>
          </div>
          <!-- Config Panel (collapsed by default) -->
          <div id="aiConfigPanel" class="ai-config-panel ai-hidden">
            <div class="ai-config-row">
              <label>API Key <span class="ai-config-required">*</span></label>
              <input type="password" id="aiConfigApiKey" placeholder="输入智谱 API Key">
            </div>
            <div class="ai-config-row">
              <label>API 地址</label>
              <input type="text" id="aiConfigApiBase" placeholder="https://open.bigmodel.cn/api/paas/v4">
            </div>
            <div class="ai-config-row">
              <label>模型</label>
              <select id="aiConfigModel">
                <option value="glm-4v-flash">glm-4v-flash</option>
                <option value="glm-4v">glm-4v</option>
                <option value="glm-4.5v">glm-4.5v</option>
              </select>
            </div>
            <div class="ai-config-row">
              <label>相似度阈值 (%)</label>
              <input type="number" id="aiConfigSimThreshold" min="1" max="100" value="80">
            </div>
            <div class="ai-config-row">
              <label>预筛选阈值 (汉明距离)</label>
              <input type="number" id="aiConfigPrefilterThreshold" min="0" max="64" value="10">
            </div>
            <button id="aiConfigSaveBtn" class="ai-config-save-btn">保存配置</button>
          </div>
```

- [ ] **Step 3: Remove old gallery-intro card**

Delete the entire `ai-card-gallery-intro` div (lines 557-586 in original).

- [ ] **Step 4: Remove old gallery-selection card content and replace**

The gallery-selection card is being replaced entirely by the new upload review list in Step 1 above. The existing `ai-card-gallery-selection` div (lines 599-621) gets entirely replaced as part of Step 1.

- [ ] **Step 5: Verify HTML structure**

Open `audit_agent.html` in browser. Verify:
- Right panel shows two cards: "审计图片库" and "本次上传待审"
- Center panel shows "API 配置" toggle bar above the upload zone
- No visual regressions in left panel or header

---

### Task 5: CSS — New Styles (`css/styles.css`)

**Files:**
- Modify: `css/styles.css`

Add styles for config panel, image library grid, and upload review list.

- [ ] **Step 1: Append config panel styles**

```css
/* 配置面板 */
.ai-config-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.ai-config-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(30, 42, 74, 0.4);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.5rem;
  color: var(--ai-color-text-secondary);
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ai-config-toggle:hover {
  color: var(--ai-color-text-primary);
  border-color: rgba(0, 212, 255, 0.3);
}

.ai-config-status {
  font-size: 0.625rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.75rem;
}

.ai-config-unset {
  color: var(--ai-color-red);
  background: rgba(239, 68, 68, 0.1);
}

.ai-config-set {
  color: var(--ai-color-green);
  background: rgba(16, 185, 129, 0.1);
}

.ai-config-panel {
  background: rgba(30, 42, 74, 0.3);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.75rem;
  padding: calc(var(--ai-spacing-unit) * 1.5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--ai-spacing-unit) * 1.25);
  flex-shrink: 0;
}

.ai-config-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ai-config-row label {
  font-size: 0.6875rem;
  color: var(--ai-color-text-secondary);
}

.ai-config-required {
  color: var(--ai-color-red);
}

.ai-config-row input,
.ai-config-row select {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--ai-color-border);
  border-radius: 0.375rem;
  color: var(--ai-color-text-primary);
  font-size: 0.75rem;
  padding: 0.5rem 0.625rem;
  outline: none;
  transition: border-color 0.3s ease;
}

.ai-config-row input:focus,
.ai-config-row select:focus {
  border-color: var(--ai-color-cyan);
}

.ai-config-save-btn {
  background: linear-gradient(135deg, var(--ai-color-cyan), var(--ai-color-blue));
  border: none;
  border-radius: 0.5rem;
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ai-config-save-btn:hover {
  transform: translateY(-1px);
}
```

- [ ] **Step 2: Append image library styles**

```css
/* 图片库网格 */
.ai-lib-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--ai-spacing-unit) * 1) calc(var(--ai-spacing-unit) * 1.5);
}

.ai-lib-toolbar-hint {
  font-size: 0.625rem;
  color: var(--ai-color-text-secondary);
}

.ai-library-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--ai-spacing-unit) * 0.75);
  padding: calc(var(--ai-spacing-unit) * 1.5);
  max-height: 300px;
  overflow-y: auto;
}

.ai-library-empty,
.ai-review-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(var(--ai-spacing-unit) * 3);
  color: var(--ai-color-text-secondary);
  gap: calc(var(--ai-spacing-unit) * 1);
}

.ai-library-empty i,
.ai-review-empty i {
  font-size: 2rem;
  opacity: 0.3;
}

.ai-library-empty p,
.ai-review-empty p {
  font-size: 0.6875rem;
}

.ai-library-item {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ai-library-item:hover {
  border-color: rgba(0, 212, 255, 0.4);
}

.ai-library-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  display: block;
}

.ai-library-item-name {
  font-size: 0.5625rem;
  padding: 0.25rem 0.375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ai-color-text-secondary);
}

.ai-library-item-delete {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.8);
  border: none;
  color: white;
  font-size: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ai-library-item:hover .ai-library-item-delete {
  opacity: 1;
}
```

- [ ] **Step 3: Append upload review list styles**

```css
/* 上传待审列表 */
.ai-review-list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--ai-spacing-unit) * 0.75);
  padding: calc(var(--ai-spacing-unit) * 1.5);
  max-height: 350px;
  overflow-y: auto;
}

.ai-review-item {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 0.625rem;
  padding: calc(var(--ai-spacing-unit) * 1);
  background: rgba(30, 42, 74, 0.25);
  display: flex;
  gap: calc(var(--ai-spacing-unit) * 1);
}

.ai-review-thumb {
  width: 52px;
  height: 52px;
  border-radius: 0.375rem;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.5);
}

.ai-review-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
}

.ai-review-name {
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-review-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ai-review-type-badge {
  font-size: 0.5625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 999px;
  font-weight: 600;
}

.ai-review-type-photo {
  background: rgba(59, 130, 246, 0.12);
  color: #93c5fd;
}

.ai-review-type-barcode {
  background: rgba(139, 92, 246, 0.12);
  color: #c4b5fd;
}

.ai-review-type-unknown {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}

.ai-review-status {
  font-size: 0.5625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 999px;
}

.ai-review-status-pending {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}

.ai-review-status-analyzing {
  background: rgba(0, 212, 255, 0.12);
  color: var(--ai-color-cyan);
}

.ai-review-status-done {
  background: rgba(16, 185, 129, 0.12);
  color: var(--ai-color-green);
}

.ai-review-status-error {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ai-color-red);
}

.ai-review-diff {
  font-size: 0.625rem;
  line-height: 1.5;
  margin-top: 0.125rem;
}

.ai-review-diff-suspicious {
  color: var(--ai-color-red);
}

.ai-review-diff-clean {
  color: var(--ai-color-green);
}
```

- [ ] **Step 4: Override gallery-selection body padding for the redesign**

```css
/* Override old gallery-selection styles for new layout */
.ai-card-gallery-selection .ai-gallery-selection-body {
  padding: 0;
}
```

- [ ] **Step 5: Verify styles**

Open `audit_agent.html` in browser. Check:
- Config toggle bar shows and panel expands/collapses
- Image library grid renders with 3-column layout
- Review list items show thumbnail + meta + status
- All colors consistent with the dark theme

---

### Task 6: Main Application Logic (`js/app.js`)

**Files:**
- Create: `js/app.js`

Ties all modules together — initialization, UI event bindings, file upload handling, analysis flow triggering, right panel rendering.

- [ ] **Step 1: Create `js/app.js` — initialization and state**

```js
// js/app.js
(function () {
  'use strict';

  const lib = new ImageLibrary();
  const engine = new AnalysisEngine(lib);
  let uploadedFiles = [];     // Array of { id, name, file, base64 }
  let waitForApiKey = false; // Track if key was just saved for auto-analysis

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function init() {
    await lib.init();
    loadConfigUI();
    bindEvents();
    renderLibrary();
    renderReviewList();
  }
```

- [ ] **Step 2: Config panel logic**

```js
  function loadConfigUI() {
    const config = AuditAPI.loadConfig();
    $('#aiConfigApiKey').value = config.apiKey;
    $('#aiConfigApiBase').value = config.apiBase;
    $('#aiConfigModel').value = config.model;
    $('#aiConfigSimThreshold').value = config.similarityThreshold;
    $('#aiConfigPrefilterThreshold').value = config.prefilterThreshold;
    updateConfigStatus();
  }

  function updateConfigStatus() {
    const el = $('#aiConfigStatus');
    if (AuditAPI.isConfigured()) {
      el.textContent = '已配置';
      el.className = 'ai-config-status ai-config-set';
    } else {
      el.textContent = '未配置 API Key';
      el.className = 'ai-config-status ai-config-unset';
    }
  }

  function saveConfig() {
    const config = {
      apiKey: $('#aiConfigApiKey').value.trim(),
      apiBase: $('#aiConfigApiBase').value.trim(),
      model: $('#aiConfigModel').value,
      similarityThreshold: parseInt($('#aiConfigSimThreshold').value) || 80,
      prefilterThreshold: parseInt($('#aiConfigPrefilterThreshold').value) || 10
    };
    AuditAPI.saveConfig(config);
    updateConfigStatus();
    return config;
  }
```

- [ ] **Step 3: File upload handling**

```js
  function handleFileSelect(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        addLog('warning', `跳过非图片文件: ${file.name}`);
        continue;
      }
      const id = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const reader = new FileReader();
      reader.onload = () => {
        uploadedFiles.push({
          id,
          name: file.name,
          file,
          base64: reader.result,
          type: null,
          typeDescription: '',
          quality: '',
          pHash: null,
          compareStatus: 'pending',
          compareResults: [],
          error: null
        });
        renderUploadPreview();
        renderReviewList();
        updateAnalyzeButton();
      };
      reader.readAsDataURL(file);
    }
  }

  function clearAllFiles() {
    uploadedFiles = [];
    renderUploadPreview();
    renderReviewList();
    updateAnalyzeButton();
    $('#aiFileInput').value = '';
  }
```

- [ ] **Step 4: Upload preview rendering**

```js
  function renderUploadPreview() {
    const countEl = $('#aiFileCount');
    const listEl = $('#aiFileList');
    const previewSection = $('#aiFilePreviewList');
    const startSection = $('#aiStartAnalysisSection');

    if (uploadedFiles.length === 0) {
      previewSection.classList.add('ai-hidden');
      startSection.classList.add('ai-hidden');
      return;
    }

    countEl.textContent = uploadedFiles.length;
    previewSection.classList.remove('ai-hidden');
    startSection.classList.remove('ai-hidden');

    listEl.innerHTML = uploadedFiles.map((f, i) => {
      const iconClass = f.file.type.includes('pdf') ? 'ai-file-icon-pdf' :
        f.file.type.includes('word') ? 'ai-file-icon-word' :
        f.file.type.includes('excel') ? 'ai-file-icon-excel' : '';
      const displayIcon = f.file.type.startsWith('image/') && f.base64
        ? `<img src="${f.base64}" class="ai-file-thumbnail" alt="${f.name}">`
        : `<div class="ai-file-icon ${iconClass}"><i class="fas fa-file"></i></div>`;
      return `
        <div class="ai-file-item" onclick="UI.previewFile('${f.id}')">
          ${displayIcon}
          <button class="ai-file-delete" onclick="event.stopPropagation(); App.removeFile('${f.id}')">
            <i class="fas fa-times"></i>
          </button>
          <div class="ai-file-info">
            <div class="ai-file-name" title="${f.name}">${f.name}</div>
          </div>
        </div>`;
    }).join('');
  }
```

- [ ] **Step 5: Image library rendering**

```js
  async function renderLibrary() {
    const grid = $('#aiLibraryGrid');
    const countEl = $('#aiLibCount');
    const images = await lib.getAllImages();
    countEl.textContent = `${images.length} 张基准图`;

    if (images.length === 0) {
      grid.innerHTML = `<div class="ai-library-empty">
        <i class="fas fa-inbox"></i>
        <p>图片库为空，请上传基准图</p>
      </div>`;
      return;
    }

    grid.innerHTML = images.map(img => `
      <div class="ai-library-item" onclick="App.previewLibImage('${img.id}')">
        <img src="${img.base64}" alt="${img.name}">
        <div class="ai-library-item-name">${img.name}</div>
        <button class="ai-library-item-delete" onclick="event.stopPropagation(); App.deleteLibImage('${img.id}')">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  }
```

- [ ] **Step 6: Review list rendering**

```js
  function renderReviewList() {
    const list = $('#aiReviewList');
    const countEl = $('#aiReviewCount');
    countEl.textContent = `${uploadedFiles.length} 张`;

    if (uploadedFiles.length === 0) {
      list.innerHTML = `<div class="ai-review-empty">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>暂无待审图片，请先上传</p>
      </div>`;
      return;
    }

    list.innerHTML = uploadedFiles.map(f => {
      const typeLabel = f.type === 'photo' ? '实物照片' : f.type === 'barcode' ? '条码' : '未识别';
      const typeClass = f.type === 'photo' ? 'ai-review-type-photo' : f.type === 'barcode' ? 'ai-review-type-barcode' : 'ai-review-type-unknown';
      const statusLabel = { pending: '待比对', analyzing: '比对中', done: '已完成', error: '失败' }[f.compareStatus] || '待比对';
      const statusClass = `ai-review-status-${f.compareStatus || 'pending'}`;

      let diffHtml = '';
      if (f.compareStatus === 'done') {
        const suspicious = (f.compareResults || []).filter(r => r.is_suspicious);
        if (suspicious.length > 0) {
          diffHtml = suspicious.map(r =>
            `<div class="ai-review-diff ai-review-diff-suspicious">⚠ 与库中"${r.match_name}"相似：${r.reason || '标记可疑'}</div>`
          ).join('');
        } else {
          diffHtml = '<div class="ai-review-diff ai-review-diff-clean">未发现匹配</div>';
        }
      } else if (f.compareStatus === 'error') {
        diffHtml = `<div class="ai-review-diff ai-review-diff-suspicious">${f.error || '分析失败'}</div>`;
      }

      return `
        <div class="ai-review-item">
          <img class="ai-review-thumb" src="${f.base64}" alt="${f.name}">
          <div class="ai-review-body">
            <div class="ai-review-name" title="${f.name}">${f.name}</div>
            <div class="ai-review-meta">
              <span class="ai-review-type-badge ${typeClass}">${typeLabel}</span>
              <span class="ai-review-status ${statusClass}">${statusLabel}</span>
            </div>
            ${diffHtml}
          </div>
        </div>`;
    }).join('');
  }
```

- [ ] **Step 7: Analysis flow binding**

```js
  async function startAnalysis() {
    if (!AuditAPI.isConfigured()) {
      $('#aiConfigPanel').classList.remove('ai-hidden');
      addLog('error', '请先配置 API Key');
      return;
    }
    if (uploadedFiles.length === 0) return;

    // Switch to processing view
    $('#aiUploadSection').classList.add('ai-hidden');
    $('#aiAgentSection').classList.remove('ai-hidden');
    $('#aiReportSection').classList.add('ai-hidden');
    clearLog();

    // Wire progress callbacks
    engine._onLog = addLog;
    engine._onImageUpdate = (img, idx) => {
      uploadedFiles[idx] = img;
      renderReviewList();
      updateProcessingUI(img);
    };

    try {
      const result = await engine.runAnalysis(uploadedFiles);
      // Show report
      $('#aiAgentSection').classList.add('ai-hidden');
      showReport(result.report, result.summary);
    } catch (e) {
      addLog('error', `分析异常中断: ${e.message}`);
    }
  }
```

- [ ] **Step 8: Report display, log, and utility functions**

```js
  function showReport(reportMarkdown, summary) {
    const section = $('#aiReportSection');
    section.classList.remove('ai-hidden');
    const insightEl = $('#aiInsightContent');
    insightEl.innerHTML = reportMarkdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n- /g, '<br>- ');

    const statsEl = section.querySelector('.ai-report-subtitle');
    if (statsEl) {
      const total = summary.totalUploaded;
      const suspicious = summary.suspiciousItems.length;
      const highRisk = summary.stats.high;
      statsEl.textContent = `分析完成 · 上传${total}张 · 可疑${suspicious}项 · 高风险${highRisk}项`;
    }

    // Update stat numbers in report section
    const statValues = section.querySelectorAll('.ai-stat-value');
    if (statValues.length >= 3) {
      statValues[0].textContent = highRisk;
      statValues[1].textContent = summary.stats.medium;
      statValues[2].textContent = total - suspicious;
    }
  }

  function addLog(level, message) {
    const logEl = $('#aiProcessingLog');
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const cls = level === 'success' ? 'ai-log-success' : level === 'warning' ? 'ai-log-warning' : level === 'error' ? 'ai-log-error' : 'ai-log-info';
    logEl.innerHTML += `<div class="ai-log-entry ${cls}">[${time}] ${message}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    const logEl = $('#aiProcessingLog');
    logEl.innerHTML = '<div class="ai-log-entry ai-log-info">[系统] AI审计分析引擎已启动...</div>';
  }

  function updateProcessingUI(img) {
    // Update processing status text
    const statusEl = $('#aiAgentStatus');
    const pending = uploadedFiles.filter(f => f.compareStatus === 'pending').length;
    const analyzing = uploadedFiles.filter(f => f.compareStatus === 'analyzing').length;
    const done = uploadedFiles.filter(f => f.compareStatus === 'done').length;
    statusEl.textContent = `识别中: ${done}/${uploadedFiles.length} 完成`;

    // Update file info bar
    if (img) {
      $('#aiFileName').textContent = img.name;
      $('#aiFileSize').textContent = img.typeDescription || '';
    }
  }

  function updateAnalyzeButton() {
    const btn = $('#aiStartAnalysisBtn');
    btn.disabled = uploadedFiles.length === 0;
  }

  // Global access for onclick handlers and legacy UI object
  window.App = {
    removeFile(id) {
      uploadedFiles = uploadedFiles.filter(f => f.id !== id);
      renderUploadPreview();
      renderReviewList();
      updateAnalyzeButton();
    },
    async deleteLibImage(id) {
      await lib.deleteImage(id);
      renderLibrary();
    },
    previewLibImage(id) {
      lib.getAllImages().then(images => {
        const img = images.find(i => i.id === id);
        if (img) {
          $('#aiPreviewImage').src = img.base64;
          $('#aiImageModal').classList.remove('ai-hidden');
        }
      });
    },
    startAnalysis
  };
```

- [ ] **Step 9: Event bindings**

```js
  function bindEvents() {
    // Upload zone click
    $('#aiUploadArea').addEventListener('click', () => $('#aiFileInput').click());
    $('#aiFileInput').addEventListener('change', (e) => handleFileSelect(e.target.files));

    // Drag and drop
    const uploadZone = $('#aiUploadArea');
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('ai-dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('ai-dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('ai-dragover');
      handleFileSelect(e.dataTransfer.files);
    });

    // Clear all
    $('#aiClearAllFiles').addEventListener('click', clearAllFiles);

    // Start analysis
    $('#aiStartAnalysisBtn').addEventListener('click', startAnalysis);

    // Config toggle
    $('#aiConfigToggleBtn').addEventListener('click', () => {
      $('#aiConfigPanel').classList.toggle('ai-hidden');
    });

    // Config save
    $('#aiConfigSaveBtn').addEventListener('click', () => {
      saveConfig();
      $('#aiConfigPanel').classList.add('ai-hidden');
      addLog('success', '配置已保存');
      // If analysis was waiting for config, trigger it
      if (waitForApiKey) {
        waitForApiKey = false;
        startAnalysis();
      }
    });

    // Library upload
    $('#aiAddToLibBtn').addEventListener('click', () => $('#aiLibFileInput').click());
    $('#aiLibFileInput').addEventListener('change', async (e) => {
      const files = e.target.files;
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        await lib.addImage(f);
      }
      renderLibrary();
      $('#aiLibFileInput').value = '';
      addLog('success', `已添加 ${files.length} 张图片到基准库`);
    });

    // Reset/continue buttons
    $('#aiUploadAnother').addEventListener('click', () => {
      uploadedFiles = [];
      renderUploadPreview();
      renderReviewList();
      $('#aiReportSection').classList.add('ai-hidden');
      $('#aiUploadSection').classList.remove('ai-hidden');
    });

    $('#aiRefreshPage').addEventListener('click', () => {
      $('#aiReportSection').classList.add('ai-hidden');
      $('#aiUploadSection').classList.remove('ai-hidden');
      startAnalysis();
    });
  }

  // Patch legacy UI object for existing HTML onclick references
  window.UI = window.UI || {};
  window.UI.closePreview = () => $('#aiImageModal').classList.add('ai-hidden');
  window.UI.closeResultModal = () => $('#aiResultModal').classList.add('ai-hidden');
  window.UI.exportReport = () => {
    const content = $('#aiInsightContent').innerText;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `审计报告_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Boot
  document.addEventListener('DOMContentLoaded', init);
})();
```

- [ ] **Step 10: Verify full flow**

Open `audit_agent.html` in browser and test:
1. Toggle API config, enter Key, save → status changes to "已配置"
2. Upload images via drag/drop or click → thumbnails appear in center, review items in right panel
3. Upload images to library via right panel "+" button → appear in grid
4. Click "开始AI审计分析" → processing view shows, log scrolls, review items update status
5. Report section appears with results

---

### Task 7: End-to-End Verification

**Files:**
- Manual verification via browser

- [ ] **Step 1: Test — no API Key configured**

1. Open `audit_agent.html`
2. Upload an image
3. Click "开始AI审计分析"
4. Expected: Config panel expands, log shows "请先配置 API Key", analysis does not proceed

- [ ] **Step 2: Test — image library management**

1. Click "+" in right panel
2. Select 3 images
3. Expected: Images appear in library grid, count updates
4. Hover over an image and click X
5. Expected: Image removed, count decrements

- [ ] **Step 3: Test — config panel**

1. Expand config panel
2. Fill in a fake API Key, change model to "glm-4v"
3. Click "保存配置"
4. Refresh page
5. Expected: Config values persist

- [ ] **Step 4: Test — empty library warning**

1. Ensure image library is empty
2. Upload images and start analysis with a valid API Key
3. Expected: Log shows "图片库为空，跳过对比阶段"

- [ ] **Step 5: Test — full analysis flow (with real API Key)**

1. Add 2-3 benchmark images to library
2. Upload 2 images (one should match a library image)
3. Click "开始AI审计分析"
4. Expected: Phase 1 identifies types, Phase 2 compares with pre-filtering, Phase 3 generates report
5. Expected: Right panel review list updates status in real-time
6. Expected: Report section shows with risk distribution

---

## Summary

| Task | Files | Steps | Description |
|------|-------|-------|-------------|
| 1 | `js/image-lib.js` (create) | 3 | IndexedDB CRUD + pHash computation |
| 2 | `js/api.js` (create) | 5 | GLM API calls + config management |
| 3 | `js/analysis-engine.js` (create) | 5 | 3-phase pipeline orchestration |
| 4 | `audit_agent.html` (modify) | 5 | Right panel restructure + config panel |
| 5 | `css/styles.css` (modify) | 5 | New component styles |
| 6 | `js/app.js` (create) | 10 | Main app logic, UI bindings |
| 7 | Manual verification | 5 | End-to-end testing |
