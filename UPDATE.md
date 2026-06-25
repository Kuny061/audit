# 更新说明（v2.0）

## 变更概述

本次更新将项目从纯前端架构改造为前后端分离架构，核心目的是解决 API Key 在浏览器端暴露的安全问题，同时修复了若干功能 bug。

---

## 修复清单

| 问题 | 说明 |
|------|------|
| API Key 浏览器端暴露 | 新建 server.js 后端代理，Key 仅存服务端，前端不接触 |
| CDN 外网依赖 | Font Awesome 本地化到 vendor/，Google Fonts 替换为系统字体 |
| 视频关闭后无法重新打开 | video 元素错误态锁死，改为先清 handler 再重置 |
| 选择同一文件无反应 | 文件 input 未重置 value，导致 change 事件不触发 |
| apiBase 被前端覆盖 | 前后端 URL 分离，服务端上游地址不受前端影响 |
| 视频分析 max_tokens 超限 | GLM-4V 上限 2048，从 8192 改回正确值 |
| fetch 漏发请求体 | _callAPIInternal 补回 body: JSON.stringify(body) |

---

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 启动后端

```bash
# 直接启动
npm start

# 生产环境用 PM2
npm install -g pm2
pm2 start server.js --name audit-agent
pm2 save
pm2 startup
```

默认监听 3000 端口。

### 3. Nginx 配置（追加）

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_read_timeout 180s;
}
```

### 4. 配置 API Key

浏览器打开页面 → 点击「API 配置」→ 输入智谱 API Key → 保存。Key 仅存于服务端 server-config.json。

---

## 环境变量（可选）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| ZHIPU_API_KEY | - | 智谱 API Key（也可通过页面配置） |
| ZHIPU_API_BASE | https://open.bigmodel.cn/api/paas/v4 | 上游 API 地址 |
| PORT | 3000 | 服务端口 |

---

## 注意事项

- 服务器需要能访问外网（open.bigmodel.cn）
- server-config.json 和 .env 含敏感信息，不要打包分发
- 图片库仍存浏览器 IndexedDB，换电脑会丢失
- 页面无登录鉴权，公网部署建议前端套 Nginx basic auth
