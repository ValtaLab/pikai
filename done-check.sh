#!/bin/bash
# ============================================================
# done-check.sh — 完成聲稱閘門
# 
# 強制驗證機制：喺講「完成」「done」「搞掂」之前必須先 run
# 呢個 script。如果驗證唔 pass，就唔可以話「完成」。
#
# Usage:
#   ./done-check.sh                ← 基本 check（project root 自動 detect）
#   ./done-check.sh --project /path   ← 指定 project
#   ./done-check.sh --verbose      ← 詳細輸出
#
# Exit codes:
#   0 = ✅ 所有驗證通過（可以話完成）
#   1 = ❌ 驗證失敗（唔准話完成）
#   2 = ⚠️ 部分警告（可以完成但要留意）
# ============================================================
set -e

# === Config ===
VERBOSE=false
PROJECT_DIR=""
VERIFY_MANIFEST=".browser_verify_result.json"
VERIFY_FILE=".browser_verify_pending"
SCREENSHOT_DIR="$HOME/.hermes/verify-screenshots"

# === Parse args ===
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_DIR="$2"; shift 2 ;;
    --verbose) VERBOSE=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# === Auto-detect project root ===
if [ -z "$PROJECT_DIR" ]; then
  # Try current dir
  if [ -f "./deploy.sh" ] && [ -f "./PROJECT_LOG.md" ]; then
    PROJECT_DIR="."
  elif [ -f "../deploy.sh" ] && [ -f "../PROJECT_LOG.md" ]; then
    PROJECT_DIR=".."
  elif [ -f "/home/blackpi/ai-news-webapp/deploy.sh" ]; then
    PROJECT_DIR="/home/blackpi/ai-news-webapp"
  else
    echo "❌ 無法自動 detect project root，請用 --project 指定"
    exit 1
  fi
fi

cd "$PROJECT_DIR"

# === Check 1: Verification manifest exists ===
PASSED=true
WARNINGS=false

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     🔍 DONE CHECK — 完成聲稱驗證閘門        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

if [ -f "$VERIFY_MANIFEST" ]; then
  echo "✅ [1/5] Verification manifest found: $VERIFY_MANIFEST"
else
  echo "❌ [1/5] Verification manifest NOT FOUND: $VERIFY_MANIFEST"
  echo "    deploy.sh 應該會自動生成呢個檔案"
  PASSED=false
fi

# === Check 2: Browser verification passed ===
if [ -f "$VERIFY_MANIFEST" ]; then
  VERIFY_PASSED=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print('true' if d.get('passed') else 'false')" 2>/dev/null || echo "unknown")
  if [ "$VERIFY_PASSED" = "true" ]; then
    echo "✅ [2/5] Browser verification: PASSED"
  elif [ "$VERIFY_PASSED" = "false" ]; then
    echo "❌ [2/5] Browser verification: FAILED"
    echo "    Check $VERIFY_MANIFEST for details"
    echo "    Console errors: $(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(len(d.get('console_errors',[])))" 2>/dev/null || echo "?")"
    PASSED=false
  else
    echo "⚠️  [2/5] Browser verification: UNKNOWN (can't read manifest)"
    WARNINGS=true
  fi
fi

# === Check 3: Screenshot exists ===
if [ -f "$VERIFY_MANIFEST" ]; then
  SCREENSHOT_PATH=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(d.get('screenshot_path',''))" 2>/dev/null || echo "")
  if [ -n "$SCREENSHOT_PATH" ] && [ -f "$SCREENSHOT_PATH" ]; then
    echo "✅ [3/5] Screenshot exists: $(basename $SCREENSHOT_PATH)"
  elif [ -n "$SCREENSHOT_PATH" ]; then
    echo "⚠️  [3/5] Screenshot path set but file missing: $SCREENSHOT_PATH"
    WARNINGS=true
  else
    echo "⚠️  [3/5] No screenshot taken"
    WARNINGS=true
  fi
fi

# === Check 4: HTTP status OK ===
if [ -f "$VERIFY_MANIFEST" ]; then
  HTTP_STATUS=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(d.get('http_status','unknown'))" 2>/dev/null || echo "unknown")
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    echo "✅ [4/5] HTTP status: $HTTP_STATUS"
  elif [ "$HTTP_STATUS" != "unknown" ]; then
    echo "❌ [4/5] HTTP status: $HTTP_STATUS (expected 200)"
    PASSED=false
  else
    echo "⚠️  [4/5] HTTP status: unknown"
    WARNINGS=true
  fi
fi

# === Check 5: Content check passed ===
if [ -f "$VERIFY_MANIFEST" ]; then
  CONTENT_FOUND=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print('true' if d.get('content_check',{}).get('found') else 'false')" 2>/dev/null || echo "unknown")
  CHECK_TEXT=$(python3 -c "import json; d=json.load(open('$VERIFY_MANIFEST')); print(d.get('content_check',{}).get('text',''))" 2>/dev/null || echo "")
  if [ "$CONTENT_FOUND" = "true" ]; then
    echo "✅ [5/5] Content check PASSED: \"$CHECK_TEXT\" found on page"
  elif [ "$CONTENT_FOUND" = "false" ]; then
    echo "❌ [5/5] Content check FAILED: \"$CHECK_TEXT\" NOT found on page"
    PASSED=false
  else
    echo "⚠️  [5/5] Content check: unknown"
    WARNINGS=true
  fi
fi

# === Check for pending browser verify file ===
if [ -f "$VERIFY_FILE" ]; then
  echo ""
  echo "🔴 WARNING: $VERIFY_FILE exists — 有一次 deploy 未經驗證！"
  echo "    下次 deploy 會被 block，直到 browser verification 完成"
  WARNINGS=true
fi

# === Summary ===
echo ""
echo "═══════════════════════════════════════════════"
if [ "$PASSED" = true ] && [ "$WARNINGS" = false ]; then
  echo " ✅ PASSED — 可以話「完成」"
  exit 0
elif [ "$PASSED" = true ] && [ "$WARNINGS" = true ]; then
  echo " ⚠️  PASSED with warnings — 可以話完成但要留意"
  echo "    檢查上述 warning 再決定"
  exit 2
else
  echo " ❌ FAILED — 唔准話「完成」！"
  echo "    解決問題後再 run done-check.sh"
  exit 1
fi
