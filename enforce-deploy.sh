#!/bin/bash
# enforce-deploy-after-patch.sh — 強制 patch 後 deploy（經 GitHub CI）
# 用法：patch worker.js 後手動運行此腳本

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"
WORKER_JS="$PROJECT_DIR/worker.js"
GIT_DIR="$PROJECT_DIR"

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  🔴  DEPLOY ENFORCEMENT HOOK"
echo "  (GitHub CI / push 模式)"
echo "=========================================="
echo ""

# 檢查 worker.js 是否存在
if [ ! -f "$WORKER_JS" ]; then
    echo "${RED}❌ worker.js not found${NC}"
    exit 1
fi

echo "${GREEN}✅ worker.js exists${NC}"
echo ""

# 檢查是否有未 commit 嘅改動
cd "$GIT_DIR"
if git diff --quiet && git diff --cached --quiet; then
    echo "${GREEN}✅ No uncommitted changes${NC}"
    echo ""
    exit 0
else
    echo "${YELLOW}⚠️  Uncommitted changes detected${NC}"
    echo ""
    echo "${RED}🔴 MANDATORY: You MUST push to GitHub now!${NC}"
    echo ""
    echo "   Commands:"
    echo "     cd $PROJECT_DIR"
    echo "     git add -A"
    echo "     git commit -m \"你的改動描述\""
    echo "     git push origin master"
    echo ""
    echo "   GitHub Actions 會自動 lint + deploy + verify"
    echo "   URL: https://pikai.isearover.workers.dev"
    echo ""
    echo "=========================================="
    echo ""
    echo "⚠️  Emergency fallback (CI down only):"
    echo "   ./deploy.sh"
    echo ""
    exit 1
fi
