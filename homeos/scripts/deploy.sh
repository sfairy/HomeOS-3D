#!/usr/bin/env bash
# 【已废弃】旧飞牛 / NAS compose 栈（HTTP 8126 / HTTPS 8443）已移除。
#
# 生产端口约定（全仓统一）：
#   主应用  HTTP 8801  /  内置 HTTPS 8803
#   商店    HTTP 8802  /  内置 HTTPS 8804
#
# 一键部署请用仓库根：
#   ./ops/deploy/deploy.sh --role store
#   ./ops/deploy/deploy.sh --role app --license-server http://<中心商店>:8802
# 文档：ops/deploy/PRODUCTION.md
set -euo pipefail

printf '%s\n' \
  '错误：homeos/scripts/deploy.sh 已废弃（旧 8126/8443 栈已移除）。' \
  '请改用仓库根 ./ops/deploy/deploy.sh。' \
  '端口：主应用 8801/8803，商店 8802/8804（见 ops/deploy/PRODUCTION.md）。' >&2
exit 1
