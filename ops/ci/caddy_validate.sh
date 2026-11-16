#!/usr/bin/env bash
#
# Caddyfile 静态校验：两份交付配置都必须能被 caddy 自己解析。
#
# 为什么不直接写 `caddy validate`：CI runner 上没有 brew，本机通常也没装 caddy —— 两边
# 都需要一个「从哪拿二进制」的决策。此前这段内嵌在 `.github/workflows/checks.yml` 里，
# 只走「按 Dockerfile 的 CADDY_IMAGE 版本去 GitHub 下载」一条路：
#   - CI：正确（网络可用，版本与镜像同源）；
#   - 本机：没网或没装 caddy 时静默变成一次网络失败，看起来像配置错了。
#
# 现在：
#   1. PATH 里有 caddy → 直接用（本机 `brew install caddy`）；
#   2. 否则在 CI 上下文（HOMEOS_GATE_CONTEXT=ci）里按 Dockerfile 的版本下载；
#   3. 否则退出 3（= SKIP），并打印安装提示 —— 不假装校验过。
#
# CADDY_IMAGE 允许浮动 tag（曾短暂用过 `caddy:latest`，现已回到钉死的 `caddy:2.11.9-alpine`）：
# tag 里没有完整版本号时，改问 GitHub 的 latest release 拿真实版本 —— release 资产地址是
# `/download/v<x.y.z>/`，用 tag 拼只会得到 404 的 HTML，再被 tar 当成损坏的 gzip。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

context="${HOMEOS_GATE_CONTEXT:-local}"

caddy_bin="$(command -v caddy || true)"
if [ -z "$caddy_bin" ]; then
  if [ "$context" != "ci" ]; then
    echo "跳过 Caddy 校验：本机没有 caddy（装一个即可：brew install caddy，或用 docker run 官方镜像）。" >&2
    exit 3
  fi

  # 版本单一来源：Dockerfile 的 ARG CADDY_IMAGE=…。
  caddy_image="$(sed -n 's/^ARG CADDY_IMAGE=//p' Dockerfile | head -n1)"
  if [ -z "$caddy_image" ]; then
    echo "::error::Dockerfile 里读不到 CADDY_IMAGE —— 版本单一来源断了，请修复本脚本的取值方式" >&2
    exit 1
  fi
  # `caddy:2.11.9-alpine@sha256:…` → `2.11.9`；`caddy:latest` → `latest`（下面再解析）。
  caddy_ref="${caddy_image#caddy:}"
  caddy_ref="${caddy_ref%%@*}"
  caddy_version="${caddy_ref%%-*}"
  caddy_version_source="Dockerfile"
  if [[ ! "$caddy_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # 浮动 tag（latest / 2-alpine / 2.11-alpine …）里没有完整版本号，拼不出 release URL。
    # 改问 GitHub 的 latest release：它与 `caddy:latest` 同源，校验的就是构建将拿到的那个版本。
    caddy_version="$(curl -fsSL --max-time 30 \
      https://api.github.com/repos/caddyserver/caddy/releases/latest \
      | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([0-9][0-9.]*\)".*/\1/p' | head -n1)"
    caddy_version_source="GitHub latest release（CADDY_IMAGE=${caddy_image} 无版本号）"
  fi
  if [[ ! "$caddy_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "::error::解析不出 caddy 版本号（CADDY_IMAGE=${caddy_image}，得到 '${caddy_version}'）—— 无法定位 release 资产" >&2
    exit 1
  fi
  echo "caddy 版本（${caddy_version_source}）：${caddy_version}"

  caddy_tarball=/tmp/caddy.tar.gz
  # 平台映射：原先硬编码 linux_amd64 —— CI runner（ubuntu/amd64）刚好成立，但本机用
  # `HOMEOS_GATE_CONTEXT=ci` 跑时会下到一个 Linux ELF，紧接着 `cannot execute binary file`。
  # 按 uname 映射后两边都成立；未知平台直接报错，不猜。
  case "$(uname -s)" in
    Linux) caddy_os=linux ;;
    # caddy 的 release 资产对 macOS 用的是 `mac`（不是 uname 的 `Darwin`）：
    # 拼成 caddy_<ver>_darwin_arm64.tar.gz 会 404。
    Darwin) caddy_os=mac ;;
    *)
      echo "::error::不支持的平台 $(uname -s)：无法确定 caddy release 资产" >&2
      exit 1
      ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) caddy_arch=amd64 ;;
    arm64 | aarch64) caddy_arch=arm64 ;;
    *)
      echo "::error::不支持的架构 $(uname -m)：无法确定 caddy release 资产" >&2
      exit 1
      ;;
  esac
  # -f：4xx/5xx 直接失败，不要把一个 404 页面存成 .tar.gz 再让 tar 去猜。
  curl -fsSL --max-time 120 -o "$caddy_tarball" \
    "https://github.com/caddyserver/caddy/releases/download/v${caddy_version}/caddy_${caddy_version}_${caddy_os}_${caddy_arch}.tar.gz"
  # 中间层仍可能回 200 + 错误页；这里确认一次，失败信息指向「下载」而不是「压缩包坏了」。
  if ! gzip -t "$caddy_tarball" 2>/dev/null; then
    echo "::error::下载到的 caddy 发包不是 gzip（版本 ${caddy_version}）—— 检查 release 资产名或网络中间层" >&2
    exit 1
  fi
  tar -xzf "$caddy_tarball" -C /tmp caddy
  caddy_bin=/tmp/caddy
fi

"$caddy_bin" version

# 两份配置各自要求不同的插值：主应用按域名/端口自取；公网示例必须显式给邮箱与商店域名
# （ACME_EMAIL 是 `${ACME_EMAIL:?…}` 必填占位符，不给会先于语法检查失败）。
ACME_EMAIL=ops@example.com STORE_DOMAIN=store.example.com \
  "$caddy_bin" validate --config ops/caddy/app.Caddyfile --adapter caddyfile
ACME_EMAIL=ops@example.com STORE_DOMAIN=store.example.com \
  "$caddy_bin" validate --config ops/deploy/Caddyfile.public.example --adapter caddyfile

echo "Caddyfile 校验通过（两份）。"
