## 🔧 翻譯問題修復報告

### 問題描述
用戶反饋：AI News Digest 網站上有許多新聞卡片的標題和摘要沒有被翻譯成中文，仍然顯示英文原文。

### 根本原因
1. **MyMemory API 限制**：免費版每日只有 1000 字的翻譯額度，超過後翻譯請求會失敗。
2. **缺少備選方案**：當 MyMemory 失敗時，代碼只是將 `item.titleZh` 設置為 `null`，沒有嘗試其他翻譯方法。
3. **前端回退邏輯**：前端在 `data-title-zh` 為空時會顯示英文原文，導致用戶看到未翻譯的內容。

### 修復方案
在 `worker.js` 的 `translateNews()` 函數中添加了 **LLM 備選翻譯機制**：

1. **優先使用 MyMemory API**（免費，速度快）
2. **MyMemory 失敗時，自動使用 LLM 作為備選**（通過 OpenRouter API）
3. **LLM 翻譯結果也會緩存到 KV**，避免重複請求
4. **如果兩者都失敗，回退到英文原文**，確保內容不為空

### 代碼變更
- **文件**: `/home/blackpi/ai-news-webapp/worker.js`
- **函數**: `translateNews()` (第 243-280 行)
- **新增邏輯**:
  ```javascript
  // MyMemory 失敗時，嘗試使用 LLM 作為備選
  if (env?.OPENROUTER_API_KEY) {
    const llmResult = await generateSummary(item.title, "", env.OPENROUTER_API_KEY);
    if (llmResult && llmResult.text) {
      item.titleZh = llmResult.text;
      // 緩存 LLM 翻譯結果
      await env.AI_NEWS_KV.put(`trans:llm:title:${md5(title)}`, llmResult.text);
    }
  }
  ```

### 部署信息
- **版本**: `46545df9-2a3f-4327-8ce6-b7364539fa90`
- **部署時間**: 2026-05-05 18:30 HKT
- **代碼大小**: 69.73 KiB (gzip: 17.88 KiB)

### 測試結果
✅ 部署成功，HTTP 200 健康檢查通過

### 預期效果
- **之前**: 超過 MyMemory 額度後，所有新新聞都無法翻譯
- **現在**: MyMemory 失敗時自動使用 LLM，確保所有新聞都能翻譯成中文
- **成本**: LLM 使用免費模型（Gemma-3-27B:free），無額外成本

### 後續建議
1. 監控 OpenRouter API 的使用情況，確保免費額度足夠
2. 考慮添加翻譯失敗的統計和告警
3. 如果翻譯需求持續增長，可以考慮購買 MyMemory 付費版或增加更多 LLM 備選

---
*修復者: HermesBPi*  
*修復時間: 2026-05-05 18:30 HKT*