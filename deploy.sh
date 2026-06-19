#!/bin/bash
# deploy.sh — Lint, inject hash, deploy, verify with /health, restore placeholder
set -e

cd /home/blackpi/ai-news-webapp

# ========================
# Gate: browser verification required from previous deploy
# ========================
VERIFY_FILE=".browser_verify_pending"
VERIFY_MANIFEST=".browser_verify_result.json"
if [ -f "$VERIFY_FILE" ]; then
  PREV_URL=$(cat "$VERIFY_FILE" 2>/dev/null || echo "https://pikai.isearover.workers.dev")
  # Check if previous verification manifest exists and passed
  if [ -f "$VERIFY_MANIFEST" ]; then
    PREV_PASSED=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print('true' if d.get('passed') else 'false')" 2>/dev/null || echo "false")
    if [ "$PREV_PASSED" = "true" ]; then
      echo "✓ Previous deploy browser verification passed — continuing"
      rm -f "$VERIFY_FILE"
    else
      echo ""
      echo "========================================================"
      echo "🔴  PREVIOUS DEPLOY BROWSER VERIFICATION FAILED"
      echo "========================================================"
      echo ""
      echo "Check $VERIFY_MANIFEST for details."
      echo "Fix issues, then rm $VERIFY_FILE"
      echo "========================================================"
      exit 1
    fi
  else
    echo ""
    echo "========================================================"
    echo "🔴  BROWSER VERIFICATION PENDING FROM PREVIOUS DEPLOY"
    echo "========================================================"
    echo ""
    echo "Previous deploy hasn't been browser-verified yet."
    echo ""
    echo "Run these commands FIRST, then delete $VERIFY_FILE:"
    echo ""
    echo "  browser_navigate($PREV_URL)"
    echo "  browser_console"
    echo "  browser_vision"
    echo ""
    echo "Then: rm $VERIFY_FILE"
    echo "========================================================"
    exit 1
  fi
fi

# ========================
# 0. Git sync — 確保本地代碼最新
# ========================
echo ""
echo "=== Git Sync ==="

# Fetch + pull to ensure we have the latest
if git fetch origin 2>/dev/null; then
  LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  REMOTE_COMMIT=$(git rev-parse origin/ai-news 2>/dev/null || echo "unknown")

  if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ] && [ "$REMOTE_COMMIT" != "unknown" ]; then
    echo "⚠ 本地落後於遠端！"
    echo "   本地: $LOCAL_COMMIT"
    echo "   遠端: $REMOTE_COMMIT"
    echo ""
    echo "   執行 git pull --rebase 先..."
    git pull --rebase || {
      echo "❌ git pull 失敗，可能有 conflict。先解決再 deploy。"
      exit 1
    }
    echo "✓ 已同步到最新"
  fi
else
  echo "⚠ git fetch 失敗（離線或 token 過期），跳過遠端同步"
  echo "   繼續用本地代碼 deploy"
fi

# Check for uncommitted changes to worker.js
if ! git diff --quiet worker.js 2>/dev/null; then
  echo "⚠ worker.js 有未提交嘅改動"
fi

echo "✓ 本地代碼已確認最新 ($LOCAL_COMMIT)"

# ========================
# 1. Pre-deploy compliance check
# ========================
echo ""
echo "=== Pre-deploy Check ==="

CHANGE_DESC_FILE=".change_description"
LAST_HASH_FILE=".last_deploy_hash"
CURRENT_HASH=$(md5sum worker.js | awk '{print $1}')

# Check if anything changed since last deploy
if [ -f "$LAST_HASH_FILE" ]; then
  LAST_HASH=$(cat "$LAST_HASH_FILE" | awk '{print $1}')
  if [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
    echo "❌ worker.js 冇改動（hash: $CURRENT_HASH）"
    echo "   上次部署已經係同一個版本，唔需要重新 deploy"
    exit 1
  fi
  echo "✓ 偵測到改動: $LAST_HASH → $CURRENT_HASH"
else
  echo "⚠ 冇上次部署記錄，繼續..."
fi

# Require fresh .change_description (must not be from last deploy)
if [ ! -f "$CHANGE_DESC_FILE" ]; then
  echo "❌ 缺少改動描述文件: $CHANGE_DESC_FILE"
  echo ""
  echo "請先創建 $CHANGE_DESC_FILE，格式如下（純文字，每行一項）："
  echo "---"
  echo "新增功能|修復|優化|重構"
  echo "簡短描述這次改動"
  echo "詳細說明，可以有多行"
  echo "  - 具體改動1"
  echo "  - 具體改動2"
  echo "---"
  echo ""
  exit 1
fi

# Read .change_description: line 1 = type, line 2 = summary, line 3+ = details
TYPE=$(sed -n '1p' "$CHANGE_DESC_FILE" | xargs)
SUMMARY=$(sed -n '2p' "$CHANGE_DESC_FILE" | xargs)
DETAILS=$(sed -n '3,$p' "$CHANGE_DESC_FILE")

if [ -z "$TYPE" ] || [ -z "$SUMMARY" ]; then
  echo "❌ 改動描述格式錯誤，請檢查 $CHANGE_DESC_FILE"
  echo "第一行必須是類型，第二行必須是摘要"
  exit 1
fi

if [ -z "$DETAILS" ]; then
  echo "❌ 缺少改動詳情，請檢查 $CHANGE_DESC_FILE"
  echo "第三行起必須有詳細內容（Details）"
  echo "格式：第1行=類型, 第2行=摘要, 第3行起=詳情"
  exit 1
fi

echo "✓ 改動類型: $TYPE"
echo "✓ 改動摘要: $SUMMARY"

# ========================
# 2. Lint & build
# ========================
echo ""
echo "=== Linting worker.js ==="
npx eslint worker.js || { echo "Lint failed — fix errors first"; exit 1; }

echo ""
echo "=== Injecting deploy hash ==="
DEPLOY_HASH=$(md5sum worker.js | awk '{print $1}')
sed -i "s/DEPLOY_HASH_PLACEHOLDER/$DEPLOY_HASH/g" worker.js
echo "Deploy hash: $DEPLOY_HASH"

# ========================
# 3. Deploy to Cloudflare
# ========================
echo ""
echo "=== Uploading blog-posts.json to KV ==="
# Source token from .bashrc if not set
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f ~/.bashrc ]; then
  export $(grep CLOUDFLARE_API_TOKEN ~/.bashrc | sed "s/export //; s/'//g")
fi

CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" npx wrangler kv key put blog-posts --path=blog-posts.json --namespace-id=b8dfffba53d249e2a6a73e60774217d5 --remote 2>&1 || { echo "KV upload failed"; exit 1; }
echo "✓ Blog posts uploaded to KV"

echo ""
echo "=== Deploying to Cloudflare Workers ==="
# Source token from .bashrc if not set
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f ~/.bashrc ]; then
  export $(grep CLOUDFLARE_API_TOKEN ~/.bashrc | sed "s/export //; s/'//g")
fi

CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" npx wrangler deploy 2>&1

# ========================
# 4. Post-deploy /health verification
# ========================
echo ""
echo "=== Testing with /health endpoint ==="
HEALTH_CHECK=$(curl -s "https://pikai.isearover.workers.dev/health")
if echo "$HEALTH_CHECK" | grep -q "$DEPLOY_HASH"; then
  echo "✓ /health returns correct deploy hash — deployment verified"
else
  echo "❌ /health hash mismatch"
  echo "   Expected: $DEPLOY_HASH"
  echo "   Got: $HEALTH_CHECK"
  exit 1
fi

echo ""
echo "=== Restoring placeholder ==="
sed -i "s/${DEPLOY_HASH}/DEPLOY_HASH_PLACEHOLDER/g" worker.js

# ========================
# 5. Update PROJECT_LOG.md
# ========================
echo ""
echo "=== Updating PROJECT_LOG.md ==="

VERSION=$(git describe --tags --always 2>/dev/null || date +%Y%m%d-%H%M%S)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

# Append new entry
cat >> PROJECT_LOG.md << EOF

## ${TIMESTAMP}
- **Type**: ${TYPE}
- **Summary**: ${SUMMARY}
- **Details**:
${DETAILS}
- **Version**: ${VERSION}
EOF

# Update frontmatter
sed -i "s/^last_deploy:.*/last_deploy: $(date -Iseconds)/" PROJECT_LOG.md
sed -i "s/^last_version:.*/last_version: ${VERSION}/" PROJECT_LOG.md
sed -i "s/^local_hash:.*/local_hash: ${DEPLOY_HASH}/" PROJECT_LOG.md
sed -i "s/\*最後更新:.*/\*最後更新: $(date '+%Y-%m-%d %H:%M HKT') by HermesBPi\*/" PROJECT_LOG.md

echo "✓ PROJECT_LOG.md updated (version: ${VERSION})"

# ========================
# 6. Web app self-verification
# ========================
echo ""
echo "=== Web app self-verification ==="
URL="https://pikai.isearover.workers.dev"

if curl -s "${URL}?refresh=1" | grep -q "PikAI"; then
  echo "✓ Web app responds with expected content"
else
  echo "❌ Web app verification FAILED — 'PikAI' not found in response"
  echo "   URL: ${URL}?refresh=1"
  exit 1
fi

# Additional: check page renders with key sections
if curl -s "${URL}?refresh=1" | grep -q "今日必讀"; then
  echo "✓ Content sections present"
else
  echo "❌ Content sections missing — '今日必讀' not found"
  echo "   URL: ${URL}?refresh=1"
  exit 1
fi

# ========================
# 7. Cleanup & finalize
# ========================
echo ""
echo "=== Finalizing ==="

# Update .deploy_hash and .last_deploy_hash
echo "${DEPLOY_HASH} $(date -Iseconds) ${VERSION}" > .deploy_hash
echo "${DEPLOY_HASH}" > "$LAST_HASH_FILE"
echo "✓ .deploy_hash + .last_deploy_hash updated"

# Git commit (exclude .change_description — it's in .gitignore)
# Write deploy marker so pre-commit hook allows this commit
echo "${DEPLOY_HASH} $(date -Iseconds)" > .deploy_ok
git add worker.js deploy.sh PROJECT_LOG.md .deploy_hash .gitignore 2>/dev/null || true
git add . 2>/dev/null || true
if git diff --cached --quiet; then
  echo "⚠ No changes to commit"
else
  git commit -m "deploy: ${TIMESTAMP} ${VERSION} — ${DEPLOY_HASH}" 2>/dev/null || echo "⚠ Git commit failed (maybe no git repo)"
  echo "✓ Git committed"
fi

# Delete .change_description and .deploy_ok
rm -f "$CHANGE_DESC_FILE"
rm -f .deploy_ok
echo "✓ Cleaned up $CHANGE_DESC_FILE and .deploy_ok"

# ========================
# 8. Browser verification (headless Chromium)
# ========================
echo ""
echo "=== Headless browser verification ==="
URL="https://pikai.isearover.workers.dev"
BROWSER_SCRIPT="$HOME/.hermes/scripts/verify-browser.py"
VERIFY_MANIFEST=".browser_verify_result.json"

if [ -f "$BROWSER_SCRIPT" ]; then
  echo "Running Playwright browser verification..."
  python3 "$BROWSER_SCRIPT" "$URL" \
    --check-text "今日必讀" \
    --manifest "$VERIFY_MANIFEST" \
    2>&1
  
  # Read result
  if [ -f "$VERIFY_MANIFEST" ]; then
    PASSED=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print('true' if d.get('passed') else 'false')")
    SCREENSHOT=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(d.get('screenshot_path', ''))")
    JS_ERRORS=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(len(d.get('console_errors', [])))")
    
    if [ "$PASSED" = "true" ]; then
      echo "✅ Browser verification PASSED"
      echo "   Screenshot: $SCREENSHOT"
      echo "   JS errors: $JS_ERRORS"
    else
      echo "❌ Browser verification FAILED"
      echo "   See $VERIFY_MANIFEST for details"
      # Don't exit 1 here — manifest is saved, deploy is already done
      # but mark it for next deploy's gate
      echo "$URL" > "$VERIFY_FILE"
    fi
  fi
else
  echo "⚠ Browser verification script not found: $BROWSER_SCRIPT"
  echo "  Creating manual verification gate instead."
  echo "$URL" > "$VERIFY_FILE"
fi

# ========================
# 9. Final done-check
# ========================
echo ""
echo "=== Final done-check ==="
if [ -f "./done-check.sh" ]; then
  bash ./done-check.sh || true  # don't fail deploy, just report
else
  echo "⚠ done-check.sh not found — skipping"
fi

echo ""
echo "========================================================"
if [ -f "$VERIFY_MANIFEST" ]; then
  VERIFY_PASSED=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print('true' if d.get('passed') else 'false')" 2>/dev/null || echo "unknown")
  if [ "$VERIFY_PASSED" = "true" ]; then
    echo "✅  DEPLOY COMPLETE — All verification checks passed"
    echo "========================================================"
  else
    echo "⚠️  DEPLOY COMPLETE — Browser verification flagged warnings"
    echo "    Run ./done-check.sh for details"
    echo "========================================================"
  fi
else
  echo "⚠️  DEPLOY COMPLETE — Manual verification may be needed"
  echo "========================================================"
fi
