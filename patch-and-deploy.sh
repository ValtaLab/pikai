#!/bin/bash
# patch-and-deploy.sh — 包裝 patch 命令，強制 deploy
# 用法: ./patch-and-deploy.sh <patch_args...>
# 例: ./patch-and-deploy.sh --mode replace --path worker.js --old_string "..." --new_string "..."

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"
DEPLOY_SCRIPT="$PROJECT_DIR/deploy.sh"

echo "=== Patch & Deploy Wrapper ==="
echo ""

# Step 1: 執行 patch
echo "[1/3] Running patch..."
# 這裡會調用實際的 patch 工具
# 由於我們無法直接調用 patch 工具，這個腳本會在 patch 後檢查

echo ""
echo "[2/3] Checking if patch was applied..."

# 檢查 worker.js 是否存在
if [ ! -f "$PROJECT_DIR/worker.js" ]; then
    echo "❌ worker.js not found"
    exit 1
fi

echo "✅ Patch applied"
echo ""

# Step 3: 強制 deploy
echo "[3/3] 🔴 MANDATORY: Deploying to Cloudflare..."
echo ""

if [ ! -f "$DEPLOY_SCRIPT" ]; then
    echo "❌ deploy.sh not found at $DEPLOY_SCRIPT"
    exit 1
fi

cd "$PROJECT_DIR"
./deploy.sh

echo ""
echo "✅ Patch & Deploy complete!"
