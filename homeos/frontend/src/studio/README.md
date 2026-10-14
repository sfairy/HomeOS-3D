# Studio 源码目录结构

`src/studio/` 下叠放三套系统。优先遵守下述依赖规则，而非深层相对导入。

## 分层

| 层 | 当前路径 | 职责 |
|-------|---------------|------|
| 入口 | `entries/` | studio 子系统自身的路由入口页（`StudioView`/`EditorView`/`DisplayView`）；由 `@/studio` barrel 以懒加载器暴露给根 router |
| 外壳 / 引擎 | `chrome/`, `engine/` | Vue chrome（顶栏/缩放/快捷键）与 facade 总线（根 store ↔ studio facade） |
| 创作 | `app/3d-studio/`（+ `authoring/{scene,items,lights,ui,boot,types}` 下的域文件夹） | 平面图 / 场景创作 |
| 面板 | `app/editor/`, `app/renderer/`, `app/display/` | 2D 面板编辑器、`PanelRenderer`、显示端启动 |
| 平台 | `platform/`、叶子 `app/bridge/**`、叶子 `app/shared/**`（含 `app/shared/util/**`） | 共享适配层 —— **禁止** import editor/renderer/creator |
| 舞台 | `runtime/`（优先 `config-ui/`，而非已废弃的 `editor/`）、`shims/` | 实时 3D 舞台 + 设备；多入口经 `vite.runtime.config.ts` |

别名：`@app` → `app/`，`@runtime` → `runtime/`。

> **根代码只允许 `import ... from '@/studio'`** —— 不得直达 `@app/*`、`@runtime/*` 或 studio 内部路径。
> 由 `scripts/gates/check-studio-deps.mjs` 强制（白名单已清零）。studio 的公开面见 [`index.ts`](./index.ts)。

## 为什么这里没有 `components/` `composables/` `views/`

studio 是**子系统**，不是应用根。历史上它复用过应用根的通用桶名（`components/`、`composables/`、`views/`、`utils/`），
导致同名不同义、路径无法自解释。现已消除（`ops/kpi/studio_layout_kpi.py` 门禁 = 0）：

- 路由入口页 → `entries/`（不再是 `views/`）
- `useLegacyPage` → `platform/`
- `app/utils/` → `app/shared/util/`（并入既有叶子层）
- 认证页与 `SceneStage`/`PasswordField` 等**应用级**件已迁出 studio → `src/views/auth/`、`src/components/common/`
  （P3b-2 起这两件与商店共用一份：壳在 `@homeos/shared/components/*.vue`，本目录只剩 `src/components/common/SceneStage.vue` 这个薄适配层）

新增目录前请自问：这是「子系统内部」还是「应用级」？应用级的不要放进 studio。

## URL 即公网路径的经典入口（勿动）

`app/auth/scene/scene-depth.ts` 看着像「单文件目录」，实则是**经典（非 module）入口桩**：
`index.html` 直接引 `/static/auth/scene/scene-depth.js`，`vite.config.ts` 把它列为 entry。
它只做一件事 —— 副作用 import 真正的实现 `@/studio/platform/scene-depth`（给 `<html>` 挂 `.hos-touch`）。
**路径即公网 URL，不能挪**；同理 `runtime/**` 也不能改名。

`app/logging/` 里的 `global-log-boot.ts` 亦是启动期副作用入口，保持独立。


## 启动入口

| 视图 | 动态 import | 启动 / 销毁 |
|------|----------------|-----------------|
| `entries/StudioView.vue` | `@app/3d-studio/authoring/lifecycle` | `bootStudio` / `teardownStudio` |
| `entries/EditorView.vue` | `@app/editor/boot` | `bootEditor` / `teardownEditor` |
| `entries/DisplayView.vue` | `@app/display/display*` | `bootDisplay` / `teardownDisplay` |

根 router 通过 `@/studio` 暴露的 `loadStudioView` / `loadEditorView` / `loadDisplayView` 懒加载器挂载这三页
（保持按路由分包，同时不让根直达 studio 内部）。

外壳导航 / chrome：`@/studio/platform/shell-navigation`（经 barrel 暴露）；legacy 作用域见 `platform/legacy-scope.ts`。

## 创作域文件夹（`app/3d-studio/authoring/`）

| 文件夹 | 内容 |
|--------|----------|
| `lifecycle.ts` | 生命周期再导出（原 `boot.ts`，改名以避开与 `boot/` 的同名冲突） |
| `boot/` | 引导序列（P4 搬入：`studio-boot.ts` = `startupStudio`（入口判定 → 渲染器 → 拉草稿 → 净化 → 应用 → 挂载舞台 / 开导出面板），15 项依赖按 `StudioBootDeps` 注入） |
| `scene/` | 相机、阴影、总览、运动呈现（P4 搬入：`studio-view-settings.ts` = 场景默认视图/曝光；`studio-scene-payload.ts` = 场景负载净化；`studio-document-payload.ts` = 楼层文档净化；`studio-box-mesh.ts` = 盒子网格构件） |
| `items/` | 家具 / 设备物件助手（P4 搬入：`item-catalog.ts` = 1909 行类型目录 + 8 个类型集合 + `nextBatchItemTypeSet`；`studio-television-model.ts` = 电视模型构件） |
| `lights/` | 灯光预设数据 |
| `ui/` | 微件、历史、纯函数助手（P4 搬入：`studio-export-layers.ts` = 导出图层清单渲染 + 导出名净化） |
| `types/` | 共享的 studio-app 类型 |

`authoring/` 之外，`app/3d-studio/` 顶层还有一批同级的创作域（`ops/kpi/studio_domains_kpi.py` 均登记为 `existing`）：

| 文件夹 | 内容 |
|--------|----------|
| `plan/` | 平面图真实体（studio 侧 barrel 待建） |
| `materials/` | 材质真实体（studio 侧 barrel 待建） |
| `export/` | 导出真实体（studio 侧 barrel 待建） |
| `loaders/` | 模型加载 |
| `reflection/` | 倒影/反射呈现 |

**新代码必须从域文件夹 import**（`./scene/…`、`./items/…` …）—— 不要在这里新增平铺的 `studio-*.ts` 文件。
原 29 个平铺兼容转发桩已随「去重收尾」整批删除（本目录现只剩 `studio-app.ts` 与 `lifecycle.ts`），引用一律直达域目录。
这条不是口头约定：`ops/kpi/studio_domains_kpi.py` 对 `studio/` 的平铺 `.ts` 个数做 ratchet（只减不增），新增平铺件会被门禁拦下。

父应用目录结构见 [`../README.md`](../README.md)。CI 会跑 `npm run check:deps`（frontend + studio）。

## 拆分单体（`studio-app.ts` / `home.ts` / `panel-renderer.ts` / `stage.ts`）

> **⚠️ 切片工具已退役，流程暂停。** 原来「先量再拆」用的 `ops/studio/studio_slice_analyze.mjs`
> （`--list|--rank|--seeds`）、`studio_slice_extract.mjs`、`studio_slice_wrap.mjs`、
> `restore_import_formatting.mjs` 与它们的自检已随脚本体系清理整体移除，`slice:studio*` 脚本别名也已删除。
> 下面这段是从前的工作流记录；要恢复拆分需先重建这些工具（口径见 [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md)）。
> 目前仍生效的是 KPI 门禁 `bun run kpi:studio` 与宿主薄绑定门禁 `scripts/gates/check-host-bindings.mjs`。

**先量再拆**，别按行号猜。工具（已移除）：`node ops/studio/studio_slice_analyze.mjs <file> [--list|--rank|--seeds=A,B]`（TS 编译器 API，认缩进、认闭包捕获）。

- `--list`：顶层声明 + 巨型宿主函数 + >800 行的函数；`--rank`：按**搬迁成本**给宿主内声明排序（`muts*1000 + outs*100 + sibs*10`）；`--seeds=名1,名2`：算出这几个声明的自由引用与传递闭包。
- `studio-app.ts` / `home.ts` 的真实形状是「一个 `bootX()` 里套一个巨型箭头函数」，声明不在顶层、缩进不统一 —— 所以**不要**按行首缩进切。
- 判据与域归属规则、已落地的切片日志、下一批目标：见 [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md)。

## 面板编辑器 / 渲染器域（`app/editor/`、`app/renderer/`）

`app/editor/` 顶层保留少量宿主与 `editor-*.ts` / `home-*.ts` 装配件，域文件夹如下（`ops/kpi/studio_domains_kpi.py` 登记）：

- `bindings/` — 宿主 DOM 事件注册（语句级切片：依赖按 getter 惰性注入）
- `controls/` — 检查器表单控件（数字输入 ± 步进器增强）
- `copy-backup/` — 备份 / 复制对话框装配与执行（声明级切片）
- `inspectors/` — 流程线 / 百分比条检查器（从 `shared/` 搬出）
- `menus/` — 标题按钮图标菜单（定位 / 悬停滚动 / 图标选项装载）
- `metadata/` — 导航 / 样式属性元数据表（纯数据）与透视常量（P4 从 `home.ts` 切出）
- `navigation-style-apply/` — 导航「套用到其它控件」弹窗
- `net/` — 编辑器请求面：`requestJson`（超时 / 中止 / CSRF / 401-403 跳转）+ 认证跳转闩（P4 6e 从 `home.ts` 切出；回归见 `scripts/smoke/_request_json_smoke.ts`，已进 `verify:smoke:frontend` 与 CI）
- `picker/` — 取数弹层
- `selection/` — 选中组件方向键微调（nudge）
- `boot.ts` — 生命周期

`app/renderer/` 的域文件夹：`controls/`（控件渲染）、`flow-line/`（流线绘制）、`geometry/`（几何计算）、`registry/`（组件注册表）、`panel-seams/`（见下）。`app/editor` 侧的 `document.ts` / `selection.ts` / `components.ts` 等薄 facade 已并入上方域文件夹或上提为顶层文件。

## 面板渲染器命名

- 优先 `panel-renderer.ts`，而非已废弃的 `renderer.ts` 再导出
- 优先 `panel-document.ts` / `panel-caches.ts` / `panel-dialog-motion.ts`，而非 `runtime-*.ts` 桩
- **`app/renderer/panel-seams/` 是「面板渲染器方法」域**（P4 7b + 7c 落地）：原 `panel-renderer-bulk-methods.ts`（10.9k 行）按 seam 拆成 12 个文件（`render-component` / `connect-runtime` / `{capability,light,cover,climate,water-heater}-controls` / `{air-purifier,vacuum,presence,entity}-details` / `custom-popup`），宿主文件已删，调用方 `panel-renderer.ts` 显式 import + 一个 `Object.assign` 清单
- **class 方法域同在此目录**（P4 7c 落地）：`panel-renderer.ts` 的 70 个类方法按 seam 搬进 8 个文件（`transform-interaction` / `selection-overlay` / `selection-bounds` / `runtime-refresh` / `details-popups` / `media-camera` / `runtime-dialogs` / `runtime-actions` + `optimistic-state`），7,154 → 1,888 行。形态是「模块侧 `export function name(self: PanelRenderer, …)` + 类侧原地一行转发薄成员」——薄成员留在类里，签名因此仍受同名 interface 合并面的类型检查（漏一个名字 tsc 当场红；这是 7b 删宿主文件时学到的教训）。工具：`ops/studio/studio_slice_extract.mjs --method-form`（`ops/studio/studio_slice_analyze.mjs --rank` 也认类方法）—— **两者均已随工具链退役移除**
- 去重收尾把原 `renderer/core/renderer/`（12 个 mixin 刀）与 `renderer/core/renderer/methods/`（8 个类方法刀 + `optimistic-state`）合并压平为单层 `panel-seams/`（21 文件），并把 `renderer/core/*` 整体上提到 `app/renderer/`
- 该目录里 `paint.ts` 仍是 **planned**（那是 `panel-renderer.ts` 自己的绘制 seam，未建）；原 `dialogs.ts` 计划条目已被上面这 12 刀取代、从清单删除。这些都记在 `ops/kpi/studio_domains_kpi.py`（planned 建出来不改状态会报错）

## 舞台配置 UI

优先 `@runtime/config-ui/*`。已废弃的 `@runtime/editor/*` 路径是纯再导出桩，以保证已投放的模块 URL 仍然有效。

## 依赖规则（由 `npm run check:studio-deps` 强制）

1. `entries` → `engine` → (`creator` \| `panel` \| `display`) → `platform`
2. `stage`（`runtime/`）→ `platform` / `@app/bridge` / 叶子 utils
3. `app/**` **不得** import `runtime/**`（改用 `@/studio/platform/*`）
4. `app/shared/**` **不得** import `app/editor/**` 或 `app/renderer/**`
5. `platform/**` 是叶子：不得 import editor、renderer 或 3d-studio
6. **根（非 studio）→ studio 只能经 `@/studio`**（禁止 `@app/*`、`@runtime/*`、`@/studio/<内部路径>`）

ESLint 对 `app/shared/**` 与 `platform/**` 亦有同等强制。

## Runtime 多入口

每个 `runtime/**/*.ts` 都是一个 Vite 入口，以 `/api/v1/modules/interaction3d/<rel>.js` 投放。未经同步更新 runtime manifest 与后端白名单，不要重命名这些公网路径 —— 改用兼容再导出（参见 `runtime/editor/` → `runtime/config-ui/`）。

## 设备命名：两套不同的 `light` / `climate` / `cover` / `security` …

`runtime/<device>/` 是 **3D 舞台运行时** —— 把设备状态画进 3D 场景的模块，作为公网模块 URL 提供
（`/api/v1/modules/interaction3d/runtime/<device>/…`），**命名已冻结**。

根应用里的 `features/device` / `features/entity` / `composables/device` / `shared/device` 是
**2D 控制 UI**（设备列表、卡片、弹窗、批量操作）。

两者**同名但语义不同、不可互换、不可互相 import**：

- 舞台侧只依赖 `platform/`、`@app/bridge` 与叶子 utils
- UI 侧只依赖 `@/components`、`@/composables`、`@/stores`、`@/shared` 等
- 根代码**禁止** import `@runtime/*`（由 `scripts/gates/check-studio-deps.mjs` 强制）

改名只在文档层面消歧；物理改名会打断公网 URL，需同步后端 manifest 与 allowlist。

## 单体基线

目标清单与「拆到哪去」的预算见 [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md)。

```bash
bun run kpi:studio    # 三件套：单体行数 + 域清单/平铺面 + 根↔studio 同名冲突
```

P4 收敛由**两个** KPI 同时管（行数单看会被糊弄 —— 挪进另一个平铺文件、或直接删，都能让行数掉）：

| KPI | 脚本 | 口径 |
|-----|------|------|
| 单体行数 | `ops/kpi/studio_monolith_kpi.py` | 5 个编排宿主，只减不增；纯转发桩（假收敛）与低于下限都会硬失败 |
| 域清单 / 平铺面 | `ops/kpi/studio_domains_kpi.py` | 域覆盖行数只增不减（27 个 `existing` 域，88141 行；基线 87934）+ 宿主目录平铺 `.ts` 只减不增 + `planned` 条目偷跑报错 |
| 根↔studio 同名冲突 | `ops/kpi/studio_layout_kpi.py` | 同名不同义的目录在两侧并存（当前 0） |

目标：`studio-app.ts`（20.7k）/ `home.ts`（17.0k）等编排宿主收到 &lt; 3k 行，代码进域文件夹 —— 不是进新的平铺 `*-foo.ts`。

## 该改哪里

| 任务 | 目录 |
|------|------|
| 平面图 / 灯光 / 材质创作 | `app/3d-studio/` (`authoring/scene`, `authoring/items`, `authoring/lights`, …) |
| 2D 仪表盘面板 / 检查器 | `app/editor/`, `app/renderer/` |
| 实时舞台设备动效 / 面板 | `runtime/<device>/`, `runtime/core/`, `runtime/config-ui/` |
| Vue chrome / 工作流步骤 | `entries/`, `chrome/`, `engine/` |
| 外壳桥接 / 实体角色档案 | `platform/` |
