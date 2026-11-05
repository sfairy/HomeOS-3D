#!/usr/bin/env bash
# 一次跑完整套基线：后端端点 → 前端路由 → 3D 舞台 → 资源归因。
#
# 为什么必须一条命令
# ------------------
# 历史上"基线"是手工分四步跑的，于是出现了「before 用 18801、after 用 8801」「before 带
# performance-diagnostics、after 不带」这类口径漂移，最后数字对不上又要重跑一遍。
# 这里把端口、诊断开关、采样次数都固定成参数，任何人重跑都得到同一口径。
#
# 用法：
#   bash ops/perf/harness/run_baseline.sh before
#   BASE_URL=http://127.0.0.1:18801 DISPLAY_PATH=/display/2 RUNS=3 bash ops/perf/harness/run_baseline.sh after
#
# 环境变量（全部可选）：
#   BASE_URL             主应用地址            默认 http://127.0.0.1:18801
#   STORE_URL            商店地址（可选，给了才跑）默认空
#   DISPLAY_PATH         3D 展示路由            默认 /display
#   COOKIE               登录 Cookie（需要鉴权的端点用）
#   RUNS                 前端/3D 采样轮数        默认 1
#   ENDPOINTS            后端端点（空格分隔）    默认与 perf-budget.json 对齐的三个免鉴权端点；
#                                              草稿端点需要登录 + 具体项目 id，按需显式给：
#                                              ENDPOINTS="/api/v1/projects/1/draft=draft" COOKIE=auth_token=…
set -euo pipefail

LABEL="${1:-latest}"
BASE_URL="${BASE_URL:-http://127.0.0.1:18801}"
STORE_URL="${STORE_URL:-}"
DISPLAY_PATH="${DISPLAY_PATH:-/display}"
RUNS="${RUNS:-1}"
COOKIE="${COOKIE:-}"
# 默认值必须覆盖 `perf-budget.json` 里声明了预算的端点，否则那几行预算永远不会被判定
# （历史上默认只测 /health/ready，于是 public-config / projects / draft 三条预算形同虚设）。
# 带鉴权的端点无法设默认值：没有 COOKIE 时它们只会返回 401，测出来的是鉴权路径而不是业务路径。
ENDPOINTS="${ENDPOINTS:-/health/ready=health /api/v1/public/config=publicConfig /api/v1/projects=projects}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="${REPO_ROOT}/ops/perf/results/${LABEL}"
PY="${REPO_ROOT}/.venv-store/bin/python"
[ -x "${PY}" ] || PY="python3"

mkdir -p "${OUT_DIR}"

echo "==> label=${LABEL} base=${BASE_URL} out=${OUT_DIR}"

# 就绪检查：后端没起来就继续跑，会得到一屏 0 延迟的"完美"结果 —— 那比跑不起来更危险。
if ! curl -fsS --max-time 5 "${BASE_URL}/health/ready" >/dev/null 2>&1; then
  echo "后端未就绪：${BASE_URL}/health/ready" >&2
  echo "先启动（bun run dev）或改 BASE_URL 指向已运行的实例。" >&2
  exit 2
fi

echo "==> 后端端点"
# ENDPOINTS 是「空格分隔的多个端点」，必须逐个转成 `--endpoint <path>`。
# 原写法 `${ENDPOINTS// / --endpoint }` 只替换了**分隔符**，第一个端点仍以裸位置参数
# 传给 argparse → `unrecognized arguments: /health/ready=health`，整套基线直接跑不起来。
endpoint_args=()
for endpoint in ${ENDPOINTS}; do
  endpoint_args+=(--endpoint "${endpoint}")
done
"${PY}" "${REPO_ROOT}/ops/perf/harness/bench_backend.py" \
  --base-url "${BASE_URL}" --label "${LABEL}" --cookie "${COOKIE}" \
  "${endpoint_args[@]}"

echo "==> 前端首页"
node "${REPO_ROOT}/ops/perf/harness/bench_frontend.mjs" \
  --url "${BASE_URL}/" --label "${LABEL}" --runs "${RUNS}" --cookie "${COOKIE}"

if [ -n "${STORE_URL}" ]; then
  echo "==> 商店首页（Slow4G + 4x CPU）"
  node "${REPO_ROOT}/ops/perf/harness/bench_frontend.mjs" \
    --url "${STORE_URL}/store" --label "${LABEL}-store" --runs "${RUNS}" \
    --throttle slow4g --cpu 4 --cookie "${COOKIE}"
fi

echo "==> 3D 舞台"
# 退出码要区分开，别用 `|| echo` 一把吞掉：
#   0 = 通过；1 = 真的回退（必须让整套基线失败）；3 = 没采到相位（环境问题，例如登录墙）。
# 以前一律吞成 0，于是 bench_3d.json 里一屏 `null` 也被当成"跑成功了"。
stage_status=0
node "${REPO_ROOT}/ops/perf/harness/bench_3d.mjs" \
  --url "${BASE_URL}${DISPLAY_PATH}" --label "${LABEL}" --runs "${RUNS}" --cookie "${COOKIE}" \
  || stage_status=$?
if [ "${stage_status}" -eq 3 ]; then
  echo "（3D 相位未采集：环境问题，跳过这一项，详见上方输出）"
elif [ "${stage_status}" -ne 0 ]; then
  echo "（3D 基线未通过：见上方输出）" >&2
  STAGE_FAILED=1
fi

echo "==> 资源归因"
node "${REPO_ROOT}/ops/perf/harness/resource_inventory.mjs" \
  "${OUT_DIR}/bench_frontend.json" --top 20

echo "==> 完成：${OUT_DIR}"
ls -1 "${OUT_DIR}"

# 3D 采集失败时整套基线以非 0 结束：脚本的退出码就是调用方唯一看得懂的结论。
if [ "${STAGE_FAILED:-0}" -eq 1 ]; then
  exit 1
fi
