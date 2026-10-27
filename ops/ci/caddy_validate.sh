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
  caddy_version="${caddy_image#caddy:}"
  caddy_version="${caddy_version%%-*}"
  echo "caddy 版本（取自 Dockerfile）：${caddy_version}"

  curl -sSL -o /tmp/caddy.tar.gz \
    "https://github.com/caddyserver/caddy/releases/download/v${caddy_version}/caddy_${caddy_version}_linux_amd64.tar.gz"
  tar -xzf /tmp/caddy.tar.gz -C /tmp caddy
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
