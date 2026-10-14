# Studio monolith line-count baseline

> **切片工具链已重建（2026-10-13，P2）。** `ops/studio/studio_slice_analyze.mjs` / `studio_slice_extract.mjs` /
> `studio_slice_wrap.mjs` / `restore_import_formatting.mjs` 与它们的注入式自检
> （`homeos/frontend/scripts/gates/_studio_slice_*_selftest.mjs`）已按本文描述收回，并新增两件：
>
> - `ops/studio/studio_slice_apply.mjs`：一条命令跑完「AST 提取 → 依赖袋包装 → import 归位 → 锚点插入」，
>   宿主侧自动留同名转发器 / 状态袋；
> - `ops/studio/studio_template_seam.mjs`：**模板**维度的整段切片（Vue SFC 里零指令的静态 DOM 契约段，
>   按 `#id` / `.class` 锚点整段搬进子组件，见 `ops/plans/studio/*.json` 的可复现计划）。
>
> 根脚本 `slice:studio*` / `seam:studio*` 与 `check:deps` 里的三条自检（区间 / 包装 / 模板）都已接回，
> 所以下面第 6 节起的命令与口径**可以照旧直接跑**；自检本身也在 CI 里（解析型工具一改就静默变瞎，
> 这三条是它们唯一的护栏）。

**度量口径已可执行**：以 KPI 脚本为准（本文件只讲口径与理由，数值别从这里抄 —— 脚本会自己量）。

```bash
# 仓库根执行：单体行数（本文件主线）+ 域清单/平铺面
python3 ops/kpi/studio_monolith_kpi.py
python3 ops/kpi/studio_domains_kpi.py

# 或一次跑完 studio 三件套（含根↔studio 同名冲突）
bun run kpi:studio

# 收敛后重记基线
python3 ops/kpi/studio_monolith_kpi.py --update
python3 ops/kpi/studio_domains_kpi.py --update
```

门禁口径：

- 单体：目标是纯 re-export 桩、或行数低于下限 → **硬失败**；行数超过基线 → **硬失败**（ratchet，只减不增）；未达目标只提示。
- 域清单：`existing` 域目录缺失或空壳 → **硬失败**；域覆盖行数低于基线 → **硬失败**（只增不减）；
  宿主目录平铺 `.ts` 个数超基线 → **硬失败**（README 的「new code must import from domain folders」由此机械生效）；
  `planned` 条目已建成却没改状态 → **硬失败**（清单不能和树脱节）。
- 清单自洽：`status`/`kind` 拼错、`rel` 重复、`note` 空 → **硬失败**（清单即代码，写错字会让门禁量错东西还不报错）。
- 宿主薄绑定裸值（`scripts/gates/check-host-bindings.mjs`）：切片 core（首参是依赖袋 `deps`/`ctx`）若被宿主
  **同名 import** 后**当裸值交出去**（简写属性 / 属性值 / 实参 / 数组元素），调用方的第一个实参会被
  deps 顶掉 —— 当宿主 ctx 是 `{ [key: string]: any }` 时 `tsc` **不会拦**，所以单列门禁。详见 6i。
- **防瞎**：平铺面清单里的宿主目录若改名/消失，`glob` 会返回空 → 本项会静默变成「0 个 ≤ 基线」而通过。
  这类「匹配不到就跳过」是解析型门禁最常见的死法，所以「宿主目录不在」也算 **硬失败**，且一个宿主都没量到时拒绝放行。

上述分支逐条实测过（改错宿主目录、planned 偷跑、平铺增长、覆盖下降、域消失、状态拼错 → 全部 exit 1）。

> **执行现状**：`kpi:studio`（三件套）+ 两前端 `lint:ci` + `check:deps`（含 refs / chunk-groups /
> host-bindings 三条解析型门禁及其自检）均已接进 CI（`.github/workflows/checks.yml`），
> 所以这组 KPI 是**机器拦得住**的，不只是「评审时记得跑」。

## 为什么要有两个 KPI

单看单体行数是可以被糊弄的：行数下降既可能来自「搬进域文件夹」，也可能来自「挪进另一个平铺文件」或直接删。
所以第二个 KPI 量**域覆盖**与**平铺面** —— 前者只增不减，后者只减不增，两条一起才能证明「结构在收敛」。

## 为什么要改成脚本

本文件原先手工列路径与行数，结果**指向了 compat 桩**：`app/renderer/core/renderer.ts`（曾被记为 7188 行）与 `runtime/editor/config-editor/panel-rendering.ts` 后来被拆空、只留 `export * from` 转发（各 3 / 2 行），正文分别搬到了 `panel-renderer.ts` 与 `runtime/config-ui/config-editor/panel-rendering.ts`。

照旧文档复测会得到「7188 → 3」这种**假收敛**，而真正 35k 行的 `studio-app.ts` 没人盯。所以路径与数值改为固化在脚本里，并由脚本自己检测桩 —— 同一个失效模式不会再发生第二次。

## 单体目标（2026-10-13 实测）

| 单体 | 路径（相对 `src/studio/`） | 当前 | 目标 |
|------|---------------------------|-----:|-----:|
| creator 编排宿主 | `app/3d-studio/authoring/studio-app.ts` | 20681 | < 3000 |
| panel 编排宿主 | `app/editor/home.ts` | 16784 | < 3000 |
| 面板渲染器 | `app/renderer/panel-renderer.ts` | 1888 | < 3000 |
| 舞台宿主 | `runtime/core/stage.ts` | 4485 | < 3000 |
| 舞台配置渲染 | `runtime/config-ui/config-editor/panel-rendering.ts` | 590 | < 3000 |

`stage.ts` 本轮已按 seam 切出 7 个文件（`lighting` / `controls` / `camera-motion` / `layers-sync` /
`refresh` / `curtain-motion` / `navigation-drag`，各带显式依赖袋接口），5,702 → 4,485 行；
余量集中在 `mountStage()` 里的 300 余个小声明与 73 个可变捕获的同步块，按 `--list` 的 `成本` 排序继续切。

`panel-renderer-bulk-methods.ts`（原本 10,889 行）已随 **7b** 按 seam 拆成 `app/renderer/panel-seams/` 下 12 个文件
（最大 2,567 行，宿主文件删除），所以它**不再是单体目标** —— 但行数没有「消失」：该目录已登记为域，
10,799 行全进域覆盖（这就是为什么下面两个数一个降、一个升）。

`panel-renderer.ts`（原 7,154 行）已随 **7c** 把 70 个类方法按 seam 搬进同目录的 `methods/`（8 个文件），
**已达 <3000 目标**（1,888 行）—— 但它仍在单体清单里：清单是「不许再长大」的 ratchet，不是「拆过就除名」，
只有像 bulk-methods 那样**整个文件消失**才除名。

单体余量合计 45645 行；域覆盖 87831 行（27 个域目录）—— 两个数分别是「还没搬的」与「已经搬进去的」。

## 单体的真实形状（先看这个，再看任何预算表）

用 `node ops/studio/studio_slice_analyze.mjs <file> --list` 量出来的事实：

| 文件 | 顶层语句 | 其中 import | 巨型宿主 | 宿主内直系声明 | 函数总数 |
|------|---------:|------------:|---------|---------------:|---------:|
| `studio-app.ts` | 98 | 91 | `bootStudio()` 21450 行 → 内部一个 21437 行的箭头函数体 | **968** | 1470 |
| `home.ts` | 76 | 73 | `bootEditor()` 16563 行 → 内部一个 16550 行的箭头函数体 | **1389** | 1319 |
| `stage.ts` | 50 | 47 | `mountStage()` 5542 行 | — | 442 |
| `panel-rendering.ts` | 11 | 10 | `attachEditorPanelRendering()` 550 行（`renderPanel()` 2,605 + 6 个分区/弹窗共 882 行 + 6d-3 的 7 个会话/弹窗/分区共 764 行已搬到 `rendering/`） | **44** | 56 |

宿主已收敛到「21 个控件/状态助手 + 4 条有状态闭包（`syncPreviewSize` / `resizeObserver` / `disposeEditor` / 会话单元）+ 16 条薄转发 + 31 名发布面」。

**这两份文件里没有「顶层声明」可搬** —— 除了 7 个小语句，整份文件就是一个函数。
（本文件早先的预算表按「顶层声明 598 / 414 个」分桶是**错的**：那是用「行首零缩进」正则数出来的，
把巨型函数体内的嵌套声明当成了顶层声明。而且这个文件的缩进不一致，1484 行嵌套代码写在第 0 列 ——
正则口径连「层」都判错。）

## 搬迁成本是什么

搬一个函数的代价 **不是它的行数**，而是它的**闭包捕获**：

| 类别 | 含义 | 处理方式 | 成本 |
|------|------|----------|------|
| import | 新文件里复制 import 即可 | 机械 | 0 |
| 同宿主兄弟（函数） | 同一层闭包里的函数 | 一起搬，或显式传参 | 中 |
| 同宿主兄弟（`let`） | 同一层闭包里的可变状态 | 只能传快照 —— **必须先确认目标只读它** | 高 |
| 外层宿主捕获 | 跨层的闭包变量 | 一般都搬不动，优先重构掉 | 最高 |
| 未解析 | 全局/找不到声明 | 逐个看清 | ? |

所以本批次先量代价再动手，量代价的工具进了仓库：

```bash
node ops/studio/studio_slice_analyze.mjs <file> --list              # 真实形状 + 宿主链
node ops/studio/studio_slice_analyze.mjs <file> --rank              # 直系声明按搬走成本排序
node ops/studio/studio_slice_analyze.mjs <file> --seeds=<函数名>     # 单个函数的捕获清单 + 残留依赖
node ops/studio/studio_slice_extract.mjs --file=<源> --out=<目标> --names=a,b [--also=h] [--apply]
node ops/studio/studio_slice_extract.mjs --file=<源> --out=<目标> --names=a,b --method-form [--apply]   # 类方法
node ops/studio/restore_import_formatting.mjs <file>                # 还原被早期清理压成单行的 import 排版
```

> 别指望 `--seeds` 的「闭包展开」能闭合：深度 3 的兄弟图几乎全连通，展开几轮就吃掉整份文件。
> 它真正的用途是给出**残留依赖清单**（= 需要显式传参的东西），据此判断一个切片值不值得做。

## 切片日志（P4 已落地）

规则：**只搬纯数据 / 纯函数**，先易后难；每片都必须 `typecheck + lint + check:deps(含 refs) + knip + kpi:studio + build:vite` 全绿。

| 切片 | 搬出 | 搬到 | 行数 | 依赖 |
|------|------|------|-----:|------|
| 1a | `defaultViewSettings`（场景默认外观） | `app/3d-studio/authoring/scene/studio-view-settings.ts` | 35 | 0 |
| 1b | `itemTypeCatalog`（1909 行类型目录）+ 8 个类型集合 + `sofaMinDimensions` | `app/3d-studio/authoring/items/item-catalog.ts` | 2025 | 3 个 import（柱/带默认轴与形状） |
| 2a | `nextBatchItemTypeSet` | 追加进 `items/item-catalog.ts` | 62 | 0 |
| 2b | `MATERIAL_SLOT_GROUPS` + 角色索引 + `materialSlotGroupOf` | `app/3d-studio/materials/studio-material-slot-groups.ts` | 78 | 0 |
| 3a | `remapOpeningsToWalls`（开洞重映射到拆段墙） | `app/3d-studio/plan/studio-wall-openings.ts` | 53 | 4 个 import（`geometry` / `loaders` / `ui/helpers`） |
| 3b | `buildWallSpanFootprint`（墙跨度平面足迹） | `app/3d-studio/plan/studio-wall-spans.ts` | 57 | 1 个 type import |
| 3c | `buildStaticMaterialKey`（网格材质键） | `app/3d-studio/materials/studio-static-material-key.ts` | 82 | three 命名空间 |
| 3d | `buildPressProfile`（洁具压型轮廓几何） | `app/3d-studio/authoring/items/studio-sanitary-models.ts` | 94 | three 命名空间 |
| 4a | `collectSharedMeshRecords` + `buildMaterialSignature`（共享网格批处理记录） | `app/3d-studio/authoring/items/studio-shared-mesh-records.ts` | 80 | 2 个 import（normalization / three 命名空间） |
| 4b | `duplicateComponent` + `removeComponent`（组件复制/删除） | 追加进 `app/editor/editor-component-collections.ts` | 69 | 0（就近复用同文件 helper，故并入而非新文件） |
| 4c | 导航 / 样式属性元数据 17 个声明（`--whole-statement` 整条搬多声明语句） | `app/editor/metadata/editor-navigation-style-metadata.ts` | 1422 | 1 个 import（透视常量） |
| 4d | `DEFAULT_PERSPECTIVE_CORNERS`（提出原因：避免元数据模块与 `home.ts` 循环 import） | `app/editor/metadata/editor-perspective-constants.ts` | 1 声明 | 0 |
| 5a | `normalizeScenePayload` + 材质净化助手 + 门类型目录 / 标签色常量（`collectSharedMeshRecords` 同批） | `app/3d-studio/authoring/scene/studio-scene-payload.ts` | 649 | `externalModelRegistry` 显式传参（唯一外部状态），其余为 import |
| 5b | `normalizeStudioDocument` + `createFloorRecord` | `app/3d-studio/authoring/scene/studio-document-payload.ts` | 87 | `StudioDocumentDeps`（注册表 + 只读 `studioProject.defaultFloorHeight`） |
| 5c | 盒子网格构件：`normalizeBoxSpec` / `mergeBoxGeometries` / `createBoxMaterial` / `addArchitectureMesh` / `addWindowFrames` | `app/3d-studio/authoring/scene/studio-box-mesh.ts` | 200 | `StudioBoxMeshDeps`（两个缓存 + `backgroundSettings` 读取器） |
| 5d | 电视模型构件：`createTelevisionPoster` / `computeTelevisionProportions` / `addTelevisionModel` | `app/3d-studio/authoring/items/studio-television-model.ts` | 128 | `StudioTelevisionDeps`（`isEmbeddedStage` / `threeRenderer` 只读 / `backgroundSettings`） |
| 5e | 导出图层清单渲染 `renderExportLayers` + 导出名净化 `sanitizeExportName` | `app/3d-studio/authoring/ui/studio-export-layers.ts` | 94 | `StudioExportLayerDeps`（容器元素 + 三个取数助手回调） |
| 5f | 引导序列 `startupStudio`（唯一调用点是闭包末尾的 `startupStudio()`） | `app/3d-studio/authoring/boot/studio-boot.ts` | 56 | `StudioBootDeps`（15 项；`stageLoadTiming` 是顶层计时器单例，必须共用同一实例） |
| 6a | **物品模型总装 `buildItemModel`**（宿主里最大的单块，7,548 行） | `app/3d-studio/authoring/items/studio-item-model.ts` | 7548 | `StudioItemModelDeps`（13 个兄弟构件函数 + 12 项只读状态；解构成本地名后正文逐字未改） |
| 6b | 平面图物品绘制 `drawDoor` + `drawCourtyardArea`（连带门配色私有助手 `doorPlanColor` / `doorPlanPartMaterial` / `planColorLuminance` / `PLAN_DOOR_*`） | `app/3d-studio/plan/studio-plan-item-drawing.ts` | 1794 | `StudioPlanItemDrawingDeps`（15 项；按函数只解构各自用到的那一部分，避免 `no-unused-vars`） |
| 6c | 配置编辑器面板分区：状态规则分区渲染 `renderStatusRuleSection` + 条目集合规整 `ensureItemCollections` | `runtime/config-ui/config-editor/rendering/panel-sections.ts` | 500 | `PanelSectionsDeps`（5 项：上下文对象 `e` + 4 个兄弟函数；域已在 `studio_domains_kpi.py` 登记，目录后从 `sections/` 改名 `rendering/`） |
| 6d | 配置编辑器面板总装 `renderPanel`（体内有 24 处递归自调用 + 3 处重赋宿主 `let refreshBatchButtons`） | `runtime/config-ui/config-editor/rendering/panel-assembly.ts` | 2737 | `PanelAssemblyDeps`（25 项：`e` + 24 个兄弟函数；可变依赖走 `refreshBatchButtonsCell` 单元，见 6d 小节） |
| 6d-2 | 面板分区 3 块：幕布分组 `renderCurtainGroupSection` / 附加控件 `renderExtraControlsSection` / 净化器绑定 `renderAirPurifierBindingSection` | `runtime/config-ui/config-editor/rendering/panel-sections.ts`（**追加**到 6c 既有文件） | +546 | 复用同一份 `PanelSectionsDeps`（4 → 12 项），宿主仍只建一个工厂；三块各解构自己的子集 |
| 6d-2 | 面板弹窗 3 条：`openAddDialog` / `openVacuumRoomPicker`（`async`）/ `openCurtainGroupDialog` | `runtime/config-ui/config-editor/rendering/panel-dialogs.ts` | 382 | `PanelDialogsDeps`（8 项：`e` + 7 个兄弟函数；无 `let` 捕获，普通快照注入） |
| 6d-3 | 面板会话 3 条：`buildItemPayload` / `listChangedFields` / `switchEditorKind`（`async`） | `runtime/config-ui/config-editor/rendering/panel-session.ts`（新文件） | 164 | `PanelSessionDeps`（10 项：`e` + `editorSession` / `kindSessionsByKind` 两份按引用注入的会话状态 + 7 个兄弟函数） |
| 6d-3 | 面板弹窗 3 条：`openMetricsDialog` / `openCurtainGroupBatchApplyDialog` / `openLabelBatchApplyDialog` | `runtime/config-ui/config-editor/rendering/panel-dialogs.ts`（**追加**） | +524 | 复用 `PanelDialogsDeps`（8 → 14 项）；`auxDialogElement` 走宿主既有访问器，零新增 dep |
| 6d-3 | 吸尘器快捷模式面板 `renderVacuumShortcutPanel`（264 行） | `runtime/config-ui/config-editor/rendering/panel-sections.ts`（**追加**） | +290 | 复用 `PanelSectionsDeps`（12 → 18 项：多 `editorSession` + `refreshBatchButtonsCell`） |
| 6e | **`home.ts` 第一刀**：请求封装 `requestJson`（超时 / 中止 / CSRF / 401-403 跳转）+ 认证跳转 `startAuthRedirect` + `DEFAULT_REQUEST_TIMEOUT_MS`（100 行） | `app/editor/net/request-json.ts`（新域） | 121 | `RequestJsonDeps`（1 项：`authRedirectState` —— 原 `let authRedirectStarted` 改成宿主每实例创建的**对象单元**，见 6e 小节） |

结果：`studio-app.ts` 35231 → **21773**（-13458，-38.2%；其中 5x 批 -4181、6a 单刀 -7520、6b -1757）；
`home.ts` 22976 → **21405**（-1571；6e 切出请求面 -90）；`panel-rendering.ts` 5234 → **590**（-4644；6c -473 首次离开 0%，
6d 单刀 -2575、6d-2 再 -834、6d-3 再 -761，现已**降到目标线以下 80%**，基线已 ratchet 三次）；
域覆盖 43046 → **63915**（20 个域目录，新增 `app/editor/metadata/`、`app/editor/net/`、`app/3d-studio/authoring/boot/`、`runtime/config-ui/config-editor/rendering/`）。
**「零成本档」已清空**：全仓库 ≥50 行的直系声明里，成本 < 1,000 的只剩 `createNumberRow`（50 行，成本 20）一条。
搬运是**逐字复制**（脚本断言：整块缩进 ≥ 2 空格、首尾行文本匹配、行数账目对得上），
零表达式改动 —— 唯一的人工改动是搬完后清理失效 import、把残留依赖显式化。

#### 5x 的「显式传参」形态：deps 对象 + 源侧薄绑定

5a~5c 是第一批**带残留依赖**的切片（4x 之前的都是纯数据 / 纯函数，逐字复制即可），落地形态固定为两条：

1. 目标文件导出 `XxxDeps` 接口（只列它真正读的东西），函数签名第一参数是 deps；
2. 源文件里原名保留一个**薄绑定**（`function 原名(...) { return 原名Core(xxxDeps(), ...); }`），
   调用点因此**零改写** —— 与 `studio_slice_extract.mjs` 的回引设计一致（它也是靠「名字不变」把 271 处调用点的风险降为 0）。

薄绑定只做「取当前外部状态 → 转发」，不含业务；代价是源文件多出约 25 行桩，但省掉 22 处调用点改写。
`addWindowFrames` 的 `backgroundSettings` 就是这么传进去的：它是同宿主兄弟，但被 40+ 处调用，
不能一起搬，于是按回调注入。

**deps 的取值时机也要对齐原实现**（第二条坑）：`studioProject` 是 `let`，声明在 1222 行，
而 `studioDocumentDeps()` 的构造点在 867 行。原实现只有 `createFloorRecord` 那一支会读它
（`floors` 非空的分支根本不碰），若 deps 用**值属性**（`{ studioProject }`）就等于把「按需读」变成
「构造即读」，在有调用早于 1222 行时直接撞 TDZ。所以 `studioProject` 走 `get studioProject()` 转发，
把取值推迟到目标函数真正读它的那一刻 —— 与原来逐字一致。

两条补充判据（5e / 5f 新增）：

- **回调优先于值**：5e 的三个取数助手（`listScreenRows` 等）读的是宿主闭包里的 `studioProject`，
  默认参数还依赖「当前项目」——按**函数**注入而不是把结果传进去，宿主仍是项目状态的唯一持有者。
- **放哪个域先看 import 边界**：5f 的 `startupStudio` 要 `app/3d-studio/` 下三处 import，
  放 `runtime/core/boot/` 就得跨域直连（要走 barrel），放同域的 `authoring/boot/` 则天然合法。
  所以「功能上像 runtime」不是唯一判据，**跨域 import 的成本**同样决定归属。
- **单调用点不必造薄绑定**：5f 只有闭包末尾一处 `startupStudio();`，直接改成
  `startupStudio(studioBootDeps())`，比源侧再包一层更干净。（`boot` 域的 15 项 deps
  事实上就是这份「引导契约」的清单化。）

#### 6a 的「巨大单块」形态：解构前奏，让 7.5k 行正文零改写

前面的切片都是几十到几百行，6a 是宿主里最大的单块（`buildItemModel` 7,548 行，占 31k 宿主的 24%）。
把它搬走要跨过三道坎，三道都有可复用的结论：

1. **工具自己有护栏，且默认拦**：`studio_slice_extract.mjs` 默认拒绝 >400 行的切片
   （怕「注释 / 作用域被吃错」）。这里先按 `--rank` 的对账确认跨度真实（`13712` 起首、`21259` 收尾，
   与 AST 一致），再用 `--max-lines=8000` 放行 —— 护栏是防呆不是防大，绕过前必须先对账。
2. **deps 成员不逐个改写正文，改成「解构前奏」**：函数签名加第一参数 `deps`，正文**开头**插一段
   `const { addCylinderMesh, studioState, activeFloorId, ... } = deps;`，把 25 个句柄变成局部常量。
   于是 7,542 行正文**一个字符都不用动**（不像逐处 `deps.x` 改写那样有 100+ 个改错机会）——
   与「逐字复制」的口径一致。前提被实测过：这 25 个名字在切片区间内**无一处重新赋值**
   （`awk 区间 | rg '名字\s*=[^=]'` 为空），所以按值解构与闭包捕获等价。
3. **兄弟构件用 deps 而不是 `--also=`**：`addCylinderMesh`（69 处调用）、`addLightModel`、`createPlanLabel`
   等都是**宿主里还被别处用**的构件，一起搬会把切片滚大；它们当 deps 成员（函数类型）注入。
   deps 工厂 `studioItemModelDeps` 里引用的 `let`（`studioState` / `isEmbeddedStage` / 诊断统计表…）
   **全部声明在该行之前**，且工厂只在 `buildItemModel` 被调用时求值（三处调用点都在更深的内层函数里），
   所以这里**不需要** `studioDocumentDeps` 那种 getter 转发。

代价与收益：源侧多出 27 行（deps 工厂 + 薄绑定），换来 7,520 行离开宿主（收敛 27%）。
**唯一的真实改错**是把 `applianceOptimizationTypeSet` 抄成了 `...ItemTypeSet`（3 处），
被 typecheck 一次抓出 —— 也正说明「残留依赖清干净没有」不是靠人眼，而是靠编译器的闭包检查。

<!-- 6a 之后 `--rank` 的成本表把「可变」一律按最坏情况计（1000 起步），
     而 6a 实测证明「只读可变」可以整批走 deps 解构，成本实际回到「兄弟」那一档。 -->

#### 6b 的「多函数同域」形态：`--seeds` 会高估，`--also` 要收口

6b 搬 `drawDoor` + `drawCourtyardArea`（1,727 行）到 `plan/`，三条实测结论：

1. **`--seeds` 的残留清单会高估 2 倍以上，别拿它估工作量**：
   `--seeds=drawCourtyardArea,drawDoor` 报「残留外部依赖 28 个（可变 23 个）」，而实际搬运器只报 **13 个**。
   差别来自 `--seeds` 会把 17 个同宿主兄弟**传递展开**后再算残留 —— 是展开进来的
   `canRenderScene` / `assessRenderBudget` 之类才引入了 `isAdaptiveRenderActive` / `studioProject`。
   地面真值验证：在切片区间里逐个 `rg -o "\b名字\b" | wc -l` 得到 484 / 15 / 11 / 8 / 6 / 5 / 2 / 2 / 1×5，
   与搬运器的 13 项逐一对上；而 28 项里的 `isAdaptiveRenderActive`、`studioProject`、`studioState`…
   在区间内**出现 0 次**。→ **估工作量用搬运器的 dry-run，不用 `--seeds`**。
2. **`--also` 会顺手 `export` 掉跟进来的私有助手，必须手动收口**：`doorPlanColor` /
   `doorPlanPartMaterial` / `planColorLuminance` / `PLAN_DOOR_MAX_LIFT` 搬进来时都带上了 `export`，
   但它们只在本文件内用 → knip 必报死导出。搬完把 4 处 `export` 去掉（4x 的失效模式表里记过这条）。
3. **一个 deps 接口 + 按函数解构子集**：`drawDoor` 用 9 项、`drawCourtyardArea` 用 8 项、
   两个私有助手各用 1~2 项；若每个函数都解构全 15 项，未被用到的那几项会被 `no-unused-vars` 判红。
   所以解构前奏按函数裁剪（两个私有助手改成 `deps` 首参，内部两处调用透传 `deps`）——
   这两行是全片**仅有的正文改动**（6a 是 0 行）。

#### 6c 换宿主的三个新事实（宿主形态、发布面、公开模块面）

6c 是第一次切 `studio-app.ts` 以外的宿主（`panel-rendering.ts`，5,234 行），暴露三件前 6 批没遇到的事：

1. **宿主形态不止一种**：这里是 `export function attachEditorPanelRendering(e: any) { ... }` +
   **嵌套函数声明**（不是 6a/6b 的「巨型箭头函数 + 直系声明」）。`--rank` 仍能用，但它数的是
   「函数体内的直系声明」。
   **（7b 更正本条）** 这里原写「`panel-renderer.ts` / `panel-renderer-bulk-methods.ts` 是**类方法**形态，
   必须先给工具加类方法支持」—— 只对**一半**。两个文件的形态其实不同（差别也在 7b 的「工具说了谎」一节）：
   - `panel-renderer-bulk-methods.ts`**不是 class**：顶层一组 `export function`，首参写 `this: PanelRenderer`，
     由 `import * as ns` + `Object.assign(PanelRenderer.prototype, ns as any)` 装成 mixin 袋 → 7b 已按 seam 拆完；
   - `panel-renderer.ts` **确实是 class**（`export class PanelRenderer { … }`，与同名 `interface` 声明合并）——
     `--rank` 对它的顶层报「直系声明 0 个」（class body 不walk），**动它之前仍要先把工具扩到 class 方法**。
2. **薄绑定的「名字不变」还护住了反射面**：这个宿主末尾把全部内层函数
   `Object.assign(e, { ..., ensureItemCollections, renderStatusRuleSection, ... })` 发布到上下文对象上。
   薄绑定保持同名 → 这份发布面**一个字都不用改**。前 6 批的名字不变是为了「调用点零改写」，
   这里第一次是为了「运行时发布面零改写」——同一个设计的第二个收益。
3. **`runtime/**` 下的每个 `.ts` 都是公开模块入口**：README 第 114 行写明
   「Every `runtime/**/*.ts` is a Vite entry served as `/api/v1/modules/interaction3d/<rel>.js`」。
   所以新增域文件夹 `runtime/config-ui/config-editor/rendering/` 会自动多出一条公开 URL + manifest 条目。
   实测无害且**不需要手工维护清单**（`vite.runtime.config.ts` 的 `discoverRuntimeEntries()` 扫全目录、
   manifest 构建期生成）：产物里确认有 `config-ui/config-editor/rendering/panel-sections.js` 与
   `config-ui/config-editor/rendering/panel-assembly.js`（6d），manifest 同时列了入口与它们的 chunk。
   注意 `build:vite` 走的是 `homeos` 的 `build`
   （= `vite build && vite build --config vite.runtime.config.ts`），所以 runtime 侧也在门禁内。
   另外：这个域文件夹 6c 时叫 `sections/`、6c→6d 之间改名为 `rendering/`（要放总装 + 分区两个文件）。
   改名会换掉公开 URL，所以**只能在还没有任何消费者时改** —— 这批的两个文件都是新建的内部助手，
   没有 URL 消费者，产物里已确认无 `sections/` 残留。
4. **deps 工厂要放在宿主函数体首行**：这个宿主**函数体自己就调用**被搬走的函数
   （`ensureItemCollections()` 紧跟其后），若按 6a/6b 的习惯把工厂放在源文件靠后的「deps 工厂区」，
   体内那处调用会撞 `const` 的 TDZ。改成函数体首行最省心。

#### 6d 面板总装（`renderPanel` 2,605 行）+ 三条与前 12 批都不同的处理

6d 搬的是 `panel-rendering.ts` 里第一块巨物 —— `renderPanel`（`attachEditorPanelRendering` 体内 2,605 行，
宿主因此从 5,166 → 2,134 行，文件 4,761 → **2,186** 行，首次跨过 3,000 目标线）。新文件
`runtime/config-ui/config-editor/rendering/panel-assembly.ts`（2,737 行，其中 `PanelAssemblyDeps` 65 行）。

与前 12 批不同的三点：

1. **第一次遇到「切片内会重新赋值宿主 `let`」**：`refreshBatchButtons` 在宿主是 `let`（宿主自己另有 3 处
   读写），切片区间内**重新赋值 3 次**、读取 2 次。快照解构在这里**不等价**（赋值会留在切片局部、宿主看不到），
   而且区间里有 **11 处 `await`**（快照还会捕获到旧函数）。处理：按**可变单元** `refreshBatchButtonsCell`
   注入，宿主侧用访问器 `get/set current` 代理到同一个 `let` —— 切片的 5 处正文只把
   `refreshBatchButtons` 换成 `refreshBatchButtonsCell.current`，宿主那侧变量本身不动。
2. **第一次遇到「切片内递归自调用自己」**：`renderPanel` 体内有 **24 处 `renderPanel()`**（重渲染）。
   带参化之后这些调用会 `TS2554: Expected 1 arguments, but got 0`。处理：导出面改名
   `renderPanelImpl`，函数体**首行**加自持别名 `const renderPanel = () => renderPanelImpl(deps)` ——
   24 处正文一个字都没改。别名放首行而不是解构之后，是为了让任何位置的调用都不撞 `const` 的 TDZ。
3. **`deps` 接口第一次出现「按实际类型收口」**：`listChangedFields` 我按名字猜成 `=> string[]`，实际宿主
   推断是 `string[][]` → 宿主侧 `TS2345`。教训：deps 接口的类型别猜，`(...args: any[]) => any` 留给
   「参数确实很长、写全无收益」的 4 条（`createSelectRow` / `createNumberRow` / `switchEditorKind` /
   `buildRuntimeProperties`），其余按宿主真实签名写。

顺带记一条**工具口径**（本批踩到、与切片无关）：`knip` 与 `kpi:studio` 的**唯一有效入口在仓库根**
（`bun run knip` / `bun run kpi:studio`，CI 也是这么跑的）。在 `homeos/frontend` 下敲 `bun run knip`
会被 bun 冒泡到根脚本、但 CWD 变成前端目录，于是报出一堆与本次改动无关的存量（shim 重导出、
`vite-studio.ts` 插件导出、`PanelRendererGeometry` 等）并以 exit 1 结束 —— **不是本次引入的红灯，别被带偏**。

#### 6d-2 零成本档清空（6 个函数 / 882 行，两批）+ 四条新踩到的坑

6d 之后 `panel-rendering.ts` 的「零成本档」（≥50 行、无可变捕获）还剩 7 条：3 块分区渲染 + 3 条弹窗 +
`createNumberRow`。6d-2 按「分区渲染 / 弹窗」拆两批搬走前 6 条（`panel-sections.ts` 追加 546 行、
新建 `panel-dialogs.ts` 382 行），宿主 2,186 → **1,351** 行。四条新坑：

1. **切片工具支持「追加到既有域文件」**：`--out` 指向已存在的文件时会**正文追加 + import 并入最末一条
   import 之后**（提示「重复行请自行去重」）。所以同域的 3 块分区直接并进 6c 的 `panel-sections.ts`，
   没有为了「一个文件一个函数」去造碎文件。代价是**同模块重复 import 要手工合**：实测
   `DEFAULT_BUTTON_SIZE` 重复一条、`@app/bridge/temperature-humidity` 出现两条。
2. **deps 接口该长大就长大，别造第二个**：新 3 块要的句柄是 6c 那 5 项的**超集**（只多不少），
   于是把 `PanelSectionsDeps` 从 5 项扩到 **12 项**、宿主仍然只建一个 `panelSectionsDeps()` 工厂，
   各函数按 6b 的老规矩**只解构自己用到的子集**（有 `no-unused-vars` 兜底）。若图省事新建
   `PanelSectionRenderersDeps`，宿主就会出现两个几乎重复的工厂对象。
3. **切片工具的回引 import 会和自家薄绑定撞名（真踩到了，只有 ESLint 抓得到）**：工具在宿主原位置插一条
   **非别名**回引 `import { openAddDialog, ... } from "./rendering/panel-dialogs"`，而薄绑定**也叫**
   `openAddDialog` —— 于是那条 import 变成「定义了没人用」。**`typecheck` 不报**（TS 的
   `noUnusedLocals` 不覆盖被同名遮蔽的 import），`lint:ci` 报 3 条 `unused-imports/no-unused-imports`。
   6c/6d 是手工把回引并进别名块才没炸，6d-2 忘了删 —— **搬完先看 lint，不要只看 typecheck**。
4. **`async` 与「唯一的两处跨函数调用」**：`openVacuumRoomPicker` 本身是 `async function`，薄绑定写成
   同步 `return ...Core(...)`（返回 Promise）而不是 `async`（免得撞 `require-await` 一类规则），调用点与
   发布面语义不变。6 个函数之间只有 2 处内部互调（`renderExtraControlsSection` →
   `renderAirPurifierBindingSection`、`openAddDialog` → `openVacuumRoomPicker`），都改成透传 `deps`
   —— 各 1 行，是 6d-2 全部的**非机械改动**。

`createNumberRow`（50 行，成本 20）**故意留在宿主**：它是「一行控件工厂」家族里的一员，家族另外 5 个
（`createConfigSection` / `createConfigRow` / `createSelectRow` / `createSettingRow` / `createSizeRow`）
都还在宿主里、且各自带可变或较多兄弟捕获 —— 单独把它切成一个 50 行的文件既不成域，也会把这一族劈开。
留着它的代价是 0：本文件已在 590 行，远低于 3,000 目标线。

#### 6d-3 收尾：把 3 个可变会话显式化，7 条一次落地（宿主 1,351 → **590**）

6d-2 之后本宿主的 ≥50 行直系声明只剩 6 条，全部卡在同一批可变捕获上：`auxDialogElement` 3 条、
`baselineItemsById` 3 条、`fieldDefs` 1 条（`refreshBatchButtons` 在 6d 已有单元可复用）。
6d-3 就是「先把这三个显式化、再一次性搬 7 条」—— 这一刀**没有新增依赖形态**，全靠 6c/6d 已有的两条
机制（共享 deps 工厂 + 可变单元格），所以能一次落地 776 行：

| 切片 | 目标 | 新增行 | deps |
|------|------|-------:|------|
| `openMetricsDialog` / `openCurtainGroupBatchApplyDialog` / `openLabelBatchApplyDialog` | `rendering/panel-dialogs.ts`（追加） | +524 | 复用同一份 `PanelDialogsDeps`（8 → 14 项：多出的 6 项是会话单元 `editorSession` + `buildItemPayload` / `listChangedFields` 等） |
| `buildItemPayload` / `listChangedFields` / `switchEditorKind` | `rendering/panel-session.ts`（**新文件**） | 164 | 新 `PanelSessionDeps`（10 项 = `e` + 两份会话状态 + 7 个兄弟函数） |
| `renderVacuumShortcutPanel` | `rendering/panel-sections.ts`（追加） | +290 | 复用 `PanelSectionsDeps`（12 → 18 项：多 `editorSession` + `refreshBatchButtonsCell`） |

**三个可变捕获的显式化方式（与 6d 口径一致，不发明新机制）：**

1. **`auxDialogElement` 不用传**：宿主早就用 `Object.defineProperty(e, "auxDialogElement", …)` 把它挂成
   访问器（`closeAuxDialog` 要用），切片里直接 `e.auxDialogElement = …` 读写即可 —— 相当于复用 6d 的
   「单元格」思想，只是宿主已经把单元建好了。零新增 dep。
2. **`baselineItemsById` + `fieldDefs` 合成一个会话对象**（`editorSession = { fieldDefs,
   baselineItemsById }`），按**引用**注入：模块内只改字段（`editorSession.fieldDefs = …`）与增删改 Map
   条目，从不重新绑定，因此与闭包捕获等价。`kindSessionsByKind` 同理（宿主持有、模块增删条目）。
   这是 6d 的 `refreshBatchButtonsCell` 的姊妹形态：**整体重绑 → 单元；只改内部字段 → 对象引用**。
3. 三条新弹窗里只有 `openMetricsDialog` 会**写** `baselineItemsById`（点开后把当前条目灌进会话基线），
   `switchEditorKind` 会整体**换掉** `fieldDefs` —— 两者都靠上面这条「按引用注入」成立。

**6d-3 新踩到的一个坑（写在最前面，因为它是「正文还原」这种重活）：**

- **`addWindowFrames` 型的「回调直接当事件处理器」**：`closeAuxDialog` **不能**参数化成 `(deps)` ——
  它以 `e.createButton("取消", closeAuxDialog)` 形态直接进了按钮回调，多一个 `deps` 首参会把
  `Event` 当成 deps 传进去。判定口径：**先看它是否被当作「裸函数值」交出去**（事件回调、`map`
  回调、定时器），是则只能搬成「内部实现 + 宿主保留零参包装」，或干脆不搬。本批因此把
  `closeAuxDialog` 留在宿主。
- **切片工具会丢正文（本次唯一一次）**：`--seeds=renderVacuumShortcutPanel` 替换宿主函数体时，把整个
  函数体换成了签名前奏（只剩 12 行）—— 行数账目与残留报告**都还是对的**（它们只看声明前的状态），
  所以不能靠账目发现。判据只能是**搬完后重新量宿主行数并和预期对齐**（本次预期 590，实测 590 才算过）。
  还原办法：从 `git show HEAD:<file>` 用同一套分析器取原文，与切片前在工作树上取到的正文逐字节比对
  （本次一致，说明 HEAD 版本 = 待搬版本），补回正文后把 `baselineItemsById` / `refreshBatchButtons`
  两处引用换成 `editorSession.baselineItemsById` / `refreshBatchButtonsCell.current()`，再复量行数。
- **同一域多切片的 import 会被重复追加**：`panel-sections.ts` 二次追加时把 `DEFAULT_BUTTON_SIZE` 又
  import 了一遍（TS2300）。这是 6d-2 那条「重复行请自行去重」的同族问题，**同域第二次追加前先看目标
  文件的 import 头**，比事后看 lint 快。

#### 6e 换到 `home.ts`：第一刀不是「最大的」，是「最闭合的」

`panel-rendering.ts` 收工后，剩下 5 个宿主都在 0% 收敛档。`home.ts`（21,495 行，宿主 22,766 行的箭头
函数、1,411 条直系声明）里成本最低的几条是 `requestJson`（93 行，成本 10：1 个 import + 1 个兄弟），
但它同时是**边界价值最高**的一条：超时 / 中止 / CSRF / 401-403 跳转是一整套自成体系的关注点，
落成 `app/editor/net/` 后，编辑器其余 21.4k 行与它再无关系。

这一刀与前面所有批次的区别：**它有一个真正的可变捕获，而这个捕获的「生命周期」不能想当然**。

- 原地是 `bootEditor` 内一行 `let authRedirectStarted = false`（分析器报 `2×` 引用，全在
  `startAuthRedirect` 里；全仓库没有第二处触碰它）。
- 「省事」做法是把它提成模块作用域 —— **那是错的**：`bootEditor` 有 teardown → boot 生命周期，
  同一文档内可以重进编辑器；提到模块后闩变成跨实例共享，重进之后 401 不会再跳登录页。
- 落地形态：宿主每实例创建 `const authRedirectState = { started: false }`（9 行，含薄绑定），
  按对象**引用**注入（`RequestJsonDeps` 只有这 1 项）。
- 判据与 6d 的 `refreshBatchButtonsCell` 同级但更宽：**`let` 被整体重绑 → 单元；
  只改内部字段 → 对象引用**。这里属后者，所以 `deps.authRedirectState.started = true` 与原来的
  `authRedirectStarted = true` 语义完全等价。

**6e 顺带补了一条回归网**（本文件里第一次给切片配冒烟）：`scripts/smoke/_request_json_smoke.ts`，
25 条断言，桩掉 `window.location` / `fetch` / `document.cookie` 直调模块，覆盖 401/403 分支顺序、
`detail.code` 透传、204、非 JSON、超时中文错误、调用方中止原样抛出、CSRF 头与 Content-Type。
其中两条专门锁上面那个生命周期语义（「闩只跳一次」+「闩随 deps 重置」）——
**已实测它是承重的**：把闩改成模块作用域后立刻 2 项 FAIL，改回即绿。
脚本已进根 `package.json` 的 `verify:smoke:frontend` 与 `checks.yml`（两处同组，只加一半会留缺口）。

**工具侧的一个坑（`--header`）**：`ops/studio/studio_slice_extract.mjs --header=` 是**原样插入**目标文件头部，
不带注释标记 —— 传 `"说明文字"` 会得到两行裸文本（TS1443/TS1127），必须自己写 `/** … */`。

#### 6f~6i 纯叶子档（成本 20~140）：属性元数据表按族落地 + 两条薄绑定的分化

`home.ts` 21,405 → **20,669**（四刀共 736 行正文），落成 3 个新域 + 一个既有域扩容。四条都不是「大块小刀」，
而是**叶子函数各自的形态差异**逼出来的四种落法，值得逐个记：

| 刀 | 内容 | 行数 | 残留依赖 | 落地形态 |
|----|------|-----:|---------|---------|
| 6f | `date/weather/lineChart` 属性元数据表（9 条声明 / 3 条多声明语句） | 276 | 45 | `app/editor/metadata/date-weather-linechart-input-tables.ts`：`createXxxInputTables(ctx)` |
| 6g | `navigation` 属性元数据表（4 条声明） | 275 | 39 | `app/editor/metadata/navigation-input-tables.ts`：`createNavigationInputTables(ctx)` |
| 6h | `runVariantPeer`（纯函数）+ `runVariantLower`（23 个调用点） | 170 | 1 | `app/editor/navigation-style-apply/target-options.ts`：纯函数直接同名回引 + `runVariantLower` 宿主薄绑定 |
| 6i | `runRecord`（纯函数）+ `formatLastSeen`（**裸值传递**） | 148 | 1 | `app/editor/controls/number-stepper.ts`：纯函数直接回引 + `formatLastSeen` 宿主薄绑定 |

**6f/6g：属性元数据表的「45 项残留依赖」是假的成本。** `--rank` 把 `*PropertyConfigsByElement` 报成成本
60/80/100，看着便宜；真去搬才发现它们全是 `new Map([[<元素变量>, {...配置}], …])` —— 元素变量是
`findElement("#date-primary-color")` 的绑定，于是「残留依赖」= **每张表用到几个表单元素**，
三族合起来 84 个。判据：**别把「一张表」当「一个函数」看代价** —— 表的体量在行数，成本在键的个数。

- 落法仍是「残留依赖显式化」：`createDateTimeWeatherLineChartInputTables(ctx)` 收 45 项元素引用、
  `createNavigationInputTables(ctx)` 收 39 项，宿主一次解构出全部表名，**调用点零改写**。
- 形态不是新发明：`setupEventLogWallInspector({ 23 个元素引用, ... })`、`home-*.ts` 检查器的
  `ctx.datePrimaryColorElement` 都是同一形态（`CustomPopupEditorContext` 那种全 `any` 的 ctx 也是在为它铺路）。
- **正文逐字可信可验**：两张新文件都用脚本核过 —— 把模块里的声明文本去掉 2 空格缩进后，与
  `git show HEAD:home.ts` 的同名声明**逐字节相等**（9/9 + 4/4），条目数也一一对上
  （`datePropertyConfigsByElement` 8 条、`navigationPropertyConfigsByElement` 27 条…）。
- 工具缺口：`studio_slice_analyze.mjs --seeds=` 只认函数声明（**变量声明表全是 `找不到：xxx`**），
  但 `studio_slice_extract.mjs --names=` 认变量声明 —— 本次四刀都是直接 dry-run 抽取拿残留清单，
  不经过 `--seeds`。另 `--whole-statement` 会自动把同语句的 `*TransformInputSet` 一起带走（正确，
  它们是同族），但要在报告里点名确认，别当成意外。
- 手工改动只有两处（合计 3 处 `export`）：内层声明在函数体里不能带 `export`，包工厂时要去掉
  （脚本剥的，TS1184 会先报出来）。

**6h：同一个切片里，纯函数和带依赖的函数要用两种回引方式。** `runVariantPeer`（25 行）零残留依赖 ——
它把选项行的 DOM 拼出来，`document` 是全局，所以**不需要 deps、不需要薄绑定**，工具默认的
「同名直接 import」就是对的（12 个调用点零改写）。而 `runVariantLower`（143 行）要
`navigationStyleApplyTargetsElement`，有 10 个调用点，于是走宿主薄绑定：留 `runVariantLower` 原签名，
内部 `runVariantLowerCore(navigationStyleApplyTargetDeps(), …)`。判据很简单：
**有依赖 → core 改名 + 宿主薄绑定；零依赖 → 同名回引**（前者函数声明会被提升，不会踩 TDZ）。

**6i：同一个切片里，有没有「裸值传递」决定薄绑定能不能省。** `formatLastSeen`（113 行，实为
「给数字输入套 ± 步进器」）要一个可变 `enhancedNumberInputsSet`（去重的 `WeakSet`，切片里只
`.has()`/`.add()`，不重绑定 → 按对象引用注入即可）。它有两个细节与前 17 刀都不同：

- `runRecord`（33 行）只被 `formatLastSeen` 用 → 工具不再回引（「搬走后源文件已无引用」），
  宿主侧不留任何痕迹 —— 这是**第一次出现「切片内部消化掉一个兄弟」**。
- `formatLastSeen` **被当成裸值交出去**：`buildCustomPopupEditorContext()` 里有 `formatLastSeen,`，
  而这个 ctx 的类型是 `interface CustomPopupEditorContext { [key: string]: any }` —— **类型全丢，
  `tsc` 不会拦**。若照 6h 那样把 core 直接同名 import，多出来的 `deps` 形参就会顶掉调用方原本的
  第一个实参（这里是 `document` 的默认值），而且是**静默**的。所以宿主必须留原签名薄绑定。
  （同一族的坑在 6d-3 的 `closeAuxDialog` 上出现过一次：`e.createButton("取消", closeAuxDialog)`。）

**因此补了第 19 条门禁：`scripts/gates/check-host-bindings.mjs`（+ 29 断言自检）。** 它把上面那条
「静默」变成**跨文件可判**的两条判据：

1. 某个绑定是从相对路径 / tsconfig 别名 import 进来的；
2. 它在导入文件里被**裸值引用**（简写属性 `{ f }`、属性值 `{ h: f }`、调用实参 `register(f)`、数组元素），
   而它在定义模块里的**首参是依赖袋**（`deps` / `ctx` / `context`）→ 报错，并点出「哪个调用点的第一个实参会被吃掉」。

解析要跟**转发链**（`export { x } from` / `export * from` / `本地 export { x }` / `export type`），
并区分 `export const { x } = await import(...)` 这种形态动态不可知的解构导出（单列 `dynamic` 计数，不静默）。
实测：430 个 studio 文件 / 1,714 条相对 import，其中 **47 条指向依赖袋形参、10 条形态动态不可知**，
裸值违规 **0** —— 说明现有 18 刀都踩在安全侧。这条门禁开发过程中**自己变瞎过三次**
（只认 `export function`、漏 tsconfig 别名、`export { local }` 只看第一条语句），
所以自检用合成模块压了每一种导出形态 × 裸值形态，另加「真实树 0 违规 + 依赖袋导入数 > 0」的绿化断言。
已接进 `check:deps`（即进 CI）。


#### 6j~6k + 7a（P4 续）：表单输入表按族落地 + 第一个「函数族」整体搬迁

`home.ts` 20,669 → **19,367**、`studio-app.ts` 21,773 → **20,681**（三刀共 2,394 行正文），
落成 3 个新文件 / 1 个既有域扩容。这三刀把「**一条多声明语句**」和「**一族函数声明**」两种形态
都推到了工具边界，记下四个坑：

| 刀 | 内容 | 行数 | 残留依赖 | 落地形态 |
|----|------|-----:|---------|---------|
| 6j | 预览态 / 效果可见性 / 图标预览的表（**一条语句 12 个声明器**） | 1157 | 172 | `app/editor/metadata/effect-preview-input-tables.ts`：`createEffectPreviewInputTables(ctx)` |
| 6k | 空调/时间检查器提交事件表（2 声明器）+ 导出面板拼接错误表（3 声明器） | 222 + 179 | 26 + 27 | `app/editor/metadata/{inspector-submit,export-splice}-tables.ts`：两个 `createXxxTables(ctx)` |
| 7a | 墙体构件族（**12 个函数声明**：轮廓 → 带洞形状 → 侧/顶材质 → 墙带 → 顶面 → 接触阴影 → `buildInteriorScene`） | 1137 | 19 | `app/3d-studio/authoring/scene/studio-walls.ts`：`StudioWallsDeps` 首参 + 宿主 6 个薄转发器 |

**坑 1：`--force` 会把护栏变成摆设，`--whole-statement` 的 1158 行必须先看清边界。** 6j 那条语句
超了工具 400 行的切片上限，`--force` 放行；产物里却混进了「一条 `import` 语句 + 两个嵌套作用域局部名」。
原因不是护栏错了，而是**必须自己复核三件事**：① 产物里有没有函数体内 `import`（TS1232）；
② `return`/外层对象里的名字是不是都在函数体顶层声明（嵌套作用域的局部名会变 TS18004）；
③ 有没有把 `return {` 之外的**同名子串**改错。本次三条全踩，修法都是脚本级（见坑 2/3）。

**坑 2：`out.indexOf("  return {")` 会命中外层缩进里的嵌套 return。** `"            return {"` 里含
子串 `"  return {"` —— 第一次包装把 12 个表名写进了**内层** `limits: (…) => { return {...} }`，而
`tsc` 只报了个语义无关的错（括号闭合后仍能编译），差点漏过。**判据**：整条语句搬到新文件后，
用 AST 取每个声明器文本、去 2 空格缩进、与 `git show HEAD:<宿主>` 同名声明**逐字节比对** ——
6j 报 11/12 一致，差的那一条正是被捕的，改回后 12/12（6k 的 5 条也是 5/5）。

**坑 3：写「残留依赖显式化」脚本时，`local` 集合必须包含函数形参与绑定模式属性名。** 两处踩空：
① 只扫 `fn.body` 不扫 `fn.parameters` → 所有形参被当成依赖（7a 第一次跑出 49 项，正确值是 19）；
② 绑定模式里 `{ ppm: interiorPixelsPerMeter }` 的**属性名** `ppm` 被当成引用 → 改写成 `deps.ppm: …`
（语法错误，好抓）；③ `import * as ns2` 与全局 `URLSearchParams` 要分别进 `imports`/`GLOBALS`。
简写属性 `{ f }` 要展开成 `{ f: deps.f }`，不能直接拼 `deps.f`（会得到非法简写）。

**坑 4：deps 化会让「上下文推断的隐式 any」暴露出来。** 7a 里 `deps.studioState.windows.filter((candidate) => …)`
这类回调，原来靠宿主 `studioState = createStudioDocument()` 的推断类型拿到形参类型；`deps.*` 变 `any` 后
`noImplicitAny` 直接报 TS7006（6 个）。修法是**只给报错的 6 个形参补 `: any`**，不要一把梭 ——
批量补会顺手把 15 个本来有上下文类型的形参也弱化掉（本次先批量、后按 `HEAD` 里「本来有没有类型标注」
回退掉多余 15 个，判据可复用：`HEAD` 中同名形参有类型的才保留标注）。

**7a 的形态值得单列：这是第一次整族函数搬迁，且族内互调。** 12 个函数里有 6 个被宿主其它代码引用
（要薄转发器），另 6 个「搬走后源文件已无引用」（内部消化）。族内互调（`buildWallBandMesh` 调
`buildShapesWithHoles`、`buildInteriorScene` 调全套）在 deps 化后**必须补 `deps` 首参**（19 个调用点）——
这一步工具不管，`tsc` 会用 `Expected N arguments, but got N-1` 全部点出来（13 条），照报错补即可。
薄转发器**不能**写 `(...args: any[]) => core(deps(), ...args)`：core 的形参是有类型的，`any[]` 展开会报
TS2556，要写显式形参（照抄 `HEAD` 原签名，默认值留在模块侧）。

#### 6l（P4 续）：语句级切片落地 7 条 —— 以及「依赖必须惰性注入」这条硬约束

`home.ts` 19,367 → **18,074**（-1,293 行），落成新域 `app/editor/bindings/`（7 文件 / 1,687 行）。
这一批第一次搬的是**语句**（事件注册 / 查询循环）而不是声明，也第一次撞上与声明级切片**语义不同**的约束。

| 刀 | 内容 | 行数 | 残留依赖 | 落地 |
|----|------|-----:|---------:|------|
| 6l-1 | 日期/时间检查器提交按钮批量注册（`.component-action-controls`） | 301 | 10 | `bindings/date-inspector-submit.ts` |
| 6l-2 | `document` click 兜底（点空白关闭实体选择器/检查器） | 265 | 23 | `bindings/document-entity-picker-dismiss.ts` |
| 6l-3 | 折线图检查器 `input` 监听 | 262 | 20 | `bindings/line-chart-inspector-input.ts` |
| 6l-4 | 导航检查器 `input` 监听 | 250 | 25 | `bindings/navigation-inspector-input.ts` |
| 6l-5 | 平面图检查器 `input` 监听（**嵌套**在块里） | 136 | 18 | `bindings/floorplan-diagram-inspector-input.ts` |
| 6l-6 | `window` `pageshow` 回退恢复（**嵌套**） | 121 | 12 | `bindings/pageshow-diagram-preview-restore.ts` |
| 6l-7 | 项目模板选项按签名重渲染（**嵌套** `if`） | 107 | 13 | `bindings/project-template-options-render.ts` |

**硬约束 1：语句级切片的依赖袋必须惰性（宿主传 getter，模块读 `deps.x`）。**
声明级切片搬的是「定义」，宿主在定义处换薄转发，**调用时机由原调用点决定**，依赖袋每次现取即可；
语句级搬的是「注册」，这条语句在 boot 时**只执行一次**、回调要等用户操作 —— 按值注入会把宿主状态
**冻结在注册那一刻**：`editorRenderer`（`let … = null`，boot 之后才赋值）回调里永远读到 `null`；
而 `entryStateRecord` 这类**声明在注册语句下方**的名字，宿主求值依赖袋时当场 TDZ 抛错。
两种都是 `tsc` 抓不到、只有运行期静默失效/崩掉的坑。故宿主一律写 `get x() { return x; }`，
模块正文把引用改写成 `deps.x`（读的时候才取）——这正是「留在宿主里的闭包」的语义。

**硬约束 2：改写只在引用位。** 属性名 / 绑定名 / 类型位不动；被内层同名绑定遮蔽的引用不动；
简写属性 `{ x }` 必须整条改写成 `{ x: deps.x }`。漏改的方向是安全的（模块里没有宿主作用域，
裸名必被 `TS2304` 抓住），改错的方向都不安全。

工具侧补了两个入口，都带自检并已进 `check:deps`：
`ops/studio/studio_slice_extract.mjs --range=START-END`（区间必须**正好**框住一条 AST 语句，否则拒绝执行；
19 项断言）与 **`ops/studio/studio_slice_wrap.mjs`**（把切片模块包成 `attachX(deps)` 工厂 + 打印宿主该写的
getter 调用片段；22 项断言）。注册成根脚本 `slice:studio:wrap`，与 `slice:studio` / `slice:studio:extract` 同列。

**自己踩的两个工具 bug（都是「写错了但不报错」型，值得记）：**

| bug | 症状 | 根因 | 判据 |
|-----|------|------|------|
| 改写只插不删 | 产物里 `deps.navigationTransformInputSetnavigationTransformInputSet`（`tsc` 报 `Property 'XX' does not exist`） | 替换写成 `slice(0,pos) + "deps." + slice(pos)`，没吃掉标识符区间 | 必须是**区间替换** `[pos,end) → text` |
| 正文从 `getFullStart()` 起 | 模块头部多两个空行；回滚时宿主每条语句上方多两个空行 | `getFullStart()` = `pos`（含前置 trivia），`getStart()` 才是首个 token | 起点取「首个 token 所在行的**行首**」：含缩进、不含上方注释与空行 |

**回滚也必须可自证。** 上面两个 bug 的产物要能逐字还原，靠的是「对被插进去的 `deps.` 前缀做**对半劈**」
（`deps.XX` 的两个半边必然逐字相同，劈不出两半相等就报错停下）+ 双账对账：`home.ts` 行数必须回到
KPI 基线的 19,367，且语句级成本表的四条区间/行数（`9494~9794` 301 / `9795~10059` 265 /
`13502~13763` 262 / `13876~14125` 250）必须逐一对上。两账都平才算回滚干净。

**语句余量普查的结论（下一批的前置条件）：**
- **直系语句里 0 写入的只剩 669 行的元素绑定块**（`const a = findElement("#…"), …`，661 个声明器）——
  它是陷阱不是候选（宿主上千处引用这些名字，搬走要么重新解构 661 个名字、要么全宿主改 `els.x`）。
- **嵌套语句**（块里的语句，直系普查看不见）里 0 写入 ≥80 行的只有 3 条，已全部摘下（6l-5/6/7）。
- 所以**0 写入的语句余量已摘完**。剩下的都是**有写入**的大块（`window` message 监听 661 行/4 写入、
  导航套用注册 684 行/24 写入、新建项目 click 814 行/12 写入）——它们要的是**state 袋**（显式化
  `activeProject` / `selectedComponentId` / `entryStateRecord` 这类宿主单例），那是与 6d 的「单元」
  同一族的前置工程，不是一个切片。

`app/editor/bindings` 已登记进 `ops/kpi/studio_domains_kpi.py`（域覆盖 68,322 → **70,009**，23 个域）。
顺带按 knip 口径收敛了 `features/security/index.ts` 的 12 个死 barrel 导出（存量，非本批引入）。

#### 6m（P4 续）：声明级切片升级 —— 4 族 10 个函数声明，第一次搬「会被宿主反复调用」的函数

`home.ts` 18,074 → **16,784**（-1,290 行），落成 4 个域目录（4 文件 / 1,592 行）。本批第一次搬**函数声明族**
（一族一个文件、共享一个依赖袋），也第一次撞上「被搬走的函数会写宿主变量」这条**类型全绿、只有运行期出错**的坑。

| 刀 | 内容 | 行数 | 落地 | 依赖袋 |
|----|------|-----:|------|--------|
| 6m-1 | `runCopyBackup`（备份/复制对话框装配与执行） | 353 | `app/editor/copy-backup/run-copy-backup.ts` | 5 项只读 + **1 个写入名** `popupBeingRenamedValue` |
| 6m-2 | 图标菜单族：`loadNavigationIconOptions` / `positionTitleButtonIconMenu` / `stopHoverScroll` / `iconTooltipElementValue` | 353 | `app/editor/menus/title-button-menu.ts` | 共享 1 份袋（16 项只读 + **1 个写入名** `openCustomSelect`） |
| 6m-3 | 检查器同步族：`syncComponentActionControls` / `applyTransformToInspector` / `previewModeForIcon` / `sharedReferenceId` | 810 | `app/editor/inspectors/inspector-sync.ts` | 共享 1 份袋（99 项只读，族内互调走 `xxxCore(deps, …)`） |
| 6m-4 | `nudgeDeltaX`（选中组件方向键微调） | 139 | `app/editor/selection/nudge.ts` | 4 项只读，无写入 |

**硬约束 3：函数声明的依赖袋可以按值，转发器必须是 `function` 声明。**
和 6l 的语句级切片相反，这里的 thunk 是**每次调用现建**（`name(...args) { return nameCore(nameDeps(), ...args); }`），
所以只读依赖按值快照等价（读的时刻就是调用时刻），不需要 getter。两条不能变：
转发器与 thunk 都用 `function` 声明（**提升**，位置无关 —— 宿主里调用点在切片区上方的比比皆是），
转发器形参要照抄 `HEAD` 原签名（`(...args: any[])` 展开给有类型的 core 会报 TS2556，同 7a）。

**硬约束 4：被搬走的函数写宿主变量时，按值注入会「写进一个立刻丢掉的临时对象」。**
`runCopyBackup` 里 `popupBeingRenamedValue = …`、图标菜单里 `openCustomSelect = …` 是**赋值**，
袋里写 `{ popupBeingRenamedValue }` 只是**读了一份快照**，赋值落在临时对象上 —— 宿主变量永不更新，
`tsc` / lint / 冒烟全绿，只有用户点了按钮才发现状态不动。工具现在是**自动**处理的：扫描被搬函数的
对外层绑定赋值，命中就把它在 thunk 里生成访问器（读到宿主、写回宿主），其余名字照旧按值：

```js
function titleButtonMenuDeps() {
  return ({
    customSelectsBySelectElement, imageAssetFolderSelectElement, /* …其余只读依赖… */
    get openCustomSelect() { return openCustomSelect; },
    set openCustomSelect(v) { openCustomSelect = v; },
  });
}
```

判据一句话：**只读 → 按值；有写入 → get/set 访问器**。有访问器的名字同时说明「这条依赖不是快照」。

**族内互调要补 `deps` 首参。** 一个文件里 N 个函数互相调用（6m-2 里 `positionTitleButtonIconMenu`
调 `iconTooltipElementValue`、6m-3 里四条互调）必须改写成 `xxxCore(deps, …)` —— 否则要么丢掉袋上下文，
要么白建一份袋。工具按 AST 找 `xxxCore(` 调用点、按实参个数 splice 进 `deps, `（本批命中 3 处）。

**工具侧补了三个入口**（`ops/studio/studio_slice_wrap.mjs` 自检 22 → **39** 项，已进 `check:deps`）：
`--mode=fn`（N 个函数声明 + 1 份共享袋，默认的 `stmt` 模式是给 6l 那种单条语句用的）、
`--host-only`（只重生成宿主转发器区、不碰已落地的模块 —— 模块侧改完依赖袋后重生成宿主用，
重跑幂等）、以及上面的 `stateWrites` → `get/set` 自动生成。
宿主侧的转发器与 thunk 集中在 `// ── P4 切片转发器（…）──` 标记区（`home.ts:14134`），便于复核与整体重生成。

**本批踩的四个坑（全是「写错了但不报错」型）：**

| 坑 | 症状 | 根因 | 判据 |
|----|------|------|------|
| `NodeArray.getStart/getEnd` 不存在 | 工具一跑就 `TypeError: d.parameters.getStart is not a function` | 形参列表是 `NodeArray`，只有 `pos`/`end`；`getStart`/`getEnd` 在 `Node` 上 | 形参区间取 `parameters.pos` / `parameters.end` |
| 解构形参的属性名被当自由变量 | 袋里多出 `kind` / `title` 这类**属性键**（多一条死依赖，lint 报 unused） | `{ kind: local }` 的 `propertyName` 是属性键不是绑定名 | 跳过 `ts.isBindingElement(p) && p.propertyName === n` |
| 外层赋值被静默丢弃 | 见上「硬约束 4」 | 袋成员是只读快照 | 检测外层写入 → `get/set` 访问器 |
| 转发器写成 `const` | 调用点在切片区上方时 TDZ 抛错 | `const` 不提升 | 转发器 / thunk 一律 `function` 声明（工具强制） |

`app/editor/{copy-backup,menus,selection}` 已登记进 `ops/kpi/studio_domains_kpi.py`（域覆盖 70,009 → **71,664**，26 个域）。
本批之后 `home.ts` 的 **0 写入语句（6l）** 与 **0 可变捕获的函数声明族** 都已摘完，再往下就进
「显式化 `activeProject` / `selectedComponentId` / `entryStateRecord` 这类宿主单例」的前置工程
（与 6d 的「单元」同一族），或者转去 `studio-app.ts` / `panel-renderer*` / `stage.ts` 三条宿主线。

#### 7b（P4 续）：`panel-renderer-bulk-methods.ts` 按 seam 拆完 —— 10,889 行 → 12 个文件 + 宿主删除

先纠正一条旧判断（6c 那节已就地更正）：**这个文件不是 class**，而是「顶层一组 `export function`，首参写
`this: PanelRenderer`」，由 `panel-renderer.ts` 用 `import * as ns` + `Object.assign(PanelRenderer.prototype, ns as any)`
装成 mixin 袋。（**兄弟文件 `panel-renderer.ts` 才是 class** —— 它下一步仍需要「工具支持 class 方法」。）
所以本批需要的不是 class 支持，而是承认这种宿主形态；工具当时有三处不认它：

| 缺口 | 症状（7b 实测） | 修法 |
|------|----------------|------|
| **回引丢掉导出面** | 12 个方法全是 `export function`，宿主靠**命名空间对象**发布；回引若写成 `import`，方法从这个对象里消失，而 `as any` 让 tsc 一声不吭（运行期点开面板才炸） | 源声明带 `export` → 回引**同时**发 `export { x } from "<target>"`（re-export 不产生本地绑定，可与 `import` 并存） |
| **「还在用吗」用正则判** | `this.connectRuntime()` 的属性名被 `\b` 匹配成引用 → 回引一条没人用的 `import`：typecheck 过、**lint 必红** | 改按 AST 引用位判；重扫必须用 `n.parent`（`parentOf` 的 map 只对源文件那棵树有效，否则全判 false → 静默丢回引） |
| **同目录搬运改坏 specifier** | `import type { PanelRenderer } from "../renderer"` 被重算成 `"./"`（TS 里是「当前目录的 index」，TS2307） | 相对路径为空即**原样保留**：目标目录没变，原 specifier 必然成立 |

三条都进了 `homeos/frontend/scripts/gates/_studio_slice_range_selftest.mjs`（19 → **24** 项断言）。

12 刀全部「零残留依赖 / 零外层写入」→ 不需要依赖袋、不需要 state 袋，函数连同 `this: PanelRenderer` 首参逐字搬走：

| 刀 | 函数 | 行数 | 落地文件（`app/renderer/panel-seams/`） |
|----|------|-----:|------|
| 7b-1 | `renderComponent` | 572 | `render-component.ts` |
| 7b-2 | `createCapabilityDetailsControls` | 730 | `capability-controls.ts` |
| 7b-3 | `createLightDetailsControls` | 655 | `light-controls.ts` |
| 7b-4 | `createCoverDetailsControls` | 537 | `cover-controls.ts` |
| 7b-5 | `createClimateDetailsControls` | 1,276 | `climate-controls.ts` |
| 7b-6 | `createWaterHeaterExtensionControls` | 570 | `water-heater-controls.ts` |
| 7b-7 | `showAirPurifierDetails` | 495 | `air-purifier-details.ts` |
| 7b-8 | `showVacuumDetails` | 735 | `vacuum-details.ts` |
| 7b-9 | `showPresenceDetails` | 422 | `presence-details.ts` |
| 7b-10 | `showEntityDetails` | 1,686 | `entity-details.ts` |
| 7b-11 | `showCustomPopup` | 2,555 | `custom-popup.ts` |
| 7b-12 | `connectRuntime` | 491 | `runtime-connect.ts` |

**宿主文件被删掉，而不是留成桶。** 12 刀之后 `panel-renderer-bulk-methods.ts` 只剩 24 行纯 re-export，
`ops/kpi/studio_monolith_kpi.py` 的桩检测立刻判它「compat 桩 / 硬失败」—— 这是**对的**：一个只为 `Object.assign`
存在的桶，漏一个名字时 `as any` 不会报错（和上面第一条同一类静默失效）。改成调用方显式 import 12 个名字 +
一个 `Object.assign(PanelRenderer.prototype, { …12 个名字… } as any)`：漏项在 typecheck 阶段就显形，
顺带把「谁在原型上」这件事写在调用点。

**度量口径随之改指向**（否则就是本文件开头骂过的「假收敛」）：

- 单体目标表 6 → **5** 条（该文件不再是单体，`Target(...)` 条目删除）；
- 该目录登记为域 `app/renderer/panel-seams`（12 文件 / **10,799 行**）→ 域覆盖 71,664 → **82,463**（27 个域）；
- 单体余量 61,772 → **50,911**（-10,861，与实际搬走的行数对齐）；
- 清单里原 `dialogs.ts` 计划条目被这 12 刀取代（删除）、`runtime-connect.ts` 由 planned 转 existing、
  `paint.ts` 仍 planned（那是 `panel-renderer.ts` 自己的绘制 seam，未建）。

**工具仍有的已知缺口（7c 已补）**：`--rank` 现在能认「顶层就是一组大函数」的文件（7b 顺手修了
`findBigHost()`：非 import 顶层语句 ≤ 3 条且某函数占全文件 >70% 才算宿主，否则宿主 = 文件顶层，
且此时其它顶层声明按「兄弟」计成本、不再全塞进 `tops`）—— 但 **class body 仍不walk**。
7c 补上了这条（见下节）。

#### 7c（P4 续）：`panel-renderer.ts` 按 seam 拆完 —— 7,154 行 → 1,888 行（-74%，已达 <3000 目标）

7b 结尾记的缺口是「class body 不 walk」，本批就是把分析器与提取器扩到 **类方法**（`ts.isMethodDeclaration`）
并落地。形态与 7b 正好互补：`panel-renderer.ts` **是 class**（`export class PanelRenderer`，与同名
`interface` 合并），118 个方法里绝大多数的方法名还是**计算名字符串**（`["showCameraPreview"]() {…}`）。

**搬运形态：模块侧改名，类侧留薄成员。** 方法搬成同名顶层函数，`this` 变成首参：

```txt
模块侧   export function showCameraPreview(self: PanelRenderer, component: any) { … self.xxx … }
类侧     ["showCameraPreview"](component: any) { return showCameraPreview(this, component); }
```

为什么**不**沿用 7b 的「删成员 + `Object.assign(proto, …)`」：那条路漏一个名字时 `as any` 一声不吭
（7b 自己就是因为这个把宿主文件删掉的），而薄成员留在类里会跟着类一起被类型检查 —— 漏一个名字、
签名对不上合并面，都是 tsc 当场红。代价是每个方法在类侧留 1 行。

| 刀 | 方法（个数） | 行数 | 落地文件（`app/renderer/panel-seams/`） |
|----|-------------|-----:|------|
| 7c-1 | `startComponentMove` 等 9 个拖拽/缩放/旋转（含气流与门窗透视） | 999 | `transform-interaction.ts` |
| 7c-2 | 选择框 / 控制柄 / 测量宿主 / 门窗透视手柄等 14 个 | 453 | `selection-overlay.ts` |
| 7c-3 | `update{Title,Device,AirConditioner,LightStatistics,Text,Image}SelectionBounds` | 585 | `selection-bounds.ts` |
| 7c-4 | `refreshRuntimeComponent` / 历史曲线 / 预热 / 重试 / 索引共 22 个 | 944 | `runtime-refresh.ts` |
| 7c-5 | 详情弹窗族 8 个（能力 / 媒体 / 浴霸 / 电动床 / 吸尘器 / 动作弹窗） | 951 | `details-popups.ts` |
| 7c-6 | 相机预览 / 媒体浏览器 / 3D 相机入口 4 个 | 641 | `media-camera.ts` |
| 7c-7 | 运行期对话框缩放 / 关闭 / outside 关灯 5 个 | 188 | `runtime-dialogs.ts` |
| 7c-8 | 动作分发族 5 个 + 乐观态 3 个 | 691 | `runtime-actions.ts` / `optimistic-state.ts` |

8 刀全部「零残留依赖」：这与 `--rank` 的实测一致（本类方法只碰 `this.*` 与 import，**兄弟/可变/外层
捕获全是 0**），所以不需要依赖袋、不需要 state 袋，`this` 一改到底就闭合了。

| 坑（都进了自检） | 症状 | 判据 / 修法 |
|------|------|------|
| `this` 并非全都该改写 | 嵌套 `function(){ … this … }` 里的 `this` 是它自己的接收者，改了就改语义 | 只改「属于该方法」的 `this`：非箭头函数内层整个跳过（箭头函数继承外层，照改）；多态 `this` 类型（`ThisTypeNode`）与 `super` 直接硬失败 |
| 形参**默认值**里的 `this` | `closeRuntimeDialog(target = this.detailsDialog)` → 模块里成「顶层函数用 this」= **TS2683**（typecheck 实测抓到 1 处） | 形参片段单独跑一遍改写（片段按表达式解析，`this` 仍是 `ThisExpression`） |
| 解构形参没类型标注 | 本类面板方法的主流入参：`showCapabilityDetails({ preview = false, title = "" })` —— 转发器需要一个**能传下去的名字 + 类型** | 优先用显式标注；没有标注时请 checker `typeToString` 把推断出的对象类型打印出来（同一文件内解析，注释/import 都就位），再用 `assertParses` 兜语法 |
| 薄成员**不自带换行** | `span.end` 已吃掉方法后的换行 → 相邻方法的转发器粘在同一行（语法合法、可读性归零，实测 11 处） | 插入薄成员时自己补 `"\n"`；并把「同行多转发器」列为复量项（应为 0） |
| 不可外迁的形态 | `static` / 生成器 / 泛型方法 / 计算名不是合法标识符（`["a-b"]`）/ 形参无类型可推 | **硬失败**并指名方法，不许猜（`--names` 清单里的方法必须全部搬走，静默跳过正是要防的失效模式） |
| 模块签名的类型 import | `self: PanelRenderer` 里的宿主类不会出现在正文里 → 自由引用扫描看不见它 | 工具按宿主类名自动补 `import type { PanelRenderer } from "./panel-renderer";` |

自检 `homeos/frontend/scripts/gates/_studio_slice_range_selftest.mjs` 24 → **36** 项（新增方法形态 10 项 +
形参默认值 `this` 1 项 + 回引清单 1 项）。分析器 `--rank` 也认类方法（报告里的名字还原成方法名，
不再是一片 `<MethodDeclaration>`）。

**度量口径随之改指向**：

- `app/renderer/panel-seams` 域：12 文件 / 10,799 行 → **21 文件 / 16,167 行**；
- 域覆盖 82,463 → **87,831**（仍是 27 个域，`methods/` 属于既有域，不新增域条目）；
- 单体余量 50,911 → **45,645**；
- 面板渲染器 7,154 → **1,888**（`studio_monolith_kpi.py` 直接标「已达目标」），剩下的是类自己的
  状态机与渲染核心（`setDocument` / `renderComponents` / `syncSelection` / 生命周期），**不再是单体目标**。

顺带清理：7b 之前留在 `ops/` 的两个临时探针脚本（`_tmp_cls_probe.mjs` / `_tmp_cls_kinds.mjs`）删掉，
否则 `knip` 会把它们当死文件（实测就是这个报错把门禁卡住的）。

### 4x 顺带修掉的三条「解析型门禁」失效模式
拆单体最容易被「看起来减了 1400 行」骗过去，所以这批先修了度量工具本身（都在 `ops/studio_slice_*.mjs`）：

| 失效模式 | 后果 | 修法 |
|---------|------|------|
| **简写属性闭包捕获漏报**：`checker.getSymbolAtLocation` 对 `{ foo }` 返回的是 `ShorthandPropertyAssignment` 自身，不是外层绑定 | context 对象（`{ get x(){}, titleButtonLabelElement, ... }`）被当成「只引用自己」→ 报 cost 0、报「无残留依赖」，切出去引用未定义名，只有 typecheck 兜底 | 改走 `getShorthandAssignmentValueSymbol` 深解析；修复后 `buildTitleButtonInspectorContext` 等从「成本 0」回到真实成本 |
| **访问器名被当作本地绑定**：`collectLocals` 把 `get activeProject(){}` 的 `activeProject` 记成 local | 函数体里对该闭包变量的引用被静默吞掉 | 只把真正的函数声明/表达式名当本地名，方法/访问器名（属性键）不算 |
| **`--also` 助手被无条件回引** | 助手只被切片本体使用 → 源文件留下死导入，lint 必红（实测抓到 5 条：`isPointOverRect`、`lightPrecompileBudgetMs`、`copiedComponentLabel2`…） | 回引只带「切片移除后源码里仍出现」的名字；顺带把只用于本文件内部的助手去掉 `export`（否则 knip 报死导出） |
| **源文件侧的死导入没人管** | 上面的判据只管**回引**要不要带某个名字，源文件**自己原有**的 import 谁都不碰 —— 切片独占的 import（尤其 `normalizeCameraSettings as normalizeCameraSettings2` 这种**别名**，只出现在被搬走的正文里）每片都会漏 2~5 条，靠 lint 兜底 | 5x 新增：把 srcNew 的 import 声明全部挖空后逐条判本地名是否还在正文里出现，整条没人用就删整条、部分用就重建该条（副作用 `import "x"` 不动） |
| **回引插入位置用了清理前的偏移** | 删字符后偏移整体前移，实测把 `import { sliceFn } from "./out"` 插进函数体中间（TS1232 之外还能静默错位） | 插入前**重新解析** srcNew 取「最末一条 import 的 end」，不再复用清理前的 AST 偏移 |
| **死导入清理把多行 import 压成单行** | 「按 specifier 重建整条声明」的写法把源码里成片的多行 import 压成 800+ 字符单行 —— 一次切片冲掉约 225 行**无关排版**，与「逐字复制、零无关改动」的口径相悖 | 改成**按 specifier 粒度抠文本**（四种形态：独立成行带后随逗号 / 末项独立成行 / 同行带后随逗号 / 同行末项）；正则全不命中时**宁可留着**并在报告里点名（`抠不掉、保留原样`），交给 lint 兜底；单行花括号列表顺手抹平空格 |
| **已发生的排版坍塌要能回滚** | 上面那条修复改的是「以后」，已经被压掉的 27 条声明得还原 | 新增 `ops/studio/restore_import_formatting.mjs`：以 `git show HEAD:<file>` 的同名声明为**格式真源**，把「当前已没有的名字」按 specifier 粒度从 HEAD 文本里抠掉、其余逐字沿用；HEAD 里没有的声明（本次新增的回引）保持现状 |

另新增 `--whole-statement`：`const a = {...}, b = {...};` 这种多声明语句没法只搬一条（会留 `const ;` 碎片），
此开关把同语句声明整条搬走并把它们一并纳入回引 —— `home.ts` 里成片的属性元数据表正是这么写的。


## 下一批切片（按成本排序，行号已随本批位移）

> 表格数字由 `bun run slice:studio <file> --rank` 实测（只列 **≥50 行**的直系声明；<50 行的小件没进榜）。
> **数字修过之后才是真的**：4x 之前 `home.ts` 报「15 个成本 0」是简写属性漏报造成的假象（详见上表）；
> 现在的成本 0 只剩 `home.ts` 里那批属性元数据表，已随 4c 搬走。所以两个宿主当前都是「成本 0 的 ≥50 行声明 = 0」。

`studio-app.ts`（**成本 0~140 的便宜档已清空**：≥50 行的直系声明里，剩下全部带可变捕获，成本从 1010 起）：

| 行数 | 兄弟 | 可变 | 外层 | 未解析 | 成本 | 名字@行 |
|-----:|-----:|-----:|-----:|------:|-----:|---------|
| 71 | 1 | 1 | 0 | 0 | 1010 | `buildFloorEdgeOutline@13079`（可变 `sceneRootNode`） |
| 95 | 2 | 1 | 0 | 0 | 1020 | `emitRuntimeDiagnostic@894`（可变 `threeRenderer`） |
| 79 | 3 | 1 | 0 | 0 | 1030 | `createMaterialSlotRow@5659` |
| 113 | 3 | 1 | 0 | 0 | 1030 | `createPlanLabel@11530` |
| 68 | 4 | 1 | 0 | 0 | 1040 | `createAreaSection@2544` |

下一批的前置动作是**逐个核实「可变捕获是不是只读」**：`sceneRootNode` / `threeRenderer` 这类对象引用按 deps 传进去与闭包捕获等价（5c 的 `sceneStyle`、6a 的 25 项残留依赖都已按此判定通过）；
若不是只读，就必须把它降级成参数而不是 deps 成员。这一步不能靠工具自动判定 —— `--rank` 只报「引用了可变变量」，
判据是 `awk 区间 | rg '名字\s*=[^=]'` 为空 + `awk 区间 | rg '\bawait\b'` 为空（6b 用的就是这两条；有 `await` 时快照解构才不等价）。

真正的高收益仍然在**巨大单块**里（`--rank` 只按「≥50 行的直系声明」列，几千行的巨块会盖住整张榜）：

| 行数 | 成本 | 名字@行 | 说明 |
|-----:|-----:|---------|------|
| 3051 | 最高 | `runStudioRenderLoop@18529`（可变 **73** 个） | **最后再动**：先把状态收进显式 context |

`studio-app.ts` 里的巨大单块至此只剩它一个（6a 的 7,548 行、6b 的 1,725 行都已离开）。

「兄弟≥1」的意思是：搬它时必须**连带那些兄弟一起搬或显式传参** —— 5x / 6a / 6b 已给出可照抄的两种形态
（deps 接口 + 源侧薄绑定；巨大单块用「解构前奏」）。

`home.ts`（**6e~6m 已完成**：`requestJson` + 4 刀纯叶子 + 7 条语句级 + 4 族函数声明；下表是 6i 之后复量的快照）：

| 行数 | 兄弟 | 可变 | 外层 | 未解析 | 成本 | 名字@行 |
|-----:|-----:|-----:|-----:|------:|-----:|---------|
| 55 | 4 | 0 | 0 | 0 | 40 | `stopHoverScroll@1926` |
| 77 | 5 | 0 | 0 | 0 | 50 | `iconTooltipElementValue@4558` |
| 86 | 8 | 0 | 0 | 0 | 80 | `runExtraVariant@5156` |
| 104 | 14 | 0 | 0 | 0 | 140 | `previewStateByInputElementById@12427` |
| 99 | 17 | 0 | 0 | 0 | 170 | `onPopupListContextmenu@18215` |
| 162 | 21 | 0 | 0 | 0 | 210 | `exportSpliceErrorById@11643` |
| 220 | 26 | 0 | 0 | 0 | 260 | `airConditionerInspectorSubmitEventById@9359` |
| 208 | 27 | 0 | 0 | 0 | 270 | `effectVisibleComponentById@12211` |
| 324 | 40 | 0 | 0 | 0 | 400 | `previewStateByInputElementByName@12969` |

（`--rank` 会把 6f/6g 留下的 `const { … } = createXxxInputTables({…})` **解构语句**当成一条 57 行的「声明」
排进榜里 —— 那是产物不是候选，看到 `名字@行` 是多行花括号即可跳过。）

**4x 之前「成本 20~140 随便切」的判断在 6f/6g 上被现实修正**：`*PropertyConfigsBy*` 的成本在
`--rank` 里只有 60~140（它数的是兄弟声明个数），但它们真正的代价是**每张表的键都用表单元素变量**。
所以下一批的排序要**先看键**再看行数：

- 剩下的便宜档里，`iconTooltipElementValue`（5 个元素/状态依赖）、`runExtraVariant`（8 个兄弟，
  牵 `runExtraAlt` 219 行）属同一族 —— **图标选择器（icon picker）**，`app/editor/picker/` 是它的天然落点，
  且与既有的 `iconListStateByElement` / `ICON_PAGE_SIZE` / `createIconPickerClearOptionState` 同源，
  应该**按族一刀**（像 6f/6g 合并三张表那样），别再一个函数一个文件。
- ~~`previewStateByInputElement*` 不能直接用整条开关~~ —— **6j 已用整条开关搬走并逐字节验证通过**：
  那条 1158 行语句的 12 个声明器确实是同族纯表（预览态 / 效果可见性 / 图标预览），整条搬出后
  用 AST 逐声明器比对与 `HEAD` 逐字节相等（12/12）。**结论修正**：`--whole-statement` 该用就用，
  成本在「复核成本」而不在「开关本身」（复核三件事见 6j 的坑 1）。
- `stopHoverScroll`（55 行）看着最便宜，但闭包展开 333 行 / 23 个残留依赖（7 个可变）——
  **成本 40 是假象**（`--rank` 只数 ≥50 行的兄弟，把 19~49 行的兄弟全漏了）。这是本批第二个
  「`--rank` 低估」的例子，判据同 6f：**先 dry-run 拿残留清单，再信成本**。

`runtime/config-ui/config-editor/panel-rendering.ts`（**6d-3 之后，已收敛**：宿主 590 行，目标线以下
80%；`attachEditorPanelRendering()` 内已无 ≥50 行的直系声明，剩 44 条声明全部是「21 个控件/状态助手 +
4 条有状态闭包 + 16 条薄转发 + 发布面」。**该宿主不再排切片**，后续只按需增删薄转发）：

`rendering/` 域的四个文件即 6c~6d-3 的全部产出：
`panel-assembly.ts`（2,737 行，总装 `renderPanel`）/ `panel-sections.ts`（1,402 行，6 块分区）/
`panel-dialogs.ts`（880 行，7 条弹窗）/ `panel-session.ts`（164 行，会话与条目载荷）。
四者共用「**一个宿主对象 `e` + 兄弟函数按需快照注入 + 可变状态走单元或按引用对象**」这一条口径，
没有第二套写法。

`requestJson` 那一刀（最有边界价值、成本最低）**已完成**（见 6e，落 `app/editor/net/` + 25 条冒烟）。
`home.ts` 现在的最便宜档里的**纯叶子已按族落地**（6f~6i）：属性元数据表 → `app/editor/metadata/`，
导航套用弹窗的选项行 → `app/editor/navigation-style-apply/`，数字输入步进器 → `app/editor/controls/`。
剩下的候选见上表，注意口径已从「按成本排」改为「**先看键（残留依赖）再看行数**」。

### 语句级成本口径（6j~7a 之后复量，不只 `--rank`）

`--rank` 只按「≥50 行的直系**声明**」列，`home.ts` 真正的余量在**语句**里（事件注册、循环注册）。
所以补了一套语句级成本口径：**自由变量（分宿主/import 两类）+ 对外层可变绑定的写入数**。
写入数是最硬的判据 —— 0 写入 = 可以按值快照注入；>0 就必须先做成单元/按引用对象。

`home.ts`（19,367 行）语句级候选，按「行数大 × 宿主自由变量少 × 0 写入」排 —— **下表前 4 条 + 3 条嵌套段已随 6l 落地**，
括号里标的是当时的位置；余下的 0 写入候选只剩那条 669 行的**陷阱**（见 6l 小节）：

| 行数 | 宿主自由 | import | 外层写入 | 位置 | 内容 | 现况 |
|-----:|--------:|-------:|--------:|-----:|------|------|
| 301 | 15 | 7 | 0 | `@9494` | `for (const x of document.querySelectorAll(".component-action-controls"))` 批量注册 | **6l-1 已落地** |
| 265 | 23 | 3 | 0 | `@9795` | `document` click 委托（实体选择器外部点击关闭） | **6l-2 已落地** |
| 262 | 20 | 2 | 0 | `@13502` | 折线图检查器 `input` 监听 | **6l-3 已落地** |
| 250 | 25 | 2 | 0 | `@13876` | 导航检查器 `input` 监听 | **6l-4 已落地** |
| 669 | 1 | 0 | 0 | `@498` | 元素绑定块 `const a = findElement("#…"), …`（661 个声明器） | **陷阱，见下** |
| 213 | 43 | 2 | 2 | `@18843` | `document` input 委托（面板尺寸钳制） | 待显式化单例 |
| 335 | 28 | 1 | 1 | `@16903` | `runCopyBackup({ … })`（函数声明） | **6m-1 已落地**（state 袋） |
| 661 | 25 | 10 | **4** | `@10795` | `window` message 大监听 | 需 4 个单元 |
| 684 | 124 | 7 | **24** | `@15691` | 导航套用弹窗注册 + 确认大闭包 | **最贵** |
| 814 | 136 | 12 | **12** | `@8548` | 新建项目 `click` async 大监听 | **最贵** |

- **669 行的元素绑定块（`const a = findElement("#…"), …`，661 个声明器）是陷阱，不是候选。**
  它的宿主自由变量只有 **1 个**（`findElement`），看着最划算；但这些名字在宿主里被引用上千处，
  搬走就必须让宿主重新解构 661 个名字（净收益 ≈ 0），或者把全宿主 `x` 改写成 `els.x`（数千处改写）。
  **判据：看「搬走后宿主还要不要这些名字」**，而不是看残留依赖数。
- 语句级切片工具**已支持**：`--range=START-END`（区间必须正好框住一条语句）+ `ops/studio/studio_slice_wrap.mjs`
  （工厂包装 + 宿主 getter 调用片段），两条自检已进 `check:deps`；语义约束（依赖必须惰性注入、
  改写只在引用位）与两个工具 bug 记在 6l 小节。
- `studio-app.ts`（20,681 行）剩下的形态是**函数声明**，`--rank` 给的便宜档（成本 1010~1080）全是
  「1 个可变捕获」的 70~220 行小件；真正的大块只剩 `runStudioRenderLoop`（3,051 行 / 73 个可变捕获，
  **最后再动**，先把状态收进显式 context）。7a 证明了**按族搬**（12 个函数一起）比单函数搬划算得多：
  族内互调只多花 19 处 `deps` 首参，而依赖袋只有 19 项。
- ~~`panel-renderer-bulk-methods.ts`（10,889 行）必须先把工具扩到 class 方法~~ → **7b 已完成并证伪**：
  它不是 class，12 个顶层 `export function`（首参 `this: PanelRenderer`）全部零残留依赖、零外层写入，
  一刀一个 seam 搬完（10,889 → 宿主删除，12 个文件最大 2,567 行）。见 7b 小节。
- ~~`panel-renderer.ts`（7,154 行）**是 class**，动它之前先给分析器 / 提取器加 `ts.isMethodDeclaration` 形态~~
  → **7c 已完成**：8 刀搬走 70 个方法（零残留依赖），7,154 → **1,888 行**，已达 <3000 目标；剩下的是
  类自己的状态机与渲染核心（`setDocument` / `renderComponents` / `syncSelection` / 生命周期）。见 7c 小节。
- `stage.ts`（5,702 行）是同 6c 的「巨型宿主 + 嵌套声明」形态，先按 `--rank` 复量再定
  （它已有 4 个 seam 文件拆出去过）→ **8a 已落地 7 刀**（5,702 → 4,485，见第 8 节）；
  余量按 `--rank` 的「成本」列继续，最大两块是 `stageHandlersHost`（240 行 / 63 个可变捕获）
  与 `mountStage` 内的状态同步块（73 个可变捕获，与 `runStudioRenderLoop` 同一类问题，先显式化再切）。

再往上就进「可变捕获」区（成本 1000+，如 `navigationIconCopyError` 牵 `activeProject`、
`onWindowMessage` 牵 `lightingPanelDragState`）：按 6d/6e 的口径先判「整体重绑 → 单元」还是
「只改字段 → 按引用对象」，`activeProject` / `selectedComponentIdsSet` 这类高频单例应是下一步的
显式化目标（一次显式化能解锁成片函数）。

**第二块硬骨头**只剩 `runStudioRenderLoop`（3051 行）：

- `buildItemModel`（7,547 行）：**已完成**（见 6a）。
- `drawDoor` + `drawCourtyardArea`（1,725 行）：**已完成**（见 6b，落在 `app/3d-studio/plan/studio-plan-item-drawing.ts`）。
- `runStudioRenderLoop`：可变捕获 **73** 个（`threeCamera`、`studioProject`、`sceneRootNode`…）→ **最后再动**；
  先把状态收进显式 context，否则每搬一次都要重连一堆渲染循环状态。

---

## 8. 模板切片（模板维度，2026-10-13）

`stage.ts` 的前 7 刀（8a）走的是既有 AST 通道：`lighting` / `controls` / `camera-motion` /
`layers-sync` / `refresh` / `curtain-motion` / `navigation-drag`，5,702 → **4,485 行**，每刀都带显式
依赖袋接口（`StageLightingDeps` … `StageNavigationDragDeps`），宿主侧留同名转发器与状态 get/set 访问器。

但**行数余量的大头不在 `.ts`**：`entries/EditorView.vue` 的模板 2,630 行、`entries/StudioView.vue` 的模板
1,514 行，其中绝大部分是**引擎命令式填充的静态 DOM 契约** —— inspector 表单、对话框、浮层壳，
零 Vue 指令（`{{ }}` / `v-*` / `@` / `:` 一个都没有），由旧引擎用 `getElementById()` 取到后自己填自己读。

所以新增了第三个切片维度（与「声明切片」「语句切片」并列）：`ops/studio/studio_template_seam.mjs`。

- 计划是**可复现文件**（`ops/plans/studio/editor-view-template.json`、`studio-view-template.json`），
  锚点用 `#id` 或 `.class`（`.plan-panel` 这种没有 id 的静态栏只能按 class 定位，按空格切令牌整词比较，
  `\b` 会把 `plan-panel--collapsed` 误吃成同一段）。
- 子组件用**多根模板**（fragment）渲染 → 不新增包裹元素，DOM 结构与切片前逐字节一致，
  不会打断 `.panel > .inspector-form` 这类子选择器。
- 紧贴段落上方的单行 HTML 注释**跟段落一起搬**（否则挂载点插在第一个段落处，注释会被孤立在原地）。
- 对账四条（不通过就不写盘）：id/class 锚点在宿主里消失、在子组件里恰好一次、组件模板配平、
  跨组段落不重叠；另有「段落不连续 → 渲染位置前移」告警（DOM 顺序有语义，不硬拦但必须报）。
- 自检 `scripts/gates/_studio_template_seam_selftest.mjs`（28 项断言，含 6 个负向用例）在 `check:deps` 链上。

结果：`EditorView.vue` 2,717 → **291 行**（7 个子组件落在 `chrome/editor/`）；
`StudioView.vue` 1,599 → **1,228 行**（3 个子组件落在 `chrome/creator/`）。
两个目录已登记为 `chrome` 层域，`kpi:studio` 的域覆盖随之从 87,934 → 93,881 行（只增不减）。

---

## 9. 状态显式化（三宿主全量清零，2026-10-14）

切片进「可变捕获区」（成本 1000+）就搬不动了：宿主闭包里的 `let` 被搬走的声明逐个重新捕获，
每切一刀都要重连一堆渲染循环状态。`state-context` 这一步先把状态收进带**显式字段类型**的对象
（禁止 `{[key:string]: any}` 开放袋子），再切。试点选 `stage.ts`，一路迁到顶层 `let` 清零。

- 工具 `ops/studio/studio_state_context.mjs`（`--file` `--fn` `--names` `--ctx` `--list`
  `--dry-run` `--drop-let` `--keep-init=`）按**符号**改写引用，不按名字 ——
  `noResolve` 本地 Program + 类型检查器，只改**确指宿主那个 `let` 绑定**的标识符；宿主里
  `options` / `text` / `num` / `list` 这类常见名极易被同名参数或内层局部变量遮蔽，按名字改会误伤。
  它只改**引用**：跳过 `get x(){}` / `set x(v){}` 的键名与对象属性键，把简写属性 `x,` 展开成
  `x: ctx.x,`，改写后带语法自检，不过不写盘。
  `--drop-let` 顺带删掉这些绑定的 `let` 声明**整行**；初值不是字面量的（`startupProgress` /
  `configuredModuleKinds2`）用 `--keep-init=` 声明，声明**原位**改成 `ctx.x = <初值>`，
  语义与位置都不变（不会出现「先读到默认值」的窗口）。
- 上下文类型与工厂落在**域目录**（`runtime/core/stage/stage-context.ts`：`StageContext` +
  `createStageContext()`，按族分组的 91 个显式字段），宿主只留一行
  `const ctx = createStageContext();` —— 宿主因此**净减**，符合 `kpi:studio` 的「单体只减不增」。
- 迁移批次（每批都跑 `typecheck` + `check:deps`（22 步）+ `check-studio-type-debt` + `kpi:studio`，
  然后 `--update` 收紧基线）：
  1. 闲置旋转 4 项 → 2. 光线范围编辑器 5 项 → 3. 编辑/导航/模块主状态 24 项 →
  4. 舞台呈现/背景/焦点/视口 + 各域同步快照/指纹/指针手势 58 项。
- 结果：`stage.ts` 4,495 → **4,404 行**，`mountStage` 顶层 `let` **清零**（`rg '^  let '` 无命中），
  `as any` 9 → 7。基线已收紧（`kpi:studio` 舞台宿主 4,404；`as any` 625）。

### 9.1 三宿主全量（`EditorContext` / `StudioRenderContext` / `StudioAppContext`）

同一口径复用到另外三个宿主，共 **461 个可变捕获**清零：

| 宿主 | 上下文（域目录） | 字段 | 宿主行数 | 收敛 |
|---|---|---|---|---|
| `runtime/core/stage.ts` `mountStage` | `StageContext` 91 | 91 | 4,495 → **4,404** | 基线收紧 |
| `app/editor/home.ts` `bootEditor` 内箭头 | `EditorContext` 102 | 102 | 16,958 → **16,854** | 基线收紧 |
| `app/3d-studio/authoring/studio-app.ts` `runStudioRenderLoop` | `StudioRenderContext` 72 | 72 | （见下） | — |
| 同上 `bootStudio` 外层箭头 | `StudioAppContext` 196 | 196 | 20,671 → **20,415** | 基线 20,610 → **20,415** |

合计 44,148 行；`kpi:studio` / `check:deps`（22 步）/ `check-studio-type-debt` /
`verify:contracts`（15 步）/ `typecheck` 全绿。

### 9.2 类型携带：退化成 `any` 的 receiver 会静默抹掉上下文推断

第一版生成器把「无法自足表达的类型」一律退 `any`（461 个字段里 238 个）。
`studio-app.ts` 因此一次冒出 **107 个 `TS7006`**（`appCtx.studioState.items.map((x) => …)`
的 `x` 退化成隐式 `any`）——**基线对照实验**：把迁移前文件换回去，`typecheck` 是 **0 错误**，
所以这 107 个全是这一步引入的。教训：`{ [key: string]: any }` 硬零只是第一道，**字段级 `any`
同样会吃掉类型**，只是报错位置在宿主而不是上下文模块里。

现在按「能精确就精确」推导（461 个字段里 **232 个精确**）：

1. **显式注解**：用 TS AST 收「类型引用名」（`TypeLiteral` 的**属性名不算**，所以
   `{ areaId: string; name: string }[]` 这种内联结构类型是自足的，能原样搬）；
2. **无注解但初值是 `import f` 调用** → `ReturnType<typeof f>`（`studioState = createStudioDocument()`
   的匿名大对象只靠这条才精确）；`new X()` → `InstanceType<typeof X>`；
3. 纯字面量初值 → `string` / `number` / `boolean`；
4. 本地私有类型 / 跨文件不可导出者 → 仍退 `any`（**登记在生成的接口头注释里**，不是悄悄退）。

用到宿主 `import` 的类型会按**相对上下文模块**的路径补 `import type`；别名导入必须带
`as`（宿主的 `normalizeBaseLighting as normalizeBaseLighting2` 若只写 `normalizeBaseLighting2`
会 `TS2724`）。

### 9.3 值级不变量：「搬不动」的初值必须有写回，否则是**静默语义变更**

`isPureLiteral` 判「可搬进工厂」时漏掉两类形态，初值就被静默丢掉（既没进工厂、宿主也没写回，
字段停在占位值上）：`{ lights: [] as any[] }`（**类型断言**）与 `furthestFloorOrder = -Infinity`
（`-` 作用于模块级常量，是 `PrefixUnaryExpression` 的 Identifier 操作数，不是 NumericLiteral）。
实测 `options` / `baseStageConfig` / `furthestFloorOrder` 三个字段真丢了值，靠校验器抓出来。

- 断言不影响运行时值 → 判纯度时**拆掉**继续判定；复制进工厂时再用 AST 删掉
  `x as any` / `x as any[]`（不删会把 `as any` 记账搬进新模块，`check-studio-type-debt` 立即棘轮回退：
  实测 stage-context +2、editor-context +1）。
- 不变量校验器 `ops/studio/verify_ctx_values.mjs`：占位（搬不动）字段必须在宿主里存在
  `ctx.x = <原初值>`，且**初值文本逐字相等**（引用到已迁移变量时按 `ctx.` 归一化）。
  弱一档的「宿主里存在 `ctx.x = …` 就算写回」会**假阴性** —— 依赖袋的
  `set x(v) { ctx.x = v }` 长得就像写回。四宿主 × 0 违规。
- **生成器只能用真正的迁移前源**：`git show HEAD:<path>`。会话中途的 `/tmp` 快照是**部分迁移态**
  （`mountStage` 只剩 58 个 `let`），拿它生成会得到一个 58 字段的**静默截断**上下文。
  且必须**在宿主原位**跑 `--emit-ctx`（它只读宿主、只写上下文模块），否则相对路径会算成
  `../../../tmp/scene/…`。

- 后续：现在四个宿主的状态都能按字段名逐个搬走，「状态同步块」与 `runStudioRenderLoop`
  的每切一刀只需重连 `ctx.x` 名字，不再是重连一堆闭包变量。下一步按
  `stage.ts`（离目标最近）→ `home.ts` → `studio-app.ts` 的顺序开切，目标各 3,000 行。

