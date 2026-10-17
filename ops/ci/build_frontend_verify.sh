#!/usr/bin/env bash
#
# 前端产物构建 + 结构断言：装依赖 → 校验 three 运行时副本 → `bun run build:frontend` → 校验 dist/ 的关键产物。
#
# 为什么抽成脚本：这段逻辑有两个调用方 ——
#   1. `.github/workflows/docker.yml` 的 frontend job（构建出的 dist/ 作为制品交给镜像矩阵）；
#   2. `.github/workflows/build-check.yml`（只构建、不推镜像的手动验证入口）。
# 复制两份必然漂移：一处改了另一处没改，红灯只会在下一次手动 dispatch 才暴露。
#
# 在本地跑得通不等于在 CI 上跑得通：`dist/` 被 gitignore，本地可能有旧产物兜着。
# 2026-10-10 的构建锁 ENOENT 就是「本地绿、CI 红」—— 锁文件父目录 `dist/homeos/` 在
# 干净检出里不存在。所以**本地验证本脚本时必须先 `rm -rf dist`**，否则等于没测。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

bun install --frozen-lockfile

# three 运行时副本的漂移检查：副本（public/static/vendor/three/<版本>/）由
# `homeos/frontend/scripts/build-three-vendor.mjs` 从 node_modules/three 单向生成，
# 但它是提交进仓库的静态资源，npm 侧升级后不会自动跟着变。
# 放在 build 之前：这条挂掉时能直接指出「npm 升了 three、副本没跟上」，
# 而如果等到 dist 断言，症状只会是「某个 /static/vendor/three/... 路径 404」，
# 排查方向完全不同。
bun run --cwd homeos/frontend sync:three:check

bun run build:frontend

# 混淆与产物结构断言。
grep -q '_0x' dist/homeos/frontend/static/logging/client-log.js
grep -q '_0x' dist/homeos-store/frontend/static/auth-bootstrap.js
test -f dist/homeos/frontend/static/vendor/three/0.186.1/three.module.min.js
test -f dist/homeos-store/frontend/static/store.css
test -f dist/homeos/frontend/index.html
test -f dist/homeos-store/frontend/index.html

echo "前端产物构建与结构断言通过。"
