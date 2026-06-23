// js/api.js
const CONFIG_KEY = 'audit_config';

class AuditAPI {
  static getDefaults() {
    return {
      apiKey: '',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4v',
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

  // ── API rate limiting with proper serial lock ──────
  static _lock = Promise.resolve();
  static _minIntervalMs = 1000;  // wait 1s between calls to avoid 429

  static async _callAPI(messages, config, retryCount = 0, options = {}) {
    const MAX_RETRIES = 3;

    // Acquire lock — wait for previous request to fully complete
    // Only acquire on first attempt, not retries (retries happen within the same lock window)
    if (retryCount === 0) {
      const prevLock = AuditAPI._lock;
      let releaseLock;
      AuditAPI._lock = new Promise(resolve => { releaseLock = resolve; });
      await prevLock;
      // Store release function so _callAPIInternal can release on completion
      this._releaseLock = releaseLock;
    }

    try {
      return await AuditAPI._callAPIInternal(messages, config, retryCount, options);
    } finally {
      if (retryCount === 0 && this._releaseLock) {
        this._releaseLock();
        this._releaseLock = null;
      }
    }
  }

  static async _callAPIInternal(messages, config, retryCount, options = {}) {
    const MAX_RETRIES = 3;

    const body = {
      model: config.model,
      messages,
      temperature: 0.1,
      max_tokens: options.maxTokens || 1024
    };
    const url = `${config.apiBase}/chat/completions`;
    console.log('[AuditAPI] Calling:', url, 'model:', config.model, 'retry:', retryCount);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body)
      });
    } catch (fetchErr) {
      // Network error — retry with backoff
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount + 1) * 1500;
        console.warn(`[AuditAPI] Network error "${fetchErr.message}" — retrying in ${delay / 1000}s (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        return AuditAPI._callAPIInternal(messages, config, retryCount + 1, options);
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const err = await response.text();
      console.error('[AuditAPI] Error', response.status, ':', err.substring(0, 200));

      // 429 Too Many Requests — retry with exponential backoff
      if (response.status === 429 && retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount + 1) * 2000;  // 2s, 4s, 8s
        console.warn(`[AuditAPI] 429 rate limited — retrying in ${delay / 1000}s (${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        return AuditAPI._callAPIInternal(messages, config, retryCount + 1, options);
      }

      throw new Error(`API error ${response.status}: ${err.substring(0, 300)}`);
    }

    const data = await response.json();
    console.log('[AuditAPI] OK, tokens:', data.usage?.total_tokens);

    // Wait minimum interval before letting next request proceed
    await new Promise(r => setTimeout(r, AuditAPI._minIntervalMs));

    return data.choices[0].message.content;
  }

  // Resize image if too large (max 2048px on longest side, JPEG quality 0.8)
  static async _resizeImage(base64) {
    const MAX_SIZE = 2048;
    const QUALITY = 0.8;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w <= MAX_SIZE && h <= MAX_SIZE) { resolve(base64); return; }
        if (w > h) { h = Math.round(h * MAX_SIZE / w); w = MAX_SIZE; }
        else { w = Math.round(w * MAX_SIZE / h); h = MAX_SIZE; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', QUALITY));
      };
      img.src = base64;
    });
  }

  static _imageContent(base64) {
    return {
      type: 'image_url',
      image_url: { url: base64 }
    };
  }

  static async identifyType(imageBase64) {
    // Step 1: Try local barcode scanning for supplementary info only
    const scanResult = await AuditAPI._scanBarcodeAny(imageBase64);

    // Step 2: Always use GLM to classify image type (per user requirement —
    //   local browser scanning is unreliable for distinguishing barcode images from photos)
    const config = AuditAPI.loadConfig();
    const resized = await AuditAPI._resizeImage(imageBase64);
    const content = [AuditAPI._imageContent(resized)];

    // Build prompt with local scan context if available
    let promptText;
    if (scanResult) {
      console.log('[AuditAPI] Local barcode detected via', scanResult.source + ':', scanResult.rawValue, '(' + scanResult.format + '). Asking GLM to verify...');
      promptText = `本地条码扫描器在这张图片中检测到了条码（类型: ${scanResult.format}，内容: "${scanResult.rawValue}"）。\n\n请结合扫描结果判断这张图片的类型：\n\nA. 实物照片 — 拍摄的是农业设备、农具、机械、车辆、铭牌、场景、人物、证件、文件、票据等实物对象。即使画面中出现了条码或编号，只要拍摄主体是实物本身，就归为A类。\n\nB. 条码/二维码 — 图片的核心内容是一个或多个条形码(barcode)或二维码(QR code)，条码/二维码是画面的绝对主体。例如：单独拍摄的条码标签特写、二维码截图、条码扫描件等。\n\n重要：如果图片看起来像是用手机对准某个条码标签拍摄的特写，主体就是条码本身 → 归为B类。如果图片是在拍摄某个设备/物品时顺带拍到了条码 → 归为A类。\n\n请用JSON格式回复（只回复JSON，不要其他内容）：\n{"type": "A或B", "description": "简短描述图片内容（注明是否含条码）", "quality": "清晰/模糊/可疑"}`;
    } else {
      console.log('[AuditAPI] No barcode detected locally. Asking GLM to classify...');
      promptText = `请判断这张图片属于以下哪种类型：\n\nA. 实物照片 — 拍摄的是农业设备、农具、机械、车辆、铭牌、场景、人物、证件、文件、票据等实物对象。如果画面中出现了条码或编号但拍摄主体是实物本身，归为A类。\n\nB. 条码/二维码 — 图片的核心内容是条形码(barcode)或二维码(QR code)，条码/二维码是画面的绝对主体（例如：条码标签特写、二维码截图）。\n\n重要判断标准：看拍摄者的意图 —— 如果图片看起来是故意对准条码拍摄的特写（条码占据画面大部分），就是B类；如果是在拍摄某物品时顺带拍到了条码，就是A类。\n\n请用JSON格式回复（只回复JSON，不要其他内容）：\n{"type": "A或B", "description": "简短描述图片内容（注明是否含条码）", "quality": "清晰/模糊/可疑"}`;
    }

    content.push({ type: 'text', text: promptText });

    const messages = [{ role: 'user', content }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[AuditAPI] GLM classification result:', parsed);
      return parsed;
    }
    throw new Error('Failed to parse type identification result');
  }

  static async comparePhoto(uploadBase64, uploadName, libraryImages) {
    const config = AuditAPI.loadConfig();
    const resizedUpload = await AuditAPI._resizeImage(uploadBase64);
    const content = [
      AuditAPI._imageContent(resizedUpload),
      {
        type: 'text',
        text: `图A（"${uploadName}"）是待审的上传图片（报废农具）。\n请将图A与以下基准库图片逐一对比，判断是否拍摄于同一件物品（考虑拍摄角度、光照可能不同）。\n相似度阈值：${config.similarityThreshold}%。\n\n请仅返回JSON数组（不要其他内容）：\n[{"match_name": "库图名称", "similarity": 分数0-100, "is_suspicious": true/false, "reason": "简短判断依据"}]`
      }
    ];
    for (const libImg of libraryImages) {
      const resizedLib = await AuditAPI._resizeImage(libImg.base64);
      content.push(AuditAPI._imageContent(resizedLib));
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

  static async compareBarcode(uploadBase64, uploadName, libraryImages) {
    const config = AuditAPI.loadConfig();
    const resizedUpload = await AuditAPI._resizeImage(uploadBase64);
    const content = [
      AuditAPI._imageContent(resizedUpload),
      {
        type: 'text',
        text: `这是待审图片"${uploadName}"中的条码。请先提取：\n1. 条码类型（EAN-13/Code-128/QR等）\n2. 条码下方/周围的数字文本\n3. 条码图案对应的编码内容\n\n然后与以下基准库条码图片逐一比对：\n- 条码图案是否与库中某图相同或高度相似？\n- 图案相同但数字文本不同 → 标记为is_suspicious=true\n- 图案相同且数字也相同 → 标记为is_suspicious=false（重复上传但内容一致）\n\n请仅返回JSON数组：\n[{"match_name": "库图名称", "barcode_type": "类型", "upload_numbers": "提取的数字", "match_numbers": "库图数字", "pattern_match": true/false, "numbers_differ": true/false, "is_suspicious": true/false, "reason": "判断依据"}]`
      }
    ];
    for (const libImg of libraryImages) {
      const resizedLib = await AuditAPI._resizeImage(libImg.base64);
      content.push(AuditAPI._imageContent(resizedLib));
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

  // Local barcode scanning using BarcodeDetector API (Chrome/Edge)
  static async _scanBarcodeLocal(base64) {
    if (typeof BarcodeDetector === 'undefined') {
      console.log('[AuditAPI] BarcodeDetector not available');
      return null;
    }
    try {
      const resp = await fetch(base64);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      const formats = await BarcodeDetector.getSupportedFormats();
      const detector = new BarcodeDetector({ formats });
      const results = await detector.detect(bitmap);
      bitmap.close();
      if (results.length > 0) {
        const best = results[0];
        console.log('[AuditAPI] BarcodeDetector scan:', best.rawValue, best.format);
        return { rawValue: best.rawValue, format: best.format };
      }
      console.log('[AuditAPI] No barcode found via BarcodeDetector');
      return null;
    } catch (e) {
      console.warn('[AuditAPI] BarcodeDetector scan error:', e.message);
      return null;
    }
  }

  // ZXing pure-JS barcode scanning (fallback when BarcodeDetector unavailable)
  static async _scanBarcodeZxing(base64) {
    if (typeof ZXing === 'undefined') {
      console.log('[AuditAPI] ZXing library not available');
      return null;
    }
    try {
      // Resize image to a reasonable size first — improves ZXing detection rate
      const resizedBase64 = await AuditAPI._resizeForScan(base64, 1200);
      const img = new Image();
      const loaded = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image load failed'));
      });
      img.src = resizedBase64;
      await loaded;

      const reader = new ZXing.BrowserMultiFormatReader();
      console.log('[AuditAPI] ZXing scanning image', img.width + 'x' + img.height);

      // Try decodeFromImageElement first
      try {
        const result = reader.decodeFromImageElement(img);
        if (result) {
          const text = result.getText();
          const format = result.getBarcodeFormat();
          console.log('[AuditAPI] ZXing barcode found:', text, '(' + format + ')');
          return { rawValue: text, format: format };
        }
      } catch (e) {
        console.log('[AuditAPI] ZXing decodeFromImageElement failed:', e.message);
      }

      // Try canvas-based approach as fallback
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // ZXing can also decode from luminance source
        const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
        const result2 = reader.decodeBitmap(bitmap);
        if (result2) {
          const text = result2.getText();
          const format = result2.getBarcodeFormat();
          console.log('[AuditAPI] ZXing canvas scan found:', text, '(' + format + ')');
          return { rawValue: text, format: format };
        }
      } catch (e2) {
        console.log('[AuditAPI] ZXing canvas approach also failed:', e2.message);
      }

      console.log('[AuditAPI] No barcode found via ZXing');
      return null;
    } catch (e) {
      console.warn('[AuditAPI] ZXing barcode scan error:', e.message);
      return null;
    }
  }

  // Resize image for barcode scanning (max dimension, preserve aspect ratio)
  static async _resizeForScan(base64, maxDim) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxDim && img.height <= maxDim) {
          resolve(base64);
          return;
        }
        let w = img.width;
        let h = img.height;
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = base64;
    });
  }

  // Try all available barcode scanning methods
  static async _scanBarcodeAny(base64) {
    // Priority: BarcodeDetector (native) > ZXing (pure JS)
    let result = await AuditAPI._scanBarcodeLocal(base64);
    if (result) return { ...result, source: 'BarcodeDetector' };
    result = await AuditAPI._scanBarcodeZxing(base64);
    if (result) return { ...result, source: 'ZXing' };
    return null;
  }

  // GLM reads printed numbers from the image (OCR — what GLM is good at)
  // Does NOT ask GLM to decode barcode patterns (GLM is unreliable at that)
  static async _extractPrintedNumbersGLM(imageBase64, imageName) {
    const config = AuditAPI.loadConfig();
    const resized = await AuditAPI._resizeImage(imageBase64);
    const messages = [{
      role: 'user',
      content: [
        AuditAPI._imageContent(resized),
        {
          type: 'text',
          text: `请仔细查看这张图片"${imageName}"，读取条码或二维码旁边印刷的人类可读数字/文本。\n\n注意：\n- 只读取图片上肉眼可见的印刷文字/数字（通常在条码正下方或右侧）\n- 不要尝试解码条码/二维码的图案\n- 二维码旁边也可能有印刷的文字说明\n\n如果确实没有任何印刷数字/文本，请返回printed_numbers为"无"。\n\n请仅返回JSON（不要其他内容）：\n{"printed_numbers": "印刷的数字", "barcode_type": "条码/二维码的类型（EAN-13/Code-128/QR等，不确定写unknown）"}`
        }
      ]
    }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to extract printed numbers');
  }

  // GLM fallback: decode barcode + extract printed numbers + compare (all in one call)
  // Only used when local scanners (BarcodeDetector / ZXing) are unavailable
  // Marked as 'glm_fallback' so UI can show it's less reliable than local scan
  static async _validateBarcodeGLMFallback(imageBase64, imageName) {
    const config = AuditAPI.loadConfig();
    const resized = await AuditAPI._resizeImage(imageBase64);
    const messages = [{
      role: 'user',
      content: [
        AuditAPI._imageContent(resized),
        {
          type: 'text',
          text: `请分析这张条码/二维码图片"${imageName}"。\n\n请完成以下步骤：\n1. 识别条码/二维码类型（EAN-13, Code-128, QR Code 等）\n2. 尝试从条码/二维码图案中解码出编码内容\n3. 读取图片中条码旁印刷的人类可读数字/文本\n4. 比较解码内容与印刷数字是否一致\n\n⚠️ 如果印刷数字为"无"或无法确定 → numbers_match=false, is_suspicious=true\n⚠️ 如果解码内容与印刷数字不同 → numbers_match=false, is_suspicious=true\n⚠️ 只有两者完全一致 → numbers_match=true, is_suspicious=false\n\n请仅返回JSON：\n{"barcode_type": "类型", "decoded_numbers": "解码内容", "printed_numbers": "印刷数字", "numbers_match": true/false, "is_suspicious": true/false, "reason": "判断依据"}`
        }
      ]
    }];
    const result = await AuditAPI._callAPI(messages, config);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Failed to parse GLM barcode validation result');
  }

  static async validateBarcode(imageBase64, imageName) {
    // Step 1: Try local barcode scanner (BarcodeDetector → ZXing)
    //   These are purpose-built and far more reliable than any VLM at decoding
    const scanResult = await AuditAPI._scanBarcodeAny(imageBase64);

    if (!scanResult) {
      // Step 2: Local scanners unavailable — fall back to GLM as last resort
      console.warn('[AuditAPI] Local barcode scanner unavailable (BarcodeDetector not supported + ZXing CDN may be blocked). Falling back to GLM decoding (less reliable).');
      try {
        const glmResult = await AuditAPI._validateBarcodeGLMFallback(imageBase64, imageName);
        console.log('[AuditAPI] GLM fallback result:', glmResult);
        return {
          ...glmResult,
          source: 'glm_fallback'  // mark so UI knows it's GLM-based
        };
      } catch (e) {
        console.error('[AuditAPI] GLM fallback also failed:', e.message);
        return {
          barcode_type: 'unknown',
          decoded_numbers: '',
          printed_numbers: '',
          numbers_match: false,
          is_suspicious: true,
          reason: `本地扫描器和GLM均无法识别条码/二维码（${e.message}），无法进行自校验`,
          source: 'none'
        };
      }
    }

    console.log('[AuditAPI] Barcode decoded via', scanResult.source + ':', scanResult.rawValue, '(' + scanResult.format + ')');

    // Step 3: GLM reads the printed numbers (OCR) — what GLM is good at
    let printedInfo;
    try {
      printedInfo = await AuditAPI._extractPrintedNumbersGLM(imageBase64, imageName);
    } catch (e) {
      console.warn('[AuditAPI] GLM printed-number extraction failed:', e.message);
      return {
        barcode_type: scanResult.format || 'unknown',
        decoded_numbers: scanResult.rawValue,
        printed_numbers: '',
        numbers_match: false,
        is_suspicious: true,
        reason: `条码解码为"${scanResult.rawValue}"，但无法读取印刷数字进行比对（GLM OCR 失败: ${e.message}）`,
        source: scanResult.source
      };
    }

    const decodedNumbers = scanResult.rawValue.trim();
    const printedNumbers = (printedInfo.printed_numbers || '').trim();

    // Step 4: Compare — code does the comparison, not GLM
    // Normalize: strip spaces, dashes, and other common separators
    const normDecoded = decodedNumbers.replace(/[\s\-_\.]/g, '');
    const normPrinted = printedNumbers.replace(/[\s\-_\.]/g, '');

    // Cannot validate if no printed numbers found — this is a FAIL, not auto-pass
    if (printedNumbers === '无' || printedNumbers === '') {
      console.warn('[AuditAPI] No printed numbers found in image. Cannot compare.');
      return {
        barcode_type: printedInfo.barcode_type || scanResult.format || 'unknown',
        decoded_numbers: decodedNumbers,
        printed_numbers: '(无印刷数字)',
        numbers_match: false,
        is_suspicious: true,
        reason: `条码解码为"${decodedNumbers}"，但图片中未找到印刷数字，无法完成自校验比对`,
        source: scanResult.source
      };
    }

    const numbersMatch = normDecoded === normPrinted
      || normPrinted.includes(normDecoded)
      || normDecoded.includes(normPrinted);

    const reason = numbersMatch
      ? `条码解码"${decodedNumbers}"与印刷数字"${printedNumbers}"一致，自校验通过`
      : `条码解码"${decodedNumbers}"与印刷数字"${printedNumbers}"不一致，可能存在篡改`;

    console.log('[AuditAPI] Self-validation result:', numbersMatch ? 'PASS' : 'FAIL', '| decoded:', decodedNumbers, '| printed:', printedNumbers);

    return {
      barcode_type: printedInfo.barcode_type || scanResult.format || 'unknown',
      decoded_numbers: decodedNumbers,
      printed_numbers: printedNumbers,
      numbers_match: numbersMatch,
      is_suspicious: !numbersMatch,
      reason,
      source: scanResult.source  // which scanning method successfully decoded the barcode
    };
  }

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
