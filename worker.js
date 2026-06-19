var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// Global blacklist for YouTube channels to block (used across fetch + page load)
const _blacklistIds = new Set([
  'UCpdxWdhluGMcQ_MBhNnDNUg'
]);

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
    
    let userContent = `以下有多篇英文 AI 新聞，請為每篇提供繁體中文標題同摘要。每篇都必須輸出繁體中文標題，唔准留英文！\n\n`;
    articles.forEach((a, i) => {
      const desc = (a.description || '').substring(0, 500);
      userContent += `第${i+1}篇\n標題：${a.title}\n內容：${desc}\n\n`;
    });
    userContent += `請嚴格依照以下 JSON 陣列格式輸出（跟上面順序），唔好包含任何 JSON 以外嘅文字：\n[\n  {"headline": "中文標題", "summary": "2-4句摘要"},\n  ...\n]`;
    
    const systemPrompt = `你係專業嘅科技新聞編輯，專精英譯中。你嘅任務係將英文新聞標題同內容轉化為高品質嘅繁體中文。

【重要】每篇都必須輸出繁體中文 headline，絕對唔可以用英文！

【標題翻譯原則】
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

    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      max_tokens: 4000,
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
        
        // Quality check
        const hasBadPattern = badPatterns.some(p => p.test(headline));
        const hasChinese = /[\u4e00-\u9fff]/.test(headline);
        let qualityFlag = 'ok';
        if (!headline || !hasChinese || hasBadPattern || headline.length > 60 || (headline.length > 0 && headline.length < 8)) {
          qualityFlag = 'bad_headline';
          headline = '';
        }
        if (!summary || summary.length < 10) qualityFlag = 'too_short';
        
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
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout (Workers AI can be slow)
    
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

    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `標題：${title}\n內容：${description}` }
      ],
      max_tokens: 600,
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

    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
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
    const key = `article:v2:${md5(url)}`;
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
    const key = `article:v2:${md5(url)}`;
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
  { name: "Towards Data Science", url: "https://towardsdatascience.com/feed" }
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

    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
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
  const BATCH_DELAY = 2000; // 2 seconds between batches
  
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
        const aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
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
    "Wired AI"
  ]);
  
  // Parallel fetch all sources - limit 10 per source for diversity
  const MAX_PER_SOURCE = 3;
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
      if (overlap >= 2 && overlap >= minLength * 0.5) {
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

    // Build whitelist Set for filtering
    const whitelistIds = new Set([
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

    // Check KV cache first
    try {
      const cached = await env.AI_NEWS_KV.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        const age = Date.now() - new Date(data.cachedAt).getTime();
        if (!force && age < 12 * 60 * 60 * 1000) {
          const filtered = (data.videos || []).filter(v => {
            if (!whitelistIds.has(v.channelId) || _blacklistIds.has(v.channelId)) {
              console.log(`[YouTube] CACHE REJECTED non-whitelist: "${v.channel}" (${v.channelId})`);
              return false;
            }
            return true;
          });
          console.log(`[YouTube] Cache hit: ${data.videos.length} videos, ${filtered.length} after whitelist filter`);
          return filtered;
        }
      }
    } catch (e) {
      // Cache miss
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
      const batchResults = await Promise.all(batch.map(([id, name]) => searchChannelVideos(id, name, 3)));
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
      if (!whitelistIds.has(video.channelId) || _blacklistIds.has(video.channelId)) {
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
    // Budget: ~29 RSS + up to 5 OG fetches + 10 batch AI (30/3) + tools
    const MAX_ARTICLES = 30;
    const toProcess = deduped.slice(0, MAX_ARTICLES);
    console.log(`[fetchNewsData] Processing top ${toProcess.length}/${deduped.length} articles (subrequest budget cap)`);
    
    // OG images: KV cache first, then limited new fetches for articles without RSS images
    const withImages = [];
    let ogFetchCount = 0;
    const MAX_OG_FETCHES = 5; // Stay within 50 subrequest budget
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
    console.log(`[fetchNewsData] Summarizing ${withImages.length} articles with Workers AI...`);
    const summarizedNews = [];
    const BATCH_SIZE = 3;
    const BATCH_DELAY = 3000; // 3 seconds between batches for subrequest safety
    
    for (let batchStart = 0; batchStart < withImages.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, withImages.length);
      const uncachedItems = [];
      console.log(`[fetchNewsData] Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchStart}-${batchEnd-1} of ${withImages.length}`);
      
      for (let i = batchStart; i < batchEnd; i++) {
        const item = withImages[i];
        console.log(`[SumLoop] Processing article ${i+1}/${withImages.length}: "${item.title.substring(0, 60)}", hasDesc: ${!!item.description}`);
        try {
          // Check KV cache first (no subrequest cost)
          const cached = await getCachedArticle(item.url, env);
          if (cached && cached.summary) {
            let useCachedTitle = true;
            if (cached.translatedTitle) {
              const badPatterns = [
                /唔再.*之間/, /之間中/, /就.*[冇无].*再/,
                /[冇无].*再.*之間/, /[是係].*[冇无].*再/,
              ];
              // Check: is cached title actually Chinese? If not, skip cache for retry
              const cachedHasChinese = /[\u4e00-\u9fff]/.test(cached.translatedTitle);
              if (!cachedHasChinese || badPatterns.some(p => p.test(cached.translatedTitle)) || 
                  cached.translatedTitle.length > 60 || 
                  cached.translatedTitle.length < 8) {
                useCachedTitle = false;
                console.log(`[Cache] Invalid cached headline (no Chinese or rejected): "${cached.translatedTitle.substring(0,40)}"`);
              }
            }
            if (useCachedTitle) {
              console.log(`[Cache] Using cached translation for: ${item.title.substring(0, 40)}...`);
              summarizedNews.push({
                ...item,
                translatedTitle: cached.translatedTitle,
                summary: cached.summary,
                summarizedAt: new Date().toISOString()
              });
            } else {
              // Bad cache - add to uncached for retry with batch AI
              console.log(`[Cache] Re-processing (bad cached headline): ${item.title.substring(0, 40)}...`);
              uncachedItems.push({ index: i, item });
            }
            continue;
          }
          
          // No cache - try Workers AI first (1 subrequest)
          let result = await summarizeWithWorkersAI(item.title, item.description || '', env);
          console.log(`[SumLoop] AI result for "${item.title.substring(0, 40)}": summary=${result.summary ? `"${result.summary.substring(0, 60)}..."` : 'EMPTY'}, qualityFlag=${result.qualityFlag}, titleZh="${(result.translatedTitle || '').substring(0, 30)}"`);
          
          // If Workers AI failed, try NVIDIA API (1 subrequest)
          if (!result.summary && env.NVIDIA_API_KEY) {
            console.log(`[Workers AI] Failed, trying NVIDIA for: ${item.title.substring(0, 40)}...`);
            const prompt = `標題：${item.title}\n內容：${item.description || ''}\n\n請用繁體中文總結內容（約3-4句話），並提供自然通順嘅中文標題（15-25字）。\n\n【標題翻譯原則】\n- 唔好直譯！要理解原文意思後，用自然嘅中文重新表達\n- 保留英文名稱（公司名、產品名、技術名詞）\n- 避免語序混亂、缺主語、缺謂語嘅問題\n\n格式：\n標題：[中文標題]\n總結：[總結內容]`;
            const nvidiaResult = await callNvidiaAPI(prompt, env.NVIDIA_API_KEY, 500);
            if (nvidiaResult.success) {
              const text = nvidiaResult.text;
              const titleMatch = text.match(/標題[：:]\s*(.+?)(?:\n|$)/);
              const summaryMatch = text.match(/總結[：:]\s*([\s\S]+)/);
              let summary = summaryMatch ? summaryMatch[1].trim() : text.trim();
              
              let translatedTitle = titleMatch ? titleMatch[1].trim() : '';
              const badPatterns = [
                /唔再.*之間/, /之間中/, /就.*[冇无].*再/,
                /[冇无].*再.*之間/, /[是係].*[冇无].*再/,
              ];
              const hasBadPattern = badPatterns.some(p => p.test(translatedTitle));
              if (hasBadPattern || translatedTitle.length > 40 || (translatedTitle.length > 0 && translatedTitle.length < 8)) {
                console.log(`[NVIDIA] Bad headline detected: "${translatedTitle}", using original`);
                translatedTitle = '';
              }
              
              result = {
                translatedTitle: translatedTitle,
                summary: summary
              };
              console.log(`[NVIDIA] Summarized: ${translatedTitle || item.title.substring(0, 40)}...`);
            }
          }
          
          if (result.summary) {
            await setCachedArticle(item.url, result, env);
            summarizedNews.push({
              ...item,
              translatedTitle: result.translatedTitle || item.title,
              summary: result.summary,
              summarizedAt: new Date().toISOString()
            });
          }
        } catch (e) {
          console.log(`[fetchNewsData] Failed to summarize: ${e.message}`);
        }
      }
      
      // Delay between batches (except last)
      if (batchEnd < withImages.length) {
        console.log(`[fetchNewsData] Batch complete, waiting ${BATCH_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    console.log(`[fetchNewsData] Summarized ${summarizedNews.length}/${toProcess.length} articles (cached hits saved quota)`);
    
    // Fallback: if no summaries at all, use original deduped news
    const newsToPick = summarizedNews.length > 0 ? summarizedNews : deduped.slice(0, MAX_ARTICLES);
    console.log(`[fetchNewsData] Using ${newsToPick.length} articles (fallback: ${summarizedNews.length === 0 ? 'yes' : 'no'})`);
    
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
    const newsData = await fetchNewsData(env);
    const toolsData = await fetchToolsData(env);
    const videosData = await fetchYouTubeVideos(env, true);
    const data = { ...newsData, tools: toolsData };
    data.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
    data.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
    await env.AI_NEWS_KV.put("news-data", JSON.stringify(data));
    console.log(`Updated: ${data.news.length} news, ${data.tools.length} tools, ${videosData.length} videos`);
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
            
            { src: "/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png?v=4", sizes: "512x512", type: "image/png" }
          ]
        }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon-192.png") {
        const png = Uint8Array.from(atob("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"), c => c.charCodeAt(0));
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon-512.png") {
        const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAQAElEQVR4nOzde7BdVX0H8H0uISSXhFerJRQIKtU4YEQL0Y7DGLBakIqkPELIJZoAymNAHNsRdCyPqfBHa6vOSKE6HQbt0NGqUMVSphaxWOuAoPhqINpRHoK8FQMk3Ht6T9Bwk7v3PRductbvnN/nM8M/+x4ma9ZaZ3/3eu0za8PGZyoA8hmqAEhJAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFKzqj502WWfePihhyua3XLLLevXr5/6Mwv2WvDyP3h5FaMwc+bOed2S11UBvOxlLztp5cqqt3TprkJ16enYbffdzj77nCq21oaNz1T95sADDrjzzrUVbAdvectbvnzdV6re0qUHz8KF+921bl0VW1+OAACCGxrqgwl2AQCw7Y2NjVXhCQCAbc8IACCpvhgB2AYKkJQAAEhqcKaAFi588ZVXvqfK4cEHf/mBD1y1bt3Pn9f/VaqKVq36u7vvfqiKUZiJDjvsg9WgOPLIPzz33KNnz+7Xb3R/demtvOtdn7jrrvu2umgNoKeGh3dauvRVVRpHHPHaFSv++rrrbp3+/7LzzmWqaLxpqjCFmWi8YOvXP131vwsvXHHBBSuqPtdHXXor8+fPrfrT4EwBtdvtKpPxPnfNNR9ctuyPpv+/JKuhLC677IwBuPtX/dyla28+fXFHGpwAGBpqVcnMmrXDF75w/sjI0ml+PlSPHBsrX5gBeGj41KfOPuOMI6tB0addurYUAqCnItxQirjqqvdO8xYQKiMjFKbV6uOHhvF75Wc/+/5TTnlzNXD6rkvXFqMv1gCMAPre+F1sfBLg/POP6/rJUBlpBDBD47Mlxx//hmoQ9V2Xri2GcwD0ziWXrPrQh5ZX5HDDDRcfddTB1UDTpXvAFNDguPjilRdeOAiLgUxhzpzZX/3qX735zQdVCejS25sRwEC54IIV553XfeBMn5o9e9Z11/3l4YcvrtLQpberwTkHsGkNoA8m3ba3Sy8dGV98uuSSf2n4e6gq0l7PzzXXfODwww/MVm/90KX7dfphcAJg05LLaEVVffjDKy6//PpHHnli0l/ahaqo3XBRe03XrFk7fOlL5x9xxKtzVlq8Lj0gBuxtoLrCb7zoRbtM/rZsGiSFqiLtNS077DD0+c+/74gjFmeuschdunbDp1dB9JhngS5++MN7Wq0TqiiCttcNN9wwe8dA34vxu//nPnfu0Ue/RveeLMi4v3bHpx+E6alNZ3p8Qzbri0lJ7dXd1VeftWzZa9VVc5dWMy/cIAVAtPkNpmbE1t3HPjZy/PEHq6gmYaaA+vUk8OAEQLttEXii6CMAI7au9tprt3POOVwt/VbTaVtTQC/cIAWAJ8p+EqO9QsfkLrvM0aW7CfKttw20tHhbXMqyBjAYVNFm1gC2PSMAStFeXamirowAZsQuoEFV0yMXLtzjyitXVj23atVn7r770a0uRhix1b4Oevfdhxcv3qvqrVtu+dn69Ru2umhQu6XIIwABEIJvy1Tmzp21dOlLq54bHt6x4S8R22vJkn2vv/7dVW8tWnTp2rW/2Oqiw+3TYJA0I14FMahCPS4F3b/R8HsARe4pJri7MgLY9pwETiVQFcWYAqq9HKeWdOkunAOYIVNAg8oIoLuGHwQzAojJOYBtTwAkEm+dPGZ7hXru1qW7UkUv3CCdA6jKdoW1ax+6+urvT74+MrJ4//33qAIItlM28vyGKaB+YRvojBgBbDO3337fRRd9bfL1Aw/83f3337XqtZoeWW7CNOz8hkXgPhKqS08uxuSL1gB6qvizQP2UX7s96omyTtjH2ygFKz6oHfe97/3i4Yef3Ori8PCOS5b0+qhELWsAMzRYJ4HbRbtCuyEAxvtBO8wTZTvKCKDz0NQu/NVt1W8Dagdpr/JduqrOPPP6m2++Z6uLCxbMu+/es6peq6miTgOWrqKqYTtZQ++KZYBOAo//N1o0csfq77mt8a9x7wtWP7fRLlNFdYUZGy/JaOFHpPpzAO0qSHuV79Kdx5favTdRunSEKqqeLcbkiwKglzZ1ypJLMe2Gf71zvWjBthCnJFWwwmzWjtJexbt01RAA7QAFe1aEKvpNMWoumgLqoeLPAq2GXeVVmcelMM+2VbDCdFVmBFA3v1GVr6KGyY0oVTQ0XpQAvahuDdgicG+V6ZQTNQR+q9TEyyRlRu5TCBoAUWqpfJeuptidpEtvWYyai0YAPdRpg6I13m5YA+gsAkfpCu0wJalCFKbp7hajlop36aphmaRzUZeutihFnxqgg2ClB4NNU0BxFoGLTSk07rY3Atj8jzZcjDkCCLNOHqYXOQhWWvHBYLvhX2+X2e5S++BW6tvSsIHPGsAW/2qd8gEQp2BRq6gyAoig+NTtWKhF4JprQ61AI4CwK5yRRgDB1mwmSt6lJxdj8kWLwL0WchG4CrP0GmoROEJh2vFvu0YAU7IIPEODtAYQdBtooTWA2j1zgbaBRnh2azypk7y9Jmg1XVRFWxTDu4BKK78G0LQLKMCR1+fYBtqVbbsT1B8EM0jamkXg4orvBwg1BRRqy0Sf7QLyKogJZWh6y03yLl1NKkZ/sgaw7TQuAkfZBVTuibLhuxt0j2M7SHu1A9zdIo0AQnXpScWouWgNoIfKrwGEehlcrUgj97HRAPMbVeh3VFgD6C5Il26bAiqt/MvgxiK9DK7xBH+JKqqd3+hMI5T+2jSOAEK0V4iXwbUbLibv0oPCGsC2E+ocQJ0gb856VoSnyH+/7LDRSa22x66zwzze2gbajTWAmRms3wQuOunWuA20yOtK2g0TpkWqqGG/ffG3uBx60O/U/yFGexXv0tUUU0CqaGIxHAQrrvN7XCFHAJG2gUbavRd2F1AYMc7Khd4GahF4hgbrN4FtA90s/jbQSgBMEHaPY5y2sw10OxikH4RpVRuL/gbbaP2/3hotXbDNxrtpkJI8uwsoTGGKa9e/6KZ8z2mYAorSpSNUUWUKKITxr9AzVUlNv009VqJgTY8kRaqo6e5Wtr3CeOyJjT97YP3k6+3iXbqK1JGa9iMF6EUNe6X6YFwwWAfBnin5LPD7ewy/cfGLaq7vPlygYI333BJV1HgTMQKo7n5w/VvO+/pTG2oeHzobi0tXUbtufqVza4vRpSNUUTVFLYU3WCOAooPBQ1/xoq9delj93zZWEYSadYkzjVDQrXc98raLbr7/0adq/xpjCqhVf9EU0MRiVF4GV1pnId6Uwmbhp4Da6dvr0zf+dNVHvzXFBzr32dJVtGPdXWzO7KEgU0BBvvV2AQXQbplSeE79lolIU0Dt1FNA7/nH2z9+3Z1TfybC/MaNFzUMaoMsa/nWz8yArQFUdBGqilK2188fffLYv/3GN+98eFqf1qW7ilBFtoEW1xmp2la4WdND98ZII4B87XXLTx45+iNfv//xp6b16ZRV1ChyL2r3azMN0hqAXSUT1PbIUrMu9YVJN3i/9f8eWXLRDdP/vC69hVBduppUjP7kHEAi4bbeJ2uvg/fZ46Mnvvbcf75tuv+DLt1NkC7tIFh5xTa5xxRq3dUi8G+9Z+miA/fc7dgr/uvxJ7tvDdaltxC5F5kCKq6zE8uE6WZNxybDrAGkba83vWzBd8876qjLb/zBzx+f+pO69BZCdemtitH0u2nhmQJKJNbW+8TttXCXnW9575Ejn/nGF+64e6rP6dLdBOnSXgURg/HyZl4FEdvc1qzPn/zGj9z0o/d/5bbRseY7hS69WaguvVUxnAQuLsKxyeBCHZYe0l5V9b43vPLgvfZY9umbHn1yQ82fjQC6cRJ4hgbrB2FMmG7WdGzSOYBg3rj3nt8+/ahFH792w6T32g95XdJEobp0NakY/WmQRgDGyxOEmnWpXQQOsH9j+JJ/evKZrV/D+eKd5zzwvhOqHnrJ/PkLd5131yO/3Op6hCoKxETidjBAIwDj5W46U5KBpoDKF6bVqn3VZYGC1W8kr3TpLoJUUe1kvzWAnjJe3kLdmHSs1CxZ00ngoO1VomCh2iumwFVUO9tvDaCnOuPl0cHa1DQDv95Y+1zUKlNFjb8rW7q9Gn9mtucFq6+ili79nMhVZA2guJZvy2/9z/0P3POrX9f8oVhGNowAwrZXgYI1vOhGl36OKtr2BmsNQFeoqm898MCbr7mu9k9DraE4VRQhsGvXACI9d3um6coIYEYG6yRw+m/LbQ/+4o+vvfaJjfXvmensVi4zBVTz9RgtVZgJxtq1J/iLTAHVnSQKcHd7fMPTtz/04OTrr3vxnnNn9bZs7cgjAAFQXvbHpf+496d/dsO/Nt39q5IjgIbflQ3ZXp2yBpkCClBFX/zx2tVfu37y9evfeuyf7L1f1VN1GRljUDtUtw/ILqCe6rTB6I5VVlet+/47bvry1J/ZtE5eoopq35TSubuVbq92w7XeF6zplFPpKmqP1t/FxkZ36HXZmk6TBPjWj9W/7tAuoB7qDOfHko4A/v5/v33WN/+t68c6UwpjUUYA5QrznIZzAEUKVrfHMUCXHhtrCoChnpetYQoowrfeD8IEkHQK6OI7brrgOzdO55PFdsq2+2oXUJGC1a8BlJ/fGGrv0Hh9NMAaQJRvvTWA4iJvK9xu/uK26//mRzdP88Ohpt03zbQULkw77AGFTSIcbZlqBBBk8t0awAw4B9DHTr/1i1es+9b0P9+ONAJoBQjsxse2GCOAjuJduiEAqrEQI4DOLFmAb701gAgSBcBPfv3w8m9+5tZH735+/1usQVLY9gpTsAjtNbZD4/UgG/BDFKPqUwN2EKzwfoDha//8ydHuv/VaTqldJU2zt8X3bzRtLe99wZr2OBauoqH2rMbrvS5b2F7kIFgEDoJ1FWkKKMLJ7XbTk1uMKaCxCGflRlsN14ciTAE5CDZDpoASacVYMXtWiFdBRD1+9awI7dVq2AXUGpsV5c7rVRAzYBfQthW6H4RaBPYyuC2EHSQ1LAJ3rocYAdgGOiOD9cgc8/XCocR5G2jYEVuZe0q/7QIa7f0icNQqqiwCh2AKqItim6brD/GXn+Bu178KokTBwr7svnEXUO9HADXXnAOYoQGbAsr7LqDpKPfilKbBe8z2agXZBRSiihoDIMQuIO8CmiFTQImUGwH019tAo7wKIsQ6eZxF4Khvy6iMAEJo9/FafG+MtcfiVFF7fP4lZHvFKViEkjS9LaMd4+sWpEvX/rCEEUBvtfp3Kb5XIlVR55RT6cLUbgPtvCI0SC1F7tJByuZbPzPmTChjrCr/fFR7EKzdjrKlo3ZioceG6n81s/E6/WWwAkCf7CrOCKAyAuiik5GlSzLWsD9pbNMv+oQQZCDSn4wAKMMIAIoz+7IpnQAACQ5JREFUAkimSBXV/aNGAFv+qzXXIlTRVFNAPS5b63leZxqMACjDCKCrCFXUOAVknDQQjAASibDxZgsx2yvUxhK7gKYUpEvXjpOcA+g5ATClzqZp20AnaPxR+Bi1FKGKAk0B1QnSpZ0DoA90bihhdL66pdXO9rTDvNkrQhVNtQsogCBd2gggBiOArkwBTYcRwHNlCD0C6PCtn4HWho3PVP3mwAMOuPPOtVtdHN5hp0Pm718VddNjP6gCK1VFt/xy3fqxp6sYhZmoqb3euNsBVW+FraL7Nzy2dv29k6+/at7CPWbNq3oobBWN+/avfvzE6FNbXXzJS1669s47q9gGJwAA4li4cL+71q2rYuuDWSoAtgcBAJCUXUAA255dQNvLU08/VQEE9vjjj1Xh9eUi8Lydhzds2FABRDVr1qz1T0Z/VLUGAJBUXwbAfvu9pAIIbJ999q3CswgMsO31xbuATAEBJCUAAJISAABJCQCApAQAQFJ2AQFse14FAZCUn4QESMoIACCj4eHhY445pgpPAABsM4sWvfLMs85cuXJk/vz5VXgCAGCmfn/vvVecuOL4E054zWteU/UPAQDwAu20007HLFu2evWaww47rNVqVf1GAAA8bwcccMC7Tz/9xBNX7LbbblXfchBsAB166KELFiyoApg3b96aNafsu28fvBe3oDjtFVa0Ln3zN/779u989/TTz+jru38lAAbJ8PDwqaee9t077vjqf944f/4uVVGvf/3r/+GTn7zn3vsuv+KKOXPmVkwSqr1iCtullyxZUg0EU0CD4KCDDjr1tNNOOmnl+ONJVdQ+++47snJk9ZrVfrRnCnHaKyxdujcEQB/beeedly8/8ZRTTz3kkEOqosaf1N5+zDHvfOfq8aWwigZx2issXbrHBED/Gf+SvPWoo5afsPyII4+cPXt2Vc7Q0NDSpUtHRk4+9rjj5s41z1MvTnuFpUuXIgD6ycEHH3zmmWcdd/zxc+bMqYp6xSsWjZw8surkVQv22quiQZz2CkuXLksA9IHx78YJJyw/+5xzXv3qV1dFLVy43/Hj+u20S4/Faa+wdOkgBEBoixa98tTTTl216h1ld5vtvvvuJ5+86oTlywdm88N2EqS9ItOlQxEAEc2bN+/EE1e8c/Xqsr2z1Wq96U1vWr16zTHLlu24444VDYK0V2S6dEwCIJbDDz98vHce/fa3l12AGp8PXXHSipGVI/suXFjRLEh7RaZLRyYAQhhfd1qzes0pp5yy9z77VOXsuuuua9acsnJkZPHixRXNgrRXZLp0X+jLADhkySF77vl71UDYaaedTjpp5XgHrbap51tFw8PDf/q2t43PzG6PzRjaqytV1FWoLj0wWhs2PlMBkI93AQEkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKQEAEBSAgAgKQEAkJQAAEhKAAAkJQAAkhIAAEkJAICkBABAUgIAICkBAJCUAABISgAAJCUAAJISAABJCQCApAQAQFICACApAQCQlAAASEoAACQlAACSEgAASQkAgKT+HwAA///xJAoDAAAABklEQVQDAE6SUgJVvXYEAAAAAElFTkSuQmCC"), c => c.charCodeAt(0));
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache, no-store, must-revalidate" } });
      }
      if (url.pathname === "/icon.svg") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
          <rect width="192" height="192" fill="#fafbfc" rx="24"/>
          <g transform="translate(18, 58)" fill="#0f172a">
            <path d="M12,0 L28,0 C38,0 44,6 44,16 C44,26 38,32 28,32 L20,32 L20,52 L12,52 Z M20,8 L20,24 L26,24 C32,24 35,21 35,16 C35,11 32,8 26,8 Z"/>
            <path d="M52,20 L60,20 L60,24 C62,21 66,19 70,19 C78,19 82,24 82,33 L82,52 L74,52 L74,35 C74,29 72,26 67,26 C62,26 60,29 60,35 L60,52 L52,52 Z"/>
            <path d="M90,35 C90,24 97,19 107,19 C117,19 124,24 124,35 C124,47 117,53 107,53 C97,53 90,47 90,35 M98,35 C98,42 101,46 107,46 C113,46 116,42 116,35 C116,29 113,25 107,25 C101,25 98,29 98,35"/>
          </g>
          <g transform="translate(118, 58)" fill="#0ea5e9">
            <path d="M8,0 L32,0 L32,8 L16,8 L16,20 L30,20 L30,28 L16,28 L16,52 L8,52 Z"/>
            <path d="M38,0 L46,0 L46,20 L60,20 L60,0 L68,0 L68,52 L60,52 L60,28 L46,28 L46,52 L38,52 Z"/>
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
          const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
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
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans TC",sans-serif;background:#fafbfc;padding:1rem;color:#333}h1{font-size:1.5rem;margin-bottom:1rem;color:#0066ff}.form-group{margin-bottom:1rem}label{display:block;font-size:.875rem;color:#666;margin-bottom:.25rem}input,textarea{width:100%;padding:.75rem;border:1px solid #ddd;border-radius:8px;font-size:1rem;font-family:inherit}textarea{min-height:120px;resize:vertical}button{background:#0066ff;color:#fff;border:none;padding:.75rem 1.5rem;border-radius:8px;font-size:1rem;cursor:pointer;width:100%}button:hover{background:#0052cc}.hint{font-size:.75rem;color:#999;margin-top:.25rem}#result{margin-top:1rem;padding:1rem;border-radius:8px;display:none}#result.success{background:#d4edda;color:#155724}#result.error{background:#f8d7da;color:#721c24}</style>
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
      await env.AI_NEWS_KV.put("news-data", JSON.stringify(data2));
      const html2 = generatePage(data2);
        return new Response(html2, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Access-Control-Allow-Origin": "*" } });
      }
      const cached = await env.AI_NEWS_KV.get("news-data");
      if (cached) {
      const data2 = JSON.parse(cached);
      // Read videos from youtube:videos:v25 (single source of truth for videos)
      const ytCacheKey = 'youtube:videos:v25';
      const ytCached = await env.AI_NEWS_KV.get(ytCacheKey);
      if (ytCached) {
        const ytData = JSON.parse(ytCached);
        // Apply whitelist filter (same as fetchYouTubeVideos)
        const _ytWl = new Set(['UCP7jMXSY2xbc3KCAE0MHQ-A','UCXZCJLdBC09xxGZ6gcdrc6A','UCrDwWp7EBBv4NwvScIpBDOA','UCxgo0OMZU9SiaYpJsuZKWkQ','UC5qxlwEKM7-5YZudb24l0bg','UC5-pBdfdA3KUo-vq72l-umA','UCHlNU7kIZhRgSbhHvFoy72w','UCpi_ULPErwrxGTDWZey5azQ','UCGSJevmBuDyxjLLOBNaYMGA','UC-ew9TfeD887qUSiWWAAj1w','UCBJycsmduvYEL83R_U4JriQ','UCXuqSBlHAE6Xw-yeJA0Tunw','UCMiJRAwDNSNzuYeN2uWa0pA','UCddiUEpeqJcYeBxX1IVBKvQ','UCftwRNsjfRo08xYE31tkiyw','UCOmcA3f_RrH6b9NmcNa4tdg','UCCjyq_K1Xwfg8Lndy7lKMpA','UC-6OW5aJYBFM33zXQlBKPNA','UCsTcErHg8oDvUnTzoqsYeNw','UCVYamHliCI9rw1tHR1xbkfw','UCbfYPyITQ-7l4upoX8nvctg','UCZHmQk67mSJgfCCTn7xBfew','UCNJ1Ymd5yFuUPtn21xtRbbw','UChpleBmo18P08aKCIgti38g','UCsBjURrPoezykLs9EqgamOA','UCSHZKyawb77ixDdsGog4iWA','UCXUPKJO5MZQN11PqgIvyuvQ','UCvKRFNawVcuz4b9ihUTApCg','UCMLtBahI5DMrt0NPvDSoIRQ','UCR9j1jqqB5Rse69wjUnbYwA','UCBa5G_ESCn8Yd4vw5U-gIcg','UCEBb1b_L6zDS3xTUrIALZOw','UCYO_jab_esuFRV4b17AJtAw','UCcIXc5mJsHVYTZR1maL5l9w','UCtYLUTtgS3k1Fg4y5tAhLbw','UCTMRxtyHoE3LPcrl-kT4AQQ','UC0m-80FnNY2Qb7obvTL_2fA']);
        const rawCount = (ytData.videos || []).length;
        data2.videos = (ytData.videos || []).filter(v => _ytWl.has(v.channelId) && !_blacklistIds.has(v.channelId));
        console.log(`[YouTube] Using ${ytCacheKey}: ${rawCount} raw videos, ${data2.videos.length} after whitelist filter`);
      } else {
        console.log(`[YouTube] No ${ytCacheKey} cache found, falling back to news-data videos`);
        // Keep data2.videos from news-data cache as fallback
      }
      const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
      data2.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
      const html2 = generatePage(data2);
        return new Response(html2, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Access-Control-Allow-Origin": "*" } });
      }
      const newsData = await fetchNewsData(env);
      const toolsData = await fetchToolsData(env);
      const videosData = await fetchYouTubeVideos(env);
      const data = { ...newsData, tools: toolsData, videos: videosData };
      const blogPostsRaw = await env.AI_NEWS_KV.get("blog-posts");
      data.blogPosts = blogPostsRaw ? JSON.parse(blogPostsRaw) : [];
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
function generatePage({ news = [], tools = [], videos = [], blogPosts = [], updatedAt, summarizedNews = [], summarizedAt = null }) {
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
  let html = '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><meta name="theme-color" content="#fafbfc"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black"><meta name="apple-mobile-web-app-title" content="PikAI"><link rel="manifest" href="/manifest.json?v=12"><link rel="icon" type="image/png" href="/icon-192.png?v=4"><link rel="apple-touch-icon" href="/icon-192.png?v=4"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Honk&family=Urbanist:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><title>PikAI</title><style>';
  html += "* { box-sizing: border-box; margin: 0; padding: 0; }";
  html += 'body { font-family: "Urbanist", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif; background: #fafbfc; color: #0f172a; line-height: 1.6; -webkit-font-smoothing: antialiased; overflow-x: hidden; }';
  html += ".container { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1rem; }";
  html += ".hero { position: relative; padding: 64px 20px 20px; text-align: center; background: #ffffff; overflow: hidden; }";
  html += ".hero-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(14,165,233,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.03) 1px, transparent 1px); background-size: 60px 60px; animation: gridDrift 30s linear infinite; }";
  html += ".hero-grid::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,165,233,0.06) 0%, transparent 60%); }";
  html += "@keyframes gridDrift { 0% { transform: translate(0,0); } 100% { transform: translate(60px,60px); } }";
  html += ".hero-content { position: relative; z-index: 1; }";
  html += ".logo-wrap { font-family: 'Honk', 'Noto Sans SC', sans-serif; font-size: 52px; font-weight: 600; letter-spacing: -2px; margin-bottom: 20px; display: inline-flex; align-items: center; gap: 2px; }";
  html += ".logo-pik { color: #0f172a; font-weight: 700; }";
  html += ".logo-ai { color: #0ea5e9; font-weight: 700; }";
  html += ".logo-divider { display: inline-block; width: 2px; height: 32px; background: linear-gradient(to bottom, transparent, #94a3b8, transparent); margin: 0 8px; vertical-align: middle; }";
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
  html += "@media (max-width: 700px) { .card-grid { grid-template-columns: 1fr; padding: 0 1rem; } .summarized-grid { padding: 0 1rem; } .blog-list { padding: 0 1rem; } .knowledge-container { padding: 0 1rem; } .tabs { border-radius: 30px; overflow-x: auto; -webkit-overflow-scrolling: touch; justify-content: flex-start; padding-left: 1rem; } .tab { padding: 0.5rem 0.6rem; font-size: 0.8rem; gap: 0.3rem; min-width: max-content; flex: none; white-space: nowrap; line-height: 1.2; } .tab-icon { font-size: 1.1rem; } .tab-count { font-size: 0.65rem; padding: 0.1rem 0.3rem; } h1 { font-size: 1.8rem; } .rankings-card-header { font-size: 0.9rem; padding: 0.7rem 0.8rem; } .rankings-table td { padding: 0.4rem 0.4rem; font-size: 0.75rem; } .rankings-table .provider-cell { font-size: 0.68rem; } .knowledge-card { margin-bottom: 1rem; } }";
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
  html += ".video-title { font-size: 0.91rem; color: #222; line-height: 1.4; margin-bottom: 0.5rem; font-weight: 600; }";
  html += ".summarized-text { font-size: 1.02rem; color: #555; line-height: 1.5; }";
  html += ".ai-digest-badge { display: inline-block; background: linear-gradient(135deg, #0066ff, #7b2dff); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-right: 6px; vertical-align: middle; }";
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
  html += '<div class="logo-wrap"><span class="logo-pik">Pik</span><span class="logo-divider"></span><span class="logo-ai">AI</span></div>';
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
  // Show all news as AI summarized cards
  if (news && news.length > 0) {
    html += '<div class="summarized-section">';
    html += '<div class="summarized-grid">';
    news.forEach(function(item) {
      html += `<div class="summarized-card" onclick="window.open('` + escapeHtml(item.url) + `', '_blank')">`;
      // Image - show OG image, or favicon fallback, or gradient placeholder
      if (item.ogImage) {
        const safeUrl = encodeURI(item.ogImage).replace(/%25([0-9A-Fa-f]{2})/g, '%$1');
        html += '<img class="summarized-image" src="' + safeUrl + '" alt="" onerror="this.style.display=\'none\'">';
      } else {
        // PikAI logo fallback for articles without images
        html += '<div class="card-image-favicon"><img src="/icon-192.png" alt="PikAI" style="width:64px;height:64px;object-fit:contain;opacity:0.6"></div>';
      }
      html += '<div class="summarized-content">';
      html += '<div class="summarized-source">' + escapeHtml(item.source ? item.source.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : 'AI News') + '</div>';
      html += '<div class="summarized-title">' + escapeHtml(item.translatedTitle || item.titleZh || item.title) + '</div>';
      if (item.summary) {
        // Remove "標題：" prefix from summary if present (Workers AI sometimes includes it)
        let cleanSummary = item.summary.replace(/^標題[：:]\s*[\s\S]*?(?=\n{2,}|$)/, '').trim();
        // Also remove any standalone "標題：" line
        cleanSummary = cleanSummary.replace(/\n?標題[：:]\s*.+?\n/, '\n').trim();
        html += '<div class="summarized-text"><span class="ai-digest-badge">AI Digest</span>' + escapeHtml(cleanSummary) + '</div>';
      }
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
  html += 'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeVideoModal();});';
  html += 'function switchTab(tabName) { document.querySelector(".hero").scrollIntoView({behavior:"instant"}); document.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active")}); document.querySelectorAll(".content-section").forEach(function(s){s.classList.remove("active");s.style.display="none";s.style.visibility="hidden";}); document.querySelector(".tab-"+tabName).classList.add("active"); var sec=document.querySelector(".section-"+tabName); if(sec){sec.classList.add("active");sec.style.display="block";sec.style.visibility="visible";} };';
  html += 'function toggleBlogArticle(index){var article=document.getElementById("blog-post-"+index);if(!article)return;var isExpanded=article.classList.contains("expanded");if(isExpanded){article.classList.remove("expanded");article.classList.add("collapsed");}else{article.classList.remove("collapsed");article.classList.add("expanded");}};';
  html += 'function sanitize(s) { s=String(s||"").replace(/[<>]/g,function(c){return c=="<"?"&lt;":">";}).replace(/\uFF1B/g,";");return s;};';
  html += 'document.querySelectorAll(".card-title, .card-summary").forEach(function(el){if(!el.dataset.origTitle&&!el.dataset.origName)el.dataset.origTitle=el.textContent;if(!el.dataset.origSummary&&!el.dataset.origDesc)el.dataset.origSummary=el.textContent;});';
  html += 'document.addEventListener("DOMContentLoaded",function(){var lo=document.getElementById("loadingOverlay");if(lo){lo.classList.add("hidden");}document.querySelectorAll(".content-section").forEach(function(s){if(!s.classList.contains("active")){s.style.display="none";s.style.visibility="hidden";s.style.height="0";s.style.maxHeight="0";s.style.overflow="hidden";s.style.opacity="0";}});if("serviceWorker"in navigator){navigator.serviceWorker.register("/sw.js?v=4").catch(function(e){console.log("SW registration failed:",e)});}});';
  html += 'let touchStartX=0,touchStartY=0,touchEndX=0,touchEndY=0,touchTabIndex=0; document.addEventListener("touchstart",function(e){touchStartX=e.changedTouches[0].screenX;touchStartY=e.changedTouches[0].screenY;var active=document.querySelector(".tab.active");touchTabIndex=active?parseInt(active.dataset.tabIndex||"0"):0;},{passive:true}); document.addEventListener("touchend",function(e){touchEndX=e.changedTouches[0].screenX;touchEndY=e.changedTouches[0].screenY;var dx=Math.abs(touchEndX-touchStartX);var dy=Math.abs(touchEndY-touchStartY);if(dx>150&&dx>dy){var next=(touchEndX<touchStartX)?touchTabIndex+1:touchTabIndex-1;var tabs=["news","videos","tools","knowledge","blog"];next=((next%5)+5)%5;switchTab(tabs[next]);}},{passive:true});';
  html += 'var btt=document.getElementById("backToTop");window.addEventListener("scroll",function(){btt.classList.toggle("visible",window.scrollY>300);});';
  html += 'function backToTop(){window.scrollTo({top:0,behavior:"smooth"});};document.getElementById("backToTop").addEventListener("click",backToTop);';
  // Pull to refresh - swipe down from top to reload cache
  html += '(function(){var startY=0,refreshing=false,pullIndicator=document.createElement("div");pullIndicator.style.cssText="position:fixed;top:0;left:0;right:0;height:0;background:#f0f2f5;color:#888;display:flex;align-items:flex-end;justify-content:center;padding-bottom:10px;font-size:14px;z-index:9998;transition:height 0.2s;overflow:hidden;";pullIndicator.textContent="↓ 放開刷新";document.body.appendChild(pullIndicator);function resetPull(){pullIndicator.style.height="0";setTimeout(function(){pullIndicator.textContent="↓ 放開刷新";},200);}document.addEventListener("touchstart",function(e){if(window.scrollY<=0){startY=e.touches[0].clientY;refreshing=false;}},{passive:true});document.addEventListener("touchmove",function(e){if(window.scrollY<=0&&!refreshing){var pull=e.touches[0].clientY-startY;if(pull>0&&pull<150){pullIndicator.style.height=pull+"px";}else if(pull>=150){pullIndicator.style.height="60px";pullIndicator.textContent="↑ 放開刷新";}}},{passive:true});document.addEventListener("touchend",function(e){if(!refreshing){var pull=parseInt(pullIndicator.style.height)||0;if(pull>=60){refreshing=true;pullIndicator.textContent="⟳ 更新中...";window.location.reload();}else{resetPull();}}});document.addEventListener("touchcancel",function(e){if(!refreshing){resetPull();}});setInterval(function(){if(!refreshing&&parseInt(pullIndicator.style.height)>0){resetPull();}},3000);})();';
  html += "<\/script>";
  html += '<style>.version-footer{position:fixed;bottom:0;left:0;right:0;text-align:center;padding:6px;font-size:10px;color:#999;background:#f5f5f5;z-index:9999;pointer-events:none;user-select:none;}</style>';
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
