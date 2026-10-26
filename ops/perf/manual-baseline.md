# Phase 0.5 手工回归基线（模式 / 解绑 / 安防 / WS / 性能 / 门禁）

这份清单配合 `ops/perf/harness/capture_behavior.py` 使用：**脚本负责「可自动观测的事实」，
人负责「脚本看不到的观感」**（UI 表头显示、HA 真实设备状态、联动是否真的断掉、回放是否
被前端正确消费）。两侧都填完，Phase 0.5 才算闭环。

## 0. 怎么用

```bash
# 1) 自动快照（只读；默认打 harness 隔离环境，也可 --base-url 打本机 dev）
.venv-store/bin/python ops/perf/harness/capture_behavior.py --label before

# 2) 按下面 B1–B6 手工点一遍，边点边填表

# 3) 改完代码 / 复测时再采一份
.venv-store/bin/python ops/perf/harness/capture_behavior.py --label after

# 4) 对比两份快照（JSON 直接 diff 关键字段即可）
.venv-store/bin/python - <<'PY'
import json, pathlib, os, tempfile
root = pathlib.Path(os.environ.get("HOMEOS_PERF_ROOT") or pathlib.Path(tempfile.gettempdir()) / "homeos-perf")
for name in ("summary.json", "db-modes.json", "ws-baseline.json"):
    a = json.loads((root / "results/before/behavior" / name).read_text())
    b = json.loads((root / "results/after/behavior" / name).read_text())
    print("==", name, "changed:", a != b)
PY
```

打本机 dev（不启隔离实例）时给 cookie：

```bash
.venv-store/bin/python ops/perf/harness/capture_behavior.py \
  --label dev --base-url http://127.0.0.1:8801 --cookie "<auth_token>"
```

> 没有服务在跑时脚本仍会执行：DB 部分直接读 `homeos/data/homeos.db`（`mode=ro`），
> HTTP 部分如实记录 401/超时，不会伪造数据。

采集产物（`$TMPDIR/homeos-perf/results/<label>/behavior/`）：

| 文件 | 内容 |
| --- | --- |
| `modes.json` | `GET /api/v1/modes` 原始列表 |
| `modes-active.json` | `GET /api/v1/modes/active`（`activeMode` + `activeModes`） |
| `modes-context.json` | `GET /api/v1/modes/context` |
| `modes-trigger-logs.json` | `GET /api/v1/modes/trigger-logs` |
| `db-modes.json` | `home_modes` 激活态 / 快照有无 / `entityId` 悬空与空串统计 |
| `security-panel.json` | `GET /api/v1/security-panel/status` |
| `security-presence.json` | `GET /api/v1/security/presence/summary` |
| `ws-baseline.json` | 新连接一次全量基线的分帧（帧数、字节、chunk、就绪耗时、稳态增量） |
| `summary.json` | 上述内容的汇总与各端点状态码 |

---

## 总体结论表（填完再勾）

| 项 | 自动采集 | 人工步骤 | 基线结论 | 复测结论 |
| --- | --- | --- | --- | --- |
| B1 家庭模式 2PC | `modes.json` / `db-modes.json` | 切模式 + 中止一次 |  |  |
| B2 实体解绑 | `db-modes.json`（`danglingEntityRefs`） | 解绑一个设备再触发模式 |  |  |
| B3 安防布防补偿 | `security-panel.json` | 布防/撤防 + 断一个设备 |  |  |
| B4 WS 基线 / 回放 | `ws-baseline.json` | DevTools 看回放与分帧 |  |  |
| B5 性能基线 | `run_baseline.sh` | 看 `check_contracts.py` |  |  |
| B6 门禁 | 命令输出 | 无需人工 |  |  |

---

## B1 家庭模式两阶段提交与会话一致性（P0-2 / P0-3 / P1-1）

**自动观测**：`modes.json`、`db-modes.json` 的 `activeByGroup` / `groupViolations`，
以及每个激活模式是否带 `deviceSnapshot`。

**当前基线（2026-10-26，dev 库）**

- 模式 6 条；激活 2 条且分属两组：`default → 回家模式`、`comfort → 睡眠模式`；
  `groupViolations = {}`（每组至多一条激活）。
- 激活模式都有 `deviceSnapshot`；未激活的 `deviceSnapshot` 为空。

**人工步骤**

1. 打开首页模式面板，确认两个互斥组各高亮一条（不是「只显示第一条激活」）。
2. 点「影音模式」→ 应顶掉同组（`comfort`）的「睡眠模式」，`default` 组的「回家模式」不受影响。
3. 在切模式过程中断开 HA（或拔网线）触发中止 → 观察：
   - 面板是否回滚到切换前的模式（旧模式被顶掉后要恢复）；
   - 通知/接口是否**如实**报失败，而不是静默成功。

**填表**

| 观察点 | 基线 | 复测 |
| --- | --- | --- |
| 互斥组各自高亮条数（default / comfort） | 1 / 1 |  |
| 跨组切换是否互相影响 | 无 |  |
| 中止后旧模式是否恢复 |  |  |
| 中止时是否明确报错（非静默） |  |  |
| 中止后 `db-modes.json` 的 `activeByGroup` 是否与 UI 一致 |  |  |

---

## B2 实体解绑删除节点而非置空（P0-1）

**自动观测**：`db-modes.json` 里
`emptyEntityRefs`（配置里 `entityId` 为空串 —— 旧 bug 会造出通配符触发器）与
`danglingEntityRefs`（引用了 `ha_entities` 里已不存在的实体）。

**当前基线（2026-10-26，dev 库）**：`emptyEntityRefs = 0`，`danglingEntityRefs = 1`
（一条真实历史残留，见 `db-modes.json`）；基线记录它，是为了复测时能区分「我操作造成的
新增」和「历史遗留」。

**人工步骤**

1. 在设备/实体管理里解绑一个**正被某个模式触发器引用**的实体（选一个容易恢复的）。
2. 重新采集一次（`--label after-unlink`），确认：
   - `emptyEntityRefs` 仍为 0（没有出现空串 `entityId`）；
   - 该实体带来的 `entityRefs` 计数**减少**，而不是留下一条空引用。
3. 触发那个模式，确认解绑的实体**不会被误控**（通配符锁的典型症状是「所有同域实体一起动作」）。

**填表**

| 观察点 | 基线 | 复测 |
| --- | --- | --- |
| `emptyEntityRefs` 数量 | 0 |  |
| `danglingEntityRefs` 数量 | 1 |  |
| 解绑后该模式 `entityRefs` 变化 | — |  |
| 触发模式是否误控其它实体 | 否 |  |
| 解绑后 `modes.json` 渲染是否报错 | 否 |  |

---

## B3 安防布防联动失败补偿（P0-5）

**自动观测**：`security-panel.json`（`mode` + `zones`）、`security-presence.json`。

**人工步骤**

1. 记录初始 `mode`（当前 dev：在家布防，3 个区域）。
2. 点「离家布防」，确认 `mode` 变化、区域灯态正确、联动动作（灯/窗帘）确实执行。
3. 故意让一个联动目标不可用（关掉该设备电源 / 在 HA 中置 `unavailable`），再布防一次：
   - 面板**不应**显示布防成功；
   - 应能看到失败原因（哪个实体、什么错误）；
   - 已执行的部分要么回滚，要么明确列出「部分成功」。
4. 撤防，确认对称地恢复（不留残留联动）。

**填表**

| 观察点 | 基线 | 复测 |
| --- | --- | --- |
| 初始 `mode` / 区域数 | 在家布防 / 3 |  |
| 正常布防是否成功 | 是 |  |
| 目标不可用时的面板状态 |  |  |
| 失败原因是否可见 |  |  |
| 已执行联动是否回滚或明示部分成功 |  |  |
| 撤防后是否有残留 |  |  |

---

## B4 实时链路：全量基线与回放（P1-P2）

**自动观测**：`ws-baseline.json`。

**当前基线（2026-10-26，dev，本机）**

| 指标 | 值 |
| --- | ---: |
| 全量基线帧数 | 5 帧（`ha_status` ×2 + `begin` + 2×`chunk` + `end`） |
| 全量基线字节 | 477,383 B（705 个实体） |
| chunk 数 | 2 |
| 首帧延迟 | 7.6 ms |
| 基线就绪 | 7.6 ms |
| 稳态增量（2 s 窗口） | 5 帧 / 1,920 B |

**人工步骤**

1. 打开 DevTools → Network → WS → `/socket.io/`，刷新页面，确认首包顺序：
   `ha_status` → `initial_states_begin` → `initial_states_chunk`… → `initial_states_end`。
2. 断网 10 s 再恢复：确认客户端带 `since` 走增量回放（`state_replay`），
   而不是每次重连都吃一遍 477 KB 全量。
3. 断网 > 回放窗口（触发 `replay_truncated` 或 `replay_too_large`）：
   确认收到 `resync_suggested` 且前端会重取全量，而不是静默停在旧状态。
4. 同时开 2 个页面，改一个实体：确认两个页面都收到增量（分桶不能漏人）。

**填表**

| 观察点 | 基线 | 复测 |
| --- | --- | --- |
| 首包顺序是否符合 begin→chunk→end | 是 |  |
| 短暂断网是否走 `state_replay` |  |  |
| 超窗断网是否收到 `resync_suggested` |  |  |
| 多页面是否都收到增量 |  |  |
| `ws-baseline.json` 的 `baselineBytes` 是否明显变化 | 477,383 B |  |

---

## B5 性能基线（Phase 2/3 口径）

```bash
bun run build:frontend                       # dist 必须是本次要测的构建
bash ops/perf/harness/run_baseline.sh before # 隔离实例，不碰生产 8801/8802
bash ops/perf/harness/run_baseline.sh after  # 复测
.venv-store/bin/python ops/perf/harness/compare_metrics.py --before before --after after
```

前置：`dist/homeos/frontend` **和** `dist/homeos-store/frontend` 都要存在（`setup_env.py`
会校验；只构建主应用时请用 `bun run build:store` 补齐，否则隔离环境不启动）。

**填表**

| 指标 | 基线 | 复测 | 结论 |
| --- | ---: | ---: | --- |
| `check_contracts.py` 通过项 |  /42 |  |  |
| `bundle.json` 首屏 stylesheet |  |  |  |
| 后端 p95（受保护端点） |  |  |  |
| 3D 首帧时序 |  |  |  |
| 事件循环 lag p99 |  |  |  |

> 真机（小米平板 8）数字仍标注「待补」：仓库内没有真机自动化，本机数字不能替代。

---

## B6 门禁（每次改动都要全绿）

```bash
bun run typecheck
bun run --cwd homeos/frontend lint:ci
.venv-store/bin/python -m ruff check ops homeos/backend/src
.venv-store/bin/basedpyright            # 类型门禁（见下方说明）
.venv-store/bin/python ops/checks/check_async_db.py
.venv-store/bin/python ops/checks/check_silent_except.py
bun run check:bundle-budget
bun run check:scene
bun run --cwd homeos/frontend check:deps
```

`check_silent_except.py` 带棘轮：基线只能降不能升（当前 557 处），新增静默 `except`
会让它直接失败。

`basedpyright` 用仓库 `.venv-store` 里的那份（`pip install basedpyright`，当前 1.40.2）。
注意两点，否则会得到**假红**（实测 31,617 条，全是 `str 未定义` 之类的噪音）：

1. Python 3.15 的新建 venv 里，第一次安装可能只落了半份 typeshed（`stdlib` 266 条、
   没有 `stubs/`），必须确认 `.../basedpyright/dist/typeshed-fallback/stdlib` 有 282 条以上；
   不完整时用 `pip install --ignore-installed --no-deps --force-reinstall basedpyright` 重装。
2. 若 `basedpyright/dist/pyright.js` 被仓库根的 `"type": "module"` 当成 ESM 读取
   （报 `require is not defined`），在 `dist/` 下放一个 `{"type":"commonjs"}` 的
   `package.json` 即可；这个文件在 `.venv-store`（gitignored）里，不进版本库。

当前基线：**0 errors / 0 warnings**（`ops/checks/studio/glb_geometry_probe.py` 的
`bpy`/`bmesh` 是 Blender-only 导入，文件头已用 `# pyright: reportMissingImports=false,
reportUnusedImport=false` 说明原因）。

> `bun run check:code-quality` 在本仓**不出报告**：它要求
> `docs/code-quality/<date>/quality/data/{baseline,current}-{ts,python}.json` 这几份分析器
> 快照，仓库里没有 `docs/code-quality/`，CI 也没接这个门禁。2026-10-26 起缺输入会打印
> 「SKIP + 需要补哪些文件」并 exit 0（`--strict` 才失败），不会再 ENOENT 崩溃。
> 日常等价集合用：`typecheck + lint:ci + ruff + basedpyright + check:scene`。

**填表**

| 门禁 | 基线 | 复测 |
| --- | --- | --- |
| `bun run typecheck` | 通过 |  |
| `lint:ci` | 通过（0 violation） |  |
| `ruff check` | 通过 |  |
| `basedpyright` | 0 errors / 0 warnings |  |
| `check_async_db` | 通过（已扫 domains/modules） |  |
| `check_silent_except`（计数 ≤ 557） | 557（整改前 574，净减 17） |  |
| `check:bundle-budget` | 通过（CSS 303,106 / 310,000；runtime 280 / 282 chunk） |  |
| `check:perf-budget` | 通过（presentedCalls 3,084 / renderCalls 625 / stageMounted 584） |  |
| `check:scene` | 通过 |  |
| `check:frontend-deps`（不是 `check:deps`） | 通过（0 violation） |  |
| `check:code-quality --date <d>` | SKIP（缺输入，非失败） |  |
