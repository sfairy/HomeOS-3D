#!/usr/bin/env bash
# 一次完成：隔离环境 -> 启动 -> 后端/前端/3D 测量 -> 契约检查 -> 收尾。
# 用法：ops/perf/harness/run_baseline.sh <label>
# 前置：bun run build:frontend；dist 必须是本次要测量的构建。
# 注意：脚本只写 /tmp/homeos-perf 与工作区内的 ops/perf，不触碰生产 8801/8802。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LABEL="${1:?用法: run_baseline.sh <label>}"
PERF_ROOT="${HOMEOS_PERF_ROOT:-/tmp/homeos-perf}"
HARNESS="${ROOT}/ops/perf/harness"
PY="${ROOT}/.venv-store/bin/python"
DIST="${ROOT}/dist"
RESULT_DIR="${PERF_ROOT}/results/${LABEL}"

mkdir -p "${RESULT_DIR}" "${PERF_ROOT}/logs"
echo "==> 体积预算 + 基线指标落盘（label=${LABEL}）"
bun "${ROOT}/ops/checks/check_bundle_budget.mjs" --json > "${RESULT_DIR}/bundle.json"
echo "==> 隔离数据副本"
"${PY}" "${HARNESS}/setup_env.py" --label "${LABEL}" --dist-dir "${DIST}" | tee "${PERF_ROOT}/logs/${LABEL}-setup.log"

cleanup() {
  "${PY}" "${HARNESS}/bench_backend.py" --label "${LABEL}" --stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 启动隔离实例"
"${PY}" "${HARNESS}/bench_backend.py" --label "${LABEL}" --serve-only

echo "==> 行为基线（模式/安防/WS，供手工清单对照）"
"${PY}" "${HARNESS}/capture_behavior.py" --label "${LABEL}"

echo "==> 后端测量"
"${PY}" "${HARNESS}/bench_backend.py" --label "${LABEL}" --no-start

echo "==> 前端测量（Edge / Playwright）"
(cd "${ROOT}" && node "${HARNESS}/bench_frontend.mjs" --label "${LABEL}")

echo "==> 3D 测量"
(cd "${ROOT}" && node "${HARNESS}/bench_3d.mjs" --label "${LABEL}")

echo "==> 契约检查"
"${PY}" "${HARNESS}/check_contracts.py" --label "${LABEL}"

echo "==> 性能预算（3D 首帧 / 稳态 / 契约）"
(cd "${ROOT}" && node ops/checks/check_perf_budget.mjs --dir "${RESULT_DIR}") || PERF_BUDGET_EXIT=$?

cleanup
trap - EXIT

if [ -n "${COMPARE_BEFORE:-}" ]; then
  echo "==> 与 ${COMPARE_BEFORE} 对比"
  "${PY}" "${HARNESS}/compare_metrics.py" --before "${COMPARE_BEFORE}" --after "${LABEL}"
  if [ -d "${PERF_ROOT}/results/${COMPARE_BEFORE}/screenshots" ]; then
    "${PY}" "${HARNESS}/compare_screenshots.py" --before "${COMPARE_BEFORE}" --after "${LABEL}"
  fi
fi

echo "完成：${RESULT_DIR}"
ls -1 "${RESULT_DIR}"

if [ -n "${PERF_BUDGET_EXIT:-}" ] && [ "${PERF_BUDGET_EXIT}" -ne 0 ]; then
  exit "${PERF_BUDGET_EXIT}"
fi
