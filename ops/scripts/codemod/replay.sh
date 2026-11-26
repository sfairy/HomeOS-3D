#!/usr/bin/env bash
# 从干净状态按顺序重放全部重构步骤（每步都可独立 review；这里用于本地快速验证）。
#
# 为什么需要重放脚本：任一计划失败都可能已经落盘了一部分动作（合并先写后删），
# 此时不能「接着跑」，必须 `git reset --hard` 回到基线再按顺序重放。
set -euo pipefail
cd "$(dirname "$0")/../../.."

STEPS=("$@")
if [ ${#STEPS[@]} -eq 0 ]; then
  STEPS=(s1-kernel s1b-kernel-ui s2-domain s3a-features s4a-studio-app s4b-studio-rest s5-app)
fi

# 保留两份不属于重构计划的配置改动
cp .jscpd.json /tmp/homeos-jscpd.bak
cp biome.json /tmp/homeos-biome.bak
git reset --hard HEAD >/dev/null
# 关键：`reset --hard` 不会删除未跟踪文件，而重构产物（kernel/domain/features 新目录）
# 在提交前全是未跟踪的。不清掉它们，重放就会撞上「目标已存在」。
git clean -fd homeos/frontend/src homeos-store/frontend/src >/dev/null
cp /tmp/homeos-jscpd.bak .jscpd.json
cp /tmp/homeos-biome.bak biome.json
rm -rf homeos/frontend/src/kernel homeos/frontend/src/domain

for step in "${STEPS[@]}"; do
  echo "==> ${step}"
  node ops/scripts/codemod/restructure.mjs "ops/scripts/codemod/plans/${step}.mjs" --write >/tmp/homeos-step.log 2>&1 || {
    cat /tmp/homeos-step.log
    exit 1
  }
  tail -1 /tmp/homeos-step.log
done

find homeos/frontend/src -type d -empty -delete 2>/dev/null || true

# 合并后的同名私有符号消歧（见 s4a-fixups.mjs 顶部说明）。
if printf '%s\n' "${STEPS[@]}" | grep -q '^s4a-studio-app$'; then
  node ops/scripts/codemod/s4a-fixups.mjs
fi
echo "==> done"
