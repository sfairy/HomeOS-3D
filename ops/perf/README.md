# HomeOS 性能基线与预算

这个目录管两件事：**可复现的测量口径**（harness + 清单）和**会阻断的门禁阈值**（两个 JSON）。
历史优化战报按约定不入库 —— 数字会过期，口径和阈值不会。

## 目录

```text
ops/perf/
├── README.md            ← 本文件：口径、命令、预算位置
├── manual-baseline.md   ← 手工回归清单（B1–B6），脚本看不到的观感在这里填
└── harness/             ← 测量脚本（下面逐个说明）
```

原始结果**不入库**，默认落在 `$TMPDIR/homeos-perf/results/<label>/`
（`HOMEOS_PERF_ROOT` 可覆盖；harness 与 `check_perf_budget.mjs` 都读同一个变量）。
报告写不写、写到哪里由当轮决定；本目录不按日期存报告。

## 1. harness

| 脚本 | 作用 |
| --- | --- |
| `run_baseline.sh <label>` | 一次跑完：体积预算 → 隔离数据副本 → 起隔离实例 → 行为基线 → 后端 / 前端 / 3D 测量 → 契约检查 → 性能预算判定 |
| `setup_env.py` | 从 `homeos/data` 与 `homeos-store/data` 的 SQLite backup 复制隔离数据，校验 `dist/` 存在 |
| `bench_backend.py` | 起/停隔离 uvicorn（18801 / 18802），端点 p50 / p95 / p99、RPS、DB 次数、RSS |
| `bench_frontend.mjs` | Edge headless，冷/热缓存逐路由采 LCP / CLS / longtask / encoded bytes |
| `bench_3d.mjs` | `/display/<id>?performance-diagnostics=1`，读 iframe 内 `renderer.info` 与阶段时序；`--query` 可透传 URL 参数做 A/B |
| `capture_behavior.py` | 只读快照：模式 / 解绑 / 安防 / WS 全量基线，产物供 `manual-baseline.md` 对照 |
| `check_contracts.py` | 接口契约断言（状态码、响应键、iframe 鉴权），当前 42 项 |
| `compare_metrics.py` / `compare_screenshots.py` | 两个 label 之间对比 |

前置与纪律：

- `bun run build:frontend` 先产好 `dist/`。`setup_env.py` 要求 **`dist/homeos/frontend` 与
  `dist/homeos-store/frontend` 都在**，只构建一侧时用 `bun run build:app` / `build:store` 补齐。
- `run_baseline.sh` 只写 `$TMPDIR/homeos-perf`，不碰生产 8801 / 8802。
- 解释器一律经 `node ops/lib/py.mjs`（与门禁同一条路径），脚本里不写死 `.venv-store/bin/python`。
- **本机存在 ±10–60% 的时辰漂移**：单轮绝对值不可比，跨版本比较必须**交替配对 A/B**
  （before/after 交替重启），只认配对中位数与代码级可证量（DB/req、字节数、chunk 数）。

```bash
bun run build:frontend
bash ops/perf/harness/run_baseline.sh baseline      # 或 bun run perf:baseline
bash ops/perf/harness/run_baseline.sh after         # 或 bun run perf:after
COMPARE_BEFORE=baseline bash ops/perf/harness/run_baseline.sh after   # 顺带出对比
```

## 2. 体积预算（已进 CI）

阈值在 [`ops/checks/bundle-budget.json`](../checks/bundle-budget.json)，口径在
[`ops/checks/check_bundle_budget.mjs`](../checks/check_bundle_budget.mjs) 文件头：

index.html、首屏 `modulepreload`、入口 chunk、index 内全部 stylesheet（raw + gzip）、
`modules/runtime` 下全部 ESM chunk 数 / 字节、index 内 HLS 同步脚本数。

```bash
bash ops/ci/build_frontend_verify.sh   # 构建（会先清 dist）
bun run check:bundle-budget            # 逐项打印 raw/gzip 与阈值，超限 exit 1
bun ops/checks/check_bundle_budget.mjs --json
```

**阈值不抄进文档**：数字随首屏改动调整，真源只有那个 JSON。调整阈值必须在提交说明里写明原因
（历史原因都记在 JSON 的 `_note` 里）。

## 3. 3D 与首屏性能预算

阈值在 [`ops/checks/perf-budget.json`](../checks/perf-budget.json)，判定脚本是
[`ops/checks/check_perf_budget.mjs`](../checks/check_perf_budget.mjs)，默认取
`$TMPDIR/homeos-perf/results/` 下最近一个带 `3d.json` 的目录，`--dir` 可指定。

```bash
bun run audit:perf-budget                                  # 手动审计，不进 CI
node ops/checks/check_perf_budget.mjs --dir /tmp/homeos-perf/results/after
```

阈值按「漂移带」留白，只拦**数量级回退**，不拦 ±7% 抖动。三条口径必须先分清，否则会写出错的
验收目标：

- `presentedCalls` 是**首帧**口径，含阴影图与首次反射捕获。反射「每帧预算」只削减交互期重复
  捕获，**不会降低这个数**；想验反射优化就看 `renderCalls`（稳态帧）。
- `stageMountedMs` / `iframeReadyMs` 有 ±7% 漂移，判方向前先跑两轮同目录取方差。
- `steadyReflectionCaptures ≥ 1` 拦的是「反射被静默关掉」——那种回退只看 FPS 是看不出来的。
- `componentFamilyCount = 0` 拦的是「展示端按草稿裁剪组件族」被改回无条件全量加载
  （harness 标准草稿只用到同步路径的族，全量加载会让它变成 8）。

## 4. 真机基线（待补）

目标设备是小米平板 8，但仓库内**没有真机自动化**，所以真机数字一律标注「待补」，不能拿本机数字
冒充。真机采集口径与验收目标随当轮需求另行定义，不写死在本文件里 —— 写死的秒数只会过期。

## 5. 后端观测

```bash
# 事件循环 lag / 阻塞调用：py-spy 采样（需先安装 py-spy）
py-spy record -o /tmp/homeos-backend.svg --pid <pid> --duration 30

curl -s http://127.0.0.1:8801/metrics
```

`/metrics` 里与本目录相关的指标：

| 指标 | 读法 |
| --- | --- |
| `homeos_event_loop_lag_ms{quantile="p50"\|"p99"\|"max"}` + `homeos_event_loop_lag_samples` | `EventLoopLagMonitor` 每秒采样、窗口 120 s；启动后挂到 `app.state.loop_lag` |
| `homeos_db_queries_total{kind="select"\|"write"\|"other"}` | 确认实时链路稳态「每帧 0 查询」 |
| `homeos_startup_duration_ms` | lifespan 启动段总耗时；import 段另有 `homeos_boot_import_ms` |
| `homeos_http_request_duration_seconds` | 路由级直方图（路由基数上限 100，跳过静态 / 流式） |

未埋点、要加得动 realtime gateway 与 lifespan 的两项：每连接出站帧数 / 丢弃数、停机各组件耗时。

## 6. 行为基线

性能预算之外还有一层「行为基线」：模式两阶段提交、实体解绑、安防布防补偿、WS 全量基线与回放。
能自动观测的由 `capture_behavior.py` 落盘，需要人点的在
[`manual-baseline.md`](./manual-baseline.md) 的表格里填 —— 两侧都填完才算闭环。

```bash
bash ops/perf/harness/run_baseline.sh baseline   # run_baseline.sh 已内含 capture_behavior
bun run perf:behavior --label after              # 只补采行为快照（不打压测）
node ops/lib/py.mjs ops/perf/harness/capture_behavior.py \
  --label dev --base-url http://127.0.0.1:8801 --cookie "<auth_token>"
```

产物在 `$TMPDIR/homeos-perf/results/<label>/behavior/`：`modes*.json`、`db-modes.json`、
`security-*.json`、`ws-baseline.json`、`summary.json`。没有服务在跑时脚本仍会执行：DB 部分以
`mode=ro` 直读 `homeos/data/homeos.db`，HTTP 部分如实记录 401 / 超时，不伪造数据。

## 7. 变更纪律

- 性能改动必须先证明**视觉中性**：不改 CSS 视觉值、模板结构、DPR / 抗锯齿 / 色调映射 / 分辨率、
  动画时长、布局。涉及画面的结构项（共享 renderer、离屏 LRU、同屏卡上限、stage 轻量入口）
  默认不做，除非有 feature flag + 像素对比。
- 每项改动必须带：改前 / 改后行为、测试命令、回滚方式。
- 一次只改一类东西，并保留**未改动的对照端点**用于估噪声底：对照端点的变化幅度就是本轮噪声，
  受改端点的收益必须显著超出它，否则不算数。
- 预算超限要么优化，要么调 JSON 并在提交说明写清原因；不允许静默放过。
- **A/B 有开关的改动必须两边都跑**：历史上「反射推迟捕获」的开关默认关、打开后地面反射恒为
  0 次捕获，只有 A/B 才能发现。这类静默画面回退要有对应门禁（如 `steadyReflectionCaptures`）。

> 最后核对：2026-10-28（命令、路径与阈值来源已逐条验证）
