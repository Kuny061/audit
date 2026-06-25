'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config file (server-side, never exposed to client) ──
const CONFIG_PATH = path.join(__dirname, 'server-config.json');

function loadServerConfig() {
  // apiBase is ALWAYS from env or hardcoded default — never from persisted file
  const apiBase = process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn/api/paas/v4';

  let persisted = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      persisted = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* ignore */ }

  return {
    apiKey: persisted.apiKey || process.env.ZHIPU_API_KEY || '',
    apiBase: apiBase,
    model: persisted.model || 'glm-4v',
    similarityThreshold: persisted.similarityThreshold ?? 80,
    prefilterThreshold: persisted.prefilterThreshold ?? 10
  };
}

function saveServerConfig(config) {
  // Strip apiBase — it's never persisted, always from env
  const { apiBase, ...safe } = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2), 'utf-8');
}

let serverConfig = loadServerConfig();

// ── Security middleware ──
app.use(helmet({
  contentSecurityPolicy: false, // we serve inline scripts/styles
  crossOriginEmbedderPolicy: false
}));

// CORS — restrict to same origin in production
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));

app.use(express.json({ limit: '50mb' })); // large base64 images

// ── Rate limiter for API proxy ──
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,             // 10 requests per minute to Zhipu API
  message: { error: { code: '429', message: '请求太频繁，请稍后再试' } },
  standardHeaders: true,
  legacyHeaders: false
});

// ── Block access to sensitive files (must be BEFORE static serving) ──
app.use((req, res, next) => {
  const blocked = ['.env', 'server-config.json', 'package.json', 'server.js', '.git', 'node_modules'];
  if (blocked.some(f => req.path.includes(f))) {
    return res.status(404).send('Not Found');
  }
  next();
});

// ── Static files ──
app.use(express.static(__dirname));

// ── Config API (server-side config management) ──

// GET /api/config — return safe config (masked API key)
app.get('/api/config', (_req, res) => {
  const key = serverConfig.apiKey || '';
  const maskedKey = key.length > 8
    ? key.substring(0, 4) + '****' + key.substring(key.length - 4)
    : key ? '****' : '';
  // NEVER expose serverConfig.apiBase to client — it's the real Zhipu URL
  res.json({
    apiKey: maskedKey,
    model: serverConfig.model,
    similarityThreshold: serverConfig.similarityThreshold,
    prefilterThreshold: serverConfig.prefilterThreshold,
    configured: !!serverConfig.apiKey
  });
});

// PUT /api/config — update config (client sends new API key etc.)
// apiBase is NOT accepted from client — server manages its own upstream Zhipu URL
app.put('/api/config', (req, res) => {
  const { apiKey, model, similarityThreshold, prefilterThreshold } = req.body;

  if (apiKey !== undefined) {
    // Only update if client sent a non-masked key
    if (apiKey && !apiKey.includes('****')) {
      serverConfig.apiKey = apiKey;
    }
  }
  if (model) serverConfig.model = model;
  if (similarityThreshold !== undefined) serverConfig.similarityThreshold = Number(similarityThreshold);
  if (prefilterThreshold !== undefined) serverConfig.prefilterThreshold = Number(prefilterThreshold);

  saveServerConfig(serverConfig);
  res.json({ success: true, configured: !!serverConfig.apiKey });
});

// ── API Proxy to Zhipu ──

app.post('/api/chat/completions', apiLimiter, async (req, res) => {
  if (!serverConfig.apiKey) {
    return res.status(401).json({
      error: { code: '401', message: '服务器未配置 API Key，请在管理页面配置' }
    });
  }

  // ── Debug: show what we actually received ──
  const bodyKeys = Object.keys(req.body);
  const bodySize = JSON.stringify(req.body).length;
  const msgType = req.body.messages ? (Array.isArray(req.body.messages) ? `array[${req.body.messages.length}]` : typeof req.body.messages) : 'MISSING';
  console.log(`[Proxy] Received body: keys=[${bodyKeys}], messages=${msgType}, bodySize=${(bodySize / 1024).toFixed(0)}KB, content-type=${req.get('Content-Type')}`);

  // Also check if messages is nested somewhere else
  if (!req.body.messages) {
    console.log('[Proxy] WARNING: req.body keys:', bodyKeys, 'first 200 chars:', JSON.stringify(req.body).substring(0, 200));
  }

  const { model, messages, temperature, max_tokens } = req.body;

  // ── Validate messages before forwarding ──
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.error('[Proxy] Rejected: messages is empty or invalid. typeof messages:', typeof messages);
    return res.status(400).json({
      error: { code: '400', message: '请求数据异常：messages 为空，请刷新页面后重试' }
    });
  }
  const firstMsg = messages[0];
  if (!firstMsg.content || (Array.isArray(firstMsg.content) && firstMsg.content.length === 0)) {
    console.error('[Proxy] Rejected: first message content is empty');
    return res.status(400).json({
      error: { code: '400', message: '请求数据异常：消息内容为空，请刷新页面后重试' }
    });
  }

  const url = `${serverConfig.apiBase}/chat/completions`;

  // Debug: log message structure (without giant base64 payloads)
  const contentTypes = Array.isArray(firstMsg.content)
    ? firstMsg.content.map(c => c.type + (c.image_url ? `(${c.image_url.url?.substring(0, 30)}...)` : ''))
    : typeof firstMsg.content;
  console.log(`[Proxy] → ${url}, model: ${model || serverConfig.model}, content: [${contentTypes}], bodySize: ${(bodySize / 1024).toFixed(0)}KB`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serverConfig.apiKey}`
      },
      body: JSON.stringify({
        model: model || serverConfig.model,
        messages,
        temperature: temperature ?? 0.1,
        max_tokens: max_tokens || 1024
      }),
      signal: AbortSignal.timeout(120_000) // 2 minute timeout for vision requests
    });

    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Proxy] Zhipu error ${response.status}:`, errText.substring(0, 300));

      // Forward rate limit info
      if (response.status === 429) {
        res.set('Retry-After', response.headers.get('Retry-After') || '5');
      }

      return res.status(response.status).send(errText);
    }

    // Stream the response for efficiency
    if (contentType.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        res.end();
        reader.releaseLock();
      }
    } else {
      const data = await response.json();
      console.log(`[Proxy] OK, tokens: ${data.usage?.total_tokens}`);
      res.json(data);
    }
  } catch (err) {
    console.error('[Proxy] Request failed:', err.message);

    if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
      return res.status(504).json({
        error: { code: '504', message: 'API 请求超时（120秒），请重试' }
      });
    }

    res.status(502).json({
      error: { code: '502', message: `代理请求失败: ${err.message}` }
    });
  }
});

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    configured: !!serverConfig.apiKey,
    model: serverConfig.model,
    uptime: process.uptime()
  });
});

// ── SPA fallback — serve audit_agent.html for root ──
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'audit_agent.html'));
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n🔒 AI智能审计分析平台 — 后端代理已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   配置状态: ${serverConfig.apiKey ? '✅ 已配置 API Key' : '⚠️  未配置 API Key'}`);
  console.log(`   模型: ${serverConfig.model}`);
  console.log(`\n   请通过页面「API 配置」面板设置 API Key，Key 仅存储在服务器端\n`);
});
