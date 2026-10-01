# 前端命名规范（0.6.7）

> **0.6.7 前言。** 本文件自 0.6.6 的同名文档继承而来；下面的「0.6.6 的规模」等小节保留了
> 上一轮的历史叙述作为出处，但**所有可执行流程（第 1–7 节）与工具都以本目录
> `0.6.7/` 为准**。0.6.7 与 0.6.6 的关键差别：
>
> - 树规模：`frontend/` 下 **231 个非 vendor `.js`**（含 vendor 共 243 个）。
> - 本轮起点（`node tools/report_frontend_names.mjs`，2026-10-01 实测）：
>   ```
>   # files=231 with-residue=209 mechanical=18419 short=3865 semantic=14610 exported-frozen=943 parse-failures=0
>   ```
>   `mechanical` 的构成：`arg*` 8518、`value*` 6170、`element*` 1223、`fn*` 980、
>   `list*` 432、`map*` 341、`text*` 296、`set*` 180、`object*` 141、`error*` 52，其余为小尾巴。
> - 棘轮起点：`tools/rename-ratchet.json` 已按本树重标为 **18419 / 3865 / 0**
>   （0.6.6 的 24898 / 3531 只对 0.6.6 的树成立，直接沿用会因 `short` 上升而被门禁拒绝）。
> - 基线：本目录的 `.restore/` 由本轮阶段 0 建立（见第 3.0 节），与 0.6.6 的 `.restore/` 不是同一批文件。
> - 对读版本仍在 `~/项目/HomeOS/HomeOS-3D/homeos-3d/frontend/**` 与 `homeos-3d/dist/**`（含 chunk）。

本文件约束 `frontend/**` 的标识符命名与格式化。0.6.6 的反混淆流水线已经清除了
全部 `_0x` 混淆（自研 `node:vm` 字符串解析器 + `rename_frontend_identifiers.mjs`
+ `rename_frontend_locals.mjs`；没有用 webcrack——它 2.x 依赖的 `isolated-vm`
预编译产物只到 Node ABI 137，而本机 Node 是 26/ABI 147），但把每个词法绑定都机械地
命名成了「角色名 + 序号」（`value1234`、`arg56`、`fn7`），并留下一批发布版自带的
一两字符名（`m`、`qe`、`gt`）。当前残留量可以随时用

```bash
node tools/report_frontend_names.mjs
```

查看——该脚本逐文件列出仍未处理的名字与数量，本身就是进度清单；处理完的文件
因为不再出现在输出里，无需额外维护清单文件。

**0.6.6 的规模。** `frontend/` 下有 **230 个非 vendor 的 `.js`**（含 vendor 共 242 个，
其中 12 个是 vendor），发布包里 **200 个**是被 obfuscator.io 混淆过的一方模块。
四轮机械流水线按顺序跑完，实测输出如下（可直接复现）：

| 轮次 | 命令 | 实测输出 |
| --- | --- | --- |
| 1 | `node tools/resolve_frontend_strings.mjs --stats` | `# resolved 199 file(s), skipped 1, inlined 20996 decoder call(s)` |
| 2 | `node tools/normalize_frontend_literals.mjs` | `# hex=18111 not=5649 infinity=139 void=123 files-changed=215 failures=0` |
| 3 | `node tools/rename_frontend_identifiers.mjs` | `# done: files changed=77 aliases restored=846 failed=0` |
| 4 | `node tools/rename_frontend_locals.mjs` | `# changed files=199 bindings=31365 occurrences=143671 bytes=-324579 failed=0 leftover_0x=0` |

第 2 轮的 `--check` 已归零，之后全树做过一次 Prettier 重排
（`prettier --write "frontend/**/*.{js,css}"`）。**全树 `_0x` 残留为 0。**

机械流水线收尾时（第 4 轮结束）的残留清单是：

```
# files=230 with-residue=215 mechanical=31232 short=3677 semantic=1831 exported-frozen=927 parse-failures=0
```

> **勘误（G6，2026-09-30）**：上面这一行是当时的原文，其中 `exported-frozen=927`
> 用的是旧口径。导出集合现在收敛在 `tools/lib/exported-names.mjs` 一处
> （`plan_rename_ranges` / `brief_rename_range` / `report_names` / `apply_renames`
> 四个脚本共用同一个 `exportedLocalNames(ast)`），同一棵树重新计数为 **941**：
> 多出的 14 个都是 semantic 名（例如 `frontend/modules/interaction3d/climate-state.js`
> 的 `createWaterHeaterFeedback`），旧口径另错误冻结了 2 个 `export { x } from …`
> 再导出的名字（`export … from` 不冻结任何本地绑定）。`mechanical`/`short`
> 两栏不受影响。

四个桶互不重叠，含义各不相同——这是**流水线的产物，不是错误**：

| 桶 | 含义 | 处置 |
| --- | --- | --- |
| `mechanical` | 第 4 轮按「角色 + 序号」造出来的名字 | 归零目标，逐批改成语义名 |
| `short` | 发布版自带的一两字符名 | 归零目标，逐批改成语义名 |
| `semantic` | 假定有语义的名字 | **保持不动** |
| `exported-frozen` | 导出名（公共 API） | **永远不动** |

> **棘轮是「不许上升」，不是「必须归零」。** 实测有 **3 个导出绑定本身就带短名**：
> `frontend/modules/interaction3d/light-state.js` 的 `j`、
> `frontend/modules/interaction3d/vacuum-map.js` 的 `N` 与 `$`。
> 导出名冻结，`apply_frontend_renames.mjs` 会拒绝动它们，所以这两个文件的
> `short` 计数**降不到 0**；`HB_MAX_SHORT` 要一直容着这一小撮，直到上游
> 发布版自己换名。`exported-frozen` 与 `mechanical`/`short` 是两个独立计数，
> 不要互相加减：`exported-frozen` 不是「已占用的残留」，`mechanical` 里也可能有自己的导出名。

**与 0.6.5 的差值不是退步。** 同一个脚本对 `0.6.5/frontend` 的终态是：

```
# files=181 with-residue=160 mechanical=26091 short=3384 semantic=1700 exported-frozen=751 parse-failures=0
```

0.6.6 多出的约 5.4K 个机械名集中在**版本变化过的文件**。用 `tools/verify_frontend_rename.mjs`
把 0.6.6 对 0.6.5 对读，实测 `byte-identical=104 alpha-equivalent=1 mismatched=88 missing-or-extra=49`：
88 个文件与 0.6.5 alpha 不等价，49 个 `.js` 是 0.6.6 独有的。这些新增/变动的代码
重新走了一遍流水线，自然带上新的机械名。

## 一、不可违反的约束

**只允许改动词法绑定的名字。** 以下内容必须逐字节保持不变：

| 项目 | 说明 |
| --- | --- |
| 导出名 | `export const/function/class X`、`export { X as Y }` 的 `Y`、`export default`。这是公共 API，被其他模块、HTML 入口 `<script>` 和动态 `import()` 消费 |
| 导入说明符 | `import { X as Y }` 的 `X` 侧（模块导出名） |
| 非计算成员属性 | `obj.prop`、`obj[prop]` 中的属性名 |
| 对象/类属性键 | `{ key: v }`、`class { key() {} }` 的键 |
| 字符串与模板内容 | 含 `?v=…` 缓存串与全部中文文案 |
| 程序结构 | 只改名，不做提升、重排、内联、提取或合并 |

> 导出名冻结是硬性要求。Alpha-等价性校验**看不见**导出名改名——导出名本身
> 是一个绑定，模块内部一致改名后两个文件依然 alpha-等价，但所有消费方会在
> 运行时断裂。该风险由 `tools/verify_frontend_public_api.mjs` 守卫
> （`verify_frontend_batch.sh` 第 3 节，dir-vs-dir 模式要求 `changed=0`）。

## 二、命名规则

### 2.1 从语义出发，而不是从类型出发

先读懂这个绑定**代表什么业务概念**，再取名；不要因为它是 `Object` 就叫
`object3`。参考领域词汇：

| 领域 | 示例名字 |
| --- | --- |
| Home Assistant | `entityId`、`stateAttributes`、`serviceData`、`entityRegistry` |
| 3D 场景 | `sceneGroup`、`cameraTarget`、`lightMesh`、`floorPlanPoints` |
| DOM | `panelElement`、`hostElement`、`canvasElement` |
| 网络 | `response`、`requestBody`、`abortController`、`retryDelayMs` |
| 几何/数学 | `clamp`、`roundTo`、`deepClone`、`lerp`、`normalizeVector` |
| 持久化 | `cachedLayout`、`storedSettings`、`historyEntries` |

**0.6.6 概念词表（跨批次复用同一批名字，避免同一个概念在不同文件里叫法发散）：**

| 概念 | 统一名字 |
| --- | --- |
| 实体 ID / 其域前缀 | `entityId` / `entityDomain` |
| 实体状态与属性 | `entityState` / `stateAttributes` |
| 服务调用 | `serviceData` / `serviceDomain` |
| 组件（看板元素）与其绑定 | `component` / `componentBindings` |
| 动作规则 | `actionRule` / `actionConfig` |
| 页面路径 / 弹窗 ID 集合 | `pagePaths` / `popupIds` |
| 3D 场景根 / 相机 / 材质 | `sceneGroup` / `cameraTarget` / `meshMaterial` |
| 户型图采样点 | `floorPlanPoints` |
| 时间源（可注入） | `clock` / `nowMs` |
| 画布与容器 | `canvasElement` / `hostElement` |
| 请求中止 | `abortController` / `abortSignal` |
| 缓存与索引 | `cached*` / `*ByEntityId` |

**对读版本（命名词典）不再是单一目录。** 0.6.5 文档里的
`~/项目/HomeOS/HomeOS-3D/frontend/**` 在今天的机器上**已不存在**；可读的同名实现
现在分散在 `~/项目/HomeOS/HomeOS-3D/homeos-3d/frontend/**` 与
`~/项目/HomeOS/HomeOS-3D/homeos-3d/dist/**` 下。`dist` 里的同名文件常常只是一个
re-export 壳再指向 chunk，例如 `homeos-3d/dist/modules/runtime/camera/camera-motion.js`
只有 169 字节，正文在它 import 的 chunk 里——**原作者命名要连 chunk 一起看**：

```js
import { n as e, r as t, t as n } from "../chunks/camera-motion-ilzGmPoj.js";
export {
  n as automaticAirConditionerCamera,
  e as automaticLightCamera,
  t as createDampedCameraMotion,
};
```

所以每个批次的第 2 步应当是**先按 basename 找对读版本**
（`find ~/项目/HomeOS/HomeOS-3D -name "<basename>"`），再逐函数对齐取名；
只有对读版本里不存在的函数才需要自己命名。这一步通常能把「编名字」变成
「核对名字」，也是这批工作最快的路径。

> 对读**只借名字，不借结构**。今天的 `homeos-3d/frontend` 与 0.6.6 之间按相对路径
> 重合的文件极少（`tools/verify_frontend_rename.mjs` 对读实测 `missing-or-extra=255`、
> `total-before=13`），逐 token 等价更罕见。0.6.6 自己的
> `frontend/modules/interaction3d/camera-motion.js`（367 行）实测还剩
> 170 个机械名、15 个短名、7 个冻结导出名——名字要一个一个对，不能整文件搬。
> 作者本人也在用限定名解决同一问题：同一个「THREE 命名空间」参数在不同函数里
> 分别叫 `threeNamespace`、`threeCore`、`threeToolkit`、`threeContext`，
> 因为改名器要求**同一文件内新名字唯一**（`apply_frontend_renames.mjs` 里
> `namesSeen`/`reserved` 的两道断言）。

### 2.2 按种类施加约定

| 种类 | 约定 | 示例 |
| --- | --- | --- |
| 布尔 | `is` / `has` / `should` / `can` 前缀 | `isReady`、`hasLoaded`、`shouldReflow` |
| DOM 节点 | `xxxElement` 后缀 | `popupElement`、`statusElement` |
| Map / Set | `xxxByUuid`、`xxxSet` | `viewsByProjectId`、`pendingSet` |
| 回调 | `onEvent` 用于外部传入，`handleEvent` 用于内部实现 | `onFocusChange`、`handlePointerDown` |
| 数值常量 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`、`DEFAULT_POPUP_RATIO` |
| 计数器 | `xxxCount` | `retryCount`、`frameCount` |
| 单位敏感的量 | 名字带单位 | `durationMs`、`widthPx`、`angleRad` |
| 单字母/缩写 | 只保留公认缩写，且需有语义 | `uv`、`url` 可；`a`、`b`、`x1` 不可 |

### 2.3 名字必须在文件内唯一

沿用改名器既有做法：候选名集合预置文件内已出现的全部标识符，新名字不得与之
冲突。这从根本上排除意外遮蔽，也让审阅 diff 更容易。

### 2.4 不要动这些名字

- **导出名**——即使它有更好的名字（也见前言那 3 个带短名的导出绑定）。
- **已经是语义化的名字**——`report_frontend_names.mjs` 归入 `semantic` 桶的名字
  不再改动。不要为了「统一风格」去重命名它们。
- **字符串、中文文案、`?v=…` 缓存串**。

> 「什么算残留」只有一处定义：`tools/lib/name-buckets.mjs`。三个工具都 import
> 它（`report_frontend_names.mjs`、`apply_frontend_renames.mjs`、
> `plan_frontend_rename_ranges.mjs`），`verify_all.sh` 第 13 项用自检锁住两个方向——前缀表漏了
> 会让门禁虚高并让残留名字永远动不了（`weakMap1`、`resizeObserver1` 就曾如此），形态规则放宽
> 则会误伤 `sha256`（导出 API）和 `alignTo16`（数字是语义的一部分）。要新增前缀
> 请按该文件注释里的办法实测穷尽，不要改成形态匹配。
>
> 该文件实测当前是 **25 个前缀**，其中 23 个是残留、2 个是误报（`sha` → `sha256`、
> `alignTo` → `alignTo16`）；前缀来自 `rename_frontend_locals.mjs` 的
> `toCamelCase(callee.name)`，集合是开放的（`new WeakMap()` → `weakMap1`、
> `new IntersectionObserver()` → `intersectionObserver1`），所以「未来新前缀」要重新
> 实测导出，而不是放宽形态规则。
>
> **2026-10-01 更正（重要，本轮踩过）。** 上面这条「25 个前缀」的实测是 0.6.6 树上的
> 结论，直接搬到 0.6.7 就漏了。按同一办法在 0.6.7 上重测，另外还有 **约 25 个前缀**
> 和 **一整类「短前缀 + 数字」的绑定**没进表，合计约 **7,800 个绑定**被误判成
> `semantic`：四个压缩巨型文件（`home.js`、`studio-app.js`、`renderer.js`、`stage.js`）
> 里的 `v10`/`v11`/…/`v1452`（单 `v` 前缀就 9,698 个）、`num3`、`max12`、`now10`、
> `f02`、`_10`、`Ie10` 等。
>
> 后果是**双向**的：`report_frontend_names.mjs` 把 0.6.7 的起点报成 18,419 而不是
> 真实的约 21,600（棘轮虚低），`apply_frontend_renames.mjs` 则拒绝改名这些名字
> （「is already meaningful」），于是它们**永远不会被清掉**——这正是本节警告的
> 「门禁虚高并让残留名字永远动不了」。当时已完成的 52 个文件里有 2 个因此留了尾巴
> （`percentage-bar-model.js` 的 `v10 v11 v12 options2 options3 num2`、
> `bath-heater-editor.js` 的 `v10 v11 filter2`）。
>
> 同时发现三处调用点（`report_frontend_names.mjs`、`plan_frontend_rename_ranges.mjs`、
> `apply_frontend_renames.mjs`）**各自重新实现了一遍判定**、只 import 两个正则而不走
> `classifyName`，所以后来加进 `name-buckets.mjs` 的规则对它们无效。现已全部改为调用
> `classifyName`：判定**只能有一个入口**。
>
> 短前缀那一类走的是形态规则 `MECHANICAL_SHORT_PREFIX_RE`（一两个字符 + **两个以上**
> 数字），而不是继续往白名单里堆字母。它按构造就不可能误伤本节列出的假阳性：
> 前缀最多两个字符，`sha256`/`base64`/`alignTo16`/`temp1`/`word15` 的数字够不着；
> 要求两个以上数字，THREE 的 `uv2`/`mat4`/`vec3` 也不会被吞。两个方向都在
> `tools/lib/name-buckets.selftest.mjs` 里锁死（现 71 例）。
>
> `short` 桶必须清零：0.6.6 收尾时的 3,677 个一两字符绑定是发布版残留
> （`e/t/n/o/s/r/i/c/a` 与 `gt/st/ve/ct/dt` 之类），没有 `uv` 这种需要保留的领域缩写。
> 唯一的例外就是前文那 3 个被导出的短名。

### 2.5 受控词表与形态代数

- **单一来源** `tools/rename-glossary.json`（version 2，167 条）：每条 = `{concept, domain, canonical, kind, allowedTransforms}`，域有 ha / scene / dom / net / cache / time / persist / ui。
- **允许的形态变换是一个闭集 T1–T8，全部可 AST 判定**：T1 复数 `*s`、T2 `*By<Key>`、T3 `*Set`、T4 布尔 `is/has/should/can`、T5 管线前缀（`raw/normalized/parsed/serialized/cached/previous/next/pending`）、T6 单位后缀（`Ms/Px/Rad/Deg/Ratio/Count/Index`）、T7 owner 限定、T8 回调（外部传入 `on*` / 内部实现 `handle*`）。一次命名最多复合两个变换；**T7 是唯一允许的消歧手段**——`threeNamespace`/`threeCore`/`threeToolkit`/`threeContext` 那种同概念发散就是靠它收敛的。
- `tools/check_glossary.mjs` 只把四类判成错误：压缩名、词+数字形状、禁用消歧词（`data/temp/context/manager/helper/util/info/obj` 之类）、与文件内已有标识符冲突。**词表覆盖不足只出 WARN**（试点批次 402 条里有 388 条），因为闭表会否掉整个语料；本批新概念记进侧车 `newConcepts`，**不为指标好看而放宽规则**。
- 命名有三条可判定的 oracle，全部带 selftest 并接进 `verify_frontend_batch.sh` §16：`check_glossary.mjs`（词表）、`check_name_anchors.mjs`（选择器派生：`querySelector("#id")`/`getElementById("id")` 派生的名字必须含该 id 的 camelCase）、`check_name_kinds.mjs`（形态）。自检先跑，理由同第 14/15 节：**一个无法证明会失败的门禁，会一直通过**。
- `check_name_kinds.mjs` 的原则是 **sound before complete**：名字尾巴必须是描述节点角色的词（`*Element` 或 `Button/Dialog/Row/Container/...`），但形状不可判定的绑定（解构属性、`let x = null` 后填、不认识的工厂）记为 `shape-undecided` 并且**永不报错**——假报错会花掉复核人一个真名字，什么也教不了。试点批次 402 条里它判定了 104 条、修正了 4 条真缺陷。2026-09-30 批 b12-renderer-c1 又发现一类假证据：`renderer.js` 的组件记录是普通对象（`this.componentRecords.get(id)`），自带 `position` 与 `style.scale`，而元素证据表里有 `style`，于是 6 条被误判成元素。已把 `style` 从 `check_name_kinds.mjs` 的元素证据里移除（单独的 `.style` 读写不是 DOM 证据），并在自检里加两条锁死该判定。

## 三、每批的处理与验证流程

改名**不手写重写文件**，而是先产出映射、再由工具套用：

### 3.0 前置：基线目录替代 git HEAD

门禁的「前后两棵树」校验一律以**目录基线**为基准，不依赖 VCS——`verify_frontend_batch.sh`
读的是 `.restore/` 下的文件，所以本目录即使被纳入了某个 git 仓库（0.6.7 位于
`HomeOS-3D` 仓库内），这套校验也照常按目录快照工作。0.6.7 的 `.restore/` 由本轮阶段 0 建立，
与 0.6.6 的 `.restore/` **不是同一批文件**，不能混用：

| 基线 | 内容 | 用途 |
| --- | --- | --- |
| `.restore/frontend-baseline/` | 本轮改名**开始前**的树（`frontend/**/*.{js,css,html}`） | alpha-等价与格式等价的 before 侧；拿混淆态基线会**永远 mismatch** |
| `.restore/frontend-baseline.sha256` | 上述基线的 sha256 锚 | 门禁 §0：基线自身未被改动 |
| `.restore/orig-frontend/frontend/` | 发行包原件（`app-0.6.7.tar.gz` 解出的混淆 `.js`） | 字符串保真闸门的 orig 侧 |
| `.restore/baseline.sha256` | 8 个前端 `.html` 的发行 sha256 | 门禁 §11：HTML 的**权威字节** |

回滚语义：`cp .restore/frontend-baseline/<rel> frontend/<rel>` 恢复单文件；
套用前把目标文件另存到 `.restore/batch-snapshots/<id>/` 供批次级回退。

### 3.1 产出映射

读目标文件，输出一个 JSON：

```json
{
  "frontend/static/renderer/entity-metadata.js": {
    "arg1@1": "metadata",
    "value3": "responseBody"
  }
}
```

键是 `名字`（仅当该文件只绑定这一个同名绑定时可用）或 `名字@行号`（行号＝声明该
绑定的标识符所在行，用于区分不同作用域里各自独立的 `value1`）。同一行里同名绑定
出现两次时（`arr.map(t => …).sort((t, b) => …)`），行号不够用，再补列号：
`名字@行号:列号`。值是新名字。写成文件，例如 `tools/rename-maps/batch-a.json`。

映射**可以并行产出**（只读），但**同一文件不得同时产出映射与套用映射**：曾经发生
一次 `--dry` 通过后开始套用、而产出该映射的任务仍在改写它，于是首次 dry-run 的名字
与最终落盘的名字不是同一套。套用前后各算一次 `shasum` 并比对即可消除该风险。

### 3.2 核对映射覆盖度

套用前先确认这份映射**恰好**覆盖它被分配的区间：

```bash
node tools/verify_map_coverage.mjs tools/rename-maps/batch-a.json <声明起始行> <声明结束行>
```

`apply_frontend_renames.mjs` 只能验证**每一条**能解析，验证不了**集合**是否完整——
它不知道这个区间本该覆盖哪些名字。两个方向都会静默失败：**漏掉**的绑定会留成残留，
当下无人报错，直到日后门禁把它当成「回归」；**越界**的绑定属于同文件的邻块，
在这里改它等于两个任务抢改同一个名字，后一个会失败或落下一个已被占用的名字。
区间用 `plan_frontend_rename_ranges.mjs` 输出的**声明行范围**（authoritative），
不是那个更宽的 span。

### 3.3 套用

```bash
node tools/apply_frontend_renames.mjs tools/rename-maps/batch-a.json --dry --report
node tools/apply_frontend_renames.mjs tools/rename-maps/batch-a.json --report
```

该工具改用字节区间编辑，注释、缩进、引号风格、`?v=…` 缓存串全部逐字节保留。
下面这些曾经真的弄坏过代码的情形，都是**硬断言**而不是提示词约定：

- 导出名一律拒绝改名（它就是公共 API）；
- `obj.prop` 形式的成员属性、`{ key: v }` / `class { key }` 的键、以及 import
  的**导入侧**永不改写；
- 简写会展开而不是改名，从而保住属性名 / 导入名：
  `{ value1 }` → `{ value1: response }`，`import { x }` → `import { x as rate }`；
- 新名字不得与文件内任何绑定冲突，也不得遮蔽文件引用的全局；
- 映射里每一条都必须解析成功；有歧义或对不上的条目会让整次运行失败，
  而不是被静默跳过（**任何一条失败都不会写入任何文件**）。

### 3.4 验证批次

这一节就是 `tools/verify_frontend_batch.sh` 头部注释所引用的
`frontend/NAMING.md section 3.4`。

```bash
# 套用后只重排本次触及的文件，保持树始终是 Prettier 规范的
"$HB_NODE" "$PRETTIER_CJS" --write <本次改动的文件…>

HB_MAX_MECHANICAL=<新值> HB_MAX_SHORT=<新值> HB_MAX_UNFORMATTED=0 \
  tools/verify_frontend_batch.sh
```

`verify_frontend_batch.sh`（**12 节常驻 + 4 节批次内 + 1 节 `--full`**，不依赖 git）依次确认：

| 节 | 检查 | 工具 |
| --- | --- | --- |
| 1 | 每个前端模块都能解析 | `report_frontend_names.mjs`，要求 `parse-failures=0` |
| 2 | alpha-等价（对 `.restore/frontend-baseline`） | `verify_frontend_rename.mjs`，要求 `mismatched=0 missing-or-extra=0` |
| 3 | 公共 API 未变 | `verify_frontend_public_api.mjs`，要求 `changed=0` |
| 4 | 模块图可解析 | `verify_frontend_imports.mjs`，要求 `unresolved=0` |
| 5 | 字符串无丢失 | `verify_frontend_strings.mjs`（orig 侧取 `.restore/orig-frontend/frontend`） |
| 6 | 经典脚本全局仍可达 | `verify_frontend_globals.mjs` + 它自己的 selftest |
| 7 | 残留命名不超棘轮，且没有单个文件回涨 | `report_frontend_names.mjs`，对照 `HB_MAX_MECHANICAL`/`HB_MAX_SHORT`（唯一来源 `tools/rename-ratchet.json`，经 `tools/print_rename_ratchet.mjs` 读出；环境变量仍可覆盖）；再跑 `verify_frontend_name_budget.mjs`，要求任何文件的残留不高于它在波次起点（`tools/frontend-name-budget.json`）的值 |
| 8 | Prettier 规范 | `--check "frontend/**/*.{js,css}"` |
| 9 | CSS/HTML 内容等价 | `verify_frontend_format_equiv.mjs` |
| 10 | 字面量残留硬门禁 | `normalize_frontend_literals.mjs --check`（无天花板） |
| 11 | 8 个 HTML 与发行清单逐字节一致 | `shasum -a 256 -c` 对照 `.restore/baseline.sha256` |
| 12 | 计算成员访问已归一 | `normalize_frontend_members.mjs --check`，要求 `members=0`（无天花板） |
| 13 | 本批次只改了申报文件 | `verify_frontend_batch_delta.mjs check`，要求 `outside-declared=0`（批次内，需 `HB_BATCH_PRE`） |
| 14 | 申报文件有改前回滚快照 | `verify_frontend_batch_snapshots.mjs --batch`（批次内，需 `HB_BATCH_ID`） |
| 15 | 本批次没有改动任何字符串 | 同上的 `--strings`：把第 14 节的回滚副本当 before，比字符串多重集 |
| 16 | 本批次的名字合受控词表 | `check_glossary.mjs --applied`（压缩名 / 词+数字形状 / 禁词 / 与文件已有标识符冲突）+ `check_name_anchors.mjs`（`querySelector("#id")` 派生的名字必须含该 id）+ `check_name_kinds.mjs`（形态 oracle：元素 / Map / Set / 布尔的名字必须写出形状；形状不可判定的绑定记为 unknown 且永不报错）；三者各自带 selftest（批次内，需 `HB_BATCH_MAP`，形态 oracle 另需 `HB_BATCH_ID` 取改前副本） |

加 `--full` 会追加**第 17 节**：再跑一遍 `tools/verify_0.6.5.sh`。

> **第 4 节按浏览器 URL 空间解析。** 相对说明符不能按文件系统路径解：
> `frontend/static/**` 挂载在 `/bridge-static/**`、`frontend/modules/interaction3d/**`
> 挂载在 `/api/v1/modules/interaction3d/**`，跨树的相对 import 只在 URL 空间里成立
> （`frontend/static/modules/interaction3d/editor.js` 用 `../../../api/v1/modules/interaction3d/…`
> 到达 API 路由；`frontend/modules/interaction3d/*.js` 用 `../../../../bridge-static/utils/…`
> 到达静态区）。
>
> **第 11 节是哈希而不是归一化 diff**，因为第 9 节的「内容等价」不够：这次恢复过程中
> 有格式化器把 8 个 HTML 全改写过一次、几分钟后又改写过其中一个，所以发行字节必须是
> 逐字节硬门禁。

> **静态校验再全，也证明不了页面能真正加载。** Alpha-等价只说明改名没有改变
> 程序语义，却推不出「这些模块在浏览器里跑得起来」——两者之间隔着模块加载顺序、
> 全局耦合、缓存串、HTML 与脚本的契约。上面每一项检查都只读单个文件，因此
> 它们**结构上**看不见跨文件耦合：第 6 节与 `verify_all.sh` 第 14 项就是为这类
> 盲区补的。已知的校验器盲区还有两个：
>
> - `verify_restore.py` 按「名字/常量集合」比对，**看不见控制流错误**——曾经把
>   `device is None or …` 的条件写反，四道闸门照样全绿；
> - 字面量归一必须做**词法邻接保护**，否则 `return!1` 会被拼成标识符 `returnfalse`。
>
> 所以每推进几批，用真实浏览器过一遍：登录页（未鉴权也公开）、已登录看板
> （`home.js`）、3D 工作台（`/3d-studio`，`studio-app.js`）。
> 应用对静态资源做了鉴权——`curl` 拿到的 `401` 只是**没有会话 cookie**，
> 浏览器是已鉴权的，受限脚本在那里照常加载，因此这些页面都能真实测到。
> 判定「页面正常」要看**交互后**的状态（按钮文案变化、请求后的错误文案、
> WebGL 画布被 `setSize` 到非默认尺寸），而不是「HTML 渲染出来了」——
> 这个项目的页面内容大量是静态标记，光看截图会把「HTML/CSS 完好」误当成
> 「JS 执行了」。

### 3.5 批次完成

全绿后该批次完成，把 `report_frontend_names.mjs` 的新数字写回棘轮（见第六节），
并把映射留在 `tools/rename-maps/` 作为决策记录。

> **不要用已套用过的旧映射做「回归测试」**：旧名字在文件里早已不存在，
> 工具报 `failed` 是正确行为，不是回归。也**不要**用旧映射重放：改名之后还会有
> 一次 Prettier 重排，`名字@行号` 键在重排后不再指向同一行。

## 四、超大文件的分片处理

0.6.6 的残留高度集中。机械流水线收尾时，四个文件各有 ≥1,000 个机械名，
合计 13,323 个（占 31,232 的 42.7%）：

| 文件 | 机械名 | 短名 | 冻结导出名 |
| --- | --- | --- | --- |
| `frontend/static/3d-studio/studio-app.js` | 4,350 | 923 | 0 |
| `frontend/static/home.js` | 3,860 | 1,535 | 0 |
| `frontend/static/renderer/renderer.js` | 3,815 | 13 | 71 |
| `frontend/modules/interaction3d/stage.js` | 1,298 | 13 | 2 |
| `frontend/static/renderer/registry.js` | 963 | 42 | 48 |

前五个文件合计 14,286 个机械名，占全量的 45.7%；其余 200 个文件分摊剩下的部分。
单个映射任务放不下——一次读上万行、连续编几千个名字，既慢又容易前后不一致。
改为按**绑定数**而非行数切片：

```bash
node tools/plan_frontend_rename_ranges.mjs frontend/static/home.js --target 1000
```

该工具按声明行把残留绑定均衡切块，边界落在**语句起始行**（任意嵌套层级），
默认切点只取顶层语句是不够的：`renderer.js` 整个包在一个 IIFE 里，顶层只有
一个语句，切点退化成第 1 行、后几个区间全空——工具末尾的自检会直接报错，
阻止这种无效计划被当成任务发出去。

分片后按三条规则调度：

- **同文件内串行**：第 N+1 块必须等第 N 块套用完成后才开始。后续块的任务因此
  能看到前一块已经改好的名字，改名器的「新名字不得与文件内任何绑定冲突」
  断言自然生效，也就不需要人工分配名字空间。
- **跨文件并行**：不同文件之间互不影响，可以同时进行。
- **只改本区间**：每个任务只收录声明行落在自己区间内的绑定，但允许读全文件以
  判断用法与查重。

> 残留量是**动态**的。写这份文档期间就有另一个批次在并行改名，实测残留从
> `mechanical=31232 short=3677` 一路降到 `29596/3614`（几分钟内）。所以每批开工前
> 先跑一次 `report_frontend_names.mjs` 取当前值，不要照抄本文档的数字。

## 五、格式化（Prettier）

改名与格式化互相拉扯：语义名比它替换掉的机械名长（`responseBody` vs `value1234`），
原本刚好放下的行会被迫折行。所以**每批改完只重排本次触及的文件**，让树在任何时点
都是规范的，棘轮才有意义。

- `.prettierrc` 固定在仓库根：`printWidth 100`、`tabWidth 2`、`semi`、
  双引号、`trailingComma: all`、`arrowParens: always`、`endOfLine: lf`。
- **`quoteProps: "preserve"` 是刻意的**。默认的 `as-needed` 会把 `{"object": v}`
  去引号，而 `verify_frontend_rename.mjs` 的规范流把引号键记成 `S:`、把标识符键
  记成 `K:`。0.6.6 上实测：拿 230 个一方 `.js` 的 `/tmp` 副本，用
  `--quote-props as-needed` 重排后再做 alpha 比对，**186/230 个文件被判成「不是
  alpha-等价」**（48 个逐字节相同、186 个 mismatch）；`preserve` 下同一棵树是 0 mismatch。
  无需放宽任何校验器。
- **HTML 是禁区，绝不对 `.html` 跑格式化器。** 实测 Prettier 对 8 个前端文档并非内容
  中性：4 个被判内容改变、8 个出现标签间空白变化（它在 `<button>`/`<p>` 的文本节点里
  插换行，会改 `textContent`）；即使设 `htmlWhitespaceSensitivity: strict`，
  两个大文档里 `100%为完全收拢` 这类长中文文本仍会被折行，而 CJK 之间折行会渲染出
  一个原不存在的空格。发行版这 8 个 `.html` 是单行压缩态，**曾被某次未留日志的
  格式化器打成多行（含 4 空格缩进）**，已从 `.restore/frontend-baseline/` 逐字节还原，
  并由门禁第 11 节按 `.restore/baseline.sha256` 哈希守护。要探测格式化器行为，
  **只对 `/tmp` 副本做**。
- 所以 `frontend/**/*.html` 与 `frontend/static/vendor/` 一起写进 `.prettierignore`；
  格式化范围是 **230 个一方 JS + 18 个 CSS = 248 个文件**。

```bash
export PATH="/usr/local/bin:$PATH"
NODE=/usr/local/bin/node
PRETTIER_CJS="$HOME/项目/HomeOS/HomeOS/node_modules/prettier/bin/prettier.cjs"
"$NODE" "$PRETTIER_CJS" --write "frontend/**/*.js" "frontend/**/*.css"   # cwd 必须是仓库根
"$NODE" "$PRETTIER_CJS" --check "frontend/**/*.{js,css}"
```

Prettier 不随仓库分发。离线可用的是兄弟仓库 `HomeOS/node_modules` 里的 **3.9.8**；
`npx` 需要写 `~/.npm`，沙箱不允许，所以工具链一律走
`HB_PRETTIER="$NODE $PRETTIER_CJS"`。**取不到 Prettier 时门禁报 FAIL 而不是跳过**：
一个悄悄通过的检查比没有检查更糟。

> 通过 `prettier.cjs` 的 shebang 直接执行会报
> `env: node: No such file or directory`（沙箱 PATH 不含 `/usr/local/bin`）。
> 必须显式 `/usr/local/bin/node <prettier.cjs>`。

## 六、棘轮

推进过程中每批都要下调上限。「默认值」现在只有一处——`tools/rename-ratchet.json`，
由 `tools/ratchet_frontend_names.mjs` 写、`tools/print_rename_ratchet.mjs` 读，
三个门禁脚本都从那里取，所以不会再出现「副本各自漂移」。0.6.7 本轮阶段 0 按本树重标后的
ceiling 是 **18419 / 3865 / 0**（0.6.6 的 24898 / 3531 只对 0.6.6 的树成立）：

| 位置 | 变量 | 当前 ceiling → 目标 |
| --- | --- | --- |
| `tools/rename-ratchet.json`（唯一来源） | `mechanical` / `short` / `unformatted` | 18419 / 3865 / 0 → 0 / 3 / 0 |
| `tools/verify_frontend_batch.sh` §7 | 读同一文件 | 同上 |
| `tools/verify_0.6.5.sh` §12 §13 | 读同一文件 | 同上 |
| `tools/verify_all.sh` §10 §15 | 读同一文件 | 同上 |

数值不要手改，用：

```bash
node tools/ratchet_frontend_names.mjs          # 实测当前残留并写回三处默认值
node tools/ratchet_frontend_names.mjs --dry    # 只看会改成什么
```

它**只降不升**：一旦某个计数上升（说明有回归落下，或者又冒出一个机械命名的文件），
它会拒绝并把整次运行判为失败，而不是把天花板抬上去把回归盖住。要主动抬升必须显式
`--allow-increase`。

> 别把「目标 0/0/0」读成「必须 0/0/0」。`short` 桶已经被 3 个导出短名钉住（见前言），
> `mechanical` 里也可能有导出名；棘轮的作用是让数字**只降不升**，而不是承诺一个
> 不可达的 0。

**棘轮只看得见总数，所以它挡不住「左手倒右手」。** 一个批次在 A 文件清掉 400 个名字、
另一个改动在 B 文件又添回 400 个，总数不变、棘轮照绿。因此波次起点时把每个文件的残留
写进 `tools/frontend-name-budget.json`（由 `tools/report_frontend_names.mjs --json` 生成，
用 `tools/verify_frontend_name_budget.mjs --update` 重拍），第 7 节要求**任何文件都不得高于
自己的起点值**；确实需要放宽的文件要写进 `tools/rename-maps/exceptions.json` 的
`allowed-budget` 条目并给出理由。

进度的查看用 `tools/report_rename_progress.mjs [--top N]`：它读同一份 budget 当基线，
所以「已清掉 401 个、还有哪个文件最重」这些话都有出处，不是从文档里抄来的数字。

## 七、运行环境（沙箱内）

| 事项 | 事实 |
| --- | --- |
| `node` | `/usr/local/bin/node`（沙箱 PATH 不含 `/usr/local/bin`，用 `HB_NODE` 或先导出 PATH；实测 `v26.10.0`） |
| `rg` | 仅存于 `/Applications/DSH NEXT.app/Contents/Resources/app/node_modules/@vscode/ripgrep-darwin-arm64/bin/`，`verify_all.sh` 需要它 |
| Babel | `/Users/sfairy/.npm/_npx/6da011cd7208f74f/node_modules`（`@babel/parser`、`@babel/traverse`），可用 `BABEL_ROOT` 覆盖 |
| Prettier | 见第五节（离线副本 3.9.8） |
| Python 门禁 | `HB_PYTHON` 或 `~/项目/HomeOS/HomeOS-3D/.venv-store/bin/python3`（含 fastapi；需要 ≥3.12 才能看见 f-string 里的标识符） |
| 代理变量 | 环境里 `no_proxy` 含 `[::1]` 会让 httpx 的 `URLPattern` 抛 `InvalidURL: Invalid port`，启动门禁需先 `unset NO_PROXY no_proxy` 一类变量 |

> 本文件的数字都是**实测**的，实测命令已经写在对应章节里；数字会随批次下降，
> 引用时请以最近一次 `report_frontend_names.mjs` 的输出为准。
