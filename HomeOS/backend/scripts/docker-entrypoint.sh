#!/bin/sh
set -e

log() { printf '%s\n' "$*"; }
log_err() { printf '%s\n' "$*" >&2; }

# 宿主机目录 / Caddyfile 初始化（需 root 写挂载卷；homeos 首次启动时执行）
init_deploy_layout() {
  root="${HOMEOS_DEPLOY_ROOT:-/deploy-work}"
  [ -d "$root" ] || return 0

  script=""
  if [ -f "$root/deploy/init-layout.sh" ]; then
    script="$root/deploy/init-layout.sh"
  elif [ -f /app/deploy/init-layout.sh ]; then
    script="/app/deploy/init-layout.sh"
  else
    return 0
  fi

  log "正在初始化宿主机目录与 Caddyfile…"
  HOMEOS_DEPLOY_ROOT="$root" sh "$script"
}

# Compose 未填口令时，postgres/redis 启动时写入 /secrets；空密码 URL 在此回填（gosu 继承环境变量）
url_password_empty() {
  u="$1"
  [ -z "$u" ] && return 0
  printf '%s' "$u" | grep -Eq '://[^:/@]+:@' && return 0
  printf '%s' "$u" | grep -Eq '://[^:/@]+@' && return 0
  printf '%s' "$u" | grep -Eq '://:@' && return 0
  return 1
}

encode_secret() {
  if command -v bun >/dev/null 2>&1; then
    bun -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
    return
  fi
  printf '%s' "$1"
}

apply_compose_secrets() {
  secret_dir="${HOMEOS_SECRETS_DIR:-/secrets}"
  secret_pg="$secret_dir/postgres_password"
  secret_rd="$secret_dir/redis_password"

  if [ -s "$secret_pg" ] && url_password_empty "${DATABASE_URL:-}"; then
    enc=$(encode_secret "$(cat "$secret_pg")")
    export DATABASE_URL="postgresql://homeos:${enc}@postgres:5432/homeos"
    log "DATABASE_URL 已从 $secret_pg 填充"
  fi

  if [ -s "$secret_rd" ] && url_password_empty "${REDIS_URL:-}"; then
    enc=$(encode_secret "$(cat "$secret_rd")")
    export REDIS_URL="redis://:${enc}@redis:6379"
    log "REDIS_URL 已从 $secret_rd 填充"
  fi
}

if [ "$(id -u)" = "0" ]; then
  init_deploy_layout || log_err "警告: 宿主机目录初始化失败，请检查 compose 目录挂载权限"
  apply_compose_secrets
  exec gosu bun "$0" "$@"
fi

mkdir -p /app/data /app/floorplans /app/icons /app/backgrounds /app/room_images /app/logo /app/sounds /app/license

# 挂载卷是否可写（init-layout 已 chmod 0777；此处再探测并告警）
check_writable() {
  dir="$1"
  label="$2"
  if ! touch "$dir/.write-test" 2>/dev/null; then
    log_err "警告: $dir 不可写（$label）；请检查宿主机对应目录权限（建议 chmod 775）"
    return 1
  fi
  rm -f "$dir/.write-test"
  return 0
}

check_writable /app/license "激活授权可能失败" || true
check_writable /app/floorplans "户型图种子无法落盘" || true
check_writable /app/logo "品牌 Logo 种子无法落盘 → /logo/logo.svg 404" || true
check_writable /app/sounds "音效种子无法落盘 → /sounds/* 404" || true

# 仅 .gitkeep / .DS_Store / 空 → 视为未初始化，可灌入镜像 seed
dir_needs_seed() {
  d="$1"
  [ -d "$d" ] || return 0
  if find "$d" -mindepth 1 ! -name '.gitkeep' ! -name '.DS_Store' -print -quit 2>/dev/null | grep -q .; then
    return 1
  fi
  return 0
}

seed_mount() {
  dest="$1"
  seed="$2"
  label="$3"
  if ! dir_needs_seed "$dest"; then
    return 0
  fi
  if [ ! -d "$seed" ]; then
    log_err "警告: 镜像缺少 $seed，无法初始化 $label"
    return 0
  fi
  # 清掉占位文件，避免挡住复制观感
  rm -f "$dest/.gitkeep" "$dest/.DS_Store" 2>/dev/null || true
  set +e
  seed_err=$(cp -a "$seed"/. "$dest"/ 2>&1)
  seed_code=$?
  set -e
  if [ "$seed_code" -ne 0 ]; then
    log_err "警告: 复制 $label 种子失败（$seed → $dest）: $seed_err"
    return 0
  fi
  log "seed: $label ← $(basename "$seed")"
}

# 挂载卷首次为空时用镜像内 *-seed 灌入（来自仓库 assets/）
seed_mount /app/floorplans /app/floorplans-seed floorplans
seed_mount /app/icons /app/icons-seed icons
seed_mount /app/backgrounds /app/backgrounds-seed backgrounds
seed_mount /app/room_images /app/room_images-seed room_images
seed_mount /app/logo /app/logo-seed logo
seed_mount /app/sounds /app/sounds-seed sounds

# 关键文件缺失时补拷（目录里已有其它文件但缺默认 logo/门铃时）
ensure_seed_file() {
  dest_file="$1"
  seed_file="$2"
  label="$3"
  if [ -f "$dest_file" ]; then
    return 0
  fi
  if [ ! -f "$seed_file" ]; then
    log_err "警告: 缺少 $label（$dest_file），且镜像无 $seed_file"
    return 0
  fi
  set +e
  seed_err=$(cp -a "$seed_file" "$dest_file" 2>&1)
  seed_code=$?
  set -e
  if [ "$seed_code" -ne 0 ]; then
    log_err "警告: 无法写入 $label → $dest_file: $seed_err"
    return 0
  fi
  log "seed: $label"
}

ensure_seed_file /app/floorplans/lights_off.png /app/floorplans-seed/lights_off.png "/floorplans/lights_off.png"
ensure_seed_file /app/logo/logo.svg /app/logo-seed/logo.svg "/logo/logo.svg"
ensure_seed_file /app/sounds/doorbell.mp3 /app/sounds-seed/doorbell.mp3 "/sounds/doorbell.mp3"

SCHEMA=/app/prisma/schema.prisma
DB_INIT_MARKER=/app/data/.db_initialized

if [ -z "$DATABASE_URL" ]; then
  log_err "错误: 未设置 DATABASE_URL，无法初始化 PostgreSQL"
  exit 1
fi

# 0=成功 1=可重试（连接未就绪） 2=致命错误
# 仅 prisma migrate deploy；旧库/漂移库须清空数据卷重建，不做 baseline / db push 自愈。
init_database() {
  set +e
  output=$(bunx prisma migrate deploy --schema="$SCHEMA" 2>&1)
  code=$?
  set -e
  printf '%s\n' "$output"

  if [ "$code" -eq 0 ]; then
    return 0
  fi

  if printf '%s\n' "$output" | grep -qiE 'P1001|P1002|ECONNREFUSED|Connection refused|connect ETIMEDOUT|Can.t reach database'; then
    return 1
  fi

  if printf '%s\n' "$output" | grep -qE 'P3005|P3009'; then
    log_err "Prisma migrate deploy 失败：库结构与单条 init baseline 不一致。"
    log_err "请清空 PostgreSQL 数据卷后重建（docker volume rm … / prisma migrate reset），勿对旧库做静默对齐。"
    log_err "$output"
    return 2
  fi

  log_err "Prisma migrate deploy 失败："
  log_err "$output"
  return 2
}

first_init=false
if [ ! -f "$DB_INIT_MARKER" ]; then
  first_init=true
  log "正在初始化 PostgreSQL 数据库结构…"
fi

attempt=0
max_attempts=30
while [ "$attempt" -lt "$max_attempts" ]; do
  init_database
  status=$?
  if [ "$status" -eq 0 ]; then
    if [ "$first_init" = true ]; then
      log "✅ 数据库初始化完成"
      date -u +%Y-%m-%dT%H:%M:%SZ > "$DB_INIT_MARKER" 2>/dev/null || echo "initialized" > "$DB_INIT_MARKER"
    else
      log "✅ 数据库迁移已就绪"
    fi
    break
  fi

  if [ "$status" -eq 2 ]; then
    log_err "数据库初始化失败，请查看上方 Prisma 输出"
    exit 1
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    log_err "数据库连接超时（已重试 ${max_attempts} 次），请检查 PostgreSQL 与 DATABASE_URL"
    exit 1
  fi

  log "等待 PostgreSQL 就绪… (${attempt}/${max_attempts})"
  sleep 2
done

if [ ! -f /app/dist/backend/main.js ]; then
  log_err "缺少 /app/dist/backend/main.js（镜像后端构建产物不完整）"
  exit 1
fi

# Nest SWC 可能未把 gitignore 的 src/generated 打进 dist；运行时补生成到可写的 /app/dist
if [ ! -f /app/dist/backend/generated/prisma/client.js ] && [ ! -f /app/dist/backend/generated/prisma/client.ts ]; then
  log "镜像缺少 Prisma generated client，正在生成到 dist…"
  mkdir -p /app/dist/backend/generated
  sed -i 's|output[[:space:]]*=[[:space:]]*"[^"]*"|output = "/app/dist/backend/generated/prisma"|' /app/prisma/schema.prisma
  bunx prisma generate --schema=/app/prisma/schema.prisma
  if [ ! -f /app/dist/backend/generated/prisma/client.js ] && [ ! -f /app/dist/backend/generated/prisma/client.ts ]; then
    log_err "Prisma generate 未产出 /app/dist/backend/generated/prisma/client"
    exit 1
  fi
fi

exec bun dist/backend/main.js
