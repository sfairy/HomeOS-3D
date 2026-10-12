# Studio source layout

Three stacked systems live under `src/studio/`. Prefer the dependency rules below over deep relative imports.

## Layers

| Layer | Paths (today) | Role |
|-------|---------------|------|
| Entries | `entries/` | studio 子系统自身的路由入口页（`StudioView`/`EditorView`/`DisplayView`）；由 `@/studio` barrel 以懒加载器暴露给根 router |
| Chrome / Engine | `chrome/`, `engine/` | Vue chrome（顶栏/缩放/快捷键）与 facade 总线（根 store ↔ studio facade） |
| Creator | `app/3d-studio/` (+ domain folders under `authoring/{scene,items,lights,ui,plan-tools,…}`) | Floorplan / scene authoring |
| Panel | `app/editor/`, `app/renderer/`, `app/display/` | 2D panel editor, `PanelRenderer`, display boot |
| Platform | `platform/`, leaf `app/bridge/**`, leaf `app/shared/**`（含 `app/shared/util/**`） | 共享适配层 —— **禁止** import editor/renderer/creator |
| Stage | `runtime/` (`config-ui/` preferred over deprecated `editor/`), `shims/` | Live 3D stage + devices；multi-entry via `vite.runtime.config.ts` |

Aliases: `@app` → `app/`, `@runtime` → `runtime/`.

> **根代码只允许 `import ... from '@/studio'`** —— 不得直达 `@app/*`、`@runtime/*` 或 studio 内部路径。
> 由 `scripts/check-studio-deps.mjs` 强制（白名单已清零）。studio 的公开面见 [`index.ts`](./index.ts)。

## Why no `components/` `composables/` `views/` here

studio 是**子系统**，不是应用根。历史上它复用过应用根的通用桶名（`components/`、`composables/`、`views/`、`utils/`），
导致同名不同义、路径无法自解释。现已消除（`ops/studio_layout_kpi.py` 门禁 = 0）：

- 路由入口页 → `entries/`（不再是 `views/`）
- `useLegacyPage` → `platform/`
- `app/utils/` → `app/shared/util/`（并入既有叶子层）
- 认证页与 `SceneStage`/`PasswordField` 等**应用级**件已迁出 studio → `src/views/auth/`、`src/components/common/`
  （P3b-2 起这两件与商店共用一份：壳在 `@homeos/shared/components/*.vue`，本目录只剩 `src/components/common/SceneStage.vue` 这个薄适配层）

新增目录前请自问：这是「子系统内部」还是「应用级」？应用级的不要放进 studio。

## URL-pinned classic entries（勿动）

`app/auth/scene/scene-depth.ts` 看着像「单文件目录」，实则是**经典（非 module）入口桩**：
`index.html` 直接引 `/static/auth/scene/scene-depth.js`，`vite.config.ts` 把它列为 entry。
它只做一件事 —— 副作用 import 真正的实现 `@/studio/platform/scene-depth`（给 `<html>` 挂 `.hos-touch`）。
**路径即公网 URL，不能挪**；同理 `runtime/**` 也不能改名。

`app/logging/` 里的 `global-log-boot.ts` 亦是启动期副作用入口，保持独立。


## Boot entries

| View | Dynamic import | Boot / teardown |
|------|----------------|-----------------|
| `entries/StudioView.vue` | `@app/3d-studio/authoring/lifecycle` | `bootStudio` / `teardownStudio` |
| `entries/EditorView.vue` | `@app/editor/boot` | `bootEditor` / `teardownEditor` |
| `entries/DisplayView.vue` | `@app/display/display*` | `bootDisplay` / `teardownDisplay` |

根 router 通过 `@/studio` 暴露的 `loadStudioView` / `loadEditorView` / `loadDisplayView` 懒加载器挂载这三页
（保持按路由分包，同时不让根直达 studio 内部）。

Shell navigation / chrome: `@/studio/platform/shell-navigation`（经 barrel 暴露）；legacy scope 见 `platform/legacy-scope.ts`。

## Creator domain folders (`app/3d-studio/authoring/`)

| Folder | Contents |
|--------|----------|
| `lifecycle.ts` | Lifecycle re-exports（原 `boot.ts`，改名以避开与 `boot/` 的同名冲突） |
| `boot/` | 引导序列（P4 搬入：`studio-boot.ts` = `startupStudio`（入口判定 → 渲染器 → 拉草稿 → 净化 → 应用 → 挂载舞台 / 开导出面板），15 项依赖按 `StudioBootDeps` 注入） |
| `scene/` | Camera, shadows, overview, motion presentation（P4 搬入：`studio-view-settings.ts` = 场景默认视图/曝光；`studio-scene-payload.ts` = 场景负载净化；`studio-document-payload.ts` = 楼层文档净化；`studio-box-mesh.ts` = 盒子网格构件） |
| `items/` | Furniture / device item helpers（P4 搬入：`item-catalog.ts` = 1909 行类型目录 + 8 个类型集合 + `nextBatchItemTypeSet`；`studio-television-model.ts` = 电视模型构件） |
| `lights/` | Light preset data |
| `ui/` | Widgets, history, pure helpers（P4 搬入：`studio-export-layers.ts` = 导出图层清单渲染 + 导出名净化） |
| `plan/`, `materials/`, `export/` | 平面图 / 材质 / 导出真实体（已建成，`ops/studio_domains_kpi.py` 登记为 `existing`；studio 侧 barrel 待建） |
| `types/` | Shared studio-app types |

**New code must import from domain folders** (`./scene/…`, `./items/…`, …) — do not add flat `studio-*.ts` files here.
原 29 个平铺兼容转发桩已随「去重收尾」整批删除（本目录现只剩 `studio-app.ts` 与 `lifecycle.ts`），引用一律直达域目录。
这条不是口头约定：`ops/studio_domains_kpi.py` 对 `studio/` 的平铺 `.ts` 个数做 ratchet（只减不增），新增平铺件会被门禁拦下。

Parent app layout: see [`../README.md`](../README.md). CI runs `npm run check:deps` (frontend + studio).

## Splitting a monolith (`studio-app.ts` / `home.ts` / `panel-renderer.ts` / `stage.ts`)

**先量再拆**，别按行号猜。工具：`node ops/studio_slice_analyze.mjs <file> [--list|--rank|--seeds=A,B]`（TS 编译器 API，认缩进、认闭包捕获）。

- `--list`：顶层声明 + 巨型宿主函数 + >800 行的函数；`--rank`：按**搬迁成本**给宿主内声明排序（`muts*1000 + outs*100 + sibs*10`）；`--seeds=名1,名2`：算出这几个声明的自由引用与传递闭包。
- `studio-app.ts` / `home.ts` 的真实形状是「一个 `bootX()` 里套一个巨型箭头函数」，声明不在顶层、缩进不统一 —— 所以**不要**按行首缩进切。
- 判据与域归属规则、已落地的切片日志、下一批目标：见 [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md)。

## Panel editor barrels (`app/editor/`)

- `boot.ts` — lifecycle
- `document.ts` / `selection.ts` / `components.ts` — thin facades over `editor-*` modules
- `inspectors/` — flow-line / percentage-bar inspectors (moved out of `shared/`)
- `metadata/` — 导航 / 样式属性元数据表（纯数据）与透视常量（P4 从 `home.ts` 切出）
- `net/` — 编辑器请求面：`requestJson`（超时 / 中止 / CSRF / 401-403 跳转）+ 认证跳转闩（P4 6e 从 `home.ts` 切出；回归见 `scripts/_request_json_smoke.ts`，已进 `verify:smoke:frontend` 与 CI）

## Panel renderer naming

- Prefer `panel-renderer.ts` over deprecated `renderer.ts` re-export
- Prefer `panel-document.ts` / `panel-caches.ts` / `panel-dialog-motion.ts` over `runtime-*.ts` stubs
- **`app/renderer/panel-seams/` 是「面板渲染器方法」域**（P4 7b + 7c 落地）：原 `panel-renderer-bulk-methods.ts`（10.9k 行）按 seam 拆成 12 个文件（`render-component` / `connect-runtime` / `{capability,light,cover,climate,water-heater}-controls` / `{air-purifier,vacuum,presence,entity}-details` / `custom-popup`），宿主文件已删，调用方 `panel-renderer.ts` 显式 import + 一个 `Object.assign` 清单
- **class 方法域同在此目录**（P4 7c 落地）：`panel-renderer.ts` 的 70 个类方法按 seam 搬进 8 个文件（`transform-interaction` / `selection-overlay` / `selection-bounds` / `runtime-refresh` / `details-popups` / `media-camera` / `runtime-dialogs` / `runtime-actions` + `optimistic-state`），7,154 → 1,888 行。形态是「模块侧 `export function name(self: PanelRenderer, …)` + 类侧原地一行转发薄成员」——薄成员留在类里，签名因此仍受同名 interface 合并面的类型检查（漏一个名字 tsc 当场红；这是 7b 删宿主文件时学到的教训）。工具：`ops/studio_slice_extract.mjs --method-form`（`ops/studio_slice_analyze.mjs --rank` 也认类方法）
- 去重收尾把原 `renderer/core/renderer/`（12 个 mixin 刀）与 `renderer/core/renderer/methods/`（8 个类方法刀 + `optimistic-state`）合并压平为单层 `panel-seams/`（21 文件），并把 `renderer/core/*` 整体上提到 `app/renderer/`
- 该目录里 `paint.ts` 仍是 **planned**（那是 `panel-renderer.ts` 自己的绘制 seam，未建）；原 `dialogs.ts` 计划条目已被上面这 12 刀取代、从清单删除。这些都记在 `ops/studio_domains_kpi.py`（planned 建出来不改状态会报错）

## Stage config UI

Prefer `@runtime/config-ui/*`. Deprecated `@runtime/editor/*` paths are pure re-export stubs so served module URLs stay valid.

## Dependency rules (enforced by `npm run check:studio-deps`)

1. `entries` → `engine` → (`creator` \| `panel` \| `display`) → `platform`
2. `stage` (`runtime/`) → `platform` / `@app/bridge` / leaf utils
3. `app/**` must **not** import `runtime/**` (use `@/studio/platform/*`)
4. `app/shared/**` must **not** import `app/editor/**` or `app/renderer/**`
5. `platform/**` is a leaf: no imports of editor, renderer, or 3d-studio
6. **root (non-studio) → studio only via `@/studio`** (no `@app/*`, `@runtime/*`, `@/studio/<inner>`)

Also enforced in ESLint for `app/shared/**` and `platform/**`.

## Runtime multi-entry

Every `runtime/**/*.ts` is a Vite entry served as `/api/v1/modules/interaction3d/<rel>.js`. Do not rename those public paths without updating the runtime manifest and backend allowlist — add compat re-exports instead (see `runtime/editor/` → `runtime/config-ui/`).

## Device naming: two different `light` / `climate` / `cover` / `security` …

`runtime/<device>/` 是 **3D 舞台运行时** —— 把设备状态画进 3D 场景的模块，作为公网模块 URL 提供
（`/api/v1/modules/interaction3d/runtime/<device>/…`），**命名已冻结**。

根应用里的 `features/device` / `features/entity` / `composables/device` / `shared/device` 是
**2D 控制 UI**（设备列表、卡片、弹窗、批量操作）。

两者**同名但语义不同、不可互换、不可互相 import**：

- 舞台侧只依赖 `platform/`、`@app/bridge` 与叶子 utils
- UI 侧只依赖 `@/components`、`@/composables`、`@/stores`、`@/shared` 等
- 根代码**禁止** import `@runtime/*`（由 `scripts/check-studio-deps.mjs` 强制）

改名只在文档层面消歧；物理改名会打断公网 URL，需同步后端 manifest 与 allowlist。

## Monolith baselines

See [`MONOLITH_BASELINE.md`](./MONOLITH_BASELINE.md) for the target list and the "拆到哪去" budget.

```bash
bun run kpi:studio    # 三件套：单体行数 + 域清单/平铺面 + 根↔studio 同名冲突
```

P4 收敛由**两个** KPI 同时管（行数单看会被糊弄 —— 挪进另一个平铺文件、或直接删，都能让行数掉）：

| KPI | 脚本 | 口径 |
|-----|------|------|
| 单体行数 | `ops/studio_monolith_kpi.py` | 6 个编排宿主，只减不增；纯转发桩（假收敛）与低于下限都会硬失败 |
| 域清单 / 平铺面 | `ops/studio_domains_kpi.py` | 域覆盖行数只增不减（17 个 `existing` 域，47688 行）+ 宿主目录平铺 `.ts` 只减不增 + `planned` 条目偷跑报错 |
| 根↔studio 同名冲突 | `ops/studio_layout_kpi.py` | 同名不同义的目录在两侧并存（当前 0） |

目标：`studio-app.ts`（35.2k）/ `home.ts`（23.0k）等编排宿主收到 &lt; 3k 行，代码进域文件夹 —— 不是进新的平铺 `*-foo.ts`。

## Where to edit

| Task | Tree |
|------|------|
| Floorplan / lights / materials authoring | `app/3d-studio/` (`authoring/scene`, `authoring/items`, `authoring/lights`, …) |
| 2D dashboard panels / inspectors | `app/editor/`, `app/renderer/` |
| Live stage device motion / panels | `runtime/<device>/`, `runtime/core/`, `runtime/config-ui/` |
| Vue chrome / workflow steps | `entries/`, `chrome/`, `engine/` |
| Shell bridges / entity role profiles | `platform/` |
