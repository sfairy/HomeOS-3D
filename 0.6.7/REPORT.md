# HA-Bridge 0.6.7 还原报告

本轮把 0.6.7 发行目录里被保护的代码还原成可读源码，产出全部放在本目录
（`recovered/`）下。**原始工作目录未被改动**（见 §6 manifest 证据）。

## 1. 结论

| 项目 | 结果 |
| --- | --- |
| PyArmor 保护的后端模块 | **88 / 88 还原**（backend 67 + migrations 21），全部通过 `compile()` |
| 前端 JavaScript | **243 / 243**（201 反混淆 + 31 仅格式化 + 11 逐字节保留） |
| 前端非 JS 资产 | **7907 / 7907 逐字节相同**（sha256 全等） |
| 混淆残留 | `_0x[0-9a-f]{4,}` 命中 **0**，字符串数组解码器 **0** |
| 本地门禁 | `bash tools/verify_release.sh` → **18 passed, 0 failed** |
| 原始目录 | manifest diff `PROJECT added=0 removed=0 changed=0 clean=True` |

## 2. 目录布局

```
recovered/
  backend/            67 个还原模块 + 1 个明文 runtime（pyarmor_runtime_004721/__init__.py）
  migrations/         21 个还原模块（env.py + versions/0001..0020）
  alembic_runtime/    21 个明文副本（逐字节照抄，未改）
  container_entrypoint.py
  frontend/           243 个 .js + 7907 个非 JS 资产（相对路径与原树一一对应）
  tools/              还原工具 + 验证门禁（见 §7）
  .work/              中间产物与 JSON 证据（scratch，可删）
```

还原模块总行数与原件对照见 `.work/backend_vs_066.py` 的统计；`recovered/backend`、
`recovered/migrations`、`recovered/alembic_runtime` 与根部的 `container_entrypoint.py`
合计 **111 个 .py 文件**，全部能编译。

## 3. 方法

### 3.1 权威来源

* 后端输入：每个被保护模块旁的 `<name>.py.1shot.seq`，由 PyArmor-Static-Unpack-1shot
  解包；`pycdas` 的反汇编（`<name>.py.1shot.das`）是**唯一权威**——它逐条给出真实
  字节码、常量表、名字表、签名与嵌套代码对象。
* 前端输入：`frontend/**/*.js` 中 201 个经 javascript-obfuscator 处理的模块。

### 3.2 为什么不用 pycdc 反编译结果

先按「pycdc 反编译 + 修补」路线做过 11 轮 C++ 补丁（genexpr、raise-from、
STORE_DEREF 循环目标等），把 `parse_ok` 从 45/88 提到 73/88，但**残留损毁是系统性的**：

* 全树 `with X:` 语句 **0 条**，`with None:` 161 处——所有锁、文件句柄、会话都丢了
  （pycdc 3.12 只忽略 `BEFORE_WITH`）；
* 布尔链极性反转：`if not A or not B:` 被打印成 `if not A and B:`；
* 复杂 genexpr 塌缩成 `(lambda .0: ...)`（14 处 / 11 文件）；
* 73 处不在函数内的裸 `return`（`ast.parse` 能过，`compile()` 非法）。

这些产物无法机械修复，且逐模块手写 87 个模块的工作量与风险都不可接受。因此转向：
**同级 0.6.6 目录里已有同一批模块的上一轮还原（已通过五道门禁）**，把它当结构骨架，
再用 0.6.7 自己的 `.1shot.das` 做差量校正。

### 3.3 两批独立证据证明 0.6.6 可作为骨架

1. `tools/cmp_sig.py`：按缩进解析两侧 `.das` 的 `[Code]` 块，逐对象比较
   *(Arg Count, Pos Only, KW Only, Flags, Locals+Names)*。
   **833 个对象相比，829 个完全相同**；差异只落在 4 个既有差量模块，外加 2 个没有
   0.6.6 对应项的对象（新模块 `backend/app/ha/numeric_sources.py` 与明文 runtime）。
2. `tools/das_delta.py --semantic`：归一化后的 `.das` 文本比对。
   **83 / 88 个模块完全相同**；4 个变化（`backend/app/api/ha.py`、
   `modules/interaction3d/{api,config,climate}.py`），1 个 0.6.7 新增
   （`backend/app/ha/numeric_sources.py`）。

两者给出的变化集合完全一致，与五道门禁的失败集合也一致——即「差量之外，0.6.6 的
还原与 0.6.7 的字节码逐对象一致」。

### 3.4 后端差量与新增（全部按 `.1shot.das` 重建）

| 模块 | 差量 |
| --- | --- |
| `backend/app/ha/numeric_sources.py` | **0.6.7 新增**，从零重建（`finite_numeric_state` / `numeric_sources`） |
| `backend/app/api/ha.py` | 新增 `from ..ha.numeric_sources import numeric_sources` 与 `GET /numeric-sources` 端点（`list_numeric_sources`） |
| `backend/app/modules/interaction3d/climate.py` | `require_air_conditioner_model` 新增 kw-only `model_type`；`binding.get('entityId')` → `get('entityId', '')`；`allowed` 收敛为单个条件表达式 |
| `backend/app/modules/interaction3d/api.py` | 新增 `is_purifier` / `is_water_heater` 两条分发分支与两个 elif；`'主实体已不属于当前浴霸设备…'` → `'主实体已不属于当前绑定设备…'`；媒体类型元组加 `purifier-state.js` |
| `backend/app/modules/interaction3d/config.py` | 新增 `airPurifiers` 集合分支与校验、`temperatureHumidity` 字段集加 `columns`/`showMetricNames`、`columns` 范围校验、`any(... for key in ('visible','showMetricNames'))` 形式 |

### 3.5 顺带修正的 0.6.6 骨架缺陷（`.das` 为据）

0.6.6 的门禁只比对名字与字符串常量，看不到**签名**、**被丢掉的子表达式**与**发明出来的分支**。
本轮把每个 `.das` 对象的指令流与 CPython 3.12 现场编译的产物逐引用比对（§7 的「忠实度审计」，
最终口径 1030 个对象中 1018 个完全一致），据此修掉下列各类缺陷：

| 类别 | 处数 | 判定依据（`.das`） |
| --- | --- | --- |
| 签名/占位参数缺失 | 5 | 注解元组里有该形参、但全对象 0 次 `LOAD_FAST` ⇒ 原码就是占位注入参数 |
| 发明出来的子句/分支/属性/载荷键 | 30+ | 该名字在对象内 0 次加载 |
| 被丢掉的结构（子句、局部量、白名单分支） | 12 | 对象内有加载而源码无 |
| 纯常量集合被写成 `frozenset({...})` | 40（10 个模块） | 该对象 0 次 `LOAD_GLOBAL frozenset`；3.12 的 peephole 会把常量集合折叠成 frozenset 常量 |
| docstring | 72 条对齐 / 542 条降级 | `.das` 的 `[Constants]`（见 §5 与 VALIDATION §2.7） |

代表性实例：

1. `backend/app/api/ha.py`：`entity_translations` / `run_sync` / `call_service` /
   `browse_media` 缺少 `_database: DatabaseSession` 形参（`.das` 的注解元组里有它，
   但全对象 0 次 `LOAD_FAST _database` ⇒ 原码就是占位注入参数，正文依旧用
   `request.app.state.database`）。
2. `backend/app/ha/service.py`：`HAConnectorService.__init__` 的 `on_reconnect` 是
   0.6.6 自己发明的（`.das` 里 0 命中，`restart` 的 `[Names]` 只有
   `stop`/`_runtime_error`/`start`），已连同回调与文档一并删除。
3. `backend/app/updates.py`：`UpdateChecker.__init__` 的 kw-only `wiki_url=WIKI_URL`
   同样是发明的（`.das` 的 kw-only 名元组是 `('enabled','transport','endpoints','clock')`），
   已删除，`logUrl` 改回 `LOAD_GLOBAL WIKI_URL`。
4. `backend/app/modules/interaction3d/render_cache.py`：`cache_path` 的 `principal`
   在 `.das` 里是 **kw-only**（`LOAD_CONST ('principal',)` + `BUILD_CONST_KEY_MAP` +
   `MAKE_FUNCTION 6`），已加 `*`。
5. `backend/app/modules/interaction3d/api.py`：5 处分发的第一个实参丢了
   `BUILD_LIST 1`（`.das` 在 132/192/298/404/524 有 `COPY 1; POP_JUMP_IF_TRUE`），
   恢复为 `[owner] if owner else bindings` / `[owner if owner else primary]`。
6. `backend/app/modules/interaction3d/config.py`：信息卡校验多了一个 `.das` 不存在的
   子句 `or item['floorId'] == 'all'`（`.das` 该处只有 `not item.get('id')`、
   `not item.get('floorId')`、`item['id'] in sensor_ids` 三个合取项），已删除。
7. 其余按对象修正由四批并行复核完成（报告在 `.work/fidelity/`）：`batch1-license` 6 个对象
   （`_mark_revoked` 的 18 项发明凭证清空、`stop` 的发明分支、三处 f-string 回退、
   `AdminAccountStore._write` 的发明平台门禁）、`batch2-ha-panel` 6 个、`batch3-interaction3d`
   8 个（4 修 4 等价）、`batch4-api-misc` 10 个（9 修 1 等价）；另有本轮自行清零的
   `backend/app/config.py::load_settings`（发明的 `debug_skip_license` 开关）、
   `backend/app/global_log.py::_safe_text.<locals>.<lambda>`（内联条件 f-string）、
   `backend/app/api/global_logs.py::export_global_logs.<locals>.<genexpr>`（外层 `str`）、
   `backend/app/api/projects.py::update_project_draft`（漏掉的 `require_document_ui_access` 门禁）、
   `backend/app/license/service.py` 四处、
   `backend/app/modules/interaction3d/render_cache.py::read_cache`（原文会 `path.unlink(missing_ok=True)`）、
   `backend/app/modules/interaction3d/api.py::get_resource`（白名单按 `.das` 的 4 步结构重写）、
   `backend/app/modules/interaction3d/device.py::validate_device_bindings.<locals>.entity`
   （去掉发明的 `bool(...)`）、`backend/app/api/assets.py::AssetCatalog.user_items`
   （补回第二个 `append` 站点）。
8. 反方向也有：`.das` 证明某些「多余」写法其实**不是缺陷**，本轮刻意不动（见 VALIDATION §2.6）——
   `with` 之后的语句被 3.12 复制进异常抑制路径、`return X` 被复制进 `except` 处理器、
   两处相同的 `return await call_service(...)` 被 pyarmor 合并成共享基本块、
   `CONTAINS_OP 0/1` 的极性对偶（算子与跳转同时取反）。

### 3.6 前端

javascript-obfuscator 每次构建都会随机化字符串数组旋转与十六进制标识符名，所以
**0.6.6 与 0.6.7 的同名文件字节比对永远不同**（实测 identical 0 / changed 200）。
于是：

1. **自研流水线**（`tools/deobfuscate_js.mjs` + 驱动 `tools/deobfuscate_all.mjs`）：
   重建旋转后的字符串数组、内联解码调用、剪除死 preamble、按作用域重命名；
   统计：解码字符串 10105、内联解码调用 20949、重命名 32358、异常 0。
2. **命名移植**：用 0.6.6 已验证的还原做「规范化 token 流 alpha 等价」比对
   （`tools/verify_frontend_rename.mjs`：绑定名替换为绑定身份、字符串值按序、属性名按序）。
   242 个有 0.6.6 对应项的文件判定为：
   **27 逐字节相同 / 187 alpha 等价（可整文件采用 0.6.6 的命名与排版）/ 7 只差 `?v=` 串 /
   21 真差量**；`modules/interaction3d/purifier-state.js` 是 0.6.7 新增，本轮自己命名。
3. **P1 机械归一**（`tools/normalize_frontend.mjs`）：`o["x"]→o.x`（含 `?.["x"]→?.x`）、
   标识符式引号键去引号、十六进制数字 → 十进制、`!0x0/!0x1 → true/false`、
   `\xNN/\uNNNN` 反转义，最后统一跑 Prettier（`quoteProps: preserve`）。
4. **验收**：`tools/validate_js.mjs` 的 AC-F1..F9（ESM 可解析、零 `_0x`、
   导出名与 import specifier 逐字节一致含 `?v=`、字符串不丢不造、资产 sha256、
   逐文件 verdict 表、非 vendor 树零标识符式 computed 访问、Prettier 干净）。

## 4. 统计（节选）

| 指标 | 数值 |
| --- | --- |
| 后端还原模块 | 88（67 backend + 21 migrations） |
| 后端逐字节照抄的明文文件 | 23（21 `alembic_runtime` + 1 pyarmor runtime + 1 `container_entrypoint.py`） |
| 后端 `.das` 对象签名比对 | 833 对象中 829 与 0.6.6 完全相同；本轮修正 8 处不符 |
| 后端逐对象语义引用审计 | 1030 个对象中 1018（98.8%）与 `.das` 指令流逐引用一致；88 个模块中 78 个聚合一致 |
| docstring：`.das` 一致 / 降级为注释 | 72 / 542（`# [补充说明]` 567 行、覆盖 37 个文件） |
| 前端 .js | 243（201 反混淆 / 31 仅格式化 / 11 逐字节） |
| 前端非 JS 资产 | 7907（sha256 全等） |
| 解码字符串 / 内联解码调用 / 重命名 | 10105 / 20949 / 32358 |
| 前端采用 0.6.6 命名 | 214（27 逐字节 + 187 alpha 等价） |

## 5. 已知限制

* **docstring 分两类**：72 条与 `.das` 的 `[Constants]` 逐字一致（**可证**，见 VALIDATION §2.7）；
  另外 542 条在 `.das` 里 `__doc__` 就是 `None`，已按选定的策略 A 降级为同位置的
  `# [补充说明]` 注释（567 行 / 37 个文件）。行内注释同理，都是可读性说明而非反编译产物；
  判断行为请以代码与 `.1shot.das` 为准。
* **占位名残留（可读性，而非反混淆残留）**：前端 214 个采用 0.6.6 还原的文件沿用其
  机械化占位名（`value1`、`arg4` 之类），0.6.6 报告已把这类名字列为已知限制；
  本轮新命名/重写的 22 个文件（21 个真差量 + `purifier-state.js`）同样以可读性优先。
  `_0x` 形式的名字为 **0**。
* **`frontend/static/embed-runtime.js`**：旋转 IIFE 与模块体属于**同一个顶层
  `SequenceExpression``，IIFE 不是独立语句，其引用使 provider `_0x2e71` 仍被定义；
  解码器已全部内联并移除，保留的 provider 是惰性的（数组已旋转，循环首轮即 break）。
* **vender 大包逐字节保留**（three/`OrbitControls.js`、`GLTFLoader.js`、`draco_decoder.js`、
  `qrcode-generator`、`hls.js`）：它们不是本项目代码，未做 P1/Prettier；AC-F7 的
  全树残留计数（840 computed / 165 quoted keys）全部来自它们，非 vendor 树为 **0**。
* **`tools/das_codecheck.py`（名字/常量嗅探器）**：目前 87/88 模块报差异信号，
  其中 `varnames/cellvars/freevars` 差量未校准（`.das` 的 `[Locals+Names]` 会剔除
  未使用名字），**不能当门禁**，只用于定位（例如它指出了 `api/assets.py` 的
  `mtime_ns`）。权威门禁是 §6 的六项 + `das_objcheck`。
* **还原忠实度带来的产品侧观察（不是还原缺陷）**：`backend/app/admin_account.py::AdminAccountStore._write`
  的 `.das` 里**没有** `if os.name != 'nt':` 门禁，即原文在 Windows 上也会执行
  `os.open(self.path.parent, O_RDONLY)`；该调用在 Windows 上抛 `PermissionError`，异常表
  `[800-1060→1282[0]]` 显示它会落到外层 `except Exception` → `self.path.unlink(missing_ok=True)` 并重抛，
  也就是刚 rename 出来的管理员账号文件会被删掉。本轮按 `.das` 原样还原，**若要修应在源项目修**。
* 后端 88 个模块中，4 个相对 0.6.6 有真实语义差量（§3.4），其余 84 个语义等同。

## 6. 验证

完整证据与逐项命令见 [VALIDATION.md](VALIDATION.md)。一键复现：

```bash
cd recovered
bash tools/verify_release.sh          # 18 项，退出码 0 = 全绿
```

原始目录未被改动（manifest 对比，跳过 `recovered/` 与本工具自己的暂存区）：

```
$ /usr/bin/python3 tools/manifest_check.py
before=8522 after=8628
PROJECT   added=0 removed=0 changed=0 clean=True
TOOLSTATE added=106 removed=0 changed=2
```

`TOOLSTATE` 是 GraphFlow 自己写的观察文件与索引，与本任务无关。

## 7. 工具清单（`recovered/tools/`）

| 类别 | 工具 |
| --- | --- |
| 后端还原 | `assemble_seed.py`、`restore_backend.py`、`pyarmor_extract.py`、`prep_scaffold.py`、`show_das.py`、`das_view.py`、`das_delta.py`、`cmp_sig.py`、`reverse_drift.py` |
| 后端门禁 | `verify_imports.py`、`verify_restore.py`、`verify_with_blocks.py`、`verify_try_blocks.py`、`verify_scope_names.py`、`verify_module_names.py`、`das_objcheck.py`、`das_codecheck.py` |
| 前端还原 | `deobfuscate_js.mjs`、`deobfuscate_all.mjs`、`normalize_frontend.mjs`、`resolve_frontend_strings.mjs`、`rename_frontend_*.mjs`、`apply_frontend_renames.mjs`、`transplant_frontend_names.mjs`、`adapt/*.mjs`、`copy_assets.py`、`run_all.sh` |
| 前端门禁 | `validate_js.mjs`、`verify_frontend_*.mjs`、`check_frontend_cache_bust.py`、`adapt/gate_ac.mjs` |
| 交付总门禁 | `verify_release.sh`（18 节）、`verify_all.sh`（0.6.6 的 19 节，需要 venv 与浏览器） |
| 忠实度审计 | `faith_objects.py`（逐对象引用差量 + 差量最小化配对）、`obj_refs.py`、`obj_diff.py`、`obj_keys.py`、`obj_hdr.py`、`obj_consts.py`、`das_object.py`、`das_ctx.py`、`das_range.py`、`src_range.py`、`docstring_audit.py`、`apply_docstring_policy.py`、`fix_set_literal.py`、`audit_set_literal_ast.py`、`verify_set_literal_edits.py`、`list_unassigned.py`、`enc_equiv_probe.py`、`invent_hunt.py`、`invent_triage.py`、`spot.py` |
| 其他 | `manifest_check.py`（原树未改动证据）、`reconcile_report.py`、`check_name_*.mjs` |

## 8. 复现

```bash
cd recovered
bash tools/run_all.sh         # 从混淆原件重新生成 frontend/**（日志 .work/run_all.log）
bash tools/verify_release.sh  # 全部 18 项门禁
```

后端重建属于「按模块差量」的过程（0.6.6 骨架 + 0.6.7 `.das` 差量），
逐模块配方见 `tools/RECIPE-rebuild-module.md` 与 `tools/RECIPE-apply-delta.md`，
差量证据见 `.work/das_delta*.json` / `.work/backend_vs_066.py` / `.work/cmp_sig.py`。
