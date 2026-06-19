#!/bin/bash
# pre-patch-check.sh — 在 patch 前後自動檢查部署狀態
# 用法: 在 patch 命令後立即運行此腳本

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"
WORKER_JS="$PROJECT_DIR/worker.js"
DEPLOY_HASH="$PROJECT_DIR/.deploy_hash"

echo "=== Patch → Deploy Hook ==="
echo ""

# 檢查 worker.js 是否存在
if [ ! -f "$WORKER_JS" ]; then
    echo "❌ worker.js not found at $WORKER_JS"
    exit 1
fi

# 計算當前 worker.js 的 hash
LOCAL_HASH=$(md5sum "$WORKER_JS" | awk '{print $1}')
echo "Local worker.js hash:  $LOCAL_HASH"

# 檢查 .deploy_hash 是否存在
if [ ! -f "$DEPLOY_HASH" ]; then
    echo "⚠️  .deploy_hash not found — no deployment record"
    echo "   You MUST run ./deploy.sh after patching"
    exit 1
fi

# 讀取已部署的 hash
DEPLOYED_HASH=$(cat "$DEPLOY_HASH" | awk '{print $1}')
echo "Deployed hash:          $DEPLOYED_HASH"
echo ""

# 比較 hash
if [ "$LOCAL_HASH" != "$DEPLOYED_HASH" ]; then
    echo "🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴"
    echo ""
    echo "   ⚠️  WARNING: Local worker.js DIFFERS from deployed version!"
    echo ""
    echo "   You have UNPATCHED changes that are NOT deployed!"
    echo ""
    echo "   🔴 MANDATORY: Run ./deploy.sh NOW!"
    echo ""
    echo "   Command: cd /home/blackpi/ai-news-webapp && ./deploy.sh"
    echo ""
    echo "🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴"
    echo ""
    
    # 顯示差異時間
    DEPLOY_TIME=$(cat "$DEPLOY_HASH" | awk '{print $2 " " $3}')
    echo "   Last deployed: $DEPLOY_TIME"
    echo ""
    
    # 強制提示
    read -p "Press Enter to acknowledge (you MUST deploy after patch)..."
    
    exit 1
else
    echo "✅ Local worker.js matches deployed version"
    echo ""
    exit 0
fi
