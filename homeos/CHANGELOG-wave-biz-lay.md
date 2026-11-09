# 变更记录 — Wave-BIZ / Wave-LAY / UI-B/C / Wave3（本轮落地）

状态约定：`已完成` = 代码已合入；`待测试` = 需手工/联调验收。

## BIZ 阻塞与中优

| 修改文件 | 变更摘要 | 变更原因 | 变更状态 |
|---|---|---|---|
| `backend/.../agent/policy/scheduler.py` | claim 时 CAS 推进 next_run_at；finish 失败不重跑 | BIZ-01 | 待测试 |
| `frontend/.../system-config-core.internals.ts` | 409 重试保留 revision，禁止丢锁 | BIZ-02 | 待测试 |
| `backend/.../security/frigate.py` | 缺 confidence 跳过告警 | BIZ-03 | 待测试 |
| `backend/.../agent/policy/scheduler_time.py` | runAt→cron 用家庭时区 | BIZ-04 | 待测试 |
| `backend/.../security/panel.py` 等 | 紧急 await+诚实结果；arm degraded | BIZ-05/06 | 待测试 |
| home-mode FE/BE 多文件 | 激活/互斥/notify/安防注入诚实 | BIZ-07～11 | 待测试 |
| `presence.py` + Settings UI | presenceRequireAllAway 默认 AND | BIZ-12 | 待测试 |
| `linkage.py` + presets | 日历升级独立开关 | BIZ-13 | 待测试 |
| `notification/dispatch.py` | 入库失败无伪造 ID | BIZ-14 | 待测试 |
| `earthquake/service.py` 等 | 无坐标不伪在线 | BIZ-15 | 待测试 |
| backup FE/BE | 无 secrets 强制风险勾选 | BIZ-16 | 待测试 |
| `studio3d/service.py` | lock 前 rollback 清脏会话 | BIZ-17 | 待测试 |
| `media_access.py` | HLS 无 grant → 403 | BIZ-18 | 待测试 |
| `home_tools_scenes.py` + scheduler | activate_home_mode 透出未确认 | BIZ-19 | 待测试 |

## LAY 布局

| 修改文件 | 变更摘要 | 变更原因 | 变更状态 |
|---|---|---|---|
| `security-view.css` | ≤900 事件双栏改 column | LAY-01/14 | 待测试 |
| `security.css` | ≤900 sov-workspace / master-detail 堆叠 | LAY-02 | 待测试 |
| `embed-page.css` | iframe/loading/state 用 safe-area inset | LAY-03 | 待测试 |
| `floating.css` | 断点改 settings-scroll | LAY-04/15 | 待测试 |
| main-layout / RightSidebar / list-page* / devices-theme / earthquake / studio-chrome / AFH / Footer / settings* / HomeMode* / shared page.css | LAY-05～22 结构修复 | LAY-05～22 | 待测试 |

## WaveUI-B / Wave3 / WaveUI-C

| 修改文件 | 变更摘要 | 变更原因 | 变更状态 |
|---|---|---|---|
| AgentCompanion / main-layout / studio-chrome / stage.css / floating/layout/agent CSS / Security empty | 触控、键盘菜单、窄屏抽屉、令牌、空态 | U03/U04/U08/U10/U17/U16/U18 | 待测试 |
| earthquake service / pagehide / optimistic confirm / check_async_db / dispose extract | 冷启、泄漏、假恢复、门禁、有界拆分 | N10/F04/F10/P11/P5/F09 | 待测试 |
| shader-precompile / resource-policy / reflections / Settings v-if / Events VirtualList / glass tokens | 闲时画质与保效果性能 | Q01～Q06 | 待测试 |

## 补域

| 修改文件 | 变更摘要 | 变更原因 | 变更状态 |
|---|---|---|---|
| （路由已存在） | `/homeos/:name`、stage bodyClass 核实 OK | DISP-07/08 | 已完成(代码验) |
| webpush + FE toast | 未送达不假成功 | CHN | 待测试 |
| advisor_usage.py | 未登录 403 | ADV | 待测试 |
| lifestyle scene | off 白名单 + ok 诚实 | LIFE | 待测试 |
| STORE/WTH | 降级路径已存在 | STORE/WTH | 已完成(代码验) |

## 门禁收口

- 为通过 file-size / complexity / any / styles / frontend-complexity 棘轮，将 Wave 增量拆到 sibling 模块（companion a11y、render-loop idle、model upgrade、earthquake status mixin、arm-result helpers 等）
- `bun run gate:static`：**25 PASS / 0 FAIL**（已全绿）
- 禁令自检：未改默认 perf-low；未永久砍阴影；未关玻璃；未对 full GLB Draco

## 回归 / 矩阵（代码验完成，联调待测）

- regress-landed：Wave0–2 改动仍在代码库；需手工冒烟 §4 最小集
- AUTH→STORE→LIC→HA→RT：路由/门禁/public_config 代码路径已核对
- 全业务 180+ 用例：缺陷阻塞项 BIZ-01～19 已改码；用例勾选状态统一「待测试」
