#!/usr/bin/env bash
#
# HomeOS 一键部署：拉取 GHCR 镜像并按角色起容器。
#
#   ops/deploy/deploy.sh                                  同机：先商店，再主应用
#   ops/deploy/deploy.sh --role app --license-server http://192.168.1.20:8802
#                                                         客户机：只起主应用
#   ops/deploy/deploy.sh --role store                     厂商机：只起商店
#
# 授权公钥全程无需人工投放：同机部署由主应用只读挂载商店写出的共享卷；分拆部署由主应用
# 启动时向授权服务器 ``GET /v2/keys`` 自动取回并缓存到自己的数据卷。
#
# 部署机需要 docker + compose v2；客户机不需要先有商店。
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)

ROLE=all
VERSION_ARG=
LICENSE_SERVER=
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
  --license-server URL  厂商授权服务器的地址（局域网即可）；--role app 必填
                        会写进 .env 的 APP_LICENSE_SERVER_URL
  --version TAG         镜像 tag（默认：环境变量 HOMEOS_VERSION → 仓库 package.json 的 version → latest）
  --dir DIR             compose 与 .env 所在目录（默认：脚本所在的仓库根）
  --host-binds MODE     宿主标识符号链接：auto | force | skip（默认 auto）
  --dry-run             只打印将要执行的命令，不写文件、不调用 docker
  --yes                 非交互（CI 用）：不提问，sudo 只用 sudo -n
  -h, --help            显示本帮助

反代（Caddy）内置在镜像里，没有开关可关；它的上游固定是同容器回环，不可覆盖。
宿主发布端口改 .env：APP_PUBLISH_PORT（默认 8801）、APP_PROXY_PUBLISH_PORT（8803）、
STORE_PUBLISH_PORT（8802）、STORE_PROXY_PUBLISH_PORT（8804）。

授权公钥（无需人工投放）：
  all   —— 主应用只读挂载商店写出的共享卷（docker-compose.app.shared.yml），开箱即用。
  app   —— 主应用启动时向 APP_LICENSE_SERVER_URL 的 ``GET /v2/keys`` 取回公钥并缓存到
           自己的数据卷，之后即使商店暂时不可达也能离线启动；商店轮换密钥时按连续性
           校验自动跟进。

例：
  ./ops/deploy/deploy.sh --role app --license-server http://192.168.1.20:8802 --version 1.0.0
  ./ops/deploy/deploy.sh --role store
  ./ops/deploy/deploy.sh --role all
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
  *) die "--role 只能是 all / store / app（收到：${ROLE}）" ;;
esac
case "$HOST_BINDS" in
  auto|force|skip) ;;
  *) die "--host-binds 只能是 auto / force / skip（收到：${HOST_BINDS}）" ;;
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

# 宿主发布端口的取值顺序与 docker compose 一致：真实环境变量 > .env > 内置默认。
# 只用于把提示里的地址打准，compose 自己仍按同样的顺序解析。
publish_port() {
  key=$1
  fallback=$2
  value=${!key:-}
  [ -n "$value" ] || value=$(env_value "$key")
  [ -n "$value" ] || value=$fallback
  printf '%s' "$value"
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

# 版本号唯一来源：仓库根 package.json 的 version（与镜像构建期烘入的值同源）。
package_version() {
  file="$COMPOSE_DIR/package.json"
  [ -f "$file" ] || return 0
  sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1
}

resolve_tag() {
  if [ -n "$VERSION_ARG" ]; then printf '%s' "$VERSION_ARG"; return; fi
  if [ -n "${HOMEOS_VERSION:-}" ]; then printf '%s' "$HOMEOS_VERSION"; return; fi
  version=$(package_version)
  if [ -n "$version" ]; then printf '%s' "$version"; return; fi
  printf 'latest'
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
    ""|http://homeos-3d-store:8802|http://127.0.0.1:8802) current="" ;;
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

# ---------------------------------------------------------------- 授权公钥

# 公钥不再由本脚本投放：同机部署时主应用只读挂载商店写出的共享卷，分拆部署时主应用
# 启动自己向授权服务器 ``GET /v2/keys`` 取回（见 ops/docker/bootstrap_keys.py）。
# 这里只在商店部署完成后打印一次指纹，供跨机核对。

# ---------------------------------------------------------------- 宿主标识

ensure_one_bind() {
  target=$1
  source=$2
  if [ -L "$target" ]; then
    if [ "$(readlink "$target")" = "$source" ]; then
      info "$target → $source 已就绪"
      return 0
    fi
    warn "$target 已指向 $(readlink "$target")（不是 ${source}），保持不动"
    return 0
  fi
  if [ -d "$target" ]; then
    if [ "$HOST_BINDS" != "force" ]; then
      warn "$target 是个目录（多半是上次 docker 自动建的），指纹会退到 data/ 兜底 ID。修法：sudo rmdir $target && sudo ln -sfn $source $target ，或重跑时加 --host-binds force"
      return 0
    fi
    run mkdir -p "$(dirname "$target")"
    if ! maybe_sudo rmdir "$target"; then
      warn "无法删除目录 ${target}（需要 root）：sudo rmdir $target && sudo ln -sfn $source $target"
      return 0
    fi
  fi
  run mkdir -p "$(dirname "$target")"
  if maybe_sudo ln -sfn "$source" "$target"; then
    info "$target → $source 已建立"
    return 0
  fi
  warn "无法建立 ${target}（需要 root）：sudo mkdir -p $(dirname "$target") && sudo ln -sfn $source $target"
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

# ---------------------------------------------------------------- 反向代理（Caddy）

# 反代已内置进镜像：Caddy 与应用同容器（ops/docker/proxy.py），主应用监听 :8803、
# 商店监听 :8804，上游固定是同容器回环（127.0.0.1:8801 / :8802）。
# 宿主侧只剩把反代端口发布出去这一件事，端口在 .env 里配（APP_PROXY_PUBLISH_PORT /
# STORE_PROXY_PUBLISH_PORT，见 .env.example 的 G 区）。

start_proxy() {
  log ""
  log "③ 镜像内置反向代理（Caddy，自签证书）"
  info "反代随应用容器一起启动，无需单独拉取 caddy 镜像或挂载 Caddyfile"
  # 端口由 compose 从 .env 解析；这里读一遍只为把提示里的地址打准。
  app_https=$(publish_port APP_PROXY_PUBLISH_PORT 8803)
  app_http=$(publish_port APP_PUBLISH_PORT 8801)
  store_https=$(publish_port STORE_PROXY_PUBLISH_PORT 8804)
  store_http=$(publish_port STORE_PUBLISH_PORT 8802)
  case "$ROLE" in
    app)
      info "主应用 HTTPS：https://<本机局域网IP>:${app_https}（自签证书，首次需手动放行）"
      info "主应用 HTTP 备用：http://<本机局域网IP>:${app_http}"
      ;;
    store)
      info "商店 HTTPS：https://<本机局域网IP>:${store_https}（自签证书，首次需手动放行）"
      info "商店 HTTP 备用：http://<本机局域网IP>:${store_http}"
      ;;
    all)
      info "主应用 HTTPS：https://<本机局域网IP>:${app_https}（自签证书，首次需手动放行）"
      info "商店 HTTPS：https://<本机局域网IP>:${store_https}（自签证书，首次需手动放行）"
      info "HTTP 备用：主应用 http://<本机局域网IP>:${app_http} / 商店 http://<本机局域网IP>:${store_http}"
      ;;
  esac
  if [ "$ROLE" != "store" ]; then
    info "两端口都要能登录时把 APP_COOKIE_SECURE 设为 false（商店侧同理）"
  fi
}

# ---------------------------------------------------------------- compose 操作

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
  warn "$container 在 ${timeout}s 内没有变成 healthy（最后状态：${status}）"
  docker logs --tail 50 "$container" >&2 2>&1 || true
  return 1
}

deploy_store() {
  log "① 授权商店（homeos-3d-store）"
  if ! run_log docker compose -f docker-compose.store.yml pull; then diagnose_pull_failure; return 1; fi
  run docker compose -f docker-compose.store.yml up -d
  wait_healthy homeos-3d-store 180 || return 1
  store_http=$(publish_port STORE_PUBLISH_PORT 8802)
  store_https=$(publish_port STORE_PROXY_PUBLISH_PORT 8804)
  info "商店：http://<主机>:${store_http}/setup（HTTPS：https://<主机>:${store_https}/setup；首次部署在此建管理员）"
  if [ "$DRY_RUN" -eq 0 ]; then
    info "授权公钥指纹（主应用会自动取回；跨机部署可用它核对）："
    docker exec homeos-3d-store sha256sum /data/client-keys/license-public.pem /data/client-keys/license-transport-public.pem 2>/dev/null | sed 's/^/    /' || true
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
  log ""
  log "完成。"
  # 只列本次真正部署过的那一侧，避免 --role store 时打印空的 app 项目。
  if [ "$DRY_RUN" -eq 0 ]; then
    case "$ROLE" in
      store) docker compose -f docker-compose.store.yml ps 2>/dev/null || true ;;
      app)   docker compose -f docker-compose.app.yml $APP_EXTRA_FILES ps 2>/dev/null || true ;;
      all)
        docker compose -f docker-compose.store.yml ps 2>/dev/null || true
        docker compose -f docker-compose.app.yml $APP_EXTRA_FILES ps 2>/dev/null || true
        ;;
    esac
  fi
  if [ "$ROLE" != "store" ]; then
    app_https=$(publish_port APP_PROXY_PUBLISH_PORT 8803)
    app_http=$(publish_port APP_PUBLISH_PORT 8801)
    info "主应用 setup：https://<主机>:${app_https}/setup（HTTP 备用 http://<主机>:${app_http}/setup）"
    info "首次设置的引导密钥：docker logs homeos-3d | head （容器内 /data/setup-token）"
    if [ "$ROLE" = "app" ]; then
      info "授权服务器：$(env_value APP_LICENSE_SERVER_URL)"
    fi
  fi
  info "升级＝先 git pull（若为检出）再跑同一条命令；不要删数据卷"
  info "数据卷（含授权公钥缓存）：不要执行 docker compose down -v"
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

start_proxy

summary
