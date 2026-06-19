# Plan: Batch Translation + NVIDIA Fallback for All News/Tools
**Created**: 2026-05-14 09:45
**Status**: PENDING APPROVAL

## Goal
每日抓取到嘅所有新聞同工具都翻譯，用 batch + delay 避免超時，NVIDIA API 做 fallback。

## Context
- 而家只翻譯 6 新聞 + 6 工具
- Workers AI quota 有限
- NVIDIA API key 已提供，無免費版限制

## Approach

### Step 1: 改 `fetchNewsData()` — 全部新聞 batch 翻譯
- Batch size: 5 篇
- Batch 之間 delay: 2 秒
- 先用 Workers AI，quota 用完用 NVIDIA
- 有 cache 照舊 skip

### Step 2: 改 `translateTools()` — 全部工具 batch 翻譯
- Batch size: 5 個
- Batch 之間 delay: 2 秒
- 先用 Workers AI，quota 用完用 NVIDIA

### Step 3: 加 `callNvidiaAPI()` 函數
- base_url: `https://integrate.api.nvidia.com/v1`
- model: `nvidia/llama-3.1-nemotron-70b-instruct` 或類似
- 同 `callOpenRouterFree` 類似嘅 retry logic

### Step 4: Deploy & verify

## Checkpoints
1. Local lint pass
2. Deploy 成功
3. `?refresh=1` 測試 — 全部新聞/工具有中文

## Files to Modify
- `worker.js`

## Verification
- [ ] 新聞 >6 篇都有中文總結
- [ ] 工具 >6 個都有中文描述
- [ ] 無超時錯誤

## Risks
- NVIDIA API 可能 rate limit（要加 retry）
- Batch delay 令總時間變長（但應該 <30s）
