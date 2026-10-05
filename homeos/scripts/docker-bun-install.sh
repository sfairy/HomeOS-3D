#!/bin/sh
# Docker arm64 下 bun 解压大包（如 echarts）偶发失败：清缓存、降并发、分步安装与重试
# amd64 首次尝试提高 concurrent-scripts；失败或 arm64 仍降并发保稳
set -eu

MAX_ATTEMPTS=5

has_filter=false
for arg in "$@"; do
  case "$arg" in
    --filter|--filter=*) has_filter=true ;;
  esac
done

arch="$(uname -m 2>/dev/null || echo unknown)"
is_arm=false
case "$arch" in
  aarch64|arm64|armv7l|armv8*) is_arm=true ;;
esac

clear_all() {
  rm -rf node_modules frontend/node_modules packages/shared/node_modules
  # 不删 BuildKit 挂载的 /root/.bun/install/cache，避免打穿跨层缓存
  rm -rf /tmp/bun-cache 2>/dev/null || true
  bun pm cache rm 2>/dev/null || true
}

attempt=1

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "=== bun install attempt ${attempt}/${MAX_ATTEMPTS} (arch=${arch}) ==="

  if [ "$is_arm" = true ] || [ "$attempt" -ge 2 ]; then
    flags="--concurrent-scripts 1"
  else
    flags="--concurrent-scripts 4"
  fi

  if [ "$attempt" -ge 2 ]; then
    clear_all
    flags="$flags --no-cache"
    export BUN_INSTALL_CACHE_DIR=/tmp/bun-cache
    mkdir -p "$BUN_INSTALL_CACHE_DIR"
  fi

  if [ "$attempt" -ge 3 ]; then
    flags="$flags --backend copyfile"
  fi

  # shellcheck disable=SC2086
  if [ "$has_filter" = true ]; then
    echo "bun install $flags $* (filtered)"
    if bun install $flags "$@"; then
      echo "bun install succeeded (filtered) on attempt ${attempt}"
      exit 0
    fi
  elif [ "$attempt" -ge 4 ]; then
    echo "bun install $flags $* --filter !homeos-dashboard"
    if bun install $flags "$@" --filter '!homeos-dashboard' \
      && bun install $flags "$@" --filter './frontend'; then
      echo "bun install succeeded (split) on attempt ${attempt}"
      exit 0
    fi
  elif bun install $flags "$@"; then
    echo "bun install succeeded on attempt ${attempt}"
    exit 0
  fi

  echo "bun install failed on attempt ${attempt}"
  sleep $((attempt * 15))
  attempt=$((attempt + 1))
done

echo "bun install failed after ${MAX_ATTEMPTS} attempts"
exit 1
