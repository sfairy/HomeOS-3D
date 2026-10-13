# 测试与冒烟体系 · ADR-0001：要不要改用 pytest / `bun test`

本目录是**测试/冒烟体系**的设计文档。全仓没有任何单元测试框架（无 pytest/vitest/`bun test`）：所谓「测试」= 脚本式冒烟 + 静态门禁 + 注入式自检。入口命令与逐项目说明见根 [`README.md`](../../README.md) 的「编排脚本」表。

## 体系速查

| 层 | 入口 | 载体 | 验证现场 |
| --- | --- | --- | --- |
| 主应用冒烟 | `bun run verify:smoke:app` | 9 脚本 + [`_smoke_harness.py`](../../homeos/backend/scripts/_smoke_harness.py) | 临时数据目录 + 进程内 fastapi `TestClient`（**真跑 lifespan**） |
| 商店冒烟 | `bun run verify:smoke` | 3 脚本 + [`_smoke_harness.py`](../../homeos-store/scripts/_smoke_harness.py) | 临时 sqlite（**硬设** `STORE_DATA_DIR`，不碰真实 `data/`） |
| 前端冒烟 | `bun run verify:smoke:frontend` | 6 个 `.ts` + [`_smoke_harness.ts`](../../homeos/frontend/scripts/_smoke_harness.ts) / `.mjs` | bun 直跑源码，自带 window / DOM / WebSocket / timer 桩 |
| 授权 e2e | `bun run verify:smoke:license` | 1 脚本，需**运行中的本地商店** | 商店不可达则打框状 `SKIP`；故**不在**默认冒烟里（SKIP ≠ 覆盖） |
| 静态门禁 | `verify:*`、`check:deps` | `ops/check_*.py`(7) + `ops/lib/*.mjs`(2) + `ops/tokens/*.mjs`(4) + `scripts/gates/check-*.mjs`(7) | 纯文件扫描，共享 [`ops/lib/scan.mjs`](../../ops/lib/scan.mjs) |
| 门禁自检 | 随各门禁 | 7 个 `*_selftest.mjs` + 若干 `*_selftest.py` | 注入式用例表，证明「门禁本身会红」 |

断言口径统一为 `check(label, 条件, detail)` → `report(name)` 汇总计数并以非零码退出；`[FAIL] label detail` 是唯一失败格式，`SKIP` 必须是框状横幅（明确写出「未验证任何断言」），避免把跳过读成通过。

---

## ADR-0001：冒烟脚本要不要换成测试框架（pytest / `bun test`）

- **状态**：评估完成，**本轮不落地**（按计划阶段 3「仅评估，单独 PR 决策」）
- **日期**：2026-10-13
- **范围**：`homeos/backend/scripts/**`、`homeos-store/scripts/**`、`homeos/frontend/scripts/**` 的冒烟脚本，以及 `ops/**` 的静态门禁自检
- **相关**：[`_smoke_harness.py`](../../homeos/backend/scripts/_smoke_harness.py)、[`_smoke_harness.ts`](../../homeos/frontend/scripts/_smoke_harness.ts)、[`.github/workflows/checks.yml`](../../.github/workflows/checks.yml)

## 结论（TL;DR）

| 问题 | 结论 |
| --- | --- |
| 要不要把现有冒烟整体迁到 pytest？ | **不要**。收益主要集中在 3~4 个纯逻辑用例上，成本是「新增依赖 + 第二套写法 + 会话/导入期耦合」，且省不掉主要开销（见下） |
| 要不要把前端冒烟迁到 `bun test`？ | **值得，但只做局部**。`bun test` 是 bun 内建（**零新增依赖**，实测启动 23ms），对假定时器 / 参数化 / 失败定位是净收益 |
| 现有「脚本 + 共享 harness」体系要推翻吗？ | **不**。harness 是这次优化的核心资产（一份断言口径、一份环境引导），迁框架是**换壳不改断言**，不构成推翻理由 |
| 什么时候值得动？ | 当出现「需要参数化 × 假时钟 × 逐参数定位」的用例族（目前只有前端 MSE 退避 / `requestJson` 两个），或团队规模扩大导致 `check(label, bool)` 的失败信息不够用时 |

一句话：**保留脚本式冒烟作为主力，把少数纯函数/退避用例按需迁到 `bun test`（TS 侧优先），Python 侧维持现状。**

## 现状（实测数字）

| 套件 | 文件 | 行数 | `check(` 断言 | 实测耗时 |
| --- | --- | --- | --- | --- |
| `verify:smoke:app`（主应用，9 脚本） | 10 脚本 + 1 harness | 2447 | 162 | **7.20s** |
| `verify:smoke`（商店，3 脚本） | 3 脚本 + 1 harness | 1193 | 34 | **1.57s** |
| `verify:smoke:frontend`（前端，6 脚本） | 6 `.ts` + `_smoke_harness.ts/.mjs` | 1746 | 153 | **0.32s** |
| `verify:smoke:all` | 上面四组 | — | ≈349 | **8.5s** |
| 门禁自检（`ops/**` + `scripts/gates/*_selftest.mjs`） | 5 个 `.mjs` selftest + 14 步 `check:deps` 门禁 | — | 67 | 并入 `check:deps` ≈1.9s |

基线开销：`python -c pass` 0.01s、`import fastapi + fastapi.testclient` **0.19s**、`bun --version` 启动到跑完一个 `bun test` 探针文件 **23ms**。

主应用 9 个脚本串行 7.2s，其中 4 个「生命周期」脚本各 1.15~1.27s：

```
_auth_contract_smoke.py                1.23s
_register_login_activate_smoke.py      1.27s
_module_feature_gate_smoke.py          1.17s
_p51_ha_whitelist_smoke.py             1.15s
_ha_fetch_resilience_smoke.py          0.35s   ← 已把真实退避 patch 成 0
_schema_drift_guard_smoke.py           0.47s
_ws_broadcast_smoke.py                 0.40s
_go2rtc_relay_smoke.py                 0.49s
_license_activation_e2e_smoke.py       0.90s
```

即：**约 2/3 的耗时来自「进程内真建 app + 真跑 lifespan」**，只有 ~0.2s/脚本 是解释器与导入的固定税。

## 判定标准

换框架只有在至少一条成立时才划算：

1. **失败定位**：断言失败时能否直接看到「哪个输入、哪个期望」，而不是自己 `check(label, cond, detail)` 手工拼字符串；
2. **消除真实时间 / 真实 IO**：是否提供内建假时钟、自动回滚的 patch、隔离的临时目录；
3. **摊薄固定开销**：是否因为「一个进程跑全部用例」而显著更快。

## Python 侧：pytest

### 能买到什么

| 能力 | 现在怎么做 | pytest 之后 |
| --- | --- | --- |
| patch 自动还原 | 手写 `try: … finally: 还原`（如 [`_ha_fetch_resilience_smoke.py:166-235`](../../homeos/backend/scripts/_ha_fetch_resilience_smoke.py) 的 `STATE_FETCH_RETRY_DELAYS` / `client_mod.httpx`） | `monkeypatch.setattr` 出 fixture 作用域自动撤销 |
| 临时目录 | `tempfile.mkdtemp()` / `TemporaryDirectory()` | `tmp_path` fixture |
| 跳过 | harness 自打框状 `SKIP`（[`_license_activation_e2e_smoke.py`](../../homeos/backend/scripts/_license_activation_e2e_smoke.py)） | `pytest.skip()`，CI 报告里有标准 SKIP 归类 |
| 参数化 | 手写循环 + 逐项 `check()` | `@pytest.mark.parametrize`，失败能定位到具体参数组 |
| 失败输出 | `[FAIL] label detail`（自建格式，已统一） | `assert` 重写，展示两侧实际值 |
| 退出码聚合 | 每个脚本 `report()` 汇总后 `exit(1)`，`&&` 链在第一个失败处短路 | 一次运行报出**全部**失败（现状下第一个脚本红了后面就不跑） |

最后一条是**真实收益**：现在 `verify:smoke:app` 是 `&&` 链，一个脚本失败会掩盖后续脚本的结果。

### 买不到 / 反而变差什么

1. **省不掉主要开销**。7.2s 里约 4.8s 是「建 app + 跑 lifespan」。计划明确保留「真实启动路径也要被验证」（不为测试加 lifespan 跳过开关），所以 session 级 app fixture 会把已验证的配置组合**合并**掉——这正是要守的不变量。乐观估计省下 9 个脚本 × 0.2s ≈ 1.8s 固定税，换来「多套配置必须共用一个 app」的强约束。
2. **AST 断言与框架无关**。[`_smoke_harness.py`](../../homeos/backend/scripts/_smoke_harness.py) 的 `source_ast` / `call_targets` / `literal_line` / `call_line` / `membership_string_set`（`smoke_store.py` 8 处、`_module_feature_gate_smoke.py` 1 处）迁过去仍是同一堆 helper——这些断言的本质是「读源码结构」，不是「跑行为」，pytest 不提供任何东西。
3. **导入期耦合不会消失，只是换地方**。约定是「环境必须在 `import src.*` 之前设好」（`Settings` 在导入期构造，见 harness 的模块 docstring）。今天靠 `bootstrap_env()` + `main()` 守卫；pytest 下要挪到 `conftest.py` 顶层（收集期早于测试模块导入，可行），但从此**多了一处必须在导入期执行副作用的地方**，且 `pytest` 的 `-p no:randomly` 之类的收集顺序假设会成为新的隐性依赖。
4. **`monkeypatch` 对「导入期单例」无效**。`Settings` 是导入期构造的模块级对象，patch 环境变量已经晚了；现在靠「每个脚本一个独立进程」绕开，pytest 下要么保留逐用例 reload，要么把同一进程内的多套配置搞成真正的隔离——这恰好是脚本式布局最省事的地方。
5. **成本**：新增 `pytest` 到 `homeos/backend/requirements-dev.txt`（当前只有 ruff + pyright），CI 的 `python -m venv .venv-store` 步骤要跟着装；本仓只有**一个** venv（根 `.venv-store`，Python 3.14.7，被两个后端共用，见 `ops/dev.mjs` 与根 `pyrightconfig.json`），所以不是「两个 venv 都要改」，而是「这个共用 venv 从此多一个测试期依赖」。另外 `homeos/backend/pyproject.toml` 的 `[tool.pyright]` 段（`venvPath="."` / `venv=".venv"`）指向**不存在**的 `homeos/backend/.venv`，真正的权威是根 `pyrightconfig.json`——加 `[tool.pytest.ini_options]` 时不要重蹈这个「配置写在没有生效的目录」的覆辙。

### Python 侧的判断

**维持现状。** 唯一想买的是「参数化」和「一次报出全部失败」，而这两条在现有 harness 上改造更便宜：

- 参数化：harness 加一个 `check_cases(name, cases, fn)`（逐参数打 `[PASS]/[FAIL]`），不需要框架；
- 一次报出全部失败：把 `verify:smoke:app` 从 `&&` 链换成已有的并发/串行聚合执行器 [`ops/lib/run-chain.mjs`](../../ops/lib/run-chain.mjs)——它已经支持「全跑完再按清单顺序汇总，任一步非 0 则整链失败」，正好消掉「第一个失败短路掩盖后续」的痛点。

## TS 侧：`bun test`

### 能买到什么（且几乎不要钱）

- **零新增依赖**：`bun:test` 是 bun 内建（本机 bun 1.4.2，实测 `bun test <file>` 探针 **23ms**，`describe/test/expect/jest.useFakeTimers` 全部可用）；
- **假时钟是内建语义**：`jest.useFakeTimers()` + `jest.advanceTimersByTime()`，直接替掉 [`_go2rtc_mse_smoke.ts`](../../homeos/frontend/scripts/smoke/_go2rtc_mse_smoke.ts) 与 [`_request_json_smoke.ts`](../../homeos/frontend/scripts/smoke/_request_json_smoke.ts) 里自建的 `fakeTimers` 推进逻辑，退避递增 / 上限断言可以写成「推进 3000ms → 期望第 2 次重试」；
- **参数化与失败定位**：`test.each` 与 `expect(...).toEqual(...)` 的差异输出，比 `check(label, cond)` 手工拼 detail 直观；
- **模块解析零风险**：现有 6 个冒烟都用**相对路径** import `../src/...`（不走 `@/` 别名），与 `bun test` 同解析规则。

### 成本与约束

1. `scripts/**/*.ts` 目前**不在任何 tsconfig 的 `include` 里**（[`tsconfig.json`](../../homeos/frontend/tsconfig.json) 只收 `src/**`，[`tsconfig.node.json`](../../tsconfig.node.json) 只收 vite 配置）——即这些文件今天只被 ESLint（[`homeos/frontend/eslint.config.js`](../../homeos/frontend/eslint.config.js) 的 `APP_FILES` 覆盖 `scripts/**/*.{js,ts,mjs}`）与 bun 的类型擦除管。迁到 `bun test` 后若想让 `bun:test` 的类型可见，需要 `@types/bun`（新 devDependency）或继续保持「不 typecheck」。**这是唯一的新依赖**。
2. **knip 需要补入口**：`homeos/frontend` 工作区的 `entry` 里有 `scripts/**/*.{ts,mjs,js}`，新增 `*.test.ts` 需同步登记（knip 不会像 jest/vitest 那样自动识别 bun 的测试文件），否则 `knip` 会以 `files: 'error'` 报未使用文件。
3. **DOM 桩仍要自己带**：`bun test` 不带 DOM 环境（不像 vitest 可挂 jsdom/happy-dom），所以 [`_smoke_harness.ts`](../../homeos/frontend/scripts/_smoke_harness.ts) 的 `installWindow` / `FakeElement` / `FakeMediaSource` / `FakeWebSocket` **原样保留**——迁框架只替掉 `check/section/report`，不替掉桩。想省掉桩就得再加 jsdom 类依赖，收益为负。
4. 7 个 `.mjs` 门禁自检（`_import_refs_selftest.mjs` 等）现在是「被 `check:deps` 链里的 `node` 直接跑」的独立进程；它们已经是一批 `test()` 形状的用例表，改写成 `bun test` **要额外把链里的 `node` 换成 `bun`**，属于纯搬运，收益低于改动面，**建议不动**。

### TS 侧的判断

**局部迁移，仅 2 个文件**：`_go2rtc_mse_smoke.ts` + `_request_json_smoke.ts`（假时钟 / 退避那批），其余 4 个冒烟留在现有 harness。

## 建议路径（后续单独 PR）

| 阶段 | 内容 | 前置 | 收益 |
| --- | --- | --- | --- |
| P3-a（低风险） | 不改框架，先拿 [`run-chain.mjs`](../../ops/lib/run-chain.mjs) 替掉 `verify:smoke:app` 的 `&&` 链，让一次运行报出全部失败 | 无 | 直接消除「第一个脚本失败掩盖后续」 |
| P3-b（可选） | 把 `_go2rtc_mse_smoke.ts` / `_request_json_smoke.ts` 迁 `bun test`：加 `@types/bun`、补 knip 入口、保留 DOM 桩 | P3-a 完成后 | 假时钟与参数化，失败定位 |
| P3-c（不建议） | Python 冒烟整体迁 pytest + `conftest.py` | 说服自己接受「多套 app 配置合并成一个 session app」 | 省约 1.8s 固定税，代价见上 |

## 本轮明确不做

- 不引入 `pytest` / `vitest` 依赖（与计划「不做」清单一致）；
- 不拆掉 `_smoke_harness.*`，也不把「脚本 + `report()` 退出码」换成框架的 runner 输出格式；
- 不合并 4 个 `LICENSE_REQUIRED=0` 的生命周期脚本到单进程——「真实启动路径也被验证」是当前体系的主要价值；
- 不把 `.mjs` 门禁自检从 `node` 换成 `bun test`。

## 复现上述测量

```bash
# 各套件耗时
bun run verify:smoke:app            # 7.20s
bun run verify:smoke:frontend       # 0.32s
bun run verify:smoke                # 1.57s
bun run verify:smoke:all            # 8.5s

# 逐脚本耗时（主应用侧）
for f in homeos/backend/scripts/_*smoke*.py; do
  /usr/bin/time -p .venv-store/bin/python "$f" >/dev/null
done

# 固定开销基线
.venv-store/bin/python -c "pass"                                       # 0.01s
.venv-store/bin/python -c "import fastapi;from fastapi.testclient import TestClient"  # 0.19s

# bun test 可用性与开销（探针文件跑完即删）
printf 'import { test, expect, jest } from "bun:test"\ntest("probe", () => { jest.useFakeTimers(); expect(1+1).toBe(2) })\n' > /tmp/probe.test.ts
bun test /tmp/probe.test.ts         # Ran 1 test across 1 file. [23.00ms]
```
