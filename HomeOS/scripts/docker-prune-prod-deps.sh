#!/bin/sh
# 裁剪生产镜像 node_modules 中运行时不需要的产物（不影响 migrate / API 运行时）
set -eu

echo "=== pruning production node_modules ==="

# Swagger UI 静态资源 — 生产环境从不 mount
rm -rf node_modules/swagger-ui-dist

# Prisma 相关一律不裁剪：prisma@7 的 CLI 本体是 node_modules/prisma/build/index.js，
# 且 build/cli.js 静态依赖 @prisma/studio-core/data/bff，缺任一项都会导致
# entrypoint 的 prisma migrate deploy 无法加载而启动失败。

# 非运行文件（.md / .map / TypeScript 源映射）
find node_modules -type f \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \) -delete 2>/dev/null || true

echo "=== prune complete ==="
