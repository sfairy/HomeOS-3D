#!/bin/sh
# 可选主机侧工具。Compose 已内联同等逻辑，NAS 只上传 docker-compose.yml 即可自动写 ./secrets/。
# 已有 Postgres 数据卷且无口令时不擅自生成（卷内口令在首次初始化后锁定）
#
# 用法：ensure-secrets.sh postgres|redis
set -eu

SECRETS_DIR="${HOMEOS_SECRETS_DIR:-/secrets}"
PGDATA_CHECK="${HOMEOS_PGDATA_CHECK:-/var/lib/postgresql/data}"
TARGET="${1:-}"

log() { printf '[secrets] %s\n' "$*"; }

gen() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
    return
  fi
  dd if=/dev/urandom bs=16 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
}

write_secret() {
  dest="$1"
  val="$2"
  tmp="$dest.tmp.$$"
  printf '%s' "$val" > "$tmp"
  chmod 644 "$tmp" 2>/dev/null || true
  mv "$tmp" "$dest"
}

ensure() {
  name="$1"
  env_val="$2"
  allow_generate="$3"
  dest="$SECRETS_DIR/$name"

  if [ -n "$env_val" ]; then
    write_secret "$dest" "$env_val"
    log "已从环境变量写入 $name"
    return
  fi
  if [ -s "$dest" ]; then
    log "沿用已有 $name"
    return
  fi
  if [ "$allow_generate" = "1" ]; then
    write_secret "$dest" "$(gen)"
    log "已生成随机 $name（请备份宿主机 ./secrets/；数据卷锁定此口令）"
    return
  fi
  log "未设置 $name 且已有 Postgres 数据卷，跳过生成（请设置环境变量或写入 $dest）"
}

case "$TARGET" in
  postgres|redis) ;;
  *)
    log "用法: ensure-secrets.sh postgres|redis"
    exit 1
    ;;
esac

mkdir -p "$SECRETS_DIR"

if [ "$TARGET" = "postgres" ]; then
  if [ -f "$PGDATA_CHECK/PG_VERSION" ]; then
    ensure postgres_password "${POSTGRES_PASSWORD:-}" 0
  else
    ensure postgres_password "${POSTGRES_PASSWORD:-}" 1
  fi
fi

if [ "$TARGET" = "redis" ]; then
  ensure redis_password "${REDIS_PASSWORD:-}" 1
fi
