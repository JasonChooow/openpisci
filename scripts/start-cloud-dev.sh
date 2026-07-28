#!/bin/bash
# 一键启动: 真实云端后端 (website/backend) + 桌面端开发模式
#
# 用法:
#   bash scripts/start-cloud-dev.sh
#   npm run cloud:dev
#
# 效果:
#   1. 启动 FastAPI 真实网关 :8137 (SQLite 本地库)
#   2. 启动 Tauri 开发模式，Cloud URL 指向该网关
#
# 可选仍用 Mock: npm run cloud:dev:mock

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/website/backend"
CLOUD_PORT="${MARKET_PORT:-8137}"
CLOUD_URL="http://localhost:${CLOUD_PORT}"

cd "$PROJECT_DIR"

# 确保 backend 依赖可用
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "📦 创建 backend venv 并安装依赖..."
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_DIR/.venv/bin/pip" install -e "$BACKEND_DIR[db,dev]"
fi

mkdir -p "$BACKEND_DIR/var"

echo "🚀 启动真实云端后端 (port $CLOUD_PORT)..."
(
  cd "$BACKEND_DIR"
  MARKET_PORT="$CLOUD_PORT" \
  MARKET_DEV_ENDPOINTS=1 \
  "$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "$CLOUD_PORT" \
    --reload
) &
BACKEND_PID=$!

for i in {1..40}; do
  if curl -s "$CLOUD_URL/healthz" >/dev/null 2>&1 || curl -s "$CLOUD_URL/api/health" >/dev/null 2>&1 || curl -s "$CLOUD_URL/docs" >/dev/null 2>&1; then
    echo "✓ 真实云端后端已就绪: $CLOUD_URL"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "✗ 后端进程已退出，请检查日志"
    exit 1
  fi
  sleep 0.5
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  真实云端: $CLOUD_URL"
echo "  API 文档: $CLOUD_URL/docs"
echo "  测试账户: admin / admin123"
echo "  注册页面: $CLOUD_URL/api/auth/register"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

GCC_INCLUDE="$(gcc -print-file-name=include 2>/dev/null || true)"
if [ -n "$GCC_INCLUDE" ] && [ -d "$GCC_INCLUDE" ]; then
  export BINDGEN_EXTRA_CLANG_ARGS="${BINDGEN_EXTRA_CLANG_ARGS:-} -I${GCC_INCLUDE}"
fi

echo "🖥️  启动 Tauri 开发模式..."
VITE_CLOUD_BASE_URL="$CLOUD_URL" npm run tauri dev &
TAURI_PID=$!

cleanup() {
  echo ""
  echo "🛑 停止所有服务..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$TAURI_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✓ 已停止"
}
trap cleanup EXIT INT TERM

wait
