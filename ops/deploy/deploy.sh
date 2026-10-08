#!/usr/bin/env bash
#
# HomeOS 一键部署：拉取 GHCR 镜像并按角色起容器。
#
# 生产形态（默认主流程）——中心商店 + 多台客户机：
#   [开发者 / 厂商机]  ops/deploy/deploy.sh --role store          只起授权商店（中心，唯一）
#   [每台客户机]      ops/deploy/deploy.sh --role app \
#                       --license-server http://<中心商店>:8802    只起主应用（一客户一台）
#
# 开发 / 自测形态——一台机器同时跑两者（不用于客户交付）：
#   [开发机]          ops/deploy/deploy.sh                        先起商店，再起主应用
#
# 授权公钥全程无需人工投放：客户机的主应用启动时向授权服务器 ``GET /v2/keys`` 自动取回并
# 缓存到自己的数据卷（中心轮换密钥也会自动跟进）；同机形态由主应用只读挂载商店写出的
# 共享卷。客户机不需要先有商店，也不需要商店的代码或密钥。
#
# 部署机需要 docker + compose v2；客户机侧的商店地址必须显式给出。
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
STORE_EXTRA_FILES=

LOG_FILE=$(mktemp 2>/dev/null || printf '/tmp/homeos-deploy.$$')
trap 'rm -f "$LOG_FILE"' EXIT

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '警告：%s\n' "$*" >&2; }
die()  { printf '错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
用法：ops/deploy/deploy.sh [选项]

生产形态是「中心商店 + 多台客户机」：商店只在你（开发者 / 厂商）的机器上起一次，
主应用分发到每个客户的机器上、各自指向这台商店。

  --role ROLE           store | app | all（默认 all）
                        store = 厂商机（中心）：只部署授权商店，签发授权
                        app   = 客户机：只部署主应用，指向中心商店（生产主流程）
                        all   = 同机部署两者，先商店后主应用（仅开发 / 自测）
  --license-server URL  中心商店地址，会写进 .env 的 APP_LICENSE_SERVER_URL
                        与 APP_STORE_URL（浏览器用入口一并钉住，无需再手改第二处）。
                        --role app 必填；客户机要能访问到它（局域网 IP 或公网域名）。
                        跨机直连用商店 HTTP 端口 :8802；不要在没换成真实证书时用 :8804。
  --version TAG         镜像 tag。优先级：--version > 真实环境变量 > .env > package.json > latest；
                        解析结果会写回 .env（HOMEOS_VERSION / HOMEOS_IMAGE）钉住版本；
                        中心与各客户机用同一个 tag，避免版本漂移。
  --dir DIR             compose 与 .env 所在目录（默认：脚本所在的仓库根）
  --host-binds MODE     宿主标识符号链接：auto | force | skip（默认 auto）
  --dry-run             只打印将要执行的命令，不写文件、不调用 docker
  --yes                 非交互（CI 用）：不提问，sudo 只用 sudo -n
  -h, --help            显示本帮助

反代（Caddy）内置在镜像里，没有开关可关；它的上游固定是同容器回环，不可覆盖。
宿主发布端口改 .env：APP_PUBLISH_PORT（默认 8801）、APP_PROXY_PUBLISH_PORT（8803）、
STORE_PUBLISH_PORT（8802）、STORE_PROXY_PUBLISH_PORT（8804）。

授权公钥（无需人工投放）：
  app   —— 主应用启动时向 APP_LICENSE_SERVER_URL 的 ``GET /v2/keys`` 取回公钥并缓存到
           自己的数据卷，之后即使商店暂时不可达也能离线启动；商店轮换密钥时按连续性
           校验自动跟进。
  all   —— 主应用只读挂载商店写出的共享卷（docker-compose.app.shared.yml），开箱即用。

客户机精简包：ops/deploy/pack-customer.sh 产出只含 app 侧文件的压缩包，里面有一键
install.sh（等价于「--role app」）。中心 / 客户机的完整流程见 ops/deploy/SPLIT-DEPLOY.md，
公网接入见 ops/deploy/PUBLIC-ACCESS.md，升级见 ops/deploy/UPGRADE.md。

例：
  # 中心商店（厂商机）
  ./ops/deploy/deploy.sh --role store
  # 客户机（每台一次）
  ./ops/deploy/deploy.sh --role app --license-server http://192.168.1.20:8802 --version 0.7.1
  # 开发 / 自测（同机）
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
    # 只替换**已生效**的赋值行；被注释掉的键（`# KEY=...`）按「没有这个键」处理，
    # 与 env_value 的判读口径一致（否则会把别人特意注释掉的配置悄悄「复活」）。
    $0 ~ "^[[:space:]]*" key "=" && done == 0 { print key "=" value; done = 1; next }
    { print }
    # .env 里没有这个键时（老 .env、精简客户包）也要补上，否则钉版本会静默丢失。
    END { if (done == 0) print key "=" value }
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
  # 客户包（pack-customer.sh 产出）里只有 app 侧文件：--role app 不要求 store.yml；
  # 反过来，一个只放商店文件的目录也不该被 --role store 拒绝。
  need_app=1
  need_store=1
  [ "$ROLE" = "store" ] && need_app=0
  [ "$ROLE" = "app" ] && need_store=0

  # 只点名**真正缺的**文件：笼统说「缺少 A 与 B」会让人去查一个明明存在的文件。
  missing_in() {
    missing=
    if [ "$need_app" -eq 1 ] && [ ! -f "$1/docker-compose.app.yml" ]; then
      missing="$missing docker-compose.app.yml"
    fi
    if [ "$need_store" -eq 1 ] && [ ! -f "$1/docker-compose.store.yml" ]; then
      missing="$missing docker-compose.store.yml"
    fi
    printf '%s' "${missing# }"
  }
  dir_ok() {
    [ -z "$(missing_in "$1")" ]
  }
  need_label() {
    if [ "$need_app" -eq 1 ]; then
      printf 'docker-compose.app.yml（+ docker-compose.store.yml）'
    else
      printf 'docker-compose.store.yml'
    fi
  }

  if [ -n "$TARGET_DIR" ]; then
    [ -d "$TARGET_DIR" ] || die "--dir 指向的目录不存在：$TARGET_DIR"
    missing=$(missing_in "$TARGET_DIR")
    [ -z "$missing" ] || die "--dir 里缺少 ${missing}：$TARGET_DIR"
    (cd "$TARGET_DIR" && pwd)
    return
  fi
  if dir_ok "$REPO_DIR"; then
    printf '%s' "$REPO_DIR"
    return
  fi
  if dir_ok "$PWD"; then
    printf '%s' "$PWD"
    return
  fi
  die "找不到 compose 文件：需要 $(need_label) 与脚本同目录，或用 --dir 指定"
}

# 版本号唯一来源：仓库根 package.json 的 version（与镜像构建期烘入的值同源）。
package_version() {
  file="$COMPOSE_DIR/package.json"
  [ -f "$file" ] || return 0
  sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1
}

resolve_tag() {
  # 优先级与 docker compose 一致：显式 --version > 真实环境变量 > .env > 仓库默认。
  # 必须把 .env 算进来 —— 否则「.env 钉住 0.7.1、package.json 已是 0.7.2」时，脚本会
  # 打印「镜像 tag：0.7.2」却沿用 0.7.1 的镜像，报告与事实对不上。
  if [ -n "$VERSION_ARG" ]; then printf '%s' "$VERSION_ARG"; return; fi
  if [ -n "${HOMEOS_VERSION:-}" ]; then printf '%s' "$HOMEOS_VERSION"; return; fi
  pinned=$(env_value HOMEOS_VERSION)
  if [ -n "$pinned" ]; then printf '%s' "$pinned"; return; fi
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

  # 已钉住的完整镜像：环境变量优先于 .env。按角色只要求「这一次真正要起的服务」有值。
  pinned_app=${HOMEOS_IMAGE:-$(env_value HOMEOS_IMAGE)}
  pinned_store=${HOMEOS_STORE_IMAGE:-$(env_value HOMEOS_STORE_IMAGE)}
  pinned_version=$(env_value HOMEOS_VERSION)
  need_app=1
  need_store=1
  [ "$ROLE" = "store" ] && need_app=0
  [ "$ROLE" = "app" ] && need_store=0

  reuse=1
  [ "$explicit_version" -eq 1 ] && reuse=0
  if [ "$need_app" -eq 1 ] && [ -z "$pinned_app" ]; then reuse=0; fi
  if [ "$need_store" -eq 1 ] && [ -z "$pinned_store" ]; then reuse=0; fi

  if [ "$reuse" -eq 1 ]; then
    info "沿用已钉住的镜像（.env / 环境变量）"
    HOMEOS_IMAGE=${pinned_app:-${HOMEOS_IMAGE_BASE:-ghcr.io/sfairy/homeos}:$TAG}
    HOMEOS_STORE_IMAGE=${pinned_store:-${HOMEOS_STORE_IMAGE_BASE:-ghcr.io/sfairy/homeos-store}:$TAG}
    export HOMEOS_IMAGE HOMEOS_STORE_IMAGE
    return 0
  fi
  # 显式 --version 是升级 / 回滚的常规操作；只有它与 .env 里钉住的版本**不同**才值得提示，
  # 否则每次重跑（恰是升级流程本身）都会刷一条「覆盖」告警，把真正的异常淹掉。
  if [ "$explicit_version" -eq 1 ] && [ -n "$pinned_version" ] && [ "$pinned_version" != "$TAG" ]; then
    info "版本变更：$pinned_version → $TAG"
  fi

  HOMEOS_IMAGE="${HOMEOS_IMAGE_BASE:-ghcr.io/sfairy/homeos}:$TAG"
  HOMEOS_STORE_IMAGE="${HOMEOS_STORE_IMAGE_BASE:-ghcr.io/sfairy/homeos-store}:$TAG"
  export HOMEOS_IMAGE HOMEOS_STORE_IMAGE

  # 钉版本：把解析结果写回 .env。升级 / 回滚文档里「直接 docker compose ... up -d」的写法
  # 会读 .env，于是中心商店与各客户机必然拉到同一个 tag，不会各自漂到 :latest。
  env_set HOMEOS_VERSION "$TAG"
  if [ "$need_app" -eq 1 ]; then env_set HOMEOS_IMAGE "$HOMEOS_IMAGE"; fi
  if [ "$need_store" -eq 1 ]; then env_set HOMEOS_STORE_IMAGE "$HOMEOS_STORE_IMAGE"; fi
}

# 分拆部署时，出站授权地址与浏览器商店入口通常是同一个可达 URL。
# 若 APP_STORE_URL 仍是空/本机默认，就跟着授权地址一起钉住，避免只改一处后
# 「忘记密码 / 商店」链接仍指向 127.0.0.1。容器内网主机名（homeos-store）浏览器打不开，跳过。
sync_app_store_url() {
  url=$1
  [ -n "$url" ] || return 0
  case "$url" in
    *://homeos-store*|http://127.0.0.1:*|https://127.0.0.1:*|http://localhost:*|https://localhost:*)
      return 0
      ;;
  esac
  store_current=$(env_value APP_STORE_URL)
  case "$store_current" in
    ""|http://127.0.0.1:8802|https://127.0.0.1:8802|http://localhost:8802|https://localhost:8802) ;;
    *) return 0 ;;
  esac
  env_set APP_STORE_URL "$url"
}

require_license_server() {
  [ "$ROLE" = "app" ] || return 0
  current=$(env_value APP_LICENSE_SERVER_URL)
  case "$current" in
    ""|http://homeos-store:8802|http://127.0.0.1:8802) current="" ;;
  esac
  if [ -n "$current" ]; then
    info "授权服务器：$current"
    sync_app_store_url "$current"
    return 0
  fi
  if [ -n "$LICENSE_SERVER" ]; then
    env_set APP_LICENSE_SERVER_URL "$LICENSE_SERVER"
    sync_app_store_url "$LICENSE_SERVER"
    return 0
  fi
  die "--role app（客户机）必须指定中心商店地址：--license-server http://<中心商店IP或域名>:8802，或在 .env 里写 APP_LICENSE_SERVER_URL。该地址须从本机能访问；只有换成真实证书的反代后才用 https://。"
}

# 客户机部署完打印一次激活入口提示（授权码由中心商店 /admin 发放）。
announce_activation() {
  [ "$ROLE" = "app" ] || return 0
  info "激活：登录主应用后按提示进入 /activate，填入中心商店发放的激活码（用商店购买邮箱）"
  info "公钥取回结果：docker logs homeos | grep 授权公钥"
}

# ---------------------------------------------------------------- 授权公钥

# 公钥不由本脚本投放：同机部署时主应用只读挂载商店写出的共享卷，分拆部署时主应用
# 启动自己向授权服务器 ``GET /v2/keys`` 取回（见 ops/docker/bootstrap_keys.py）。
# 这里只在商店部署完成后打印一次指纹，供跨机核对。

# ---------------------------------------------------------------- 宿主标识

ensure_one_bind() {
  target=$1
  source=$2
  # 建父目录必须**容忍失败**：脚本是 set -e，而 macOS（/ 下没有 /host）、只读根文件系统的
  # NAS、以及普通用户无权在 / 下建目录时，`mkdir -p /host/etc` 会失败并直接中止整个部署，
  # 报错只是一个没有指向性的 "Permission denied"。这两个绑定本来就允许缺席（compose 会
  # 自己建出目录，指纹退到 data/ 兜底 ID），所以这里降级成警告继续。
  ensure_parent_dir() {
    parent=$(dirname "$target")
    if [ -d "$parent" ]; then
      return 0
    fi
    if ! run mkdir -p "$parent" 2>/dev/null; then
      warn "无法创建 ${parent}（多半需要 root）：宿主标识将缺席，指纹退到 data/ 兜底 ID。要修复请看下方命令。"
      return 1
    fi
    return 0
  }
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
    ensure_parent_dir || return 0
    if ! maybe_sudo rmdir "$target"; then
      warn "无法删除目录 ${target}（需要 root）：sudo rmdir $target && sudo ln -sfn $source $target"
      return 0
    fi
  fi
  ensure_parent_dir || return 0
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
  log "③ 反向代理"
  # 公网接入时镜像内置的反代只是内网备用，对外入口是镜像外那层真实证书反代；
  # 这时把域名摆到最前面，别让运维照着 <本机IP>:8802 去配客户机（在公网拓扑下是错的）。
  public_domain=${STORE_DOMAIN:-$(env_value STORE_DOMAIN)}
  if [ "$ROLE" != "app" ] && [ -n "$public_domain" ]; then
    log "外部入口：https://${public_domain}（真实证书，客户机与支付回调都用这个地址）"
    info "镜像内置反代（自签）仍在本机可用，仅供排障；不要拿它当对外地址"
    info "商店 HTTP 备用：http://<本机局域网IP>:$(publish_port STORE_PUBLISH_PORT 8802)"
    if [ "$ROLE" = "all" ]; then
      info "主应用 HTTPS：https://<本机局域网IP>:$(publish_port APP_PROXY_PUBLISH_PORT 8803)（自签，首次需手动放行）"
    fi
  else
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
  fi
  if [ "$ROLE" != "store" ]; then
    info "两端口都要能登录时把 APP_COOKIE_SECURE 设为 false（商店侧同理）"
  fi
}

# 商店侧的公网接入叠加文件（可选）。
#
# 关键：公网部署是「store.yml + store.public.yml」两个文件一起用的。如果后续升级只跑
# store.yml，compose 会用**内网**环境变量重建商店容器 —— STORE_BASE_URL、
# STORE_COOKIE_SECURE、可信代理会一起悄悄退回内网值（支付回调地址也跟着错），
# 而容器看起来是健康的。所以这里按 .env 里的 STORE_DOMAIN 自动带上叠加文件。
# 公网接入时的端口暴露体检。
#
# 商店自身发布的 8802（明文 HTTP）与 8804（自签 HTTPS）本该只留在回环，对外由带真实证书
# 的反代承担。若这两个端口仍以 `0.0.0.0` 发布，等于把运维后台的明文入口直接摆到公网：
# TLS 被绕过，登录与 Cookie 全走明文，反代上的限流与审计也一并失效。
# 判断「绑到所有网卡」的可靠特征就是发布串里没有主机地址（`8802:8802` 对 `127.0.0.1:8802:8802`）。
warn_public_exposure() {
  exposed=
  # fallback 必须与 compose 里的默认值一致：端口「没设」时 compose 用 ${VAR:-8802}，
  # 一样会绑 0.0.0.0，所以留空不能算安全。
  for pair in "STORE_PUBLISH_PORT 8802" "STORE_PROXY_PUBLISH_PORT 8804"; do
    key=${pair% *}
    fallback=${pair#* }
    value=$(publish_port "$key" "$fallback")
    # 判据是「有没有显式收到回环」，不是「有没有冒号」：`0.0.0.0:8802` 一样是全网卡暴露，
    # 只看冒号会把它当成安全配置放过去。
    case "$value" in
      127.*|localhost*|"[::1]"*) ;;            # 显式回环 → 收在本地，OK
      *) exposed="$exposed $key=$value" ;;
    esac
  done
  [ -n "$exposed" ] || return 0
  warn "公网模式下商店端口仍绑定在所有网卡：${exposed# }"
  warn "  这会让明文 8802 / 自签 8804 直接暴露，绕过真实证书反代（后台明文可见、限流与审计失效）。"
  warn "  建议在 .env 收到回环后再重跑："
  warn "    STORE_PUBLISH_PORT=127.0.0.1:8802"
  warn "    STORE_PROXY_PUBLISH_PORT=127.0.0.1:8804"
  return 0
}

# 公网参数形态校验。
#
# 这几项填错时，症状是 Caddy 在容器日志里反复「证书申请失败 / 配置解析失败」，运维很难
# 把它和一个字符联系起来。挡住比事后排查便宜，而且公网入口一旦配错就是对外不可用。
validate_public_env() {
  domain=$1
  case "$domain" in
    *://*|*/*|*" "*|*"	"*)
      die "STORE_DOMAIN 只填主机名，不要带协议 / 路径 / 空格：${domain}（应形如 store.example.com）"
      ;;
  esac
  case "$domain" in
    *:*)
      die "STORE_DOMAIN 不要带端口或写成 IPv6 字面量：${domain}（对外固定走 80/443，由叠加文件映射）"
      ;;
  esac
  # 裸 IPv4 拿不到公共 CA 证书：ACME 只给域名签发。填 IP 会让 Caddy 永远申请失败，
  # 而 https://<IP> 也就永远连不上。只在「整串由数字和点组成」时判定为 IP，避免误伤域名。
  case "$domain" in
    *[!0-9.]*) ;;
    *) die "STORE_DOMAIN 是 IP 地址（${domain}）：ACME 无法为裸 IP 签发可信证书，公网接入不会成功。请填已解析到本机的域名。" ;;
  esac

  email=${ACME_EMAIL:-$(env_value ACME_EMAIL)}
  [ -n "$email" ] || die "公网接入必须设置 ACME_EMAIL（证书到期通知邮箱）"
  case "$email" in
    *@*.*) ;;
    *) warn "ACME_EMAIL 看起来不是邮箱：${email}（不影响签发，但证书到期 / 吊销通知收不到）" ;;
  esac

  # STORE_BASE_URL 决定支付回调地址的推导结果，和域名不一致会把回调指到别的站点。
  base=${STORE_BASE_URL:-$(env_value STORE_BASE_URL)}
  expected="https://${domain}"
  if [ -n "$base" ] && [ "$base" != "$expected" ]; then
    warn "STORE_BASE_URL=${base} 与 STORE_DOMAIN 推出的 ${expected} 不一致：支付回调会用前者，请确认这是你要的地址。"
    info "  （若通过 STORE_ALIPAY_NOTIFY_URL / STORE_WECHAT_NOTIFY_URL 单独指定回调地址，可忽略）"
  fi
  return 0
}

resolve_store_overlay() {
  STORE_EXTRA_FILES=""
  [ "$ROLE" = "app" ] && return 0
  overlay=docker-compose.store.public.yml
  [ -f "$COMPOSE_DIR/$overlay" ] || return 0
  domain=${STORE_DOMAIN:-$(env_value STORE_DOMAIN)}
  if [ -n "$domain" ]; then
    # 叠加文件把 Caddyfile 以 bind 方式挂进去；源文件缺失时 Docker 会把它建成**目录**，
    # Caddy 起不来、容器反复重启。宁可不启用叠加并说清楚，也不要等到容器崩了再查。
    caddyfile=ops/deploy/Caddyfile.public.example
    if [ ! -f "$COMPOSE_DIR/$caddyfile" ]; then
      warn "设置了 STORE_DOMAIN 但缺少 ${caddyfile}：本次不加载 ${overlay}（否则容器会因挂载源缺失而起不来）。请补齐该文件，或用 git pull 更新部署目录。"
      return 0
    fi
    STORE_EXTRA_FILES="-f $overlay"
    validate_public_env "$domain"
    info "公网接入叠加：${overlay}（STORE_DOMAIN=${domain}）"
    warn_public_exposure
    return 0
  fi
  # 没有 STORE_DOMAIN 就保持安静：这个 overlay 文件躺在仓库里，每次开发 / 自测跑
  # --role all 都警告一遍会把警告训成噪音。只在**有证据表明这台机器曾经公网部署过**
  # （overlay 起出的 caddy-public 数据卷还在）时才提示——那才是真会踩到的场景。
  if [ "$DRY_RUN" -eq 0 ] && command -v docker >/dev/null 2>&1 \
    && docker volume inspect homeos-store_caddy-public-data >/dev/null 2>&1; then
    warn "这台机器有公网接入的数据卷，但 .env 里没有 STORE_DOMAIN：本次不会加载 ${overlay}，重建商店会退回内网设置（回调地址、Cookie Secure、可信代理一起失效）。请补齐 STORE_DOMAIN / STORE_BASE_URL / ACME_EMAIL。"
  fi
  return 0
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
  log "① 授权商店（homeos-store）"
  if ! run_log docker compose -f docker-compose.store.yml $STORE_EXTRA_FILES pull; then diagnose_pull_failure; return 1; fi
  run docker compose -f docker-compose.store.yml $STORE_EXTRA_FILES up -d
  wait_healthy homeos-store 180 || return 1
  store_http=$(publish_port STORE_PUBLISH_PORT 8802)
  store_https=$(publish_port STORE_PROXY_PUBLISH_PORT 8804)
  public_domain=${STORE_DOMAIN:-$(env_value STORE_DOMAIN)}
  if [ -n "$public_domain" ]; then
    info "商店（公网）：https://${public_domain}/setup（首次部署在此建管理员）"
    info "商店（内网备用）：http://<主机>:${store_http}/setup"
  else
    info "商店：http://<主机>:${store_http}/setup（HTTPS：https://<主机>:${store_https}/setup；首次部署在此建管理员）"
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    info "授权公钥指纹（主应用会自动取回；跨机部署可用它核对）："
    docker exec homeos-store sha256sum /data/client-keys/license-public.pem /data/client-keys/license-transport-public.pem 2>/dev/null | sed 's/^/    /' || true
  fi
  # 中心商店跑完，把客户机该执行的命令照抄给运维，避免手抄写错地址 / 端口。
  # 地址就是客户机要能访问到的那个：公网接入用域名，内网用 HTTP 端口。
  info "客户机部署命令（在每台客户机上执行）："
  if [ -n "$public_domain" ]; then
    info "  ./ops/deploy/deploy.sh --role app --license-server https://${public_domain}"
  else
    info "  ./ops/deploy/deploy.sh --role app --license-server http://<中心商店>:${store_http}"
  fi
  info "客户机要能访问该地址；跨公网 / 要真实证书见 ops/deploy/PUBLIC-ACCESS.md"
  return 0
}

deploy_app() {
  log "② 主应用（homeos）"
  if [ "$ROLE" = "app" ]; then
    APP_EXTRA_FILES=""
    if [ "$DRY_RUN" -eq 0 ]; then
      if docker network inspect homeos-net >/dev/null 2>&1 || docker volume inspect homeos-client-keys >/dev/null 2>&1; then
        warn "这台机器上有商店的共享网络 / 公钥卷：如果商店也在本机，请改用 --role all"
      fi
    fi
  else
    APP_EXTRA_FILES="-f docker-compose.app.shared.yml"
  fi
  if ! run_log docker compose -f docker-compose.app.yml $APP_EXTRA_FILES pull; then diagnose_pull_failure; return 1; fi
  run docker compose -f docker-compose.app.yml $APP_EXTRA_FILES up -d
  wait_healthy homeos 300 || return 1
  return 0
}

summary() {
  log ""
  log "完成。"
  # 只列本次真正部署过的那一侧，避免 --role store 时打印空的 app 项目。
  if [ "$DRY_RUN" -eq 0 ]; then
    case "$ROLE" in
      store) docker compose -f docker-compose.store.yml $STORE_EXTRA_FILES ps 2>/dev/null || true ;;
      app)   docker compose -f docker-compose.app.yml $APP_EXTRA_FILES ps 2>/dev/null || true ;;
      all)
        docker compose -f docker-compose.store.yml $STORE_EXTRA_FILES ps 2>/dev/null || true
        docker compose -f docker-compose.app.yml $APP_EXTRA_FILES ps 2>/dev/null || true
        ;;
    esac
  fi
  if [ "$ROLE" = "store" ]; then
    public_domain=${STORE_DOMAIN:-$(env_value STORE_DOMAIN)}
    if [ -n "$public_domain" ]; then
      info "商店入口：https://${public_domain}（/setup 建管理员、/admin 运营后台）"
    else
      info "商店入口：http://<主机>:$(publish_port STORE_PUBLISH_PORT 8802)/setup（首次部署在此建管理员）"
    fi
  fi
  if [ "$ROLE" != "store" ]; then
    app_https=$(publish_port APP_PROXY_PUBLISH_PORT 8803)
    app_http=$(publish_port APP_PUBLISH_PORT 8801)
    info "主应用注册：https://<主机>:${app_https}/register（HTTP 备用 http://<主机>:${app_http}/register；旧 /setup 会跳转到这里）"
    info "首次部署为「零用户」：打开任一地址都会跳到注册页，填账号 / 密码 / 邮箱 / 邮箱验证码"
    if [ "$ROLE" = "app" ]; then
      # dry-run 下 env_set 不落盘，env_value 读不到，就用本次传入的 --license-server 兜底，
      # 否则预演里最该看清的一项反而是空的。
      license_url=$(env_value APP_LICENSE_SERVER_URL)
      [ -n "$license_url" ] || license_url=$LICENSE_SERVER
      info "授权服务器：${license_url:-（未设置）}"
      announce_activation
    fi
  fi
  info "升级/回滚：ops/deploy/upgrade.sh --role <store|app> --version <tag>（先中心商店、后客户机）；不要删数据卷"
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
if [ "$ROLE" != "store" ] && [ -n "${HOMEOS_IMAGE:-}" ]; then info "主应用镜像：$HOMEOS_IMAGE"; fi
if [ "$ROLE" != "app" ] && [ -n "${HOMEOS_STORE_IMAGE:-}" ]; then info "商店镜像：$HOMEOS_STORE_IMAGE"; fi
require_license_server
ensure_host_binds
resolve_store_overlay

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
