#!/bin/bash
# 一键启动: 云端 Mock 服务器 + 桌面端开发模式
#
# 用法:
#   bash cloud-mock/start-dev.sh
#
# 效果:
#   1. 启动本地云端 Mock 在 :3900
#   2. 启动 Tauri 开发模式 (Vite + Rust)
#   3. 桌面端自动连接到 http://localhost:3900
#
# 退出: Ctrl+C 停止全部进程

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MOCK_PORT="${MOCK_PORT:-3900}"

cd "$PROJECT_DIR"

# 确保 mock 依赖已安装
if [ ! -d "cloud-mock/node_modules" ]; then
  echo "📦 安装 cloud-mock 依赖..."
  cd cloud-mock && npm install && cd ..
fi

echo "🚀 启动云端 Mock 服务器 (port $MOCK_PORT)..."
PORT=$MOCK_PORT node cloud-mock/server.mjs &
MOCK_PID=$!

# 等待 mock 服务器就绪
for i in {1..10}; do
  if curl -s "http://localhost:$MOCK_PORT/health" > /dev/null 2>&1; then
    echo "✓ Mock 服务器已就绪"
    break
  fi
  sleep 0.5
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Cloud Mock: http://localhost:$MOCK_PORT"
echo "  测试账户: admin / admin123"
echo "  Debug Cloud URL: VITE_CLOUD_BASE_URL=http://localhost:$MOCK_PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动 Tauri 开发模式 (debug 编译时注入本地 Mock URL)
echo "🖥️  启动 Tauri 开发模式..."
# bindgen/libspa 在部分环境下找不到 gcc 内置头 (stdbool.h)
GCC_INCLUDE="$(gcc -print-file-name=include 2>/dev/null || true)"
if [ -n "$GCC_INCLUDE" ] && [ -d "$GCC_INCLUDE" ]; then
  export BINDGEN_EXTRA_CLANG_ARGS="${BINDGEN_EXTRA_CLANG_ARGS:-} -I${GCC_INCLUDE}"
fi
VITE_CLOUD_BASE_URL="http://localhost:$MOCK_PORT" \
  BINDGEN_EXTRA_CLANG_ARGS="${BINDGEN_EXTRA_CLANG_ARGS:-}" \
  npm run tauri dev &
TAURI_PID=$!

# 捕获退出信号，清理子进程
cleanup() {
  echo ""
  echo "🛑 停止所有服务..."
  kill $MOCK_PID 2>/dev/null || true
  kill $TAURI_PID 2>/dev/null || true
  wait
  echo "✓ 已停止"
}
trap cleanup EXIT INT TERM

# 等待任意子进程退出
wait
