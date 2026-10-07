#!/usr/bin/env bash
# HomeOS Docker Compose 一键部署（Linux / 飞牛 NAS / macOS）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CADDY_DIR="$ROOT/deploy/caddy"
CADDYFILE="$CADDY_DIR/Caddyfile"

log() { printf '[deploy] %s\n' "$*"; }
log_err() { printf '[deploy] ERROR: %s\n' "$*" >&2; }
die() { log_err "$@"; exit 1; }

ensure_layout() {
  [[ -f "$ROOT/deploy/init-layout.sh" ]] || die "缺少 deploy/init-layout.sh（请使用完整部署包或仓库根目录）"
  HOMEOS_DEPLOY_ROOT="$ROOT" sh "$ROOT/deploy/init-layout.sh"
}

detect_lan_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}')"
  elif command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  [[ -n "$ip" && "$ip" != "127.0.0.1" ]] && printf '%s' "$ip" || printf '%s' "192.168.1.100"
}

write_env_interactive() {
  [[ -f "$ROOT/.env" ]] && die ".env 已存在，请手动编辑或删除后重试"

  local host_ip ha_url ha_token
  local default_ip
  default_ip="$(detect_lan_ip)"

  printf '未找到 .env，交互式生成（直接回车使用默认值）\n'
  read -r -p "HOST_IP [$default_ip]: " host_ip
  host_ip="${host_ip:-$default_ip}"

  read -r -p "HA_URL [http://${host_ip}:8123]: " ha_url
  ha_url="${ha_url:-http://${host_ip}:8123}"

  read -r -p "HA_TOKEN (Home Assistant 长期令牌): " ha_token
  [[ -n "$ha_token" ]] || die "HA_TOKEN 不能为空"

  cat >"$ROOT/.env" <<EOF
# 由 scripts/deploy.sh 生成
HOST_IP=${host_ip}
HA_URL=${ha_url}
HA_TOKEN=${ha_token}
# POSTGRES_PASSWORD / REDIS_PASSWORD 留空：首次启动自动写入 ./secrets/
HOMEOS_HARDENED=1
COOKIE_SECURE=auto
HTTPS_PORT=8443
HTTP_PORT=8126
EOF
  log "已写入 .env（数据库/Redis 口令将在首次 Compose 启动时生成到 ./secrets/）"
}

check_compose() {
  command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装 Docker"
  docker compose version >/dev/null 2>&1 || die "未找到 docker compose v2"
}

warn_env() {
  if [[ -f "$ROOT/.env" ]]; then
    return
  fi
  if [[ -z "${HOST_IP:-}" || -z "${HA_URL:-}" || -z "${HA_TOKEN:-}" ]]; then
    log "提示：未检测到 .env 或 HOST_IP/HA_URL/HA_TOKEN 环境变量"
    log "  飞牛 NAS：在 Compose 项目「环境变量」中填写上述三项"
    log "  本地：运行 bash scripts/deploy.sh up --interactive"
  fi
}

wait_healthy() {
  local url="${1:-http://127.0.0.1:${HTTP_PORT:-8126}/health}"
  local max="${2:-120}"
  log "等待 HomeOS 健康检查：$url（最多 ${max}s）…"
  local i=0
  while (( i < max )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "HomeOS 已就绪"
      return 0
    fi
    sleep 2
    (( i += 2 )) || true
  done
  log_err "超时：请执行 docker compose logs homeos 查看日志"
  return 1
}

cmd_init() {
  ensure_layout
  log "初始化完成。下一步：配置 .env 或飞牛面板环境变量后执行 bash scripts/deploy.sh up"
}

cmd_up() {
  local interactive=0
  local skip_wait=0
  local extra=()

  while (($#)); do
    case "$1" in
      --interactive|-i) interactive=1; shift ;;
      --no-wait) skip_wait=1; shift ;;
      *) extra+=("$1"); shift ;;
    esac
  done

  check_compose
  ensure_layout

  if (( interactive )); then
    write_env_interactive
  else
    warn_env
  fi

  log "启动 Docker Compose…"
  docker compose up -d --remove-orphans "${extra[@]}"

  if (( skip_wait )); then
    return 0
  fi

  # shellcheck disable=SC1091
  [[ -f "$ROOT/.env" ]] && set -a && source "$ROOT/.env" && set +a
  wait_healthy "http://127.0.0.1:${HTTP_PORT:-8126}/health" 120 || true

  local ip="${HOST_IP:-<NAS_IP>}"
  log "部署完成"
  log "  HTTPS（推荐，支持电量采集）: https://${ip}:${HTTPS_PORT:-8443}"
  log "  HTTP（备用）:                 http://${ip}:${HTTP_PORT:-8126}"
  if [[ -s "$ROOT/secrets/postgres_password" ]]; then
    log "  数据库/Redis 口令已写入 ./secrets/（请备份该目录）"
  fi
}

cmd_down() {
  check_compose
  docker compose down "$@"
}

cmd_pull() {
  check_compose
  docker compose pull
  docker compose up -d --remove-orphans
  log "镜像已更新并重启"
}

cmd_bundle() {
  ensure_layout
  local version out tmp
  version="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
  out="$ROOT/homeos-deploy-${version}.zip"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  local name="homeos-deploy"
  local stage="$tmp/$name"
  mkdir -p "$stage/deploy/caddy" "$stage/assets/backgrounds" "$stage/assets/icons" "$stage/assets/logo" "$stage/assets/sounds" "$stage/backups" "$stage/secrets" "$stage/scripts"

  cp "$ROOT/docker-compose.yml" "$stage/"
  cp "$ROOT/.env.docker.example" "$stage/"
  cp "$ROOT/deploy/init-layout.sh" "$stage/deploy/"
  [[ -f "$ROOT/deploy/ensure-secrets.sh" ]] && cp "$ROOT/deploy/ensure-secrets.sh" "$stage/deploy/"
  cp "$CADDYFILE" "$stage/deploy/caddy/Caddyfile"
  cp "$ROOT/scripts/deploy.sh" "$stage/scripts/"
  chmod +x "$stage/scripts/deploy.sh" "$stage/deploy/init-layout.sh"
  [[ -f "$stage/deploy/ensure-secrets.sh" ]] && chmod +x "$stage/deploy/ensure-secrets.sh"
  touch "$stage/assets/backgrounds/.gitkeep" "$stage/assets/icons/.gitkeep" "$stage/assets/logo/.gitkeep" "$stage/assets/sounds/.gitkeep" "$stage/backups/.gitkeep"

  cat >"$stage/README-deploy.txt" <<EOF
HomeOS 部署包 v${version}

飞牛 NAS：
  1. 解压到英文路径，如 /vol1/docker/homeos
  2. 在飞牛 Docker → Compose 新建项目，路径选本目录
  3. 设置环境变量 HOST_IP、HA_URL、HA_TOKEN 后启动
     （POSTGRES_PASSWORD / REDIS_PASSWORD 可留空，全新部署自动写入 ./secrets/）
     （请备份 ./secrets/；数据卷首次初始化后密码锁定，改 env 不会改卷内密码）
     （HOMEOS_HARDENED 默认 1；生产使用 MCP 须另设 MCP_GATEWAY_ALLOW_IPS）
  可选：bash scripts/deploy.sh up --interactive 生成本地 .env

访问：
  HTTPS https://<NAS_IP>:8443
  HTTP  http://<NAS_IP>:8126
EOF

  rm -f "$out"
  if command -v zip >/dev/null 2>&1; then
    (cd "$tmp" && zip -rq "$out" "$name")
  else
    out="${out%.zip}.tar.gz"
    tar -czf "$out" -C "$tmp" "$name"
  fi

  log "已生成部署包：$out"
}

cmd_logs() {
  local service="${1:-homeos}"
  docker compose logs -f --tail=200 "$service"
}

cmd_help() {
  cat <<EOF
用法: bash scripts/deploy.sh <命令> [选项]

命令:
  init              创建 assets/、backups/、secrets/、deploy/caddy/Caddyfile（修复误建目录）
  up [-i] [--no-wait]   初始化后 docker compose up -d（-i 交互生成 .env）
  down              docker compose down
  pull              docker compose pull && up -d
  logs [service]    跟踪容器日志（默认 homeos）
  bundle            打包飞牛 NAS 上传用 zip/tar.gz
  help              显示本帮助

示例:
  bash scripts/deploy.sh init
  bash scripts/deploy.sh up --interactive
  bash scripts/deploy.sh logs
  bash scripts/deploy.sh bundle
EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    init) cmd_init "$@" ;;
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    pull) cmd_pull "$@" ;;
    logs) cmd_logs "$@" ;;
    bundle) cmd_bundle "$@" ;;
    help|-h|--help) cmd_help ;;
    *) die "未知命令: $cmd（运行 deploy.sh help 查看用法）" ;;
  esac
}

main "$@"
