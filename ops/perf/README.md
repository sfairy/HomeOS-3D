# HomeOS 性能基线与预算

这个目录记录「不改变 UI 画面/交互/渲染清晰度」前提下可复现的性能基线，以及
Phase 2/3 的验收口径。目标设备是小米平板 8（Android 浏览器 / 壁挂中控），
但当前仓库内没有真机自动化，**真机数据必须标注为待补**，不能拿本机数字冒充。

## 0. 2026-10-20 双项目性能优化结果

本轮新增隔离测量 harness（`ops/perf/harness/`），用配对 A/B 取前后指标，避免把系统负载
漂移当成优化效果；报告与原始结果：

- 基线：`ops/perf/reports/2026-10-20-baseline.md`
- 变更计划（收益/风险排序、回滚方案）：`ops/perf/reports/2026-10-20-change-plan.md`
- 优化结果（前后对比、测量方式、未达成项）：`ops/perf/reports/2026-10-20-after.md`
- 3D 专项：`ops/perf/reports/2026-10-20-3d.md`
- 原始结果：`/tmp/homeos-perf/results/`（临时目录，不入库）

关键结果：store `/store/v1/products` 并发 p95 151.8→23.6 ms、RPS 311→1,589；homeos
受保护端点每请求少 1 次 SQLite；非认证首屏 stylesheet encoded −44,546 B（−8.0%）。
启动 −30% 与 3D 首帧时序未达成：boot import 约 497 ms，3D 每 iframe 仍加载完整 SPA +
96 个 runtime chunk。真机数据继续标注待补。

> 文档校准：Phase 0 表里的「184 tests / 42 tests」在当前检出中找不到被 git 跟踪的
> `test_*.py`（数量为 0）。本轮回归以 `check_contracts.py`（42 项契约）、
> `bun run typecheck`、`lint:ci`、`check:async-db`、`check:bundle-budget`、ruff 与视觉截图为门禁；
> 不再引用无法复现的单测数字。

## 1. 前端体积预算（已进 CI）

```bash
# 构建（会先删 dist，干净检出等价）
bash ops/ci/build_frontend_verify.sh

# 预算门禁：逐项打印 raw/gzip 与阈值，超限 exit 1
bun run check:bundle-budget

# 机器可读快照
bun ops/checks/check_bundle_budget.mjs --json
```

阈值在 `ops/checks/bundle-budget.json`，口径在 `ops/checks/check_bundle_budget.mjs`
文件头：index.html、首屏 `modulepreload`、入口 chunk、index 内全部 stylesheet、
`modules/runtime` 下全部 ESM chunk、index 内 HLS 同步脚本数。

### Phase 0 基线（Phase 2/3 完成时，2026-10-18，Apple Silicon 本机）

| 指标 | 值 |
| --- | ---: |
| index.html | 6,193 B（Phase 2 的 client-log defer 增加 317 B） |
| 首屏 modulepreload | 706,397 B / 237,845 B gzip（8 个） |
| 入口 chunk | 50,747 B |
| 首屏 stylesheet 合计 | 336,606 B / 77,961 B gzip（8 个） |
| 其中 index 应用 CSS | 196,738 B / 33,856 B gzip |
| 其中 scene CSS | 52,977 B |
| 其中 panel CSS | 51,767 B |
| runtime chunk | 229 个 / 1,350,877 B |
| index 内 HLS 同步脚本 | 0（Phase 1 已改按需） |
| 前端构建 | 主构建约 8.4 s（冷缓存）+ runtime 构建约 0.3 s |
| 后端单测 | 184 tests / 3.8 s（含 Phase 3 观测/线程卸载测试） |
| store 后端单测 | 42 tests / 2.8 s |

说明：gzip 数字为 `zlib.gzipSync(level=6)` 本地重算，与服务端 GZip 实际压缩比会有
偏差；预算只看同口径趋势，不把它当网络实测。Phase 1 之前记录的首屏入口 CSS 为
192.3 KB、总首屏 915.5 KB（旧构建），当前已显著下降，但真机 LCP/TBT 仍需补测。

## 1.5 行为基线（Phase 0.5，模式/解绑/安防/实时链路）

性能预算之外，`Phase 0.5` 还要一份「行为基线」：模式两阶段提交、实体解绑、安防布防补偿、
WS 全量基线与回放。可自动观测的部分由
`ops/perf/harness/capture_behavior.py` 落盘，人工要点的部分在
[`manual-baseline.md`](./manual-baseline.md) 的表格里填。

```bash
# 只读采集（默认读隔离 harness 环境；也可 --base-url 打本机 dev）
bun run perf:behavior --label before
node ops/lib/py.mjs ops/perf/harness/capture_behavior.py --label after
```

产物在 `$TMPDIR/homeos-perf/results/<label>/behavior/`：`modes*.json`、`db-modes.json`、
`security-*.json`、`ws-baseline.json`、`summary.json`。`bash ops/perf/harness/run_baseline.sh`
已把这一步串进去了（`==> 行为基线`）。

## 2. 真机基线（待补，不阻塞 Phase 2）

在小米平板 8 上、与生产相同的 Wi-Fi / 后端版本下采集：

1. Chrome Remote Debugging → Lighthouse（Mobile，Performance），记录 LCP / TBT / CLS / INP。
2. Performance 面板录 30 s 稳态：Long Tasks（>50 ms）数量、主线程忙碌率、FPS。
3. 3D 总览：控制台逐 iframe 读 `renderer.info`（drawCalls / triangles / textures / geometries），
   记录同屏 3D 卡片数、首次就绪时间、`webglcontextlost` 次数。
4. Network：首屏请求数、传输字节、304 命中、瀑布里 boot-guard/client-log/字体/首屏 CSS 的先后。
5. 后端：`/metrics`、事件循环 lag（见下）、SQLAlchemy SELECT 计数、启动/停机耗时。

验收目标（Phase 1 方案已定，真机达标后才算闭环）：

- display 首屏 LCP ≤ 1.2 s（同一网络、热缓存/冷缓存分开记）；
- 3D 就绪 ≤ 2 s；
- INP p75 ≤ 200 ms；
- 长任务 ≤ 2 次/分钟；
- 稳态 `/ws/runtime` 每帧 0 次数据库查询；
- 事件循环 lag p99 ≤ 10 ms；
- 启动耗时下降 ≥ 30%（相对 Phase 0 同机基线）；
- 视觉回归 0 差异（截图/像素对比）。

## 3. 后端观测

```bash
# 事件循环 lag / 阻塞调用：py-spy 采样（需先安装 py-spy）
py-spy record -o /tmp/homeos-backend.svg --pid <pid> --duration 30

# 现有 metrics
curl -s http://127.0.0.1:8000/metrics
```

Phase 3 已落盘埋点（2026-10-18，未提交）：

- `homeos_event_loop_lag_ms{quantile="p50"|"p99"|"max"}` 与
  `homeos_event_loop_lag_samples`：`EventLoopLagMonitor` 每秒采样，窗口 120 s；
  启动后由 lifespan 挂到 `app.state.loop_lag`，停机时先停止采样。
- `homeos_db_queries_total{kind="select"|"write"|"other"}`：SQLAlchemy
  `before_cursor_execute` 计数，用于确认实时链路稳态「每帧 0 查询」。
- `homeos_startup_duration_ms`：lifespan 启动段总耗时，启动完成时写入
  `app.state.startup_duration_ms` 并输出到 `/metrics`。

仍待补：每连接出站帧数/丢弃数、停机各组件耗时；这两项需要改 realtime
gateway 与 lifespan 的观测面，本轮未做。

## 4. Phase 2/3 落地记录（2026-10-18）

已落盘、未提交（50 个已跟踪文件修改 + 15 个新增路径，含 14 个 Phase 1 文件）：

- **实时链路**：`/ws/runtime` 鉴权加 30 s 内存缓存（稳态每帧 0 DB）；`state_hub.publish` 每发布只 deepcopy 一次、订阅者共享只读 payload；gateway 批量广播由逐 sid 串行 await 改为 `asyncio.gather`；3D 控制请求的草稿/场景/SQLite/allows 移入线程池，场景 JSON 按 `(path, mtime_ns, size)` 缓存 8 份。
- **数据库/后台任务**：SQLite 连接池 8+4、`pool_timeout=5`；许可/控制短会话仍只在请求线程写库；`advisor_usage` 的 ON/OFF 统计合并为 0.5 s 单事务批量写；`global_log` 改后台 writer 线程，优雅停机 flush；`entity_references` 引用缓存加 1024 上限；备份 export/inspect/restore 的短会话检查、备份清理/rollback 删除、安全面板事件查询、紧急求助布局读取、通知配置/时区、安防 events.jsonl 解析均移入线程池；启动期备份清理下线程；停机先等备份协调器空闲再 dispose 数据库。
- **HTTP/静态资源**：`SelectiveGZipMiddleware` level 9→5；`spa_static` 的 index.html 按指纹缓存，登录态下为 display/editor/studio 路由注入与 `page-assets.ts` 一致的 `preload as=style`（只预载，不改挂载顺序）；versioned vendor 资源 `immutable`。
- **前端**：HLS 由无条件同步脚本改为按需加载（空闲预取）；`client-log.js` defer；`DisplayView` 的 4 个动态 import 并行；分页列表 deep watch 改逐字段 getter；绑定推荐/安防传感器/设备详情改为 toRaw 快照 + 显式 revision 失效；设备分析面板请求入口收敛并加序号守卫；诊断日志增量去重并 50 ms 批量落地；地震区段重试 timer 顺序修正。
- **store**：订单列表对账有界并发（≤3 笔/2 s，其余交巡检）；SMTP 验证码/激活码邮件改 BackgroundTasks；`/account`、`/products`、站点配置 in-flight 去重；诊断页 7 张表按 tab 懒挂载；账户页 1 s 定时器按需启动。
- **CI/预算**：`ops/checks/check_bundle_budget.mjs` + `bundle-budget.json`，`bun run check:bundle-budget`；`checks.yml` 的 build job 已加预算步骤（该 workflow 目前仅手动 dispatch，不随 push/PR 自动跑）。
- **观测（Phase 3）**：`/metrics` 新增事件循环 lag p50/p99/max、SQLAlchemy 查询分类计数与启动总耗时。

仍待补（不伪造已完成的真机/视觉验收）：

- 小米平板 8 真机 LCP/TBT/INP、逐 iframe `renderer.info`、`webglcontextlost`、冷/热缓存瀑布；本机无真机自动化，全部标注待补。
- 每连接出站帧数/丢弃数、停机各组件耗时仍未埋点；事件循环 lag、SQL 计数与启动总耗时已进 `/metrics`。
- 启动/停机仍串行；建议独立叶子服务分组 `gather`，HA/状态汇聚/日志/DB dispose 保持串行，最坏 15×5 s≈75 s。
- 残留 P1（本轮按风险未改）：`away_simulation` 每分钟 tick 仍有同步 DB 读写；`security._dynamic_config` 为跟随 HA 故障切换每次仍读活跃端点（只缓存 eventsPath）；备份恢复后的 `refresh_runtime_after_restore` 因全局注册表无锁保持原线程。
- runtime chunk 的 `modulepreload` 需后端在 stage.html 注入，父文档 modulepreload 不共享 iframe module map；涉及 stage 入口，未在本轮做。
- 视觉回归（截图/像素对比）与真机 A/B 尚未执行；共享 renderer、离屏 LRU、同屏卡上限、stage 轻量入口均未改。

## 5. 变更纪律

- 任何 Phase 2 改动必须先证明「视觉中性」：不改 CSS 视觉值、模板结构、DPR/抗锯齿/
  色调映射/分辨率、动画时长、布局；涉及画面的结构项（共享 renderer、离屏 LRU、
  同屏卡上限、stage 轻量入口）默认不做，除非有 feature flag + 像素对比。
- 每项改动必须带：改前/改后行为、测试命令、回滚方式。
- 预算超限要么优化，要么在 `bundle-budget.json` 里调整并在提交说明写清原因；
  不允许静默放过。
