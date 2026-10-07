#!/usr/bin/env bash
#
# HomeOS 升级 / 回滚：中心商店先升，客户机再逐个升（同一个镜像 tag）。
#
#   ops/deploy/upgrade.sh --role store --version 1.0.1     # 厂商机：先升中心
#   ops/deploy/upgrade.sh --role app   --version 1.0.1     # 客户机：逐个升（.env 里已有商店地址时不必再传）
#   ops/deploy/upgrade.sh --role app --check               # 只看本机钉住的版本与容器实际版本
#
# 升级不动数据卷；等价于用同一个 --version 重跑 deploy.sh。完整清单见 ops/deploy/UPGRADE.md。
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)

ROLE=
VERSION=
CHECK=0
PASSTHROUGH=()

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '警告：%s\n' "$*" >&2; }
die()  { printf '错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
用法：ops/deploy/upgrade.sh [选项]

  --role store|app     要升级哪一侧（store = 中心厂商机，app = 客户机）；必填（--check 除外）
  --version TAG        目标版本（默认：.env 里钉住的 HOMEOS_VERSION → 仓库 package.json）
  --check              只报告本机钉住的版本与容器实际版本，不升级
  --license-server URL 客户机首次升级时透传给 deploy.sh（.env 已有则不用）
  --dry-run            只打印将要执行的命令，不写文件、不调用 docker
  -h, --help           显示本帮助

顺序（重要）：先升中心商店，确认健康、公钥可取回；再逐个升客户机。
中心与所有客户机必须用**同一个 tag**，否则授权协议里的 keyId / generation / clientVersion
可能在运行期对不上。
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --role)      [ $# -ge 2 ] || die "--role 缺少取值"; ROLE=$2; shift 2 ;;
    --role=*)    ROLE=${1#*=}; shift ;;
    --version)   [ $# -ge 2 ] || die "--version 缺少取值"; VERSION=$2; shift 2 ;;
    --version=*) VERSION=${1#*=}; shift ;;
    --check)     CHECK=1; shift ;;
    --dry-run)   PASSTHROUGH+=(--dry-run); shift ;;
    --license-server)  [ $# -ge 2 ] || die "--license-server 缺少取值"; PASSTHROUGH+=(--license-server "$2"); shift 2 ;;
    --license-server=*) PASSTHROUGH+=(--license-server "${1#*=}"); shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

resolve_dir() {
  if [ -f "$REPO_DIR/docker-compose.app.yml" ]; then printf '%s' "$REPO_DIR"; return; fi
  if [ -f "$PWD/docker-compose.app.yml" ]; then printf '%s' "$PWD"; return; fi
  die "找不到 compose 文件：请在仓库根或客户包目录运行"
}
COMPOSE_DIR=$(resolve_dir)
ENV_FILE="$COMPOSE_DIR/.env"

env_value() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= -v key="$1" '$1 == key { sub("^[^=]*=", ""); value=$0 } END { if (value != "") print value }' "$ENV_FILE"
}

package_version() {
  [ -f "$COMPOSE_DIR/package.json" ] || return 0
  sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' "$COMPOSE_DIR/package.json" | head -n 1
}

container_version() {
  container=$1
  command -v docker >/dev/null 2>&1 || return 0
  docker inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$container" 2>/dev/null || true
}

report_check() {
  pinned=$(env_value HOMEOS_VERSION)
  log "本机版本检查"
  info "目录：$COMPOSE_DIR"
  if [ -n "$pinned" ]; then
    info ".env 钉住的版本：$pinned"
  else
    info ".env 钉住的版本：（未钉住）"
  fi
  info "package.json 版本：$(package_version)"
  # 只报这台机器上**确实会跑的**容器：客户精简包里没有 store.yml，报一行空的
  # 「商店容器实际版本」会让人以为漏装了。显式 --role 时以角色为准。
  want_app=1
  want_store=1
  [ "$ROLE" = "app" ] && want_store=0
  [ "$ROLE" = "store" ] && want_app=0
  if [ "$ROLE" = "" ]; then
    [ -f "$COMPOSE_DIR/docker-compose.app.yml" ] || want_app=0
    [ -f "$COMPOSE_DIR/docker-compose.store.yml" ] || want_store=0
  fi
  [ "$want_app" -eq 1 ] && info "主应用容器实际版本：$(container_version homeos)"
  [ "$want_store" -eq 1 ] && info "商店容器实际版本：$(container_version homeos-store)"
  if [ -f "$ENV_FILE" ]; then
    info ".env 镜像：app=$(env_value HOMEOS_IMAGE) store=$(env_value HOMEOS_STORE_IMAGE)"
  else
    warn "还没有 .env：尚未部署过"
  fi
  log ""
  info "升级：ops/deploy/upgrade.sh --role <store|app> --version <tag>"
  # 末行显式返回 0：上面那些 `[ ... ] && info` 一旦条件不成立就会留下非零退出码，
  # 而 report_check 会被 set -e 下的裸调用检查返回值，不能以失败条件收尾。
  return 0
}

if [ "$CHECK" -eq 1 ]; then
  report_check
  exit 0
fi

case "$ROLE" in
  store|app) ;;
  "") die "必须指定 --role store|app（或 --check）" ;;
  *) die "--role 只能是 store / app（收到：${ROLE}）" ;;
esac

if [ -z "$VERSION" ]; then
  VERSION=$(env_value HOMEOS_VERSION)
  [ -n "$VERSION" ] || VERSION=$(package_version)
fi
[ -n "$VERSION" ] || die "无法确定目标版本：传 --version，或在 .env 写 HOMEOS_VERSION"
case "$VERSION" in
  latest) warn "目标版本是 latest：中心与各客户机可能拉到不同构建，生产建议钉具体版本号" ;;
esac

log "HomeOS 升级"
info "角色：$ROLE"
info "目标版本：$VERSION"
info "目录：$COMPOSE_DIR"

# 升级＝同一条部署命令，只是显式带上 --version（会写回 .env 钉住版本）。
# 用 ${arr[@]+...} 转写空数组：macOS 自带的 bash 3.2 在 set -u 下展开空数组会报未绑定变量。
"$SCRIPT_DIR/deploy.sh" --role "$ROLE" --version "$VERSION" ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}

log ""
log "升级完成。"
case "$ROLE" in
  store)
    info "校验公钥端点：curl -fsS <商店地址>/v2/keys | head -c 200"
    info "客户机现在应逐个升到同一版本："
    info "  ops/deploy/upgrade.sh --role app --version $VERSION"
    info "通知模板见 ops/deploy/UPGRADE.md 第 3 节。"
    ;;
  app)
    info "确认激活与心跳正常：登录后看 /license，或 docker logs homeos | grep 授权"
    info "若激活报「已绑定其他设备」，说明宿主指纹变了：请厂商后台解绑后重新激活。"
    ;;
esac
info "回滚：把 --version 换成上一个版本重跑本命令；不要删数据卷。"
