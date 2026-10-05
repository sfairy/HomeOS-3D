#!/bin/sh
# HomeOS 后端启动脚本（FastAPI / Python）。
#
# 用法：
#   sh deploy/run-backend.sh           # 启动 FastAPI/Python 后端
#
# 环境变量：
#   PORT             监听端口，缺省 8801（与 Caddy reverse_proxy homeos:8801 一致）
#   HOMEOS_ENV_FILE  额外 env 文件路径（缺省自动加载 backend/.env、.env）
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log() { printf '[run-backend] %s\n' "$*"; }

load_env() {
  for file in "$HOMEOS_ENV_FILE" "$ROOT/backend/.env" "$ROOT/.env"; do
    [ -n "${file:-}" ] || continue
    if [ -f "$file" ]; then
      log "加载环境变量：$file"
      set -a
      # shellcheck disable=SC1090
      . "$file"
      set +a
      break
    fi
  done
}

load_env
export PORT="${PORT:-8801}"

log "启动 FastAPI/Python 后端（PORT=$PORT）"
cd "$ROOT/backend"
exec python -m src.run
