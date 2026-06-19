# Plan: YouTube AI 熱門影片 Tab
**Created**: 2026-05-16 15:30
**Status**: PENDING APPROVAL

## Goal
為 AI News Digest 新增第 5 個 tab「🎬 AI 影片」，顯示 YouTube 熱門 AI 影片，點擊跳轉 YouTube 播放。

## Context
- 用戶已提供 YouTube Data API Key: `AIzaSyDPSJupvWvi8djnakgkZZmGsfPiUyPmVsw`
- 現有 4 個 tabs：今日必讀、實用工具、模型比較、AI 知識庫
- Worker 使用 Cloudflare Workers AI 做摘要
- KV namespace `AI_NEWS_KV` 已存在

## Approach
1. **新增 API 函數** `fetchYouTubeVideos()`：
   - 調用 `search.list?q=AI|artificial+intelligence&order=viewCount&publishedAfter=7days`
   - 再用 `videos.list` 獲取詳情（viewCount, duration, thumbnail）
   - KV cache 6 小時
   - 配額：~120 units/日（免費 10,000）

2. **新增 HTML 渲染**：
   - 複用 `summarized-card` 樣式
   - 顯示：縮圖、標題、頻道、觀看數、時長
   - 點擊跳轉 `https://youtube.com/watch?v=VIDEO_ID`

3. **新增 Tab 按鈕**：
   - 第 5 個 tab「🎬 AI 影片」
   - 切換邏輯同現有 tabs

4. **部署** `deploy.sh`

## Checkpoints
1. API Key 存入 Worker Secrets
2. `fetchYouTubeVideos()` 函數測試通過
3. HTML 渲染正常
4. 部署後 curl 驗證顯示影片

## Files to Modify
- `worker.js`（新增函數 + HTML + tab 邏輯）

## Verification
- [ ] curl `/` 顯示 5 個 tabs
- [ ] 「🎬 AI 影片」tab 顯示 10-20 個影片
- [ ] 點擊影片跳轉 YouTube
- [ ] KV cache 正常運作

## Risks
- YouTube API 配額用盡 → 優雅降級（顯示「暫無影片」）
- API Key 錯誤 → 錯誤處理 + 通知

## Questions
- 顯示幾多個影片？（建議 10-15 個）
- 縮圖尺寸？（建議 medium: 320x180）
