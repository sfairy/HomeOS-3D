#!/usr/bin/env bash
#
# 把「homeos-3d 命名时代」的部署原地搬到新命名。
#
# 起因：主应用与商店的容器名 / 卷名 / 镜像名统一去掉了 `-3d`：
#
#   容器    homeos-3d          → homeos
#           homeos-3d-store    → homeos-store
#   镜像    ghcr.io/sfairy/homeos-3d        → ghcr.io/sfairy/homeos
#           ghcr.io/sfairy/homeos-3d-store  → ghcr.io/sfairy/homeos-store
#   网络    homeos-3d-net      → homeos-net
#   卷      （见下面 LEGACY_VOLUMES）
#
# compose 的卷名带项目名前缀，项目名又来自 compose 文件里的 `name:`，所以改名之后
# 同一个物理卷在新项目里会变成另一个名字 —— 不做迁移的话 `up -d` 会静默新建空卷，
# **数据看起来全部丢失**（数据库、HA 凭据、授权私钥、自签证书都在这几个卷里）。
#
# 本脚本采用「复制而非改名」：旧卷原样保留，新旧并存。核对无误后再自己删旧卷，
# 出问题也能立刻回滚。
#
# 用法：
#   ops/deploy/migrate_naming.sh --dry-run     # 只打印将要执行的动作，不动任何东西
#   ops/deploy/migrate_naming.sh               # 交互确认后执行
#   ops/deploy/migrate_naming.sh --yes         # 不交互（脚本化 / 无人值守）
#   ops/deploy/migrate_naming.sh --env-file /opt/homeos/.env
#
# 前置条件（脚本会自己检查并提示）：
#   1. 旧容器已停止（脚本会替你停 homeos-3d / homeos-3d-store / homeos-3d-store-caddy）；
#   2. 磁盘余量足够放下这些卷的副本（复制期间新旧各占一份）；
#   3. 在**仓库根目录**执行（需要 docker-compose.*.yml 来定位 .env）。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# ---------------------------------------------------------------- 参数

DRY_RUN=0
ASSUME_YES=0
ENV_FILE="$ROOT/.env"

usage() {
  sed -n '3,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --env-file) shift; ENV_FILE="${1:-}" ;;
    -h|--help) usage 0 ;;
    *) echo "未知参数：$1" >&2; usage 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------- 输出

if [ -t 1 ]; then
  C_DIM=$'\033[2m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_OK=''; C_WARN=''; C_ERR=''; C_OFF=''
fi

log() { printf '%s==>%s %s\n' "$C_DIM" "$C_OFF" "$*"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '%s  ✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%s  !%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
die() { printf '%s错误：%s%s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '    %s[dry-run]%s %s\n' "$C_DIM" "$C_OFF" "$*"
    return 0
  fi
  "$@"
}

run_log() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '    %s[dry-run]%s %s\n' "$C_DIM" "$C_OFF" "$*"
    return 0
  fi
  "$@" >/dev/null 2>&1
}

volume_exists() { docker volume inspect "$1" >/dev/null 2>&1; }
container_exists() { docker container inspect "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- 映射表
#
# 第一列 = 旧卷的**实际**名字（compose 项目名 + 卷逻辑名；显式 `name:` 的卷不带前缀）。
# 第二列 = 新卷的实际名字。第三列只是给人看的说明。

LEGACY_VOLUMES=(
  "homeos-3d_homeos-3d-data|homeos_homeos-data|主应用数据（数据库 / HA 凭据 / 公钥缓存 / 自签证书）"
  "homeos-3d_homeos-3d-secrets|homeos_homeos-secrets|主应用密钥（HA / 授权凭据签名密钥）"
  "homeos-3d-store_homeos-3d-store-data|homeos-store_homeos-store-data|商店数据库与商品图"
  "homeos-3d-store_homeos-3d-license-keys|homeos-store_homeos-license-keys|商店授权私钥（最关键）"
  "homeos-3d-client-keys|homeos-client-keys|共享公钥卷（同机 --role all 用）"
  "homeos-3d-store_caddy-public-data|homeos-store_caddy-public-data|公网 Caddy 证书与 ACME 账号"
  "homeos-3d-store_caddy-public-config|homeos-store_caddy-public-config|公网 Caddy 配置状态"
)

LEGACY_NETWORKS=("homeos-3d-net|homeos-net|容器内网（主应用与商店互访）")

LEGACY_CONTAINERS=("homeos-3d" "homeos-3d-store" "homeos-3d-store-caddy")

# 复制助手镜像：只用它做 `cp -a`，所以用最小且带 cp 的镜像。
# 想避免联网拉取就换成本机已有的任意带 coreutils 的镜像。
HELPER_IMAGE="${MIGRATE_HELPER_IMAGE:-alpine:3.20}"

# ---------------------------------------------------------------- 前置检查

command -v docker >/dev/null 2>&1 || die "找不到 docker。"
docker info >/dev/null 2>&1 || die "docker 不可用（守护进程未启动，或当前用户没有权限）。"

log "检查待迁移的旧卷"
FOUND=0
for entry in "${LEGACY_VOLUMES[@]}"; do
  IFS='|' read -r old new desc <<<"$entry"
  if volume_exists "$old"; then
    ok "$old  ${C_DIM}（$desc）${C_OFF}"
    FOUND=$((FOUND + 1))
  fi
done

if [ "$FOUND" -eq 0 ]; then
  log "没有找到任何旧命名卷 —— 这台机器要么本来就是新命名，要么从未部署过。"
  info "如果确认是全新部署，直接 ops/deploy/deploy.sh 即可。"
  exit 0
fi

log "检查新命名卷是否已被占用（占用则说明迁移做过一半）"
CONFLICT=0
for entry in "${LEGACY_VOLUMES[@]}"; do
  IFS='|' read -r _old new desc <<<"$entry"
  if ! volume_exists "${old}"; then continue; fi
  if volume_exists "$new"; then
    warn "$new 已存在（$desc）—— 迁移过一半，或已手动建过空卷"
    CONFLICT=$((CONFLICT + 1))
  fi
done
if [ "$CONFLICT" -gt 0 ]; then
  warn "脚本不会覆盖已存在的目标卷（避免把好不容易复制的数据再盖回旧的）。"
  warn "确认目标卷是空壳后先删掉它：docker volume rm <卷名>，再重跑本脚本。"
  exit 1
fi

if [ "$ASSUME_YES" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  echo
  warn "将停止并删除旧容器（${LEGACY_CONTAINERS[*]}），并把上面 $FOUND 个卷复制到新卷。"
  warn "旧卷会被保留（不删），确认新部署正常后请自行删除。"
  printf '继续？[y/N] '
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "已取消。"; exit 0 ;;
  esac
fi

# ---------------------------------------------------------------- 停旧容器
#
# 用容器名直接停，不用 compose：仓库里的 compose 文件已经改成新项目名了，
# 拿它们去 down 只会找不到旧容器。

log "停止旧容器（容器消失 = 卷才能真正被安全复制）"
for name in "${LEGACY_CONTAINERS[@]}"; do
  if container_exists "$name"; then
    info "stop + rm $name"
    run_log docker stop "$name"
    run_log docker rm "$name"
  else
    info "跳过 $name（不存在）"
  fi
done

# ---------------------------------------------------------------- 复制卷

log "复制卷内容（旧 → 新，旧卷保留）"
for entry in "${LEGACY_VOLUMES[@]}"; do
  IFS='|' read -r old new desc <<<"$entry"
  if ! volume_exists "$old"; then
    info "跳过 $old（不存在）"
    continue
  fi
  info "$old  →  $new"
  run_log docker volume create "$new"
  # 只读挂载旧卷：即使脚本写错也改不到源数据。
  run docker run --rm \
    -v "$old":/from:ro \
    -v "$new":/to \
    "$HELPER_IMAGE" sh -c 'cp -a /from/. /to/ && sync'
done

# ---------------------------------------------------------------- 网络
#
# docker 不支持重命名网络，只能删掉旧的让新 compose 建新的。此时旧容器已经全停，
# 删除网络不会影响任何运行中的进程。同名卷与网络互不影响，网络里没有数据。

log "处理网络"
for entry in "${LEGACY_NETWORKS[@]}"; do
  IFS='|' read -r old new desc <<<"$entry"
  if docker network inspect "$old" >/dev/null 2>&1; then
    info "$old  →  $new（删旧网络，由新 compose 建；$desc）"
    run_log docker network rm "$old" || warn "网络 $old 仍有容器在用，跳过（先停干净再重跑）"
  else
    info "跳过 $old（不存在）"
  fi
done

# ---------------------------------------------------------------- .env 镜像钉

log "修正 .env 里的镜像钉（不修的话会继续拉旧 tag，表现为「升级了但版本没变」）"
if [ -f "$ENV_FILE" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] 把 $ENV_FILE 里的 ghcr.io/sfairy/homeos-3d* 改为 ghcr.io/sfairy/homeos*"
  else
    cp "$ENV_FILE" "$ENV_FILE.bak-naming-migration"
    # 先换长的那个，否则 `homeos-3d` 会先把 `homeos-3d-store` 的前缀吃掉。
    sed -i.tmp \
      -e 's#ghcr\.io/sfairy/homeos-3d-store#ghcr.io/sfairy/homeos-store#g' \
      -e 's#ghcr\.io/sfairy/homeos-3d#ghcr.io/sfairy/homeos#g' \
      "$ENV_FILE"
    rm -f "$ENV_FILE.tmp"
    info "已改写（备份：$ENV_FILE.bak-naming-migration）"
  fi
else
  info "没有 $ENV_FILE，跳过（deploy.sh 会自己写）"
fi

# ---------------------------------------------------------------- 收尾

cat <<EOF

$(log "迁移完成")
下一步：
  1. 起新部署：   ops/deploy/deploy.sh --role all        （或 --role app / --role store）
  2. 核对数据：   主应用登录（/register 或 /login，账号或邮箱均可）后看 /license 授权；商店看 /admin 的商品与订单是否还在。
     主应用最容易漏的是授权私钥与公钥缓存，快速核对：
       docker volume inspect homeos_homeos-data --format '{{.Mountpoint}}'
  3. 确认无误后删旧卷（**别提前删**，这就是回滚凭据）：
$(for entry in "${LEGACY_VOLUMES[@]}"; do IFS='|' read -r old _new _d <<<"$entry"; printf '       docker volume rm %s\n' "$old"; done)
  4. 旧签名证书：Caddy 会复用复制过来的证书；如果证书是自签的且域名没变，无需重签。

注意：这些卷与镜像名只影响本机 docker 侧，HA 配置、数据库内容、授权状态都不受影响。
EOF
