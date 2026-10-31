#!/usr/bin/env bash
# 一次完成：隔离环境 -> 启动 -> 后端/前端/3D 测量 -> 契约检查 -> 收尾。
# 用法：ops/perf/harness/run_baseline.sh <label>
# 前置：bun run build:frontend；dist 必须是本次要测量的构建。
# 注意：脚本只写 /tmp/homeos-perf 与工作区内的 ops/perf，不触碰生产 8801/8802。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LABEL="${1:?用法: run_baseline.sh <label>}"
PERF_ROOT="${HOMEOS_PERF_ROOT:-/tmp/homeos-perf}"
# 必须导给子进程：Python 的 perf_common 默认用 tempfile.gettempdir()（macOS 是
# /var/folders/.../T），Node 的 bench_frontend / bench_3d 默认 /tmp。不统一就会
# 出现"setup_env 写 A、前端脚本读 B"的 ENOENT。
export HOMEOS_PERF_ROOT="${PERF_ROOT}"
HARNESS="${ROOT}/ops/perf/harness"
DIST="${ROOT}/dist"
RESULT_DIR="${PERF_ROOT}/results/${LABEL}"

# 解释器走 ops/lib/py.mjs（与门禁同一条入口）：此前这里写死 `.venv-store/bin/python`，
# 干净检出上没有这个 venv，脚本会在第一行 python 调用处失败，且报错长得像「perf 脚本坏了」。
# 安装方式与提示统一由 `bun run dev:prepare` 负责。
py() { node "${ROOT}/ops/lib/py.mjs" "$@"; }

mkdir -p "${RESULT_DIR}" "${PERF_ROOT}/logs"
echo "==> 体积预算 + 基线指标落盘（label=${LABEL}）"
bun "${ROOT}/ops/checks/check_bundle_budget.mjs" --json > "${RESULT_DIR}/bundle.json"
echo "==> 隔离数据副本"
py "${HARNESS}/setup_env.py" --label "${LABEL}" --dist-dir "${DIST}" | tee "${PERF_ROOT}/logs/${LABEL}-setup.log"

cleanup() {
  py "${HARNESS}/bench_backend.py" --label "${LABEL}" --stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 启动隔离实例"
py "${HARNESS}/bench_backend.py" --label "${LABEL}" --serve-only

echo "==> 行为基线（模式/安防/WS，供手工清单对照）"
py "${HARNESS}/capture_behavior.py" --label "${LABEL}"

echo "==> 后端测量"
py "${HARNESS}/bench_backend.py" --label "${LABEL}" --no-start

echo "==> 前端测量（Edge / Playwright）"
(cd "${ROOT}" && node "${HARNESS}/bench_frontend.mjs" --label "${LABEL}")

echo "==> 3D 测量"
(cd "${ROOT}" && node "${HARNESS}/bench_3d.mjs" --label "${LABEL}")

echo "==> 契约检查"
py "${HARNESS}/check_contracts.py" --label "${LABEL}"

echo "==> 性能预算（3D 首帧 / 稳态 / 契约）"
(cd "${ROOT}" && node ops/checks/check_perf_budget.mjs --dir "${RESULT_DIR}") || PERF_BUDGET_EXIT=$?

cleanup
trap - EXIT

if [ -n "${COMPARE_BEFORE:-}" ]; then
  echo "==> 与 ${COMPARE_BEFORE} 对比"
  py "${HARNESS}/compare_metrics.py" --before "${COMPARE_BEFORE}" --after "${LABEL}"
  if [ -d "${PERF_ROOT}/results/${COMPARE_BEFORE}/screenshots" ]; then
    py "${HARNESS}/compare_screenshots.py" --before "${COMPARE_BEFORE}" --after "${LABEL}"
  fi
fi

echo "完成：${RESULT_DIR}"
ls -1 "${RESULT_DIR}"

if [ -n "${PERF_BUDGET_EXIT:-}" ] && [ "${PERF_BUDGET_EXIT}" -ne 0 ]; then
  exit "${PERF_BUDGET_EXIT}"
fi
