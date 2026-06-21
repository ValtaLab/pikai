#!/bin/bash
# pre-patch-check.sh — patch 後必須 deploy（經 GitHub CI）
# 用法: patch worker.js 後運行此腳本檢查

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"
WORKER_JS="$PROJECT_DIR/worker.js"

echo "=== Patch → Push to GitHub (CI Deploy) Hook ==="
echo ""

# 檢查 worker.js 是否存在
if [ ! -f "$WORKER_JS" ]; then
    echo "❌ worker.js not found at $WORKER_JS"
    exit 1
fi

echo "✅ worker.js exists"
echo ""

cd "$PROJECT_DIR"

# 檢查是否有未 commit 嘅改動
if git diff --quiet && git diff --cached --quiet; then
    echo "✅ No uncommitted changes — deploy is up to date"
    exit 0
else
    echo "🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴"
    echo ""
    echo "   ⚠️  WARNING: Uncommitted changes to worker.js!"
    echo ""
    echo "   🔴 MANDATORY: Push to GitHub NOW!"
    echo ""
    echo "   Command:"
    echo "     cd $PROJECT_DIR"
    echo "     git add -A && git commit -m '描述改動'"
    echo "     git push origin master"
    echo ""
    echo "   GitHub Actions 會自動 deploy"
    echo ""
    echo "🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴"
    echo ""

    exit 1
fi
