# 三阶段分析模态窗口 — COMPLETED

## Context

用户要求点击"开始AI审计分析"后，弹出独立的分析过程展示窗口，不引用原有窗口。窗口分三个阶段清晰展示分析过程，每阶段处理完成后，合格图片进入下一阶段。

## Implementation Status: DONE

All four files have been modified and the implementation is complete.

### 1. `audit_agent.html` ✓
- Added `aiAnalysisModal` modal HTML (lines 676-694) with header, progress indicator, close button, and `aiAnalysisBody` container

### 2. `css/styles.css` ✓
- Added all stage card styles (lines 2816-3013):
  - `.ai-analysis-modal-content` — wide modal (max-width: 1000px)
  - `.ai-stage-card` / `.ai-stage-card.active/.done/.warning`
  - `.ai-stage-card-header`, `.ai-stage-number`, `.ai-stage-title`, `.ai-stage-status`
  - `.ai-stage-card-body`, `.ai-stage-empty`
  - `.ai-stage-item`, `.ai-stage-item-thumb`, `.ai-stage-item-info`, `.ai-stage-item-detail`, `.ai-stage-item-result`
  - Status colors: `.ai-stage-pass` (green), `.ai-stage-fail` (red), `.ai-stage-dup` (yellow), `.ai-stage-match` (red), `.ai-stage-progress` (cyan)

### 3. `js/analysis-engine.js` ✓
- Added `_onStageChange` callback in constructor
- `_phase1dot5aBarcodeSelfValidate`:
  - Non-barcode images auto-set `stage1Status = 'pass'`
  - Barcode images get `stage1Status = 'pass'` or `'fail'` based on validation
  - Error cases get `stage1Status = 'fail'`
- `_phase1dot5bCrossCheck`:
  - Second image of each duplicate pair gets `stage2Status = 'duplicate'`
  - After loop, all unmarked images get `stage2Status = 'pass'`
- `runAnalysis` rewritten with three-stage pipeline:
  - Stage callbacks at each phase transition
  - Filtering between stages (`stage1Passed`, `stage2Passed`)
  - Early termination if no images pass Stage 1 or Stage 2
  - Report generated from full `validated` array (covers all images)

### 4. `js/app.js` ✓
- `openAnalysisModal()` / `closeAnalysisModal()` — modal visibility control
- `renderStageCards()` — creates 3 stage card skeletons
- `updateStageCard(stageNum, status, data)` — populates cards with per-image results:
  - Stage 1: scanned vs printed numbers, pass/fail
  - Stage 2: unique vs duplicate
  - Stage 3: clean vs suspicious match
- `startAnalysis()` — opens modal, wires `_onStageChange` callback, uses id-based image lookup
- `autoSaveToLibrary()` — checks `stage1Status` and `stage2Status` in addition to comparison results
- `window.UI.closeAnalysisModal` exposed

## Verification

1. 点击"开始AI审计分析" → 弹出新模态窗口，显示三个阶段卡片
2. Stage 1 逐张处理条码 → 实时显示扫描数字、印刷数字、比对结果
3. Stage 1 失败的图片标记红色，不进入 Stage 2
4. Stage 2 展示交叉比对结果 → 重复图片标记黄色，仅第一张进入 Stage 3
5. Stage 3 展示库比对结果
6. 仅全阶段通过的图片自动入库
