// js/app.js
(function () {
  'use strict';

  const lib = new ImageLibrary();
  const engine = new AnalysisEngine(lib);
  let uploadedFiles = [];
  let _analysisStartTime = null;
  let _analysisTimer = null;
  let _libTypeFilter = 'all';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Initialization ──────────────────────────────────────

  async function init() {
    await lib.init();
    await loadConfigUI();
    bindEvents();
    renderLibrary();
    renderReviewList();
    updateAnalyzeButton();
  }

  // ── Config ──────────────────────────────────────────────

  async function loadConfigUI() {
    const config = await AuditAPI.loadConfig();
    // API key is masked from server — show placeholder if configured
    $('#aiConfigApiKey').value = config.configured ? '(已配置，无需修改)' : '';
    $('#aiConfigApiKey').placeholder = config.configured ? '如需更换 Key，在此输入新 Key' : '输入智谱 API Key';
    $('#aiConfigModel').value = config.model;
    $('#aiConfigSimThreshold').value = config.similarityThreshold;
    $('#aiConfigPrefilterThreshold').value = config.prefilterThreshold;
    await updateConfigStatus();
  }

  async function updateConfigStatus() {
    const el = $('#aiConfigStatus');
    const configured = await AuditAPI.isConfigured();
    if (configured) {
      el.textContent = '已配置';
      el.className = 'ai-config-status ai-config-set';
    } else {
      el.textContent = '未配置 API Key';
      el.className = 'ai-config-status ai-config-unset';
    }
  }

  async function saveConfig() {
    const apiKeyInput = $('#aiConfigApiKey').value.trim();
    const config = {
      apiKey: apiKeyInput || undefined,  // undefined = don't overwrite server key
      model: $('#aiConfigModel').value,
      similarityThreshold: parseInt($('#aiConfigSimThreshold').value) || 80,
      prefilterThreshold: parseInt($('#aiConfigPrefilterThreshold').value) || 10
    };
    await AuditAPI.saveConfig(config);
    // Clear the key input field (key is now on server)
    $('#aiConfigApiKey').value = '';
    $('#aiConfigApiKey').placeholder = 'API Key 已保存到服务器';
    await updateConfigStatus();
    return config;
  }

  // ── File Upload ─────────────────────────────────────────

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

  function updateAnalyzeButton() {
    const btn = $('#aiStartAnalysisBtn');
    if (btn) btn.disabled = uploadedFiles.length === 0;
  }

  // ── Upload Preview ──────────────────────────────────────

  function renderUploadPreview() {
    const countEl = $('#aiFileCount');
    const listEl = $('#aiFileList');
    const previewSection = $('#aiFilePreviewList');
    const startSection = $('#aiStartAnalysisSection');

    if (uploadedFiles.length === 0) {
      if (previewSection) previewSection.classList.add('ai-hidden');
      if (startSection) startSection.classList.add('ai-hidden');
      return;
    }

    if (countEl) countEl.textContent = uploadedFiles.length;
    if (previewSection) previewSection.classList.remove('ai-hidden');
    if (startSection) startSection.classList.remove('ai-hidden');

    if (listEl) {
      listEl.innerHTML = uploadedFiles.map((f) => `
        <div class="ai-file-item" onclick="App.previewUpload('${f.id}')">
          <img src="${f.base64}" class="ai-file-thumbnail" alt="${f.name}">
          <button class="ai-file-delete" onclick="event.stopPropagation(); App.removeFile('${f.id}')">
            <i class="fas fa-times"></i>
          </button>
          <div class="ai-file-info">
            <div class="ai-file-name" title="${f.name}">${f.name}</div>
          </div>
        </div>
      `).join('');
    }
  }

  // ── Image Library ───────────────────────────────────────

  function renderLibTypeTabs() {
    const existing = document.getElementById('aiLibTypeTabs');
    if (existing) existing.remove();
    const toolbar = document.querySelector('.ai-lib-toolbar');
    if (!toolbar) return;

    const tabs = document.createElement('div');
    tabs.id = 'aiLibTypeTabs';
    tabs.className = 'ai-lib-type-tabs';
    const tabDefs = [
      { type: 'all', label: '全部' },
      { type: 'photo', label: '实物照片' },
      { type: 'barcode', label: '条码' },
      { type: 'unclassified', label: '未分类' }
    ];
    tabs.innerHTML = tabDefs.map(t =>
      `<button class="ai-lib-type-tab${_libTypeFilter === t.type ? ' active' : ''}" data-type="${t.type}">${t.label}</button>`
    ).join('');
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.ai-lib-type-tab');
      if (!btn) return;
      _libTypeFilter = btn.dataset.type;
      renderLibrary();
    });
    toolbar.after(tabs);
  }

  async function renderLibrary() {
    const grid = $('#aiLibraryGrid');
    const countEl = $('#aiLibCount');
    if (!grid) return;

    renderLibTypeTabs();

    let images;
    if (_libTypeFilter === 'all') {
      images = await lib.getAllImages();
    } else {
      images = await lib.getImagesByType(_libTypeFilter);
    }

    const total = await lib.getCount();
    if (countEl) countEl.textContent = `${images.length}/${total} 张基准图`;

    if (images.length === 0) {
      grid.innerHTML = `<div class="ai-library-empty">
        <i class="fas fa-inbox"></i>
        <p>${_libTypeFilter === 'all' ? '图片库为空，请上传基准图' : '该分类下暂无图片'}</p>
      </div>`;
      return;
    }

    grid.innerHTML = images.map(img => {
      const libType = img.libType || 'unclassified';
      const typeLabel = libType === 'photo' ? '实物照片' : libType === 'barcode' ? '条码' : '未分类';
      const typeClass = `ai-lib-type-${libType}`;
      return `
        <div class="ai-library-item" onclick="App.previewLibImage('${img.id}')">
          <img src="${img.base64}" alt="${img.name}">
          <span class="ai-library-item-type-badge ${typeClass}">${typeLabel}</span>
          <div class="ai-library-item-name">${img.name}</div>
          <button class="ai-library-item-delete" onclick="event.stopPropagation(); App.deleteLibImage('${img.id}')">
            <i class="fas fa-times"></i>
          </button>
        </div>`;
    }).join('');
  }

  // ── Build three-stage pipeline indicator for review list ──

  function _buildPipelineStages(img) {
    // Determine Stage 1 status (自校验)
    let s1Status, s1Icon, s1Label;
    if (img.type === 'photo') {
      s1Status = 'pass'; s1Icon = '✓'; s1Label = '自校验';
    } else if (img.stage1Status === 'pass') {
      s1Status = 'pass'; s1Icon = '✓'; s1Label = '自校验';
    } else if (img.stage1Status === 'fail') {
      s1Status = 'fail'; s1Icon = '✗'; s1Label = '自校验';
    } else {
      s1Status = 'pending'; s1Icon = '…'; s1Label = '自校验';
    }

    // Determine Stage 2 status (交叉校验)
    let s2Status, s2Icon, s2Label;
    if (img.stage2Status === 'pass') {
      s2Status = 'pass'; s2Icon = '✓'; s2Label = '交叉校验';
    } else if (img.stage2Status === 'duplicate') {
      s2Status = 'warning'; s2Icon = '↻'; s2Label = '交叉校验';
    } else if (img.stage1Status === 'fail') {
      s2Status = 'pending'; s2Icon = '—'; s2Label = '交叉校验';
    } else {
      s2Status = 'pending'; s2Icon = '…'; s2Label = '交叉校验';
    }

    // Determine Stage 3 status (入库对比)
    let s3Status, s3Icon, s3Label;
    const allSuspicious = (img.compareResults || []).filter(r => r.is_suspicious);
    if (img.compareStatus === 'done') {
      const libSuspicious = allSuspicious.filter(r => !r.source || (r.source !== 'internal_cross_check' && r.source !== 'barcode_self_validate'));
      if (libSuspicious.length > 0) {
        s3Status = 'warning'; s3Icon = '⚠'; s3Label = '入库对比';
      } else {
        s3Status = 'pass'; s3Icon = '✓'; s3Label = '入库对比';
      }
    } else if (img.compareStatus === 'error') {
      s3Status = 'fail'; s3Icon = '✗'; s3Label = '入库对比';
    } else if (img.stage1Status === 'fail' || img.stage2Status === 'duplicate') {
      s3Status = 'pending'; s3Icon = '—'; s3Label = '入库对比';
    } else {
      s3Status = 'pending'; s3Icon = '…'; s3Label = '入库对比';
    }

    return `<div class="ai-review-pipeline">
      <span class="ai-review-pipeline-stage ${s1Status}"><span class="ai-review-pipeline-icon">${s1Icon}</span><span class="ai-review-pipeline-label">${s1Label}</span></span>
      <span class="ai-review-pipeline-stage ${s2Status}"><span class="ai-review-pipeline-icon">${s2Icon}</span><span class="ai-review-pipeline-label">${s2Label}</span></span>
      <span class="ai-review-pipeline-stage ${s3Status}"><span class="ai-review-pipeline-icon">${s3Icon}</span><span class="ai-review-pipeline-label">${s3Label}</span></span>
    </div>`;
  }

  // ── Review List ─────────────────────────────────────────

  function renderReviewList() {
    const list = $('#aiReviewList');
    const countEl = $('#aiReviewCount');
    if (!list) return;
    if (countEl) countEl.textContent = `${uploadedFiles.length} 张`;

    if (uploadedFiles.length === 0) {
      list.innerHTML = `<div class="ai-review-empty">
        <i class="fas fa-cloud-upload-alt"></i>
        <p>暂无待审图片，请先上传</p>
      </div>`;
      return;
    }

    list.innerHTML = uploadedFiles.map(f => {
      const typeLabel = f.type === 'photo' ? '实物照片' : f.type === 'barcode' ? '条码' : '未识别';
      const typeClass = `ai-review-type-${f.type === 'photo' ? 'photo' : f.type === 'barcode' ? 'barcode' : 'unknown'}`;

      // ── Build three-stage pipeline indicator ──
      const pipelineHtml = _buildPipelineStages(f);

      // ── Barcode self-validation detail ──
      let barcodeDetailHtml = '';
      if (f.type === 'barcode' && f.barcodeInfo) {
        const bi = f.barcodeInfo;
        const resultIcon = bi.numbersMatch === true ? '✓' : bi.numbersMatch === false ? '✗' : '…';
        const resultCls = bi.numbersMatch === true ? 'ai-barcode-detail-row-pass'
          : bi.numbersMatch === false ? 'ai-barcode-detail-row-fail' : '';
        barcodeDetailHtml = `<div class="ai-review-barcode-info">
          <div class="ai-review-barcode-row"><span>扫描识别数字</span><span>${bi.scannedNumbers || '--'}</span></div>
          <div class="ai-review-barcode-row"><span>图片印刷数字</span><span>${bi.printedNumbers || '--'}</span></div>
          <div class="ai-review-barcode-row ${resultCls}"><span>自校验结果</span><span>${resultIcon} ${bi.numbersMatch === true ? '一致，通过' : bi.numbersMatch === false ? '不一致，可疑' : '处理中'}</span></div>
        </div>`;
      }

      // ── Warehouse success/failure notification ──
      let warehouseNotifyHtml = '';
      const saveResult = _libSaveResults[f.id];
      if (saveResult === 'success') {
        warehouseNotifyHtml = '<div class="ai-review-warehouse-success"><i class="fas fa-check-circle"></i> 入库成功</div>';
      } else if (saveResult === 'failed') {
        warehouseNotifyHtml = '<div class="ai-review-warehouse-failed"><i class="fas fa-times-circle"></i> 入库失败</div>';
      } else if (saveResult === 'existing') {
        warehouseNotifyHtml = '<div class="ai-review-warehouse-failed"><i class="fas fa-times-circle"></i> 入库失败（图库已存在）</div>';
      }

      return `
        <div class="ai-review-item">
          <img class="ai-review-thumb" src="${f.base64}" alt="${f.name}">
          <div class="ai-review-body">
            <div class="ai-review-name" title="${f.name}">${f.name}</div>
            <div class="ai-review-meta">
              <span class="ai-review-type-badge ${typeClass}">${typeLabel}</span>
            </div>
            ${pipelineHtml}
            ${barcodeDetailHtml}
            ${warehouseNotifyHtml}
          </div>
        </div>`;
    }).join('');
  }

  // ── Auto-save unmatched images to library ──────────────

  async function autoSaveToLibrary(libWasEmpty) {
    // Only save images that passed all stages (Stage 1 pass, Stage 2 not duplicate, Stage 3 no suspicious matches)
    // Also exclude images that already exist in the library (is_existing)
    const unmatchedImages = uploadedFiles.filter(f => {
      if (f.compareStatus !== 'done') return false;
      if (f.type === 'unknown' || f.compareStatus === 'error') return false;
      if (f.stage1Status === 'fail') return false;
      if (f.stage2Status === 'duplicate') return false;
      const hasExisting = (f.compareResults || []).some(r => r.is_existing);
      if (hasExisting) return false;
      const suspicious = (f.compareResults || []).filter(r => r.is_suspicious);
      return suspicious.length === 0;
    });

    // Mark all images' save status for Stage 3 display
    for (const img of uploadedFiles) {
      if (img.stage1Status === 'fail' || img.stage2Status === 'duplicate' || img.type === 'unknown') {
        _libSaveResults[img.id] = 'skipped';
      } else if (img.compareStatus === 'error') {
        _libSaveResults[img.id] = 'skipped';
      } else if ((img.compareResults || []).some(r => r.is_existing)) {
        _libSaveResults[img.id] = 'existing';
      }
    }

    if (unmatchedImages.length === 0) {
      // Mark remaining as failed/skipped based on suspicion
      for (const img of uploadedFiles) {
        if (!_libSaveResults[img.id] && img.compareStatus === 'done') {
          const suspicious = (img.compareResults || []).filter(r => r.is_suspicious);
          _libSaveResults[img.id] = suspicious.length > 0 ? 'skipped' : 'failed';
        }
      }
      return;
    }

    if (libWasEmpty) {
      addLog('info', `图片库为空，自动将 ${unmatchedImages.length} 张无匹配的上传图片入库作为基准图`);
    } else {
      addLog('info', `未发现重复匹配，自动将 ${unmatchedImages.length} 张无匹配图片入库作为基准图`);
    }

    for (const img of unmatchedImages) {
      try {
        const parts = img.base64.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const file = new File([blob], img.name, { type: mime });
        const libType = img.type === 'photo' ? 'photo' : img.type === 'barcode' ? 'barcode' : 'unclassified';
        await lib.addImage(file, libType);
        _libSaveResults[img.id] = 'success';
        console.log('[App] Auto-saved to library:', img.name, 'type:', libType);
      } catch (e) {
        _libSaveResults[img.id] = 'failed';
        addLog('error', `入库失败 "${img.name}": ${e.message}`);
      }
    }

    // Mark suspicious images as skipped
    for (const img of uploadedFiles) {
      if (!_libSaveResults[img.id] && img.compareStatus === 'done') {
        _libSaveResults[img.id] = 'skipped';
      }
    }
    renderLibrary();
    addLog('success', `已入库 ${unmatchedImages.length} 张无匹配图片`);
  }

  // ── Three-Stage Analysis Modal ─────────────────────────

  let _currentStage = 0;
  let _stageTimers = {};
  let _libSaveResults = {};  // track入库 results { imgId: 'success'|'failed'|'skipped' }
  let _stageTabUnlocked = [true, false, false];  // which tabs are clickable
  let _analysisCompleted = false;  // whether analysis has been run in this session

  function openAnalysisModal() {
    const modal = $('#aiAnalysisModal');
    if (!modal) return;
    modal.classList.remove('ai-hidden');
    _currentStage = 0;
    _stageTimers = {};
    _libSaveResults = {};
    _stageTabUnlocked = [true, false, false];
    _analysisCompleted = false;
    // Update process card badge to "分析中"
    const badge = $('#aiAnalysisProcessBadge');
    if (badge) { badge.textContent = '分析中'; badge.className = 'ai-card-badge ai-analysis-process-badge running'; }
    // Hide footer button until analysis completes
    const footerEl = $('#aiAnalysisFooter');
    if (footerEl) footerEl.classList.add('ai-hidden');
    renderStageCards();
  }

  function closeAnalysisModal() {
    const modal = $('#aiAnalysisModal');
    if (modal) modal.classList.add('ai-hidden');
  }

  function reopenAnalysisModal() {
    if (!_analysisCompleted) {
      console.log('[App] Analysis not yet completed, ignoring reopen');
      return;
    }
    const modal = $('#aiAnalysisModal');
    if (!modal) return;
    // Show the modal without resetting any state — keep all stage data intact
    modal.classList.remove('ai-hidden');
    // Ensure footer button is visible since analysis is done
    const footerEl = $('#aiAnalysisFooter');
    if (footerEl) footerEl.classList.remove('ai-hidden');
    // Switch to Stage 3 tab for final results view
    if (_stageTabUnlocked[2]) {
      switchStageTab(3);
    } else if (_stageTabUnlocked[1]) {
      switchStageTab(2);
    } else {
      switchStageTab(1);
    }
    console.log('[App] Reopened analysis modal');
  }

  // ── Update the sidebar process card summary ──
  function _updateAnalysisProcessCard() {
    const card = $('#aiAnalysisProcessCard');
    if (!card) return;

    // Count stage results from uploaded files
    const stage1Pass = uploadedFiles.filter(f => f.stage1Status === 'pass').length;
    const stage1Fail = uploadedFiles.filter(f => f.stage1Status === 'fail').length;
    const stage2Pass = uploadedFiles.filter(f => f.stage2Status === 'pass').length;
    const stage2Dup = uploadedFiles.filter(f => f.stage2Status === 'duplicate').length;
    const stage3Done = uploadedFiles.filter(f => f.compareStatus === 'done').length;
    const stage3Error = uploadedFiles.filter(f => f.compareStatus === 'error').length;

    // Determine Stage 1 summary
    const s1El = $('#aiProcessStage1');
    if (s1El) {
      if (stage1Pass + stage1Fail === 0) {
        s1El.textContent = '等待中';
        s1El.className = 'ai-analysis-process-value pending';
      } else if (stage1Fail > 0) {
        s1El.textContent = `${stage1Pass} 通过 · ${stage1Fail} 未通过`;
        s1El.className = 'ai-analysis-process-value warning';
      } else {
        s1El.textContent = `${stage1Pass} 通过 ✓`;
        s1El.className = 'ai-analysis-process-value pass';
      }
    }

    // Determine Stage 2 summary
    const s2El = $('#aiProcessStage2');
    if (s2El) {
      if (stage2Pass + stage2Dup === 0) {
        s2El.textContent = '等待中';
        s2El.className = 'ai-analysis-process-value pending';
      } else if (stage2Dup > 0) {
        s2El.textContent = `${stage2Pass} 通过 · ${stage2Dup} 重复`;
        s2El.className = 'ai-analysis-process-value warning';
      } else {
        s2El.textContent = `${stage2Pass} 通过 ✓`;
        s2El.className = 'ai-analysis-process-value pass';
      }
    }

    // Determine Stage 3 summary
    const s3El = $('#aiProcessStage3');
    if (s3El) {
      if (stage3Done === 0 && stage3Error === 0) {
        s3El.textContent = '等待中';
        s3El.className = 'ai-analysis-process-value pending';
      } else if (stage3Error > 0) {
        s3El.textContent = `${stage3Done} 完成 · ${stage3Error} 失败`;
        s3El.className = 'ai-analysis-process-value warning';
      } else {
        const savedCount = Object.values(_libSaveResults).filter(v => v === 'success').length;
        if (savedCount > 0) {
          s3El.textContent = `${stage3Done} 完成 · ${savedCount} 已入库 ✓`;
        } else {
          s3El.textContent = `${stage3Done} 完成 ✓`;
        }
        s3El.className = 'ai-analysis-process-value pass';
      }
    }
  }

  function renderStageCards() {
    const tabsEl = $('#aiStageTabs');
    const body = $('#aiAnalysisBody');
    if (!body) return;

    const stages = [
      { num: 1, title: '图片自校验', desc: '条码扫描数字与印刷数字比对，验证图片真实性' },
      { num: 2, title: '交叉比对', desc: '上传图片之间两两比对，排除重复上传' },
      { num: 3, title: '入库比对', desc: '预入库图片与图库比对，判断是否可入库' }
    ];

    // Render tab bar
    if (tabsEl) {
      tabsEl.innerHTML = stages.map((s, i) => {
        const unlocked = _stageTabUnlocked[i];
        const isActive = i === 0;
        const cls = isActive ? 'active' : (!unlocked ? 'locked' : '');
        const badge = isActive ? '<span class="ai-stage-tab-badge running">处理中</span>'
          : (!unlocked ? '<span class="ai-stage-tab-badge">等待</span>' : '');
        return `
          <button class="ai-stage-tab ${cls}" id="aiStageTab${s.num}" data-stage="${s.num}"
            ${!unlocked ? 'disabled' : ''} onclick="UI.switchStageTab(${s.num})">
            <span class="ai-stage-tab-num">${s.num}</span>
            <span>${s.title}</span>
            ${badge}
          </button>`;
      }).join('');
    }

    // Render stage cards — only first one visible initially
    body.innerHTML = stages.map((s, i) => `
      <div class="ai-stage-card${i === 0 ? ' visible active' : ''}" id="aiStageCard${s.num}">
        <div class="ai-stage-card-header">
          <div class="ai-stage-number">${s.num}</div>
          <div class="ai-stage-title">${s.title}</div>
          <span class="ai-stage-status ${i === 0 ? 'running' : 'waiting'}" id="aiStageStatus${s.num}">${i === 0 ? '处理中' : '等待中'}</span>
          <span class="ai-stage-count" id="aiStageCount${s.num}"></span>
        </div>
        <div class="ai-stage-card-body" id="aiStageBody${s.num}">
          <div class="ai-stage-empty">${s.desc}</div>
        </div>
      </div>
    `).join('');
  }

  // Ensure ONLY the given stage card is visible; hide all others
  function _showOnlyCard(stageNum) {
    document.querySelectorAll('#aiAnalysisBody .ai-stage-card').forEach(c => {
      c.classList.remove('visible');
    });
    const card = $(`#aiStageCard${stageNum}`);
    if (card) card.classList.add('visible');
  }

  function switchStageTab(stageNum) {
    if (!_stageTabUnlocked[stageNum - 1]) {
      console.log('[App] Tab', stageNum, 'is locked, ignoring click');
      return;
    }

    const targetTab = $(`#aiStageTab${stageNum}`);
    const targetCard = $(`#aiStageCard${stageNum}`);
    if (!targetTab || !targetCard) {
      console.warn('[App] Tab or card not found for stage', stageNum);
      return;
    }

    // Deactivate all tabs
    document.querySelectorAll('#aiStageTabs .ai-stage-tab').forEach(t => t.classList.remove('active'));
    // Activate selected tab
    targetTab.classList.add('active');
    // Show only target card
    _showOnlyCard(stageNum);

    const modalBody = $('#aiAnalysisBody');
    if (modalBody) modalBody.scrollTop = 0;

    console.log('[App] Switched to stage tab', stageNum);
  }

  function _renderStageItems(stageNum, images) {
    const body = $(`#aiStageBody${stageNum}`);
    const countEl = $(`#aiStageCount${stageNum}`);
    if (!body) return;

    if (!images || images.length === 0) {
      body.innerHTML = '<div class="ai-stage-empty">暂无图片</div>';
      return;
    }

    if (countEl) countEl.textContent = `${images.length} 张`;

    body.innerHTML = images.map(img => {
      const thumbHtml = img.base64
        ? `<img class="ai-stage-item-thumb" src="${img.base64}" alt="${img.name}" onclick="App.previewStageImage(this.src)" title="点击放大">`
        : '<div class="ai-stage-item-thumb ai-stage-item-thumb-empty"></div>';

      let infoHtml = '';
      let resultHtml = '';
      let resultCls = '';
      let timeHtml = '';

      if (stageNum === 1) {
        timeHtml = img.stage1TimeMs != null
          ? `<span class="ai-stage-time">${(img.stage1TimeMs / 1000).toFixed(1)}s</span>`
          : '';
        if (img.type === 'barcode' && img.barcodeInfo) {
          const bi = img.barcodeInfo;
          const scanMethodMap = {
            'BarcodeDetector': '浏览器原生',
            'ZXing': 'ZXing 库',
            'glm_fallback': '⚠ AI 解码',
            'none': '失败',
            'glm': 'AI 解码'
          };
          const scanMethodLabel = scanMethodMap[bi.scanMethod] || bi.scanMethod || '--';
          const scanWarnCls = (bi.scanMethod === 'glm_fallback' || bi.scanMethod === 'glm') ? ' ai-stage-fail' : '';
          infoHtml = `
            <div class="ai-detail-grid">
              <div class="ai-detail-cell">
                <span class="ai-detail-cell-label">扫描数字</span>
                <strong class="ai-detail-cell-value">${bi.scannedNumbers || '--'}</strong>
              </div>
              <div class="ai-detail-cell">
                <span class="ai-detail-cell-label">印刷数字</span>
                <strong class="ai-detail-cell-value">${bi.printedNumbers || '--'}</strong>
              </div>
              <div class="ai-detail-cell">
                <span class="ai-detail-cell-label">扫描方式</span>
                <strong class="ai-detail-cell-value${scanWarnCls}">${scanMethodLabel}</strong>
              </div>
            </div>`;
          if (img.stage1Status === 'fail') {
            resultHtml = '✗ 不一致';
            resultCls = 'ai-stage-fail';
          } else if (img.stage1Status === 'pass') {
            resultHtml = '✓ 一致';
            resultCls = 'ai-stage-pass';
          }
        } else if (img.type === 'photo') {
          infoHtml = '<span class="ai-stage-inline-status ai-stage-pass">实物照片，无需自校验</span>';
          resultHtml = '✓ 通过';
          resultCls = 'ai-stage-pass';
        } else {
          infoHtml = '<span class="ai-stage-inline-status ai-stage-progress">识别中...</span>';
          resultHtml = '...';
          resultCls = 'ai-stage-progress';
        }
      } else if (stageNum === 2) {
        timeHtml = img.stage1TimeMs != null
          ? `<span class="ai-stage-time">${(img.stage1TimeMs / 1000).toFixed(1)}s</span>`
          : '';
        if (img.stage2Status === 'duplicate') {
          const dupOf = (img.compareResults || []).find(r => r.source === 'internal_cross_check');
          infoHtml = `<span class="ai-stage-inline-status ai-stage-dup">${dupOf ? dupOf.reason : '重复图片，已排除'}</span>`;
          resultHtml = '🔄 重复';
          resultCls = 'ai-stage-dup';
        } else if (img.stage2Status === 'pass') {
          infoHtml = '<span class="ai-stage-inline-status ai-stage-pass">唯一图片，无重复</span>';
          resultHtml = '✓ 通过';
          resultCls = 'ai-stage-pass';
        } else {
          infoHtml = '<span class="ai-stage-inline-status ai-stage-progress">等待比对...</span>';
          resultHtml = '...';
          resultCls = 'ai-stage-progress';
        }
      } else if (stageNum === 3) {
        timeHtml = img.stage3TimeMs != null
          ? `<span class="ai-stage-time">${(img.stage3TimeMs / 1000).toFixed(1)}s</span>`
          : '';
        const saveResult = _libSaveResults[img.id];
        let saveLabel = '';
        let saveCls = '';
        if (saveResult === 'success') { saveLabel = '✓ 已入库'; saveCls = 'ai-stage-pass'; }
        else if (saveResult === 'failed') { saveLabel = '✗ 入库失败'; saveCls = 'ai-stage-fail'; }
        else if (saveResult === 'existing') { saveLabel = '— 入库失败（已存在）'; saveCls = 'ai-stage-dup'; }
        else if (saveResult === 'skipped') { saveLabel = '— 未入库'; saveCls = 'ai-stage-dup'; }

        if (img.compareStatus === 'done') {
          const suspicious = (img.compareResults || []).filter(r =>
            r.is_suspicious && (!r.source || (r.source !== 'internal_cross_check' && r.source !== 'barcode_self_validate'))
          );
          if (suspicious.length > 0) {
            infoHtml = `<span class="ai-stage-inline-status ai-stage-match">⚠ ${suspicious[0].reason || '发现可疑匹配'}</span>${saveLabel ? ` <span class="ai-stage-inline-status ${saveCls}">${saveLabel}</span>` : ''}`;
            resultHtml = '⚠ 可疑';
            resultCls = 'ai-stage-match';
          } else {
            infoHtml = `${saveLabel ? `<span class="ai-stage-inline-status ${saveCls}">${saveLabel}</span>` : '<span class="ai-stage-inline-status ai-stage-pass">未发现匹配</span>'}`;
            resultHtml = '✓ 可入库';
            resultCls = 'ai-stage-pass';
          }
        } else if (img.compareStatus === 'error') {
          infoHtml = `<span class="ai-stage-inline-status ai-stage-fail">${img.error || '比对失败'}</span>`;
          resultHtml = '✗ 失败';
          resultCls = 'ai-stage-fail';
        } else {
          infoHtml = '<span class="ai-stage-inline-status ai-stage-progress">比对中...</span>';
          resultHtml = '...';
          resultCls = 'ai-stage-progress';
        }
      }

      return `
        <div class="ai-stage-item">
          ${thumbHtml}
          <div class="ai-stage-item-name" title="${img.name}">${img.name}</div>
          <div class="ai-stage-item-info">
            ${infoHtml}
          </div>
          <div class="ai-stage-item-result ${resultCls}">${resultHtml}</div>
          ${timeHtml}
        </div>`;
    }).join('');
  }

  function updateStageCard(stageNum, status, data) {
    _currentStage = stageNum;
    const card = $(`#aiStageCard${stageNum}`);
    const statusEl = $(`#aiStageStatus${stageNum}`);
    const tabEl = $(`#aiStageTab${stageNum}`);
    const progressEl = $('#aiAnalysisProgress');
    if (!card || !statusEl) return;

    if (status === 'running') {
      _stageTimers[stageNum] = Date.now();
      _showOnlyCard(stageNum);
      card.className = 'ai-stage-card visible active';
      statusEl.textContent = '处理中';
      statusEl.className = 'ai-stage-status running';
      if (progressEl) progressEl.textContent = `阶段 ${stageNum}/3 · 处理中`;

      // Update tab badge
      if (tabEl) {
        const badge = tabEl.querySelector('.ai-stage-tab-badge');
        if (badge) { badge.textContent = '处理中'; badge.className = 'ai-stage-tab-badge running'; }
      }

      // Auto-switch to current stage tab
      switchStageTab(stageNum);
    } else if (status === 'skipped') {
      const reason = (data && data.reason) ? data.reason : '前置阶段无图片通过，跳过';
      _showOnlyCard(stageNum);
      card.className = 'ai-stage-card visible skipped';
      statusEl.textContent = '已跳过';
      statusEl.className = 'ai-stage-status skipped';
      if (progressEl && stageNum === 2) progressEl.textContent = `阶段 2/3 · 已跳过`;
      if (progressEl && stageNum === 3) progressEl.textContent = `阶段 3/3 · 已跳过`;

      // Update tab: unlock but mark as skipped
      _stageTabUnlocked[stageNum - 1] = true;
      if (tabEl) {
        tabEl.classList.remove('locked');
        tabEl.classList.add('done');
        tabEl.disabled = false;
        const badge = tabEl.querySelector('.ai-stage-tab-badge');
        if (badge) { badge.textContent = '跳过'; badge.className = 'ai-stage-tab-badge warning'; }
      }

      // Update body with skip reason
      const bodyEl = $(`#aiStageBody${stageNum}`);
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="ai-stage-empty">⏭ ${reason}</div>`;
      }

      // Last stage was skipped — show footer button
      if (stageNum === 3) {
        const footerEl = $('#aiAnalysisFooter');
        if (footerEl) footerEl.classList.remove('ai-hidden');
      }
    } else if (status === 'done') {
      const elapsed = _stageTimers[stageNum]
        ? ((Date.now() - _stageTimers[stageNum]) / 1000).toFixed(1) + 's'
        : '';
      card.classList.remove('active');
      card.classList.add('done');

      const failed = data ? (data.failed || []).length : 0;
      const duplicated = data ? (data.duplicated || []).length : 0;

      // Update tab appearance
      if (tabEl) {
        tabEl.classList.remove('active');
        const badge = tabEl.querySelector('.ai-stage-tab-badge');
        if (failed > 0 || duplicated > 0) {
          card.classList.add('warning');
          statusEl.textContent = `完成${elapsed ? ' · ' + elapsed : ''}（有预警）`;
          statusEl.className = 'ai-stage-status has-warning';
          if (badge) { badge.textContent = '有预警'; badge.className = 'ai-stage-tab-badge warning'; }
          tabEl.classList.add('done');
        } else {
          statusEl.textContent = `通过${elapsed ? ' · ' + elapsed : ''}`;
          statusEl.className = 'ai-stage-status success';
          if (badge) { badge.textContent = '通过'; badge.className = 'ai-stage-tab-badge done'; }
          tabEl.classList.add('done');
        }
      }

      if (progressEl) progressEl.textContent = `阶段 ${stageNum}/3 · 完成`;

      // Populate results
      if (data && data.all) {
        _renderStageItems(stageNum, data.all);
      }

      // Unlock and auto-switch to next stage
      if (stageNum < 3) {
        _stageTabUnlocked[stageNum] = true;
        const nextCard = $(`#aiStageCard${stageNum + 1}`);
        const nextStatus = $(`#aiStageStatus${stageNum + 1}`);
        const nextTab = $(`#aiStageTab${stageNum + 1}`);

        if (nextTab) {
          nextTab.classList.remove('locked');
          nextTab.classList.add('active');
          nextTab.disabled = false;
          const badge = nextTab.querySelector('.ai-stage-tab-badge');
          if (badge) { badge.textContent = '处理中'; badge.className = 'ai-stage-tab-badge running'; }
        }
        if (nextCard) {
          _showOnlyCard(stageNum + 1);
          nextCard.classList.add('active');
        }
        if (nextStatus) {
          nextStatus.textContent = '处理中';
          nextStatus.className = 'ai-stage-status running';
        }
      }

      // Last stage completed or analysis terminating — show footer button
      if (stageNum === 3) {
        const footerEl = $('#aiAnalysisFooter');
        if (footerEl) footerEl.classList.remove('ai-hidden');
      }
    }

    // Scroll modal body to top when switching stages
    const modalBody = $('#aiAnalysisBody');
    if (modalBody) modalBody.scrollTop = 0;

    // Update sidebar process card summary
    _updateAnalysisProcessCard();
  }

  // ── Analysis Flow ───────────────────────────────────────

  async function startAnalysis() {
    const configured = await AuditAPI.isConfigured();
    if (!configured) {
      const panel = $('#aiConfigPanel');
      if (panel) panel.classList.remove('ai-hidden');
      addLog('error', '请先配置 API Key（API Key 存储在服务器端，请通过 API 配置面板设置）');
      return;
    }
    if (uploadedFiles.length === 0) return;

    // Open analysis modal
    openAnalysisModal();

    // Wire progress callbacks
    engine._onLog = addLog;
    engine._onImageUpdate = (img, idx) => {
      const realIdx = uploadedFiles.findIndex(f => f.id === img.id);
      if (realIdx !== -1) uploadedFiles[realIdx] = img;
      renderReviewList();
      // Incrementally update current stage card during Stage 1 & Stage 3
      if (_currentStage === 1 && img.stage1Status) {
        const stage1Images = uploadedFiles.filter(f => f.stage1Status);
        _renderStageItems(1, stage1Images);
      }
      if (_currentStage === 3 && img.compareStatus === 'done') {
        const stage3Images = uploadedFiles.filter(f =>
          f.stage2Status === 'pass' && f.stage1Status !== 'fail'
        );
        _renderStageItems(3, stage3Images);
      }
    };
    engine._onStageChange = (stageNum, status, data) => {
      updateStageCard(stageNum, status, data);
    };

    // Start processing timer
    _startProcessingTimer();

    // Record whether library was empty before analysis
    const libWasEmpty = (await lib.getCount()) === 0;
    console.log('[App] Starting analysis. Library was empty:', libWasEmpty, 'Uploaded files:', uploadedFiles.length);

    try {
      const result = await engine.runAnalysis(uploadedFiles);
      console.log('[App] Analysis complete. Summary:', result.summary);

      // Auto-save only images that passed all stages
      await autoSaveToLibrary(libWasEmpty);

      // Refresh review list to show warehouse success notifications
      renderReviewList();

      // Update Stage 3 card with入库结果
      const stage3All = uploadedFiles.filter(f =>
        f.stage2Status === 'pass' && f.stage1Status !== 'fail'
      );
      _renderStageItems(3, stage3All);

      // Update analysis process card in sidebar
      _analysisCompleted = true;
      const badge = $('#aiAnalysisProcessBadge');
      if (badge) { badge.textContent = '已完成'; badge.className = 'ai-card-badge ai-analysis-process-badge'; }
      _updateAnalysisProcessCard();

      showReport(result.report, result.summary);

      // Show "View Report" button at bottom of analysis modal
      const footerEl = $('#aiAnalysisFooter');
      if (footerEl) footerEl.classList.remove('ai-hidden');
    } catch (e) {
      console.error('[App] Analysis error:', e);
      addLog('error', `分析异常中断: ${e.message}`);
      try { await autoSaveToLibrary(libWasEmpty); renderReviewList(); } catch (_) { /* ignore */ }

      // Update process card — partial results are available
      _analysisCompleted = true;
      const badge2 = $('#aiAnalysisProcessBadge');
      if (badge2) { badge2.textContent = '已完成'; badge2.className = 'ai-card-badge ai-analysis-process-badge'; }
      _updateAnalysisProcessCard();

      // Generate a basic report from whatever partial results we have
      try {
        const completedImages = uploadedFiles.filter(f => f.compareStatus === 'done' || f.compareStatus === 'error');
        if (completedImages.length > 0) {
          const summary = engine._buildReportSummary(uploadedFiles);
          const report = engine._buildBasicReport(summary);
          showReport(report, summary);
        }
      } catch (_) { /* ignore */ }

      // Still show the button even on error
      const footerEl = $('#aiAnalysisFooter');
      if (footerEl) footerEl.classList.remove('ai-hidden');
    } finally {
      _stopProcessingTimer();
    }
  }

  function viewReportFromModal() {
    // Close analysis modal, scroll to report
    closeAnalysisModal();
    const reportSection = $('#aiReportSection');
    if (reportSection) {
      reportSection.classList.remove('ai-hidden');
      reportSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function updateBarcodeComparePanel(img) {
    const panel = $('#aiBarcodeDetail');
    if (!panel) return;
    if (!img || img.type !== 'barcode' || !img.barcodeInfo) {
      panel.classList.add('ai-hidden');
      return;
    }
    panel.classList.remove('ai-hidden');
    const info = img.barcodeInfo;

    const thumb = $('#aiBarcodeThumb');
    if (thumb) thumb.src = img.base64;
    const nameEl = $('#aiBarcodeDetailName');
    if (nameEl) nameEl.textContent = img.name;

    const scannedEl = $('#aiBarcodeScanned');
    if (scannedEl) scannedEl.textContent = info.scannedNumbers || '--';

    const printedEl = $('#aiBarcodePrinted');
    if (printedEl) printedEl.textContent = info.printedNumbers || '--';

    const resultEl = $('#aiBarcodeResult');
    if (resultEl) {
      if (info.numbersMatch === true) {
        resultEl.textContent = '✓ 数字一致，比对通过';
        resultEl.className = 'ai-barcode-detail-value ai-barcode-result-pass';
      } else if (info.numbersMatch === false) {
        resultEl.textContent = '✗ 数字不一致，疑似篡改';
        resultEl.className = 'ai-barcode-detail-value ai-barcode-result-fail';
      } else {
        resultEl.textContent = '扫描中...';
        resultEl.className = 'ai-barcode-detail-value';
      }
    }
  }

  function updateProcessingUI(img) {
    const statusEl = $('#aiAgentStatus');
    if (statusEl) {
      const done = uploadedFiles.filter(f => f.compareStatus === 'done' || f.compareStatus === 'error').length;
      statusEl.textContent = `识别与对比: ${done}/${uploadedFiles.length} 完成`;
    }
    if (img) {
      const nameEl = $('#aiFileName');
      const sizeEl = $('#aiFileSize');
      if (nameEl) nameEl.textContent = img.name;
      if (sizeEl) sizeEl.textContent = img.typeDescription || '';

      // Update barcode compare panel if applicable
      if (img.type === 'barcode') {
        updateBarcodeComparePanel(img);
      }
    }
    // Update processing time
    const timeEl = $('#aiProcessingTime');
    if (timeEl && _analysisStartTime) {
      const elapsed = Math.floor((Date.now() - _analysisStartTime) / 1000);
      timeEl.textContent = `已处理: ${elapsed}s`;
    }
  }

  function _startProcessingTimer() {
    _analysisStartTime = Date.now();
    _analysisTimer = setInterval(() => updateProcessingUI(null), 1000);
  }

  function _stopProcessingTimer() {
    if (_analysisTimer) {
      clearInterval(_analysisTimer);
      _analysisTimer = null;
    }
    _analysisStartTime = null;
  }

  // ── Report Display ──────────────────────────────────────

  function showReport(reportMarkdown, summary) {
    const section = $('#aiReportSection');
    if (section) section.classList.remove('ai-hidden');

    // Build report content
    const total = summary.totalUploaded;
    const suspiciousCount = summary.suspiciousItems.length;
    const high = summary.stats.high;
    const medium = summary.stats.medium;
    const low = summary.stats.low;

    const insightEl = $('#aiInsightContent');
    if (insightEl) {
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

      // Suspicious items list (before AI report)
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

      // AI-generated report content
      html += '<div class="ai-report-section-title"><i class="fas fa-robot"></i> AI分析报告</div>';
      html += '<div class="ai-report-body">';
      html += markdownToHTML(reportMarkdown);
      html += '</div>';

      insightEl.innerHTML = html;
    }

    // Update subtitle
    const subtitleEl = section ? section.querySelector('.ai-report-subtitle') : null;
    if (subtitleEl) {
      subtitleEl.textContent = `分析完成 · 上传${total}张 · 可疑${suspiciousCount}项 · 高风险${high}项`;
    }

    // Update stat numbers in report stats section
    if (section) {
      const statValues = section.querySelectorAll('.ai-stat-value');
      if (statValues.length >= 4) {
        statValues[0].textContent = high;
        statValues[1].textContent = medium;
        statValues[2].textContent = total - suspiciousCount;
        statValues[3].textContent = total;
      }
    }
  }

  function markdownToHTML(md) {
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Convert tables
    html = html.replace(/\n(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, rows) => {
      const headers = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const bodyRows = rows.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `\n<table class="ai-report-table"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table>\n`;
    });

    html = html
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n- (.+)/g, '\n<li>$1</li>')
      .replace(/\n\d+\. (.+)/g, '\n<li>$1</li>');

    // Wrap paragraphs — split on double newlines, wrap non-tag blocks in <p>
    html = html.split(/\n\n+/).map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h') || block.startsWith('<table') || block.startsWith('<div')) return block;
      if (block.includes('<li>')) return '<ul>' + block + '</ul>';
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    return html;
  }

  // ── Logging ─────────────────────────────────────────────

  function addLog(level, message) {
    const logEl = $('#aiProcessingLog');
    if (!logEl) return;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const cls = level === 'success' ? 'ai-log-success'
      : level === 'warning' ? 'ai-log-warning'
      : level === 'error' ? 'ai-log-error'
      : 'ai-log-info';
    logEl.innerHTML += `<div class="ai-log-entry ${cls}">[${time}] ${message}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    const logEl = $('#aiProcessingLog');
    if (logEl) {
      logEl.innerHTML = '<div class="ai-log-entry ai-log-info">[系统] AI审计分析引擎已启动...</div>';
    }
  }

  // ── Video Analysis Modal ──────────────────────────────────

  const VideoAnalysisModal = {
    _file: null,
    _url: null,
    _frames: [],       // [{ id, base64, timestamp, result, error }]
    _currentResultIdx: 0,
    _lastFile: null,   // preserve file reference so user can reopen after closing

    open(file) {
      // Revoke previous URL if any (e.g. reopening)
      if (this._url) {
        URL.revokeObjectURL(this._url);
        this._url = null;
      }

      this._file = file;
      this._lastFile = file;
      this._url = URL.createObjectURL(file);
      this._frames = [];
      this._currentResultIdx = 0;

      const video = $('#aiVideoPlayer');

      // ── Step 1: clear all handlers FIRST (prevent stale callbacks) ──
      video.onerror = null;
      video.onloadedmetadata = null;
      video.ontimeupdate = null;
      video.oncanplay = null;
      video.onemptied = null;

      // ── Step 2: fully reset video element (src='' + load) ──
      video.pause();
      video.src = '';
      video.load();

      // ── Step 3: set new source AFTER reset is processed ──
      // Using a microtask ensures the browser has processed the empty src
      // before assigning the new blob URL, preventing error-state lockup.
      Promise.resolve().then(() => {
        video.src = this._url;
        video.load();
      });

      // ── Step 4: assign fresh handlers ──
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
      // Clear handlers FIRST so load() with empty src doesn't trigger error callbacks
      video.onerror = null;
      video.onloadedmetadata = null;
      video.ontimeupdate = null;
      video.oncanplay = null;
      video.onemptied = null;
      video.pause();
      video.src = '';
      video.load();
      $('#aiVideoModal').classList.add('ai-hidden');
    },

    // Reopen the last video that was closed (no file picker needed)
    reopenLast() {
      if (this._lastFile) {
        this.open(this._lastFile);
      }
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
      // Limit max dimension to 1920px to keep base64 payload manageable for API
      const MAX_DIM = 1920;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);

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
      const configured = await AuditAPI.isConfigured();
      if (!configured) {
        alert('请先配置 API Key（API Key 存储在服务器端）');
        const panel = $('#aiConfigPanel');
        if (panel) panel.classList.remove('ai-hidden');
        return;
      }

      this._showView('analyzing');
      const config = await AuditAPI.loadConfig();

      for (let i = 0; i < this._frames.length; i++) {
        const frame = this._frames[i];
        $('#aiVideoAnalyzeProgress').textContent = `正在分析第 ${i + 1}/${this._frames.length} 张截帧...`;

        try {
          const messages = [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: frame.base64 } },
              { type: 'text', text: '这是一张航拍图片。请统计图片中机动车的数量（包括轿车、货车、渣土车、搅拌车、公交车等各类车辆）。\n\n请仅返回JSON（不要其他内容，每辆车描述控制在8个字以内）：\n{"count": 数字, "vehicles": [{"id": 序号, "type": "车辆类型", "pos": "简短位置"}]}' }
            ]
          }];
          const result = await AuditAPI._callAPI(messages, config, 0, { maxTokens: 2048 });
          console.log('[VideoAnalysis] API response:', result);
          // Parse JSON from result, stripping markdown fences if present
          const clean = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const jsonMatch = clean.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              frame.result = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
              // JSON may be truncated due to token limit — try to recover partial data
              console.warn('[VideoAnalysis] JSON parse failed, trying recovery:', parseErr.message);
              const recovered = jsonMatch[0] + ']}';
              try { frame.result = JSON.parse(recovered); }
              catch (_) { frame.error = '模型响应过长被截断，请截取包含更少车辆的画面重试'; }
            }
          } else {
            frame.result = { count: 0, vehicles: [], raw: result };
          }
          console.log('[VideoAnalysis] Parsed result:', frame.result);
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
        $('#aiVideoResultVehicles').innerHTML = `<div style="color:var(--ai-color-red);font-size:0.75rem;">分析失败: ${this._escapeHtml(frame.error)}</div>`;
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
            <strong>#${v.id} ${this._escapeHtml(v.type || '')}</strong>${v.pos ? ' · ' + this._escapeHtml(v.pos) : ''}${v.color ? ' · ' + this._escapeHtml(v.color) : ''}${v.status ? ' · ' + this._escapeHtml(v.status) : ''}
          </div>`
        ).join('');
      }
    },

    _escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    backToCapture() {
      this._showView('capture');
      this._renderFrameList();
    },

    _showView(name) {
      $('#aiVideoCaptureView').classList.toggle('ai-hidden', name !== 'capture');
      $('#aiVideoAnalyzingView').classList.toggle('ai-hidden', name !== 'analyzing');
      $('#aiVideoResultView').classList.toggle('ai-hidden', name !== 'result');
    }
  };

  // Expose globally for onclick handlers in HTML
  window.VideoAnalysisModal = VideoAnalysisModal;

  // ── Global API (for onclick handlers) ───────────────────

  window.App = {
    removeFile(id) {
      uploadedFiles = uploadedFiles.filter(f => f.id !== id);
      renderUploadPreview();
      renderReviewList();
      updateAnalyzeButton();
    },
    previewUpload(id) {
      const file = uploadedFiles.find(f => f.id === id);
      if (file && file.base64) {
        const modalImg = $('#aiPreviewImage');
        const modal = $('#aiImageModal');
        if (modalImg) modalImg.src = file.base64;
        if (modal) modal.classList.remove('ai-hidden');
      }
    },
    async deleteLibImage(id) {
      await lib.deleteImage(id);
      renderLibrary();
    },
    previewStageImage(src) {
      const modalImg = $('#aiPreviewImage');
      const modal = $('#aiImageModal');
      if (modalImg) modalImg.src = src;
      if (modal) modal.classList.remove('ai-hidden');
    },
    async previewLibImage(id) {
      const images = await lib.getAllImages();
      const img = images.find(i => i.id === id);
      if (img) {
        const modalImg = $('#aiPreviewImage');
        const modal = $('#aiImageModal');
        if (modalImg) modalImg.src = img.base64;
        if (modal) modal.classList.remove('ai-hidden');
      }
    },
    startAnalysis
  };

  // Patch legacy UI object for existing onclick handlers in HTML
  window.UI = window.UI || {};
  window.UI.closePreview = () => {
    const modal = $('#aiImageModal');
    if (modal) modal.classList.add('ai-hidden');
  };
  window.UI.closeResultModal = () => {
    const modal = $('#aiResultModal');
    if (modal) modal.classList.add('ai-hidden');
  };
  window.UI.closeAnalysisModal = closeAnalysisModal;
  window.UI.reopenAnalysisModal = reopenAnalysisModal;
  window.UI.switchStageTab = switchStageTab;
  window.UI.viewReportFromModal = viewReportFromModal;
  window.UI.exportReport = () => {
    const content = $('#aiInsightContent');
    if (!content) return;
    const blob = new Blob([content.innerText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `审计报告_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // Legacy preview handler
  window.UI.previewFile = (id) => {
    window.App.previewUpload(id);
  };

  // ── Event Bindings ──────────────────────────────────────

  function bindEvents() {
    // Upload zone
    const uploadArea = $('#aiUploadArea');
    const fileInput = $('#aiFileInput');
    if (uploadArea) {
      uploadArea.addEventListener('click', () => { if (fileInput) fileInput.click(); });
      uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('ai-dragover'); });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('ai-dragover'));
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('ai-dragover');
        handleFileSelect(e.dataTransfer.files);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files);
        e.target.value = ''; // reset so the same file can be re-selected
      });
    }

    // Clear all files
    const clearBtn = $('#aiClearAllFiles');
    if (clearBtn) clearBtn.addEventListener('click', clearAllFiles);

    // Start analysis
    const startBtn = $('#aiStartAnalysisBtn');
    if (startBtn) startBtn.addEventListener('click', startAnalysis);

    // Config toggle
    const configToggle = $('#aiConfigToggleBtn');
    if (configToggle) {
      configToggle.addEventListener('click', () => {
        const panel = $('#aiConfigPanel');
        if (panel) panel.classList.toggle('ai-hidden');
      });
    }

    // Config save
    const configSave = $('#aiConfigSaveBtn');
    if (configSave) {
      configSave.addEventListener('click', async () => {
        try {
          await saveConfig();
          const panel = $('#aiConfigPanel');
          if (panel) panel.classList.add('ai-hidden');
          addLog('success', '配置已保存到服务器');
        } catch (e) {
          addLog('error', `配置保存失败: ${e.message}`);
        }
      });
    }

    // Library upload
    const addToLibBtn = $('#aiAddToLibBtn');
    const libFileInput = $('#aiLibFileInput');
    if (addToLibBtn && libFileInput) {
      addToLibBtn.addEventListener('click', () => libFileInput.click());
      libFileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        for (const f of files) {
          if (!f.type.startsWith('image/')) continue;
          try {
            await lib.addImage(f);
          } catch (err) {
            addLog('error', `添加基准图失败: ${f.name} - ${err.message}`);
          }
        }
        renderLibrary();
        libFileInput.value = '';
        addLog('success', `已添加 ${files.length} 张图片到基准库`);
      });
    }

    // Report action buttons
    const uploadAnother = $('#aiUploadAnother');
    if (uploadAnother) {
      uploadAnother.addEventListener('click', () => {
        uploadedFiles = [];
        _analysisCompleted = false;
        _libSaveResults = {};
        renderUploadPreview();
        renderReviewList();
        const reportSection = $('#aiReportSection');
        const uploadSection = $('#aiUploadSection');
        if (reportSection) reportSection.classList.add('ai-hidden');
        if (uploadSection) uploadSection.classList.remove('ai-hidden');
        // Reset process card to waiting state
        const badge3 = $('#aiAnalysisProcessBadge');
        if (badge3) { badge3.textContent = '等待中'; badge3.className = 'ai-card-badge ai-analysis-process-badge waiting'; }
        _updateAnalysisProcessCard();
      });
    }

    const refreshBtn = $('#aiRefreshPage');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        const reportSection = $('#aiReportSection');
        const uploadSection = $('#aiUploadSection');
        if (reportSection) reportSection.classList.add('ai-hidden');
        if (uploadSection) uploadSection.classList.remove('ai-hidden');
        startAnalysis();
      });
    }
  }

  // ── Boot ────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);
})();
