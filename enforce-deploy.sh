#!/bin/bash
# enforce-deploy-after-patch.sh — 強制 patch 後 deploy
# 這個腳本應該在每次 patch 後手動運行
# 或者集成到自動化流程中

set -e

PROJECT_DIR="/home/blackpi/ai-news-webapp"
WORKER_JS="$PROJECT_DIR/worker.js"
DEPLOY_HASH="$PROJECT_DIR/.deploy_hash"
DEPLOY_SCRIPT="$PROJECT_DIR/deploy.sh"

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  🔴  DEPLOY ENFORCEMENT HOOK"
echo "=========================================="
echo ""

# 檢查 worker.js 是否存在
if [ ! -f "$WORKER_JS" ]; then
    echo "${RED}❌ worker.js not found${NC}"
    exit 1
fi

# 計算當前 worker.js 的 hash
LOCAL_HASH=$(md5sum "$WORKER_JS" | awk '{print $1}')

# 檢查 .deploy_hash 是否存在
if [ ! -f "$DEPLOY_HASH" ]; then
    echo "${YELLOW}⚠️  No deployment record found${NC}"
    echo ""
    echo "${RED}🔴 MANDATORY: You MUST deploy now!${NC}"
    echo ""
    NEEDS_DEPLOY=1
else
    # 讀取已部署的 hash
    DEPLOYED_HASH=$(cat "$DEPLOY_HASH" | awk '{print $1}')
    
    if [ "$LOCAL_HASH" != "$DEPLOYED_HASH" ]; then
        echo "${YELLOW}Local hash:    $LOCAL_HASH${NC}"
        echo "${YELLOW}Deployed hash: $DEPLOYED_HASH${NC}"
        echo ""
        echo "${RED}🔴 MANDATORY: Local worker.js differs from deployed!${NC}"
        echo ""
        NEEDS_DEPLOY=1
    else
        echo "${GREEN}✅ Local worker.js matches deployed version${NC}"
        echo ""
        NEEDS_DEPLOY=0
    fi
fi

# 如果需要部署
if [ "$NEEDS_DEPLOY" = "1" ]; then
    # 檢查是否有改動描述文件（同 deploy.sh 一致）
    CHANGE_DESC_FILE="$PROJECT_DIR/.change_description"
    if [ ! -f "$CHANGE_DESC_FILE" ]; then
        echo "${RED}❌ 缺少改動描述文件: .change_description${NC}"
        echo ""
        echo "請先創建 .change_description，格式如下："
        echo "---"
        echo "TYPE: 新增功能|修復|優化|重構"
        echo "SUMMARY: 簡短描述"
        echo "DETAILS:"
        echo "  - 具體改動1"
        echo "  - 具體改動2"
        echo "---"
        echo ""
        exit 1
    fi
    
    echo ""
    echo "${RED}🔴 Running deploy.sh now...${NC}"
    echo ""
    
    if [ ! -f "$DEPLOY_SCRIPT" ]; then
        echo "${RED}❌ deploy.sh not found${NC}"
        exit 1
    fi
    
    cd "$PROJECT_DIR"
    ./deploy.sh
    
    echo ""
    echo "${GREEN}✅ Deploy complete!${NC}"
    
    # 額外驗證：檢查 /health endpoint
    echo ""
    echo "=== Verifying /health endpoint ==="
    HEALTH_HASH=$(curl -s "https://ai-news-digest.isearover.workers.dev/health" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    LOCAL_HASH=$(md5sum "$WORKER_JS" | awk '{print $1}')
    if [ "$HEALTH_HASH" = "$LOCAL_HASH" ]; then
        echo "${GREEN}✅ /health hash matches: $HEALTH_HASH${NC}"
    else
        echo "${YELLOW}⚠ /health hash: $HEALTH_HASH, local: $LOCAL_HASH${NC}"
    fi
else
    echo "${GREEN}✅ No deployment needed${NC}"
fi

echo ""
echo "=========================================="
