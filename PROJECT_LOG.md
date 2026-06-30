---
project: ai-news-digest
status: active
last_deploy: 2026-06-21T08:40:23+08:00
last_version: 1c58d45
last_update_by: HermesBPi
---

# AI News Digest 項目進展日誌

## 🚀 最新狀態 (2026-06-30)
**版本:** `88449db` | **部署時間:** 11:53 HKT | **狀態:** 運行中  
**代碼大小:** ~162 KiB

### 核心功能
- [x] **5-tab 佈局**: 今日必讀 / AI 影片 / 實用工具 / AI 知識庫 / 應用實例
- [x] **工具自動分類**: regex 關鍵字匹配，零 LLM 成本
- [x] **LLM 精選新聞**: OpenRouter (primary) / Workers AI (fallback)
- [x] **自動摘要**: 為缺失翻譯的文章生成 🤖 標記摘要
- [x] **AI 知識庫**: 術語表、模型選擇指南、學習路徑、MCP/Skills
- [x] **Blog 系統**: 14 篇教學文章，每日自動更新
- [x] **YouTube 影片**: 37 白名單頻道，playlistItems API，48h 時間窗
- [x] **OG Image**: 全部新聞卡片顯示圖片
- [x] **下拉刷新**: 頂部向下滑動讀取最新 cache
- [x] **觸控優化**: 左右滑動切換 tab

### 技術指標
- **API 依賴**: OpenRouter, Workers AI, NVIDIA (fallback), YouTube Data API v3
- **KV 緩存**: `news-data`, `blog-posts`, `youtube:videos:v25`, `trans:{md5}`, `ogimg:v2:{md5}`
- **Cron**: 每日 2 次 (08:00 / 18:00 HKT)
- **Cache-Control**: `no-cache, no-store, must-revalidate` (HTML 不再被瀏覽器 cache)

### 已知問題
- Token corruption (code 9109) — OpenRouter 偶爾返回損壞 token
- ESLint warnings: `yesterday` 未使用、`env` 未使用 (多處)
- `/trigger-news` Worker 反應慢（40-120s）— 因 AI summarization 同 RSS fetch 耗時
- Disk 97% full on Pi — log 檔案可能需要清理
- Wikipedia bracket HTML 結構會變，wc-knockout.py 嘅 regex parsing 需要定期驗證

---

## 📝 變更歷史

### 2026-06-30 | Minimum article threshold guard + Pi cron fix
**版本:** 88449db
- **Type**: Fix
- **Summary**: 防止低文章數量寫入 KV 破壞好 cache
- **Details**:
  - `/trigger-news` endpoint: 加入 ≥15 篇文章 threshold 保護，低於 15 唔寫入 KV
  - CF `scheduled` handler (00:00 UTC fallback): 同一保護
  - Pi cron: 移除 `-s` flag（記錄 curl errors），`--max-time` 120s → 180s
  - 配合 `?refresh=1` 已有嘅 threshold guard（2026-06-27 加入）
  - 問題鏈：Pi cron timeout → 冇寫 KV → CF fallback 寫 10 篇 → overwrite 30 篇
**版本:** 20425a9
- **Type**: 優化
- **Summary**: Bypass Pi 5 — transcript 直接由 Worker call YouTube internal API
- **Details**:
  - 新增 `fetchYouTubeTranscript()` function，取代舊有 Pi 5 Cloudflare Tunnel 方式
  - 直接 call YouTube inner API (`youtubei/v1/player`) 拎 caption tracks
  - Hardcode YouTube INNERTUBE API key (公知 key，從 YouTube page 提取)，skip HTML scraping
  - Multiple client fallback (ANDROID 20.10.38 → 19.09.35 → WEB)
  - 加 Android origin headers 提升成功率
  - 完全移除對 Pi 5 transcript-api.py 嘅依賴
  - 保持 Workers AI 總結 + KV 30 天 cache 不變
  - 直接 deploy 前: `dQw4w9WgXcQ` cached ✅ | `Db260rUuKJg` 249 chars ✅ | `eIqa3XQIbvk` 269 chars ✅ | `GcCGzfKdCd0` cached ✅
  - 約 40-50% videos 直接 work（YouTube 對 CF Workers IP 有限制，部分 videos 冇 caption data）
  - `transcript-api.py` on Pi 5 可以考慮停用

### 2026-06-06 | 修復影片 tab 非白名單影片滲透 bug
**版本:** d9ba715a  
**問題:** Normal page load 讀 `youtube:videos:v25` KV cache 時直接 assign，冇做白名單過濾。導致 AI Presents、FASTEPO 等非白名單頻道嘅影片出現喺影片 tab。  
**修復:** 喺 KV cache read 後加白名單 Set 過濾，同 `fetchYouTubeVideos` 入面一樣。觸發 `trigger-youtube` 重新 fetch 21 條白名單影片。  
**驗證:** Browser 截圖確認 — 21 條影片全部來自白名單頻道，冇 AI Presents ✅

### 2026-06-03 | 修復瀏覽器 Cache 導致影片 tab 只顯示 1 條
**版本:** 4d2658cb  
**問題:** 瀏覽器 Cache-Control 為 `max-age=86400`，KV 更新後用戶仍見舊 HTML（1 條片 vs 實際 12 條）  
**修復:** HTML 響應改為 `no-cache, no-store, must-revalidate`（2 處：news-data cache 路徑 + fallback 路徑）  
**驗證:** `curl -sI URL | grep cache-control` → `no-cache, no-store, must-revalidate` ✅

### 2026-06-02 | YouTube 白名單 + 品牌設計改版
**版本:** b652e11e  
1. YouTube 改為白名單頻道制（37 個），playlistItems API（quota 1 vs 100）
2. 品牌：Logo 字體 Honk，網頁字體 Urbanist，App icon 動態 SVG
3. Cache key 升級 `youtube:videos:v25`，stale fallback 暫時解除 fetch window

### 2026-06-01 | 設計改版 + YouTube 修復
**版本:** 50d35a4e  
- Hero 區域縮短間距、手機版 padding 修正
- YouTube 改為 search API（關鍵字搜索），syntax error 修復

### 2026-05-28 | Blog 更新：免費 AI 工具取代付費軟件
### 2026-05-27 | Blog 更新：AI 私隱保護指南
### 2026-05-14 | KV Cache + OG Image + Cron x3 + 下拉刷新 + AI Digest Badge
**版本:** 636b7ec5 — 大幅功能更新

### 2026-05-05 | 代碼恢復 + API Token 更新
**版本:** 6e80271c — 從 Cloudflare 恢復 5 月 4 日部署代碼

### 2026-05-04 | 4-tab 佈局 + LLM 精選 + 知識庫
**版本:** 9a31e811 — 重大功能更新

### 2026-04-29 | 新聞源擴充 + 觸控修復
**版本:** c942edea — 11 個新聞源，觸控閾值 50→150px

---

## 🛠️ 維護命令

```bash
# 部署（經 GitHub CI）
git add -A && git commit -m "你的改動描述"
git push origin master
# GitHub Actions 會自動 lint + deploy + verify

# 強制 YouTube 刷新
curl -s "https://pikai.isearover.workers.dev/trigger-youtube"

# 強制全量刷新
curl -s "https://pikai.isearover.workers.dev/?refresh=1"

# 查看 KV 視頻數量
source ~/.bashrc
npx wrangler kv key get news-data --namespace-id=b8dfffba53d249e2a6a73e60774217d5 --remote | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Videos: {len(d.get(\"videos\",[]))}')"
```

---

## 📌 注意事項
1. **部署**: `./deploy.sh`（ESLint + deploy + KV upload + 驗證）
2. **Token**: `~/.bashrc` 有 `CLOUDFLARE_API_TOKEN`，non-interactive shell 需 export
3. **DNS**: workers.dev 喺 Pi 上 DNS 失敗（router 問題），用 `wrangler deployments list` 驗證部署
4. **Blog KV**: deploy.sh 自動 upload `blog-posts.json` → KV

---
*最後更新: 2026-06-21 08:40 HKT by HermesBPi*

## 2026-06-03 08:06
- **Type**: 優化
- **Summary**: 修正 SVG logo 居中對齊
- **Details**:
- h1 加 margin: 0 auto; text-align: center
- svg 加 margin: 0 auto
- **Version**: 41ad71f

## 2026-06-03 12:33 - 修復：影片數據源改為 youtube:videos:v25

**問題**：影片 tab 只顯示 1 條影片。`news-data` KV 中嘅舊影片缺少 `channelId`，被白名單過濾掉。

**根因**：Worker 讀取 `news-data` 中嘅影片數據，但呢啲數據來自舊 search API 時代，冇 `channelId` 字段。`youtube:videos:v25` 有正確數據但 worker 唔會讀取。

**修復**：
- `worker.js` 正常訪問路徑改為從 `youtube:videos:v25` 讀取影片
- 移除 `news-data` 路徑中嘅白名單過濾邏輯（37行代碼）
- `youtube:videos:v25` 成為影片唯一數據源（single source of truth）
- 白名單過濾喺 YouTube cron 寫入時已完成，讀取時唔再需要

**影響**：徹底解決影片數量不穩定問題，唔會再因 `news-data` cache 導致影片消失

**Commit**: 6cf4151d-d473-4947-8cd3-d7694b69751b

## 2026-06-03 12:45 - 修復：PWA App icon 改用 SVG

**問題**：手機加入主畫面嘅 icon 顯示舊設計，唔係 Honk 字體風格

**根因**：manifest.json 只引用舊嘅 PNG icons（base64 編碼），冇引用 SVG icon

**修復**：
- manifest.json 加入 SVG icon（優先級最高）
- HTML head 加入 `<link rel="icon" type="image/svg+xml" href="/icon.svg">`
- manifest version 升級到 v=10 清除瀏覽器緩存
- 保留 PNG 做 fallback（兼容舊瀏覽器）

**影響**：手機加入主畫面時會使用新嘅 SVG icon（Honk 字體風格）

**Commit**: 205b6885-363a-41fd-9034-7b24b581874e

## 2026-06-03 19:48 - 修復：更新 PWA App icon PNG 文件

**問題**：手機加入主畫面嘅 icon 顯示「左邊一團黑右邊一團藍」，唔係正確嘅 PikAI 文字

**根因**：manifest.json 引用嘅 PNG icons 係舊設計，與 SVG icon 不一致

**修復**：
- 用 Playwright 從 SVG 截圖生成新嘅 192x192 和 512x512 PNG icons
- 替換 worker.js 中嵌入嘅舊 base64 PNG 數據
- 新 icon 與 SVG 設計一致：深色 "Pik" + 藍色 "AI" 文字路徑

**影響**：手機加入主畫面時會顯示正確嘅 PikAI 文字 icon

**Commit**: d46fc6da-e417-4873-ba1d-d9a28b8e14e7

## 2026-06-04 00:24 - 修復：更新 PWA App icon 為實際 Honk 字體

**問題**：之前嘅 icon 係手動路徑，唔係真正嘅 Honk 字體

**根因**：SVG icon 使用手動繪製嘅路徑，唔係從 Google Fonts 渲染嘅 Honk 字體

**修復**：
- 用 Playwright 從 Google Fonts 載入 Honk 字體
- 渲染 "PikAI" 文字並截圖生成新嘅 192x192 和 512x512 PNG icons
- 替換 worker.js 中嵌入嘅舊 base64 PNG 數據

**影響**：手機加入主畫面時會顯示真正嘅 Honk 字體 icon

**Commit**: 97aae416-5f54-4e9d-a451-0d3675560ed1

## 2026-06-04 00:35 - 修復：PWA icon cache-busting 徹底解決舊 icon 顯示問題

**問題**：即使更新咗 icon 數據，手機主畫面仍然顯示舊 icon

**根因**：瀏覽器/OS 緩存 PWA icon 非常激進，即使部署咗新 icon，舊 icon 仍然被緩存

**修復**：
- manifest.json icon URLs 加入 ?v=3 cache-busting
- manifest.json cache 改為 no-cache, no-store, must-revalidate
- HTML head manifest version 升級到 v=11
- HTML head icon URLs 加入 ?v=3
- PNG icon endpoints cache 改為 no-cache, no-store, must-revalidate

**影響**：徹底解決瀏覽器/OS 緩存舊 icon 的問題，確保新 icon 立即生效

**Commit**: 3e43e4d5-884f-4e2c-ad53-dd53fecfce4f

## 2026-06-04 00:45 - 修復：影片 fallback 邏輯

**問題**：下拉刷新後顯示 0 條影片

**根因**：`youtube:videos:v25` KV 被清空，worker 設定 `data2.videos = []`

**修復**：
- 當 `youtube:videos:v25` 不存在時，fallback 返用 `news-data` 入面嘅影片數據
- 唔再強制設為空數組

**影響**：即使 YouTube KV 被清空，仍然可以從 news-data cache 顯示影片

**Commit**: 882bb6f1-903a-4f36-b67f-19c550fb48dc

## 2026-06-04 00:09
- **Type**: 優化
- **Summary**: 新增第 17 篇 blog post — n8n 免費 AI 工作流教學
- **Details**:
  - Topic: n8n 免費 AI 工作流庫 — 16,000 個即用模板
  - 結合 HN 熱門趨勢 (16,223 free n8n workflows)
  - 16 → 17 篇 blog posts
  - KV + Worker 已部署驗證
- **Version**: ${VERSION}

## 2026-06-04 13:12
- **Type**: fix
- **Summary**: 影片封面改用高清圖片 (maxresdefault 1280x720)
- **Details**:
  - 影片封面由 YouTube API 的 high (480x360) 改為 maxresdefault (1280x720)
  - 直接構建 URL: https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg
  - 提升影片卡片嘅視覺質量
- **Version**: 93e9bd0

## 2026-06-05 16:12
- **Type**: fix
- **Summary**: Widen YouTube fetch window from 48h to 72h to fix stale video cache
- **Details**:
  - 將 fetchYouTubeVideos 嘅 48 小時窗口放寬到 72 小時
  - 增加影片數量（由 10 條增至 19 條）
  - 解決影片 tab 長期冇更新嘅問題
- **Version**: 57cb469

## 2026-06-05 18:28
- **Type**: fix
- **Summary**: Force cron to always fetch fresh YouTube videos, bypass 12h cache
- **Details**:
  - Scheduled handler 改為 fetchYouTubeVideos(env, true) 強制每次 cron 都 fetch
  - Cache check 加入 !force 條件，force=true 時跳過 12 小時 cache
  - 根本修復：之前 cron 每次都用舊 cache，唔 fetch 新數據
- **Version**: 7b20091

## 2026-06-06 13:51
- **Type**: 優化
- **Summary**: Workers AI model 升級：Llama 3.1 8B → GLM-4.7-Flash
- **Details**:
- 換成智譜 AI 嘅 glm-4.7-flash，專為中文優化
- 影響範圍：新聞標題翻譯、文章摘要、工具描述翻譯、AI 助手
- 4 處 env.AI.run 調用全部更新
- **Version**: 6d9209b

## 2026-06-10 08:23
- **Type**: fix
- **Summary**: Desktop layout + favicon fix
- **Details**:
1. Added max-width: 1200px + margin: 0 auto + padding: 0 1.5rem to card-grid, summarized-grid, blog-list for desktop side margins
2. Added justify-content: center to .tabs for centered tab bar
3. Replaced favicon with Honk font PNG generated via Playwright (replaces old SVG with hardcoded paths)
4. Removed SVG favicon from HTML head so PNG (with actual Honk font) is used as primary favicon
- **Version**: aaa6ca2

## 2026-06-10 08:30
- **Type**: fix
- **Summary**: Mobile tab bar left clipping
- **Details**:
Mobile (≤700px): tabs override justify-content to flex-start + add padding-left 1rem to prevent first tab being clipped by center alignment + overflow scroll
- **Version**: 642ccd1

## 2026-06-10 14:04
- **Type**: fix
- **Summary**: Block BODO AI REMIX channel from video tab
- **Details**:
Added global _blacklistIds Set with BODO AI REMIX (UCpdxWdhluGMcQ_MBhNnDNUg). Applied at all 4 data paths: cache read, stale cache, fetch filter, page load KV read.
- **Version**: 3f4d2db

## 2026-06-10 17:28
- **Type**: fix
- **Summary**: Make youtube:videos:v25 single source of truth for videos
- **Details**:
Removed videos from news-data KV writes (cron + refresh paths). Videos now ONLY come from youtube:videos:v25 which always has whitelist+blacklist filtering. No fallback to potentially unfiltered news-data videos.
- **Version**: 7928847

## 2026-06-14 19:30
- **Type**: fix
- **Summary**: 修復 Workers AI 模型名稱變更導致翻譯/摘要失效
- **Details**:
@cf/zhipu/glm-4.7-flash 已改名為 @cf/zai-org/glm-4.7-flash（Cloudflare 改咗 provider 前綴），導致全部 AI 翻譯同摘要 fallback 到英文原文。更新 4 處引用。
- **Version**: 034edd7

## 2026-06-14 20:32
- **Type**: fix
- **Summary**: 修復 Workers AI 模型名稱 + deploy hash placeholder
- **Details**:
1. @cf/zhipu/glm-4.7-flash → @cf/zai-org/glm-4.7-flash（Cloudflare 改名）
2. 修復 deployVersion hardcoded hash → DEPLOY_HASH_PLACEHOLDER（deploy.sh hash injection 之前失效）
- **Version**: 034edd7

## 2026-06-14 20:40
- **Type**: fix
- **Summary**: 修復 Workers AI 模型：glm-4.7-flash 變咗 reasoning model，改用 llama-3.3-70b
- **Details**:
@cf/zhipu/glm-4.7-flash → @cf/meta/llama-3.3-70b-instruct-fp8-fast
原因：glm-4.7-flash 改名為 @cf/zai-org/glm-4.7-flash 且變成 reasoning model（content: null，答案喺 reasoning_content），導致翻譯/摘要全部 fallback。llama-3.3-70b 穩定、快速、非 reasoning、中文能力好。
- **Version**: 034edd7

## 2026-06-14 22:07
- **Type**: feat
- **Summary**: 每來源文章數量 10→3，減少總量令 summarization loop 能完成
- **Details**:
61 篇文章 → 預計 ~30 篇，summarization 有足夠時間產出中文摘要
- **Version**: 034edd7

## 2026-06-14 22:14
- **Type**: fix
- **Summary**: 修復 Workers AI response 格式：llama-3.3-70b 返回 dict 而非 string
- **Details**:
summarizeWithWorkersAI: response.response 可能係 dict → 加 preParsed 快速路徑
translateTitleWithWorkersAI/tool translation: response.response 可能係 dict → JSON.stringify fallback
兩處 fix 確保所有 AI call 唔會因為格式問題 crash
- **Version**: 034edd7

## 2026-06-14 22:28
- **Type**: feat
- **Summary**: 先 dedup 再 summarize：減少 AI call 數量
- **Details**:
pickTopNews 移到 summarization loop 之前，25→~12 篇先 summarize
+ 修復 response 格式（dict fallback）+ 每來源 10→3 篇
- **Version**: 034edd7

## 2026-06-14 23:06
- **Type**: debug
- **Summary**: 加 debug logs 到 summarization pipeline 追蹤點解冇產出
- **Details**:
console.log 追蹤：summarizeWithWorkersAI called / response type / preParsed path / batch processing / error
- **Version**: 034edd7

## 2026-06-14 23:35
- **Type**: 修復
- **Summary**: 修復 PikAI 中文翻譯摘要 pipeline
- **Details**:
  - summarizeWithWorkersAI timeout 12s → 25s，避免 Workers AI 回應超時導致全部摘要空白
  - 修正 fetchNewsData 永遠 return 空 summarizedNews 的 bug（line 1845）
  - 修正 batch delay 判斷錯誤使用 translated.length 的問題（line 1834）
  - 同步修正 deploy.sh health check domain 為 pikai.isearover.workers.dev
- **Version**: 034edd7

## 2026-06-14 23:38
- **Type**: 修復
- **Summary**: 修復 PikAI 中文摘要缺失 — 解決 Cloudflare Workers 50 子請求限制問題
- **Details**:
  - 移除 translateNews() 呼叫：summarizeWithWorkersAI 已輸出中文標題，重複翻譯浪費 ~30 個 AI 子請求
  - 將 OG 圖片獲取改為僅使用 KV 緩存（不再發起新 fetch 請求），節省子請求
  - 將 dedup 移至 fetchNewsData 最前（pickTopNews 在 OG 和 AI 之前執行）
  - 限制文章數量上限為 10 篇（MAX_ARTICLES=10），確保在 50 子請求預算內
  - 將工具數量從 12 減至 6（GitHub 5 + ProductHunt 2），減少 AI 子請求
  - BATCH_SIZE 從 5 降至 3，BATCH_DELAY 從 2s 增至 3s
  - 增加 summarizeWithWorkersAI 的詳細日誌（RAW response 全文記錄）以調試 AI 回應格式
  - 子請求預算：~29 RSS + 0 OG新抓取 + 10 AI摘要 + 2 工具來源 + 6 工具AI + 1 YouTube ≈ 48（低於50限制）
- **Version**: 6ec6651

## 2026-06-14 23:56
- **Type**: 修復
- **Summary**: 修復 PikAI 中文標題同摘要缺失 — 解決 50 subrequest limit + timeout 問題
- **Details**:
  - **Root cause 1**: Cloudflare Workers 50 subrequest limit — summarization pipeline 做太多事（RSS + OG fetch + translateNews + summarize + tools）爆 quota，導致全部 AI 摘要失敗 fallback 到英文
  - **Root cause 2**: summarizeWithWorkersAI timeout 12s 太短 — Workers AI 回應經常超時，改為 25s
  - **Root cause 3**: fetchNewsData 永遠 return 空 summarizedNews（line 1845 bug）
  - **修復 1**: 移除 translateNews() 呼叫 — summarizeWithWorkersAI 已輸出中文標題，唔使額外 AI call
  - **修復 2**: OG 圖片改為只讀 KV cache — 唔再發新 fetch 請求
  - **修復 3**: Dedup 移到最前（pickTopNews 在 OG 和 AI 之前執行）
  - **修復 4**: 限制 MAX_ARTICLES=10，確保喺 50 subrequest 預算內
  - **修復 5**: 工具數量 12→6（GitHub 5 + ProductHunt 2），減少 AI 子請求
  - **修復 6**: BATCH_SIZE 5→3，BATCH_DELAY 2s→3s
  - **修復 7**: 修正 batch delay 判斷錯誤（translated.length → deduped.length）
  - **修復 8**: 修正 deploy.sh health check domain（ai-news-digest → pikai）
  - **子請求預算**: ~29 RSS + 0 OG新抓取 + 10 AI摘要 + 2 工具來源 + 6 工具AI + 1 YouTube ≈ 48（低於50限制）
  - **驗證**: Live site 9/10 中文標題 + 10/10 中文摘要
  - **部署 hash**: `0ad5c78d164cec70acbc1f7b04d504fd`
- **Version**: 6ec6651

## 2026-06-18 00:50
- **Type**: 修復
- **Summary**: ?refresh=1 路徑影片 tab 永遠顯示 0 條
- **Details**:
- fetchYouTubeVideos() return value 被丟棄（await 冇 assign）
- data2 缺少 videos field，generatePage() 收到 videos: undefined
- 修復：assign return value + 加入 data2.videos
- **Version**: 809fc94

## 2026-06-18 01:00
- **Type**: 優化
- **Summary**: 新聞數量由 10 → 18 篇
- **Details**:
- 增加 MAX_ARTICLES 由 10 改為 18
- Budget: 29 RSS + 18 AI = 47 subrequests，仍安全低於 50 上限
- **Version**: 809fc94

## 2026-06-18 12:09
- **Type**: fix
- **Summary**: 移除 MakeUseOf + 重啟有限度 OG 圖片抓取
- **Details**:
- 移除 MakeUseOf 新聞來源（取消來源）
- 重新啟用 OG image fetch，只限頭 5 篇冇 RSS 圖片嘅文章
- KV cache 存結果，避免重複 fetch
- 修復 ZDNet 等唔 embed 圖片嘅來源
- **Version**: 809fc94

## 2026-06-18 12:28
- **Type**: feat
- **Summary**: 冇圖時用 PikAI logo 做 fallback
- **Details**:
- OG image 存在時顯示原本圖片
- 冇 OG image 時以 PikAI logo 配漸層背景做優雅 fallback
- 取代舊有 Google favicon fallback
- **Version**: 809fc94

## 2026-06-20 20:43
- **Type**: 優化
- **Summary**: 全網英文字體由 Urbanist 切換為 Pliant
- **Details**:
  - Google Fonts import URL 更新
  - body font-family 改為 "Pliant"
  - Admin page font-family 同步更新
- **Version**: 604fd4f

## 2026-06-20 20:57
- **Type**: 優化
- **Summary**: 影片tab卡片標題字體加大及完整顯示修正
- **Details**:
  - .video-title font-size: 0.91rem → 1.05rem
  - 新增 -webkit-line-clamp: 3 確保標題完整顯示
  - line-height 調整為 1.45
- **Version**: 0be8de3

## 2026-06-20 23:09
- **Type**: 新增功能
- **Summary**: 影片加入 AI 繁體中文摘要功能
- **Details**:
  - 新增 /api/video-summary POST endpoint
  - 從 youtubetranscript.com 免費獲取字幕
  - Workers AI (llama-3.3-70b) 生成繁體中文總結
  - KV cache 30 日，重複 click 即時顯示
  - 每個影片 card 下方「🧠 摘要」按鈕
  - AI 總結區塊有 loading 狀態同錯誤提示
- **Version**: 1758990

## 2026-06-20 23:17
- **Type**: 修復
- **Summary**: 修復影片tab卡片嵌套問題
- **Details**:
因為 patch 時唔小心刪咗 card 嘅 closing </div></div>，導致每張卡片巢咗入上一張入面，卡片逐張變細
- **Version**: 33bf771

## 2026-06-21 00:28
- **Type**: 修復
- **Summary**: 修復影片 AI 摘要功能
- **Details**:
改用 YouTube InnerTube API (ANDROID client) 取代 youtubetranscript.com
- youtubetranscript.com 已改為返回 HTML 頁面，無法直接 API 取字幕
- 改用 InnerTube API 獲取 caption tracks
- 從 timedtext XML 解析字幕文字
- 支援英文/中文/粵語字幕
- **Version**: b978251

## 2026-06-21 00:49
- **Type**: 修復
- **Summary**: 修復影片 AI 摘要功能
- **Details**:
改用 YouTube InnerTube API (ANDROID client) 取代 youtubetranscript.com
- youtubetranscript.com 已改為返回 HTML 頁面，無法直接 API 取字幕
- 改用 InnerTube API 獲取 caption tracks
- 從 timedtext XML 解析字幕文字
- 支援英文/中文/粵語字幕
- **Version**: ecce82e

## 2026-06-21 00:52
- **Type**: 修復
- **Summary**: 修復影片 AI 摘要功能
- **Details**:
改用 YouTube InnerTube API (ANDROID client) 取代 youtubetranscript.com
- youtubetranscript.com 已改為返回 HTML 頁面，無法直接 API 取字幕
- 改用 InnerTube API 獲取 caption tracks
- 從 timedtext XML 解析字幕文字
- 支援英文/中文/粵語字幕
- **Version**: abcdc60

## 2026-06-21 00:58
- **Type**: 修復
- **Summary**: update tunnel URL
- **Details**:
quick tunnel regenerated, update worker.js to keep transcript API working
- **Version**: 2e972a5

## 2026-06-21 01:05
- **Type**: 修復
- **Summary**: update tunnel URL
- **Details**:
quick tunnel regenerated after service migration, new URL: celebration-suggested-nurse-estimated.trycloudflare.com
- **Version**: efaedf6

## 2026-06-21 08:30
- **Type**: 修復
- **Summary**: auto-update tunnel URL
- **Details**:
tunnel URL changed, auto-deployed by monitor
- **Version**: d4c3193

## 2026-06-21 08:40
- **Type**: 修復
- **Summary**: 影片 AI Digest 按鈕：總結後 reset 文字改為 AI Digest
- **Details**:
將 JS fetchVideoSummary() 內 3 處 btn.textContent 由「🧠 摘要」改為「🧠 AI Digest」
- **Version**: 1c58d45

## 2026-06-23 18:56
- **Type**: 優化
- **Summary**: 新增 `/trigger-news` endpoint + Pi cron 自動化新聞更新
- **Details**:
  - 新增 `/trigger-news` endpoint：call fetchNewsData + fetchToolsData → 寫入 KV `news-data`
  - Pi cron `15 */6 * * *` curl /trigger-news（每 6h :15 自動更新，同 YouTube 分開時段）
  - YouTube Pi cron `30 */6` 位置不變
  - 解決 cron 偶爾只出 10 篇新聞嘅問題（Pi residential IP 更可靠）
- **Cron 架構重整**：
  - 📰 新聞：Pi `15 */6` → `/trigger-news`（主力）
  - 🎬 YouTube：Pi `30 */6` → `/trigger-youtube`（主力）
  - 🏆 積分榜：Pi `0 7` → `wc-standings.py`（每日）
  - 🔁 CF cron `0 0` → news+tools（每日 fallback）
- **Full data flow**:
  ```
  Pi (cron) ──curl──→ Worker endpoint ──fetch──→ RSS/API
                          │
                          ▼ 寫入 KV
                     news-data / youtube:videos:v25 / worldcup-standings
                          │
                          ▼ 正常 page load
                     KV.get → generatePage() → HTML
  ```
- **Version**: 44c9341
