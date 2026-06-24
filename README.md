# AI 智能审计分析平台

> Intelligent Audit Analysis System — 基于 GLM-4V 多模态大模型的农业设备报废补贴防欺诈审计平台

## 📋 项目简介

本平台是一个**纯前端单页应用**，利用智谱 AI（GLM-4V）视觉语言模型，对农机报废补贴申报中的上传图片进行多阶段智能审计分析。系统能够自动识别图片类型（实物照片 / 条码），校验条码真实性，检测批次内重复上传，并通过与历史基准图片库比对发现异常，最终生成综合审计报告。

### 核心审计流程（三阶段）

```
上传图片 → 类型识别 → 条码自校验 → 批次内交叉比对 → 图库比对 → 审计报告
            (Stage 1)   (Stage 1.5a)   (Stage 1.5b)     (Stage 3)    (输出)
```

| 阶段 | 名称 | 说明 |
|------|------|------|
| **阶段一** | 图片自校验 | GLM 识别图片类型（实物照片 / 条码），条码图片执行本地扫描与印刷数字比对 |
| **阶段二** | 交叉比对 | 上传图片之间使用感知哈希（pHash）两两比对，排除重复上传 |
| **阶段三** | 入库比对 | 与 IndexedDB 图片基准库比对，使用 pHash 预筛选 + GLM 深度视觉分析 |

---

## 🚀 快速开始

### 环境要求

- 现代浏览器（Chrome / Edge / Firefox 最新版）
- 智谱 AI API Key（[申请地址](https://open.bigmodel.cn/)）

### 启动方式

项目为纯前端应用，无需构建工具或后端服务。任选一种方式启动：

**方式一：直接打开**
```bash
# Windows 资源管理器中双击 audit_agent.html
```

**方式二：本地静态服务器**
```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .

# 浏览器访问 http://localhost:8080/audit_agent.html
```

### 初次配置

1. 打开页面后，点击「API 配置」展开配置面板
2. 填入智谱 API Key
3. 按需调整模型（默认 `glm-4v`）、相似度阈值、预筛选阈值
4. 点击「保存配置」

---

## 🏗️ 项目结构

```
├── audit_agent.html              # 主页面（单页应用入口）
├── css/
│   └── styles.css                # 全局样式（深色主题，响应式布局）
├── js/
│   ├── api.js                    # GLM API 集成层（请求封装、速率限制、图片压缩）
│   ├── analysis-engine.js        # 三阶段审计流程编排引擎
│   ├── app.js                    # 主应用逻辑（UI 绑定、文件管理、报告渲染）
│   ├── image-lib.js              # IndexedDB 图片库 + 感知哈希（pHash）
│   └── zxing.min.js              # ZXing 条码扫描库（客户端解码）
├── docs/                         # 开发文档（设计规格、开发计划）
└── README.md
```

---

## 🔧 技术架构

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| **AI 模型** | 智谱 GLM-4V（兼容 OpenAI API 格式） |
| **图像处理** | Canvas API（pHash 计算、图片缩放） |
| **条码扫描** | Browser BarcodeDetector API → ZXing 回退 |
| **本地存储** | IndexedDB（图片库）+ localStorage（配置） |
| **UI** | 原生 HTML/CSS/JS，无框架依赖 |
| **图标** | Font Awesome 6 |
| **字体** | Google Fonts (Inter) |

### 感知哈希（pHash）

- 8×8 灰度感知哈希，Canvas API 客户端计算
- 汉明距离 ≤ 3 → 确认为同一张图片（本地判定）
- 汉明距离 ≤ 15 → 发送 GLM 深度比对
- 汉明距离 > 15 → 跳过（不相似）

### API 调用优化

- **本地预筛选**：pHash 快速过滤，大幅减少 API 调用次数
- **批量发送**：候选图片按 4 张一批发送 GLM
- **速率限制**：请求间隔 ≥ 1 秒，429 时指数退避重试
- **图片压缩**：上传前自动缩放至最大 2048px（JPEG 0.8 质量）

---

## 📊 功能特性

### 图片审计

- ✅ 拖拽 / 点击上传，支持多文件
- ✅ 自动识别图片类型（实物照片 / 条码）
- ✅ 条码扫描数字与印刷数字自校验
- ✅ 上传批次内交叉比对（照片 / 条码分别阈值）
- ✅ 图库 pHash 匹配 + GLM 深度视觉分析
- ✅ 无异常图片自动入库作为基准图

### 三阶段分析可视化

- ✅ 分阶段 Tab 切换查看详情
- ✅ 每张图片的处理耗时统计
- ✅ 实时日志输出
- ✅ 右侧面板流水线状态指示器

### 审计报告

- ✅ AI 生成综合审计报告（Markdown）
- ✅ 可疑项详情列表（风险等级分类）
- ✅ 导出报告（TXT 格式）
- ✅ 继续上传 / 重新分析

### 图片库管理

- ✅ IndexedDB 持久化存储
- ✅ 按类型筛选（全部 / 实物照片 / 条码 / 未分类）
- ✅ 缩略图网格展示
- ✅ 手动上传基准图到图库

---

## 🎨 界面预览

深色主题仪表盘风格，三栏布局：

- **左侧面板**：知识库概览 + AI 引擎状态
- **中央面板**：文件上传 → 分析处理 → 审计报告
- **右侧面板**：审计图片库 + 待审列表 + 分析过程总览

---

## ⚙️ 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `apiKey` | - | 智谱 AI API Key（必填） |
| `apiBase` | `https://open.bigmodel.cn/api/paas/v4` | API 地址 |
| `model` | `glm-4v` | 模型选择（glm-4v / glm-4.5v / AutoGLM） |
| `similarityThreshold` | `80` | 相似度阈值（%），低于此值不标记可疑 |
| `prefilterThreshold` | `10` | pHash 预筛选阈值（汉明距离），高于此值跳过 GLM 比对 |

---

## 🔒 数据安全

- **纯客户端运行**：所有数据存储在用户浏览器本地（IndexedDB + localStorage）
- **不上传图片到第三方服务器**（仅发送至用户配置的智谱 API）
- **API Key 仅存储在浏览器 localStorage**

---

## 📝 开发文档

详见 `docs/` 目录：

- [原始设计规格](docs/superpowers/specs/2026-06-22-audit-image-comparison-design.md)
- [开发计划](docs/superpowers/plans/2026-06-22-audit-image-comparison-plan.md)
- [三阶段模态框完成记录](docs/superpowers/plans/shimmying-sparking-pudding.md)

---

## 📄 License

Internal Use Only
