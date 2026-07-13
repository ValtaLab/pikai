var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// Global blacklist for YouTube channels to block (used across fetch + page load)
const _blacklistIds = new Set([
  'UCpdxWdhluGMcQ_MBhNnDNUg'
]);

const _youtubeWhitelistIds = new Set([
  'UCP7jMXSY2xbc3KCAE0MHQ-A','UCXZCJLdBC09xxGZ6gcdrc6A','UCrDwWp7EBBv4NwvScIpBDOA',
  'UCxgo0OMZU9SiaYpJsuZKWkQ','UC5qxlwEKM7-5YZudb24l0bg','UC5-pBdfdA3KUo-vq72l-umA',
  'UCHlNU7kIZhRgSbhHvFoy72w','UCpi_ULPErwrxGTDWZey5azQ','UCGSJevmBuDyxjLLOBNaYMGA',
  'UC-ew9TfeD887qUSiWWAAj1w','UCBJycsmduvYEL83R_U4JriQ','UCXuqSBlHAE6Xw-yeJA0Tunw',
  'UCMiJRAwDNSNzuYeN2uWa0pA','UCddiUEpeqJcYeBxX1IVBKvQ','UCftwRNsjfRo08xYE31tkiyw',
  'UCOmcA3f_RrH6b9NmcNa4tdg','UCCjyq_K1Xwfg8Lndy7lKMpA','UC-6OW5aJYBFM33zXQlBKPNA',
  'UCsTcErHg8oDvUnTzoqsYeNw','UCVYamHliCI9rw1tHR1xbkfw','UCbfYPyITQ-7l4upoX8nvctg',
  'UCZHmQk67mSJgfCCTn7xBfew','UCNJ1Ymd5yFuUPtn21xtRbbw','UChpleBmo18P08aKCIgti38g',
  'UCsBjURrPoezykLs9EqgamOA','UCSHZKyawb77ixDdsGog4iWA','UCXUPKJO5MZQN11PqgIvyuvQ',
  'UCvKRFNawVcuz4b9ihUTApCg','UCMLtBahI5DMrt0NPvDSoIRQ','UCR9j1jqqB5Rse69wjUnbYwA',
  'UCBa5G_ESCn8Yd4vw5U-gIcg','UCEBb1b_L6zDS3xTUrIALZOw','UCYO_jab_esuFRV4b17AJtAw',
  'UCcIXc5mJsHVYTZR1maL5l9w','UCtYLUTtgS3k1Fg4y5tAhLbw','UCTMRxtyHoE3LPcrl-kT4AQQ',
  'UC0m-80FnNY2Qb7obvTL_2fA'
]);

function filterAllowedYouTubeVideos(videos = [], logPrefix = "[YouTube]") {
  return (Array.isArray(videos) ? videos : []).filter((video) => {
    if (!video) return false;
    if (!_youtubeWhitelistIds.has(video.channelId) || _blacklistIds.has(video.channelId)) {
      console.log(`${logPrefix} REJECTED non-whitelist: "${video.channel || "Unknown"}" (${video.channelId || "missing-channel-id"})`);
      return false;
    }
    return true;
  });
}
__name(filterAllowedYouTubeVideos, "filterAllowedYouTubeVideos");

async function readYouTubeCache(env, cacheKey = "youtube:videos:v25") {
  try {
    const cached = await env.AI_NEWS_KV.get(cacheKey);
    if (!cached) return null;
    const data = JSON.parse(cached);
    const rawVideos = Array.isArray(data.videos) ? data.videos : [];
    const filteredVideos = filterAllowedYouTubeVideos(rawVideos, "[YouTube] CACHE");
    return {
      rawVideos,
      filteredVideos,
      cachedAt: data.cachedAt || null
    };
  } catch (error) {
    console.log(`[YouTube] Failed to read ${cacheKey}: ${error.message}`);
    return null;
  }
}
__name(readYouTubeCache, "readYouTubeCache");

// Cloudflare Workers AI - Summarize and translate news with Llama 3.1
// Structured JSON output with quality validation
async function batchSummarizeWithWorkersAI(articles, env) {
  console.log(`[Workers AI] batchSummarizeWithWorkersAI: ${articles.length} articles`);
  try {
    if (!env.AI || typeof env.AI.run !== 'function') {
      console.log(`[Workers AI] AI binding not available`);
      return articles.map(a => ({ translatedTitle: '', summary: '', qualityFlag: 'no_ai_binding' }));
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    let userContent = `以下有多篇英文 AI 新聞，請為每篇提供繁體中文標題同摘要。標題同摘要都必須係繁體中文，绝对唔可以用英文！\n\n`;
    articles.forEach((a, i) => {
      const desc = (a.description || a.summary || '').substring(0, 500);
      userContent += `第${i+1}篇\n標題：${a.title}\n內容：${desc}\n\n`;
    });
    userContent += `請嚴格依照以下 JSON 陣列格式輸出（跟上面順序），唔好包含任何 JSON 以外嘅文字：\n[\n  {"headline": "中文標題", "summary": "2-4句摘要"},\n  ...\n]`;
    
    const systemPrompt = `你係專業嘅科技新聞編輯，專精英譯中。你嘅任務係將英文新聞標題同內容轉化為高品質嘅繁體中文。
\n【重要】每篇都必須輸出繁體中文 headline 同 summary，絕對唔可以用英文！如果出英文就係違規！
\n【標題翻譯原則】
- 唔好直譯！理解原文意思後用自然嘅中文重新表達
- 保留英文名稱（公司名、產品名、技術名詞）
- 標題要簡潔有力，15-30 字內
- 避免語序混亂

【例子】
英文：OpenAI announces GPT-5 with breakthrough reasoning capabilities
中文：OpenAI 推出 GPT-5，大幅提升推理能力

英文：Google bets on Gemini to reinvent the smart home speaker
中文：Google 投注 Gemini 改造智慧家庭喇叭

【摘要原則】
- 準確反映原文主旨，每篇 2-4 句話
- 用淺顯語言，說明對 AI 使用者嘅意義

【輸出格式】
嚴格輸出 JSON 陣列，順序同上，每人一條。`;

    const response = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 6000,
      temperature: 0.3
    });
    clearTimeout(timeoutId);
    
    // Parse response
    let parsedArray = null;
    
    // Try direct array
    if (Array.isArray(response)) {
      parsedArray = response;
    } else if (response && response.response) {
      if (Array.isArray(response.response)) {
        parsedArray = response.response;
      } else if (typeof response.response === 'string') {
        const m = response.response.match(/\[[\s\S]*?\]/);
        if (m) try { parsedArray = JSON.parse(m[0]); } catch(e) {}
      } else if (typeof response.response === 'object') {
        const m = JSON.stringify(response.response).match(/\[[\s\S]*?\]/);
        if (m) try { parsedArray = JSON.parse(m[0]); } catch(e) {}
      }
    } else if (typeof response === 'string') {
      const m = response.match(/\[[\s\S]*?\]/);
      if (m) try { parsedArray = JSON.parse(m[0]); } catch(e) {}
    } else if (response && typeof response === 'object') {
      const m = JSON.stringify(response).match(/\[[\s\S]*?\]/);
      if (m) try { parsedArray = JSON.parse(m[0]); } catch(e) {}
    }
    
    if (parsedArray && Array.isArray(parsedArray) && parsedArray.length > 0) {
      console.log(`[Workers AI] Batch parsed ${parsedArray.length} results`);
      // Quality validation for each result
      const badPatterns = [/唔再.*之間/, /之間中/, /就.*[冇无].*再/, /[冇无].*再.*之間/, /[是係].*[冇无].*再/];
      
      return articles.map((a, i) => {
        const item = parsedArray[i] || {};
        let headline = item.headline || item.title || '';
        let summary = item.summary || item.content || '';
        
        // Quality check — flag but don't blank; let downstream decide
        const hasBadPattern = badPatterns.some(p => p.test(headline));
        const hasChinese = /[\u4e00-\u9fff]/.test(headline);
        let qualityFlag = 'ok';
        if (!headline || !hasChinese || hasBadPattern || headline.length > 80 || (headline.length > 0 && headline.length < 4)) {
          qualityFlag = 'bad_headline';
        }
        if (!summary || summary.length < 5) qualityFlag = 'too_short';
        
        return { translatedTitle: headline, summary, qualityFlag };
      });
    }
    
    console.log(`[Workers AI] Batch parse failed, returning empty`);
    return articles.map(() => ({ translatedTitle: '', summary: '', qualityFlag: 'parse_error' }));
    
  } catch (e) {
    console.log(`[Workers AI] Batch error: ${e.message}`);
    return articles.map(() => ({ translatedTitle: '', summary: '', qualityFlag: 'error' }));
  }
}
__name(batchSummarizeWithWorkersAI, 'batchSummarizeWithWorkersAI');

async function summarizeWithWorkersAI(title, description, env) {
  console.log(`[Workers AI] >>> summarizeWithWorkersAI called for: "${title.substring(0, 60)}", desc length: ${(description || '').length}`);
  try {
    // Check if AI binding exists
    if (!env.AI || typeof env.AI.run !== 'function') {
      console.log(`[Workers AI] AI binding not available: env.AI=${typeof env.AI}`);
      return { translatedTitle: '', summary: '', keyTakeaway: '', confidence: 0, qualityFlag: 'no_ai_binding' };
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout (Qwen3 30B needs more time)
    
    const systemPrompt = `你係專業嘅科技新聞編輯，專精於人工智慧領域。你嘅任務係將英文 AI 新聞轉化為高品質嘅繁體中文，幫助 AI 新手同初級開發者快速理解重點。

【標題翻譯原則】
- 唔好直譯！要理解原文意思後，用自然嘅中文重新表達
- 保留英文名稱（公司名、產品名、技術名詞）
- 標題要簡潔有力，15-30 字內
- 避免語序混亂、缺主語、缺謂語嘅問題
- 例子：
  ❌ "連接 Claude Project 後，我就唔再之間中四個應用程式"
  ✅ "連接 Claude Project 後，我不用再同時使用四個應用程式"

【摘要原則】
- 準確性：必須忠實反映原文主旨，唔可以添加原文未提及嘅資訊
- 實用性：說明呢則新聞對 AI 使用者或開發者嘅實際意義
- 簡潔性：用淺顯語言表達，避免過度技術術語

【語言規範】
- 使用繁體中文（台灣用語習慣）
- 專業術語可保留英文原文並附上中文解釋，如 "RAG (檢索增強生成)"
- 避免口語化或方言表達

【輸出格式】
請嚴格依照以下 JSON 格式輸出，唔好包含任何 JSON 以外嘅文字：
{
  "headline": "自然通順嘅中文標題（15-25字，保留英文名稱）",
  "summary": "3-4 句話嘅精華摘要，涵蓋『係咩、點解重要、對邊個有用』",
  "key_takeaway": "一句話嘅行動要點或核心洞察",
  "confidence": 8
}`;

    const response = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `標題：${title}\n內容：${description}` }
      ],
      max_tokens: 800,
      temperature: 0.3
    });
    clearTimeout(timeoutId);
    
    console.log(`[Workers AI] RAW response type: ${typeof response}, isArray: ${Array.isArray(response)}`);
    console.log(`[Workers AI] RAW response full: ${JSON.stringify(response).substring(0, 800)}`);
    
    // Detailed response inspection for debugging
    if (response && response.response) {
      console.log(`[Workers AI] response.response type: ${typeof response.response}, isNull: ${response.response === null}`);
      if (typeof response.response === 'object' && response.response !== null) {
        console.log(`[Workers AI] response.response keys: ${Object.keys(response.response).join(',')}`);
        console.log(`[Workers AI] response.response preview: ${JSON.stringify(response.response).substring(0, 300)}`);
      } else if (typeof response.response === 'string') {
        console.log(`[Workers AI] response.response (string): ${response.response.substring(0, 300)}`);
      }
    } else if (response) {
      console.log(`[Workers AI] response keys: ${Object.keys(response).join(',')}`);
      console.log(`[Workers AI] response.result: ${response?.result ? JSON.stringify(response.result).substring(0, 300) : 'N/A'}`);
    } else {
      console.log(`[Workers AI] response is null/undefined!`);
    }
    
    // Handle different response formats
    let text = '';
    let preParsed = null;
    if (typeof response === 'string') {
      text = response;
    } else if (response && response.response) {
      // Workers AI may return response as string OR as parsed object
      if (typeof response.response === 'string') {
        text = response.response;
      } else if (typeof response.response === 'object') {
        preParsed = response.response; // Already parsed JSON (e.g. llama-3.3 returns dict)
      }
    } else if (response && typeof response === 'object') {
      text = JSON.stringify(response);
    }
    
    if (preParsed) {
      // Model returned parsed object directly — use it
      console.log(`[Workers AI] PRE-PARSED path triggered. Keys: ${Object.keys(preParsed).join(',')}`);
      const headline = preParsed.headline || preParsed.title || '';
      const summary = preParsed.summary || preParsed.content || preParsed.description || '';
      const keyTakeaway = preParsed.key_takeaway || preParsed.keyTakeaway || '';
      const confidence = parseInt(preParsed.confidence) || 0;
      let qualityFlag = 'ok';
      let translatedTitle = headline;
      if (!headline || headline.length < 5 || headline.length > 40 || !/[\u4e00-\u9fff]/.test(headline)) {
        qualityFlag = 'bad_headline';
        translatedTitle = '';
      }
      console.log(`[Workers AI] PRE-PARSED result: headline="${headline.substring(0, 30)}", summary="${summary.substring(0, 50)}...", qualityFlag=${qualityFlag}`);
      return { translatedTitle, summary, keyTakeaway, confidence, qualityFlag };
    }
    
    text = text.trim();
    if (!text) {
      console.log(`[Workers AI] TEXT path: empty text after trim`);
      return { translatedTitle: '', summary: '', keyTakeaway: '', confidence: 0, qualityFlag: 'empty_response' };
    }
    
    // Try JSON parsing first
    try {
      console.log(`[Workers AI] TEXT path: attempting JSON parse on ${text.length} chars, preview: ${text.substring(0, 200)}`);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const headline = parsed.headline || '';
        const summary = parsed.summary || '';
        const keyTakeaway = parsed.key_takeaway || '';
        const confidence = parseInt(parsed.confidence) || 0;
        
        // Quality validation for headline
        let qualityFlag = 'ok';
        let translatedTitle = headline;
        
        // Check for bad translation patterns
        const badPatterns = [
          /唔再.*之間/,      // "唔再之間中"
          /之間中/,          // "之間中"
          /就.*[冇无].*再/,  // 語序混亂
          /[冇无].*再.*之間/, // 語序混亂
          /[是係].*[冇无].*再/, // 語序混亂
          /^[^，。]*就[^，。]*$/, // 句子結構不完整
        ];
        
        const hasBadPattern = badPatterns.some(p => p.test(headline));
        const hasChinese = /[\u4e00-\u9fff]/.test(headline);
        const isTooLong = headline.length > 60;
        const isTooShort = headline.length > 0 && headline.length < 8;
        
        if (hasBadPattern || !hasChinese || isTooLong || isTooShort) {
          qualityFlag = 'bad_headline';
          translatedTitle = ''; // Fallback to original title
          console.log(`[Workers AI] Bad headline detected: "${headline}", using original title`);
        }
        
        if (confidence < 7) qualityFlag = 'low_confidence';
        if (summary.length < 30) qualityFlag = 'too_short';
        if (summary.length > 300) qualityFlag = 'too_long';
        
        return {
          translatedTitle: translatedTitle,
          summary: summary,
          keyTakeaway: keyTakeaway,
          confidence: confidence,
          qualityFlag: qualityFlag
        };
      }
    } catch (jsonError) {
      console.log(`[Workers AI] JSON parse failed, falling back to regex: ${jsonError.message}`);
    }
    
    // Fallback: regex parsing for backward compatibility
    const summaryMatch = text.match(/總結[：:]\s*([\s\S]+)/);
    let summary = summaryMatch ? summaryMatch[1].trim() : text.trim();
    
    return {
      translatedTitle: '',
      summary: summary,
      keyTakeaway: '',
      confidence: 0,
      qualityFlag: 'regex_fallback'
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`[Workers AI] Timeout for ${title.substring(0, 30)}`);
    } else {
      console.log(`[Workers AI] Error: ${e.message}`);
    }
    return { translatedTitle: '', summary: '', keyTakeaway: '', confidence: 0, qualityFlag: 'error' };
  }
}
__name(summarizeWithWorkersAI, 'summarizeWithWorkersAI');

// Cloudflare Workers AI - Summarize tool functionality in Traditional Chinese
// Structured JSON output with quality validation
async function summarizeToolWithWorkersAI(name, description, env) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    const systemPrompt = `你係專業嘅技術工具介紹員。請用繁體中文簡短總結呢個工具嘅功能同用途。

【摘要原則】
- 準確性：必須忠實反映工具嘅實際功能
- 實用性：說明呢個工具對邊類用戶最有價值
- 簡潔性：3-4 句話，50-120 字

【語言規範】
- 使用繁體中文（台灣用語習慣）
- 工具名稱、技術名詞保留英文原文
- 避免口語化或方言表達

【輸出格式】
請嚴格依照以下 JSON 格式輸出，唔好包含任何 JSON 以外嘅文字：
{
  "summary": "工具功能總結（3-4句話）",
  "use_case": "最適合邊類用戶或場景使用",
  "confidence": 8
}`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `工具名稱：${name}\n工具描述：${description}` }
      ],
      max_tokens: 300,
      temperature: 0.3
    });
    clearTimeout(timeoutId);
    
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response && response.response) {
      text = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
    } else if (response && typeof response === 'object') {
      text = JSON.stringify(response);
    }
    
    text = text.trim();
    if (!text) {
      return { summary: '', useCase: '', confidence: 0, qualityFlag: 'empty_response' };
    }
    
    // Try JSON parsing first
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const summary = parsed.summary || '';
        const useCase = parsed.use_case || '';
        const confidence = parseInt(parsed.confidence) || 0;
        
        let qualityFlag = 'ok';
        if (confidence < 7) qualityFlag = 'low_confidence';
        if (summary.length < 20) qualityFlag = 'too_short';
        
        return {
          summary: summary,
          useCase: useCase,
          confidence: confidence,
          qualityFlag: qualityFlag
        };
      }
    } catch (jsonError) {
      console.log(`[Workers AI Tool] JSON parse failed, using raw: ${jsonError.message}`);
    }
    
    // Fallback: use raw text as summary
    return {
      summary: text,
      useCase: '',
      confidence: 0,
      qualityFlag: 'raw_fallback'
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log(`[Workers AI Tool] Timeout for ${name}`);
    } else {
      console.log(`[Workers AI Tool] Error: ${e.message}`);
    }
    return { summary: '', useCase: '', confidence: 0, qualityFlag: 'error' };
  }
}
__name(summarizeToolWithWorkersAI, 'summarizeToolWithWorkersAI');

// KV Cache helpers for translations (avoid re-translating same content)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function getCachedArticle(url, env) {
  try {
    const key = `article:v3:${md5(url)}`;
    const cached = await env.AI_NEWS_KV.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.cachedAt).getTime();
      if (age < CACHE_TTL_MS) {
        console.log(`[Cache] HIT article: ${url.substring(0, 50)}...`);
        return data;
      }
      console.log(`[Cache] EXPIRED article: ${url.substring(0, 50)}...`);
    }
  } catch (e) {
    console.log(`[Cache] Error reading article cache: ${e.message}`);
  }
  return null;
}
__name(getCachedArticle, 'getCachedArticle');

async function setCachedArticle(url, result, env) {
  try {
    const title = result?.translatedTitle || '';
    const summary = result?.summary || '';
    if (!/[\u4e00-\u9fff]/.test(title) || !/[\u4e00-\u9fff]/.test(summary)) {
      console.log(`[Cache] SKIP article (non-Chinese): ${url.substring(0, 50)}...`);
      return;
    }
    const key = `article:v3:${md5(url)}`;
    const data = { 
      translatedTitle: result.translatedTitle, 
      summary: result.summary,
      keyTakeaway: result.keyTakeaway,
      confidence: result.confidence,
      qualityFlag: result.qualityFlag,
      cachedAt: new Date().toISOString() 
    };
    await env.AI_NEWS_KV.put(key, JSON.stringify(data));
    console.log(`[Cache] SET article: ${url.substring(0, 50)}...`);
  } catch (e) {
    console.log(`[Cache] Error writing article cache: ${e.message}`);
  }
}
__name(setCachedArticle, 'setCachedArticle');

async function getCachedTool(name, env) {
  try {
    const key = `tool:v2:${md5(name)}`;
    const cached = await env.AI_NEWS_KV.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.cachedAt).getTime();
      if (age < CACHE_TTL_MS) {
        console.log(`[Cache] HIT tool: ${name}`);
        return data;
      }
      console.log(`[Cache] EXPIRED tool: ${name}`);
    }
  } catch (e) {
    console.log(`[Cache] Error reading tool cache: ${e.message}`);
  }
  return null;
}
__name(getCachedTool, 'getCachedTool');

async function setCachedTool(name, result, env) {
  try {
    const key = `tool:v2:${md5(name)}`;
    const data = { 
      descZh: result.summary, 
      useCase: result.useCase,
      confidence: result.confidence,
      qualityFlag: result.qualityFlag,
      cachedAt: new Date().toISOString() 
    };
    await env.AI_NEWS_KV.put(key, JSON.stringify(data));
    console.log(`[Cache] SET tool: ${name}`);
  } catch (e) {
    console.log(`[Cache] Error writing tool cache: ${e.message}`);
  }
}
__name(setCachedTool, 'setCachedTool');

async function fetchOpenRouterRankings(env) {
  // DEPRECATED: Rankings tab removed - return empty data
  return [];
}
__name(fetchOpenRouterRankings, "fetchOpenRouterRankings");

// worker.js
var NEWS_SOURCES = [
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "VentureBeat", url: "https://venturebeat.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/frontpage/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/rss" },
  { name: "Wired AI", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { name: "Artificial Intelligence News", url: "https://www.artificialintelligence-news.com/feed" },
  { name: "Ars Technica", url: "https://arstechnica.com/ai/feed/" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/" },
  { name: "MarkTechPost", url: "https://www.marktechpost.com/feed/" },
  { name: "XDA", url: "https://www.xda-developers.com/feed/" },
  { name: "GitHub Blog", url: "https://github.blog/feed/" },
  { name: "Vercel Blog", url: "https://vercel.com/atom" },
  { name: "Product Hunt", url: "https://www.producthunt.com/feed", format: "atom" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/" },
  { name: "Kilo Blog", url: "https://blog.kilo.ai/feed" },
  { name: "How-To Geek", url: "https://www.howtogeek.com/feed/" },
  { name: "ZDNet", url: "https://www.zdnet.com/news/rss.xml" },
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "AI News", url: "https://buttondown.email/ainews/rss" },
  { name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed" },
  { name: "LangChain", url: "https://blog.langchain.dev/rss.xml" },
  { name: "Import AI", url: "https://importai.substack.com/feed" },
  { name: "MIT News AI", url: "https://news.mit.edu/rss/topic/artificial-intelligence2" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/" },
  { name: "IEEE Spectrum AI", url: "https://spectrum.ieee.org/rss/topic/artificial-intelligence" },
  { name: "Towards Data Science", url: "https://towardsdatascience.com/feed" },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", format: "atom" },
  { name: "Lil'Log", url: "https://lilianweng.github.io/index.xml" },
  { name: "Interconnects", url: "https://www.interconnects.ai/feed" },
  { name: "Semianalysis", url: "https://semianalysis.com/feed/" },
  { name: "Ahead of AI", url: "https://magazine.sebastianraschka.com/feed" },
  { name: "Not Boring", url: "https://www.notboring.co/feed" },
  { name: "Stratechery", url: "https://stratechery.com/feed/" },
  { name: "Platformer", url: "https://www.platformer.news/feed" },
  { name: "The Algorithm", url: "https://www.technologyreview.com/topic/artificial-intelligence/rss/" },
  { name: "IEEE Robotics", url: "https://spectrum.ieee.org/feeds/topic/robotics.rss" },
  { name: "Robohub", url: "https://robohub.org/feed/" }
];
var EXCLUDED_DOMAINS = [
  "sina.com",
  "163.com",
  "tencent.com",
  "xinhuanet.com",
  "people.com.cn",
  "36kr.com",
  "huxiu.com",
  "sohu.com",
  "ifeng.com",
  "toutiao.com",
  "weibo.com",
  "xueqiu.com",
  "qq.com",
  "sina.cn",
  "cnn.com",
  "bbc.com",
  "nytimes.com",
  "wsj.com",
  "reuters.com"
];
function parseViewCount(viewStr) {
  if (!viewStr) return 0;
  const str = String(viewStr).trim().toUpperCase();
  if (str.endsWith('M')) {
    return parseFloat(str) * 1000000;
  } else if (str.endsWith('K')) {
    return parseFloat(str) * 1000;
  }
  return parseInt(str) || 0;
}
__name(parseViewCount, "parseViewCount");

function getGithubApiUrls() {
  const dayOfWeek = (/* @__PURE__ */ new Date()).getDay();
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const queries = [
    { q: `machine-learning language:python pushed:>${lastWeek}`, sort: "stars", name: "Trending Python AI" },
    { q: `machine-learning language:javascript pushed:>${lastWeek}`, sort: "stars", name: "Trending JS AI" },
    { q: `artificial-intelligence created:>${lastWeek}`, sort: "stars", name: "New AI Projects" },
    { q: `machine-learning language:rust pushed:>${lastWeek}`, sort: "stars", name: "Trending Rust AI" },
    { q: `artificial-intelligence pushed:>${lastWeek}`, sort: "stars", name: "Trending AI Weekly" },
    { q: `machine-learning language:go pushed:>${lastWeek}`, sort: "stars", name: "Trending Go AI" },
    { q: `deep-learning created:>${lastWeek}`, sort: "stars", name: "New AI Projects" }
  ];
  const query = queries[dayOfWeek] || queries[0];
  const encoded = encodeURIComponent(query.q);
  return { url: `https://api.github.com/search/repositories?q=${encoded}&sort=${query.sort}&order=desc&per_page=30`, name: query.name };
}
__name(getGithubApiUrls, "getGithubApiUrls");
async function fetchWithTimeout(url, options = {}, timeout = 8e3) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
__name(fetchWithTimeout, "fetchWithTimeout");
function md5(str) {
  function md5cycle(x, k) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }
  __name(md5cycle, "md5cycle");
  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32(a << s | a >>> 32 - s, b);
  }
  __name(cmn, "cmn");
  function ff(a, b, c, d, x, s, t) {
    return cmn(b & c | ~b & d, a, b, x, s, t);
  }
  __name(ff, "ff");
  function gg(a, b, c, d, x, s, t) {
    return cmn(b & d | c & ~d, a, b, x, s, t);
  }
  __name(gg, "gg");
  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  __name(hh, "hh");
  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }
  __name(ii, "ii");
  function md51(s) {
    let n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= s.length; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
    s = s.substring(i - 64);
    let tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << (i % 4 << 3);
    tail[i >> 2] |= 128 << (i % 4 << 3);
    if (i > 56) {
      md5cycle(state, tail);
      tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }
  __name(md51, "md51");
  function md5blk(s) {
    let md5blks = [], i;
    for (i = 0; i < 64; i += 4) md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    return md5blks;
  }
  __name(md5blk, "md5blk");
  let hex_chr = "0123456789abcdef".split("");
  function rhex(n) {
    let s = "", j = 0;
    for (; j < 4; j++) s += hex_chr[n >> j * 8 + 4 & 15] + hex_chr[n >> j * 8 & 15];
    return s;
  }
  __name(rhex, "rhex");
  function hex(x) {
    for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]);
    return x.join("");
  }
  __name(hex, "hex");
  function add32(a, b) {
    return a + b & 4294967295;
  }
  __name(add32, "add32");
  return hex(md51(str));
}
__name(md5, "md5");
async function translateWithMyMemory(text, fromLang = "en", toLang = "zh-TW") {
  if (!text || text.length < 2) return { success: false, text: null };
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 200))}&langpair=${fromLang}|${toLang}`;
    const resp = await Promise.race([
      fetch(url, { signal: AbortSignal.timeout(6e3) }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6e3))
    ]);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data && data.responseData && data.responseData.translatedText) {
      const translated = data.responseData.translatedText;
      // Check if quota finished (returns original text untranslated)
      if (translated === text || data.quotaFinished === true) {
        console.log(`[MyMemory] Quota finished or untranslated result for: ${text.substring(0, 30)}...`);
        return { success: false, text: null, error: "quota_finished" };
      }
      // Check if result contains Chinese characters (actual translation)
      const hasChinese = /[\u4e00-\u9fff]/.test(translated);
      if (!hasChinese && text.length > 5) {
        console.log(`[MyMemory] No Chinese in result, likely quota limit: ${text.substring(0, 30)}...`);
        return { success: false, text: null, error: "no_chinese_output" };
      }
      return { success: true, text: translated };
    }
    return { success: false, text: null };
  } catch (e) {
    return { success: false, text: null, error: e.message };
  }
}
__name(translateWithMyMemory, "translateWithMyMemory");

async function translateWithOpenRouter(text, env) {
  if (!text || text.length < 2) return { success: false, text: null };
  try {
    const prompt = `Translate the following English text to Traditional Chinese (繁體中文). Output ONLY the translation, no explanations, no notes.\n\n${text.substring(0, 500)}`;
    const result = await callOpenRouterFree(prompt, env.OPENROUTER_API_KEY, 300);
    if (result.success && result.text) {
      const translated = result.text.trim().replace(/^["']|["']$/g, '');
      const hasChinese = /[\u4e00-\u9fff]/.test(translated);
      if (hasChinese || text.length <= 5) {
        return { success: true, text: translated };
      }
      console.log(`[OpenRouter] No Chinese in result: ${translated.substring(0, 30)}...`);
      return { success: false, text: null, error: "no_chinese_output" };
    }
    return { success: false, text: null, error: "openrouter_failed" };
  } catch (e) {
    console.log(`[OpenRouter] Translation error: ${e.message}`);
    return { success: false, text: null, error: e.message };
  }
}
__name(translateWithOpenRouter, "translateWithOpenRouter");

async function translateNews(newsItems, env) {
  // Translate titles to Chinese using Workers AI
  // This ensures all news titles display in Chinese
  for (let i = 0; i < newsItems.length; i++) {
    const item = newsItems[i];
    const isChineseTitle = /[\u4e00-\u9fff]/.test(item.title);
    
    if (isChineseTitle) {
      // Already Chinese - keep as-is
      item.titleZh = item.title;
    } else {
      // English title - translate to Chinese
      try {
        const translatedTitle = await translateTitleWithWorkersAI(item.title, env);
        item.titleZh = translatedTitle || item.title;
      } catch (e) {
        console.log(`[translateNews] Failed to translate title: ${e.message}`);
        item.titleZh = item.title;
      }
    }
    
    const isChineseSummary = item.summary && /[\u4e00-\u9fff]/.test(item.summary);
    item.summaryZh = isChineseSummary ? item.summary : null;
  }
  console.log(`[Translation] Translated ${newsItems.length} article titles to Chinese`);
  return newsItems;
}

async function translateTitleWithWorkersAI(title, env) {
  try {
    if (!env.AI || typeof env.AI.run !== 'function') {
      return '';
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for title only
    
    const systemPrompt = `你係專業嘅科技新聞編輯。將以下英文新聞標題翻譯為自然通順嘅繁體中文標題。

【原則】
- 唔好直譯！理解意思後用中文重新表達
- 保留英文名稱（公司名、產品名、技術名詞）
- 標題簡潔有力，15-30字內
- 只輸出標題，唔好解釋

【例子】
英文：DeepMind's Hassabis sees humanity "in the foothills of the singularity"
中文：DeepMind Hassabis 認為人類正處於奇點前哨

英文：I paid for Claude, ChatGPT, and Perplexity for a month but only one of them deserves my $20
中文：實測比較：Claude、ChatGPT、Perplexity 邊個值得付費`;

    const response = await env.AI.run('@cf/qwen/qwen3-30b-a3b-fp8', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `標題：${title}` }
      ],
      max_tokens: 200,
      temperature: 0.3
    });
    clearTimeout(timeoutId);
    
    let text = '';
    if (typeof response === 'string') {
      text = response;
    } else if (response && response.response) {
      text = typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
    } else if (response && typeof response === 'object') {
      text = JSON.stringify(response);
    }
    
    text = text.trim();
    
    // Clean up - remove quotes and extra text
    text = text.replace(/^["']|["']$/g, '').trim();
    
    // Validate: must contain Chinese characters
    if (!/[\u4e00-\u9fff]/.test(text)) {
      console.log(`[translateTitle] No Chinese in translation: "${text}"`);
      return '';
    }
    
    // Validate: reasonable length
    if (text.length < 5 || text.length > 60) {
      console.log(`[translateTitle] Bad length (${text.length}): "${text}"`);
      return '';
    }
    
    console.log(`[translateTitle] "${title.substring(0,40)}..." → "${text}"`);
    return text;
    
  } catch (e) {
    console.log(`[translateTitle] Error: ${e.message}`);
    return '';
  }
}
__name(translateNews, "translateNews");
async function callOpenRouterFree(prompt, apiKey, maxTokens = 120) {
  const models = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free"
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of models) {
      try {
        const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You are a professional AI news summarizer. Generate concise, accurate summaries in Traditional Chinese." },
              { role: "user", content: prompt }
            ],
            max_tokens: maxTokens,
            temperature: 0.3
          })
        }, 30e3);
        
        if (response.status === 429) {
          console.log(`[OpenRouter] ${model} rate limited, waiting...`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        
        if (!response.ok) {
          console.log(`[OpenRouter] ${model} failed: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || "";
        if (content.length > 10) {
          return { success: true, text: content, model };
        }
      } catch (e) {
        console.log(`[OpenRouter] ${model} error: ${e.message}`);
      }
    }
    
    // Exponential backoff between attempts
    if (attempt < 2) {
      const delay = 3000 * Math.pow(2, attempt);
      console.log(`[OpenRouter] Retry attempt ${attempt + 1}, waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  return { success: false, text: null, model: null };
}
__name(callOpenRouterFree, "callOpenRouterFree");

// NVIDIA API fallback for translations
async function callNvidiaAPI(prompt, apiKey, maxTokens = 500) {
  const models = [
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "nvidia/nemotron-4-340b-instruct"
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of models) {
      try {
        const response = await fetchWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { 
            "Authorization": `Bearer ${apiKey}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You are a professional translator. Respond in Traditional Chinese (繁體中文) only." },
              { role: "user", content: prompt }
            ],
            max_tokens: maxTokens,
            temperature: 0.3
          })
        }, 30e3);
        
        if (response.status === 429) {
          console.log(`[NVIDIA] ${model} rate limited, waiting...`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        
        if (!response.ok) {
          console.log(`[NVIDIA] ${model} failed: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim() || "";
        if (content.length > 10) {
          return { success: true, text: content, model };
        }
      } catch (e) {
        console.log(`[NVIDIA] ${model} error: ${e.message}`);
      }
    }
    
    if (attempt < 2) {
      const delay = 3000 * Math.pow(2, attempt);
      console.log(`[NVIDIA] Retry attempt ${attempt + 1}, waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  return { success: false, text: null, model: null };
}
__name(callNvidiaAPI, "callNvidiaAPI");

async function generateSummary(title, originalSummary, apiKey) {
  try {
    const prompt = originalSummary.length > 20 ? `Title: ${title}
Summary: ${originalSummary.substring(0, 300)}

Generate a concise 1-2 sentence summary in Traditional Chinese (\u7E41\u9AD4\u4E2D\u6587). Focus on the key point and practical significance. Respond with ONLY the Chinese summary, no other text.` : `Title: ${title}

This article has no summary available. Based on the title, generate a 1-2 sentence summary in Traditional Chinese (\u7E41\u9AD4\u4E2D\u6587) about what this AI news likely covers. Respond with ONLY the Chinese summary, no other text.`;
    const result = await callOpenRouterFree(prompt, apiKey, 120);
    if (result.success && result.text.length < 300) {
      return { success: true, text: "\u{1F916} " + result.text };
    }
    throw new Error("Invalid summary");
  } catch (e) {
    console.log(`[generateSummary] Failed: ${e.message}`);
    return { success: false, text: null };
  }
}
__name(generateSummary, "generateSummary");
async function translateTools(tools, env) {
  // Summarize ALL tools with Workers AI + NVIDIA fallback (batch to avoid timeout)
  console.log(`[translateTools] Summarizing ALL ${tools.length} tools with Workers AI (cached)...`);
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 500; // 0.5s between batches (Qwen3 30B is fast)
  
  for (let batchStart = 0; batchStart < tools.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, tools.length);
    console.log(`[translateTools] Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchStart}-${batchEnd-1}`);
    
    // Phase 1: Check cache for each tool in batch
    const uncached = [];
    const results = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const tool = tools[i];
      const cacheKey = `tool:desc:${md5(tool.name + tool.url)}`;
      try {
        const cached = await env.AI_NEWS_KV.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          tool.descZh = parsed.descZh;
          console.log(`[translateTools] Cache hit: "${tool.name}"`);
          continue;
        }
      } catch (_e) { /* KV miss */ }
      uncached.push({ index: i, tool });
    }
    
    // Phase 2: Batch AI summarize for uncached tools
    if (uncached.length > 0) {
      console.log(`[translateTools] Batch AI for ${uncached.length} uncached tools`);
      const prompt = `你係一個科技編輯。請用繁體中文（香港用語）為以下 AI 工具/專案撰寫一句中文簡介（15-30字）。保持自然，唔好直譯。\n\n工具列表：\n${uncached.map((u, idx) => `${idx + 1}. 名稱：${u.tool.name}\n   描述：${(u.tool.description || u.tool.name).substring(0, 200)}`).join('\n')}\n\n請以 JSON 陣列格式回應，每個項目包含 "index" 同 "descZh" 欄位：\n[{"index": 0, "descZh": "..."}, {"index": 1, "descZh": "..."}]`;
      
      try {
        const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
          messages: [
            { role: 'system', content: '你係一個科技編輯，擅長用繁體中文簡介 AI 工具。只輸出 JSON。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800
        });
        
        const text = typeof aiResult === 'object' && aiResult.response ? 
          (typeof aiResult.response === 'string' ? aiResult.response : JSON.stringify(aiResult.response)) :
          (typeof aiResult === 'object' ? aiResult.response?.response || JSON.stringify(aiResult) : String(aiResult));
        
        let parsed;
        try { parsed = JSON.parse(text); } catch {
          const arrMatch = text.match(/\[[\s\S]*?\]/);
          if (arrMatch) { try { parsed = JSON.parse(arrMatch[0]); } catch {} }
        }
        
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.index === 'number' && item.descZh) {
              const original = uncached[item.index];
              if (original) {
                original.tool.descZh = item.descZh;
                const cacheKey = `tool:desc:${md5(original.tool.name + original.tool.url)}`;
                try {
                  await env.AI_NEWS_KV.put(cacheKey, JSON.stringify({ descZh: item.descZh }));
                } catch (_e) { /* KV write fail */ }
              }
            }
          }
        }
      } catch (e) {
        console.log(`[translateTools] AI batch failed: ${e.message}`);
      }
    }
    
    // Delay between batches (except last)
    if (batchEnd < tools.length) {
      console.log(`[translateTools] Batch complete, waiting ${BATCH_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }
  return tools;
}
__name(translateTools, "translateTools");
function parseItemXml(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = xml.match(regex);
  if (!match) return "";
  let content = match[1];
  content = content.replace(/^<!\[CDATA\[\s*/, "").replace(/\s*\]\]>$/, "");
  content = content.replace(/<[^>]*>/g, "").trim();
  // Decode common HTML entities
  content = content.replace(/&#8217;/g, "'")
                   .replace(/&#8216;/g, "'")
                   .replace(/&#8220;/g, '"')
                   .replace(/&#8221;/g, '"')
                   .replace(/&#8212;/g, "—")
                   .replace(/&#8230;/g, "…")
                   .replace(/&#x27;/g, "'")
                   .replace(/&#x2019;/g, "'")
                   .replace(/&#039;/g, "'")
                   .replace(/&#39;/g, "'")
                   .replace(/&amp;/g, "&")
                   .replace(/&lt;/g, "<")
                   .replace(/&gt;/g, ">")
                   .replace(/&quot;/g, '"')
                   .replace(/&apos;/g, "'");
  return content;
}
__name(parseItemXml, "parseItemXml");
function parseRSS(xmlText, sourceName, format = "rss", isAIOOnly = false) {
  const results = [];
  const isAtom = format === "atom";
  const itemRegex = isAtom ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi : /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  const AI_KEYWORDS = ["AI", "Artificial Intelligence", "Machine Learning", "Deep Learning", "Neural Network", "LLM", "ChatGPT", "OpenAI", "GPT", "Gemini", "Claude", "Anthropic", "Stable Diffusion", "Midjourney", "AI Model", "Transformer", "Diffusion", "MCP", "Agent", "Copilot", "Cursor", "Perplexity", "Llama", "Mistral", "Qwen", "DeepSeek", "Hugging Face", "Reinforcement Learning", "Computer Vision", "NLP", "RAG", "Fine-tuning", "Prompt Engineering", "Generative AI", "Multimodal", "Inference", "Token", "Embedding", "Vector", "Dataset", "Benchmark", "GPU", "CUDA", "PyTorch", "TensorFlow", "JAX", "ONNX", "Quantization", "Pruning", "Distillation", "Synthetic Data", "AI Safety", "Alignment", "Hallucination", "Reasoning", "Chain of Thought", "Function Calling", "Tool Use", "Code Generation", "Text-to-Image", "Text-to-Video", "Voice Clone", "TTS", "ASR", "OCR", "Cognitive", "Autonomous", "Robotics", "Brain-Computer", "Neuromorphic", "Federated Learning", "Edge AI", "On-device", "Local LLM", "Open Source AI", "Foundation Model", "MoE", "Mixture of Experts", "State Space", "Mamba", "Diffusion Model", "Flow Matching", "Consistency Model", "VAE", "GAN", "Autoencoder", "Self-supervised", "Contrastive Learning", "Instruction Tuning", "RLHF", "DPO", "GRPO", "PPO", "LoRA", "QLoRA", "Adapter", "Prefix Tuning", "BitNet", "GGUF", "AWQ", "GPTQ", "ExLlama", "vLLM", "TGI", "Triton", "OpenVINO", "TensorRT", "CoreML", "WebNN", "WebGPU", "WASM", "WASI", "Serverless", "Inference API", "Model Hub", "Weights", "Checkpoint", "Safetensors", "Pickle", "ONNX Runtime", "DirectML", "ROCm", "OneAPI", "SYCL", "OpenCL", "Metal", "Vulkan", "SPIR-V", "IREE", "MLIR", "XLA", "JAX", "Flax", "Haiku", "Equinox", "Keras", "FastAI", "Lightning", "Accelerate", "Transformers", "Diffusers", "Tokenizers", "Datasets", "Evaluate", "PEFT", "TRL", "Unsloth", "Axolotl", "LlamaFactory", "Ollama", "LM Studio", "GPT4All", "LocalAI", "Text Generation", "Inference Engine", "Model Serving", "Batch Inference", "Streaming", "SSE", "WebSocket", "gRPC", "REST API", "GraphQL", "OpenAPI", "Swagger", "FastAPI", "Flask", "Django", "Express", "Next.js", "Nuxt", "SvelteKit", "Astro", "Remix", "SolidStart", "Qwik", "Fresh", "Hono", "Elysia", "Nitro", "Vite", "Rollup", "esbuild", "SWC", "Turbopack", "Bun", "Deno", "Node.js", "Python", "Rust", "Go", "Zig", "Mojo", "Julia", "R", "MATLAB", "Scala", "Kotlin", "Swift", "Dart", "Flutter", "React Native", "Expo", "Ionic", "Capacitor", "Tauri", "Electron", "Wails", "Fyne", "GTK", "Qt", "SDL", "Raylib", "Bevy", "Godot", "Unity", "Unreal", "Blender", "Maya", "Houdini", "Cinema 4D", "After Effects", "Premiere", "DaVinci", "Final Cut", "OBS", "Streamlabs", "FFmpeg", "GStreamer", "WebRTC", "RTMP", "HLS", "DASH", "WebCodecs", "MediaRecorder", "Canvas", "WebGL", "WebGPU", "Three.js", "Babylon.js", "PlayCanvas", "Phaser", "PixiJS", "Regl", "LumaGL", "deck.gl", "kepler.gl", "D3.js", "Observable", "Vega", "Vega-Lite", "Altair", "Plotly", "Bokeh", "Matplotlib", "Seaborn", "ggplot2", "tidyverse", "pandas", "NumPy", "SciPy", "scikit-learn", "XGBoost", "LightGBM", "CatBoost", "Optuna", "Ray", "Dask", "Modin", "Polars", "DuckDB", "SQLite", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "OpenSearch", "Solr", "Meilisearch", "Typesense", "Pinecone", "Weaviate", "Milvus", "Qdrant", "Chroma", "pgvector", "Faiss", "Annoy", "HNSW", "ScaNN", "Voyager", "USearch", "Marqo", "Jina", "DocArray", "LangChain", "LlamaIndex", "Haystack", "Semantic Kernel", "AutoGen", "CrewAI", "LangGraph", "Flowise", "n8n", "Make", "Zapier", "IFTTT", "Pipedream", "Temporal", "Cadence", "Camunda", "Airflow", "Prefect", "Dagster", "Mage", "Kestra", "Orchestrator", "Metaflow", "Kubeflow", "MLflow", "Weights \u0026 Biases", "Comet", "Neptune", "DVC", "CML", "Great Expectations", "Pandera", "Evidently", "WhyLabs", "Arize", "Fiddler", "Truera", "Arthur", "Aporia", "Mona", "Whylabs", "Evidently AI", "Deepchecks", "TensorBoard", "WandB", "ClearML", "Polyaxon", "Seldon", "KServe", "BentoML", "Cog", "Banana", "Replicate", "Modal", "Beam", "RunPod", "Vast.ai", "Lambda Labs", "CoreWeave", "Paperspace", "Jarvislabs", "Lightning AI", "Saturn Cloud", "Coiled", "Anyscale", "Ray Serve", "Ray Train", "Ray Tune", "Ray RLlib", "Ray Data", "Spark", "Flink", "Kafka", "Pulsar", "NATS", "RabbitMQ", "ZeroMQ", "Redis Streams", "AWS Kinesis", "Google Pub/Sub", "Azure Event Hubs", "Cloudflare Queues", "SQS", "SNS", "EventBridge", "Step Functions", "Logic Apps", "Power Automate", "Zapier", "Make", "n8n", "Huginn", "Node-RED", "Home Assistant", "OpenHAB", "HomeKit", "Matter", "Thread", "Zigbee", "Z-Wave", "Bluetooth LE", "UWB", "NFC", "RFID", "LoRa", "Sigfox", "NB-IoT", "LTE-M", "5G", "WiFi 6", "WiFi 7", "Matter", "ESP32", "Raspberry Pi", "Arduino", "MicroPython", "CircuitPython", "TinyML", "Edge Impulse", "Arduino Cloud", "PlatformIO", "Zephyr", "FreeRTOS", "RIOT", "Contiki", "TinyOS", "NuttX", "ChibiOS", "RT-Thread", "Micropython", "Lua", "JavaScript", "TypeScript", "WASM", "WASI", "AssemblyScript", "Grain", "Motoko", "Rust", "TinyGo", "Nim", "Crystal", "V", "Odin", "Jai", "Zig", "Carbon", "Cpp2", "Circle", "D", "Nim", "Crystal", "V", "Odin", "Jai", "Zig", "Carbon", "Cpp2", "Circle"];
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const title = parseItemXml(itemXml, "title");
    let link = "";
    if (isAtom) {
      const linkMatch = itemXml.match(/<link[^>]*href="([^"]*)"[^>]*>/i);
      link = linkMatch ? linkMatch[1] : parseItemXml(itemXml, "link");
    } else {
      link = parseItemXml(itemXml, "link");
    }
    const description = parseItemXml(itemXml, "description") || parseItemXml(itemXml, "summary") || parseItemXml(itemXml, "content") || parseItemXml(itemXml, "content:encoded") || parseItemXml(itemXml, "dc:description");
    // Clean arXiv metadata prefix and HTML img tags
    const cleanDescription = description ? description.replace(/^arXiv:\d+\.\d+v\d+\s+Announce\s+Type:\s*\w+\s+Abstract:\s*/i, "").replace(/^Abstract:\s*/i, "").replace(/&lt;img[^&]*&gt;/gi, "").replace(/<img[^>]*>/gi, "").trim() : "";
    const pubDate = parseItemXml(itemXml, "pubDate") || parseItemXml(itemXml, "published") || parseItemXml(itemXml, "updated");
    // Extract image from enclosure or media:content
    let image = "";
    const enclosureMatch = itemXml.match(/<enclosure[^>]*url="([^"]*)"[^>]*type="image\/[^"]*"[^>]*>/i) || itemXml.match(/<enclosure[^>]*type="image\/[^"]*"[^>]*url="([^"]*)"[^>]*>/i);
    if (enclosureMatch) {
      image = enclosureMatch[1];
    } else {
      const mediaMatch = itemXml.match(/<media:content[^>]*medium="image"[^>]*url="([^"]*)"[^>]*>/i) || itemXml.match(/<media:content[^>]*url="([^"]*)"[^>]*medium="image"[^>]*>/i) || itemXml.match(/<media:content[^>]*url="([^"]*)"[^>]*type="image\/[^"]*"[^>]*>/i);
      if (mediaMatch) image = mediaMatch[1];
    }
    if (!title || !link) continue;
    const isExcluded = EXCLUDED_DOMAINS.some((domain) => link.includes(domain));
    if (isExcluded) continue;
    const titleLower = title.toLowerCase();
    // Use word-boundary matching to avoid false positives like "Exclusive" containing "AI"
    const aiMatches = AI_KEYWORDS.filter((kw) => {
      const kwLower = kw.toLowerCase();
      // For short keywords like "AI", require word boundaries (space, punctuation, start/end)
      if (kwLower === "ai") {
        const regex = new RegExp("(^|\\s|[^a-z])ai($|\\s|[^a-z])", "i");
        return regex.test(titleLower);
      }
      return titleLower.includes(kwLower);
    }).length;
    const strongKeywords = ["LLM", "GPT", "ChatGPT", "OpenAI", "Anthropic", "Gemini", "Claude", "Stable Diffusion", "Midjourney", "Machine Learning", "Deep Learning"];
    const hasStrong = strongKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));
    const isAIRelated = isAIOOnly || aiMatches >= 1 || hasStrong;
    results.push({
      title,
      url: link,
      summary: cleanDescription ? cleanDescription.substring(0, 300) : "\u{1F4D6} \u9EDE\u64CA\u95B1\u8B80\u5168\u6587 \u2192",
      source: sourceName,
      pubDate,
      isAIRelated,
      hasSummary: !!cleanDescription,
      ogImage: image
    });
  }
  return results;
}
__name(parseRSS, "parseRSS");
async function fetchAINews() {
  const allNews = [];
  // Sources that are 100% AI-focused - skip keyword filtering
  const AI_ONLY_SOURCES = new Set([
    "OpenAI", "AI News", "LangChain", "Import AI", "MIT News AI", 
    "VentureBeat AI", "IEEE Spectrum AI", "Towards Data Science",
    "Artificial Intelligence News", "Ars Technica", "Hugging Face",
    "The Decoder", "MarkTechPost", "Google AI Blog", "Kilo Blog",
    "Wired AI", "Semianalysis", "Ahead of AI", "The Algorithm"
  ]);
  
  // Parallel fetch all sources - limit 10 per source for diversity
  const MAX_PER_SOURCE = 10;
  const results = await Promise.all(
    NEWS_SOURCES.map(async (source) => {
      try {
        const response = await fetchWithTimeout(source.url, {
          headers: { "User-Agent": "AI-News-Digest/1.0" }
        }, 6e3); // 6s timeout per source
        if (!response.ok) {
          console.log(`${source.name}: HTTP ${response.status}`);
          return [];
        }
        const xmlText = await response.text();
        const isAIOOnly = AI_ONLY_SOURCES.has(source.name);
        const news = parseRSS(xmlText, source.name, source.format || "rss", isAIOOnly);
        const aiNews = news.filter((n) => n.isAIRelated).slice(0, MAX_PER_SOURCE);
        console.log(`${source.name}: ${news.length} total, ${aiNews.length} AI-related (limited to ${MAX_PER_SOURCE})${isAIOOnly ? ' [AI-only source]' : ''}`);
        return aiNews;
      } catch (e) {
        console.log(`Failed to fetch ${source.name}: ${e.message}`);
        return [];
      }
    })
  );
  
  for (const aiNews of results) {
    allNews.push(...aiNews);
  }
  
  console.log(`Total AI news before dedup: ${allNews.length}`);
  const seenUrls = /* @__PURE__ */ new Set();
  const seenTitles = /* @__PURE__ */ new Set();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1e3);
  allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return allNews.filter((item) => {
    // Deduplicate by URL
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    // Deduplicate by title similarity (fuzzy matching for same news from different sources)
    const normalizedTitle = item.title.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '') // Keep only Chinese chars, letters, numbers
      .substring(0, 30); // First 30 chars for comparison
    if (seenTitles.has(normalizedTitle)) {
      console.log(`[DEDUP] Similar title filtered: ${item.title.substring(0, 50)}...`);
      return false;
    }
    seenTitles.add(normalizedTitle);
    const pubDate = new Date(item.pubDate);
    if (isNaN(pubDate.getTime())) return false;
    if (pubDate < cutoff) {
      console.log(`[FILTER] ${item.title.substring(0, 50)}... is older than 24h (${item.pubDate})`);
      return false;
    }
    return true;
  });
}
__name(fetchAINews, "fetchAINews");
function categorizeTool(name, description) {
  const text = (name + " " + (description || "")).toLowerCase();
  const categories = [];
  if (/\b(code|coding|program|developer|dev|ide|editor|lint|format|debug|compiler|interpreter|syntax|language|typescript|python|rust|go|java|cpp|c\+\+|shell|cli|terminal|git|github|gitlab|repo|repository|commit|pr|pull.request|merge|build|ci|cd|devops|docker|kubernetes|k8s|deploy|serverless|api|sdk|framework|library|package|module|npm|pip|cargo|maven|gradle|cmake|make|build|webpack|vite|rollup|esbuild|bundler|transpile|compile|runtime|vm|jvm|wasm|webassembly)\b/.test(text)) categories.push("\u7A0B\u5F0F\u7DE8\u5BEB");
  if (/\b(design|ui|ux|interface|graphic|image|photo|video|audio|music|sound|voice|speech|tts|animation|3d|render|modeling|texture|shader|canvas|svg|icon|logo|font|typography|color|palette|theme|style|css|scss|tailwind|bootstrap|component|widget|layout|grid|flexbox|responsive|mobile|app|pwa|web|frontend|frontend|react|vue|angular|svelte|next|nuxt|astro|solid)\b/.test(text)) categories.push("\u8A2D\u8A08\u8207\u524D\u7AEF");
  if (/\b(research|paper|academic|science|scientific|dataset|benchmark|evaluation|metric|llm|lm|language.model|transformer|attention|gpt|bert|llama|mistral|claude|gemini|openai|anthropic|google|meta|microsoft|huggingface|hf|model|weights|checkpoint|finetune|fine.tune|pretrain|pre.train|train|training|inference|deploy|serving|quantization|prune|distill|rlhf|alignment|safety|eval|leaderboard|arena|chatbot|agent|rag|retrieval|embedding|vector|search|semantic|nlp|cv|computer.vision|multimodal|audio|speech|tts|asr|ocr|gan|diffusion|stable.diffusion|midjourney|dalle|sora)\b/.test(text)) categories.push("\u7814\u7A76\u8207\u6A21\u578B");
  if (/\b(automation|automate|workflow|pipeline|bot|crawler|scraper|scheduler|cron|task|job|batch|process|integration|connector|bridge|adapter|plugin|extension|addon|middleware|proxy|gateway|load.balancer|cache|cdn|storage|database|db|sql|nosql|vector.db|redis|mongodb|postgres|sqlite|orm|query|search|index|analytics|monitor|log|trace|observability|alert|notification|webhook|event|stream|queue|message|pub.sub|kafka|rabbitmq|mqtt|grpc|rest|graphql|websocket|socket|tcp|udp|http|https|ssl|tls|auth|oauth|jwt|sso|iam|permission|role|security|encrypt|hash|cipher|vpn|firewall|waf)\b/.test(text)) categories.push("\u81EA\u52D5\u5316\u8207\u57FA\u790E\u8A2D\u65BD");
  if (categories.length === 0) categories.push("\u901A\u7528\u5DE5\u5177");
  return categories.slice(0, 2);
}
__name(categorizeTool, "categorizeTool");
async function fetchGithubTools() {
  try {
    const { url, name } = getGithubApiUrls();
    console.log(`[GitHub] Fetching: ${name} | URL: ${url.substring(0, 80)}...`);
    
    let response;
    try {
      response = await fetchWithTimeout(url, {
        headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "AI-News-Digest/1.0" }
      }, 15e3);
      console.log(`[GitHub] Response received: status=${response.status}, ok=${response.ok}`);
    } catch (fetchError) {
      console.log(`[GitHub] Fetch error: ${fetchError.name}: ${fetchError.message}`);
      return [];
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.log(`[GitHub] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return [];
    }
    
    let data;
    try {
      data = await response.json();
      console.log(`[GitHub] JSON parsed: total_count=${data.total_count || 0}`);
    } catch (jsonError) {
      console.log(`[GitHub] JSON parse error: ${jsonError.message}`);
      return [];
    }
    
    const items = (data.items || []).slice(0, 12).map((repo) => ({
      name: repo.full_name,
      url: repo.html_url,
      description: repo.description || "No description",
      stars: repo.stargazers_count,
      language: repo.language,
      avatar: repo.owner?.avatar_url,
      pushedAt: repo.pushed_at,
      categories: categorizeTool(repo.full_name, repo.description),
      sourceLabel: name
    }));
    console.log(`[GitHub] ${name}: ${items.length} tools mapped`);
    return items;
  } catch (e) {
    console.log(`[GitHub] Unexpected error: ${e.name}: ${e.message}`);
    return [];
  }
}
__name(fetchGithubTools, "fetchGithubTools");
function getFallbackTools() {
  return [
    { name: "Claude Code", url: "https://github.com/anthropics/anthropic-cookbook", description: "Anthropic's official coding assistant with agentic capabilities", stars: 15000, language: "Python", avatar: null, pushedAt: new Date().toISOString(), categories: ["Coding"], sourceLabel: "GitHub" },
    { name: "Ollama", url: "https://github.com/ollama/ollama", description: "Run LLMs locally with one command", stars: 120000, language: "Go", avatar: null, pushedAt: new Date().toISOString(), categories: ["Local LLM"], sourceLabel: "GitHub" },
    { name: "LangChain", url: "https://github.com/langchain-ai/langchain", description: "Framework for developing applications powered by language models", stars: 95000, language: "Python", avatar: null, pushedAt: new Date().toISOString(), categories: ["Framework"], sourceLabel: "GitHub" },
    { name: "vLLM", url: "https://github.com/vllm-project/vllm", description: "High-throughput and memory-efficient inference engine for LLMs", stars: 35000, language: "Python", avatar: null, pushedAt: new Date().toISOString(), categories: ["Inference"], sourceLabel: "GitHub" },
    { name: "ComfyUI", url: "https://github.com/comfyanonymous/ComfyUI", description: "Powerful and modular stable diffusion GUI with a graph/nodes interface", stars: 65000, language: "Python", avatar: null, pushedAt: new Date().toISOString(), categories: ["Image Gen"], sourceLabel: "GitHub" },
    { name: "OpenWebUI", url: "https://github.com/open-webui/open-webui", description: "User-friendly AI interface for various LLM runners", stars: 55000, language: "JavaScript", avatar: null, pushedAt: new Date().toISOString(), categories: ["UI"], sourceLabel: "GitHub" },
    { name: "AutoGPT", url: "https://github.com/Significant-Gravitas/AutoGPT", description: "An experimental open-source attempt at making GPT-4 autonomous", stars: 170000, language: "Python", avatar: null, pushedAt: new Date().toISOString(), categories: ["Agent"], sourceLabel: "GitHub" },
    { name: "Dify", url: "https://github.com/langgenius/dify", description: "Open-source LLM app development platform", stars: 45000, language: "TypeScript", avatar: null, pushedAt: new Date().toISOString(), categories: ["Platform"], sourceLabel: "GitHub" }
  ];
}
__name(getFallbackTools, "getFallbackTools");
async function fetchProductHuntTools() {
  try {
    const phUrl = "https://www.producthunt.com/feed?category=developer-tools";
    console.log(`[ProductHunt] Fetching: ${phUrl}`);
    
    let response;
    try {
      response = await fetchWithTimeout(phUrl, {
        headers: { "User-Agent": "AI-News-Digest/1.0" }
      }, 15e3);
      console.log(`[ProductHunt] Response received: status=${response.status}, ok=${response.ok}`);
    } catch (fetchError) {
      console.log(`[ProductHunt] Fetch error: ${fetchError.name}: ${fetchError.message}`);
      return [];
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.log(`[ProductHunt] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return [];
    }
    
    let xmlText;
    try {
      xmlText = await response.text();
      console.log(`[ProductHunt] XML received: ${xmlText.length} chars`);
    } catch (textError) {
      console.log(`[ProductHunt] Read text error: ${textError.message}`);
      return [];
    }
    
    const results = [];
    const itemRegex = /<entry[^\u003e]*>([\s\S]*?)<\/entry>/gi;
    let match;
    let entryCount = 0;
    while ((match = itemRegex.exec(xmlText)) !== null) {
      entryCount++;
      const itemXml = match[1];
      const title = parseItemXml(itemXml, "title");
      const linkMatch = itemXml.match(/<link[^\u003e]*href="([^"]*)"[^\u003e]*>/i);
      const link = linkMatch ? linkMatch[1] : "";
      const contentHtml = parseItemXml(itemXml, "content") || parseItemXml(itemXml, "summary") || "";
      const decodedHtml = contentHtml.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const textContent = decodedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const firstSentence = textContent.split(/Discussion\s*\|/i)[0].trim() || textContent.substring(0, 150);
      if (!title || !link) {
        console.log(`[ProductHunt] Skipping entry ${entryCount}: missing title=${!!title} link=${!!link}`);
        continue;
      }
      results.push({
        name: title,
        url: link,
        description: firstSentence.substring(0, 200),
        stars: 0,
        language: null,
        avatar: null,
        pushedAt: (/* @__PURE__ */ new Date()).toISOString(),
        categories: categorizeTool(title, firstSentence),
        sourceLabel: "Product Hunt"
      });
    }
    console.log(`[ProductHunt] Parsed: ${entryCount} entries, ${results.length} valid tools`);
    return results.slice(0, 6);
  } catch (e) {
    console.log(`[ProductHunt] Unexpected error: ${e.name}: ${e.message}`);
    return [];
  }
}
__name(fetchProductHuntTools, "fetchProductHuntTools");

async function fetchOGImage(url, signal) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-News-Digest/1.0)" },
      signal
    });
    if (!response.ok) return null;
    const html = await response.text();
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
      let imageUrl = ogImageMatch[1].trim();
      // Resolve relative URLs to absolute
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + imageUrl;
      } else if (!imageUrl.startsWith('http')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + '/' + imageUrl;
      }
      return imageUrl;
    }
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (twitterImageMatch) {
      let imageUrl = twitterImageMatch[1].trim();
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + imageUrl;
      } else if (!imageUrl.startsWith('http')) {
        const urlObj = new URL(url);
        imageUrl = urlObj.origin + '/' + imageUrl;
      }
      return imageUrl;
    }
    return null;
  } catch {
    return null;
  }
}
__name(fetchOGImage, "fetchOGImage");
async function pickTopNews(newsItems, env) {
  if (newsItems.length === 0) return [];
  
  // Deduplicate by normalized title AND keyword combinations
  const seenTitles = /* @__PURE__ */ new Set();
  const seenKeywords = /* @__PURE__ */ new Set();
  const uniqueNews = [];
  
  function extractKeywords(title) {
    // Extract core entities: English names/companies 4+ chars
    const text = title.toLowerCase();
    const englishWords = text.match(/[a-z]{4,}/g) || [];
    return englishWords.sort().join('+');
  }
  
  function getKeywordOverlap(kw1, kw2) {
    const set1 = new Set(kw1.split('+'));
    const set2 = new Set(kw2.split('+'));
    const intersection = [...set1].filter(x => set2.has(x));
    return intersection.length;
  }
  
  for (const item of newsItems) {
    const title = item.translatedTitle || item.title || '';
    
    // Method 1: Normalized title (first 25 chars)
    const normalizedTitle = title.toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
      .substring(0, 25);
    
    if (seenTitles.has(normalizedTitle)) {
      console.log(`[pickTopNews] Deduplicate by title: ${title.substring(0, 50)}...`);
      continue;
    }
    seenTitles.add(normalizedTitle);
    
    // Method 2: Keyword overlap (catches same story with different headlines)
    const keywords = extractKeywords(title);
    let isDuplicate = false;
    for (const seenKw of seenKeywords) {
      const overlap = getKeywordOverlap(keywords, seenKw);
      const minLength = Math.min(keywords.split('+').length, seenKw.split('+').length);
      // If 2+ keywords overlap and overlap is >= 50% of shorter set, it's duplicate
      if (overlap >= 3 && overlap >= minLength * 0.7) {
        console.log(`[pickTopNews] Deduplicate by keywords (${overlap} overlap): ${title.substring(0, 50)}...`);
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;
    seenKeywords.add(keywords);
    
    uniqueNews.push({ ...item, importance: "" });
  }
  
  console.log(`[pickTopNews] ${newsItems.length} → ${uniqueNews.length} after dedup`);
  return uniqueNews;
}
__name(pickTopNews, "pickTopNews");
async function fetchToolsData(env) {
  try {
    console.log('[fetchToolsData] Starting tools fetch...');
    
    // Fetch both sources with individual error handling
    let githubTools = [];
    let phTools = [];
    
    try {
      githubTools = await fetchGithubTools();
    } catch (e) {
      console.log(`[fetchToolsData] GitHub fetch failed: ${e.message}`);
    }
    
    try {
      phTools = await fetchProductHuntTools();
    } catch (e) {
      console.log(`[fetchToolsData] ProductHunt fetch failed: ${e.message}`);
    }
    
    console.log(`[fetchToolsData] Fetched: GitHub=${githubTools?.length || 0}, PH=${phTools?.length || 0}`);
    
    // If both failed, use fallback tools
    if (githubTools.length === 0 && phTools.length === 0) {
      console.log('[fetchToolsData] Both sources failed, using fallback tools');
      githubTools = getFallbackTools();
    }
    
    const seenUrls = /* @__PURE__ */ new Set();
    const uniqueTools = [];
    for (const tool of [...githubTools, ...phTools]) {
      if (seenUrls.has(tool.url)) continue;
      seenUrls.add(tool.url);
      uniqueTools.push(tool);
    }
    
    const githubCount = Math.min(5, githubTools.length);
    const phCount = Math.min(2, 6 - githubCount);
    const finalTools = [
      ...uniqueTools.filter((t) => t.sourceLabel !== "Product Hunt").slice(0, githubCount),
      ...uniqueTools.filter((t) => t.sourceLabel === "Product Hunt").slice(0, phCount)
    ];
    console.log(`[fetchToolsData] Final tools: ${finalTools.length}`);
    
    // Try to summarize with Workers AI, but fallback to original if it fails
    let translatedTools = finalTools;
    try {
      translatedTools = await translateTools(finalTools, env);
      console.log(`[fetchToolsData] Tools summarized: ${translatedTools.filter(t => t.descZh).length}/${translatedTools.length}`);
    } catch (toolError) {
      console.log(`[fetchToolsData] Tool summarization failed: ${toolError.message}, using original tools`);
    }
    
    // Fallback: ensure all tools have display data even if Workers AI failed
    for (const tool of translatedTools) {
      if (!tool.descZh && tool.description) {
        tool.descZh = null; // Will trigger frontend fallback to English
      }
    }
    
    return translatedTools;
  } catch (error) {
    console.error('[fetchToolsData] Fatal error:', error.message);
    return [];
  }
}
__name(fetchToolsData, "fetchToolsData");
async function fetchYouTubeVideos(env, force = false) {
  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.log('[YouTube] No API key configured');
      return [];
    }

    const cacheKey = 'youtube:videos:v25';

    // Check KV cache first
    const cachedVideos = await readYouTubeCache(env, cacheKey);
    if (cachedVideos && cachedVideos.cachedAt) {
      const age = Date.now() - new Date(cachedVideos.cachedAt).getTime();
      if (!force && age < 12 * 60 * 60 * 1000) {
        if (cachedVideos.filteredVideos.length > 0) {
          console.log(`[YouTube] Cache hit: ${cachedVideos.rawVideos.length} videos, ${cachedVideos.filteredVideos.length} after whitelist filter`);
          return cachedVideos.filteredVideos;
        }
        console.log(`[YouTube] Cache hit but no usable videos (${cachedVideos.rawVideos.length} raw), refetching live`);
      }
    }

    // Only fetch YouTube at 06:00 and 18:00 HKT (UTC+8), unless forced
    // NOTE: Temporarily disabled fetch window to allow immediate refresh
    /*
    if (!force) {
      const now = new Date();
      const hktHour = (now.getUTCHours() + 8) % 24;
      const hktMinute = now.getUTCMinutes();
      const isFetchWindow = (hktHour === 6 || hktHour === 18) && hktMinute < 30;

      if (!isFetchWindow) {
        console.log(`[YouTube] Skipping fetch - not in fetch window (HKT ${hktHour}:${hktMinute.toString().padStart(2,'0')}, only fetch at 06:00-06:30 and 18:00-18:30)`);
        try {
          const cached = await env.AI_NEWS_KV.get(cacheKey);
          if (cached) {
            const data = JSON.parse(cached);
            const filtered = (data.videos || []).filter(v => {
              if (!whitelistIds.has(v.channelId) || _blacklistIds.has(v.channelId)) {
                console.log(`[YouTube] STALE CACHE REJECTED non-whitelist: "${v.channel}" (${v.channelId})`);
                return false;
              }
              return true;
            });
            console.log(`[YouTube] Returning stale cache: ${data.videos.length} videos, ${filtered.length} after whitelist filter`);
            return filtered;
          }
        } catch (e) {
          // No cache
        }
        return [];
      }
    }
    */

    const fortyEightHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const CHANNELS = [
      ['UCP7jMXSY2xbc3KCAE0MHQ-A', 'Google DeepMind'],
      ['UCXZCJLdBC09xxGZ6gcdrc6A', 'OpenAI'],
      ['UCrDwWp7EBBv4NwvScIpBDOA', 'Anthropic'],
      ['UCxgo0OMZU9SiaYpJsuZKWkQ', 'Grok'],
      ['UC5qxlwEKM7-5YZudb24l0bg', 'Meta AI'],
      ['UC5-pBdfdA3KUo-vq72l-umA', 'Mistral AI'],
      ['UCHlNU7kIZhRgSbhHvFoy72w', 'HuggingFace'],
      ['UCpi_ULPErwrxGTDWZey5azQ', 'Stability AI'],
      ['UCGSJevmBuDyxjLLOBNaYMGA', 'Runway'],
      ['UC-ew9TfeD887qUSiWWAAj1w', 'ElevenLabs'],
      ['UCBJycsmduvYEL83R_U4JriQ', 'Marques Brownlee'],
      ['UCXuqSBlHAE6Xw-yeJA0Tunw', 'Linus Tech Tips'],
      ['UCMiJRAwDNSNzuYeN2uWa0pA', 'Mrwhosetheboss'],
      ['UCddiUEpeqJcYeBxX1IVBKvQ', 'The Verge'],
      ['UCftwRNsjfRo08xYE31tkiyw', 'WIRED'],
      ['UCOmcA3f_RrH6b9NmcNa4tdg', 'CNET'],
      ['UCCjyq_K1Xwfg8Lndy7lKMpA', 'TechCrunch'],
      ['UC-6OW5aJYBFM33zXQlBKPNA', 'Engadget'],
      ['UCsTcErHg8oDvUnTzoqsYeNw', 'Unbox Therapy'],
      ['UCVYamHliCI9rw1tHR1xbkfw', 'Dave2D'],
      ['UCbfYPyITQ-7l4upoX8nvctg', 'Two Minute Papers'],
      ['UCZHmQk67mSJgfCCTn7xBfew', 'Yannic Kilcher'],
      ['UCNJ1Ymd5yFuUPtn21xtRbbw', 'AI Explained'],
      ['UChpleBmo18P08aKCIgti38g', 'Matt Wolfe'],
      ['UCsBjURrPoezykLs9EqgamOA', 'Fireship'],
      ['UCSHZKyawb77ixDdsGog4iWA', 'Lex Fridman'],
      ['UCXUPKJO5MZQN11PqgIvyuvQ', 'Andrej Karpathy'],
      ['UCvKRFNawVcuz4b9ihUTApCg', 'David Shapiro'],
      ['UCMLtBahI5DMrt0NPvDSoIRQ', 'Machine Learning Street Talk'],
      ['UCR9j1jqqB5Rse69wjUnbYwA', 'All About AI'],
      ['UCBa5G_ESCn8Yd4vw5U-gIcg', 'Stanford Online'],
      ['UCEBb1b_L6zDS3xTUrIALZOw', 'MIT OpenCourseWare'],
      ['UCYO_jab_esuFRV4b17AJtAw', '3Blue1Brown'],
      ['UCcIXc5mJsHVYTZR1maL5l9w', 'DeepLearningAI'],
      ['UCtYLUTtgS3k1Fg4y5tAhLbw', 'StatQuest'],
      ['UCTMRxtyHoE3LPcrl-kT4AQQ', 'Google Cloud Tech'],
      ['UC0m-80FnNY2Qb7obvTL_2fA', 'Microsoft Azure']
    ];

    console.log(`[YouTube] Checking ${CHANNELS.length} whitelist channels`);

    const searchTimeout = 8000;
    const allVideoIds = [];

    async function searchChannelVideos(channelId, channelName, maxResults) {
      const uploadsPlaylistId = 'UU' + channelId.slice(2);
      const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
      try {
        const playlistRes = await fetchWithTimeout(playlistUrl, { headers: { 'Referer': 'https://pikai.isearover.workers.dev/' } }, searchTimeout);
        if (playlistRes.ok) {
          const playlistData = await playlistRes.json();
          const ids = (playlistData.items || [])
            .filter(item => {
              const itemChannelId = item.snippet?.channelId;
              if (itemChannelId !== channelId) {
                console.log(`[YouTube] REJECTED playlist result from wrong channel: "${item.snippet?.channelTitle}" (${itemChannelId}) !== expected "${channelName}" (${channelId})`);
                return false;
              }
              const publishedAt = item.snippet?.publishedAt;
              if (publishedAt && new Date(publishedAt) < new Date(fortyEightHoursAgo)) {
                return false;
              }
              return true;
            })
            .map(item => item.snippet?.resourceId?.videoId)
            .filter(Boolean);
          console.log(`[YouTube] Channel "${channelName}" returned ${ids.length} videos from uploads playlist`);
          return ids;
        } else {
          const errText = await playlistRes.text();
          console.log(`[YouTube] Channel "${channelName}" playlist failed: ${playlistRes.status} - ${errText.substring(0,200)}`);
          return [];
        }
      } catch (e) {
        console.log(`[YouTube] Channel "${channelName}" error: ${e.message}`);
        return [];
      }
    }

    // Search channels in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < CHANNELS.length; i += batchSize) {
      const batch = CHANNELS.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(([id, name]) => searchChannelVideos(id, name, 5)));
      batchResults.forEach(ids => allVideoIds.push(...ids));
    }

    console.log(`[YouTube] Total video IDs from channel searches: ${allVideoIds.length}`);

    const uniqueVideoIds = [...new Set(allVideoIds)].slice(0, 50);
    console.log(`[YouTube] Total unique videos (limited): ${uniqueVideoIds.length}`);

    if (uniqueVideoIds.length === 0) {
      console.log('[YouTube] No videos found');
      return [];
    }

    // Step 2: Get video details
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${uniqueVideoIds.join(',')}&key=${apiKey}`;
    const detailsRes = await fetchWithTimeout(detailsUrl, { headers: { 'Referer': 'https://pikai.isearover.workers.dev/' } }, 15000);
    if (!detailsRes.ok) {
      console.error(`[YouTube] Details failed: ${detailsRes.status}`);
      return [];
    }
    const detailsData = await detailsRes.json();

    const channelCounts = {};

    const videos = (detailsData.items || []).map(item => {
      const snippet = item.snippet || {};
      const stats = item.statistics || {};
      const duration = item.contentDetails?.duration || 'PT0S';

      let durationStr = '';
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) {
        const h = parseInt(match[1] || 0);
        const m = parseInt(match[2] || 0);
        const s = parseInt(match[3] || 0);
        if (h > 0) durationStr += `${h}:`;
        durationStr += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }

      const viewCount = parseInt(stats.viewCount || 0);
      let viewStr = '';
      if (viewCount >= 1000000) viewStr = (viewCount / 1000000).toFixed(1) + 'M';
      else if (viewCount >= 1000) viewStr = (viewCount / 1000).toFixed(1) + 'K';
      else viewStr = viewCount.toString();

      return {
        id: item.id,
        title: snippet.title || '',
        channel: snippet.channelTitle || '',
        channelId: snippet.channelId || '',
        thumbnail: `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`,
        duration: durationStr,
        viewCount: viewStr,
        rawViewCount: viewCount,
        publishedAt: snippet.publishedAt || '',
        url: `https://youtube.com/watch?v=${item.id}`
      };
    }).filter(video => {
      // STRICT: verify channel is in whitelist
      if (!_youtubeWhitelistIds.has(video.channelId) || _blacklistIds.has(video.channelId)) {
        console.log(`[YouTube] REJECTED non-whitelist channel: "${video.channel}" (${video.channelId}) for video "${(video.title||'').substring(0,40)}"`);
        return false;
      }

      // Per-channel limit: max 3 videos per channel
      const ch = video.channel || '';
      const count = channelCounts[ch] || 0;
      if (count >= 3) {
        console.log(`[YouTube] Rejected (dup channel max 3): ${video.channel}`);
        return false;
      }
      channelCounts[ch] = count + 1;

      // Filter out Shorts: duration < 5 minutes
      const parts = video.duration.split(':');
      let totalSeconds = 0;
      if (parts.length === 3) {
        totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      } else if (parts.length === 2) {
        totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      }
      if (totalSeconds < 300) {
        console.log(`[YouTube] Rejected (Short): ${video.channel}: ${(video.title||'').substring(0,40)} (${totalSeconds}s)`);
        return false;
      }

      // Reject extremely low-view videos
      if (video.rawViewCount !== undefined && video.rawViewCount < 50) {
        console.log(`[YouTube] Rejected (low views ${video.rawViewCount} < 50): ${video.channel}`);
        return false;
      }

      return true;
    });

    // Sort by view count
    videos.sort((a, b) => {
      const aViews = parseViewCount(a.viewCount);
      const bViews = parseViewCount(b.viewCount);
      return bViews - aViews;
    });

    // Filter: reject videos older than 48 hours
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const recentVideos = videos.filter(video => {
      const pubDate = new Date(video.publishedAt);
      return pubDate >= cutoffDate;
    });
    console.log(`[YouTube] Filtered to ${recentVideos.length} recent videos (48 hours)`);

    // Cache results (12 hours)
    try {
      await env.AI_NEWS_KV.put(cacheKey, JSON.stringify({ videos: recentVideos, cachedAt: new Date().toISOString() }), { expirationTtl: 12 * 60 * 60 });
    } catch (e) {
      console.log('[YouTube] Cache write failed:', e.message);
    }

    console.log(`[YouTube] Returning ${recentVideos.length} videos`);
    return recentVideos;
  } catch (error) {
    console.error('[YouTube] Error:', error.message);
    return [];
  }
}
__name(fetchYouTubeVideos, 'fetchYouTubeVideos');


// Known YouTube InnerTube API key — hardcoded to skip unreliable HTML scraping
// This key is extracted from youtube.com and used by many open‑source projects
const YT_INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

async function fetchFromSupadata(videoId, env) {
  const apiKey = env?.SUPADATA_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
      {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!resp.ok) {
      console.warn('[fetchFromSupadata] HTTP', resp.status, 'for', videoId);
      return null;
    }
    const data = await resp.json();
    // Supadata with text=true returns: { lang, availableLangs, content: "full text..." }
    // Without text=true: { content: [{ text, offset, duration }] }
    if (typeof data.content === 'string' && data.content.length > 0) {
      return data.content;
    }
    if (Array.isArray(data.content) && data.content.length > 0) {
      return data.content.map(c => c.text).join(' ');
    }
    if (data.transcript) return data.transcript;
    return null;
  } catch (e) {
    console.warn('[fetchFromSupadata] Failed:', videoId, e.message);
    return null;
  }
}

// Fetch article content from a URL and extract plain text for AI summarization
async function fetchArticleContent(url, env) {
  const fetchOpts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    timeout: 15000
  };
  const resp = await fetch(url, fetchOpts);
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status + ' for ' + url);
  }
  const html = await resp.text();
  // Strip scripts, styles, SVGs, nav, header, footer, aside
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[\/]?[a-zA-Z][^>]*>/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  // Try to find main content - look for article/main tags
  const mainMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    || html.match(/<div[^>]*class="[^"]*(?:content|post|entry|article)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (mainMatch) {
    let mainText = mainMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[\/]?[a-zA-Z][^>]*>/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    if (mainText.length > 100) {
      text = mainText;
    }
  }
  // Limit to reasonable size
  return text.substring(0, 10000);
}
__name(fetchArticleContent, "fetchArticleContent");

async function fetchYouTubeTranscript(videoId, env) {
  // Layer 0: KV Cache (30 days)
  const kvKey = `transcript:${videoId}`;
  if (env?.AI_NEWS_KV) {
    const cached = await env.AI_NEWS_KV.get(kvKey);
    if (cached) {
      console.log('[fetchYouTubeTranscript] KV HIT for', videoId);
      return cached;
    }
  }

  // Layer 1: Supadata API (primary, ~95% success, free 100 credits/month)
  const supadataText = await fetchFromSupadata(videoId, env);
  if (supadataText) {
    await cacheTranscript(kvKey, supadataText, env);
    return supadataText;
  }

  // Layer 2: InnerTube API (5 clients)
  let transcript = await tryInnerTube(videoId);
  if (transcript) {
    await cacheTranscript(kvKey, transcript, env);
    return transcript;
  }

  // Layer 3: HTML page scrape
  transcript = await tryHtmlPage(videoId);
  if (transcript) {
    await cacheTranscript(kvKey, transcript, env);
    return transcript;
  }

  // Layer 4: youtubetranscript.com
  transcript = await tryYoutubetranscript(videoId);
  if (transcript) {
    await cacheTranscript(kvKey, transcript, env);
    return transcript;
  }

  throw new Error('No captions available for this video');
}

async function cacheTranscript(kvKey, text, env) {
  if (!env?.AI_NEWS_KV) return;
  try {
    await env.AI_NEWS_KV.put(kvKey, text, { expirationTtl: 2592000 }); // 30 days
  } catch (e) {
    console.warn('[cacheTranscript] KV put failed:', e.message);
  }
}

async function tryInnerTube(videoId) {
  const clients = [
    { clientName: 'ANDROID', clientVersion: '20.10.38' },
    { clientName: 'ANDROID', clientVersion: '19.09.35' },
    { clientName: 'WEB',      clientVersion: '2.20240101' },
    { clientName: 'IOS',      clientVersion: '19.29.1' },
    { clientName: 'ANDROID_MUSIC', clientVersion: '7.21.1' },
  ];

  for (const client of clients) {
    try {
      const playerRes = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${YT_INNERTUBE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://www.youtube.com',
            'X-YouTube-Client-Name': client.clientName === 'ANDROID' ? '3' : '1',
            'X-YouTube-Client-Version': client.clientVersion,
          },
          body: JSON.stringify({ context: { client }, videoId }),
          signal: AbortSignal.timeout(10000),
        },
      );

      const contentType = playerRes.headers.get('content-type') || '';
      if (contentType.includes('text/html')) continue;

      const playerData = await playerRes.json();
      const captions = playerData?.captions?.playerCaptionsTracklistRenderer;
      if (captions?.captionTracks?.length) {
        return await parseCaptions(captions);
      }
    } catch (e) {
      console.warn('[tryInnerTube] Client', client.clientName, 'failed:', e.message);
    }
  }
  return null;
}

async function tryHtmlPage(videoId) {
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await pageRes.text();
    const start = html.indexOf('ytInitialPlayerResponse = ');
    if (start !== -1) {
      const jsonStart = start + 'ytInitialPlayerResponse = '.length;
      let braceCount = 0, jsonEnd = jsonStart;
      for (let i = jsonStart; i < html.length; i++) {
        if (html[i] === '{') braceCount++;
        else if (html[i] === '}') { braceCount--; if (braceCount === 0) { jsonEnd = i + 1; break; } }
      }
      const jsonStr = html.substring(jsonStart, jsonEnd);
      const pageData = JSON.parse(jsonStr);
      const captions = pageData?.captions?.playerCaptionsTracklistRenderer;
      if (captions?.captionTracks?.length) return await parseCaptions(captions);
    }
  } catch (e) {
    console.warn('[tryHtmlPage] Failed:', videoId, e.message);
  }
  return null;
}

async function tryYoutubetranscript(videoId) {
  try {
    const trRes = await fetch(`https://youtubetranscript.com/?v=${videoId}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const trText = await trRes.text();
    if (trText.startsWith('[')) {
      const trData = JSON.parse(trText);
      if (Array.isArray(trData) && trData.length > 0) return trData.map(s => s.text).join(' ');
    }
  } catch (e) {
    console.warn('[tryYoutubetranscript] Failed:', videoId, e.message);
  }
  return null;
}

async function parseCaptions(captions) {
  // Find best matching caption (prefer English)
  const preferredLangs = ['en', 'en-US', 'en-GB', 'en-CA', 'en-AU'];
  let captionUrl = null;
  for (const track of captions.captionTracks) {
    if (preferredLangs.includes(track.languageCode)) {
      captionUrl = track.baseUrl.replace('&fmt=srv3', '');
      break;
    }
  }
  if (!captionUrl) {
    captionUrl = captions.captionTracks[0].baseUrl.replace('&fmt=srv3', '');
  }

  // Fetch transcript XML
  const transcriptRes = await fetch(captionUrl, {
    signal: AbortSignal.timeout(10000),
  });
  const transcriptXml = await transcriptRes.text();

  // Parse XML to extract text
  const textSegments = [];
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = textRegex.exec(transcriptXml)) !== null) {
    const text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/<[^>]+>/g, '');
    if (text.trim()) {
      textSegments.push(text);
    }
  }

  if (textSegments.length === 0) {
    throw new Error('Could not parse transcript XML');
  }

  return textSegments.join(' ');
}
__name(fetchYouTubeTranscript, 'fetchYouTubeTranscript');


async function fetchNewsData(env) {
  try {
    console.log('[fetchNewsData] Starting data fetch...');
    const news = await fetchAINews();
    console.log(`[fetchNewsData] Fetched: news=${news?.length || 0}`);
    
    // CRITICAL FIX: Dedup FIRST before anything else to minimize subrequests
    // translateNews removed — summarizeWithWorkersAI already outputs Chinese headline
    const deduped = await pickTopNews(news, env);
    console.log(`[fetchNewsData] After dedup: ${news.length} → ${deduped.length} articles`);
    
    // CRITICAL FIX: Cap articles to stay under Cloudflare 50 subrequest limit
    // Budget: ~40 RSS + 2 tools + 8 OG = ~50 (at subrequest limit)
    const MAX_ARTICLES = 40;
    const MAX_SUMMARIZE = 40;
    const toProcess = deduped.slice(0, MAX_ARTICLES);
    console.log(`[fetchNewsData] Processing top ${toProcess.length}/${deduped.length} articles (display max ${MAX_ARTICLES}, summarize max ${MAX_SUMMARIZE})`);
    
    // OG images: KV cache first, then limited new fetches for articles without RSS images
    const withImages = [];
    let ogFetchCount = 0;
    const MAX_OG_FETCHES = 8;
    for (const item of toProcess) {
      if (item.ogImage) { withImages.push(item); continue; }
      const cacheKey = `ogimg:v2:${md5(item.url)}`;
      try {
        const cachedImage = await env.AI_NEWS_KV.get(cacheKey);
        if (cachedImage) {
          withImages.push({ ...item, ogImage: cachedImage === "none" ? null : cachedImage });
          continue;
        }
      } catch (_e) { /* KV miss */ }
      // Limited new OG fetches for first few articles (ZDNet, etc. have no RSS images)
      if (ogFetchCount < MAX_OG_FETCHES) {
        ogFetchCount++;
        try {
          const ogUrl = await fetchOGImage(item.url, null);
          if (ogUrl) {
            await env.AI_NEWS_KV.put(cacheKey, ogUrl);
            withImages.push({ ...item, ogImage: ogUrl });
            continue;
          } else {
            await env.AI_NEWS_KV.put(cacheKey, "none"); // Cache miss to avoid re-fetching
          }
        } catch (_e) { /* OG fetch failed */ }
      }
      withImages.push(item);
    }
    
    // Summarize with Workers AI + NVIDIA fallback (batch to stay under subrequest limit)
    const summarizeCount = Math.min(withImages.length, MAX_SUMMARIZE);
    console.log(`[fetchNewsData] Summarizing ${summarizeCount} articles with Workers AI (capped at ${MAX_SUMMARIZE} for subrequest budget)...`);
    const summarizedNews = [];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 500; // 0.5s between batches (Qwen3 30B is fast, no need for 2s delay)
    
    for (let batchStart = 0; batchStart < summarizeCount; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, summarizeCount);
      console.log(`[fetchNewsData] Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchStart}-${batchEnd-1} of ${withImages.length}`);

      const itemsToSummarize = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const item = withImages[i];
        console.log(`[SumLoop] Processing article ${i+1}/${withImages.length}: "${item.title.substring(0, 60)}", hasDesc: ${!!item.summary}`);
        try {
          const cached = await getCachedArticle(item.url, env);
          if (cached && (cached.summary || cached.translatedTitle)) {
            const badPatterns = [
              /唔再.*之間/, /之間中/, /就.*[冇无].*再/,
              /[冇无].*再.*之間/, /[是係].*[冇无].*再/,
            ];
            const titleOk = cached.translatedTitle && /[\u4e00-\u9fff]/.test(cached.translatedTitle) &&
              !badPatterns.some(p => p.test(cached.translatedTitle)) &&
              cached.translatedTitle.length <= 60 &&
              cached.translatedTitle.length >= 8;
            const summaryOk = cached.summary && /[\u4e00-\u9fff]/.test(cached.summary) && cached.summary.length >= 10;
            if (titleOk) {
              console.log(`[Cache] Using cached translation for: ${item.title.substring(0, 40)}...`);
              summarizedNews.push({
                ...item,
                translatedTitle: cached.translatedTitle,
                summary: cached.summary,
                summarizedAt: new Date().toISOString()
              });
              continue;
            }
            console.log(`[Cache] Re-processing (invalid cached result): ${item.title.substring(0, 40)}...`);
          }
          itemsToSummarize.push(item);
        } catch (e) {
          console.log(`[fetchNewsData] Cache check failed: ${e.message}`);
          itemsToSummarize.push(item);
        }
      }

      if (itemsToSummarize.length > 0) {
        try {
          const batchResults = await batchSummarizeWithWorkersAI(itemsToSummarize, env);
          for (let rIndex = 0; rIndex < itemsToSummarize.length; rIndex++) {
            const item = itemsToSummarize[rIndex];
            let result = batchResults[rIndex] || { translatedTitle: '', summary: '', qualityFlag: 'batch_missing' };

            if (result.summary && !/[\u4e00-\u9fff]/.test(result.summary)) {
              result = { ...result, summary: '', qualityFlag: 'non_chinese_summary' };
            }
            if (result.translatedTitle && !/[\u4e00-\u9fff]/.test(result.translatedTitle)) {
              result = { ...result, translatedTitle: '', qualityFlag: 'non_chinese_title' };
            }

            if (!result.summary) {
              console.log(`[Workers AI] Failed, trying OpenRouter for: ${item.title.substring(0, 40)}...`);
              const prompt = `標題：${item.title}\n內容：${item.summary || ''}\n\n請用繁體中文總結內容（約3-4句話），並提供自然通順嘅中文標題（15-25字）。

【標題翻譯原則】
- 唔好直譯！要理解原文意思後，用自然嘅中文重新表達
- 保留英文名稱（公司名、產品名、技術名詞）
- 避免語序混亂、缺主語、缺謂語嘅問題

格式：
標題：[中文標題]
總結：[總結內容]`;
              const orResult = await callOpenRouterFree(prompt, env.OPENROUTER_API_KEY, 500);
              if (orResult.success) {
                const text = orResult.text;
                const titleMatch = text.match(/標題[：:]\s*(.+?)(?:\n|$)/);
                const summaryMatch = text.match(/總結[：:]\s*([\s\S]+)/);
                const summary = summaryMatch ? summaryMatch[1].trim() : text.trim();
                let translatedTitle = titleMatch ? titleMatch[1].trim() : '';
                const badPatterns = [
                  /唔再.*之間/, /之間中/, /就.*[冇无].*再/,
                  /[冇无].*再.*之間/, /[是係].*[冇无].*再/,
                ];
                const hasBadPattern = badPatterns.some(p => p.test(translatedTitle));
                if (hasBadPattern || translatedTitle.length > 40 || (translatedTitle.length > 0 && translatedTitle.length < 8)) {
                  console.log(`[OpenRouter] Bad headline detected: "${translatedTitle}", using original`);
                  translatedTitle = '';
                }
                result = { translatedTitle, summary, qualityFlag: 'openrouter' };
                console.log(`[OpenRouter] Summarized: ${translatedTitle || item.title.substring(0, 40)}...`);
              }
            }

            if (result.summary && !/[\u4e00-\u9fff]/.test(result.summary)) {
              result = { ...result, summary: '' };
            }
            if (result.translatedTitle && !/[\u4e00-\u9fff]/.test(result.translatedTitle)) {
              result = { ...result, translatedTitle: '' };
            }

            if (!result.summary) {
              const fallbackSource = (item.description || item.summary || item.title || '').substring(0, 200);
              const tRes = await translateWithOpenRouter(item.title, env);
              const sRes = await translateWithOpenRouter(fallbackSource, env);
              const translatedTitle = tRes.success ? tRes.text : '';
              const summary = sRes.success ? sRes.text : '';
              if (summary && /[\u4e00-\u9fff]/.test(summary)) {
                result = { translatedTitle, summary, qualityFlag: 'openrouter_translate' };
              }
            }
            // Ultimate fallback: use raw description extract as summary
            if (!result.summary) {
              const extract = (item.description || item.summary || '').substring(0, 150);
              if (extract.length > 20) {
                result = {
                  translatedTitle: result.translatedTitle || '',
                  summary: extract,
                  qualityFlag: 'raw_extract'
                };
              }
            }

            if (result.summary || (result.translatedTitle && /[\u4e00-\u9fff]/.test(result.translatedTitle))) {
              let translatedTitle = result.translatedTitle || '';
              if (!translatedTitle || !/[\u4e00-\u9fff]/.test(translatedTitle)) {
                try {
                  const zh = await translateTitleWithWorkersAI(item.title, env);
                  if (zh) translatedTitle = zh;
                } catch (_e) {}
                if (!translatedTitle || !/[\u4e00-\u9fff]/.test(translatedTitle)) {
                  const tRes = await translateWithOpenRouter(item.title, env);
                  if (tRes.success && tRes.text && /[\u4e00-\u9fff]/.test(tRes.text)) {
                    translatedTitle = tRes.text;
                  }
                }
              }
              summarizedNews.push({
                ...item,
                translatedTitle: translatedTitle || item.title,
                summary: result.summary || '',
                summarizedAt: new Date().toISOString()
              });
              await setCachedArticle(item.url, { ...result, translatedTitle }, env);
            }
          }
        } catch (e) {
          console.log(`[fetchNewsData] Batch summarize failed: ${e.message}`);
        }
      }
      
      // Delay between batches (except last)
      if (batchEnd < withImages.length) {
        console.log(`[fetchNewsData] Batch complete, waiting ${BATCH_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    console.log(`[fetchNewsData] Summarized ${summarizedNews.length}/${summarizeCount} articles (cached hits saved quota)`);
    
    // Merge: use summarized articles first, then fill remaining slots from deduped
    const newsToPick = [...summarizedNews];
    if (newsToPick.length < MAX_ARTICLES && deduped.length > 0) {
      const usedUrls = new Set(newsToPick.map(a => a.url));
      for (const item of deduped) {
        if (!usedUrls.has(item.url) && newsToPick.length < MAX_ARTICLES) {
          // Ensure item has at least a Chinese title or original title
          if (!item.translatedTitle || !/[\u4e00-\u9fff]/.test(item.translatedTitle)) {
            try {
              const zh = await translateTitleWithWorkersAI(item.title, env);
              if (zh) item.translatedTitle = zh;
            } catch (_e) {}
          }
          newsToPick.push(item);
        }
      }
    }
    console.log(`[fetchNewsData] Using ${newsToPick.length} articles (${summarizedNews.length} summarized + ${newsToPick.length - summarizedNews.length} fallback)`);
    
    // Final pass: translate any remaining English-only headlines
    for (const article of newsToPick) {
      const displayTitle = article.translatedTitle || article.title;
      if (!displayTitle || !/[\u4e00-\u9fff]/.test(displayTitle)) {
        console.log(`[fetchNewsData] Final-pass translating: "${(article.translatedTitle || article.title || '').substring(0, 40)}"`);
        try {
          const zh = await translateTitleWithWorkersAI(article.title, env);
          if (zh) {
            article.translatedTitle = zh;
            console.log(`[fetchNewsData] Final-pass got: "${zh}"`);
          }
        } catch (e) {
          console.log(`[fetchNewsData] Final-pass failed: ${e.message}`);
        }
      }
    }
    
    return { news: newsToPick, summarizedNews };
  } catch (error) {
    console.error('[fetchNewsData] Fatal error:', error.message, error.stack);
    return { news: [], summarizedNews: [] };
  }
}
__name(fetchNewsData, "fetchNewsData");
var worker_default = {
  async scheduled(controller, env, _ctx) {
    const cronExpr = controller.cron || '';
    const isYouTubeCron = cronExpr === '30 0 * * *';

    if (isYouTubeCron) {
      // YouTube-only cron: force-fetch, no news/tools to stay under 50 subreq limit
      console.log(`[Cron] YouTube-only run: ${cronExpr}`);
      const videosData = await fetchYouTubeVideos(env, true);
      console.log(`[Cron] YouTube update complete: ${videosData.length} videos`);
      return;
    }

    // News + Tools cron (YouTube handled by Pi cron hitting /trigger-youtube)
    console.log(`[Cron] News+tools run: ${cronExpr}`);
    const newsData = await fetchNewsData(env);
    const toolsData = await fetchToolsData(env);
    const data = { ...newsData, tools: toolsData };
    data.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
    data.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
    // Minimum article threshold: don't overwrite KV with incomplete data
    // Require both: enough total articles AND enough AI-summarized ones
    const newHasEnough = newsData.news && newsData.news.length >= 15 &&
      newsData.summarizedNews && newsData.summarizedNews.length >= 5;
    // Also check: don't replace good data with worse data
    let oldHasChinese = false;
    if (!newHasEnough) {
      try {
        const oldRaw = await env.AI_NEWS_KV.get("news-data");
        if (oldRaw) {
          const oldData = JSON.parse(oldRaw);
          const oldCn = (oldData.summarizedNews || []).filter(s =>
            s.translatedTitle && /[\u4e00-\u9fff]/.test(s.translatedTitle)
          ).length;
          oldHasChinese = oldCn >= 10;
          if (oldHasChinese) {
            console.log(`[Cron] KEPT old KV: new has ${newsData.summarizedNews?.length || 0} summarized, old had ${oldCn} Chinese`);
          }
        }
      } catch (_e) {}
    }
    if (newHasEnough || oldHasChinese) {
      if (newHasEnough) {
        await env.AI_NEWS_KV.put("news-data", JSON.stringify(data));
        console.log(`[Cron] KV updated: ${data.news.length} news, ${data.tools.length} tools`);
      } else {
        console.log(`[Cron] SKIPPED KV write: kept existing data (${newsData.summarizedNews?.length || 0} new vs good old data)`);
      }
    } else {
      console.log(`[Cron] SKIPPED KV write: only ${data.news?.length || 0} articles (min 15 required)`);
    }
    // Also refresh rankings on the midnight cron
    if (cronExpr === '0 0 * * *') {
      try {
        const rankings = await fetchORRankings(env);
        if (rankings && rankings.usage && rankings.usage.length > 0) {
          rankings._updatedAt = new Date().toISOString();
          await env.AI_NEWS_KV.put("or-rankings", JSON.stringify(rankings));
          console.log(`[Cron] Rankings updated: ${rankings.usage.length} models`);
        }
      } catch (e) {
        console.log("[Cron] Rankings refresh error:", e.message);
      }
    }
  },
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" }
        });
      }
      if (url.pathname === "/health") {
        const deployVersion = "DEPLOY_HASH_PLACEHOLDER";
        return new Response(JSON.stringify({
          status: "ok",
          version: deployVersion,
          timestamp: new Date().toISOString(),
          worker: "pikai"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url.pathname === "/manifest.json") {
        return new Response(JSON.stringify({
          name: "PikAI",
          short_name: "PikAI",
          start_url: "/",
          display: "standalone",
          background_color: "#fafbfc",
          theme_color: "#0066ff",
          orientation: "portrait",
          icons: [
            
            { src: "/icon-192.png?v=6", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png?v=6", sizes: "512x512", type: "image/png" }
          ]
        }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon-192.png") {
        const png = Uint8Array.from(atob("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"), c => c.charCodeAt(0));
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon-512.png") {
        const png = Uint8Array.from(atob("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"), c => c.charCodeAt(0));
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon.svg") {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="192" height="192">
          <rect width="512" height="512" rx="96" fill="#0f172a"/>
          <g transform="translate(66.90909090909093, 70) scale(0.2841335974318694, -0.2841335974318694)">
            <path fill="#ffffff" d="M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398M550-132L550-342L510-342Q510-342 510-326.25Q510-310.50 510-289.50Q510-268.50 510-252.75Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-221.25Q510-205.50 510-184.50Q510-163.50 510-147.75Q510-132 510-132L550-132M-20-586L-20-296L20-296L20-546Q20-546 20-546Q20-546 20-546Q20-546 37.75-546Q55.50-546 78.50-546Q101.50-546 119.25-546Q137-546 137-546Q137-546 153.25-546Q169.50-546 191-546Q212.50-546 228.75-546Q245-546 245-546Q245-546 245-546Q245-546 245-546L245-445Q245-445 245-445Q245-445 245-445Q245-445 245-445Q245-445 245-445Q245-445 256-445Q267-445 285.25-445Q303.50-445 324.75-445Q346-445 366.75-445Q387.50-445 404.25-445Q421-445 429-445Q429-445 429-445Q429-445 429-445Q429-445 429-445Q431-445 439.75-437.50Q448.50-430 460.25-418.50Q472-407 483.50-395.25Q495-383.50 502.50-375Q510-366.50 510-365Q510-365 510-365Q510-365 510-365L510-287L550-287L550-586Q550-586 534.75-586Q519.50-586 494.25-586Q469-586 439-586Q409-586 379-586Q349-586 323.75-586Q298.50-586 283.25-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 247.25-586Q226.50-586 193.75-586Q161-586 124-586Q87-586 54.25-586Q21.50-586 0.75-586Q-20-586-20-586M20-279L-20-279Q-20-279-20-258.75Q-20-238.50-20-206.75Q-20-175-20-139.50Q-20-104-20-72.25Q-20-40.50-20-20.25Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0 1 0Q22 0 55.25 0Q88.50 0 126 0Q163.50 0 196.75 0Q230 0 251 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272-9.50 272-19.75Q272-30 272-40Q272-40 253.75-40Q235.50-40 206.75-40Q178-40 146-40Q114-40 85.25-40Q56.50-40 38.25-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-57.25Q20-74.50 20-101.75Q20-129 20-159.50Q20-190 20-217.25Q20-244.50 20-261.75Q20-279 20-279M550-279L510-279L510-120Q510-118.50 502.25-110Q494.50-101.50 483-89.75Q471.50-78 459.50-66.50Q447.50-55 439-47.50Q430.50-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 411.75-40Q394.50-40 369-40Q343.50-40 318-40Q292.50-40 275.25-40Q258-40 258-40Q258-30 258-19.75Q258-9.50 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q261.50 0 284 0Q306.50 0 339.75 0Q373 0 409.25 0Q445.50 0 477.50 0Q509.50 0 529.75 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550-20.25Q550-40.50 550-72.25Q550-104 550-139.50Q550-175 550-206.75Q550-238.50 550-258.75Q550-279 550-279M243-300Q243-300 243-281.25Q243-262.50 243-238Q243-213.50 243-194.75Q243-176 243-176Q243-176 243-176Q243-176 243-176Q243-173 243.50-172.50Q244-172 247-172Q252.50-172 257.75-172Q263-172 268.25-172Q273.50-172 279-172Q282-172 282.50-172.50Q283-173 283-176Q283-176 283-176Q283-176 283-176Q283-176 283-194.75Q283-213.50 283-238Q283-262.50 283-281.25Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-303 282.50-303.50Q282-304 279-304Q271-304 263.25-304Q255.50-304 247-304Q244-304 243.50-303.50Q243-303 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300"/>
          </g>
          <g transform="translate(217.4998975479817, 70) scale(0.2841335974318694, -0.2841335974318694)">
            <path fill="#ffffff" d="M251-337L291-337Q291-357.50 291-381.75Q291-406 291-432.25Q291-458.50 291-485.25Q291-512 291-537.50Q291-563 291-586Q291-586 275.25-586Q259.50-586 236.25-586Q213-586 189.75-586Q166.50-586 150.75-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q131.50-578.50 131.50-566Q131.50-553.50 135-546Q145.50-546 158.50-546Q171.50-546 186.25-546Q201-546 217.50-546Q234-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-525Q251-504 251-472.75Q251-441.50 251-410.25Q251-379 251-358Q251-337 251-337M-20-337L20-337Q20-337 20-358Q20-379 20-410.25Q20-441.50 20-472.75Q20-504 20-525Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q37.50-546 53.75-546Q70-546 84.75-546Q99.50-546 112.50-546Q125.50-546 136-546Q140-553.50 140-566Q140-578.50 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 120.25-586Q104.50-586 81.25-586Q58-586 34.75-586Q11.50-586-4.25-586Q-20-586-20-586Q-20-563-20-537.50Q-20-512-20-485.25Q-20-458.50-20-432.25Q-20-406-20-381.75Q-20-357.50-20-337M-20-458L-20-228L20-228Q20-255.50 20-272Q20-288.50 20-303.75Q20-319 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-368 20-381Q20-394 20-402.75Q20-411.50 20-423.25Q20-435 20-458L-20-458M251-228L291-228L291-458L251-458Q251-435 251-423.25Q251-411.50 251-402.75Q251-394 251-381Q251-368 251-343Q251-343 251-343Q251-343 251-343Q251-343 251-343Q251-343 251-343Q251-319 251-303.75Q251-288.50 251-272Q251-255.50 251-228M291-249L251-249Q251-249 251-228Q251-207 251-175.75Q251-144.50 251-113.25Q251-82 251-61Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q234-40 217.50-40Q201-40 186.25-40Q171.50-40 158.50-40Q145.50-40 135-40Q131.50-32.50 131.50-20Q131.50-7.50 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 150.75 0Q166.50 0 189.75 0Q213 0 236.25 0Q259.50 0 275.25 0Q291 0 291 0Q291-23 291-48.50Q291-74 291-100.75Q291-127.50 291-153.75Q291-180 291-204.25Q291-228.50 291-249M20-249L-20-249Q-20-228.50-20-204.25Q-20-180-20-153.75Q-20-127.50-20-100.75Q-20-74-20-48.50Q-20-23-20 0Q-20 0-4.25 0Q11.50 0 34.75 0Q58 0 81.25 0Q104.50 0 120.25 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q140-7.50 140-20Q140-32.50 136-40Q125.50-40 112.50-40Q99.50-40 84.75-40Q70-40 53.75-40Q37.50-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-61Q20-82 20-113.25Q20-144.50 20-175.75Q20-207 20-228Q20-249 20-249M291-279L251-279Q251-264 251-248.25Q251-232.50 251-219Q251-205.50 251-197.25Q251-189 251-189Q251-189 251-189Q251-189 251-189Q251-189 251-187.50Q251-186 251-181.25Q251-176.50 251-166.25Q251-156 251-139Q251-139 251-139Q251-139 251-139Q251-139 233.75-139Q216.50-139 193.50-139Q170.50-139 153.25-139Q136-139 136-139Q136-139 136-133.25Q136-127.50 136-120Q136-112.50 136-106.75Q136-101 136-101Q143-101 151.50-101Q160-101 172.75-101Q185.50-101 203.50-101Q221.50-101 247-101Q250.50-101 257.50-101Q264.50-101 271-101Q277.50-101 280-101Q282-101 283.75-101Q285.50-101 287.25-101Q289-101 291-101Q291-116.50 291-140.50Q291-164.50 291-191Q291-217.50 291-241Q291-264.50 291-279M20-279L-20-279Q-20-264.50-20-241Q-20-217.50-20-191Q-20-164.50-20-140.50Q-20-116.50-20-101Q-18-101-16.25-101Q-14.50-101-12.75-101Q-11-101-9-101Q-6.50-101 0-101Q6.50-101 13.50-101Q20.50-101 24-101Q41-101 54.75-101Q68.50-101 79.25-101Q90-101 98.75-101Q107.50-101 114.25-101Q121-101 126.25-101Q131.50-101 136-101Q136-101 136-106.75Q136-112.50 136-120Q136-127.50 136-133.25Q136-139 136-139Q136-139 124.25-139Q112.50-139 95.25-139Q78-139 60.75-139Q43.50-139 31.75-139Q20-139 20-139Q20-139 20-139Q20-139 20-139Q20-156 20-166.25Q20-176.50 20-181.25Q20-186 20-187.50Q20-189 20-189Q20-189 20-189Q20-189 20-189Q20-189 20-197.25Q20-205.50 20-219Q20-232.50 20-248.25Q20-264 20-279"/>
          </g>
          <g transform="translate(294.5001024520183, 70) scale(0.2841335974318694, -0.2841335974318694)">
            <path fill="#ffffff" d="M245-373Q245-373 248-373Q251-373 255.50-373Q260-373 265-373Q270.50-373 275.25-373Q280-373 283-373Q286-373 286-373Q286-381 286-400.75Q286-420.50 286-445Q286-469.50 286-492.75Q286-516 286-531Q286-546 286-546Q286-546 286-546Q286-546 286-546Q286-546 286-546Q286-546 302.25-546Q318.50-546 344-546Q369.50-546 398-546Q426.50-546 452-546Q477.50-546 493.75-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-530.25Q510-514.50 510-496.25Q510-478 510-471Q510-465.50 510-460.25Q510-455 510-447.25Q510-439.50 510-427.50Q510-415.50 510-397Q510-397 510-397Q510-397 510-397Q510-397 510-397Q510-397 510-386.50Q510-376 510-362Q510-348 510-337.50Q510-327 510-327L550-327Q550-351.50 550-381.25Q550-411 550-444.25Q550-477.50 550-513.25Q550-549 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 528.50-586Q507-586 473-586Q439-586 400.50-586Q362-586 327.25-586Q292.50-586 269.75-586Q247-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-580Q245-574 245-566Q245-558 245-552Q245-546 245-546Q245-546 245-546Q245-546 245-546Q245-546 245-546Q245-526 245-506.25Q245-486.50 245-467.75Q245-449 245-432Q245-415 245-400Q245-385 245-373M-20-307L20-307Q20-307 20-324.25Q20-341.50 20-368.75Q20-396 20-426.50Q20-457 20-484.25Q20-511.50 20-528.75Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 38.25-546Q56.50-546 85.25-546Q114-546 146-546Q178-546 206.75-546Q235.50-546 253.75-546Q272-546 272-546Q272-555.50 272-565.75Q272-576 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 251-586Q230-586 196.75-586Q163.50-586 126-586Q88.50-586 55.25-586Q22-586 1-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-565.75Q-20-545.50-20-513.75Q-20-482-20-446.50Q-20-411-20-379.25Q-20-347.50-20-327.25Q-20-307-20-307M20-298L-20-298L-20 0Q-20 0-4.50 0Q11 0 34.25 0Q57.50 0 81 0Q104.50 0 121 0Q137.50 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q140.50 0 155.50 0Q170.50 0 192.25 0Q214 0 235.25 0Q256.50 0 270.75 0Q285 0 285 0L285-102Q306-102 327-102Q348-102 369-102Q390-102 411-102Q411-102 425-102Q439-102 459.75-102Q480.50-102 501.25-102Q522-102 536-102Q550-102 550-102Q550-102 550-102Q550-102 550-102Q550-102 550-102Q550-102 550-102L550-299L510-299L510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 493.75-142Q477.50-142 452-142Q426.50-142 397.75-142Q369-142 343.25-142Q317.50-142 301.25-142Q285-142 285-142Q285-142 285-142Q285-142 285-142Q285-142 285-142Q285-142 285-154.75Q285-167.50 285-186.50Q285-205.50 285-224.50Q285-243.50 285-256.25Q285-269 285-269Q285-269 275-269Q265-269 265-269Q265-269 255-269Q245-269 245-269Q245-269 245-245.75Q245-222.50 245-188.50Q245-154.50 245-120.50Q245-86.50 245-63.25Q245-40 245-40Q245-40 245-40Q245-40 245-40Q245-40 229-40Q213-40 192-40Q171-40 155-40Q139-40 139-40Q139-40 121-40Q103-40 79.50-40Q56-40 38-40Q20-40 20-40Q20-40 20-40Q20-40 20-40L20-298M440-334Q440-334 440-334Q440-334 440-334Q440-334 450.50-325.50Q461-317 475-305.50Q489-294 499.50-285.50Q510-277 510-277L510-227L529-227L550-227Q550-227 550-248.50Q550-270 550-302Q550-334 550-366Q550-398 550-419.50Q550-441 550-441L529-441L510-441L510-391Q510-391 499.50-382.50Q489-374 475-362.50Q461-351 450.50-342.50Q440-334 440-334Q440-334 440-334Q440-334 440-334M-20-458L-20-228L20-228Q20-255.50 20-272Q20-288.50 20-303.75Q20-319 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-368 20-381Q20-394 20-402.75Q20-411.50 20-423.25Q20-435 20-458"/>
          </g>
          <line x1="72" y1="261" x2="440" y2="261" stroke="#334155" stroke-width="1.5" opacity="0.5"/>
          <g transform="translate(142.2044942285363, 276.5) scale(0.2841335974318694, -0.2841335974318694)">
            <path fill="#0ea5e9" d="M-20-307L20-307Q20-307 20-324.25Q20-341.50 20-368.75Q20-396 20-426.50Q20-457 20-484.25Q20-511.50 20-528.75Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 38.25-546Q56.50-546 85.25-546Q114-546 146-546Q178-546 206.75-546Q235.50-546 253.75-546Q272-546 272-546Q272-555.50 272-565.75Q272-576 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 251-586Q230-586 196.75-586Q163.50-586 126-586Q88.50-586 55.25-586Q22-586 1-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-565.75Q-20-545.50-20-513.75Q-20-482-20-446.50Q-20-411-20-379.25Q-20-347.50-20-327.25Q-20-307-20-307M510-307L550-307Q550-307 550-327.25Q550-347.50 550-379.25Q550-411 550-446.50Q550-482 550-513.75Q550-545.50 550-565.75Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 529-586Q508-586 474.75-586Q441.50-586 404-586Q366.50-586 333.25-586Q300-586 279-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-576 258-565.75Q258-555.50 258-546Q258-546 276.25-546Q294.50-546 323.25-546Q352-546 384-546Q416-546 444.75-546Q473.50-546 491.75-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-528.75Q510-511.50 510-484.25Q510-457 510-426.50Q510-396 510-368.75Q510-341.50 510-324.25Q510-307 510-307M20-279L-20-279Q-20-279-20-258.75Q-20-238.50-20-206.75Q-20-175-20-139.50Q-20-104-20-72.25Q-20-40.50-20-20.25Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0 0.25 0Q20.50 0 52.50 0Q84.50 0 120.75 0Q157 0 190.25 0Q223.50 0 246 0Q268.50 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272-9.50 272-19.75Q272-30 272-40Q272-40 254.75-40Q237.50-40 212-40Q186.50-40 161-40Q135.50-40 118.25-40Q101-40 101-40Q101-40 101-40Q101-40 101-40Q101-40 101-40Q99.50-40 91-47.50Q82.50-55 70.50-66.50Q58.50-78 47-89.75Q35.50-101.50 27.75-110Q20-118.50 20-120L20-279M550-279L510-279L510-120Q510-118.50 502.25-110Q494.50-101.50 483-89.75Q471.50-78 459.50-66.50Q447.50-55 439-47.50Q430.50-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 411.75-40Q394.50-40 369-40Q343.50-40 318-40Q292.50-40 275.25-40Q258-40 258-40Q258-30 258-19.75Q258-9.50 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q261.50 0 284 0Q306.50 0 339.75 0Q373 0 409.25 0Q445.50 0 477.50 0Q509.50 0 529.75 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550-20.25Q550-40.50 550-72.25Q550-104 550-139.50Q550-175 550-206.75Q550-238.50 550-258.75Q550-279 550-279M246-311.50Q246-311.50 246-292.75Q246-274 246-249.50Q246-225 246-206.25Q246-187.50 246-187.50Q246-187.50 246-187.50Q246-187.50 246-187.50Q246-184.50 246.50-184Q247-183.50 250-183.50Q255.50-183.50 260.75-183.50Q266-183.50 271.25-183.50Q276.50-183.50 282-183.50Q285-183.50 285.50-184Q286-184.50 286-187.50Q286-187.50 286-187.50Q286-187.50 286-187.50Q286-187.50 286-206.25Q286-225 286-249.50Q286-274 286-292.75Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-314.50 285.50-315Q285-315.50 282-315.50Q274-315.50 266.25-315.50Q258.50-315.50 250-315.50Q247-315.50 246.50-315Q246-314.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50M284-408Q286-408 286.75-408.25Q287.50-408.50 287.75-409.25Q288-410 288-412Q288-412 288-425.50Q288-439 288-459Q288-479 288-499Q288-519 288-532.50Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-547.50 288-548.25Q288-549 287.50-549.50Q287-550 286.25-550Q285.50-550 284-550Q284-550 276-550Q268-550 260-550Q252-550 252-550Q250.50-550 249.75-550Q249-550 248.50-549.50Q248-549 248-548.25Q248-547.50 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-532.50Q248-519 248-499Q248-479 248-459Q248-439 248-425.50Q248-412 248-412Q248-410 248.25-409.25Q248.50-408.50 249.25-408.25Q250-408 252-408Q252-408 260-408Q268-408 276-408Q284-408 284-408M550-188L550-398L510-398Q510-398 510-382.25Q510-366.50 510-345.50Q510-324.50 510-308.75Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-277.25Q510-261.50 510-240.50Q510-219.50 510-203.75Q510-188 510-188L550-188M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398"/>
          </g>
          <g transform="translate(292.79530086742704, 276.5) scale(0.2841335974318694, -0.2841335974318694)">
            <path fill="#0ea5e9" d="M251-337L291-337Q291-357.50 291-381.75Q291-406 291-432.25Q291-458.50 291-485.25Q291-512 291-537.50Q291-563 291-586Q291-586 275.25-586Q259.50-586 236.25-586Q213-586 189.75-586Q166.50-586 150.75-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q131.50-578.50 131.50-566Q131.50-553.50 135-546Q145.50-546 158.50-546Q171.50-546 186.25-546Q201-546 217.50-546Q234-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-525Q251-504 251-472.75Q251-441.50 251-410.25Q251-379 251-358Q251-337 251-337M-20-337L20-337Q20-337 20-358Q20-379 20-410.25Q20-441.50 20-472.75Q20-504 20-525Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q37.50-546 53.75-546Q70-546 84.75-546Q99.50-546 112.50-546Q125.50-546 136-546Q140-553.50 140-566Q140-578.50 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 120.25-586Q104.50-586 81.25-586Q58-586 34.75-586Q11.50-586-4.25-586Q-20-586-20-586Q-20-563-20-537.50Q-20-512-20-485.25Q-20-458.50-20-432.25Q-20-406-20-381.75Q-20-357.50-20-337M291-188L291-398L251-398Q251-398 251-382.25Q251-366.50 251-345.50Q251-324.50 251-308.75Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-277.25Q251-261.50 251-240.50Q251-219.50 251-203.75Q251-188 251-188L291-188M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398M291-249L251-249Q251-249 251-228Q251-207 251-175.75Q251-144.50 251-113.25Q251-82 251-61Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q234-40 217.50-40Q201-40 186.25-40Q171.50-40 158.50-40Q145.50-40 135-40Q131.50-32.50 131.50-20Q131.50-7.50 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 150.75 0Q166.50 0 189.75 0Q213 0 236.25 0Q259.50 0 275.25 0Q291 0 291 0Q291-23 291-48.50Q291-74 291-100.75Q291-127.50 291-153.75Q291-180 291-204.25Q291-228.50 291-249M20-249L-20-249Q-20-228.50-20-204.25Q-20-180-20-153.75Q-20-127.50-20-100.75Q-20-74-20-48.50Q-20-23-20 0Q-20 0-4.25 0Q11.50 0 34.75 0Q58 0 81.25 0Q104.50 0 120.25 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q140-7.50 140-20Q140-32.50 136-40Q125.50-40 112.50-40Q99.50-40 84.75-40Q70-40 53.75-40Q37.50-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-61Q20-82 20-113.25Q20-144.50 20-175.75Q20-207 20-228Q20-249 20-249"/>
          </g>
        </svg>`;
        return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
      }
            if (url.pathname === "/test-ai") {
        try {
          if (!env.AI) {
            return new Response(JSON.stringify({ error: "env.AI is undefined" }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
          if (typeof env.AI.run !== 'function') {
            return new Response(JSON.stringify({ error: "env.AI.run is not a function", type: typeof env.AI.run }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
          const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
            messages: [{ role: 'user', content: 'Say hello in Chinese' }],
            max_tokens: 50
          });
          return new Response(JSON.stringify({ 
            success: true, 
            result,
            resultType: typeof result,
            resultKeys: Object.keys(result || {})
          }, null, 2), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message, name: e.name }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/api/video-summary" && request.method === "POST") {
        try {
          const body = await request.json();
          const videoId = body.videoId;
          if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return new Response(JSON.stringify({ error: "Invalid video ID" }), { status: 400, headers: { "Content-Type": "application/json" } });
          }
          // Check KV cache first
          const cacheKey = "video-summary:v2:" + videoId;
          const cached = await env.AI_NEWS_KV.get(cacheKey);
          if (cached) {
            return new Response(JSON.stringify({ summary: cached, cached: true }), { headers: { "Content-Type": "application/json" } });
          }
          // Step 1: Fetch transcript directly from YouTube's internal API (no Pi 5)
          let transcriptText;
          try {
            transcriptText = await fetchYouTubeTranscript(videoId, env);
          } catch (transcriptErr) {
            return new Response(JSON.stringify({ error: "Transcript fetch failed: " + transcriptErr.message }), { status: 502, headers: { "Content-Type": "application/json" } });
          }
          if (!transcriptText || transcriptText.length < 20) {
            return new Response(JSON.stringify({ error: "Transcript too short or empty" }), { status: 404, headers: { "Content-Type": "application/json" } });
          }
          // Trim to max 6000 chars to avoid AI input limits
          if (transcriptText.length > 6000) {
            transcriptText = transcriptText.substring(0, 6000) + "...";
          }
          // Step 5: Call Workers AI to summarize in Traditional Chinese
          const prompt = "你係專業嘅AI助手。請用繁體中文總結以下YouTube影片嘅字幕，格式如下：\n\n【重點整理】\n• （第一個重點）\n• （第二個重點）\n• （第三個重點）\n• （如此類推）\n\n要求：\n- 每個重點用 • 開頭，一句話講完\n- 保持關鍵技術細節\n- 總字數約300-800字，視乎內容豐富程度\n- 最少列出3個重點，最多8個\n\n字幕：" + transcriptText;
          const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1200
          });
          let summary = "";
          if (typeof aiResult === 'string') {
            summary = aiResult;
          } else if (aiResult.response) {
            summary = aiResult.response;
          } else if (Array.isArray(aiResult) && aiResult.length > 0) {
            summary = aiResult[aiResult.length - 1]?.content || JSON.stringify(aiResult);
          } else {
            summary = JSON.stringify(aiResult);
          }
          summary = summary.trim();
          // Cache in KV for 30 days (2592000 seconds)
          await env.AI_NEWS_KV.put(cacheKey, summary, { expirationTtl: 2592000 });
          return new Response(JSON.stringify({ summary, cached: false }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message, name: e.name }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/api/news-summary" && request.method === "POST") {
        try {
          const body = await request.json();
          const articleUrl = body.url;
          const articleTitle = body.title || '';
          if (!articleUrl) {
            return new Response(JSON.stringify({ error: "Missing URL" }), { status: 400, headers: { "Content-Type": "application/json" } });
          }
          // Check KV cache first - use URL as cache key
          const cacheKey = "news-summary:v2:" + encodeURIComponent(articleUrl).substring(0, 200);
          const cached = await env.AI_NEWS_KV.get(cacheKey);
          if (cached) {
            return new Response(JSON.stringify({ summary: cached, cached: true }), { headers: { "Content-Type": "application/json" } });
          }
          // Step 1: Fetch article content from URL
          let articleText;
          try {
            articleText = await fetchArticleContent(articleUrl, env);
          } catch (fetchErr) {
            return new Response(JSON.stringify({ error: "Failed to fetch article: " + fetchErr.message }), { status: 502, headers: { "Content-Type": "application/json" } });
          }
          if (!articleText || articleText.length < 50) {
            return new Response(JSON.stringify({ error: "Article content too short or empty" }), { status: 404, headers: { "Content-Type": "application/json" } });
          }
          // Trim to max 8000 chars to avoid AI input limits
          if (articleText.length > 8000) {
            articleText = articleText.substring(0, 8000) + "...";
          }
          // Step 2: Call Workers AI to summarize in Traditional Chinese
          const prompt = "你係專業嘅AI助手。請用繁體中文詳細總結以下新聞文章嘅重點，格式如下：\n\n【詳細總結】\n• （第一個重點）\n• （第二個重點）\n• （第三個重點）\n• （如此類推）\n\n要求：\n- 每個重點用 • 開頭，每句完整表達一個要點\n- 保持關鍵技術細節和數據\n- 總字數約300-800字，視乎內容豐富程度\n- 最少列出3個重點，最多10個\n- 必須用繁體中文\n\n文章標題：" + articleTitle + "\n\n文章內容：" + articleText;
          const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500
          });
          let summary = "";
          if (typeof aiResult === 'string') {
            summary = aiResult;
          } else if (aiResult.response) {
            summary = aiResult.response;
          } else if (Array.isArray(aiResult) && aiResult.length > 0) {
            summary = aiResult[aiResult.length - 1]?.content || JSON.stringify(aiResult);
          } else {
            summary = JSON.stringify(aiResult);
          }
          summary = summary.trim();
          // Cache in KV for 30 days (2592000 seconds)
          await env.AI_NEWS_KV.put(cacheKey, summary, { expirationTtl: 2592000 });
          return new Response(JSON.stringify({ summary, cached: false }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message, name: e.name }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/trigger-youtube") {
        try {
          const videos = await fetchYouTubeVideos(env, true);
          return new Response(JSON.stringify({
            success: true,
            videoCount: videos.length,
            videos: videos.map(v => ({ title: v.title, channel: v.channel, videoId: v.id }))
          }, null, 2), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/trigger-news") {
        try {
          const newsData = await fetchNewsData(env);
          const toolsData = await fetchToolsData(env);
          const data = { ...newsData, tools: toolsData };
          data.updatedAt = new Date().toISOString();
          const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
          data.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
          // Minimum article threshold: don't overwrite KV with incomplete data
          const newHasEnough = newsData.news && newsData.news.length >= 15 &&
            newsData.summarizedNews && newsData.summarizedNews.length >= 5;
          let oldHasChinese = false;
          if (!newHasEnough) {
            try {
              const oldRaw = await env.AI_NEWS_KV.get("news-data");
              if (oldRaw) {
                const oldData = JSON.parse(oldRaw);
                const oldCn = (oldData.summarizedNews || []).filter(s =>
                  s.translatedTitle && /[\u4e00-\u9fff]/.test(s.translatedTitle)
                ).length;
                oldHasChinese = oldCn >= 10;
                if (oldHasChinese) {
                  console.log(`[/trigger-news] KEPT old KV: new has ${newsData.summarizedNews?.length || 0} summarized, old had ${oldCn} Chinese`);
                }
              }
            } catch (_e) {}
          }
          if (newHasEnough || oldHasChinese) {
            if (newHasEnough) {
              await env.AI_NEWS_KV.put("news-data", JSON.stringify(data));
              console.log(`[/trigger-news] KV updated: ${data.news.length} news`);
            } else {
              console.log(`[/trigger-news] SKIPPED KV write: kept existing data`);
            }
          } else {
            console.log(`[/trigger-news] SKIPPED KV write: only ${data.news?.length || 0} articles (min 15 required)`);
          }
          return new Response(JSON.stringify({
            success: true,
            newsCount: data.news.length,
            toolsCount: data.tools.length,
            updatedAt: data.updatedAt,
            kvWritten: newHasEnough
          }, null, 2), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/trigger-rankings") {
        try {
          const rankings = await fetchORRankings(env);
          if (rankings && rankings.usage && rankings.usage.length > 0) {
            rankings._updatedAt = new Date().toISOString();
            await env.AI_NEWS_KV.put("or-rankings", JSON.stringify(rankings));
            console.log(`[/trigger-rankings] KV updated: ${rankings.usage.length} usage, ${rankings.intelligence.length} intel`);
          }
          return new Response(JSON.stringify({ success: true, usage: rankings?.usage?.length || 0, intel: rankings?.intelligence?.length || 0 }, null, 2), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/debug-news") {
        try {
          const newsData = await fetchNewsData(env);
          const sample = newsData.news.slice(0, 3).map(item => ({
            title: item.title,
            titleZh: item.titleZh,
            translatedTitle: item.translatedTitle,
            hasTitleZh: !!item.titleZh,
            hasTranslatedTitle: !!item.translatedTitle
          }));
          return new Response(JSON.stringify({
            totalNews: newsData.news.length,
            sample: sample
          }, null, 2), {
            headers: { "Content-Type": "application/json" }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500 });
        }
      }
      if (url.pathname === "/debug-videos") {
        try {
          const videos = await fetchYouTubeVideos(env);
          return new Response(JSON.stringify({
            videoCount: videos.length,
            videos: videos.slice(0, 3).map(v => ({ id: v.id, title: v.title }))
          }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      }
      if (url.pathname === "/sw.js") {
        return new Response(`self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request).catch(()=>new Response('<h1>Offline</h1><p>Please connect to internet.</p>',{headers:{'Content-Type':'text/html'}})))});`, { headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=86400" } });
      }
      if (url.pathname === "/blog-admin") {
        const BLOG_ADMIN_PASSWORD = "ainews2026";
        if (request.method === "POST") {
          try {
            const body = await request.json();
            if (body.password !== BLOG_ADMIN_PASSWORD) {
              return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
            }
            const newPost = {
              id: "blog-manual-" + Date.now(),
              title: body.title || "",
              slug: (body.title || "").toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 50),
              content: body.content || "",
              keyTakeaway: body.keyTakeaway || "",
              imageUrl: body.imageUrl || "",
              videoId: body.videoId || "",
              videoTitle: body.videoTitle || "",
              sourceUrl: body.sourceUrl || "",
              sourceName: body.sourceName || "手動發表",
              tags: body.tags || ["AI應用"],
              tools: body.tools || [],
              publishedAt: new Date().toISOString(),
              date: new Date().toISOString().split("T")[0],
              author: body.author || "Ken",
              readTime: body.readTime || "3 min"
            };
            const existing = await env.AI_NEWS_KV.get("blog-posts") || "[]";
            const posts = JSON.parse(existing);
            posts.unshift(newPost);
            const trimmed = posts.slice(0, 30);
            await env.AI_NEWS_KV.put("blog-posts", JSON.stringify(trimmed));
            return new Response(JSON.stringify({ success: true, post: newPost }), { headers: { "Content-Type": "application/json" } });
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
          }
        }
        // GET: return admin HTML form
        const adminHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI Blog 管理</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Pliant","Noto Sans TC",-apple-system,sans-serif;background:#fafbfc;padding:1rem;color:#333}h1{font-size:1.5rem;margin-bottom:1rem;color:#0066ff}.form-group{margin-bottom:1rem}label{display:block;font-size:.875rem;color:#666;margin-bottom:.25rem}input,textarea{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:8px;font-size:1rem;font-family:inherit}textarea{min-height:120px;resize:vertical}button{background:#0066ff;color:#fff;border:none;padding:.75rem 1.5rem;border-radius:8px;font-size:1rem;cursor:pointer;width:100%}button:hover{background:#0052cc}.hint{font-size:.75rem;color:#999;margin-top:.25rem}#result{margin-top:1rem;padding:1rem;border-radius:8px;display:none}#result.success{background:#d4edda;color:#155724}#result.error{background:#f8d7da;color:#721c24}</style>
</head>
<body>
<h1>📝 AI Blog 手動發表</h1>
<div class="form-group"><label>密碼</label><input type="password" id="password" placeholder="輸入管理密碼"></div>
<div class="form-group"><label>標題</label><input type="text" id="title" placeholder="文章標題"></div>
<div class="form-group"><label>內容</label><textarea id="content" placeholder="文章內容（支援 Markdown）"></textarea></div>
<div class="form-group"><label>圖片 URL</label><input type="text" id="imageUrl" placeholder="https://..."></div>
<div class="form-group"><label>YouTube Video ID</label><input type="text" id="videoId" placeholder="dQw4w9WgXcQ"><div class="hint">YouTube 影片 ID，非完整網址</div></div>
<div class="form-group"><label>一句總結</label><input type="text" id="keyTakeaway" placeholder="文章核心要點"></div>
<div class="form-group"><label>標籤（逗號分隔）</label><input type="text" id="tags" placeholder="AI應用, 效率提升"></div>
<button onclick="submitPost()">發表文章</button>
<div id="result"></div>
<script>
async function submitPost() {
  const result = document.getElementById('result');
  result.style.display = 'none';
  const data = {
    password: document.getElementById('password').value,
    title: document.getElementById('title').value,
    content: document.getElementById('content').value,
    imageUrl: document.getElementById('imageUrl').value,
    videoId: document.getElementById('videoId').value,
    keyTakeaway: document.getElementById('keyTakeaway').value,
    tags: document.getElementById('tags').value.split(',').map(t=>t.trim()).filter(t=>t)
  };
  try {
    const res = await fetch('/blog-admin', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const json = await res.json();
    if (json.success) { result.className = 'success'; result.textContent = '✅ 發表成功！'; }
    else { result.className = 'error'; result.textContent = '❌ ' + (json.error || '失敗'); }
  } catch(e) { result.className = 'error'; result.textContent = '❌ ' + e.message; }
  result.style.display = 'block';
}
</script>
</body></html>`;
        return new Response(adminHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      if (url.searchParams.has("refresh")) {
        const newsData = await fetchNewsData(env);
        const toolsData = await fetchToolsData(env);
        const videosData = await fetchYouTubeVideos(env);
      const data2 = { ...newsData, tools: toolsData, videos: videosData };
      data2.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
      data2.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
      // Minimum article threshold: don't overwrite KV with incomplete data
      // Prevents transient RSS failures from destroying good KV cache
      if (newsData.news && newsData.news.length >= 15) {
        await env.AI_NEWS_KV.put("news-data", JSON.stringify(data2));
        console.log(`[?refresh=1] KV updated: ${newsData.news.length} news, ${toolsData?.length || 0} tools`);
      } else {
        console.log(`[?refresh=1] SKIPPED KV write: only ${newsData.news?.length || 0} articles (min 15 required)`);
      }
      const orRankings = await readORRankings(env);
      data2.orRankings = orRankings;
      const html2 = generatePage(data2);
        return new Response(html2, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Access-Control-Allow-Origin": "*" } });
      }
      const cached = await env.AI_NEWS_KV.get("news-data");
      if (cached) {
      const data2 = JSON.parse(cached);
      const ytCacheKey = 'youtube:videos:v25';
      const ytCached = await readYouTubeCache(env, ytCacheKey);
      if (ytCached && ytCached.filteredVideos.length > 0) {
        data2.videos = ytCached.filteredVideos;
        console.log(`[YouTube] Using ${ytCacheKey}: ${ytCached.rawVideos.length} raw videos, ${data2.videos.length} after whitelist filter`);
      } else if (Array.isArray(data2.videos) && data2.videos.length > 0) {
        data2.videos = filterAllowedYouTubeVideos(data2.videos, "[YouTube] NEWS-DATA");
        console.log(`[YouTube] Falling back to news-data videos: ${data2.videos.length} usable videos`);
      } else {
        console.log(`[YouTube] No usable cached videos found, attempting live fetch for page render`);
        data2.videos = await fetchYouTubeVideos(env);
        console.log(`[YouTube] Live fetch fallback returned ${data2.videos.length} videos`);
      }
      const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
      data2.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
      const orRankings2 = await readORRankings(env);
      data2.orRankings = orRankings2;
      const html2 = generatePage(data2);
        return new Response(html2, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Access-Control-Allow-Origin": "*" } });
      }
      const newsData = await fetchNewsData(env);
      const toolsData = await fetchToolsData(env);
      const videosData = await fetchYouTubeVideos(env);
      const data = { ...newsData, tools: toolsData, videos: videosData };
      const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
      data.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
      const orRankings3 = await readORRankings(env);
      data.orRankings = orRankings3;
      const html = generatePage(data);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Access-Control-Allow-Origin": "*" } });
    } catch (err) {
      console.error("Fetch error:", err.message, err.stack);
      return new Response("Error: " + err.message, { status: 500, headers: { "Content-Type": "text/plain" } });
    }
  }
};
function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml, "escapeHtml");
function formatStars(stars) {
  if (stars >= 1e6) return (stars / 1e6).toFixed(1) + "M";
  if (stars >= 1e3) return (stars / 1e3).toFixed(1) + "k";
  return stars.toString();
}
__name(formatStars, "formatStars");
async function fetchORRankings(env) {
  try {
    const [usageRes, modelsRes] = await Promise.all([
      fetch("https://openrouter.ai/api/frontend/v1/rankings/models?view=week"),
      fetch("https://openrouter.ai/api/v1/models")
    ]);
    if (!usageRes.ok || !modelsRes.ok) {
      console.log("[ORRankings] API error:", usageRes.status, modelsRes.status);
      return null;
    }
    const usageData = await usageRes.json();
    const modelsData = await modelsRes.json();
    const items = usageData.data || [];
    const models = modelsData.data || [];

    // Aggregate token usage by model + track change
    const usageMap = {};
    for (const item of items) {
      const slug = item.model_permaslug || 'unknown';
      if (!usageMap[slug]) usageMap[slug] = { prompt: 0, completion: 0, count: 0, change: null, bestTokenCount: 0 };
      usageMap[slug].prompt += item.total_prompt_tokens || 0;
      usageMap[slug].completion += item.total_completion_tokens || 0;
      usageMap[slug].count += item.count || 0;
      // Track change from the entry with most tokens (handles duplicate slugs)
      const itemTokens = (item.total_prompt_tokens || 0) + (item.total_completion_tokens || 0);
      if (item.change != null && itemTokens > usageMap[slug].bestTokenCount) {
        usageMap[slug].change = item.change;
        usageMap[slug].bestTokenCount = itemTokens;
      }
    }
    const usageSorted = Object.entries(usageMap)
      .map(([k, v]) => ({ ...v, slug: k }))
      .sort((a, b) => (b.prompt + b.completion) - (a.prompt + a.completion));
    const usageRanking = usageSorted.slice(0, 15).map((v, i) => {
      const total = v.prompt + v.completion;
      let change = '—';
      if (v.change != null) {
        const pct = Math.round(v.change * 100);
        if (pct > 0) change = '↑' + pct + '%';
        else if (pct < 0) change = '↓' + Math.abs(pct) + '%';
        else change = '0%';
      }
      return {
        rank: i + 1,
        name: v.slug,
        total: total >= 1e12 ? (total / 1e12).toFixed(1) + 'T' :
              total >= 1e9 ? (total / 1e9).toFixed(1) + 'B' :
              (total / 1e6).toFixed(0) + 'M',
        requests: v.count >= 1e9 ? (v.count / 1e9).toFixed(1) + 'B' :
                  v.count >= 1e6 ? (v.count / 1e6).toFixed(1) + 'M' :
                  v.count >= 1e3 ? (v.count / 1e3).toFixed(0) + 'K' :
                  String(v.count),
        change
      };
    });

    // Intelligence ranking from benchmarks
    const intelList = [];
    for (const m of models) {
      const aa = m.benchmarks && m.benchmarks.artificial_analysis;
      if (aa && aa.intelligence_index != null) {
        intelList.push({
          name: m.id || m.name || 'unknown',
          intel: aa.intelligence_index,
          coding: aa.coding_index || 0,
          agent: aa.agentic_index || 0
        });
      }
    }
    intelList.sort((a, b) => b.intel - a.intel);
    const intelRanking = intelList.slice(0, 15).map((v, i) => ({
      rank: i + 1,
      name: v.name,
      intel: v.intel.toFixed(1),
      coding: v.coding.toFixed(1),
      agent: v.agent.toFixed(1)
    }));

    return { usage: usageRanking, intelligence: intelRanking };
  } catch (err) {
    console.log("[ORRankings] Fetch error:", err.message);
    return null;
  }
}
__name(fetchORRankings, "fetchORRankings");
async function readORRankings(env) {
  try {
    const raw = await env.AI_NEWS_KV.get("or-rankings");
    if (raw) {
      const data = JSON.parse(raw);
      const updatedAt = data._updatedAt ? new Date(data._updatedAt) : null;
      const hoursAgo = updatedAt ? (Date.now() - updatedAt.getTime()) / 3600000 : 999;
      if (hoursAgo < 25 && data.usage && data.intelligence) {
        console.log(`[ORRankings] KV cache hit: ${hoursAgo.toFixed(1)}h old`);
        return { usage: data.usage, intelligence: data.intelligence };
      }
    }
  } catch (_) {}
  const fresh = await fetchORRankings(env);
  if (fresh) {
    try {
      await env.AI_NEWS_KV.put("or-rankings", JSON.stringify({ ...fresh, _updatedAt: new Date().toISOString() }));
      console.log("[ORRankings] Saved fresh data to KV");
    } catch (_) {}
  }
  return fresh;
}
__name(readORRankings, "readORRankings");
function generatePage({ news = [], tools = [], videos = [], blogPosts = [], updatedAt, summarizedNews = [], summarizedAt = null, orRankings = null }) {
  console.log('generatePage called with:', typeof news, typeof tools);
  console.log('  news:', Array.isArray(news) ? `Array(${news.length})` : typeof news);
  console.log('  tools:', Array.isArray(tools) ? `Array(${tools.length})` : typeof tools);
  
  const newsCount = news.length;
  const toolsCount = tools.length;
  const videosCount = videos.length;
  const fetchTime = updatedAt ? new Date(updatedAt) : new Date();
  const lastUpdated = "更新時間：" + fetchTime.toLocaleString("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Hong_Kong"
  });
  let html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><meta name="theme-color" content="#fafbfc"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="apple-mobile-web-app-title" content="PikAI"><link rel="manifest" href="/manifest.json?v=13"><link rel="icon" type="image/png" href="/icon-192.png?v=6"><link rel="apple-touch-icon" href="/icon-192.png?v=6"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Pliant:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><title>PikAI</title><style>';
  html += "* { box-sizing: border-box; margin: 0; padding: 0; }";
  html += 'body { font-family: "Pliant", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif; background: #fafbfc; color: #0f172a; line-height: 1.6; -webkit-font-smoothing: antialiased; overflow-x: hidden; }';
  html += ".container { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1rem; }";
  html += ".hero { position: relative; padding: 64px 20px 20px; text-align: center; background: #ffffff; overflow: hidden; }";
  html += ".hero-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(14,165,233,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.03) 1px, transparent 1px); background-size: 60px 60px; animation: gridDrift 30s linear infinite; }";
  html += ".hero-grid::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,165,233,0.06) 0%, transparent 60%); }";
  html += "@keyframes gridDrift { 0% { transform: translate(0,0); } 100% { transform: translate(60px,60px); } }";
  html += ".hero-content { position: relative; z-index: 1; }";
  html += ".logo-svg { display: inline-block; vertical-align: middle; width: 210px; height: auto; margin-bottom: 6px; }";
  html += ".hero-subtitle { font-size: 15px; color: #475569; font-weight: 400; letter-spacing: 0.3px; margin-bottom: 0; }";
  html += ".refresh-badge { display: none; }";
  html += ".loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(135deg, #fafbfc 0%, #e4e8ec 100%); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: opacity 0.5s; }";
  html += ".loading-overlay.hidden { opacity: 0; pointer-events: none; }";
  html += ".loading-spinner { width: 50px; height: 50px; border: 4px solid rgba(0,102,255,0.1); border-top-color: #0066ff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1.5rem; }";
  html += ".loading-text { font-size: 1.1rem; color: #555; font-weight: 600; }";
  html += ".loading-subtext { font-size: 0.85rem; color: #888; margin-top: 0.5rem; }";
  html += "@keyframes spin { to { transform: rotate(360deg); } }";
  html += ".tabs { display: flex; justify-content: center; gap: 6px; padding: 14px 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; background: #ffffff; border-bottom: 1px solid #f1f5f9; position: sticky; top: 0; z-index: 100; }";
  html += ".tabs::-webkit-scrollbar { display: none; }";
  html += ".tab { flex-shrink: 0; padding: 9px 18px; background: transparent; border: 1px solid transparent; border-radius: 100px; cursor: pointer; font-weight: 500; color: #475569; transition: all 0.25s ease; white-space: nowrap; font-size: 13px; }";
  html += ".tab:hover { background: rgba(0,0,0,0.03); color: #0f172a; }";
  html += ".tab.active { background: #0f172a; color: #fff; border-color: #0f172a; font-weight: 600; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15); }";
  html += ".tab-icon { font-size: 1.3rem; }";
  html += ".tab-count { font-size: 10px; font-weight: 700; padding: 2px 8px; background: rgba(255,255,255,0.15); border-radius: 100px; margin-left: 5px; display: inline-block; }";
  html += ".tab:not(.active) .tab-count { background: #f1f5f9; color: #94a3b8; }";
  html += ".content-section { display: none !important; visibility: hidden !important; height: 0 !important; max-height: 0 !important; overflow: hidden !important; opacity: 0 !important; position: absolute !important; left: -9999px !important; }";
  html += ".content-section.active { display: block !important; visibility: visible !important; height: auto !important; max-height: none !important; overflow: visible !important; opacity: 1 !important; position: static !important; left: auto !important; padding-top: 1.5rem; }";
  html += ".card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem; max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }";
  html += ".card { background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; overflow: hidden; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px -2px rgba(0,0,0,0.04); display: flex; flex-direction: column; height: 100%; }";
  html += ".card:hover { transform: translateY(-3px); box-shadow: 0 4px 20px -4px rgba(0,0,0,0.08), 0 8px 32px -8px rgba(0,0,0,0.06); border-color: #e2e8f0; }";
  html += ".card-image { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: linear-gradient(135deg, #e8e8e8, #f5f5f5); }";
  html += ".card-image-placeholder { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); color: #ccc; font-size: 3rem; }";
  html += ".card-image-favicon { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); }";
  html += ".card-image-favicon img { width: 48px; height: 48px; object-fit: contain; }";
  html += ".summarized-image-favicon { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); }";
  html += ".summarized-image-favicon img { width: 48px; height: 48px; object-fit: contain; }";
  html += ".card-body { padding: 1.1rem; flex: 1; display: flex; flex-direction: column; }";
  html += ".card-source { font-size: 0.72rem; color: #0066ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; font-weight: 600; }";
  html += ".card-title { font-size: 1.2rem; color: #222; line-height: 1.45; margin-bottom: 0.6rem; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; letter-spacing: -0.01em; }";
  html += ".card-summary { font-size: 1.02rem; color: #555; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; transition: all 0.3s; }";
  html += ".card-summary.expanded { -webkit-line-clamp: unset; display: block; }";
  html += ".card-summary-toggle { font-size: 0.72rem; color: #0066ff; cursor: pointer; margin-top: 4px; font-weight: 600; text-align: right; align-self: flex-end; }";
  html += ".card-summary-placeholder { font-size: 1.02rem; color: #999; font-style: italic; line-height: 1.55; }";
  html += ".card-footer { margin-top: auto; padding-top: 0.8rem; display: flex; align-items: center; gap: 0.5rem; }";
  html += ".card-stars { font-size: 0.96rem; color: #f5a623; }";
  html += ".card-lang { font-size: 0.9rem; color: #888; }";
  html += ".empty-state { text-align: center; padding: 3rem 1rem; color: #888; }";
  html += ".empty-state-icon { font-size: 3rem; margin-bottom: 1rem; }";
  html += "footer { text-align: center; padding: 2rem 1rem; color: #999; font-size: 0.8rem; margin-top: 2rem; border-top: 1px solid rgba(0,0,0,0.05); }";
  html += ".back-to-top { position: fixed; bottom: 1.5rem; right: 1.5rem; width: 48px; height: 48px; border-radius: 50%; background: #6366f1; color: white; border: none; font-size: 1.4rem; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 0.3s, transform 0.2s; box-shadow: 0 4px 12px rgba(99,102,241,0.4); z-index: 999; display: flex; align-items: center; justify-content: center; }";
  html += ".back-to-top.visible { opacity: 1; pointer-events: auto; }";
  html += ".back-to-top:hover { transform: translateY(-2px); background: #818cf8; }";
  html += ".knowledge-container { max-width: 800px; margin: 0 auto; padding: 1rem 0; }";
  html += ".knowledge-card { background: #fff; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #f0f0f0; }";
  html += ".knowledge-card-header { font-size: 1.32rem; font-weight: 700; color: #0f172a; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #f0f4ff; display: flex; align-items: center; gap: 0.5rem; }";
  html += ".knowledge-list { display: flex; flex-direction: column; gap: 0.75rem; }";
  html += ".knowledge-item { display: flex; gap: 1rem; align-items: flex-start; padding: 0.75rem; border-radius: 10px; background: #fafbfc; transition: background 0.2s; }";
  html += ".knowledge-item:hover { background: #f0f4ff; }";
  html += ".knowledge-term { font-weight: 700; color: #0066ff; min-width: 120px; flex-shrink: 0; font-size: 0.95rem; }";
  html += ".knowledge-desc { color: #555; font-size: 0.9rem; line-height: 1.5; }";
  html += ".category-tag { display: inline-block; padding: 0.2rem 0.6rem; background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; border-radius: 12px; font-size: 0.75rem; font-weight: 600; margin-right: 0.4rem; }";
  html += ".tool-lang { color: #888; font-size: 0.8rem; margin-left: auto; }";
  html += ".card-source { display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem; }";
  html += ".importance-badge { display: inline-block; padding: 0.2rem 0.5rem; background: linear-gradient(135deg, #ff6b35, #f7931e); color: #fff; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 0.4rem; animation: pulse 2s infinite; }";
  html += "@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }";
  /* AI Summarized News Styles */
  html += ".summarized-section { margin-bottom: 1.5rem; }";
  html += ".summarized-header { font-size: 1.1rem; font-weight: 700; color: #0f172a; margin-bottom: 1rem; padding: 0.8rem 1rem; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); border-radius: 12px; display: flex; align-items: center; gap: 0.5rem; }";
  html += ".summarized-time { font-size: 0.75rem; color: #888; margin-left: auto; font-weight: 400; }";
  html += ".summarized-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }";
  html += ".summarized-card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e8e8f0; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }";
  html += ".summarized-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }";
  html += ".summarized-image { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: linear-gradient(135deg, #e8e8e8, #f5f5f5); }";
  html += ".summarized-image-placeholder { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); color: #ccc; font-size: 3rem; }";
  html += ".summarized-content { padding: 1rem; }";
  html += ".summarized-source { font-size: 0.84rem; color: #0066ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem; font-weight: 600; }";
  html += ".summarized-title { font-size: 1.14rem; color: #222; line-height: 1.4; margin-bottom: 0.5rem; font-weight: 600; }";
  html += ".video-title { font-size: 1.05rem; color: #222; line-height: 1.45; margin-bottom: 0.5rem; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }";
  html += ".summarized-text { font-size: 1.02rem; color: #555; line-height: 1.5; }";
  html += ".video-ai-wrap { text-align: right; }";
  html += ".video-ai-btn { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; padding: 5px 12px; background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; border: none; border-radius: 20px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }";
  html += ".video-ai-btn:hover { opacity: 0.85; }";
  html += ".video-ai-btn:disabled { opacity: 0.5; cursor: wait; }";
  html += ".video-ai-summary { margin-top: 8px; padding: 10px 12px; background: #f0f4ff; border-radius: 10px; font-size: 0.88rem; color: #333; line-height: 1.6; display: none; text-align: left; }";
  html += ".video-ai-summary.visible { display: block; }";
  html += ".video-ai-error { color: #dc3545; font-size: 0.82rem; margin-top: 6px; }";
  html += ".ai-digest-badge { display: inline-block; background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-right: 6px; vertical-align: middle; }";
  // News AI deep summary button styles
  html += ".news-ai-wrap { text-align: right; }";
  html += ".news-ai-btn { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; padding: 5px 12px; background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; border: none; border-radius: 20px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }";
  html += ".news-ai-btn:hover { opacity: 0.85; }";
  html += ".news-ai-btn:disabled { opacity: 0.5; cursor: wait; }";
  html += ".news-ai-summary { margin-top: 8px; padding: 10px 12px; background: #f0f4ff; border-radius: 10px; font-size: 0.88rem; color: #333; line-height: 1.6; display: none; text-align: left; }";
  html += ".news-ai-summary.visible { display: block; }";
  html += ".news-ai-body p { margin: 0 0 0.6em 0; }";
  html += ".news-ai-body p:last-child { margin-bottom: 0; }";
  html += ".news-ai-error { color: #dc3545; font-size: 0.82rem; margin-top: 6px; }";
  /* Blog article styles */
  html += ".blog-list { display: flex; flex-direction: column; gap: 2rem; max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; }";
  html += ".blog-article { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); border: 1px solid #e8e8f0; }";
  html += ".blog-article-header { padding: 1.5rem 1.5rem 0.5rem; }";
  html += ".blog-article-meta { font-size: 0.8rem; color: #888; margin-bottom: 0.5rem; }";
  html += ".blog-article-meta .tag { display: inline-block; background: #f0f4ff; color: #0066ff; padding: 2px 10px; border-radius: 12px; margin-right: 0.5rem; font-size: 0.75rem; font-weight: 600; }";
  html += ".blog-article-title { font-size: 1.4rem; font-weight: 700; color: #0f172a; line-height: 1.4; margin-bottom: 1rem; }";
  html += ".blog-article-image { width: 100%; max-height: 400px; object-fit: cover; }";
  html += ".blog-article-body { padding: 1.5rem; font-size: 1.05rem; line-height: 1.8; color: #333; }";
  html += ".blog-article-body p { margin-bottom: 1.25rem; }";
  html += ".blog-article-body strong { color: #0f172a; font-weight: 700; }";
  html += ".blog-article-body ol, .blog-article-body ul { margin: 1.25rem 0 1.25rem 1.5rem; }";
  html += ".blog-article-body li { margin-bottom: 0.6rem; }";
  html += ".blog-article-body h3 { font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 2.5rem 0 1rem 0; background: linear-gradient(135deg, #f0f4ff 0%, #e8e8f0 100%); padding: 0.875rem 1rem; border-left: 4px solid #0066ff; border-radius: 0 10px 10px 0; box-shadow: 0 1px 4px rgba(0,102,255,0.08); }";
  html += ".blog-article-body h3::before { display: none; }";
  html += ".blog-article-body h3.no-step-badge { background: linear-gradient(135deg, #f8f9fc 0%, #f0f2f5 100%); border-left-color: #888; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }";
  html += ".blog-article-body h3.no-step-badge::before { display: none; }";
  html += ".blog-article-body a { color: #0066ff; text-decoration: none; }";
  html += ".blog-article-body a:hover { text-decoration: underline; }";
  html += ".blog-article-body a.tool-link { background: linear-gradient(135deg, #f0f4ff, #e8e8f0); padding: 2px 8px; border-radius: 6px; font-weight: 600; font-size: 0.95em; border: 1px solid rgba(0,102,255,0.15); transition: all 0.2s; }";
  html += ".blog-article-body a.tool-link:hover { background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; text-decoration: none; border-color: transparent; }";
  html += ".blog-article-body code { background: #fafbfc; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #e83e8c; }";
  html += ".blog-article-body .code-block { background: #0f172a; color: #e8e8f0; padding: 1.25rem; border-radius: 12px; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; line-height: 1.7; overflow-x: auto; margin: 1.25rem 0; white-space: pre-wrap; word-break: break-word; }";
  html += ".blog-article-body .code-block code { background: transparent; color: #e8e8f0; padding: 0; font-size: inherit; }";
  html += ".blog-article-body .example-block { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1px solid #fcd34d; border-radius: 14px; padding: 1.5rem; margin: 1.5rem 0; position: relative; box-shadow: 0 2px 8px rgba(252,211,77,0.15); }";
  html += ".blog-article-body .example-block::before { content: '💡 實際例子'; display: block; font-weight: 700; color: #92400e; font-size: 0.95rem; margin-bottom: 0.75rem; letter-spacing: 0.02em; }";
  html += ".blog-article-body .example-block p { margin-bottom: 0.75rem; }";
  html += ".blog-article-body .example-block p:last-child { margin-bottom: 0; }";
  html += ".blog-article-body .faq-block { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #22c55e; border-radius: 0 10px 10px 0; padding: 1rem 1.25rem; margin: 1rem 0; box-shadow: 0 1px 4px rgba(34,197,94,0.08); }";
  html += ".blog-article-body .faq-block p { margin-bottom: 0.5rem; }";
  html += ".blog-article-body .faq-block p:last-child { margin-bottom: 0; }";
  html += ".blog-article-body .faq-block strong { color: #15803d; }";
  /* Blog collapse/expand styles */
  html += ".blog-article { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); border: 1px solid #e8e8f0; transition: all 0.3s ease; position: relative; }";
  html += ".blog-article-header { padding: 1.5rem 1.5rem 0.5rem; cursor: pointer; transition: background 0.2s; }";
  html += ".blog-article-header:hover { background: #fafbfc; }";
  html += ".blog-article-preview { font-size: 0.95rem; color: #666; line-height: 1.6; margin: 0.75rem 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }";
  html += ".blog-toggle-bar { display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; padding: 0.75rem 1.5rem; color: #0066ff; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border-top: 1px solid #f0f0f0; }";
  html += ".blog-toggle-bar:hover { background: #f8f9fc; }";
  html += ".blog-toggle-bar .toggle-icon { transition: transform 0.3s ease; }";
  html += ".blog-article-content { max-height: 0; overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s ease; opacity: 0; }";
  html += ".blog-article.expanded .blog-article-content { max-height: 20000px; opacity: 1; }";
  html += ".blog-article.expanded .blog-toggle-bar .toggle-icon { transform: rotate(180deg); }";
  html += ".blog-article.expanded .blog-article-preview { display: none; }";
  html += ".blog-article.expanded .blog-toggle-bar .toggle-text::before { content: '收起'; }";
  html += ".blog-article.expanded .blog-toggle-bar .toggle-text { font-size: 0; }";
  html += ".blog-article.expanded .blog-toggle-bar .toggle-text::after { content: '收起閱讀'; font-size: 0.9rem; }";
  html += ".blog-article-image { width: 100%; max-height: 400px; object-fit: cover; }";
  html += ".blog-article.collapsed .blog-article-image { max-height: 200px; }";
  html += ".blog-article-body { padding: 1.5rem; font-size: 1.05rem; line-height: 1.8; color: #333; }";
  html += ".blog-article-footer .source-link { color: #0066ff; font-size: 0.9rem; text-decoration: none; }";
  html += ".blog-article-footer .video-btn { display: inline-flex; align-items: center; gap: 0.3rem; background: #ff0000; color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; text-decoration: none; cursor: pointer; }";
  html += ".blog-article-footer .video-btn:hover { background: #cc0000; }";
  html += ".blog-article-footer .takeaway { background: linear-gradient(135deg, #f0f4ff, #e8e8f0); padding: 1rem; border-radius: 12px; font-size: 0.95rem; color: #555; flex: 1; min-width: 200px; }";
  html += ".blog-article-footer .takeaway strong { color: #0066ff; }";
  html += ".tool-links-section { background: linear-gradient(135deg, #f8f9fc, #f0f2f5); padding: 1rem 1.25rem; border-radius: 12px; margin-top: 1rem; width: 100%; }";
  html += ".tool-links-section strong { color: #0f172a; font-size: 0.95rem; }";
  html += ".tool-links-list { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.6rem; }";
  html += ".tool-link { display: inline-block; background: linear-gradient(135deg, #f0f4ff, #e8e8f0); color: #0066ff; padding: 0.4rem 0.9rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; text-decoration: none; border: 1px solid rgba(0,102,255,0.15); transition: all 0.2s; }";
  html += ".tool-link:hover { background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; text-decoration: none; border-color: transparent; transform: translateY(-1px); }";
  /* Custom SVG icons for ranking card (CSS ::before) */
  html += "<style>";
  html += ".rank-header::before { content: ''; width: 1.3rem; height: 1.3rem; flex-shrink: 0; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230066ff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3Cpath d='M17 15V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v11'/%3E%3Cpath d='M6 9v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9'/%3E%3C/svg%3E\"); background-size: contain; background-repeat: no-repeat; background-position: center; }";
  html += ".rank-tab[data-rank=\"usage\"]::before { content: ''; width: 0.9rem; height: 0.9rem; display: inline-block; vertical-align: -0.15em; margin-right: 0.3rem; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v18h18'/%3E%3Cpath d='m19 9-5 5-4-4-3 3'/%3E%3C/svg%3E\"); background-size: contain; background-repeat: no-repeat; background-position: center; }";
  html += ".rank-tab[data-rank=\"intel\"]::before { content: ''; width: 0.9rem; height: 0.9rem; display: inline-block; vertical-align: -0.15em; margin-right: 0.3rem; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5a3 3 0 1 0-3 3c0 1.5-1.5 3-3 4.5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9c0-1.5-1.5-3-3-4.5a3 3 0 0 0-3-3z'/%3E%3Cpath d='M9 8a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H9z'/%3E%3C/svg%3E\"); background-size: contain; background-repeat: no-repeat; background-position: center; }";
  html += ".rank-tab.active::before { opacity: 1; }";
  html += ".rank-section { background: #fff; border-radius: 16px; margin-bottom: 1.2rem; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border: 1px solid #e8e8f0; max-width: 1200px; margin-left: auto; margin-right: auto; }";
  html += ".rank-header { padding: 1rem 1.2rem 0.8rem; font-size: 1.05rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 50%, #faf5ff 100%); border-bottom: 1px solid #eee; }";
  html += ".rank-header-sub { font-size: 0.65rem; font-weight: 500; color: #999; margin-left: auto; }";
  html += ".rank-tabs { display: flex; gap: 0.4rem; padding: 0.6rem 1.2rem; border-bottom: 1px solid #f0f0f5; flex-wrap: wrap; }";
  html += ".rank-tab { padding: 0.35rem 0.9rem; font-size: 0.78rem; font-weight: 600; border-radius: 20px; cursor: pointer; color: #888; background: #f0f2f5; transition: all 0.2s; border: none; white-space: nowrap; }";
  html += ".rank-tab:hover { background: #e0e3e8; transform: translateY(-1px); }";
  html += ".rank-tab.active { background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; box-shadow: 0 2px 8px rgba(0,102,255,0.25); }";
  html += ".rank-content { display: none; padding: 0; }";
  html += ".rank-content.active { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }";
  html += ".rank-content.active::-webkit-scrollbar { height: 3px; }";
  html += ".rank-content.active::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }";
  html += ".rank-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }";
  html += ".rank-table th { background: #fafbfe; color: #888; font-weight: 600; padding: 0.45rem 0.6rem; text-align: right; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #e8e8f0; }";
  html += ".rank-table th:first-child { text-align: center; width: 2.5rem; }";
  html += ".rank-table th:nth-child(2) { text-align: left; }";
  html += ".rank-table td { padding: 0.45rem 0.5rem; text-align: right; border-bottom: 1px solid #f5f5f8; transition: background 0.15s; }";
  html += ".rank-table tr:hover td { background: #f8f9ff; }";
  html += ".rank-table td:first-child { text-align: center; }";
  html += ".rank-table td:nth-child(2) { text-align: left; font-weight: 600; color: #0f172a; font-size: 0.76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }";
  html += ".rank-table tr:last-child td { border-bottom: none; }";
  /* Medal badges */
  html += ".rank-medal { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; font-size: 0.72rem; font-weight: 800; }";
  html += ".rank-medal-1 { background: linear-gradient(135deg, #ffd700, #ffa500); color: #fff; box-shadow: 0 2px 6px rgba(255,165,0,0.3); }";
  html += ".rank-medal-2 { background: linear-gradient(135deg, #e0e0e0, #b0b0b0); color: #fff; box-shadow: 0 2px 6px rgba(176,176,176,0.3); }";
  html += ".rank-medal-3 { background: linear-gradient(135deg, #cd7f32, #a0522d); color: #fff; box-shadow: 0 2px 6px rgba(205,127,50,0.3); }";
  html += ".rank-num { color: #aaa; font-weight: 600; font-size: 0.72rem; }";
  /* Provider tag */
  html += ".rank-provider { display: inline-block; font-size: 0.58rem; font-weight: 600; color: #888; background: #f0f2f5; border-radius: 4px; padding: 0.08rem 0.32rem; margin-right: 0.35rem; vertical-align: middle; text-transform: uppercase; letter-spacing: 0.02em; }";
  /* Progress bar (usage) */
  html += ".rank-bar-wrap { width: 100%; max-width: 80px; height: 5px; background: #eee; border-radius: 3px; overflow: hidden; display: inline-block; vertical-align: middle; margin-left: 0.4rem; }";
  html += ".rank-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #0066ff, #7b2dff); transition: width 0.4s ease; }";
  html += ".rank-change { font-size: 0.75rem; font-weight: 600; color: #22c55e; } .rank-change.negative { color: #ef4444; } .rank-change.dash { color: #888; }";
  /* Score bars (intel) */
  html += ".rank-score-wrap { display: flex; align-items: center; gap: 0.2rem; justify-content: flex-end; }";
  html += ".rank-score-bar { width: 28px; height: 4px; background: #eee; border-radius: 2px; overflow: hidden; flex-shrink: 0; }";
  html += ".rank-score-fill { height: 100%; border-radius: 3px; }";
  html += ".rank-score-fill.intel { background: linear-gradient(90deg, #7b2dff, #a855f7); }";
  html += ".rank-score-fill.coding { background: linear-gradient(90deg, #0066ff, #3b82f6); }";
  html += ".rank-score-fill.agent { background: linear-gradient(90deg, #f59e0b, #f97316); }";
  html += ".rank-score-val { font-size: 0.68rem; font-weight: 600; color: #666; min-width: 1.6rem; text-align: right; }";
  html += ".rank-intel { position: relative; padding: 0.6rem 1.2rem 0.6rem 1.8rem; font-size: 0.65rem; color: #aaa; border-top: 1px solid #f0f0f0; }";
  html += ".rank-intel::before { content: ''; position: absolute; left: 1.2rem; top: 50%; transform: translateY(-50%); width: 1em; height: 1em; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cellipse cx='12' cy='5' rx='9' ry='3'/%3E%3Cpath d='M3 5v14c0 1.66 5.33 3 9 3s9-1.34 9-3V5'/%3E%3Cellipse cx='12' cy='19' rx='9' ry='3'/%3E%3C/svg%3E\") !important; background-size: contain; background-repeat: no-repeat; background-position: center; }";
  html += "@media (max-width: 700px) { .card-grid { grid-template-columns: 1fr; margin: 0 0.5rem; padding: 0; } .summarized-grid { margin: 0 0.5rem; padding: 0; } .blog-list { margin: 0 0.5rem; padding: 0; } .knowledge-container { padding: 0 0.5rem; } .wc-section, .rank-section { margin-left: 0.5rem; margin-right: 0.5rem; } .tabs { border-radius: 30px; overflow-x: auto; -webkit-overflow-scrolling: touch; justify-content: flex-start; padding-left: 0.5rem; } .tab { padding: 0.5rem 0.6rem; font-size: 0.8rem; gap: 0.3rem; min-width: max-content; flex: none; white-space: nowrap; line-height: 1.2; } .tab-icon { font-size: 1.1rem; } .tab-count { font-size: 0.65rem; padding: 0.1rem 0.3rem; } h1 { font-size: 1.8rem; } .rankings-card-header { font-size: 0.9rem; padding: 0.7rem 0.8rem; } .rankings-table td { padding: 0.4rem 0.4rem; font-size: 0.75rem; } .rankings-table .provider-cell { font-size: 0.68rem; } .knowledge-card { margin-bottom: 1rem; } .logo-svg { width: 176px; } .rank-table td { padding: 0.35rem 0.35rem; font-size: 0.7rem; } .rank-table th { padding: 0.35rem 0.35rem; font-size: 0.6rem; } .rank-table td:nth-child(2) { font-size: 0.68rem; max-width: 30vw; } .rank-provider { font-size: 0.5rem; } .rank-score-bar { width: 18px; } .rank-score-val { font-size: 0.6rem; min-width: 1.2rem; } .rank-bar-wrap { max-width: 50px; } .rank-medal { width: 1.2rem; height: 1.2rem; font-size: 0.6rem; } }";
  html += "</style>";
  html += "</head>";
  html += '<body>';
  html += '<div class="loading-overlay" id="loadingOverlay">';
  html += '<div class="loading-spinner"></div>';
  html += '<div class="loading-text">🤖 PikAI</div>';
  html += '<div class="loading-subtext">正在為您精選最新 AI 資訊...</div>';
  html += '</div>';
  html += '<div class="hero">';
  html += '<div class="hero-grid"></div>';
  html += '<div class="hero-content">';
  html += '<svg class="logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 505 150"><g transform="translate(20, 30) scale(0.20477815699658702, -0.20477815699658702)"><path fill="#0f172a" d="M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398M550-132L550-342L510-342Q510-342 510-326.25Q510-310.50 510-289.50Q510-268.50 510-252.75Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-237Q510-237 510-221.25Q510-205.50 510-184.50Q510-163.50 510-147.75Q510-132 510-132L550-132M-20-586L-20-296L20-296L20-546Q20-546 20-546Q20-546 20-546Q20-546 37.75-546Q55.50-546 78.50-546Q101.50-546 119.25-546Q137-546 137-546Q137-546 153.25-546Q169.50-546 191-546Q212.50-546 228.75-546Q245-546 245-546Q245-546 245-546Q245-546 245-546L245-445Q245-445 245-445Q245-445 245-445Q245-445 245-445Q245-445 245-445Q245-445 256-445Q267-445 285.25-445Q303.50-445 324.75-445Q346-445 366.75-445Q387.50-445 404.25-445Q421-445 429-445Q429-445 429-445Q429-445 429-445Q429-445 429-445Q431-445 439.75-437.50Q448.50-430 460.25-418.50Q472-407 483.50-395.25Q495-383.50 502.50-375Q510-366.50 510-365Q510-365 510-365Q510-365 510-365L510-287L550-287L550-586Q550-586 534.75-586Q519.50-586 494.25-586Q469-586 439-586Q409-586 379-586Q349-586 323.75-586Q298.50-586 283.25-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 268-586Q268-586 247.25-586Q226.50-586 193.75-586Q161-586 124-586Q87-586 54.25-586Q21.50-586 0.75-586Q-20-586-20-586M20-279L-20-279Q-20-279-20-258.75Q-20-238.50-20-206.75Q-20-175-20-139.50Q-20-104-20-72.25Q-20-40.50-20-20.25Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0 1 0Q22 0 55.25 0Q88.50 0 126 0Q163.50 0 196.75 0Q230 0 251 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272-9.50 272-19.75Q272-30 272-40Q272-40 253.75-40Q235.50-40 206.75-40Q178-40 146-40Q114-40 85.25-40Q56.50-40 38.25-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-57.25Q20-74.50 20-101.75Q20-129 20-159.50Q20-190 20-217.25Q20-244.50 20-261.75Q20-279 20-279M550-279L510-279L510-120Q510-118.50 502.25-110Q494.50-101.50 483-89.75Q471.50-78 459.50-66.50Q447.50-55 439-47.50Q430.50-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 411.75-40Q394.50-40 369-40Q343.50-40 318-40Q292.50-40 275.25-40Q258-40 258-40Q258-30 258-19.75Q258-9.50 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q261.50 0 284 0Q306.50 0 339.75 0Q373 0 409.25 0Q445.50 0 477.50 0Q509.50 0 529.75 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550-20.25Q550-40.50 550-72.25Q550-104 550-139.50Q550-175 550-206.75Q550-238.50 550-258.75Q550-279 550-279M243-300Q243-300 243-281.25Q243-262.50 243-238Q243-213.50 243-194.75Q243-176 243-176Q243-176 243-176Q243-176 243-176Q243-173 243.50-172.50Q244-172 247-172Q252.50-172 257.75-172Q263-172 268.25-172Q273.50-172 279-172Q282-172 282.50-172.50Q283-173 283-176Q283-176 283-176Q283-176 283-176Q283-176 283-194.75Q283-213.50 283-238Q283-262.50 283-281.25Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-300 283-300Q283-303 282.50-303.50Q282-304 279-304Q271-304 263.25-304Q255.50-304 247-304Q244-304 243.50-303.50Q243-303 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300Q243-300 243-300M243-300"/></g><g transform="translate(128.53242320819112, 30) scale(0.20477815699658702, -0.20477815699658702)"><path fill="#0f172a" d="M251-337L291-337Q291-357.50 291-381.75Q291-406 291-432.25Q291-458.50 291-485.25Q291-512 291-537.50Q291-563 291-586Q291-586 275.25-586Q259.50-586 236.25-586Q213-586 189.75-586Q166.50-586 150.75-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q131.50-578.50 131.50-566Q131.50-553.50 135-546Q145.50-546 158.50-546Q171.50-546 186.25-546Q201-546 217.50-546Q234-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-525Q251-504 251-472.75Q251-441.50 251-410.25Q251-379 251-358Q251-337 251-337M-20-337L20-337Q20-337 20-358Q20-379 20-410.25Q20-441.50 20-472.75Q20-504 20-525Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q37.50-546 53.75-546Q70-546 84.75-546Q99.50-546 112.50-546Q125.50-546 136-546Q140-553.50 140-566Q140-578.50 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 120.25-586Q104.50-586 81.25-586Q58-586 34.75-586Q11.50-586-4.25-586Q-20-586-20-586Q-20-563-20-537.50Q-20-512-20-485.25Q-20-458.50-20-432.25Q-20-406-20-381.75Q-20-357.50-20-337M-20-458L-20-228L20-228Q20-255.50 20-272Q20-288.50 20-303.75Q20-319 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-368 20-381Q20-394 20-402.75Q20-411.50 20-423.25Q20-435 20-458L-20-458M251-228L291-228L291-458L251-458Q251-435 251-423.25Q251-411.50 251-402.75Q251-394 251-381Q251-368 251-343Q251-343 251-343Q251-343 251-343Q251-343 251-343Q251-343 251-343Q251-319 251-303.75Q251-288.50 251-272Q251-255.50 251-228M291-249L251-249Q251-249 251-228Q251-207 251-175.75Q251-144.50 251-113.25Q251-82 251-61Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q234-40 217.50-40Q201-40 186.25-40Q171.50-40 158.50-40Q145.50-40 135-40Q131.50-32.50 131.50-20Q131.50-7.50 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 150.75 0Q166.50 0 189.75 0Q213 0 236.25 0Q259.50 0 275.25 0Q291 0 291 0Q291-23 291-48.50Q291-74 291-100.75Q291-127.50 291-153.75Q291-180 291-204.25Q291-228.50 291-249M20-249L-20-249Q-20-228.50-20-204.25Q-20-180-20-153.75Q-20-127.50-20-100.75Q-20-74-20-48.50Q-20-23-20 0Q-20 0-4.25 0Q11.50 0 34.75 0Q58 0 81.25 0Q104.50 0 120.25 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q140-7.50 140-20Q140-32.50 136-40Q125.50-40 112.50-40Q99.50-40 84.75-40Q70-40 53.75-40Q37.50-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-61Q20-82 20-113.25Q20-144.50 20-175.75Q20-207 20-228Q20-249 20-249M291-279L251-279Q251-264 251-248.25Q251-232.50 251-219Q251-205.50 251-197.25Q251-189 251-189Q251-189 251-189Q251-189 251-189Q251-189 251-187.50Q251-186 251-181.25Q251-176.50 251-166.25Q251-156 251-139Q251-139 251-139Q251-139 251-139Q251-139 233.75-139Q216.50-139 193.50-139Q170.50-139 153.25-139Q136-139 136-139Q136-139 136-133.25Q136-127.50 136-120Q136-112.50 136-106.75Q136-101 136-101Q143-101 151.50-101Q160-101 172.75-101Q185.50-101 203.50-101Q221.50-101 247-101Q250.50-101 257.50-101Q264.50-101 271-101Q277.50-101 280-101Q282-101 283.75-101Q285.50-101 287.25-101Q289-101 291-101Q291-116.50 291-140.50Q291-164.50 291-191Q291-217.50 291-241Q291-264.50 291-279M20-279L-20-279Q-20-264.50-20-241Q-20-217.50-20-191Q-20-164.50-20-140.50Q-20-116.50-20-101Q-18-101-16.25-101Q-14.50-101-12.75-101Q-11-101-9-101Q-6.50-101 0-101Q6.50-101 13.50-101Q20.50-101 24-101Q41-101 54.75-101Q68.50-101 79.25-101Q90-101 98.75-101Q107.50-101 114.25-101Q121-101 126.25-101Q131.50-101 136-101Q136-101 136-106.75Q136-112.50 136-120Q136-127.50 136-133.25Q136-139 136-139Q136-139 124.25-139Q112.50-139 95.25-139Q78-139 60.75-139Q43.50-139 31.75-139Q20-139 20-139Q20-139 20-139Q20-139 20-139Q20-156 20-166.25Q20-176.50 20-181.25Q20-186 20-187.50Q20-189 20-189Q20-189 20-189Q20-189 20-189Q20-189 20-197.25Q20-205.50 20-219Q20-232.50 20-248.25Q20-264 20-279"/></g><g transform="translate(184.0273037542662, 30) scale(0.20477815699658702, -0.20477815699658702)"><path fill="#0f172a" d="M245-373Q245-373 248-373Q251-373 255.50-373Q260-373 265-373Q270.50-373 275.25-373Q280-373 283-373Q286-373 286-373Q286-381 286-400.75Q286-420.50 286-445Q286-469.50 286-492.75Q286-516 286-531Q286-546 286-546Q286-546 286-546Q286-546 286-546Q286-546 286-546Q286-546 302.25-546Q318.50-546 344-546Q369.50-546 398-546Q426.50-546 452-546Q477.50-546 493.75-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-530.25Q510-514.50 510-496.25Q510-478 510-471Q510-465.50 510-460.25Q510-455 510-447.25Q510-439.50 510-427.50Q510-415.50 510-397Q510-397 510-397Q510-397 510-397Q510-397 510-397Q510-397 510-386.50Q510-376 510-362Q510-348 510-337.50Q510-327 510-327L550-327Q550-351.50 550-381.25Q550-411 550-444.25Q550-477.50 550-513.25Q550-549 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 528.50-586Q507-586 473-586Q439-586 400.50-586Q362-586 327.25-586Q292.50-586 269.75-586Q247-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-586Q245-586 245-580Q245-574 245-566Q245-558 245-552Q245-546 245-546Q245-546 245-546Q245-546 245-546Q245-546 245-546Q245-526 245-506.25Q245-486.50 245-467.75Q245-449 245-432Q245-415 245-400Q245-385 245-373M-20-307L20-307Q20-307 20-324.25Q20-341.50 20-368.75Q20-396 20-426.50Q20-457 20-484.25Q20-511.50 20-528.75Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 38.25-546Q56.50-546 85.25-546Q114-546 146-546Q178-546 206.75-546Q235.50-546 253.75-546Q272-546 272-546Q272-555.50 272-565.75Q272-576 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 251-586Q230-586 196.75-586Q163.50-586 126-586Q88.50-586 55.25-586Q22-586 1-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-565.75Q-20-545.50-20-513.75Q-20-482-20-446.50Q-20-411-20-379.25Q-20-347.50-20-327.25Q-20-307-20-307M20-298L-20-298L-20 0Q-20 0-4.50 0Q11 0 34.25 0Q57.50 0 81 0Q104.50 0 121 0Q137.50 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q139 0 139 0Q140.50 0 155.50 0Q170.50 0 192.25 0Q214 0 235.25 0Q256.50 0 270.75 0Q285 0 285 0L285-102Q306-102 327-102Q348-102 369-102Q390-102 411-102Q411-102 425-102Q439-102 459.75-102Q480.50-102 501.25-102Q522-102 536-102Q550-102 550-102Q550-102 550-102Q550-102 550-102Q550-102 550-102Q550-102 550-102L550-299L510-299L510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 510-142Q510-142 493.75-142Q477.50-142 452-142Q426.50-142 397.75-142Q369-142 343.25-142Q317.50-142 301.25-142Q285-142 285-142Q285-142 285-142Q285-142 285-142Q285-142 285-142Q285-142 285-154.75Q285-167.50 285-186.50Q285-205.50 285-224.50Q285-243.50 285-256.25Q285-269 285-269Q285-269 275-269Q265-269 265-269Q265-269 255-269Q245-269 245-269Q245-269 245-245.75Q245-222.50 245-188.50Q245-154.50 245-120.50Q245-86.50 245-63.25Q245-40 245-40Q245-40 245-40Q245-40 245-40Q245-40 229-40Q213-40 192-40Q171-40 155-40Q139-40 139-40Q139-40 121-40Q103-40 79.50-40Q56-40 38-40Q20-40 20-40Q20-40 20-40Q20-40 20-40L20-298M440-334Q440-334 440-334Q440-334 440-334Q440-334 450.50-325.50Q461-317 475-305.50Q489-294 499.50-285.50Q510-277 510-277L510-227L529-227L550-227Q550-227 550-248.50Q550-270 550-302Q550-334 550-366Q550-398 550-419.50Q550-441 550-441L529-441L510-441L510-391Q510-391 499.50-382.50Q489-374 475-362.50Q461-351 450.50-342.50Q440-334 440-334Q440-334 440-334Q440-334 440-334M-20-458L-20-228L20-228Q20-255.50 20-272Q20-288.50 20-303.75Q20-319 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-343 20-343Q20-368 20-381Q20-394 20-402.75Q20-411.50 20-423.25Q20-435 20-458"/></g><g transform="translate(352.5597269624573, 30) scale(0.20477815699658702, -0.20477815699658702)"><path fill="#0ea5e9" d="M-20-307L20-307Q20-307 20-324.25Q20-341.50 20-368.75Q20-396 20-426.50Q20-457 20-484.25Q20-511.50 20-528.75Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 38.25-546Q56.50-546 85.25-546Q114-546 146-546Q178-546 206.75-546Q235.50-546 253.75-546Q272-546 272-546Q272-555.50 272-565.75Q272-576 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 272-586Q272-586 251-586Q230-586 196.75-586Q163.50-586 126-586Q88.50-586 55.25-586Q22-586 1-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-586Q-20-586-20-565.75Q-20-545.50-20-513.75Q-20-482-20-446.50Q-20-411-20-379.25Q-20-347.50-20-327.25Q-20-307-20-307M510-307L550-307Q550-307 550-327.25Q550-347.50 550-379.25Q550-411 550-446.50Q550-482 550-513.75Q550-545.50 550-565.75Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 550-586Q550-586 529-586Q508-586 474.75-586Q441.50-586 404-586Q366.50-586 333.25-586Q300-586 279-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-586 258-586Q258-576 258-565.75Q258-555.50 258-546Q258-546 276.25-546Q294.50-546 323.25-546Q352-546 384-546Q416-546 444.75-546Q473.50-546 491.75-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-546Q510-546 510-528.75Q510-511.50 510-484.25Q510-457 510-426.50Q510-396 510-368.75Q510-341.50 510-324.25Q510-307 510-307M20-279L-20-279Q-20-279-20-258.75Q-20-238.50-20-206.75Q-20-175-20-139.50Q-20-104-20-72.25Q-20-40.50-20-20.25Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0-20 0Q-20 0 0.25 0Q20.50 0 52.50 0Q84.50 0 120.75 0Q157 0 190.25 0Q223.50 0 246 0Q268.50 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272 0 272 0Q272-9.50 272-19.75Q272-30 272-40Q272-40 254.75-40Q237.50-40 212-40Q186.50-40 161-40Q135.50-40 118.25-40Q101-40 101-40Q101-40 101-40Q101-40 101-40Q101-40 101-40Q99.50-40 91-47.50Q82.50-55 70.50-66.50Q58.50-78 47-89.75Q35.50-101.50 27.75-110Q20-118.50 20-120L20-279M550-279L510-279L510-120Q510-118.50 502.25-110Q494.50-101.50 483-89.75Q471.50-78 459.50-66.50Q447.50-55 439-47.50Q430.50-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 429-40Q429-40 411.75-40Q394.50-40 369-40Q343.50-40 318-40Q292.50-40 275.25-40Q258-40 258-40Q258-30 258-19.75Q258-9.50 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q258 0 258 0Q261.50 0 284 0Q306.50 0 339.75 0Q373 0 409.25 0Q445.50 0 477.50 0Q509.50 0 529.75 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550 0Q550 0 550-20.25Q550-40.50 550-72.25Q550-104 550-139.50Q550-175 550-206.75Q550-238.50 550-258.75Q550-279 550-279M246-311.50Q246-311.50 246-292.75Q246-274 246-249.50Q246-225 246-206.25Q246-187.50 246-187.50Q246-187.50 246-187.50Q246-187.50 246-187.50Q246-184.50 246.50-184Q247-183.50 250-183.50Q255.50-183.50 260.75-183.50Q266-183.50 271.25-183.50Q276.50-183.50 282-183.50Q285-183.50 285.50-184Q286-184.50 286-187.50Q286-187.50 286-187.50Q286-187.50 286-187.50Q286-187.50 286-206.25Q286-225 286-249.50Q286-274 286-292.75Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-311.50 286-311.50Q286-314.50 285.50-315Q285-315.50 282-315.50Q274-315.50 266.25-315.50Q258.50-315.50 250-315.50Q247-315.50 246.50-315Q246-314.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50Q246-311.50 246-311.50M284-408Q286-408 286.75-408.25Q287.50-408.50 287.75-409.25Q288-410 288-412Q288-412 288-425.50Q288-439 288-459Q288-479 288-499Q288-519 288-532.50Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-546 288-546Q288-547.50 288-548.25Q288-549 287.50-549.50Q287-550 286.25-550Q285.50-550 284-550Q284-550 276-550Q268-550 260-550Q252-550 252-550Q250.50-550 249.75-550Q249-550 248.50-549.50Q248-549 248-548.25Q248-547.50 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-546Q248-546 248-532.50Q248-519 248-499Q248-479 248-459Q248-439 248-425.50Q248-412 248-412Q248-410 248.25-409.25Q248.50-408.50 249.25-408.25Q250-408 252-408Q252-408 260-408Q268-408 276-408Q284-408 284-408M550-188L550-398L510-398Q510-398 510-382.25Q510-366.50 510-345.50Q510-324.50 510-308.75Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-293Q510-293 510-277.25Q510-261.50 510-240.50Q510-219.50 510-203.75Q510-188 510-188L550-188M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398"/></g><g transform="translate(461.09215017064844, 30) scale(0.20477815699658702, -0.20477815699658702)"><path fill="#0ea5e9" d="M251-337L291-337Q291-357.50 291-381.75Q291-406 291-432.25Q291-458.50 291-485.25Q291-512 291-537.50Q291-563 291-586Q291-586 275.25-586Q259.50-586 236.25-586Q213-586 189.75-586Q166.50-586 150.75-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q135-586 135-586Q131.50-578.50 131.50-566Q131.50-553.50 135-546Q145.50-546 158.50-546Q171.50-546 186.25-546Q201-546 217.50-546Q234-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-546Q251-546 251-525Q251-504 251-472.75Q251-441.50 251-410.25Q251-379 251-358Q251-337 251-337M-20-337L20-337Q20-337 20-358Q20-379 20-410.25Q20-441.50 20-472.75Q20-504 20-525Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q20-546 20-546Q37.50-546 53.75-546Q70-546 84.75-546Q99.50-546 112.50-546Q125.50-546 136-546Q140-553.50 140-566Q140-578.50 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 136-586Q136-586 120.25-586Q104.50-586 81.25-586Q58-586 34.75-586Q11.50-586-4.25-586Q-20-586-20-586Q-20-563-20-537.50Q-20-512-20-485.25Q-20-458.50-20-432.25Q-20-406-20-381.75Q-20-357.50-20-337M291-188L291-398L251-398Q251-398 251-382.25Q251-366.50 251-345.50Q251-324.50 251-308.75Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-293Q251-293 251-277.25Q251-261.50 251-240.50Q251-219.50 251-203.75Q251-188 251-188L291-188M20-398L-20-398L-20-188L20-188Q20-188 20-203.75Q20-219.50 20-240.50Q20-261.50 20-277.25Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-293Q20-293 20-308.75Q20-324.50 20-345.50Q20-366.50 20-382.25Q20-398 20-398M291-249L251-249Q251-249 251-228Q251-207 251-175.75Q251-144.50 251-113.25Q251-82 251-61Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q251-40 251-40Q234-40 217.50-40Q201-40 186.25-40Q171.50-40 158.50-40Q145.50-40 135-40Q131.50-32.50 131.50-20Q131.50-7.50 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 135 0Q135 0 150.75 0Q166.50 0 189.75 0Q213 0 236.25 0Q259.50 0 275.25 0Q291 0 291 0Q291-23 291-48.50Q291-74 291-100.75Q291-127.50 291-153.75Q291-180 291-204.25Q291-228.50 291-249M20-249L-20-249Q-20-228.50-20-204.25Q-20-180-20-153.75Q-20-127.50-20-100.75Q-20-74-20-48.50Q-20-23-20 0Q-20 0-4.25 0Q11.50 0 34.75 0Q58 0 81.25 0Q104.50 0 120.25 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q136 0 136 0Q140-7.50 140-20Q140-32.50 136-40Q125.50-40 112.50-40Q99.50-40 84.75-40Q70-40 53.75-40Q37.50-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-40Q20-40 20-61Q20-82 20-113.25Q20-144.50 20-175.75Q20-207 20-228Q20-249 20-249"/></g></svg>';
  html += '<p class="hero-subtitle">' + lastUpdated + '</p>';
  html += '</div>';
  html += '</div>';
  html += '<div class="tabs">';
  html += `<div class="tab tab-news active" data-tab-index="0" onclick="switchTab('news')"><span>今日必讀 <span class="tab-count">` + newsCount + "</span></span></div>";
  html += `<div class="tab tab-videos" data-tab-index="1" onclick="switchTab('videos')"><span>AI 影片 <span class="tab-count">` + Math.min(videosCount, 30) + "</span></span></div>";
  html += `<div class="tab tab-tools" data-tab-index="2" onclick="switchTab('tools')"><span>實用工具 <span class="tab-count">` + toolsCount + "</span></span></div>";
  html += `<div class="tab tab-knowledge" data-tab-index="3" onclick="switchTab('knowledge')"><span>AI 知識庫</span></div>`;
  html += `<div class="tab tab-blog" data-tab-index="4" onclick="switchTab('blog')"><span>應用實例</span></div>`;
  html += "</div>";
  html += '<div class="content-section section-news active">';
  // OpenRouter Model Rankings — premium redesign
  if (orRankings && orRankings.usage && orRankings.usage.length > 0) {
    var maxUsage = 0;
    orRankings.usage.forEach(function(r) { if (r.total > maxUsage) maxUsage = r.total; });
    var maxIntel = 100, maxCoding = 100, maxAgent = 100;
    if (orRankings.intelligence) {
      orRankings.intelligence.forEach(function(r) {
        if (r.intel > maxIntel) maxIntel = r.intel;
        if (r.coding > maxCoding) maxCoding = r.coding;
        if (r.agent > maxAgent) maxAgent = r.agent;
      });
    }
    html += '<div class="rank-section">';
    html += '<div class="rank-header">Model 排行榜<span class="rank-header-sub">OpenRouter · 本週</span></div>';
    html += '<div class="rank-tabs">';
    html += '<button class="rank-tab active" data-rank="usage" onclick="switchRankTab(\'usage\',this)">使用量</button>';
    html += '<button class="rank-tab" data-rank="intel" onclick="switchRankTab(\'intel\',this)">智力</button>';
    html += '</div>';
    // Usage tab
    html += '<div class="rank-content active" id="rank-usage"><table class="rank-table"><tr><th>#</th><th>Model</th><th>Tokens</th><th>Trend</th></tr>';
    orRankings.usage.forEach(function(r) {
      var hasSlash = r.name.indexOf('/') >= 0;
      var cleanName = hasSlash ? r.name.split('/').pop().replace(/-\d{8}$/, '') : r.name;
      // Beautify: deepseek-v4-flash → DeepSeek V4 Flash
      var displayName = cleanName.replace(/[-_]/g, ' ').replace(/\b\w/g, function(c){return c.toUpperCase();}).replace(/\bDeepseek\b/g, 'DeepSeek').replace(/\bMinimax\b/g, 'MiniMax').replace(/\bGlm\b/g, 'GLM').replace(/\bGpt\b/g, 'GPT').replace(/\bAi\b/g, 'AI').replace(/\bGpu\b/g, 'GPU').replace(/\bCpu\b/g, 'CPU').replace(/\bMimo\b/g, 'MiMo').replace(/\bHy3\b/g, 'Hy3').replace(/\bNemotron\b/g, 'Nemotron').replace(/\bGemini\b/g, 'Gemini').replace(/\bClaude\b/g, 'Claude').replace(/\bSonnet\b/g, 'Sonnet').replace(/\bOpus\b/g, 'Opus').replace(/\bFlash\b/g, 'Flash').replace(/\bPro\b/g, 'Pro').replace(/\bAlpha\b/g, 'Alpha').replace(/\bPreview\b/g, 'Preview').replace(/\bLaguna\b/g, 'Laguna').replace(/\bOwl\b/g, 'Owl').replace(/\bStep\b/g, 'Step').replace(/\bGrok\b/g, 'Grok').replace(/\bUltra\b/g, 'Ultra').replace(/(\d+)([a-z])/g, function(m,n,l){return n+l.toUpperCase();}).replace(/\s+/g,' ').trim();
      var provider = hasSlash ? r.name.split('/')[0] || '' : '';
      var medal = r.rank === 1 ? '<span class="rank-medal rank-medal-1">1</span>' : r.rank === 2 ? '<span class="rank-medal rank-medal-2">2</span>' : r.rank === 3 ? '<span class="rank-medal rank-medal-3">3</span>' : '<span class="rank-num">' + r.rank + '</span>';
      var fmtT = typeof r.total === 'string' ? r.total : (r.total >= 1e9 ? (r.total/1e9).toFixed(1)+'B' : r.total >= 1e6 ? (r.total/1e6).toFixed(1)+'M' : r.total >= 1e3 ? (r.total/1e3).toFixed(1)+'K' : r.total);
      var changeHtml = r.change ? '<span class="rank-change' + (r.change.indexOf('↓') >= 0 ? ' negative' : r.change === '—' ? ' dash' : '') + '">' + r.change + '</span>' : '';
      var pct = typeof maxUsage === 'string' ? 50 : (r.total / maxUsage * 100);
      if (isNaN(pct)) pct = 50;
      html += '<tr><td>' + medal + '</td><td>' + (provider ? '<span class="rank-provider">' + provider + '</span>' : '') + displayName + '</td><td><span style="display:inline-flex;align-items:center;gap:0.3rem">' + fmtT + '<span class="rank-bar-wrap"><span class="rank-bar-fill" style="width:' + Math.round(pct) + '%"></span></span></span></td><td>' + changeHtml + '</td></tr>';
    });
    html += '</table></div>';
    // Intel tab
    html += '<div class="rank-content" id="rank-intel"><table class="rank-table"><tr><th>#</th><th>Model</th><th>智能</th><th>編碼</th><th>Agent</th></tr>';
    if (orRankings.intelligence) {
      orRankings.intelligence.forEach(function(r) {
        var cleanName = r.name.split('/').pop().replace(/-\d{8}$/, '');
        var displayName = cleanName.replace(/[-_]/g, ' ').replace(/\b\w/g, function(c){return c.toUpperCase();}).replace(/\bDeepseek\b/g, 'DeepSeek').replace(/\bMinimax\b/g, 'MiniMax').replace(/\bGlm\b/g, 'GLM').replace(/\bGpt\b/g, 'GPT').replace(/\bAi\b/g, 'AI').replace(/\bGpu\b/g, 'GPU').replace(/\bCpu\b/g, 'CPU').replace(/\bMimo\b/g, 'MiMo').replace(/\bHy3\b/g, 'Hy3').replace(/\bNemotron\b/g, 'Nemotron').replace(/\bGemini\b/g, 'Gemini').replace(/\bClaude\b/g, 'Claude').replace(/\bSonnet\b/g, 'Sonnet').replace(/\bOpus\b/g, 'Opus').replace(/\bFlash\b/g, 'Flash').replace(/\bPro\b/g, 'Pro').replace(/\bAlpha\b/g, 'Alpha').replace(/\bPreview\b/g, 'Preview').replace(/\bLaguna\b/g, 'Laguna').replace(/\bOwl\b/g, 'Owl').replace(/\bStep\b/g, 'Step').replace(/\bGrok\b/g, 'Grok').replace(/\bUltra\b/g, 'Ultra').replace(/(\d+)([a-z])/g, function(m,n,l){return n+l.toUpperCase();}).replace(/\s+/g,' ').trim();
        var provider = r.name.split('/')[0] || '';
        var medal = r.rank === 1 ? '<span class="rank-medal rank-medal-1">1</span>' : r.rank === 2 ? '<span class="rank-medal rank-medal-2">2</span>' : r.rank === 3 ? '<span class="rank-medal rank-medal-3">3</span>' : '<span class="rank-num">' + r.rank + '</span>';
        var iPct = Math.round(r.intel / maxIntel * 100);
        var cPct = Math.round(r.coding / maxCoding * 100);
        var aPct = Math.round(r.agent / maxAgent * 100);
        html += '<tr><td>' + medal + '</td><td><span class="rank-provider">' + provider + '</span>' + displayName + '</td>';
        html += '<td><div class="rank-score-wrap"><span class="rank-score-bar"><span class="rank-score-fill intel" style="width:' + iPct + '%"></span></span><span class="rank-score-val">' + r.intel + '</span></div></td>';
        html += '<td><div class="rank-score-wrap"><span class="rank-score-bar"><span class="rank-score-fill coding" style="width:' + cPct + '%"></span></span><span class="rank-score-val">' + r.coding + '</span></div></td>';
        html += '<td><div class="rank-score-wrap"><span class="rank-score-bar"><span class="rank-score-fill agent" style="width:' + aPct + '%"></span></span><span class="rank-score-val">' + r.agent + '</span></div></td>';
        html += '</tr>';
      });
    }
    html += '</table></div>';
    html += '<div class="rank-intel">數據來源：OpenRouter API · 每日更新</div>';
    html += '</div>';
  }
  // Show all news as AI summarized cards
  // Filter out advertorial/sponsored/promotional content
  function isAdvertorial(item) {
    const title = (item.translatedTitle || item.titleZh || item.title || '').toLowerCase();
    const source = (item.source || '').toLowerCase();
    // Ad keywords in title
    const adPatterns = [
      /會員.*(?:折扣|優惠|半價|免費|贈送)/,
      /限時.*(?:優惠|折扣|搶購)/,
      /(?:折扣|優惠|特價|半價).*會員/,
      /贊助/i,
      /sponsored/i,
      /advertorial/i,
      /promoted/i,
    ];
    for (const p of adPatterns) {
      if (p.test(title)) return true;
    }
    return false;
  }
  if (news && news.length > 0) {
    const filteredNews = news.filter(item => !isAdvertorial(item));
    html += '<div class="summarized-section">';
    html += '<div class="summarized-grid">';
    filteredNews.forEach(function(item) {
      html += `<div class="summarized-card" onclick="window.open('` + escapeHtml(item.url) + `', '_blank')">`;
      // Image - show OG image, or favicon fallback, or gradient placeholder
      if (item.ogImage) {
        const safeUrl = encodeURI(item.ogImage).replace(/%25([0-9A-Fa-f]{2})/g, '%$1');
        html += '<img class="summarized-image" src="' + safeUrl + '" alt="" onerror="this.style.display=\'none\'">';
      } else {
        // Domain favicon fallback for articles without OG images
        const domain = (() => { try { return new URL(item.url).hostname; } catch(e) { return ''; } })();
        html += '<div class="summarized-image-favicon"><img src="https://www.google.com/s2/favicons?domain=' + domain + '&sz=64" alt="" style="width:48px;height:48px;object-fit:contain" onerror="this.parentElement.className=\'summarized-image-placeholder\';this.outerHTML=\'📰\'"></div>';
      }
      html += '<div class="summarized-content">';
      html += '<div class="summarized-source">' + escapeHtml(item.source ? item.source.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : 'AI News') + '</div>';
      html += '<div class="summarized-title">' + escapeHtml(item.translatedTitle || item.titleZh || item.title) + '</div>';
      if (item.summary) {
        // Remove "標題：" prefix from summary if present (Workers AI sometimes includes it)
        let cleanSummary = item.summary.replace(/^標題[：:]\s*[\s\S]*?(?=\n{2,}|$)/, '').trim();
        // Also remove any standalone "標題：" line
        cleanSummary = cleanSummary.replace(/\n?標題[：:]\s*.+?\n/, '\n').trim();
        html += '<div class="summarized-text">' + escapeHtml(cleanSummary) + '</div>';
      }
      // AI deep summary button (bottom-right of card)
      html += '<div class="news-ai-wrap"><button class="news-ai-btn" data-url="' + escapeHtml(item.url) + '" data-title="' + escapeHtml(item.translatedTitle || item.titleZh || item.title) + '" onclick="event.stopPropagation();fetchNewsSummary(this)">🧠 AI Digest</button><div class="news-ai-summary"><div class="news-ai-body"></div></div><div class="news-ai-error"></div></div>';
      html += '</div></div>';
    });
    html += '</div></div>';
  } else {
    html += '<div class="empty-state"><div class="empty-state-icon">\u{1F4ED}</div><p>\u66AB\u6642\u672A\u80FD\u7372\u53D6\u65B0\u805E</p></div>';
  }
  html += "</div>";
  html += '<div class="content-section section-videos">';
  if (videos && videos.length > 0) {
    html += '<div class="summarized-section">';
    html += '<div class="summarized-grid">';
    // Language filter: only English and Traditional Chinese
    function isEnglishOrTraditionalChinese(title) {
      if (!title) return false;
      // Check for non-English, non-CJK characters
      const hasInvalidChars = /[^\u0000-\u007f\u4e00-\u9fff\u3400-\u4dbf\u3100-\u312f\u31a0-\u31bf\u3000-\u303f\uff00-\uffef\u2000-\u206f\u0020-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e\u00a0-\u00bf\u2010-\u201f\u2026\u3001-\u3003\u3008-\u3011\u3014-\u3015\uff08-\uff09\uff0c\uff0e\uff1a-\uff1b\uff1f-\uff20\uff3b-\uff3d\uff5b-\uff5d\uff5f-\uff60\uff61-\uff65]/.test(title);
      if (hasInvalidChars) return false;
      // Must have English or Traditional Chinese
      const hasTraditionalChinese = /[\u4e00-\u9fff\u3400-\u4dbf\u3100-\u312f\u31a0-\u31bf]/.test(title);
      const hasEnglish = /[a-zA-Z]/.test(title);
      return hasEnglish || hasTraditionalChinese;
    }
    // Deduplicate by video ID at render time
    const seenVideoIds = new Set();
    const uniqueVideos = videos.filter(function(video) {
      if (seenVideoIds.has(video.id)) return false;
      seenVideoIds.add(video.id);
      // Apply language filter
      if (!isEnglishOrTraditionalChinese(video.title)) return false;
      return true;
    });
    uniqueVideos.slice(0, 20).forEach(function(video) {
      const videoId = video.id;
      html += `<div class="summarized-card" onclick="openVideoModal('${videoId}')">`;
      if (video.thumbnail) {
        html += '<img class="summarized-image" src="' + escapeHtml(video.thumbnail) + '" alt="" onerror="this.style.display=\'none\'">';
      } else {
        html += '<div class="summarized-image-placeholder">🎬</div>';
      }
      html += '<div class="summarized-content">';
      html += '<div class="summarized-source">' + escapeHtml(video.channel) + ' · ' + escapeHtml(video.viewCount) + ' views · ' + escapeHtml(video.duration) + '</div>';
      html += '<div class="video-title">' + escapeHtml(video.title) + '</div>';
      html += '<div class="video-ai-wrap"><button class="video-ai-btn" onclick="event.stopPropagation();fetchVideoSummary(this,\'' + videoId + '\')">&#x1F9E0; AI Digest</button><div class="video-ai-summary" id="ai-summary-' + videoId + '"><div class="video-ai-body"></div></div><div class="video-ai-error" id="ai-error-' + videoId + '"></div></div>';

      html += '</div></div>';
    });
    html += '</div></div>';
  } else {
    html += '<div class="empty-state"><div class="empty-state-icon">🎬</div><p>暫時未能獲取影片</p></div>';
  }
  html += "</div>";
  html += '<div class="content-section section-tools">';
  if (tools.length > 0) {
    html += '<div class="card-grid">';
    tools.forEach(function(tool) {
      html += `<div class="card" onclick="window.open('` + escapeHtml(tool.url) + `', '_blank')">`;
      html += '<div class="card-body">';
      const catTags = (tool.categories || []).map(function(c) {
        return '<span class="category-tag">' + escapeHtml(c) + "</span>";
      }).join("");
      html += '<div class="card-source">' + catTags + '<span class="tool-lang">' + escapeHtml(tool.sourceLabel || tool.language || "Code") + "</span></div>";
      html += '<div class="card-title" data-name-zh="' + escapeHtml(tool.nameZh || "") + '" data-orig-name="' + escapeHtml(tool.name) + '" data-translated="' + (tool.nameZh ? 'true' : 'false') + '" data-pending="true">' + escapeHtml(tool.name) + "</div>";
      const toolDesc = tool.descZh || (tool.description ? tool.description.substring(0, 200) : "暫無描述");
      const toolDescFull = tool.descZh || tool.description || "暫無描述";
      const hasTranslation = tool.descZh && tool.descZh.length > 0;
      const needsToggle = toolDescFull.length > 200;
      html += '<div class="card-summary" data-desc-zh="' + escapeHtml(tool.descZh || "") + '" data-orig-desc="' + escapeHtml(tool.description || "").substring(0, 200) + '" data-full-desc="' + escapeHtml(toolDescFull) + '" data-translated="' + (hasTranslation ? 'true' : 'false') + '" data-pending="true">' + escapeHtml(toolDesc) + "</div>";
      if (needsToggle) {
        html += '<div class="card-summary-toggle" onclick="event.stopPropagation(); const s=this.previousElementSibling; s.classList.toggle(\'expanded\'); this.textContent=s.classList.contains(\'expanded\')?\'收起 ▲\':\'展開更多 ▼\';">展開更多 ▼</div>';
      }
      html += '<div class="card-footer"><span class="card-stars">\u2B50 ' + formatStars(tool.stars) + "</span></div>";
      html += "</div></div>";
    });
    html += "</div>";
  } else {
    html += '<div class="empty-state"><div class="empty-state-icon">\u{1F6E0}\uFE0F</div><p>\u66AB\u6642\u672A\u80FD\u7372\u53D6\u5DE5\u5177</p></div>';
  }
  html += '</div>';
  html += '<div class="content-section section-knowledge">';
  html += '<div class="knowledge-container">';
  html += '<div class="knowledge-card">';
  html += '<div class="knowledge-card-header">\u{1F4D6} AI \u8853\u8A9E\u901F\u67E5</div>';
  html += '<div class="knowledge-list">';
  html += '<div class="knowledge-item"><span class="knowledge-term">RAG</span><span class="knowledge-desc">Retrieval-Augmented Generation\uFF0C\u7D50\u5408\u641C\u7D22\u548C\u751F\u6210\u7684\u6280\u8853\uFF0C\u8B93 LLM \u53EF\u4EE5\u53C3\u8003\u5916\u90E8\u8CC7\u6599\u56DE\u7B54\u554F\u984C</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Fine-tuning</span><span class="knowledge-desc">\u5FAE\u8ABF\uFF0C\u7528\u7279\u5B9A\u8CC7\u6599\u91CD\u65B0\u8A13\u7DF4\u57FA\u790E\u6A21\u578B\uFF0C\u8B93\u5176\u9069\u61C9\u7279\u5B9A\u4EFB\u52D9</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Quantization</span><span class="knowledge-desc">\u91CF\u5316\uFF0C\u5C07\u6A21\u578B\u53C3\u6578\u5F9E\u9AD8\u7CBE\u5EA6\u8F49\u63DB\u70BA\u4F4E\u7CBE\u5EA6\uFF0C\u6E1B\u5C11\u5167\u5B58\u4F7F\u7528\u548C\u63D0\u5347\u901F\u5EA6</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">MCP</span><span class="knowledge-desc">Model Context Protocol\uFF0C\u8B93 AI \u6A21\u578B\u53EF\u4EE5\u8FDE\u63A5\u5916\u90E8\u5DE5\u5177\u548C\u8CC7\u6599\u6E90\u7684\u6A19\u6E96\u5354\u8B70</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Prompt Engineering</span><span class="knowledge-desc">\u63D0\u793A\u5DE5\u7A0B\uFF0C\u8A2D\u8A08\u66F4\u6709\u6548\u7684\u6307\u4EE4\u8B93 LLM \u7522\u751F\u66F4\u597D\u7684\u8F93\u51FA</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Agent</span><span class="knowledge-desc">\u667A\u80FD\u4EE3\u7406\uFF0C\u80FD\u81EA\u4E3B\u57F7\u884C\u4EFB\u52D9\u3001\u547C\u53EB\u5DE5\u5177\u3001\u505A\u6C7A\u5B9A\u7684 AI \u7CFB\u7D71</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Context Window</span><span class="knowledge-desc">\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF0C\u6A21\u578B\u4E00\u6B21\u80FD\u8655\u7406\u7684\u6700\u5927\u6587\u5B57\u91CF\uFF0C\u8D8A\u5927\u8D8A\u80FD\u8B80\u9577\u6587\u7AE0</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Embedding</span><span class="knowledge-desc">\u5411\u91CF\u5D4C\u5165\uFF0C\u5C07\u6587\u5B57\u8F49\u63DB\u70BA\u6578\u5B78\u5411\u91CF\uFF0C\u7528\u65BC\u641C\u7D22\u548C\u6BD4\u8F03\u6587\u672C\u76F8\u4F3C\u5EA6</span></div>';
  html += "</div></div>";
  html += '<div class="knowledge-card">';
  html += '<div class="knowledge-card-header">\u{1F9F0} MCP \u8207 AI \u5DE5\u5177\u63A8\u85A6</div>';
  html += '<div class="knowledge-list">';
  html += '<div class="knowledge-item"><span class="knowledge-term">MiniMax MCP</span><span class="knowledge-desc">\u652F\u63F4\u6587\u5B57\u56DE\u7B54\u3001\u5716\u7247\u7406\u89E3\u3001\u7DB2\u9801\u641C\u5C0B\u3001\u6587\u5B57\u8F49\u5716\u7247\u3002\u9069\u5408\u591A\u6A21\u614B AI \u61C9\u7528\u3002<a href="https://github.com/MiniMax-AI/MiniMax-MCP" target="_blank">GitHub \u2192</a></span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">GitHub MCP</span><span class="knowledge-desc">\u8B93 AI \u76F4\u63A5\u64CD\u4F5C GitHub \u5009\u5EAB\u3001Issues\u3001PR\u3002\u9069\u5408\u81EA\u52D5\u5316\u958B\u767C\u5DE5\u4F5C\u6D41\u3002<a href="https://github.com/github/github-mcp-server" target="_blank">GitHub \u2192</a></span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Brave Search MCP</span><span class="knowledge-desc">AI \u5F15\u64CE\u641C\u5C0B\u80FD\u529B\uFF0C\u8B93 Agent \u53EF\u4EE5\u5BE6\u6642\u7372\u53D6\u7DB2\u4E0A\u8CC7\u8A0A\u3002<a href="https://github.com/modelcontextprotocol/servers/tree/main/src/bravesearch" target="_blank">GitHub \u2192</a></span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Filesystem MCP</span><span class="knowledge-desc">\u8B93 AI \u8B80\u5BEB\u3001\u5BEB\u5165\u672C\u5730\u6A94\u6848\u7CFB\u7D71\u3002\u81EA\u52D5\u5316\u6587\u4EF6\u8655\u7406\u5DE5\u4F5C\u3002<a href="https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem" target="_blank">GitHub \u2192</a></span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Puppeteer MCP</span><span class="knowledge-desc">\u8B93 AI \u63A7\u5236\u700F\u89BD\u5668\u81EA\u52D5\u5316\u64CD\u4F5C\u7DB2\u9801\u3002\u9069\u5408\u722C\u87F2\u3001\u6E2C\u8A66\u3001\u81EA\u52D5\u5316\u3002<a href="https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer" target="_blank">GitHub \u2192</a></span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">Hermes Agent</span><span class="knowledge-desc">\u958B\u6E90 AI Agent \u6846\u67B6\uFF0C\u652F\u63F4\u591A\u5E73\u53F0\u3001Skills\u7CFB\u7D71\u3001Cron \u5B9A\u6642\u4EFB\u52D9\u3002\u9019\u500B\u7DB2\u7AD9\u5C31\u662F\u7528 Hermes \u5EFA\u7684\uFF01<a href="https://github.com/hermes-agent" target="_blank">GitHub \u2192</a></span></div>';
  html += "</div></div>";
  html += '<div class="knowledge-card">';
  html += '<div class="knowledge-card-header">\u{1F4C8} \u6A21\u578B\u9078\u64C7\u6307\u5357</div>';
  html += '<div class="knowledge-list">';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u6587\u5B57\u5DE5\u4F5C</span><span class="knowledge-desc">Claude 3.5 Sonnet / GPT-4o \u2014 \u5C0D\u8A71\u3001\u5206\u6790\u3001\u5BEB\u4F5C\u3001\u7DE8\u8F2F</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u7A0B\u5F0F\u7DE8\u5BEB</span><span class="knowledge-desc">Claude 3.5 Sonnet / o3-mini \u2014 \u4EE3\u78BC\u751F\u6210\u3001\u8ABF\u8A66\u3001\u91CD\u69CB</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u9577\u6587\u5206\u6790</span><span class="knowledge-desc">Gemini 1.5 Pro / Claude 3.5 Sonnet \u2014 200K+ context window</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u5FEB\u901F\u56DE\u61C9</span><span class="knowledge-desc">GPT-4o-mini / Gemini 1.5 Flash \u2014 \u6210\u672C\u4F4E\u3001\u901F\u5EA6\u5FEB</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u672C\u5730\u90E8\u7F72</span><span class="knowledge-desc">Llama 3 / Mistral / Qwen \u2014 \u96B1\u79C1\u3001\u96E2\u7DDA\u3001\u53EF\u5B9A\u5236</span></div>';
  html += "</div></div>";
  html += '<div class="knowledge-card">';
  html += '<div class="knowledge-card-header">\u{1F4A1} \u5B78\u7FD2\u8DEF\u5F91</div>';
  html += '<div class="knowledge-list">';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u5165\u9580</span><span class="knowledge-desc">1. \u719F\u6089 ChatGPT/Claude \u4F7F\u7528 \u2192 2. \u5B78\u7FD2 Prompt Engineering \u2192 3. \u5617\u8A66\u5404\u985E\u5DE5\u5177</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u9032\u968E</span><span class="knowledge-desc">1. \u4F7F\u7528 API \u958B\u767C \u2192 2. \u5B78\u7FD2 RAG \u67B6\u69CB \u2192 3. \u5EFA\u7ACB\u81EA\u5DF1\u7684 Agent</span></div>';
  html += '<div class="knowledge-item"><span class="knowledge-term">\u5C08\u5BB6</span><span class="knowledge-desc">1. Fine-tuning \u6A21\u578B \u2192 2. \u91CF\u5316\u90E8\u7F72 \u2192 3. \u8CA0\u8F09\u5E73\u8861\u548C\u6548\u80FD\u512A\u5316</span></div>';
  html += "</div></div>";
  html += "</div></div>";
  html += '<div class="content-section section-blog">';
  if (blogPosts && blogPosts.length > 0) {
    html += '<div class="blog-list">';
    // Sort by date descending (newest first)
    var sortedPosts = blogPosts.slice().sort(function(a, b) {
      var dateA = a.date ? new Date(a.date) : new Date(0);
      var dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    sortedPosts.forEach(function(post, index) {
      html += '<article class="blog-article collapsed" id="blog-post-' + index + '">';
      // Header - clickable to toggle
      html += '<div class="blog-article-header" onclick="toggleBlogArticle(' + index + ')">';
      html += '<div class="blog-article-meta">';
      if (post.tags && post.tags.length > 0) {
        post.tags.forEach(function(tag) {
          html += '<span class="tag">' + escapeHtml(tag) + '</span>';
        });
      }
      html += escapeHtml(post.sourceName || 'AI Blog') + ' · ' + escapeHtml(post.date || '') + ' · ' + escapeHtml(post.readTime || '3 min');
      html += '</div>';
      html += '<h2 class="blog-article-title">' + escapeHtml(post.title) + '</h2>';
      // Collapsed preview: keyTakeaway
      if (post.keyTakeaway) {
        html += '<div class="blog-article-preview">' + escapeHtml(post.keyTakeaway) + '</div>';
      }
      html += '</div>';
      // Image (visible in both states)
      if (post.imageUrl) {
        html += '<img class="blog-article-image" src="' + escapeHtml(post.imageUrl) + '" alt="" onerror="this.style.display=\'none\'">';
      }
      // Toggle button at bottom right of card
      html += '<div class="blog-toggle-bar" onclick="toggleBlogArticle(' + index + ')"><span class="toggle-text">展開閱讀</span><span class="toggle-icon">↓</span></div>';
      // Expandable content wrapper
      html += '<div class="blog-article-content">';
      // Body - convert markdown-like content to HTML with enhanced styling
      html += '<div class="blog-article-body">';
      let bodyHtml = (post.content || '');
      
      // Step 1: Protect code blocks
      const codeBlocks = [];
      bodyHtml = bodyHtml.replace(/```([\s\S]*?)```/g, function(match, code) {
        codeBlocks.push(code.trim());
        return '\n__CODE_BLOCK_' + (codeBlocks.length - 1) + '__\n';
      });
      
      // Step 2: Convert inline markdown (no auto-linking)
      bodyHtml = bodyHtml
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
      
      // Step 3: Parse line by line with state machine
      // Handle both real newlines and escaped \n from JSON
      const lines = bodyHtml.replace(/\\n/g, '\n').split('\n');
      let processedBlocks = [];
      let stepCount = 0;
      let currentParagraph = [];
      let currentList = [];
      let inList = false;
      
      function flushParagraph() {
        if (currentParagraph.length > 0) {
          processedBlocks.push('<p>' + currentParagraph.join('<br>') + '</p>');
          currentParagraph = [];
        }
      }
      
      function flushList() {
        if (currentList.length > 0) {
          processedBlocks.push('<ol>' + currentList.join('') + '</ol>');
          currentList = [];
        }
        inList = false;
      }
      
      lines.forEach(function(line) {
        line = line.trim();
        if (!line) {
          flushParagraph();
          flushList();
          return;
        }
        
        // Check if it's a heading
        var headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          flushParagraph();
          flushList();
          var headingText = headingMatch[2];
          // Don't add step number if heading already contains Chinese step numbers like 第一步, 第二步
          var hasStepNumber = /第[一二三四五六七八九十\d]+步/.test(headingText) || /^步驟\d+/.test(headingText);
          if (!hasStepNumber) {
            stepCount++;
            processedBlocks.push('<h3 data-step="' + stepCount + '">' + headingText + '</h3>');
          } else {
            processedBlocks.push('<h3 class="no-step-badge">' + headingText + '</h3>');
          }
          return;
        }
        
        // Check if it's a code block placeholder
        if (line.match(/^__CODE_BLOCK_\d+__$/)) {
          flushParagraph();
          flushList();
          var codeIdx = parseInt(line.match(/\d+/)[0]);
          var code = codeBlocks[codeIdx] || '';
          processedBlocks.push('<div class="code-block"><code>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></div>');
          return;
        }
        
        // Check if it's a list item
        var listMatch = line.match(/^(\d+\.\s+|-\s+)(.+)$/);
        if (listMatch) {
          flushParagraph();
          inList = true;
          currentList.push('<li>' + listMatch[2] + '</li>');
          return;
        }
        
        // Regular line
        if (inList) {
          // If we're in a list but this line doesn't match list pattern,
          // it might be a continuation of the last list item
          if (currentList.length > 0) {
            currentList[currentList.length - 1] = currentList[currentList.length - 1].replace('</li>', '<br>' + line + '</li>');
          } else {
            flushList();
            currentParagraph.push(line);
          }
        } else {
          currentParagraph.push(line);
        }
      });
      
      // Flush remaining
      flushParagraph();
      flushList();
      
      bodyHtml = processedBlocks.join('\n');
      
      // Step 4: Wrap example sections (content between "## 實際例子" and next h3 or end)
      bodyHtml = bodyHtml.replace(
        /(<h3[^>]*>實際例子[\s\S]*?<\/h3>)\n?([\s\S]*?)(?=<h3|$)/g,
        function(match, header, content) {
          // Clean up content: remove empty paragraphs
          content = content.replace(/<p><\/p>/g, '');
          return header + '\n<div class="example-block">' + content + '</div>';
        }
      );
      
      // Step 5: Wrap FAQ Q/A pairs
      bodyHtml = bodyHtml.replace(
        /(<p><strong>Q:[\s\S]*?<\/p>)\n?(<p><strong>A:[\s\S]*?<\/p>)/g,
        '<div class="faq-block">$1\n$2</div>'
      );
      
      html += bodyHtml;
      html += '</div>';
      // Footer
      html += '<div class="blog-article-footer">';
      if (post.keyTakeaway) {
        html += '<div class="takeaway"><strong>💡 重點總結：</strong> ' + escapeHtml(post.keyTakeaway) + '</div>';
      }
      if (post.videoId) {
        html += '<div class="video-btn" onclick="openVideoModal(\'' + escapeHtml(post.videoId) + '\')">▶ 觀看教學影片</div>';
      }
      if (post.sourceUrl) {
        html += '<a href="' + escapeHtml(post.sourceUrl) + '" target="_blank" class="source-link">📎 參考來源 →</a>';
      }
      // Tool links section
      if (post.tools && post.tools.length > 0) {
        html += '<div class="tool-links-section"><strong>🛠️ 本教程用到的工具：</strong><div class="tool-links-list">';
        post.tools.forEach(function(tool) {
          html += '<a href="' + escapeHtml(tool.url) + '" target="_blank" class="tool-link">' + escapeHtml(tool.name) + '</a>';
        });
        html += '</div></div>';
      }
      html += '</div>';
      html += '</div>'; // close blog-article-content
      html += '</article>'; // close article
    });
    html += '</div>';
  } else {
    html += '<div class="empty-state"><div class="empty-state-icon">📝</div><p>暫時未有 AI 應用教學</p></div>';
  }
  html += "</div>";
  html += '<div id="videoModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;" onclick="closeVideoModal()"><div style="position:relative;width:100%;max-width:1200px;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;" onclick="event.stopPropagation()"><iframe id="videoIframe" style="width:100%;height:100%;border:none;" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe><button onclick="closeVideoModal()" style="position:absolute;top:-48px;right:0;background:none;border:none;color:#fff;font-size:32px;cursor:pointer;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">\u00d7</button></div></div>';
  html += "<footer>\u{1F916} PikAI | \u6BCF\u65E5\u7CBE\u9078 AI \u8CC7\u8A0A\u3001\u5DE5\u5177\u8207\u77E5\u8B58 | \u6BCF\u65E5\u81EA\u52D5\u66F4\u65B0</footer>";
  html += '<button class="back-to-top" id="backToTop" aria-label="\u8FD4\u56DE\u9802\u90E8">\u2191</button>';
  html += "</div>";
  html += "<script>";
  html += 'function openVideoModal(id){var m=document.getElementById("videoModal"),f=document.getElementById("videoIframe");f.src="https://www.youtube.com/embed/"+id+"?autoplay=1";m.style.display="flex";document.body.style.overflow="hidden";}';
  html += 'function closeVideoModal(){var m=document.getElementById("videoModal"),f=document.getElementById("videoIframe");f.src="";m.style.display="none";document.body.style.overflow="";}';
  html += 'async function fetchVideoSummary(btn,videoId){var box=document.getElementById("ai-summary-"+videoId);var err=document.getElementById("ai-error-"+videoId);if(box&&box.classList.contains("visible"))return;if(btn)btn.disabled=true;if(btn)btn.textContent="⟳ AI 總結中...";if(err)err.textContent="";try{var res=await fetch("/api/video-summary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:videoId})});var data=await res.json();if(data.error){if(err)err.textContent=data.error;if(btn)btn.textContent="🧠 AI Digest";return;}if(box){var arr=data.summary.split("\\n");var h="";for(var i=0;i<arr.length;i++){if(arr[i].trim())h+="<p>"+arr[i].trim()+"</p>";}box.querySelector(".video-ai-body").innerHTML=h;box.classList.add("visible");}if(btn)btn.textContent="🧠 AI Digest";}catch(e){if(err)err.textContent="連線錯誤，請稍後再試";if(btn)btn.textContent="🧠 AI Digest";}finally{if(btn)btn.disabled=false;}}';
  html += 'async function fetchNewsSummary(btn){var wrap=btn.parentElement;var box=wrap.querySelector(".news-ai-summary");var err=wrap.querySelector(".news-ai-error");if(box&&box.classList.contains("visible"))return;var url=btn.dataset.url;var title=btn.dataset.title;if(!url)return;btn.disabled=true;btn.textContent="\u27f3 AI \u6df1\u5ea6\u7e3d\u7d50\u4e2d...";box.classList.remove("visible");if(err)err.textContent="";try{var res=await fetch("/api/news-summary",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url,title:title})});var data=await res.json();if(data.error){if(err)err.textContent=data.error;btn.textContent="🧠 AI \u6df1\u5ea6\u7e3d\u7d50";return;}if(box){var arr=data.summary.split("\\n");var h="";for(var i=0;i<arr.length;i++){if(arr[i].trim())h+="<p>"+arr[i].trim()+"</p>";}box.querySelector(".news-ai-body").innerHTML=h;box.classList.add("visible");}btn.textContent="🧠 AI \u6df1\u5ea6\u7e3d\u7d50";}catch(e){if(err)err.textContent="\u9023\u7dda\u932f\u8aa4\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66";btn.textContent="🧠 AI \u6df1\u5ea6\u7e3d\u7d50";}finally{btn.disabled=false;}}';

  html += 'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeVideoModal();});';
  html += 'function switchTab(tabName) { document.querySelector(".hero").scrollIntoView({behavior:"instant"}); document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active")}); document.querySelectorAll(".content-section").forEach(function(s){s.classList.remove("active");s.style.display="none";s.style.visibility="hidden";}); document.querySelector(".tab-"+tabName).classList.add("active"); var sec=document.querySelector(".section-"+tabName); if(sec){sec.classList.add("active");sec.style.display="block";sec.style.visibility="visible";} };';
  html += 'function toggleBlogArticle(index){var article=document.getElementById("blog-post-"+index);if(!article)return;var isExpanded=article.classList.contains("expanded");if(isExpanded){article.classList.remove("expanded");article.classList.add("collapsed");}else{article.classList.remove("collapsed");article.classList.add("expanded");}};';
  html += 'function switchRankTab(tab,btn){document.querySelectorAll(".rank-content").forEach(function(c){c.classList.remove("active");});document.querySelectorAll(".rank-tab").forEach(function(t){t.classList.remove("active");});btn.classList.add("active");document.getElementById("rank-"+tab).classList.add("active");};';
  html += 'function sanitize(s) { s=String(s||"").replace(/[<>]/g,function(c){return c=="<"?"&lt;":">";}).replace(/\uFF1B/g,";");return s;};';
  html += 'document.querySelectorAll(".card-title, .card-summary").forEach(function(el){if(!el.dataset.origTitle&&!el.dataset.origName)el.dataset.origTitle=el.textContent;if(!el.dataset.origSummary&&!el.dataset.origDesc)el.dataset.origSummary=el.textContent;});';
  html += 'document.addEventListener("DOMContentLoaded",function(){var lo=document.getElementById("loadingOverlay");if(lo){lo.classList.add("hidden");}document.querySelectorAll(".content-section").forEach(function(s){if(!s.classList.contains("active")){s.style.display="none";s.style.visibility="hidden";s.style.height="0";s.style.maxHeight="0";s.style.overflow="hidden";s.style.opacity="0";}});if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js?v=4").catch(function(e){console.log("SW registration failed:",e)});}});';
  html += 'var btt=document.getElementById("backToTop");window.addEventListener("scroll",function(){btt.classList.toggle("visible",window.scrollY>300);});';
  html += 'function backToTop(){window.scrollTo({top:0,behavior:"smooth"});};document.getElementById("backToTop").addEventListener("click",backToTop);';
  // Pull to refresh - swipe down from top to reload cache
  html += '(function(){var startY=0,refreshing=false,pullIndicator=document.createElement("div");pullIndicator.style.cssText="position:fixed;top:0;left:0;right:0;height:0;background:#f0f2f5;color:#888;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;font-size:14px;z-index:9998;transition:height 0.2s;overflow:hidden;";pullIndicator.textContent="↓ 放開刷新";document.body.appendChild(pullIndicator);function resetPull(){pullIndicator.style.height="0";setTimeout(function(){pullIndicator.textContent="↓ 放開刷新";},200);}document.addEventListener("touchstart",function(e){if(window.scrollY<=0){startY=e.touches[0].clientY;refreshing=false;}},{passive:true});document.addEventListener("touchmove",function(e){if(window.scrollY<=0&&!refreshing){var pull=e.touches[0].clientY-startY;if(pull>0&&pull<150){pullIndicator.style.height=pull+"px";}else if(pull>=150){pullIndicator.style.height="60px";pullIndicator.textContent="↑ 放開刷新";}}},{passive:true});document.addEventListener("touchend",function(e){if(!refreshing){var pull=parseInt(pullIndicator.style.height)||0;if(pull>=60){refreshing=true;pullIndicator.textContent="⟳ 更新中...";window.location.reload();}else{resetPull();}}});document.addEventListener("touchcancel",function(e){if(!refreshing){resetPull();}});setInterval(function(){if(!refreshing&&parseInt(pullIndicator.style.height)>0){resetPull();}},3000);})();';
  html += "<\/script>";
  html += '<style>.version-footer{text-align:center;padding:6px;font-size:10px;color:#999;background:#f5f5f5;pointer-events:none;user-select:none;}</style>';
  html += '<div class="version-footer">PikAI v<span id="v">DEPLOY_HASH_PLACEHOLDER</span></div>';
  html += "</body></html>";
  return html;
}
__name(generatePage, "generatePage");
var worker_default2 = worker_default;
export {
  worker_default2 as default
};
//# sourceMappingURL=worker.js.map// test
// test
