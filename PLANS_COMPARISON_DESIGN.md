# PikAI 方案對比 Tab — 設計方案（暫停中）

**狀態：** 暫停，等 Ken 確認繼續
**日期：** 2026-07-22
**數據來源：** 官網 Firecrawl scrape + 新聞搜索核實

## 範圍
- 只做訂閱計劃對比（唔做 token 計費）
- 14 間公司，38 個方案
- 每週自動監控價格變動（半自動：scrape → 通知 → 人手確認 → deploy）

## 數據（2026-07-22 核實）

### 國際（USD/月）
| 廠商 | 方案 | 月費 | 重點 |
|------|------|------|------|
| ChatGPT | Free/Go/Plus/Pro | $0/$8/$20/$100+ | GPT-5.6, Codex, Deep Research; Pro 5x/20x |
| Claude | Free/Pro/Max | $0/$20/$100+ | Claude Code, Cowork, Design; Max 5x/20x |
| Google AI | Plus/Pro/Ultra | $9.99/$19.99/$249.99 | Gemini 3.1 Pro; HK$38/158/799 |
| Perplexity | Free/Pro/Max | $0/$20/$200 | 多模型切換, PitchBook, Computer credits |
| Grok | Free/Lite/SuperGrok/Heavy | $0/$10/$30/$300 | Heavy 包 X Premium+, 4x agents; 首3月$99 |
| Cursor | Hobby/Pro/Pro+/Ultra | $0/$20/$60/$200 | Agent coding, Grok 4.5; Pro+ 3x, Ultra 20x |
| Copilot | Free/Pro/Pro+/Max | $0/$10/$39/$100 | 2000 completions → $200 credits |
| X Premium | Basic/Premium/Premium+ | $3/$8/$40 | 藍剔, 減廣告, Grok 限額 |

### 中國大陸（RMB/月）
| 廠商 | 方案 | 月費 | 重點 |
|------|------|------|------|
| Kimi | Adagio/Andante/Moderato/Allegretto/Allegro | ¥0/¥49/¥99/¥199/¥699 | Agent 額度池, Kimi Code 獨立池 |
| 豆包 | 免費/標準/加強/專業 | ¥0/¥68/¥200/¥500 | 2026年6月開始收費; 大學生半價 |
| 智譜清言 | 免費/VIP/SVIP | ¥0/¥79/¥229 | GLM; Coding Plan ¥49-469 |
| 訊飛星火 | 免費/會員 | ¥0/¥49 | 深度研究, AI 寫作 |
| DeepSeek | 完全免費 | ¥0 | 冇訂閱, API 先收費 |
| 文心一言 | 免費 | ¥0 | 2025年4月起全面免費 |

### 未核實
- Midjourney（官網擋爬蟲）

## 設計
- 新 tab：💰 方案對比（排喺 AI 知識庫後面）
- 分類 filter：全部 / 🌍 國際 / 🇨🇳 大陸 / 💻 Coding 專用
- 廠商卡片：每間列出所有 tier 價錢 + 3 個重點 feature
- 對比模式：剔選任意 2 個方案 → side-by-side 對比表
  - 自動 highlight 平/貴（綠/紅）
  - 獨有功能 ⭐
  - 跨幣種換算（1 USD≈7.8 HKD, 1 RMB≈1.08 HKD）
- 頂部標註「最後更新：2026-07-22」
- 手機版橫向 scroll

## 技術
- PLANS_DATA object hardcode（~150 行）+ UI/對比 JS（~250 行）
- 零新 API、零 KV、零成本
- 改價 = 改一個 object → push → CI deploy

## 每週更新（半自動）
- update-plans.py：Firecrawl scrape 所有官網 → 對比上次數據
- 有變動 → Telegram 通知 → 人手確認 → 改 PLANS_DATA → push
- 冇變動 → 靜默
- Cron：每週一 09:00 HKT

## 工作量估算
- 新 tab + 對比功能：~2h
- update-plans.py + cron：~30min
- 測試 + 部署驗證：~30min
