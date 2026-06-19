# Plan: 加 KV Cache 避免重複翻譯浪費 Quota
**Created**: 2026-05-14 09:20
**Status**: PENDING APPROVAL

## Goal
為 AI News Digest 加 KV cache 機制，已翻譯過嘅新聞/工具唔會再次 call Workers AI，避免浪費 quota。

## Context
- 而家 `?refresh=1` 會重新 fetch RSS + 重新翻譯全部內容
- Workers AI quota 有限，重複翻譯已處理過嘅內容係浪費
- 現有 KV 已儲存 `news-data`（整體 cache），但冇逐篇文章/工具級別 cache

## Approach

### Step 1: 加 `getCachedTranslation()` 函數
- KV key: `article:{md5(url)}` → `{ translatedTitle, summary, cachedAt }`
- KV key: `tool:{md5(name)}` → `{ descZh, cachedAt }`
- TTL: 7 日（避免無限增長）

### Step 2: 改 `fetchNewsData()`
- 每篇新聞 summarize 前 check KV cache
- 有 cache → 直接用，skip Workers AI
- 冇 cache → call Workers AI → save to KV

### Step 3: 改 `translateTools()`
- 每個工具 translate 前 check KV cache
- 有 cache → 直接用
- 冇 cache → call Workers AI → save to KV

### Step 4: 加 cache 清理機制
- 新聞：check `cachedAt`，超過 7 日視為過期
- 工具：check `cachedAt`，超過 7 日視為過期

## Checkpoints
1. **Code review**: 檢查 cache key collision 風險
2. **Local test**: 用 `wrangler dev` 測試 cache hit/miss
3. **Deploy & verify**: curl 驗證正常運作

## Files to Modify
- `worker.js` — 加 cache 函數 + 改動 fetchNewsData/translateTools

## Verification
- [ ] Cache hit 時唔會 call Workers AI
- [ ] Cache miss 時正常翻譯並寫入 KV
- [ ] 7 日後 cache 視為過期
- [ ] Deploy 後 curl 驗證正常

## Risks
- KV key collision（兩篇不同文章有相同 URL？理論上唔會）
- KV storage limit（每個 key ~1KB，1000 篇文章 = ~1MB，遠低於 limit）

## Questions
- TTL 7 日 OK？定係要更長/更短？
