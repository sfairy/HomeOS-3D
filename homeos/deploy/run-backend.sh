#!/usr/bin/env bash
# 源码态启动主应用后端（非 Docker 生产路径）。
# Docker 部署请用仓库根的编排文件：docker-compose.yml（管理员这台：商店 + 主应用）、
# docker-compose.app.yml（客户机：只有主应用）
#
# 用法：
#   bash deploy/run-backend.sh         # 或：bun run --cwd homeos start:prod
#
# 为什么是 bash 而不是 sh：`set -o pipefail` 不是 POSIX，dash（Debian 系 /bin/sh）会直接
# 报「Illegal option」并退出 —— 用 `sh 本脚本` 调用时 shebang 被忽略，脚本当场失效。
# 冒烟里的一条管线（`... | head`）在没有 pipefail 时会把上游失败吞掉，所以这行是必须的。
#
# 环境变量：
#   PORT             监听端口，缺省 8801（与镜像内置反代 :8803 → 127.0.0.1:8801 一致）
#   HOMEOS_ENV_FILE  额外 env 文件路径（缺省自动加载 backend/.env、.env）
set -euo pipefail

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
