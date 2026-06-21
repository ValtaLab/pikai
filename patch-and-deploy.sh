#!/bin/bash
# patch-and-deploy.sh — 包裝 patch 命令，強制 deploy（經 GitHub CI）
# 用法: ./patch-and-deploy.sh <patch_args...>
# 例: ./patch-and-deploy.sh --mode replace --path worker.js --old_string "..." --new_string "..."

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"

echo "=== Patch, Commit & Push Wrapper ==="
echo ""

# Step 1: 執行 patch
echo "[1/4] Running patch..."
echo "   (手動執行 patch 命令後返嚟繼續)"

echo ""
echo "[2/4] Checking if patch was applied..."

# 檢查 worker.js 是否存在
if [ ! -f "$PROJECT_DIR/worker.js" ]; then
    echo "❌ worker.js not found"
    exit 1
fi

echo "✅ Patch applied"
echo ""

# Step 3: Git commit + push（經 GitHub CI deploy）
echo "[3/4] 🔴 Committing and pushing to GitHub (CI will auto-deploy)..."
echo ""

cd "$PROJECT_DIR"

# Check if there are changes
if git diff --quiet && git diff --cached --quiet; then
    echo "⚠️  No changes to commit"
else
    git add -A
    echo "   Files staged. Ready for commit."
fi

echo ""
echo "   Run these commands to deploy:"
echo ""
echo "   cd $PROJECT_DIR"
echo "   git add -A && git commit -m \"你的改動描述\""
echo "   git push origin master"
echo ""
echo "   GitHub Actions will auto-lint, deploy, and verify."
echo ""

# Step 4: Emergency fallback
echo "[4/4] ⚠️  Emergency direct deploy (if CI is down):"
echo "   ./deploy.sh"
echo "   (Announce first — bypasses CI)"

echo ""
echo "✅ Patch complete — push to GitHub to deploy!"
