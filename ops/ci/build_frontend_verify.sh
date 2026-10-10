#!/usr/bin/env bash
#
# 前端产物构建 + 结构断言：装依赖 → `bun run build:frontend` → 校验 dist/ 的关键产物。
#
# 为什么抽成脚本：这段逻辑有两个调用方 ——
#   1. `.github/workflows/docker.yml` 的 build 矩阵 job（镜像要用 dist/，不能拆成独立 job）；
#   2. `.github/workflows/build-check.yml`（只构建、不推镜像的手动验证入口）。
# 复制两份必然漂移，而「一处改了另一处没改」在本仓已经出过事：
# 8d3be3e7 搬走 SettingsLicensePanel.vue 后，verify:features 里硬编码的路径没跟着改，
# 红灯在 main 上躺到下一次手动 dispatch 才暴露。
#
# 在这里跑得通 ≠ 在 CI 上跑得通的历史教训：`dist/` 被 gitignore，本地通常有历史产物兜着。
# 2026-10-10 的构建锁 ENOENT 就是「本地绿、CI 红」—— 锁文件父目录 `dist/homeos/` 在
# 干净检出里不存在。所以**本地验证本脚本时必须先 `rm -rf dist`**，否则等于没测。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

bun install --frozen-lockfile
bun run build:frontend

# 混淆与产物结构断言。
grep -q '_0x' dist/homeos/frontend/static/logging/client-log.js
grep -q '_0x' dist/homeos-store/frontend/static/auth-bootstrap.js
test -f dist/homeos/frontend/static/vendor/three/0.186.0/three.module.min.js
test -f dist/homeos-store/frontend/static/store.css
test -f dist/homeos/frontend/index.html
test -f dist/homeos-store/frontend/templates/index.html

echo "前端产物构建与结构断言通过。"
