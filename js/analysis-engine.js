// js/analysis-engine.js
class AnalysisEngine {
  constructor(imageLibrary) {
    this.lib = imageLibrary;
    this._onLog = null;
    this._onImageUpdate = null;
    this._onStageChange = null;
  }

  _log(level, message) {
    if (this._onLog) this._onLog(level, message);
  }

  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  // ── Phase 1: Type Identification ──────────────────────────

  async _phase1Identify(uploadedImages) {
    this._log('info', `开始类型识别，共 ${uploadedImages.length} 张图片`);

    for (let i = 0; i < uploadedImages.length; i++) {
      const img = uploadedImages[i];
      this._log('info', `[${i + 1}/${uploadedImages.length}] 识别 "${img.name}"...`);

      try {
        const result = await AuditAPI.identifyType(img.base64);
        img.type = result.type === 'A' ? 'photo' : (result.type === 'B' ? 'barcode' : 'unknown');
        img.typeDescription = result.description || '';
        img.quality = result.quality || '未知';
        img.compareStatus = 'pending';
        img.pipelineStage = 'identified';
        const hash = await this.lib._computePHash(img.base64);
        img.pHash = hash;
        this._log('success', `"${img.name}" 识别为 [${img.type === 'photo' ? '实物照片' : img.type === 'barcode' ? '条码' : '未知类型'}] - ${img.typeDescription}`);
      } catch (e) {
        img.type = 'unknown';
        img.compareStatus = 'error';
        img.error = e.message;
        this._log('error', `"${img.name}" 识别失败: ${e.message}`);
      }

      if (this._onImageUpdate) this._onImageUpdate(img, i);
    }
    return uploadedImages;
  }

  // ── Phase 1.5a: Barcode Self-Validation ─────────────────

  async _phase1dot5aBarcodeSelfValidate(classifiedImages) {
    const barcodeImages = classifiedImages.filter(
      img => img.type === 'barcode' && img.compareStatus !== 'error'
    );
    // Non-barcode images pass Stage 1 automatically
    for (const img of classifiedImages) {
      if (img.type !== 'barcode' && img.compareStatus !== 'error') {
        img.stage1Status = 'pass';
        const idx = classifiedImages.indexOf(img);
        if (this._onImageUpdate) this._onImageUpdate(img, idx);
      }
    }

    if (barcodeImages.length === 0) {
      this._log('info', '无条码图片，跳过条码自校验');
      return classifiedImages;
    }

    this._log('info', `开始条码自校验（本地扫描 + 印刷数字比对），共 ${barcodeImages.length} 张条码`);

    for (const img of barcodeImages) {
      const t0 = Date.now();
      img.compareStatus = 'self_check';
      img.pipelineStage = 'self_check';
      this._log('info', `[自校验] "${img.name}" → 本地扫描...`);
      const idx = classifiedImages.indexOf(img);
      if (this._onImageUpdate) this._onImageUpdate(img, idx);

      try {
        const result = await AuditAPI.validateBarcode(img.base64, img.name);

        // Store detailed barcode info for UI display
        img.barcodeInfo = {
          scannedNumbers: result.decoded_numbers || '',
          printedNumbers: result.printed_numbers || '',
          barcodeType: result.barcode_type || 'unknown',
          numbersMatch: result.numbers_match,
          scanMethod: result.source || 'glm'
        };

        if (!result.numbers_match) {
          img.compareResults = img.compareResults || [];
          img.compareResults.push({
            match_name: `自校验: ${img.name}`,
            similarity: null,
            is_suspicious: true,
            reason: result.reason,
            barcode_type: result.barcode_type || '未知',
            decoded_numbers: result.decoded_numbers || '',
            printed_numbers: result.printed_numbers || '',
            source: 'barcode_self_validate'
          });
          img.stage1Status = 'fail';
          this._log('warning', `⚠ "${img.name}" 条码自校验失败 → 扫描"${result.decoded_numbers}" ≠ 印刷"${result.printed_numbers}" → 可疑 → 排除，不进入后续阶段`);
        } else {
          img.stage1Status = 'pass';
          this._log('success', `"${img.name}" 条码自校验通过 → 扫描"${result.decoded_numbers}" = 印刷"${result.printed_numbers}" → 一致 → 进入下一阶段`);
        }
        img.compareStatus = 'pending';  // reset for next stage
        img.pipelineStage = 'self_check_done';
      } catch (e) {
        img.barcodeInfo = { scannedNumbers: '识别失败', printedNumbers: '', barcodeType: '', numbersMatch: false, scanMethod: 'error' };
        img.compareStatus = 'pending';
        img.pipelineStage = 'self_check_done';
        img.stage1Status = 'fail';
        this._log('error', `"${img.name}" 条码自校验异常: ${e.message}`);
      }

      img.stage1TimeMs = Date.now() - t0;
      if (this._onImageUpdate) this._onImageUpdate(img, idx);
    }
    return classifiedImages;
  }

  // ── Phase 1.5b: Upload Batch Internal Cross-Check ────────

  async _phase1dot5bCrossCheck(classifiedImages) {
    const validImages = classifiedImages.filter(
      img => img.pHash && img.compareStatus !== 'error'
    );

    if (validImages.length < 2) {
      this._log('info', '上传图片少于2张，跳过批次内部交叉比对');
      for (const img of validImages) img.stage2Status = 'pass';
      return classifiedImages;
    }

    this._log('info', `开始上传批次内部交叉比对（${validImages.length}张）...`);
    const PHOTO_MAX = 5;     // 照片：高度相似阈值
    const BARCODE_MAX = 12;  // 条码：图案相似但数字可能不同，放宽阈值
    let crossCount = 0;

    for (let i = 0; i < validImages.length; i++) {
      for (let j = i + 1; j < validImages.length; j++) {
        const a = validImages[i];
        const b = validImages[j];
        const dist = this.lib.hammingDistance(a.pHash, b.pHash);

        // Only cross-check same types with type-specific thresholds
        if (a.type === 'photo' && b.type === 'photo') {
          if (dist > PHOTO_MAX) continue;
          a.compareResults = a.compareResults || [];
          b.compareResults = b.compareResults || [];
          const rA = {
            match_name: `批次内: ${b.name}`,
            similarity: Math.round((1 - dist / 64) * 100),
            is_suspicious: true,
            reason: `与上传图片"${b.name}"高度相似（汉明距离=${dist}），疑似同一照片重复上传`,
            source: 'internal_cross_check'
          };
          const rB = {
            match_name: `批次内: ${a.name}`,
            similarity: Math.round((1 - dist / 64) * 100),
            is_suspicious: true,
            reason: `与上传图片"${a.name}"高度相似（汉明距离=${dist}），疑似同一照片重复上传`,
            source: 'internal_cross_check'
          };
          a.compareResults.push(rA);
          b.compareResults.push(rB);
          b.stage2Status = 'duplicate';
          crossCount++;
          this._log('warning', `⚠ 批次内部: "${a.name}" ↔ "${b.name}" pHash距离=${dist}，疑似同一照片重复上传 → 保留"${a.name}"，排除"${b.name}"`);
        } else if (a.type === 'barcode' && b.type === 'barcode') {
          if (dist > BARCODE_MAX) continue;
          a.compareResults = a.compareResults || [];
          b.compareResults = b.compareResults || [];
          const rA = {
            match_name: `批次内: ${b.name}`,
            similarity: Math.round((1 - dist / 64) * 100),
            is_suspicious: true,
            reason: `与上传条码"${b.name}"图案高度相似（汉明距离=${dist}），疑似同一条码重复上传`,
            source: 'internal_cross_check'
          };
          const rB = {
            match_name: `批次内: ${a.name}`,
            similarity: Math.round((1 - dist / 64) * 100),
            is_suspicious: true,
            reason: `与上传条码"${a.name}"图案高度相似（汉明距离=${dist}），疑似同一条码重复上传`,
            source: 'internal_cross_check'
          };
          a.compareResults.push(rA);
          b.compareResults.push(rB);
          b.stage2Status = 'duplicate';
          crossCount++;
          this._log('warning', `⚠ 批次内部: "${a.name}" ↔ "${b.name}" pHash距离=${dist}，疑似相同条码重复上传 → 保留"${a.name}"，排除"${b.name}"`);
        }
      }
    }

    if (crossCount === 0) {
      this._log('success', '批次内部交叉比对完成，未发现重复上传');
    }

    for (const img of validImages) {
      if (!img.stage2Status) img.stage2Status = 'pass';
      img.pipelineStage = 'cross_check_done';
      const idx = classifiedImages.indexOf(img);
      if (this._onImageUpdate) this._onImageUpdate(img, idx);
    }
    return classifiedImages;
  }

  // ── Phase 2: Comparison ───────────────────────────────────

  async _phase2Compare(classifiedImages) {
    const allLibImages = await this.lib.getAllImages();
    if (allLibImages.length === 0) {
      this._log('warning', '图片库为空，跳过对比阶段。请先上传基准图到图片库。');
      for (const img of classifiedImages) {
        if (img.compareStatus !== 'error') {
          img.compareStatus = 'done';
          img.compareResults = img.compareResults || [];
        }
      }
      return classifiedImages;
    }

    const config = await AuditAPI.loadConfig();
    const LOCAL_MATCH_MAX = 3;   // pHash distance ≤ 3 → confirmed duplicate, no GLM needed
    const PREFILTER_MAX = 15;    // pHash distance ≤ 15 → send to GLM
    this._log('info', `图片库共 ${allLibImages.length} 张基准图，本地匹配阈值: ≤${LOCAL_MATCH_MAX}, GLM预筛选阈值: ≤${PREFILTER_MAX}`);

    for (let i = 0; i < classifiedImages.length; i++) {
      const img = classifiedImages[i];
      const t0 = Date.now();
      if (img.type === 'unknown' || img.compareStatus === 'error') continue;

      if (!img.pHash) {
        this._log('warning', `"${img.name}" 无pHash，跳过对比`);
        img.compareStatus = 'done';
        img.compareResults = img.compareResults || [];
        if (this._onImageUpdate) this._onImageUpdate(img, i);
        continue;
      }

      img.pipelineStage = 'library';
      // Filter library images by type to reduce comparisons
      let candidateLibImages = allLibImages;
      if (img.type === 'photo') {
        candidateLibImages = allLibImages.filter(
          libImg => libImg.libType === 'photo' || libImg.libType === 'unclassified'
        );
      } else if (img.type === 'barcode') {
        candidateLibImages = allLibImages.filter(
          libImg => libImg.libType === 'barcode' || libImg.libType === 'unclassified'
        );
      }
      this._log('info', `"${img.name}" 类型${img.type}，与库中${candidateLibImages.length}张候选图比对`);

      // Step A: Local pHash matching — catch exact/near-exact duplicates immediately
      const localMatches = [];
      const glpCandidates = [];

      for (const libImg of candidateLibImages) {
        if (!libImg.pHash) continue;
        const dist = this.lib.hammingDistance(img.pHash, libImg.pHash);
        if (dist <= LOCAL_MATCH_MAX) {
          localMatches.push({ libImg, dist });
        } else if (dist <= PREFILTER_MAX) {
          glpCandidates.push(libImg);
        }
      }

      // Report local matches immediately
      const allResults = [];
      for (const m of localMatches) {
        if (img.type === 'photo') {
          // Photo matching existing library photo — suspicious (already exists, should not re-upload)
          this._log('warning', `⚠ 感知哈希高度匹配（汉明距离=${m.dist}），与库中"${m.libImg.name}"确认为同一张照片，已存在`);
          allResults.push({
            match_name: m.libImg.name,
            similarity: Math.round((1 - m.dist / 64) * 100),
            is_suspicious: true,
            is_existing: true,
            reason: `感知哈希高度匹配（汉明距离=${m.dist}），与库中"${m.libImg.name}"确认为同一张照片，已存在`
          });
        } else {
          // Barcode matching — still suspicious (same pattern, possibly different numbers)
          this._log('warning', `⚠ 感知哈希高度匹配（汉明距离=${m.dist}），基本与"${m.libImg.name}"确认为同一张图片`);
          allResults.push({
            match_name: m.libImg.name,
            similarity: Math.round((1 - m.dist / 64) * 100),
            is_suspicious: true,
            reason: `感知哈希高度匹配（汉明距离=${m.dist}），基本与"${m.libImg.name}"确认为同一张图片`
          });
        }
      }

      // Step B: Send borderline candidates to GLM for deeper analysis
      if (glpCandidates.length > 0) {
        img.compareStatus = 'analyzing';
        if (this._onImageUpdate) this._onImageUpdate(img, i);

        const batches = this._chunkArray(glpCandidates, 4);
        for (let b = 0; b < batches.length; b++) {
          this._log('info', `"${img.name}" GLM深度对比 批次${b + 1}/${batches.length}（${batches[b].length}张候选）...`);
          try {
            let batchResults;
            if (img.type === 'photo') {
              batchResults = await AuditAPI.comparePhoto(img.base64, img.name, batches[b]);
            } else {
              batchResults = await AuditAPI.compareBarcode(img.base64, img.name, batches[b]);
            }
            allResults.push(...batchResults);

            for (const r of batchResults.filter(r => r.is_suspicious)) {
              if (img.type === 'photo') {
                this._log('warning', `⚠ "${img.name}" 与库中"${r.match_name}" 相似度 ${r.similarity}%，GLM标记可疑`);
              } else {
                this._log('warning', `⚠ "${img.name}" 条码图案与库中"${r.match_name}" 相同但数字不同，GLM标记骗补可疑`);
              }
            }
          } catch (e) {
            this._log('error', `"${img.name}" 批次${b + 1}对比失败: ${e.message}`);
          }
        }
      } else if (localMatches.length === 0) {
        this._log('success', `"${img.name}" 未发现相似匹配，无异常`);
      }

      img.compareResults = (img.compareResults || []).concat(allResults);
      img.compareStatus = 'done';
      img.stage3TimeMs = Date.now() - t0;
      if (this._onImageUpdate) this._onImageUpdate(img, i);
    }
    return classifiedImages;
  }

  // ── Phase 3: Report ───────────────────────────────────────

  _buildReportSummary(classifiedImages) {
    const summary = {
      totalUploaded: classifiedImages.length,
      suspiciousItems: [],
      stats: { high: 0, medium: 0, low: 0 }
    };
    for (const img of classifiedImages) {
      const suspiciousResults = (img.compareResults || []).filter(r => r.is_suspicious);
      for (const r of suspiciousResults) {
        const sim = r.similarity || 0;
        let riskLevel;
        if (r.source === 'barcode_self_validate') {
          riskLevel = 'high';
        } else if (r.numbers_differ) {
          riskLevel = 'high';
        } else if (sim >= 90) {
          riskLevel = 'high';
        } else if (sim >= 70) {
          riskLevel = 'medium';
        } else {
          riskLevel = 'low';
        }
        summary.suspiciousItems.push({
          uploadName: img.name,
          matchName: r.match_name,
          similarity: r.similarity || null,
          reason: r.reason,
          riskLevel
        });
        summary.stats[riskLevel]++;
      }
    }
    return summary;
  }

  async _phase3Report(classifiedImages) {
    this._log('info', '汇总分析结果，生成审计报告...');
    const summary = this._buildReportSummary(classifiedImages);
    this._log('info', `发现可疑项: 高风险${summary.stats.high}项, 中风险${summary.stats.medium}项, 低风险${summary.stats.low}项`);

    let report;
    try {
      report = await AuditAPI.generateReport(summary);
      this._log('success', '审计报告生成完成');
    } catch (e) {
      // GLM report generation failed — generate a basic text report from summary data
      console.warn('[AnalysisEngine] GLM report generation failed:', e.message);
      this._log('warning', `AI 报告生成失败（${e.message}），使用基础报告`);
      report = this._buildBasicReport(summary);
    }
    return { report, summary };
  }

  // Fallback: basic text report when GLM is unavailable
  _buildBasicReport(summary) {
    const total = summary.totalUploaded;
    const suspicious = summary.suspiciousItems.length;
    const clean = total - suspicious;
    const high = summary.stats.high;
    const medium = summary.stats.medium;
    const low = summary.stats.low;

    let report = `## 总体评估\n\n共上传 **${total}** 张图片，发现可疑 **${suspicious}** 项（高风险 ${high} 项，中风险 ${medium} 项，低风险 ${low} 项），${clean} 张未发现异常。\n\n`;

    if (suspicious > 0) {
      report += `## 可疑项详情\n\n`;
      for (const item of summary.suspiciousItems) {
        const riskLabel = item.riskLevel === 'high' ? '🔴 高风险' : item.riskLevel === 'medium' ? '🟡 中风险' : '🟢 低风险';
        report += `- **${item.uploadName}** → ${item.matchName}\n`;
        report += `  ${riskLabel} | 相似度: ${item.similarity || 'N/A'}%\n`;
        report += `  依据: ${item.reason}\n\n`;
      }
    }

    report += `## 统计概览\n\n`;
    report += `| 风险等级 | 数量 |\n| --- | --- |\n`;
    report += `| 🔴 高风险 | ${high} |\n`;
    report += `| 🟡 中风险 | ${medium} |\n`;
    report += `| 🟢 低风险 | ${low} |\n`;
    report += `| ✅ 无异常 | ${clean} |\n`;
    report += `| 📊 合计 | ${total} |\n\n`;
    report += `## 整改建议\n\n请根据以上可疑项逐一人工复核，确认是否存在骗补行为。`;

    return report;
  }

  // ── Main Entry ────────────────────────────────────────────

  async runAnalysis(uploadedImages) {
    this._log('info', `===== 开始AI审计分析，共 ${uploadedImages.length} 张上传图片 =====`);

    // ── Stage 1: Type Identification + Barcode Self-Validation ──
    if (this._onStageChange) this._onStageChange(1, 'running');
    const classified = await this._phase1Identify(uploadedImages);
    const validated = await this._phase1dot5aBarcodeSelfValidate(classified);

    // Filter: only images that passed Stage 1 proceed
    const stage1Passed = validated.filter(img => img.stage1Status === 'pass');
    const stage1Failed = validated.filter(img => img.stage1Status === 'fail');
    if (stage1Failed.length > 0) {
      this._log('warning', `Stage 1 自校验：${stage1Failed.length} 张未通过，不进入后续阶段`);
    }
    if (this._onStageChange) this._onStageChange(1, 'done', { passed: stage1Passed, failed: stage1Failed, all: validated });

    if (stage1Passed.length === 0) {
      this._log('error', '没有图片通过 Stage 1 自校验，分析终止');
      // Mark stages 2 & 3 as skipped
      if (this._onStageChange) this._onStageChange(2, 'skipped', { reason: 'Stage 1 无图片通过，跳过交叉比对' });
      if (this._onStageChange) this._onStageChange(3, 'skipped', { reason: 'Stage 1 无图片通过，跳过入库比对' });
      const { report, summary } = await this._phase3Report(validated);
      return { images: validated, report, summary, earlyTerminated: true };
    }

    // ── Stage 2: Cross-Check ──
    if (this._onStageChange) this._onStageChange(2, 'running');
    const crossChecked = await this._phase1dot5bCrossCheck(stage1Passed);

    // Filter: exclude duplicates, keep first of each group
    const stage2Passed = crossChecked.filter(img => img.stage2Status === 'pass');
    const stage2Duplicated = crossChecked.filter(img => img.stage2Status === 'duplicate');
    if (stage2Duplicated.length > 0) {
      this._log('warning', `Stage 2 交叉比对：${stage2Duplicated.length} 张重复，不进入后续阶段`);
    }
    if (this._onStageChange) this._onStageChange(2, 'done', { passed: stage2Passed, duplicated: stage2Duplicated, all: crossChecked });

    if (stage2Passed.length === 0) {
      this._log('error', '没有图片通过 Stage 2 交叉比对，分析终止');
      // Mark stage 3 as skipped
      if (this._onStageChange) this._onStageChange(3, 'skipped', { reason: 'Stage 2 无图片通过，跳过入库比对' });
      const { report, summary } = await this._phase3Report(validated);
      return { images: validated, report, summary, earlyTerminated: true };
    }

    // ── Stage 3: Library Comparison ──
    if (this._onStageChange) this._onStageChange(3, 'running');
    const compared = await this._phase2Compare(stage2Passed);
    if (this._onStageChange) this._onStageChange(3, 'done', { all: compared, input: stage2Passed });

    const { report, summary } = await this._phase3Report(validated);
    this._log('success', '===== 分析完成 =====');
    return { images: validated, report, summary };
  }
}

window.AnalysisEngine = AnalysisEngine;
