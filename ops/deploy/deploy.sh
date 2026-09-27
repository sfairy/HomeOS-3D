#!/usr/bin/env bash
#
# HomeOS 一键部署：拉取 GHCR 镜像并按角色起容器。
#
#   ops/deploy/deploy.sh                                  同机：先商店，再主应用
#   ops/deploy/deploy.sh --role app --license-server https://pay.example.com
#                                                         客户机：只起主应用
#   ops/deploy/deploy.sh --role store                     厂商机：只起商店
#
# 部署机需要 docker + compose v2；客户机不需要先有商店。
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)

ROLE=all
VERSION_ARG=
LICENSE_SERVER=
KEYS_FROM=
TARGET_DIR=
HOST_BINDS=auto
DRY_RUN=0
ASSUME_YES=0
APP_EXTRA_FILES=

LOG_FILE=$(mktemp 2>/dev/null || printf '/tmp/homeos-deploy.$$')
trap 'rm -f "$LOG_FILE"' EXIT

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '警告：%s\n' "$*" >&2; }
die()  { printf '错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
用法：ops/deploy/deploy.sh [选项]

  --role ROLE           all | store | app（默认 all）
                        app   = 客户机，只部署主应用（可独立运行）
                        store = 厂商机，只部署授权商店
                        all   = 同机部署两者，先起商店
  --license-server URL  厂商授权服务器的公网地址；--role app 必填
                        会写进 .env 的 APP_LICENSE_SERVER_URL
  --version TAG         镜像 tag（默认：环境变量 HOMEOS_VERSION → 仓库 VERSION 文件 → latest）
  --keys-from SRC       公钥来源：目录或 URL（默认：本地 keys/ → 本仓库 raw）
  --dir DIR             compose 与 .env 所在目录（默认：脚本所在的仓库根）
  --host-binds MODE     宿主标识符号链接：auto | force | skip（默认 auto）
  --dry-run             只打印将要执行的命令，不写文件、不调用 docker
  --yes                 非交互（CI 用）：不提问，sudo 只用 sudo -n
  -h, --help            显示本帮助

例：
  ./ops/deploy/deploy.sh --role app --license-server https://pay.example.com --version 0.6.5
  ./ops/deploy/deploy.sh --role store
  ./ops/deploy/deploy.sh --role all --dry-run
USAGE
}

# ---------------------------------------------------------------- 参数解析

while [ $# -gt 0 ]; do
  case "$1" in
    --role)          [ $# -ge 2 ] || die "--role 缺少取值"; ROLE=$2; shift 2 ;;
    --role=*)        ROLE=${1#*=}; shift ;;
    --license-server) [ $# -ge 2 ] || die "--license-server 缺少取值"; LICENSE_SERVER=$2; shift 2 ;;
    --license-server=*) LICENSE_SERVER=${1#*=}; shift ;;
    --version)       [ $# -ge 2 ] || die "--version 缺少取值"; VERSION_ARG=$2; shift 2 ;;
    --version=*)     VERSION_ARG=${1#*=}; shift ;;
    --keys-from)     [ $# -ge 2 ] || die "--keys-from 缺少取值"; KEYS_FROM=$2; shift 2 ;;
    --keys-from=*)   KEYS_FROM=${1#*=}; shift ;;
    --dir)           [ $# -ge 2 ] || die "--dir 缺少取值"; TARGET_DIR=$2; shift 2 ;;
    --dir=*)         TARGET_DIR=${1#*=}; shift ;;
    --host-binds)    [ $# -ge 2 ] || die "--host-binds 缺少取值"; HOST_BINDS=$2; shift 2 ;;
    --host-binds=*)  HOST_BINDS=${1#*=}; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    --yes|-y)        ASSUME_YES=1; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$ROLE" in
  all|store|app) ;;
  *) die "--role 只能是 all / store / app（收到：$ROLE）" ;;
esac
case "$HOST_BINDS" in
  auto|force|skip) ;;
  *) die "--host-binds 只能是 auto / force / skip（收到：$HOST_BINDS）" ;;
esac

# 目录型 --keys-from 先在原 cwd 下归一成绝对路径：脚本稍后会 cd 到 compose 目录
case "$KEYS_FROM" in
  ""|http://*|https://*) ;;
  *)
    [ -d "$KEYS_FROM" ] || die "--keys-from 目录不存在：$KEYS_FROM"
    KEYS_FROM=$(cd "$KEYS_FROM" && pwd)
    ;;
esac

# ---------------------------------------------------------------- 运行封装

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ %s\n' "$*"
    return 0
  fi
  "$@"
}

run_log() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ %s\n' "$*"
    : > "$LOG_FILE"
    return 0
  fi
  "$@" > "$LOG_FILE" 2>&1
}

# 非交互 sudo：root 直接用；否则 sudo -n（拿不到权限返回 127，由调用方降级处理）
maybe_sudo() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; return $?; fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then sudo -n "$@"; return $?; fi
  return 127
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

env_value() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v key="$1" '$1 == key { sub("^[^=]*=", ""); value=$0 } END { if (value != "") print value }' "$ENV_FILE"
}

env_set() {
  key=$1
  value=$2
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ .env：%s=%s\n' "$key" "$value"
    return 0
  fi
  [ -f "$ENV_FILE" ] || : > "$ENV_FILE"
  tmp="$ENV_FILE.homeos-tmp.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    $0 ~ "^[[:space:]]*#?[[:space:]]*" key "=" && done == 0 { print key "=" value; done = 1; next }
    { print }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
  info ".env 已写入 $key=$value"
}

# ---------------------------------------------------------------- 目录与参数归一

resolve_dir() {
  if [ -n "$TARGET_DIR" ]; then
    [ -d "$TARGET_DIR" ] || die "--dir 指向的目录不存在：$TARGET_DIR"
    (cd "$TARGET_DIR" && pwd)
    return
  fi
  if [ -f "$REPO_DIR/docker-compose.app.yml" ] && [ -f "$REPO_DIR/docker-compose.store.yml" ]; then
    printf '%s' "$REPO_DIR"
    return
  fi
  if [ -f "$PWD/docker-compose.app.yml" ]; then
    printf '%s' "$PWD"
    return
  fi
  die "找不到 compose 文件：需要 docker-compose.app.yml 与 docker-compose.store.yml 与脚本同目录，或用 --dir 指定"
}

resolve_tag() {
  if [ -n "$VERSION_ARG" ]; then printf '%s' "$VERSION_ARG"; return; fi
  if [ -n "${HOMEOS_VERSION:-}" ]; then printf '%s' "$HOMEOS_VERSION"; return; fi
  if [ -f "$COMPOSE_DIR/VERSION" ]; then
    tr -d '[:space:]' < "$COMPOSE_DIR/VERSION"
    return
  fi
  printf 'latest'
}

detect_raw_base() {
  origin=""
  if [ -d "$COMPOSE_DIR/.git" ] && command -v git >/dev/null 2>&1; then
    origin=$(git -C "$COMPOSE_DIR" remote get-url origin 2>/dev/null || true)
  fi
  case "$origin" in
    https://github.com/*) path=${origin#https://github.com/} ;;
    git@github.com:*)     path=${origin#git@github.com:} ;;
    *)                    path="sfairy/HomeOS-3D.git" ;;
  esac
  path=${path%.git}
  printf 'https://raw.githubusercontent.com/%s' "$path"
}

# ---------------------------------------------------------------- 前置检查

preflight() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ 检查 docker / docker compose v2 / 守护进程\n'
    return 0
  fi
  command -v docker >/dev/null 2>&1 || die "没有 docker：请先安装 Docker Engine（https://docs.docker.com/engine/install/）"
  docker compose version >/dev/null 2>&1 || die "没有 docker compose v2（compose 文件的 name: 字段要求 >=2.3.3）"
  docker info >/dev/null 2>&1 || die "docker 守护进程不可用：确认服务已启动、当前用户有权限（可加入 docker 组）"
}

ensure_env() {
  if [ -f "$ENV_FILE" ]; then
    return 0
  fi
  if [ -f "$COMPOSE_DIR/.env.example" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '+ cp %s %s\n' "$COMPOSE_DIR/.env.example" "$ENV_FILE"
    else
      cp "$COMPOSE_DIR/.env.example" "$ENV_FILE"
      info "已生成 .env（来自 .env.example）"
    fi
  else
    warn "既没有 .env 也没有 .env.example：按 compose 内置默认值启动"
  fi
}

setup_images() {
  TAG=$(resolve_tag)
  explicit_version=0
  if [ -n "$VERSION_ARG" ] || [ -n "${HOMEOS_VERSION:-}" ]; then explicit_version=1; fi

  if [ "$explicit_version" -eq 0 ]; then
    if [ -n "${HOMEOS_IMAGE:-}" ] || [ -n "${HOMEOS_STORE_IMAGE:-}" ]; then
      info "沿用已设置的镜像变量"
      return 0
    fi
    if [ -n "$(env_value HOMEOS_IMAGE)" ] || [ -n "$(env_value HOMEOS_STORE_IMAGE)" ]; then
      info ".env 里钉住了镜像，按原样使用"
      return 0
    fi
  elif [ -n "$(env_value HOMEOS_IMAGE)" ] || [ -n "$(env_value HOMEOS_STORE_IMAGE)" ]; then
    warn "--version 覆盖 .env 里钉住的镜像"
  fi

  HOMEOS_IMAGE="${HOMEOS_IMAGE_BASE:-ghcr.io/sfairy/homeos-3d}:$TAG"
  HOMEOS_STORE_IMAGE="${HOMEOS_STORE_IMAGE_BASE:-ghcr.io/sfairy/homeos-3d-store}:$TAG"
  export HOMEOS_IMAGE HOMEOS_STORE_IMAGE
}

require_license_server() {
  [ "$ROLE" = "app" ] || return 0
  current=$(env_value APP_LICENSE_SERVER_URL)
  case "$current" in
    ""|http://homeos-3d-store:18082|http://127.0.0.1:18082) current="" ;;
  esac
  if [ -n "$current" ]; then
    info "授权服务器：$current"
    return 0
  fi
  if [ -n "$LICENSE_SERVER" ]; then
    env_set APP_LICENSE_SERVER_URL "$LICENSE_SERVER"
    return 0
  fi
  die "--role app 是独立部署，必须指定厂商授权服务器地址：--license-server https://<商店域名>，或在 .env 里写 APP_LICENSE_SERVER_URL=https://<商店域名>"
}

# ---------------------------------------------------------------- 公钥

verify_key() {
  [ -s "$1" ] || return 1
  grep -q -- '-----BEGIN PUBLIC KEY-----' "$1"
}

try_download() {
  name=$1
  dest=$2
  url=$3
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ curl -fsSL %s -o %s\n' "$url" "$dest"
    return 0
  fi
  if curl -fsSL "$url" -o "$dest.tmp" 2>/dev/null; then
    mv "$dest.tmp" "$dest"
    return 0
  fi
  rm -f "$dest.tmp"
  return 1
}

download_keys() {
  mode=$1
  base=$2
  for name in license-public.pem license-transport-public.pem; do
    ok=0
    if [ "$mode" = "raw" ]; then
      tried=" "
      for ref in "$KEYS_REF" main; do
        case "$tried" in *" $ref "*) continue ;; esac
        tried="$tried$ref "
        if try_download "$name" "$keys_dir/$name" "$base/$ref/keys/$name"; then
          info "已下载 $name（ref=$ref）"
          ok=1
          break
        fi
      done
    else
      if try_download "$name" "$keys_dir/$name" "$base/$name"; then
        info "已下载 $name"
        ok=1
      fi
    fi
    [ "$ok" = "1" ] || return 1
  done
  return 0
}

ensure_keys() {
  [ "$ROLE" = "app" ] || return 0
  keys_dir="$COMPOSE_DIR/keys"
  run mkdir -p "$keys_dir"

  need=0
  for name in license-public.pem license-transport-public.pem; do
    verify_key "$keys_dir/$name" || need=1
  done
  if [ "$need" -eq 0 ]; then
    info "复用已有公钥：$keys_dir"
  else
    case "$KEYS_FROM" in
      "")
        case "$TAG" in
          [0-9]*) KEYS_REF="v$TAG" ;;
          *)      KEYS_REF="main" ;;
        esac
        command -v curl >/dev/null 2>&1 || [ "$DRY_RUN" -eq 1 ] || die "需要 curl 下载授权公钥；也可以把两个 PEM 手工放进 $keys_dir，或用 --keys-from 指定目录"
        download_keys raw "$(detect_raw_base)" || die "下载授权公钥失败：把两个 PEM 手工放进 $keys_dir，或用 --keys-from 指定目录"
        ;;
      http://*|https://*)
        command -v curl >/dev/null 2>&1 || [ "$DRY_RUN" -eq 1 ] || die "需要 curl 下载授权公钥"
        download_keys url "${KEYS_FROM%/}" || die "从 $KEYS_FROM 下载授权公钥失败"
        ;;
      *)
        [ -d "$KEYS_FROM" ] || die "--keys-from 目录不存在：$KEYS_FROM"
        for name in license-public.pem license-transport-public.pem; do
          run cp "$KEYS_FROM/$name" "$keys_dir/$name"
        done
        info "已从 $KEYS_FROM 复制公钥"
        ;;
    esac
  fi

  for name in license-public.pem license-transport-public.pem; do
    run chmod 644 "$keys_dir/$name"
    if [ "$DRY_RUN" -eq 0 ]; then
      verify_key "$keys_dir/$name" || die "$keys_dir/$name 不是 PEM 公钥"
      info "$name  sha256=$(sha256_of "$keys_dir/$name")"
    fi
  done

  # 指纹钉死在主应用配置里；compose 目录可能是检出根，也可能是部署副本。
  config="$COMPOSE_DIR/homeos-3d/backend/src/config.py"
  if [ ! -f "$config" ]; then
    config="$COMPOSE_DIR/src/config.py"
  fi
  if [ -f "$config" ] && [ "$DRY_RUN" -eq 0 ]; then
    expected=$(sed -n "s/.*DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = '\([0-9a-f]*\)'.*/\1/p" "$config" | head -n 1)
    actual=$(sha256_of "$keys_dir/license-public.pem")
    if [ -n "$expected" ] && [ "$expected" != "$actual" ]; then
      warn "签名公钥与 homeos-3d/backend/src/config.py 钉死的指纹不一致（期望 $expected，实际 $actual）—— 密钥轮换后属正常，否则请确认来源"
    fi
  fi
}

# ---------------------------------------------------------------- 宿主标识

ensure_one_bind() {
  target=$1
  source=$2
  if [ -L "$target" ]; then
    if [ "$(readlink "$target")" = "$source" ]; then
      info "$target → $source 已就绪"
      return 0
    fi
    warn "$target 已指向 $(readlink "$target")（不是 $source），保持不动"
    return 0
  fi
  if [ -d "$target" ]; then
    if [ "$HOST_BINDS" != "force" ]; then
      warn "$target 是个目录（多半是上次 docker 自动建的），指纹会退到 data/ 兜底 ID。修法：sudo rmdir $target && sudo ln -sfn $source $target ，或重跑时加 --host-binds force"
      return 0
    fi
    run mkdir -p "$(dirname "$target")"
    if ! maybe_sudo rmdir "$target"; then
      warn "无法删除目录 $target（需要 root）：sudo rmdir $target && sudo ln -sfn $source $target"
      return 0
    fi
  fi
  run mkdir -p "$(dirname "$target")"
  if maybe_sudo ln -sfn "$source" "$target"; then
    info "$target → $source 已建立"
    return 0
  fi
  warn "无法建立 $target（需要 root）：sudo mkdir -p $(dirname "$target") && sudo ln -sfn $source $target"
  return 0
}

ensure_host_binds() {
  [ "$ROLE" = "store" ] && return 0
  if [ "$HOST_BINDS" = "skip" ]; then
    info "按 --host-binds skip 跳过宿主标识（指纹退到 data/ 兜底 ID）"
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ 确保 /host/etc/machine-id 与 /host/sys/class/dmi/id 两个符号链接\n'
    return 0
  fi
  ensure_one_bind /host/etc/machine-id /etc/machine-id
  ensure_one_bind /host/sys/class/dmi/id /sys/class/dmi/id
}

# ---------------------------------------------------------------- compose 操作

compose_app() { run "$@" docker compose -f docker-compose.app.yml $APP_EXTRA_FILES; }

diagnose_pull_failure() {
  warn "拉取镜像失败，原始输出："
  sed 's/^/    /' "$LOG_FILE" | tail -n 20 >&2
  if grep -Eqi 'unauthorized|denied|authentication required' "$LOG_FILE"; then
    info "GHCR 包可能是私有的：先 docker login ghcr.io（见 PRODUCTION.md 第 8 步）"
  fi
  if grep -Eqi 'manifest unknown|not found' "$LOG_FILE"; then
    info "该 tag 可能还没构建：先在 GitHub Actions 手动 Run workflow，或改用 --version latest"
  fi
  if grep -Eqi 'no matching manifest' "$LOG_FILE"; then
    info "缺少当前 CPU 架构的镜像层：amd64 / arm64 都已发布，确认宿主机架构"
  fi
}

wait_healthy() {
  container=$1
  timeout=$2
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ 轮询 %s 健康状态（最长 %ss）\n' "$container" "$timeout"
    return 0
  fi
  elapsed=0
  while [ "$elapsed" -lt "$timeout" ]; do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || printf 'missing')
    [ "$status" = "healthy" ] && return 0
    sleep 3
    elapsed=$((elapsed + 3))
  done
  warn "$container 在 ${timeout}s 内没有变成 healthy（最后状态：$status）"
  docker logs --tail 50 "$container" >&2 2>&1 || true
  return 1
}

deploy_store() {
  log "① 授权商店（homeos-3d-store）"
  if ! run_log docker compose -f docker-compose.store.yml pull; then diagnose_pull_failure; return 1; fi
  run docker compose -f docker-compose.store.yml up -d
  wait_healthy homeos-3d-store 180 || return 1
  info "商店：http://<主机>:${STORE_PUBLISH_PORT:-18082}/setup（首次部署在此建管理员）"
  if [ "$DRY_RUN" -eq 0 ]; then
    docker exec homeos-3d-store sha256sum /data/keys/license-public.pem /data/keys/license-transport-public.pem 2>/dev/null | sed 's/^/    /' || true
  fi
  return 0
}

deploy_app() {
  log "② 主应用（homeos-3d）"
  if [ "$ROLE" = "app" ]; then
    APP_EXTRA_FILES=""
    if [ "$DRY_RUN" -eq 0 ]; then
      if docker network inspect homeos-3d-net >/dev/null 2>&1 || docker volume inspect homeos-3d-client-keys >/dev/null 2>&1; then
        warn "这台机器上有商店的共享网络 / 公钥卷：如果商店也在本机，请改用 --role all"
      fi
    fi
  else
    APP_EXTRA_FILES="-f docker-compose.app.shared.yml"
  fi
  if ! run_log docker compose -f docker-compose.app.yml $APP_EXTRA_FILES pull; then diagnose_pull_failure; return 1; fi
  run docker compose -f docker-compose.app.yml $APP_EXTRA_FILES up -d
  wait_healthy homeos-3d 300 || return 1
  return 0
}

summary() {
  port="${APP_PUBLISH_PORT:-18081}"
  log ""
  log "完成。"
  if [ "$DRY_RUN" -eq 0 ]; then
    docker compose -f docker-compose.app.yml $APP_EXTRA_FILES ps 2>/dev/null || true
  fi
  if [ "$ROLE" != "store" ]; then
    info "主应用：http://<主机>:$port/setup"
    info "首次设置的引导密钥：docker logs homeos-3d | head （容器内 /data/setup-token）"
    if [ "$ROLE" = "app" ]; then
      info "授权服务器：$(env_value APP_LICENSE_SERVER_URL)"
    fi
  fi
  info "升级＝先 git pull（若为检出）再跑同一条命令；不要删数据卷"
  info "授权公钥卷 / 数据卷：不要执行 docker compose down -v"
}

# ---------------------------------------------------------------- 主流程

COMPOSE_DIR=$(resolve_dir)
ENV_FILE="$COMPOSE_DIR/.env"
cd "$COMPOSE_DIR"

log "HomeOS 部署"
info "目录：$COMPOSE_DIR"
info "角色：$ROLE"
[ "$DRY_RUN" -eq 1 ] && info "模式：dry-run（不写文件、不调用 docker）"

preflight
ensure_env
setup_images
info "镜像 tag：$TAG"
if [ -n "${HOMEOS_IMAGE:-}" ]; then info "主应用镜像：$HOMEOS_IMAGE"; fi
if [ -n "${HOMEOS_STORE_IMAGE:-}" ]; then info "商店镜像：$HOMEOS_STORE_IMAGE"; fi
require_license_server
ensure_keys
ensure_host_binds

log ""
case "$ROLE" in
  store) deploy_store || exit 1 ;;
  app)   deploy_app   || exit 1 ;;
  all)
    deploy_store || exit 1
    log ""
    deploy_app   || exit 1
    ;;
esac

summary
