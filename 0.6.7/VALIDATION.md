# 验证报告（VALIDATION）

本文件记录 `recovered/` 交付物的**全部可复跑证据**，包括门禁脚本输出、独立交叉验证、
以及**被否决的证据**（诚实记录哪些方法不可靠、哪些结论被推翻）。

复跑方式（无参数，路径自动推导；不需要 venv、不需要网络）：

```bash
cd recovered
bash tools/verify_release.sh            # 18 项，全部 PASS 时退出码 0
bash tools/verify_release.sh | tee .work/verify_release.log
```

原文完整日志：`.work/verify_release.log`（56 行），末尾为 `== summary: 18 passed, 0 failed`。

---

## 1. 一键门禁：18 / 18 PASS

| # | 检查 | 判定依据 | 实测输出 |
| --- | --- | --- | --- |
| 1 | 每个被保护模块都有还原产物 | 88 个 `*.py.1shot.seq` 是否都有对应 `.py` | `88 protected modules, 0 without a counterpart` |
| 2 | 全部 Python 文件可编译 | 内存 `compile()`（不能用 `py_compile` 写 `/dev/null`） | `compiled 111/111 file(s)` |
| 3 | 后端 import 与反汇编一致 | `tools/verify_imports.py` | `# checked 176 file(s): clean=176 with-differences=0` |
| 4 | 后端标识符/字符串与反汇编一致 | `tools/verify_restore.py`（tokenize + AST 派生名字，单向 .das→源码，含 INTENTIONAL_DROPS 白名单） | `# verified 176 file(s): clean=176 with-differences=0 errors=0` |
| 5 | `with` 语句保真 | `tools/verify_with_blocks.py` | `# checked 88 file(s): clean=88 with-differences=0` |
| 6 | `try/except` 保真 | `tools/verify_try_blocks.py` | `clean=88 with-differences=0 files-with-todo=0` |
| 7 | 作用域名保真 | `tools/verify_scope_names.py` | `# checked 176 file(s): with-extra=0 with-missing=0` |
| 8 | 模块级绑定双向一致 | `tools/verify_module_names.py .work/gatemirror`（`.work/gatemirror` 由 `mk_gatemirror.py` 建立：88 个 `<rel>.py` 符号链接 + 88 个 `<rel>.py.1shot.das` 符号链接） | `# checked 88 file(s): with-extra=0 with-missing=0` |
| 9 | **逐对象签名与形态** | `tools/das_objcheck.py`（.das 的 qualified-name 集合 + 每个对象的 `(arg_count, pos_only, kw_only, flags & 0x2BC)` vs 3.12 编译结果） | `# das object-shape check: modules=88 clean=88 diff=0 syntax_error=0` |
| 10 | 逐对象名字/常量（**嗅探器**） | `tools/das_codecheck.py`，仅作提示，不作判定 | `require_project_write: real=False; docstring_in_source=1`（唯一可操作提示） |
| 11 | 无 PyArmor 残留 | 扫描 `__pyarmor_*` / `Decompyle incomplete` / `None(None)`（排除 `pyarmor_runtime_*`） | `0 file(s) with marker/decompiler residue` |
| 12 | 前端 JS 可解析 | `node --check` 全部 .js | `243=243 file(s) parse` |
| 13 | 无混淆残留 | 正则 `_0x[0-9a-f]{4,}` + 解码器循环模式 | `0 obfuscated identifiers, 0 decoder loops` |
| 14 | 前端文件集合与原树一致 | 相对路径集合比对 | `identical relative path sets (8150 files)` |
| 15 | 非 JS 资产逐字节相同 | 7907 个资产 sha256 | `7907 non-JS asset(s) checked, 0 sha256 mismatch, 0 missing` |
| 16 | `?v=` 缓存串与原树一致 | `tools/check_frontend_cache_bust.py`（每个产物里的 `?v=` 串必须在 0.6.7 原件同文件中逐字出现） | `# files-with-cache-bust=77 tokens=383 missing-in-original=0` |
| 17 | 前端验收标准 AC-F1..F9 | `node tools/validate_js.mjs` | `VALIDATION: ALL PASS`（退出码 0） |
| 18 | **原始目录未被改动** | `tools/manifest_check.py` | `PROJECT added=0 removed=0 changed=0 clean=True` |

### 第 17 项的细分（AC-F1..F9）

| 编号 | 内容 | 结果 |
| --- | --- | --- |
| AC-F1 | 每个 .js 作为 ESM 可解析 | 243 / 243 |
| AC-F2 | 无 `_0x[0-9a-f]{4,}`（原始文本命中 0，AST 命中 0） | 243 / 243 |
| AC-F3 | 导出名与 import specifier 逐字节一致（含 `?v=` 查询串） | 243 / 243 |
| AC-F4 / AC-F4b | 解码字符串不丢不造（195 个文件共 10105 串） | 0 missing / 0 invented |
| AC-F5 | 非 JS 资产 sha256 | 7907 / 7907 |
| AC-F6 | 逐文件清单字段完整 | 243 条，0 缺字段 |
| AC-F7 / AC-F7b | 零标识符式 computed 访问、零引号标识符键 | 非 vendor 231 文件 = 0；全树 840 + 165 全部落在 3 个 vendor 文件 |
| AC-F8 | Prettier 干净（`quoteProps: preserve`） | 231 / 231 |
| AC-F9 | 逐文件 verdict 表存在 | `.work/frontend_verdicts.json` |

---

## 2. 独立交叉证据（手写，不属门禁脚本）

### 2.1 `.das` 逐对象签名比对：833 个对象中 829 个一致

`tools/cmp_sig.py`（0.6.6 的 `.das` vs 0.6.7 的 `.das`，按缩进解析 `[Code]` 块，
比较 Arg Count / Pos Only / KW Only / Flags / `[Locals+Names]`）：

* **829 / 833 完全相同**；
* 差异只出现在 4 个既定差量模块（`interaction3d/api.py` 的 `control_light`、
  `require_binding_model` 新增 `is_purifier`/`is_water_heater`；`climate.py` 的
  `require_air_conditioner_model` 由 `(3,0,1)` 变 `(3,0,2)`；`config.py` 的
  `validate_config` 新增 `airflow`/`extra`），以及 2 个无 0.6.6 对应项的对象。

推论：门禁 `das_objcheck` 早前报的 7 处签名不匹配**不是 0.6.7 改签名造成的**，而是
0.6.6 那轮还原本身与它自己的 `.das` 不符（0.6.6 的门禁从不比签名）——已全部修正（见
REPORT.md §3.5）。修正后 `das_objcheck` 归零：`modules=88 clean=88 diff=0`。

注：`.das` 把计数字段渲染成字符串，比较前必须 `int()` 转换，否则会得出「全部不匹配」的假结论。

### 2.2 归一化 `.das` 文本差量：83 / 88 完全相同

```bash
cd <WS> && /usr/local/bin/python3.14 recovered/tools/das_delta.py --root . \
  --ref ../0.6.6/tools/reference/.extracted --semantic --top 0.004
```

**83 个模块完全相同**；4 个变化（`backend/app/api/ha.py` 0.012、
`modules/interaction3d/config.py` 0.014、`api.py` 0.015、`climate.py` 0.019）、
1 个 0.6.7 新增（`backend/app/ha/numeric_sources.py`）。
与 §2.1 以及五道门禁的失败集合**完全一致**——三条独立证据互相印证。

### 2.3 前端：把 0.6.6 走一遍同样的 P1 归一，再与产物逐字节比

这是「本产物 = 0.6.6 命名 + P1 归一」的直接证明：

1. 把 0.6.6 的 242 个 .js 复制到 `.work/donor_p1`；
2. 用**同一份** `tools/normalize_frontend.mjs` 做 P1；
3. 与 `recovered/frontend` 逐字节比。

结果：**byte-identical = 213，mismatch = 29**。29 = 21 个真差量（与
`.work/frontend_verdicts.json` 的 mismatch 集合逐一对应）+ 7 个 cache-bust-only
+ 1 个实验伪差（`static/vendor/three/0.182.0/OrbitControls.js`：vendor 按设计不过 P1，
我在 donor 侧却过了 P1）。

### 2.4 前端 alpha 等价判定（采纳 0.6.6 捐贈文件的依据）

javascript-obfuscator 每次构建随机化旋转与标识符，字节比对无效（0.6.6 vs 0.6.7：
identical 0 / changed 200）。改用「规范化 token 流」比较器
（`tools/verify_frontend_rename.mjs`：绑定名替换为绑定身份，字符串值按出现顺序，
属性名按出现顺序）：

| 判定 | 数量 | 处理 |
| --- | --- | --- |
| 逐字节相同 | 27 | 直接采用 |
| alpha 等价 | 187 | 采用 0.6.6 的命名与排版（同时白得注释与格式化） |
| 只差 `?v=` 缓存串 | 7 | 采用 0.6.6 正文 + 从 0.6.7 原件回贴 `?v=` 串（必须过门禁 12/16/17） |
| 真差量 | 21 | 保留本轮自研反混淆版本，只做 P1 风格归一 |
| 无对应项 | 1 | `modules/interaction3d/purifier-state.js`（0.6.7 新增）自行命名 |

7 个 cache-bust-only：`modules/interaction3d/popup-preview.js`、
`static/3d-studio/stage-startup.js`、`static/display.js`、
`static/renderer/{cover-runtime,registry,runtime-document}.js`、`static/ui-packs/loader.js`。

### 2.5 路径集合

`recovered/frontend` 与原 `frontend/` 相对路径集合完全相同（各 8150 个文件，
零缺失零多余）。注意 `find -name '*.js'` 报 244 是因为
`frontend/static/vendor/hls.js` 是**目录**，真实 .js 文件 243 个。

### 2.6 `faith_objects.py`：逐对象语义引用差量（对照 `.das` 指令流）

口径：把每个 `.das` 对象的 `[Disassembly]` 与用 **CPython 3.12** 现场编译 `recovered/backend/**`
得到的同名 `co_qualname` 代码对象逐 (opcode + 名字) 计数比对；pyarmor 噪声
（`NOP`/`CALL_FUNCTION_EX`/`PUSH_NULL`/`JUMP_*`/`POP_TOP`/`PUSH_EXC_INFO`/`RERAISE`/`POP_EXCEPT`）不计。
同名对象（如 `backend/app/modules/interaction3d/config.py::validate_config.<locals>.<genexpr>` 有 79 个）
用**差量最小化配对**（n≤8 全排列穷举；n>8 贪心 + 2-opt 交换）消除按位置 zip 产生的镜像假差。

命令与结果（`tools/faith_objects.py 60`，输出 `.work/faith2_aligned.txt`）：

```
objects=1030  modules=88  unmatched=0
object delta distribution: {'6-10': 1, '3-5': 1, '2': 3, '1': 7, '0': 1018}
per-object exact match: 1018 (98.8%)
per-module aggregate exact: 78/88
```

剩余 12 个非零对象全部有解释，无未定项：

| # | 对象 | 差量 | 判定 |
| --- | --- | --- | --- |
| 1 | `backend/app/modules/interaction3d/device.py::validate_device_bindings` | `CONTAINS_OP 0` ×3 ↔ `CONTAINS_OP 1` ×3 | 等价编码：算子与跳转极性同时取反（`if k in x: pass else: continue` ≡ `if k not in x: continue`），本机 3.12 只产一种形态 |
| 2 | `backend/app/modules/interaction3d/config.py::validate_config` | `CONTAINS_OP 0` ×2 ↔ `1` ×2 | 同上 |
| 3 | `backend/app/modules/interaction3d/config.py::validate_config.<locals>.validate_camera` | `CONTAINS_OP 0` ×1 ↔ `1` ×1 | 同上 |
| 4 | `backend/app/modules/interaction3d/access.py::access_grant` | `CONTAINS_OP 0` ×1 ↔ `1` ×1 | 同上 |
| 5 | `backend/app/api/assets.py::AssetCatalog.register_user`、`register_studio3d_export` | 各多 src-only `LOAD_GLOBAL dict` ×1 | 3.12 把 `return dict(payload)` 复制进 `with` 的异常抑制路径；`.das` 只有一处（`298 JUMP_FORWARD`） |
| 6 | `backend/app/ha/service.py::HAConnectorService._mark_connected` | 多 src-only `STORE_ATTR _runtime_error` ×1 | 同上（`with` 抑制路径重存一次；`.das` 在 `334 JUMP_FORWARD 31` 汇入共享尾声） |
| 7 | `backend/app/license/service.py::LicenseService._response_error_detail` | 多 src-only `LOAD_GLOBAL str` ×1 | pyarmor 把 `return X` 改成共享尾声；普通编译把 `str(detail)` 复制进 `except` 处理器（`.das` `198 JUMP_BACKWARD 33 (to 134)`） |
| 8 | `backend/app/migrations.py::_sha256` | 多 src-only `LOAD_ATTR hexdigest` ×1 | 同 7（`return` 尾段被复制） |
| 9 | `backend/app/dependencies.py::ViewerPrincipal.displays` | 多 `LOAD_ATTR additional_displays` ×1 + `BINARY_OP +` ×1 | 同 7（`return` 落在 `join` 处，被复制进三元的两个分支） |
| 10 | `backend/app/modules/interaction3d/api.py::control_light` | 多 src-side `LOAD_GLOBAL call_service` ×1 | pyarmor 把两处相同的 `return await call_service(...)` 合并成共享基本块，`.das` 只见一次 |
| 11 | `backend/app/api/studio3d.py::<module>` | 多 src-only `STORE_SUBSCR` ×1 | 整份语料 **0 处 `STORE_SUBSCR`、0 处 `__annotations__`**（88 个模块全查）⇒ 模块级注解存储被 pyarmor 抹掉，不可证伪 |

补充不变量（`tools/audit_set_literal_ast.py`）：对 88 个模块比较「源码里
`ast.Call(func=Name('frozenset'))` 个数」与「`.das` 里 `frozenset` 名字加载数」，唯一不匹配是把
`backend/app/license/service.py::TERMINAL_STATES` 从 `frozenset({...})` 改回 `{...}` 的那一处
（源码 1 / `.das` 0），其余 87 个模块全等 ⇒ 40 处集合字面量改写没有抹掉任何真实调用。

### 2.7 docstring 可以从 `.das` 恢复（并据此重做了一遍）

REPORT §5 旧说法「PyArmor 会剥掉 docstring」**是错的**：`.das` 的 `[Constants]` 保留了原始
docstring 文本。判定规则（`tools/docstring_audit.py`）：module/class body 是
`LOAD_CONST <k>: '<str>'` + `STORE_NAME __doc__` 配对；函数/方法/推导式里 docstring 是不被引用的 `c0`。
**陷阱**：genexpr 的 `c0` 常是被使用的常量（`' | '`、`'='`），class body 的 `c0` 是类名
⇒ 必须用「无 `LOAD_CONST 0` 引用」+「`__doc__` 配对」判定，否则会把 174 个对象误判为有 docstring。

按选定的策略 A（严格对齐）落地（`tools/apply_docstring_policy.py`）后复验：

```
modules=67  recovered_docstrings=72  das_objects_with_docstring=72
  ok 72 / extended 0 / text-differs 0 / extra 0 / missing 0
```

即 72 条有依据的 docstring 逐字对齐 `.das`（原先 22 条被追加过中文、3 条正文有差异），
542 条在 `.das` 里 `__doc__` 为 `None` 的降级为同位置的 `# [补充说明]` 注释
（567 行 / 37 个文件），不再冒充 docstring。

---

## 3. 原始目录未被改动的证明

`.work/manifest.before.json` 是本轮开始前对整个工作区（跳过 `recovered/` 与 `.git`）
逐文件 sha256 的快照（8522 条，元素 `{path, size, sha256}`）；
`/usr/bin/python3 tools/manifest_check.py` 重新扫描并比对：

```
before=8522 after=8628
PROJECT   added=0 removed=0 changed=0 clean=True
TOOLSTATE added=106 removed=0 changed=2
```

* `PROJECT` 涵盖 `backend/`、`migrations/`、`frontend/` 等受保护源码：**零新增、零删除、
  零修改**。
* `TOOLSTATE`（`.graphflow/`、`graphflow-out/`）是 GraphFlow 工具自己写的观察文件与索引，
  由本会话之外的进程产生，按定义单独统计，不计入项目判定。
* 输出另存 `.work/manifest_after.json` 与 `.work/manifest_diff.json`。

---

## 4. 被否决 / 不可用的证据（避免误用）

诚实记录本轮淘汰的方法与错误的中间结论：

1. **`tools/validate_backend.py` 的 AC-B4（字符串覆盖率）不可用**。
   它用正则从 `.das` 的 `[Constants]` 段粗暴抓引号字面量再与源码常量集合比，会被隐式
   字符串拼接、f-string、跨行字符串、转义差异系统性破坏，对几乎每个模块都报
   「strings: NN% (N missing)」（`admin_account` 28.16%、`api/ha.py` 60.15%、
   `auth_limiter` 0.00%）。**不要把它当失败证据**；权威是 `verify_restore.py`（门禁 4）。

2. **`tools/das_codecheck.py` 不能当门禁**。名字/常量深指纹未校准：`.das` 的
   `[Locals+Names]` 会剔除未使用的名字，导致 `varnames_missing` 等计数器大量假阳性
   （当前 87/88 模块有信号，`differing_objects=878`）。它只用于**定位**（例如它指出
   `api/assets.py` 的 `user_asset_payload` 多出 `mtime_ns`）。门禁 10 只打印、不判定。

3. **我自己的 AST 形状比对（`struct_cmp2/3.mjs`）结论错误并被推翻**。它把
   `obj["ident"]` 折叠成 `obj.ident`，却漏掉 `OptionalMemberExpression`
   （`arg1?.["get"]`、`v1?.["newState"]`）这一主流形态，于是每个可选访问都被算成差量，
   得出「22/242 同构 ⇒ 0.6.6 不能当命名权威」的**错误结论**。手工 diff 证实真相相反：
   `modules/interaction3d/car-state.js` 与 0.6.6 只差绑定名与写法
   （`arg1?.["get"]?.(arg2)` vs `arg1?.get?.(arg2)`、`0x78` vs `120`）。

4. **`verify_frontend_rename.mjs` 有已知盲点**。它的 StringLiteral 折叠只覆盖 computed
   key，不覆盖对象字面量的引号键；直接把 0.6.6/frontend 与产物比会得
   `mismatched=188`，其中 188 处全部由 P1 的「引号标识符键去引号」造成
   （`"momentary":` → `momentary:`）。因此采纳判定用「donor 也走一遍 P1」（§2.3）来消除
   该盲点。

5. **pycdc 路线被放弃**（11 轮 C++ 补丁后仍未可用）。把 `parse_ok` 从 45/88 提到 73/88，
   但残留损毁是系统性的：全树 `with X:` **0 条**（`with None:` 161 处，所有锁/句柄/事务
   丢失，根因是 pycdc 对 3.12 的 `BEFORE_WITH` 直接忽略）、布尔链极性反转
   （`if not A or not B:` → `if not A and B:`）、复杂 genexpr 塌缩成 `(lambda .0: …)`
   （14 处 / 11 文件）、73 处函数外裸 `return`（`ast.parse` 通过但 `compile()` 非法）。
   **这些百分比不要当成还原质量指标**。

6. **前端字节比对（`frontend_delta.json`）无意义**：0.6.6 与 0.6.7 之间
   identical 0 / changed 200 / new 43，纯粹因为混淆器每次构建随机化。

---

## 5. 残留风险与后续建议

* `das_codecheck` 里尚有未校准的 `freevars/cellvars/varnames` 差量（§4.2）。若要继续加固，
  正确方向是**用 3.12 编译产物反推**哪些名字属于「被 .das 剔除的未使用局部」，再消除假阳性，
  而不是直接照单修源码。
* `recovered/.work/` 是中间产物（含 `.das` 抽取、镜像、日志、JSON 证据），交付时可保留供审计，
  也可整目录删除；`recovered/backend`、`recovered/frontend`、`recovered/tools` 不依赖它
  （除门禁需 `.work/ref067`、`.work/gatemirror`、`.work/py312`、`.work/manifest.before.json`）。
* docstring 有两类来源：72 条已与 `.das` 的 `[Constants]` 逐字对齐（§2.7），其余 542 条与全部行内
  注释是可读性说明，不由反汇编保证——它们在正文里以 `# [补充说明]` 区分，不要当成原文。
* 「语义引用差量」仍有 12 个对象非零（§2.6），但每个都已定位到等价编码或编译/改写工件；
  若将来换 CPython 版本重跑 `tools/faith_objects.py`，等价编码那 4 项的极性可能整体翻转，属预期。
* **产品侧观察（`batch1-license` 复核时发现，不属还原缺陷）**：`backend/app/admin_account.py::AdminAccountStore._write`
  原文无 `if os.name != 'nt':` 门禁，Windows 上 `os.open(<目录>, O_RDONLY)` 抛 `PermissionError`
  后会被外层 `except Exception` 删掉刚写好的账号文件。本轮按 `.das` 原样保留。
