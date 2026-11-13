# 验证与门禁记录

执行时间：2026-11-13 08:00–08:30（UTC+8）
分支：`refactor/dedup-safe-batch`（基于 `chore/cleanup-2026-11-12` / `147cbc6d2`）

## 1. 结论速览

| 项 | 结果 |
|---|---|
| `gate:static` | **27 PASS / 0 FAIL / 0 SKIP** |
| `gate:test` | **13 PASS / 0 FAIL / 0 SKIP** |
| `gate:build` | **4 PASS / 0 FAIL / 0 SKIP** |
| `gate:model` | **7 PASS / 0 FAIL / 0 SKIP** |
| 前端类型检查（vue-tsc，1610 文件） | 通过（无输出即无错误） |
| Biome（2337 文件） | 通过 |
| ruff check / ruff format | 通过 |
| basedpyright（709 文件） | 167 errors，**改动文件 0 errors**（见 §4） |
| 浏览器冒烟（4 个界面） | 全部通过（见 §6） |
| M1 重复行 | 3371 → **3202（−169，−5.01%）** |
| M1 克隆数 | 194 → **188** |
| M2 近似重复簇 | 590 → **583** |
| 覆盖率变化 | **N/A**（仓库无覆盖率基线，见 §5） |

## 2. 重复代码度量对比（M1，jscpd `minLines=10` / `minTokens=50` / `mode=weak`）

### 2.1 总量

| 指标 | 前 | 后 | 变化 |
|---|---:|---:|---:|
| 克隆数 | 194 | 188 | **−6** |
| `statistics.total.duplicatedLines` | 3371 | 3202 | **−169（−5.01%）** |
| 扫描总行 | 668,982 | 669,952 | +970 |
| 重复占比 | 0.5039 % | 0.4779 % | **−0.0260 pt** |
| 重复 token | 17,648 | 16,833 | **−815** |

> 分母 +970 行来自本次新增的门禁脚本与 5 个新文件（均不含重复代码）。
> 因此占比降幅（−5.15 %）略大于重复行降幅（−5.01 %）；**结论以绝对重复行为准**。
> 门禁脚本自身也在扫描范围内，所以「扫描总行」会随脚本改动而变，对照时请用同一次生成的两份 artifact。

### 2.2 按格式

下表取 `statistics.formats`（各格式相加 = 总量）。`duplicates[].lines` 按 format 直接求和会
因重叠克隆多算（求和 3543 vs 总量 3202），不能当合计用。

| 格式 | 前（行 / 克隆） | 后（行 / 克隆） | Δ行 |
|---|---:|---:|---:|
| typescript | 1826 / 92 | 1751 / 89 | **−75** |
| python | 787 / 57 | 741 / 55 | **−46** |
| html（`.vue` 模板段） | 482 / 26 | 434 / 25 | **−48** |
| javascript | 276 / 19 | 276 / 19 | 0 |
| css / vue | 0 / 0 | 0 / 0 | 0 |
| **合计** | **3371 / 194** | **3202 / 188** | **−169** |

### 2.3 按目录（相对比较）

一条克隆横跨两个文件，下表两侧各记一次；**表内数字不相加等于总量**，只用于看收益落在哪。

| 根目录 | 前 | 后 | Δ |
|---|---:|---:|---:|
| `homeos/frontend/src` | 4824 | 4652 | **−172** |
| `homeos/backend/src` | 863 | 791 | **−72** |
| `homeos-store/backend/src` | 187 | 167 | **−20** |
| `packages/shared/src` | 16 | 0 | **−16** |
| `homeos/frontend/scripts` | 228 | 228 | 0 |
| `homeos-store/frontend/src` | 570 | 508 | **−62** |
| `packages/shared-py` | 22 | 22 | 0 |
| `ops` | 718 | 718 | 0 |

### 2.4 目标克隆「归零」证明

| 目标克隆 | 前 | 后 |
|---|---:|---:|
| `backend/domains/app_config/defaults.py ↔ backend/domains/security/config.py` | 1 | **0** |
| `store backend/core/persistence/migrations.py ↔ backend/platform/core/db/migrations.py` | 1 | **0** |
| `shared/src/notification/voice-alert.ts ↔ frontend shared/utils/config/frontend-config.ts` | 1 | **0** |
| `features/home-mode/editor/HomeModeContextBar.vue`（自重复） | 1 | **0** |
| `components/widgets/system/NotificationCenter.vue`（自重复） | 1（43 行） | 1（**19 行**，−56%） |
| `features/settings/automate/linkage/PresenceSection.vue`（M2 口径） | 1 簇（37 行） | **0** |

### 2.5 M2 近似重复

| 指标 | 前 | 后 |
|---|---:|---:|
| 簇数 | 590 | **583** |
| 有效代码行 | 445,388 | 445,442 |
| 命中窗口 | 5,258 | 5,165 |

M2 少掉的 7 簇里，`PresenceSection` 占 1 簇（jscpd 因为 50-token 门槛从未报到它，
这正是保留 M2 口径的理由）。

## 3. 门禁逐项

### 3.1 `gate:static`（27 项）

```
--- gate:static：27 PASS / 0 FAIL / 0 SKIP（38.7s）
```

含本次新增 / 受影响的检查：

| 检查 | 结果 | 说明 |
|---|---|---|
| `typecheck` | PASS | `build:shared` + `vue-tsc`（主应用 + 商店） |
| `lint:biome` | PASS | 2337 文件；新脚本按 Biome 格式化 |
| `lint:py` | PASS | ruff check |
| `check:python-format` | PASS | 相对 `HEAD^` 的 4 个新增 Python 文件均已格式化 |
| `check:pep758-except` | PASS | 见 §3.4 的实况记录 |
| **`check:duplicates`（新增）** | PASS | 3202 行，与基线相同 |
| **`check:extra-types`（新增）** | PASS | `python=45 条 / typescript=43 条 / 0 violation` |
| `check:backend-deps` | PASS | `0 violation(s)` —— R1 的依赖边未成环 |
| `check:file-size` | PASS | 76 个 ≥800 行文件（与重构前一致）；新组件均远低于门槛 |
| `check:complexity` | PASS | `new=0 worse=0 improved=1` |
| `check:frontend-complexity` | PASS | 新组件函数数远低于基线 |
| `check:styles` | PASS | 抽组件未新增硬编码样式（类名原样搬移） |
| `check:restricted-syntax` / `check:canvas-breakpoints` / `audit:scaling` | PASS | 前端结构规则 |

### 3.2 `gate:test`（13 项）

```
--- gate:test：13 PASS / 0 FAIL / 0 SKIP（30.5s）
```

含 `test:frontend`、`test:studio`（75 个用例目录，两套 runner）、`test:home-mode`、
`test:smarthome`、`test:security`、`test:shared`、`test:store`、`test:auth-nav`、
`test:architecture`（18 tests OK）、`check:routes`（316 operations / 249 paths 与基线一致）、
`check:store-routes`（121 路由与基线一致）、`check:frontend-deps`、`check:backend-deps`。

**关键**：`check:routes` / `check:store-routes` / `check:frontend-deps` / `check:backend-deps`
全部与基线一致 —— 说明本次没有改动任何路由、也没有改变依赖方向图。

### 3.3 `gate:build` + `gate:model`

```
--- gate:build：4 PASS / 0 FAIL / 0 SKIP（29.5s）
--- gate:model：7 PASS / 0 FAIL / 0 SKIP（9.0s）
```

`gate:build` 覆盖：前端产物构建（主应用 + 商店 + runtime）、体积预算、`check:chunk-init`
（chunk 初始化顺序）、`check:font-subset`。Vue 模板抽取必须过这一关 —— 它证明新增的 4 个
SFC 都被正确编译并打进产物。

`gate:model` 为 3D 模型库只读审计（几何 / 槽位 / 材质 / 资产 / 目录与命名），本次未触及。

### 3.4 实况：PEP 758 门禁抓到了我自己引入的回归

值得单独记录，因为它验证了仓库既有守卫的价值。

我在 R1 里对 `security/config.py` 跑了 `ruff format`（本机 Python 3.15 目标），它把

```python
except (TypeError, ValueError):
```

改写成了 PEP 758 的无括号形式：

```python
except TypeError, ValueError:
```

这条语法在 Cython 3.3.0 下会被解析成 `except TypeError as ValueError:` —— **编译通过，
但只捕获 `TypeError`**。`check:pep758-except` 立刻红灯（`security/config.py:94`）。
修法是加 `# fmt: skip` 保住括号：

```python
except (TypeError, ValueError):  # fmt: skip  # 括号不能省：Cython 3.3.0 会把无括号形式解析成 `except A as B:`
```

如果没有这条守卫，这是个会被带进生产镜像的静默 bug。

### 3.5 一次真实的「门禁失败 → 修正」记录

初次跑 `gate:static` 时是 **24 PASS / 3 FAIL**，失败项与原因：

| 失败项 | 原因 | 修正 |
|---|---|---|
| `lint:biome` | 新脚本 `check_duplicates.mjs` 有格式差异 | `biome format --write` |
| `check:pep758-except` | 见 §3.4 | 加 `# fmt: skip` 与非括号写法 |
| `check:python-format` | `sqlite_introspect.py` 的 `_DIRTY_DATETIME_PREDICATE` 可合并成一行 | `ruff format` |

三处都是本次新增代码的格式/语法问题，没有一处是逻辑错误。

## 4. 静态分析

### basedpyright

仓库没有把 basedpyright 接进 gates（见 `homeos/backend/pyproject.toml` 的说明），因此手工跑：

```
709 files analyzed, 167 errors, 2 warnings
```

167 条全部是**存量**，按文件归集后集中在测试文件：

| 错误数 | 文件 |
|---:|---|
| 26 | `test_payment_channels.py` |
| 16 | `service_status.py` |
| 11 | `test_interaction3d_characterization.py` |
| 7 | `test_security_followups.py` |
| 6 | `stage_delivery.py` 等 |

**本次改动触及的 7 个 Python 文件（含新增 2 个）错误数 = 0**（用脚本按路径过滤后统计）。

### Biome / ruff

```
Checked 2337 files in 383ms. No fixes applied.
All checks passed!        # ruff check
4 files already formatted # ruff format --check
```

## 5. 覆盖率：N/A（如实说明）

仓库**没有**覆盖率基线，也没有 vitest / playwright / pytest-cov 的任何配置：

- `find . -name 'vitest.config.*'` → 无
- `find . -name 'playwright.config.*'` → 无
- `node_modules` 内无 `@vitest/coverage-*`

因此「覆盖率变化」这一项无法测量，**不编造数字**。替代证据是：

1. 全部 51 项门禁通过（§3）；
2. 前端类型检查覆盖 1610 个文件（含所有新增 SFC）；
3. 生产构建通过（`gate:build`）；
4. 运行时冒烟 4 处（§6）+ 后端起停实测（§6.5）。

若后续需要真实覆盖率，应当单独引入 `@vitest/coverage-v8` 与 `pytest-cov` 并先建立**基线**，
再谈「变化」；把这件事混进重构 PR 会让两者都无法归因。

## 6. 功能验证：运行时冒烟

环境：`bun run dev`（后端 8801 / 前端 8805 / 商店 8802），后端在我的 Python 改动后自动重载。

后端启动日志（改动后）：

```
[应用服务] 应用启动完成:223.7 ms | 共14个阶段
[Web服务器] 应用启动完成
[通知] 通知服务已启动(DB持久化)
[在家状态] 人员状态已恢复:2个实体
[家庭模式] 已恢复激活家庭模式:回家模式
```

即 R1 改动的 `security/config.py` / `notification/config.py` 与 R2 的迁移注册表都在真实启动路径上跑通了。

### 6.1 通知中心（R4 `NotificationRowContent`）

两条渲染分支都必须验证 —— 这正是被抽掉重复的那两处。

| 分支 | 触发路径 | 结果 |
|---|---|---|
| 虚拟列表 | 顶栏「通知中心」抽屉 | 24 行渲染，每行含级别图标、正文、来源标签、时间、「关闭通知」按钮 |
| 固定分页 | `/notifications` 整页 | 行内出现跳转箭头（`has-link` 为真）+ 分页器（上一页 disabled / 下一页） |

箭头只在 `hasLink` 为真时出现，证明 `:has-link="!!resolveNotificationLink(n)"` 的 prop 传递正确。

### 6.2 设置 › 安防场景 › 全屋联动 › 人员在线判定（R4 `PresenceStatusMeta` + `PresenceActions`）

用 CDP 直接读渲染后的 DOM（比截图更硬）：

```json
{
  "metaExists": true,
  "metaText": " 1 人在家 · 共 2 位 · 已配置 2 位人员自定义 · 2 位人员",
  "actionsButtons": [
    { "label": "刷新人员状态", "disabled": false },
    { "label": null, "disabled": false }
  ]
}
```

- `.linkage-presence-meta` 存在且 `summaryText` + `modeHint` 都已渲染；
- `.linkage-presence-actions` 内两个按钮（刷新 / 保存）都在；
- 加载中时 `刷新人员状态` 曾为 `disabled=true`，加载完成后变为 `false` —— `loading` prop 贯通正常。

### 6.3 家庭模式编辑器上下文条（R4 `HomeModeContextPill`）

DOM 实测（5 个 pill）：

| pill | `role` | `tabindex` | `clickable` class |
|---|---|---|---|
| 在场 1人在家 | `null` | `null` | 否 |
| 日历 在家 | `null` | `null` | 否 |
| 自动触发 3 条 | `button` | `0` | 是 |
| 全屋动作 4 条 | `button` | `0` | 是 |
| 联动 快照恢复 · … | `button` | `0` | 是 |

与改动前的行为**逐项一致**：无 `section` 的 pill 不给 `role`/`tabindex`（不制造假按钮），
有 `section` 的才可聚焦可点击。派发 `click` 后无异常抛出。

### 6.4 3D Studio 启动

`/3d-studio` 冷启动后：

```json
{
  "title": "户型与庭院绘制",
  "canvasCount": 4,
  "bodyText": "HOMEOS · 3D STUDIO 户型图绘制 返回编辑器 1 导入底图 2 标定比例 … 已保存 … 3D 实时"
}
```

6 步向导、资源库、模型库分类、工具栏、吸附与「3D 实时」指示均正常。本次未改动 `studio/` 源码，
此项是回归确认。

### 6.5 后端与配置派生

| 验证 | 结果 |
|---|---|
| `import src.domains.security.config` | 成功，0.215 s（含 sqlalchemy） |
| 8 个默认值常量的键值 + 键顺序 | 全部逐项相等（脚本 `assert`） |
| 修改派生常量是否污染 `DEFAULT_APP_CONFIG` | 否（深拷贝生效） |
| `normalize_all_datetimes` 内存库实测 | 改动 3 字段 / 幂等 / 跳过 `schema_migrations` |
| 两个迁移注册表的 `MIGRATIONS` | 17 条 / 8 条，版本号与顺序未变，`normalize-all-datetimes` 均在 |

## 7. 新增门禁的自检

新门禁本身必须能失败，否则就是「永远绿」的装饰。四个场景都实跑过：

| 场景 | 构造方式 | 期望 | 实得 |
|---|---|---|---|
| A 重复**变小** | 用重构前基线（194 条）跑重构后的树（`NotificationCenter` 43→19 行） | 通过 | **exit 0**，并打印「本次有 1 处重复变小」 |
| B 凭空**新增**重复 | `ops/` 下放两个 14 行完全相同的 Python 文件 | 失败 | **exit 1**，报「+14 行」并指出 `_probe_a.py:1 <-> _probe_b.py:1` |
| C 第一版基线（只有指纹） | 把基线退化成 `fingerprints: string[]` | 仍能严格判定 | 通过/失败判定不变，并提示「跑一次 `--update` 升级」 |
| D `--json` 纯度 | `node ops/checks/check_duplicates.mjs --json \| python3 -c 'json.load(sys.stdin)'` | 只有一个 JSON 文档 | 解析成功，含 `newClones / shrunkClones / removedClones / ok / notes` |
| E 契约表漂移 | 把 TS 侧 `climate: 'panel'` 改成 `'switch'` | 失败 | **exit 1**，报 `climate: Python='panel' 但 TS='switch'` |
| F 还原后重跑 | — | 通过 | **exit 0**（`python=45 条 / typescript=43 条 / 0 violation`） |

`--update` 的棘轮语义也验过：重复行高于基线时**拒绝写回**，必须显式传 `--allow-increase`。

### 7.1 场景 A 修复的是一个真实缺陷

第一版门禁只比对指纹集合。指纹 = `sha1(路径对 + 归一化片段)`，**片段一变指纹就变**，
于是「把一个 43 行克隆修到 19 行」会被判成「新增 1 处重复」—— 门禁反过来惩罚改善。
这不是理论问题：本次 R4 就撞上了（`NotificationCenter` 自重复 43 → 19 行），
当时是我手工判读后忽略的。

修法：基线从 `fingerprints: string[]` 升级为 `entries: {fingerprint, first, second, lines}[]`，
判定时对「指纹不在基线里」的克隆再查一次 ——
**若同一对文件在基线里有更大的克隆，则算「变小」，不算新增**。

不会因此放水，因为两条约束同时生效：

1. 总量棘轮仍在：老克隆还在、又长出新的，`duplicatedLines` 必然上升，`变小` 的豁免无从生效；
2. 豁免只在**同一对文件**内生效，跨文件新增的重复一律按「新增」处理。

旧格式基线仍然可读（按严格模式判 + 提示升级），避免上游分支切回旧提交时门禁直接崩。

## 8. 报告口径的两处修正

初版清单有两处数字是错的，修在这里并说明原因，避免后面的人再踩：

### 8.1 「按格式」合计不等于总量

我最初按 `duplicates[].lines` 的 `format` 字段求和，得到 typescript 1852 / html 776 / js 299，
合计 3714 —— 比 `totals.duplicatedLines`（3371）多 343 行。原因是**重叠的克隆会让同一行被计多次**
（同一对文件里相邻窗口、以及 `.vue` 同时出现在 html 与 typescript 两个 format 里）。

正确口径是 `statistics.formats`，它逐格式相加**恰好等于**总量：
typescript 1826 / python 787 / html 482 / javascript 276 = 3371。
`duplicates[]` 只用于「逐条清单」，不用于合计。两份文档的按格式表都已换成这个口径。

### 8.2 「按目录」不比总量

克隆横跨两个文件，按目录统计必然二选一：要么只记第一侧（丢掉另一半），要么两侧各记一次
（合计翻倍）。我选了后者并**显式标注「表内数字不相加等于总量，仅用于相对比较」**。
它回答的是「收益落在哪个目录」，不是「一共多少重复行」。

## 9. 文件规模棘轮

```
homeos: ≥800 行文件 76 个（>1000 行 50 个，最大 4948 行，合计 112663 行）
homeos-store: ≥800 行文件 1 个（>1000 行 0 个，最大 848 行，合计 848 行）
```

与重构前**完全一致** —— 本次没有让任何文件变大到跨过 800 行门槛，也没有让已入基线的文件变大。
（`sqlite_introspect.py` 从 66 行涨到 126 行，远低于门槛。）

## 10. 逐项工作的最终账

| 项 | 重复行收益 | 行数变化 | 未捕获的原因 |
|---|---:|---|---|
| R1 配置默认值 | −26（M1） | +32 / −69 = **−37** | `energy`/`water`/`iaq`/`notification` 四个分区各自低于 10 行，M1 从未报到 |
| R2 迁移助手 | −20 | +80 / −57 = **+23** | 实现上移到 `shared-py`（净 +61 行），两份调用点各减 |
| R3 语音告警 | −16 | +6 / −16 = **−10** | — |
| R4 四个组件 | −48（M1）/ −37（M2） | 现有文件 −143，新组件 +166 = **+23** | 新组件含较多解释性注释 |
| R6 商店弹窗 | −31 | 现有文件 −58，新 composable +90 = **+32** | 同上：说明性注释占大头 |
| R7 告警面板转发清单 | −30 | **−24**（23 个裸名 → 1 行展开）+ 5 行注释 | 纯去转发，无新文件 |
| R5 契约门禁 | 0 | +191（新脚本） | 定位是防未来重复 |
| 度量基础设施 | — | +995（3 个脚本） | `.jscpd.json` 与基线 json 不在扫描格式内，不计 |
| **业务源码合计** | **−169（M1）/ −7 簇（M2）** | **净 +7 行** | — |

如实记账：**这次不是靠删代码取胜**，而是把「同一件事写两遍」变成「写一遍 + 各自付一点调用成本」，
并给未来的重复装了棘轮。源码行数基本持平（累计 25 个文件 +495 / −472，净 +23 行），
换来的是重复行 −169 与 7 项「改一处必须记得改另一处」的清单条目消失。

## 11. 复现

```bash
bun run check:duplicates          # M1 门禁（与 CI 同一条）
bun run dup:analyze               # 刷新 M1 报告 + M2 清单
bun run check:extra-types         # 跨语言契约对齐
bun run gate                      # static + test + model
bun run gate:build                # 前端产物与体积/顺序预算
.venv-store/bin/basedpyright      # 类型检查（不在 gates 里）
```

## 12. 本轮补充（第二轮自查）

### 12.1 修掉一处指向已删除脚本的陈旧注释（7 个文件）

`studio/app/editor/**` 下 7 个 inspector 的接口注释都写着「字段清单由
`ops/studio/studio_context_bag_typing.mjs` 从真实使用生成，一个不多一个不少」。
该脚本已在 `a70ed33d7`（「拆除自定义门禁 / 冒烟体系」）删除，**仓库里没有替代品**，
7 处注释在指引后来者去找一个不存在的东西。

改法：把注释改成陈述现状 —— 手写维护，形状由 `buildXInspectorContext()` 构造器 + `tsc` 兜底
（返回对象与接口字段不完全一致就编译不过），并明确「不要再去那个路径找脚本」。

**顺带的实测**：这 7 个文件一共 +35 行注释，`check:duplicates` 的 `duplicatedLines`
**一行没变**（3202 → 3202）。这实证了 `mode=weak` 确实跳过注释 —— 也就是当初把它从
`strict` 换过来的理由成立。

### 12.2 消掉一处「解构一遍、再列一遍」的转发清单（−30 行）

`features/settings/interact/composables/alert-rules-context.internals.ts` 里，
`useAlertRulesPanelContext` 从 `useVoiceAlertsEditor()` 解构 30 个字段，函数体只用到 7 个，
剩下 23 个纯粹为了在 `return` 里再列一遍（两次列同一串名字，jscpd: 30 行）。

改法：`const { voiceMeta: _voiceMetaNotExposed, ...voiceAlertsEditor } = useVoiceAlertsEditor()`，
return 里用 `...voiceAlertsEditor`，只解构真正用到的 7 个。

两个刻意的细节：

1. **`voiceMeta` 被显式剔除**。它确实是 composable 的返回值（31 键），但本 wrapper 一直没暴露它。
   展开会「顺手多暴露一个」—— 那也是行为变更，所以剔掉，保持对外键集逐字一致。
2. **展开安全性已论证**：`useVoiceAlertsEditor` 的 return 块里 **0 个 getter**（实测扫过），
   返回的是 ref / computed **对象本身**，浅拷贝不改变任何响应性。

**等价性证明**（脚本比对，不是目测）：新透传的 30 键与旧解构列表 **集合相同、顺序也相同**；
return 的显式键从 102 降到 72，差额恰好是被展开的那 30 个；
`...voiceAlertsEditor` 出现在原来 `voice,` 的位置，因此最终键序不变。

**运行时验证**：设置 › 感知交互 › 告警规则 › 语音播报，DOM 实测渲染
「10 播报项」「已启用」勾选、7 个安防开关全部 checked、冷却 10、分组 7/4/2 ——
这些数值全部来自被转发的那批字段（`enabledVoiceAlertCount` / `builtinStyleState` /
`speakRuleGroups` / `speakCooldownMin`），证明透传链路完整。

### 12.3 两条「待办」被证伪，改判「保留」

见 `02` §4.2 最后两条。摘要：

- **inspector 类型声明（57 行）**：本来建议「从一侧 export type 一次」。读了才知道是
  **每个文件只声明自己用到的字段**（34 / 307），合并会毁掉「键名拼错被 tsc 拦下」这个性质。
- **`airflow*` 默认值（79 行）**：本来就是「待办」且被推荐为「风险最低」。实测 4 组配对的
  同名字段**取值 0 处不同**，所以它确实是同一份契约写两遍；但 `styleComponentTypeState`
  同时被 `style-apply.ts` 当作「属性缺失时的回退」用，合并等于把两个现在只是碰巧相等的
  策略焊死 —— 需要 studio owner 决策 + 视觉快照基线，不该在去重 PR 里顺手做。

两轮的结论一致：**清单里凡是我没读代码就给的建议，多半是错的**。这一认知已经写进 `02` §4.0。
