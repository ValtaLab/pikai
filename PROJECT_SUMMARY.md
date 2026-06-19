# AI News Digest — 項目總結

## 基本資訊

**名稱：** AI News Digest
**網址：** https://ai-news-digest.isearover.workers.dev/
**代碼位置：** `/home/blackpi/ai-news-webapp/`
**部署方式：** `./deploy.sh` (wrangler deploy + ?refresh=1 測試)
**最後更新：** 2026-04-24

## 功能概覽

### 新聞聚合 (News Aggregation)
- **來源：** Hugging Face Blog、TechCrunch、MIT Technology Review、Wired AI、The Decoder、VentureBeat、The Verge、MarkTechPost、XDA Developers
- **過濾：** 24小時內發布 + AI關鍵字過濾（多關鍵字 OR 邏輯）
- **翻譯：** 標題 → 繁體中文（MyMemory API，快取24小時）
- **描述：** RSS摘要（無摘要時顯示「📖 點擊閱讀全文 →」）
- **排序：** 依發布時間（最新優先）
- **顯示：** 每個來源最多10篇文章
- **CDATA 修復：** XDA RSS 使用 CDATA 包裝，已修復解析問題

### GitHub AI 工具 (GitHub Tools)
- **來源：** GitHub API `search/repositories`（AI關鍵字 + 24小時推送）
- **過濾：** AI/ML/DL/LLM/Neural-Network 關鍵字 + `created:>2024-01-01`
- **數據：** 名稱、描述、擁有者、Star數、推送時間
- **翻譯：** 名稱 + 描述 → 繁體中文（快取24小時）
- **顯示：** 12個工具（按推送時間排序）

### LLM 排名 (LLM Rankings)
- **刷新：** 每次頁面加載（無快取）

#### OpenRouter LLM Leaderboard
- **來源：** HTML 爬取 `https://openrouter.ai/rankings`
- **欄位：** #、Model、Provider、Weekly Tokens、WoW Change
- **顏色：** ▲ 綠色（升）、▼ 紅色（降）
- **WoW判斷：** 根據SVG箭頭顏色（green=up, red=down）

#### Arena AI Leaderboard
- **Chat：** HTML 爬取 `https://arena.ai/leaderboard/text`
  - 欄位：#、Model、Score (±Error)、Votes
  - 顯示：Top 10 模型
- **Code：** HTML 爬取 `https://arena.ai/leaderboard/code`
  - 欄位：#、Model、Score、Votes
  - 顯示：Top 10 模型

## 技術架構

### 前端
- **單頁應用：** 純 HTML + CSS + JS（無框架）
- **Tabs：** News（默认）、Tools、Rankings
- **響應式：** Mobile (<700px) 隱藏 Provider 欄
- **語言切換：** 按鈕切換 繁體/English（資料屬性驅動）

### 後端 (Cloudflare Workers)
- **Worker：** `worker.js`（829行）
- **快取：** News 4小時、Tools 24小時、Translation 24小時
- **翻譯API：** MyMemory (`/get?q=...&langpair=en|zh-TW`)
- **依賴：** 無外部npm包（純CF Workers兼容代碼）

### 部署
- **命令：** `./deploy.sh`
- **流程：** ESLint檢查 → `wrangler deploy` → `?refresh=1` 健康檢查
- **Worker名稱：** ai-news-digest

## 已修復的問題

1. ✅ **排名冇數據** — 正則表達式修正 `>${name}</a>`（加 `</a>`）
2. ✅ **Tabs被擠成兩行** — 改名為「Ranking」（英文，更短）
3. ✅ **排名縮小一點** — 字体0.78rem，padding 0.45rem
4. ✅ **其他網頁排名做成卡片** — card layout with `.rankings-cards`
5. ✅ **Deepseek WoW顯示+2%而非-2%** — 根據SVG顏色判斷正負（green=up, red=down）
6. ✅ **Mobile看不到Provider欄** — Mobile上隱藏整個Provider欄（th + td）
7. ✅ **WoW顯示+▲ 13%%** — 修復重複加 `+` 和 `%` 的問題
8. ✅ **OpenRouter HTML解析方向錯誤** — 從heading向後搜，而非從Claude向前搜
9. ✅ **XDA RSS CDATA 解析失敗** — `parseItemXml()` 新增 CDATA wrapper 剝離
10. ✅ **Arena AI 分開 Chat + Code 兩張卡** — 分別爬取 `arena.ai/leaderboard/text` 和 `arena.ai/leaderboard/code`

## 已知限制

1. ⚠️ **排名每次刷新** — OpenRouter和Arena AI每次頁面加載都重新爬取（無快取）
2. ⚠️ **翻譯API限制** — MyMemory有頻率限制，大流量時可能失敗
3. ⚠️ **Arena AI HTML結構** — 依賴CSS class解析，生效前提是Arena AI網頁結構穩定
4. ⚠️ **OpenRouter HTML結構** — 依賴特定CSS class名稱（如 `text-green-9`），可能随网站更新失效

## 文件結構

```
/home/blackpi/ai-news-webapp/
├── worker.js          # 主Worker代碼（829行，2026-04-24 sync from Cloudflare）
├── index.html         # 前端模板（嵌入worker.js）
├── deploy.sh          # 部署腳本
├── wrangler.toml      # Cloudflare Workers配置
├── eslint.config.js   # ESLint配置
├── package.json       # npm配置
└── PROJECT_SUMMARY.md # 本文件
```

## Cloudflare Workers 版本管理

- **API Token：** 存放於 `.env.local`
- **可用命令：** `CLOUDFLARE_API_TOKEN=xxx npx wrangler versions list`
- **版本歷史：** 2026-04-20 起大量版本叠代，最後穩定版本 `aa285120`
- **教訓：** Local worker.js 落後於 Cloudflare deployed 版本，未來 deploy 前必須先 sync
