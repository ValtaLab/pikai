#!/bin/bash
# AI Blog Post Generator - Runs on Pi 5 daily
# Collects AI application examples and writes blog posts to Cloudflare KV
#
# 排版要求（對應 worker.js parser）：
#   - 標題用 # 或 ##，如「# 第一步：XXX」「## 進階技巧」
#   - 步驟標題含「第X步」→ 不顯示 step badge（parser 自動偵測）
#   - 步驟標題不含「第X步」→ 自動顯示 1,2,3... step badge
#   - 列表用「- 」或「1. 」開頭
#   - 代碼塊用 ``` 包圍
#   - 粗體用 **text**，inline code 用 `text`
#   - FAQ 格式：「**Q: 問題？**」+「A: 答案」→ 自動渲染綠色 FAQ 區塊
#   - 例子區塊：標題含「實際例子」→ 自動渲染黃色例子區塊
#   - 工具連結：透過 tools 陣列輸出，渲染在文章底部（勿在正文加連結）
#
# 內容要求：
#   - 1000字以下，5分鐘閱讀時間
#   - 教普通人用 AI 改善生活/提高效率
#   - 語言通俗易懂，適合 AI 新手
#   - 包含具體步驟和實際例子
#   - 繁體中文

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load env (skip if file has comments/labels, not pure KEY=VAL)
# .env.local contains markdown-style labels, not KEY=VAL pairs
# Hardcode credentials instead

CF_ACCOUNT_ID="77002f1945c94a1c33a11717015c378b"
CF_API_TOKEN="${CLOUDFLARE_API_TOKEN}"
KV_NAMESPACE_ID="b8dfffba53d249e2a6a73e60774217d5"
KV_KEY="blog-posts"

TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date -Iseconds)

echo "[$(date)] Starting blog post generation..."

# =============================================================================
# STEP 1: Search for AI application examples using DuckDuckGo
# =============================================================================
echo "[$(date)] Searching for AI application examples..."

# Search queries - rotate daily
QUERIES=(
  "AI tools improve productivity real examples"
  "普通人用AI提高效率案例"
  "AI應用實例日常生活"
  "ChatGPT Claude real world use cases"
  "AI automation personal life examples"
)
DAY_OF_WEEK=$(date +%w)
QUERY="${QUERIES[$DAY_OF_WEEK]}"

echo "[$(date)] Using query: $QUERY"

# Use DuckDuckGo HTML search
SEARCH_URL="https://html.duckduckgo.com/html/?q=$(echo "$QUERY" | sed 's/ /+/g')"
SEARCH_RESULT=$(curl -sL "$SEARCH_URL" -A "Mozilla/5.0" --max-time 15 | grep -oP 'class="result__a" href="[^"]*"' | head -5)

if [ -z "$SEARCH_RESULT" ]; then
  echo "[$(date)] WARNING: No search results found, using fallback topic"
  FALLBACK_TOPICS=(
    "用ChatGPT整理會議記錄"
    "用AI生成旅行行程"
    "用Claude寫工作郵件"
    "用AI學習新語言"
    "用AI整理照片"
    "用AI做家庭預算"
    "用AI寫社交媒體貼文"
    "用AI做健身計劃"
  )
  TOPIC="${FALLBACK_TOPICS[$DAY_OF_WEEK]}"
  SOURCE_URL=""
  SOURCE_NAME=""
else
  # Extract first result URL
  FIRST_URL=$(echo "$SEARCH_RESULT" | head -1 | grep -oP 'href="\K[^"]*')
  # DuckDuckGo redirects through their domain
  if [[ "$FIRST_URL" == "/l/?"* ]]; then
    FIRST_URL="https://html.duckduckgo.com$FIRST_URL"
  fi
  SOURCE_URL="$FIRST_URL"
  SOURCE_NAME="DuckDuckGo Search"
  
  # Try to get page title
  PAGE_TITLE=$(curl -sL "$FIRST_URL" -A "Mozilla/5.0" --max-time 10 | grep -oP '<title>\K[^<]*' | head -1 | sed 's/&#x27;/\x27/g; s/&amp;/\&/g; s/&#39;/\x27/g')
  if [ -n "$PAGE_TITLE" ]; then
    TOPIC="$PAGE_TITLE"
  else
    TOPIC="$QUERY"
  fi
fi

echo "[$(date)] Topic: $TOPIC"
echo "[$(date)] Source: $SOURCE_URL"

# =============================================================================
# STEP 2: Search for related YouTube video
# =============================================================================
echo "[$(date)] Searching for YouTube video..."

YOUTUBE_API_KEY="AIzaSyDPSJupvWvi8djnakgkZZmGsfPiUyPmVsw"
VIDEO_ID=""
VIDEO_TITLE=""

if [ -n "$YOUTUBE_API_KEY" ]; then
  # Use YouTube API if key available
  YT_QUERY=$(echo "$TOPIC" | sed 's/ /+/g' | cut -c1-50)
  YT_URL="https://www.googleapis.com/youtube/v3/search?part=snippet&q=${YT_QUERY}&type=video&videoDuration=medium&maxResults=1&key=${YOUTUBE_API_KEY}"
  YT_RESPONSE=$(curl -s "$YT_URL" --max-time 10)
  
  VIDEO_ID=$(echo "$YT_RESPONSE" | grep -oP '"videoId": "\K[^"]*' | head -1)
  VIDEO_TITLE=$(echo "$YT_RESPONSE" | grep -oP '"title": "\K[^"]*' | head -1)
fi

if [ -z "$VIDEO_ID" ]; then
  # Fallback: search without API key using DuckDuckGo
  YT_SEARCH=$(curl -sL "https://html.duckduckgo.com/html/?q=youtube+$(echo "$TOPIC" | sed 's/ /+/g' | cut -c1-30)" -A "Mozilla/5.0" --max-time 10 | grep -oP 'youtube.com/watch\?v=[^"&]*' | head -1)
  if [ -n "$YT_SEARCH" ]; then
    VIDEO_ID=$(echo "$YT_SEARCH" | grep -oP 'v=\K[^"&]*')
  fi
fi

if [ -n "$VIDEO_ID" ]; then
  echo "[$(date)] Found video: $VIDEO_ID"
else
  echo "[$(date)] No video found"
fi

# =============================================================================
# STEP 3: Generate blog content using local Ollama or write manually
# =============================================================================
echo "[$(date)] Generating blog content..."

# Check if Ollama is available
OLLAMA_AVAILABLE=false
if command -v ollama &> /dev/null && curl -s http://localhost:11434/api/tags &> /dev/null; then
  OLLAMA_AVAILABLE=true
fi

if [ "$OLLAMA_AVAILABLE" = true ]; then
  # Use Ollama to generate content
  PROMPT=$(cat <<'PROMPT_EOF'
請用繁體中文撰寫一篇關於「TOPIC_PLACEHOLDER」的教學文章，教普通人如何利用AI工具改善生活或提高效率。

排版要求（必須嚴格遵守）：
1. 標題格式：步驟用「# 第一步：XXX」「# 第二步：XXX」，進階/FAQ/總結用「## XXX」
2. 每個步驟後面要具體說明做法，用簡短段落
3. 列表用「- 」開頭
4. 代碼或提示詞用 ``` 包圍
5. FAQ 格式：「**Q: 問題？**」換行「A: 答案」
6. 例子區塊標題用「## 實際例子」
7. 工具連結不要寫在正文，會另外處理
8. 總結用「## 總結」

內容要求：
1. 篇幅約800-1000字
2. 語言通俗易懂，適合AI新手
3. 包含具體步驟和實際例子
4. 附上一句總結（keyTakeaway）
5. 注明參考來源（如果有的話）
6. 輸出格式：
標題：[標題]
內容：[內容]
總結：[一句話總結]
工具：[工具名稱](URL)，多個用逗號分隔

請開始：
PROMPT_EOF
)
  # Replace placeholder with actual topic
  PROMPT=$(echo "$PROMPT" | sed "s/TOPIC_PLACEHOLDER/${TOPIC}/g")

  echo "[$(date)] Using Ollama to generate content..."
  
  # Try qwen2.5:3b first, fallback to other models
  MODEL="qwen2.5:3b"
  
  CONTENT=$(curl -s http://localhost:11434/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"model\": \"$MODEL\", \"prompt\": \"$PROMPT\", \"stream\": false, \"options\": {\"temperature\": 0.7, \"num_predict\": 1200}}" \
    --max-time 180 | grep -oP '"response":"\K[^"]*' | sed 's/\\n/\n/g; s/\\"/"/g')
  
  if [ -z "$CONTENT" ]; then
    echo "[$(date)] Ollama generation failed, using template"
    USE_TEMPLATE=true
  else
    # Parse generated content
    BLOG_TITLE=$(echo "$CONTENT" | grep -oP '^標題：\K.*' | head -1)
    BLOG_BODY=$(echo "$CONTENT" | sed -n '/^內容：/,/^總結：/p' | sed '1d;$d')
    BLOG_TAKEAWAY=$(echo "$CONTENT" | grep -oP '^總結：\K.*' | head -1)
    TOOLS_LINE=$(echo "$CONTENT" | grep -oP '^工具：\K.*' | head -1)
    
    if [ -z "$BLOG_TITLE" ]; then
      BLOG_TITLE="$TOPIC"
    fi
    if [ -z "$BLOG_BODY" ]; then
      USE_TEMPLATE=true
    fi
  fi
else
  echo "[$(date)] Ollama not available, using template"
  USE_TEMPLATE=true
fi

if [ "$USE_TEMPLATE" = true ] || [ -z "$BLOG_BODY" ]; then
  echo "[$(date)] Using high-quality template library..."
  
  # Read template library
  TEMPLATE_FILE="$SCRIPT_DIR/blog-templates.json"
  if [ -f "$TEMPLATE_FILE" ]; then
    # Get template count
    TEMPLATE_COUNT=$(python3 -c "import json; data=json.load(open('$TEMPLATE_FILE')); print(len(data['templates']))" 2>/dev/null || echo "0")
    
    if [ "$TEMPLATE_COUNT" -gt 0 ]; then
      # Select template by day of week (rotate daily)
      DAY_OF_WEEK=$(date +%w)
      TEMPLATE_INDEX=$((DAY_OF_WEEK % TEMPLATE_COUNT))
      
      # Extract template data
      TEMPLATE_DATA=$(python3 -c "
import json, sys
data = json.load(open('$TEMPLATE_FILE'))
template = data['templates'][$TEMPLATE_INDEX]
print(json.dumps(template, ensure_ascii=False))
" 2>/dev/null)
      
      if [ -n "$TEMPLATE_DATA" ]; then
        BLOG_TITLE=$(echo "$TEMPLATE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['title'])" 2>/dev/null)
        BLOG_BODY=$(echo "$TEMPLATE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['content'])" 2>/dev/null)
        BLOG_TAKEAWAY=$(echo "$TEMPLATE_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin)['keyTakeaway'])" 2>/dev/null)
        TOOLS_JSON=$(echo "$TEMPLATE_DATA" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tools',[]), ensure_ascii=False))" 2>/dev/null || echo "[]")
        TAGS_JSON=$(echo "$TEMPLATE_DATA" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tags',['AI應用','效率提升']), ensure_ascii=False))" 2>/dev/null || echo '["AI應用","效率提升"]')
        
        echo "[$(date)] Using template: $BLOG_TITLE"
        USE_TEMPLATE=false
      fi
    fi
  fi
  
  # Fallback to inline templates if JSON library not available
  if [ "$USE_TEMPLATE" = true ] || [ -z "$BLOG_BODY" ]; then
    echo "[$(date)] Fallback to inline templates..."
    
    # Generate content based on topic keywords
    if [[ "$TOPIC" == *"ChatGPT"* ]] || [[ "$TOPIC" == *"chatgpt"* ]]; then
      BLOG_BODY="# 第一步：錄音轉文字\n\n開會時用手機錄音，會後用 Whisper 或 Otter.ai 轉成文字稿。\n\n# 第二步：餵給 ChatGPT\n\n將文字稿貼上，加上提示詞：\n\n\`\`\`\n請將以下會議記錄整理成重點摘要，包含：\n1. 決議事項\n2. 待辦事項（標記負責人）\n3. 下次會議時間\n\`\`\`\n\n# 第三步：複製貼上\n\nChatGPT 會自動分類，直接複製到郵件或 Notion。\n\n## 進階技巧\n\n- 建立專屬 GPT，儲存公司常用格式\n- 搭配語音輸入，邊走邊整理\n- 設定自動化：Zapier 將錄音自動轉文字\n\n## 實際例子\n\n小王每週要開 3 次會，每次會後花 1 小時整理記錄。用這個方法後，整理時間縮短到 5 分鐘，一週省下 2.5 小時。\n\n## 常見問題\n\n**Q: 錄音品質差怎麼辦？**\nA: 用 Krisp 降噪，或靠近麥克風。\n\n**Q: 機密會議可以嗎？**\nA: 建議用企業版 ChatGPT Enterprise，資料不會被訓練。\n\n## 總結\n\n3 分鐘設定，每次會議省下 1 小時整理時間。"
      BLOG_TAKEAWAY="3 分鐘學會用 ChatGPT 自動整理會議記錄，每次省下 1 小時。"
      TOOLS_LINE="ChatGPT(https://chat.openai.com), ChatGPT Enterprise(https://openai.com/enterprise)"
      
    elif [[ "$TOPIC" == *"Claude"* ]] || [[ "$TOPIC" == *"claude"* ]]; then
      BLOG_BODY="# 第一步：準備文件\n\n將需要分析的 PDF、Word 或文字檔準備好。\n\n# 第二步：上傳到 Claude\n\n在 Claude 對話框中上傳文件，或用複製貼上。\n\n# 第三步：提出具體問題\n\n不要只說「幫我分析」，要具體：\n\n\`\`\`\n請幫我從這份報告中提取：\n1. 三大重點結論\n2. 數據支持的論點\n3. 我可以反駁的觀點\n\`\`\`\n\n## 進階技巧\n\n- 用 Claude Projects 建立專屬知識庫\n- 搭配Artifacts功能生成圖表\n- 用長文分析功能處理200頁文件\n\n## 實際例子\n\n李小姐是市場研究員，每週要讀 5 份 50 頁報告。用 Claude 後，她先請 AI 提取重點，只讀關鍵部分，效率提升 3 倍。\n\n## 常見問題\n\n**Q: 免費版夠用嗎？**\nA: 一般文件分析夠用，但大量處理建議升級 Pro。\n\n**Q: 中文文件支援好嗎？**\nA: Claude 中文理解能力優秀，但專業術語建議先定義。\n\n## 總結\n\nClaude 是長文分析利器，學會提問技巧，讓 AI 幫你讀完厚重文件。"
      BLOG_TAKEAWAY="Claude 的強項在於深度分析和長文處理，適合需要仔細思考的工作場景。"
      TOOLS_LINE="Claude(https://claude.ai)"
      
    else
      BLOG_BODY="# 第一步：找出重複性工作\n\n記錄一週內每天重複做的事：回郵件、填表單、整理資料等。\n\n# 第二步：選擇 AI 工具\n\n根據工作類型選工具：\n- 文字工作 → ChatGPT / Claude\n- 設計工作 → Canva AI / Midjourney\n- 數據整理 → Excel AI / Notion AI\n- 程式開發 → GitHub Copilot / Cursor\n\n# 第三步：建立模板\n\n將常用指令存成模板，例如：\n\n\`\`\`\n請幫我寫一封感謝信，語氣專業但不失溫度，\n對象是 [客戶名稱]，感謝他們 [具體事項]。\n\`\`\`\n\n## 進階技巧\n\n- 用 Zapier 連接多個工具自動化\n- 建立個人 AI 工具箱清單\n- 定期檢視哪些工作可以進一步自動化\n\n## 實際例子\n\n張先生是自由工作者，每天花 2 小時處理行政工作。用 AI 工具後，縮短到 30 分鐘，多出時間接更多案子，月收入增加 20%。\n\n## 常見問題\n\n**Q: AI 會取代我的工作嗎？**\nA: AI 取代的是重複性任務，讓你有時間做更有創造性的事。\n\n**Q: 要學很多工具嗎？**\nA: 先精通 1-2 個，再慢慢擴展。貪多嚼不爛。\n\n## 總結\n\nAI 不是取代人類，而是放大我們的能力。從一個小工作開始自動化，逐步擴大。"
      BLOG_TAKEAWAY="AI 不是取代人類，而是放大我們的能力。學會善用 AI 工具，可以讓我們把時間花在更有創造性的事情上。"
      TOOLS_LINE="ChatGPT(https://chat.openai.com), Claude(https://claude.ai)"
    fi
  fi
fi

# Clean up content
BLOG_TITLE=$(echo "$BLOG_TITLE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | head -c 100)
BLOG_BODY=$(echo "$BLOG_BODY" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
BLOG_TAKEAWAY=$(echo "$BLOG_TAKEAWAY" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | head -c 200)

# Generate slug
SLUG=$(echo "$BLOG_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/-+/-/g; s/^-//;s/-$//' | cut -c1-50)

# =============================================================================
# STEP 4: Parse tools from TOOLS_LINE (only if not already set from template)
# =============================================================================
# Format: "Name1(URL1), Name2(URL2)" or "Name1|URL1,Name2|URL2"
if [ -z "$TOOLS_JSON" ] || [ "$TOOLS_JSON" = "[]" ]; then
  TOOLS_JSON="[]"
  if [ -n "$TOOLS_LINE" ]; then
    TOOLS_JSON=$(echo "$TOOLS_LINE" | python3 -c "
import sys, re, json
line = sys.stdin.read().strip()
tools = []
# Try format: Name(URL), Name(URL)
parts = re.split(r',\s*', line)
for part in parts:
    part = part.strip()
    if not part:
        continue
    m = re.match(r'(.+?)\((https?://[^)]+)\)', part)
    if m:
        tools.append({'name': m.group(1).strip(), 'url': m.group(2).strip()})
    else:
        # Try format: Name|URL
        m2 = re.match(r'(.+?)\|(https?://.+)', part)
        if m2:
            tools.append({'name': m2.group(1).strip(), 'url': m2.group(2).strip()})
print(json.dumps(tools, ensure_ascii=False))
" 2>/dev/null || echo "[]")
  fi
fi

echo "[$(date)] Tools: $TOOLS_JSON"

# =============================================================================
# STEP 5: Search for image
# =============================================================================
echo "[$(date)] Searching for image..."

# Try to get OG image from source URL
OG_IMAGE=""
if [ -n "$SOURCE_URL" ]; then
  OG_IMAGE=$(curl -sL "$SOURCE_URL" -A "Mozilla/5.0" --max-time 10 | grep -oP '<meta[^>]*property="og:image"[^>]*content="\K[^"]*' | head -1)
  if [ -z "$OG_IMAGE" ]; then
    OG_IMAGE=$(curl -sL "$SOURCE_URL" -A "Mozilla/5.0" --max-time 10 | grep -oP '<meta[^>]*content="[^"]*"[^>]*property="og:image"' | grep -oP 'content="\K[^"]*' | head -1)
  fi
fi

# Fallback: use Pollinations.ai to generate image
if [ -z "$OG_IMAGE" ]; then
  IMAGE_PROMPT=$(echo "$BLOG_TITLE" | sed 's/ /%20/g')
  OG_IMAGE="https://image.pollinations.ai/prompt/${IMAGE_PROMPT}%20illustration%20minimal%20flat%20design?width=800&height=450&nologo=true"
fi

echo "[$(date)] Image URL: $OG_IMAGE"

# =============================================================================
# STEP 6: Build blog post JSON and save to KV
# =============================================================================
echo "[$(date)] Saving to Cloudflare KV..."

# Read existing posts
EXISTING_POSTS=$(curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${KV_KEY}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  --max-time 10 || echo "[]")

if [ -z "$EXISTING_POSTS" ] || [ "$EXISTING_POSTS" = "null" ]; then
  EXISTING_POSTS="[]"
fi

# Create new post
NEW_POST=$(cat <<EOF
{
  "id": "blog-${TODAY}-${SLUG}",
  "title": "$(echo "$BLOG_TITLE" | sed 's/"/\\"/g')",
  "slug": "$SLUG",
  "content": "$(echo "$BLOG_BODY" | sed 's/"/\\"/g; s/$/\\n/g' | tr -d '\n')",
  "keyTakeaway": "$(echo "$BLOG_TAKEAWAY" | sed 's/"/\\"/g')",
  "imageUrl": "$OG_IMAGE",
  "videoId": "$VIDEO_ID",
  "videoTitle": "$(echo "$VIDEO_TITLE" | sed 's/"/\\"/g')",
  "sourceUrl": "$SOURCE_URL",
  "sourceName": "$SOURCE_NAME",
  "tags": ${TAGS_JSON:-'["AI應用","效率提升"]'},
  "tools": ${TOOLS_JSON},
  "publishedAt": "$TIMESTAMP",
  "date": "$TODAY",
  "author": "AI Blog",
  "readTime": "5 min"
}
EOF
)

# Combine with existing posts (keep max 30 posts)
# FIX: Use a temp file to avoid shell escaping issues with NEW_POST
NEW_POST_FILE=$(mktemp)
echo "$NEW_POST" > "$NEW_POST_FILE"

UPDATED_POSTS=$(python3 <<PYEOF
import json, sys

try:
    with open('$NEW_POST_FILE', 'r') as f:
        new_post = json.load(f)
except Exception as e:
    print(f"ERROR: Failed to parse NEW_POST: {e}", file=sys.stderr)
    sys.exit(1)

try:
    existing = json.loads('''$EXISTING_POSTS''')
    if not isinstance(existing, list):
        existing = []
except Exception as e:
    print(f"WARNING: Failed to parse existing posts: {e}, starting fresh", file=sys.stderr)
    existing = []

# Add to beginning
existing.insert(0, new_post)
# Keep max 30 posts
existing = existing[:30]
print(json.dumps(existing, ensure_ascii=False))
PYEOF
)

rm -f "$NEW_POST_FILE"

# Validate UPDATED_POSTS is valid JSON before saving
if ! echo "$UPDATED_POSTS" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    echo "[$(date)] ERROR: Generated invalid JSON, aborting to prevent data loss"
    exit 1
fi

# Save to KV
SAVE_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${KV_KEY}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_POSTS" \
  --max-time 15)

if echo "$SAVE_RESPONSE" | grep -q '"success":true'; then
  echo "[$(date)] SUCCESS: Blog post saved to KV"
  echo "[$(date)] Title: $BLOG_TITLE"
  echo "[$(date)] Posts count: $(echo "$UPDATED_POSTS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))')"
else
  echo "[$(date)] ERROR: Failed to save to KV"
  echo "$SAVE_RESPONSE"
  exit 1
fi

# =============================================================================
# STEP 7: Log to PROJECT_LOG.md
# =============================================================================
echo "" >> PROJECT_LOG.md
echo "### $(date '+%Y-%m-%d %H:%M') | Blog Post Generated" >> PROJECT_LOG.md
echo "- **Title:** $BLOG_TITLE" >> PROJECT_LOG.md
echo "- **Source:** $SOURCE_NAME" >> PROJECT_LOG.md
echo "- **Video:** ${VIDEO_ID:-none}" >> PROJECT_LOG.md
echo "- **Method:** ${OLLAMA_AVAILABLE:-false} (Ollama)" >> PROJECT_LOG.md
echo "- **Tools:** ${TOOLS_LINE:-none}" >> PROJECT_LOG.md

echo "[$(date)] Done!"
