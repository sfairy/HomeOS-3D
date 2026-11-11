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

# Edge headless 偶发整进程断开（无 crash、无控制台错误，单独重跑即正常）：
# 结果带 error 时最多重跑 2 次，避免一次环境抖动让整轮基线缺主测量。
bench_3d() {
  local tag="" attempt
  for ((i = 1; i <= $#; i++)); do [ "${!i}" = "--tag" ] && { j=$((i + 1)); tag="${!j}"; }; done
  local out="${RESULT_DIR}/3d${tag:+-${tag}}.json"
  for attempt in 1 2 3; do
    (cd "${ROOT}" && node "${HARNESS}/bench_3d.mjs" --label "${LABEL}" "$@") || true
    node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).error ? 1 : 0)' "${out}" \
      && return 0
    echo "[${LABEL}] 3D${tag:+ ${tag}} 第 ${attempt} 次测量失败，重试"
  done
  return 1
}

echo "==> 3D 测量"
bench_3d || true

# 补充口径各自独立一个浏览器，不污染主测量：DPR 2 清晰度、10s 连续拖拽帧分布、显存估算、
# 稳态静置帧数。静置必须带 settle 窗口：主测量的 idleFramesPerSec 紧跟拖拽，量到的是惯性尾帧，
# 拿它判「静置零渲染」会把松手 2 秒的滑行当成常驻渲染。
echo "==> 3D 补充口径（dpr2 / drag10s / gpumem / idlesettled）"
bench_3d --tag dpr2 --dpr 2 || true
bench_3d --tag drag10s --soak-ms 10000 --idle-ms 3000 || true
bench_3d --tag gpumem --gpu-memory || true
bench_3d --tag idlesettled --idle-settle-ms 10000 --idle-ms 5000 || true

# HOMEOS_PERF_SOAK_MINUTES=60：长时浸泡（默认不跑，单独一轮要一小时）。
if [ -n "${HOMEOS_PERF_SOAK_MINUTES:-}" ]; then
  echo "==> 3D 浸泡 ${HOMEOS_PERF_SOAK_MINUTES} 分钟"
  (cd "${ROOT}" && node "${HARNESS}/soak_3d.mjs" --label "${LABEL}" --minutes "${HOMEOS_PERF_SOAK_MINUTES}") || true
fi

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
