#!/usr/bin/env bash
#
# 打包「客户精简分发」：只含主应用（app）侧文件，不含商店源码、授权私钥与公钥。
#
#   ops/deploy/pack-customer.sh                 # 产出 build/customer-pack/homeos-app-<version>/
#                                               #   与 homeos-app-<version>.tar.gz(.sha256)
#   ops/deploy/pack-customer.sh --version 0.7.1 # 覆盖包内版本号（默认取仓库 package.json）
#   ops/deploy/pack-customer.sh --out /tmp/pack # 自定义输出目录
#   ops/deploy/pack-customer.sh --dir-only      # 只产出目录，不压缩
#
# 客户拿到包后，在客户机上执行（等价于 --role app）：
#   ./install.sh --license-server http://<中心商店>:8802
#
# 包里有什么、为什么这样切分，见 ops/deploy/CUSTOMER.md。
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)

VERSION_ARG=
OUT_DIR="$REPO_DIR/build/customer-pack"
DIR_ONLY=0

log()  { printf '%s\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die()  { printf '错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
用法：ops/deploy/pack-customer.sh [选项]

  --version TAG   包内版本号（默认：仓库根 package.json 的 version）
  --out DIR       输出目录（默认：<仓库>/build/customer-pack）
  --dir-only      只产出解包目录，不生成 tar.gz
  -h, --help      显示本帮助

产物（客户机只需这两个文件之一）：
  homeos-app-<version>/            解包目录，内含 install.sh
  homeos-app-<version>.tar.gz      上传到客户机后解包的压缩包
  homeos-app-<version>.tar.gz.sha256

包内文件（只有主应用部署所需的这些）：
  docker-compose.app.yml   .env.example   package.json   install.sh
  ops/deploy/deploy.sh     ops/deploy/upgrade.sh          ops/deploy/CUSTOMER.md
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)  [ $# -ge 2 ] || die "--version 缺少取值"; VERSION_ARG=$2; shift 2 ;;
    --version=*) VERSION_ARG=${1#*=}; shift ;;
    --out)      [ $# -ge 2 ] || die "--out 缺少取值"; OUT_DIR=$2; shift 2 ;;
    --out=*)    OUT_DIR=${1#*=}; shift ;;
    --dir-only) DIR_ONLY=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          printf '未知参数：%s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

package_version() {
  file="$REPO_DIR/package.json"
  [ -f "$file" ] || return 0
  sed -n 's/^  "version":[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -n 1
}

VERSION=${VERSION_ARG:-$(package_version)}
[ -n "$VERSION" ] || die "无法确定版本号：package.json 里没有 version，也没有传 --version"
case "$VERSION" in
  */*|*' '*|*:*) die "--version 只能是 tag 形式的版本号（收到：${VERSION}）" ;;
esac

# 必须存在的源文件：缺一个就说明仓库不完整，宁可报错也不产出半成品包。
required_files=(
  docker-compose.app.yml
  .env.example
  package.json
  ops/deploy/deploy.sh
  ops/deploy/upgrade.sh
  ops/deploy/CUSTOMER.md
)
for rel in "${required_files[@]}"; do
  [ -f "$REPO_DIR/$rel" ] || die "缺少源文件：${rel}（请在仓库根运行，或先 git pull 补全）"
done

PACK_NAME="homeos-app-$VERSION"
STAGE="$OUT_DIR/$PACK_NAME"

# 输出目录可能就在仓库里（默认 build/），先清掉上一次的残留，避免旧文件混进包里。
rm -rf "$STAGE"
mkdir -p "$STAGE/ops/deploy"

for rel in "${required_files[@]}"; do
  cp "$REPO_DIR/$rel" "$STAGE/$rel"
done
chmod 0755 "$STAGE/ops/deploy/deploy.sh" "$STAGE/ops/deploy/upgrade.sh"

# 客户机上的一键入口：把 --role app 固定下来，其余参数原样透传给 deploy.sh。
cat > "$STAGE/install.sh" <<'INSTALL'
#!/usr/bin/env bash
#
# HomeOS 主应用安装（客户机）。等价于：
#   ops/deploy/deploy.sh --role app "$@"
#
#   ./install.sh --license-server http://<中心商店>:8802
#
# 环境里有 APP_LICENSE_SERVER_URL 时也可省略 --license-server
# （传入时会同时钉住 APP_STORE_URL）。
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
exec "$DIR/ops/deploy/deploy.sh" --role app "$@"
INSTALL
chmod 0755 "$STAGE/install.sh"

# 精简包里不该出现商店侧的东西：万一将来有人误加进来，这里直接拦住。
if [ -e "$STAGE/docker-compose.store.yml" ] || [ -e "$STAGE/homeos-store" ] || [ -e "$STAGE/keys" ]; then
  die "客户包混入了商店侧文件（store compose / homeos-store / keys）：请检查 pack 脚本"
fi

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

{
  echo "package: $PACK_NAME"
  echo "version: $VERSION"
  echo "built_at: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  if commit=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null); then
    echo "commit: $commit"
  fi
  echo "image_app: ghcr.io/sfairy/homeos:$VERSION"
  echo
  echo "files:"
  ( cd "$STAGE" && find . -type f ! -name MANIFEST.txt | LC_ALL=C sort | while read -r f; do
      printf '  %s  %s\n' "$(sha256_of "$STAGE/${f#./}")" "${f#./}"
    done )
} > "$STAGE/MANIFEST.txt"

info "客户包目录：$STAGE"
info "版本：$VERSION"
if [ -n "${commit:-}" ]; then info "提交：$commit"; fi
info "包内文件："
( cd "$STAGE" && find . -type f | LC_ALL=C sort | sed 's/^/    /' )

if [ "$DIR_ONLY" -eq 1 ]; then
  log ""
  info "按 --dir-only 跳过压缩。"
  exit 0
fi

ARCHIVE="$OUT_DIR/$PACK_NAME.tar.gz"
( cd "$OUT_DIR" && tar -czf "$PACK_NAME.tar.gz" "$PACK_NAME" )
sha256_of "$ARCHIVE" > "$ARCHIVE.sha256"

# 只保留 tarball 与校验和，目录留给本机调试用（--dir-only 时也保留）。
log ""
info "压缩包：$ARCHIVE"
info "校验和：$ARCHIVE.sha256"
info "客户机安装：scp $PACK_NAME.tar.gz <客户机>: && tar xzf $PACK_NAME.tar.gz && cd $PACK_NAME && ./install.sh --license-server http://<中心商店>:8802"
