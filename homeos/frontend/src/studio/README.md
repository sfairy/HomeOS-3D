# Studio 源码目录

`src/studio/` 是**子系统**，不是应用根：三套系统叠在一起（3D 创作 / 2D 面板 / 实时舞台）。
优先遵守下述依赖规则，而不是深层相对导入。

## 1. 分层

| 层 | 当前路径 | 职责 |
| --- | --- | --- |
| 入口 | `entries/` | 子系统自身的路由入口页（`StudioView` / `EditorView` / `DisplayView`），由 `@/studio` barrel 以懒加载器暴露给根 router |
| 外壳 / 引擎 | `chrome/`, `engine/` | Vue chrome（顶栏 / 缩放 / 快捷键）与 facade 总线（根 store ↔ studio facade） |
| 创作 | `app/3d-studio/`（+ `authoring/{scene,items,lights,ui,boot,types}` 域文件夹） | 平面图 / 场景创作 |
| 面板 | `app/editor/`, `app/renderer/`, `app/display/` | 2D 面板编辑器、`PanelRenderer`、显示端启动 |
| 平台 | `platform/`、叶子 `app/bridge/**`、叶子 `app/shared/**`（含 `app/shared/util/**`） | 共享适配层 —— **禁止** import editor / renderer / creator |
| 舞台 | `runtime/`（配置编辑器在 `config-ui/`）、`shims/` | 实时 3D 舞台 + 设备；多入口经 `vite.runtime.config.ts` |

别名：`@app` → `app/`，`@runtime` → `runtime/`。

> **根代码只允许 `import ... from '@/studio'`** —— 不得直达 `@app/*`、`@runtime/*` 或 studio
> 内部路径。强制点是 `check:frontend-deps` 的规则 6 与 ESLint；公开面见 [`index.ts`](./index.ts)
> （页面资源清单、facade 引擎、shell 导航、三个路由懒加载器）。新增导出前先自问：这是「子系统
> 对外契约」还是「内部实现细节」？后者不加。

## 2. 为什么这里没有 `components/` `composables/` `views/`

studio 是子系统，不复用应用根的通用桶名，避免同名不同义、路径无法自解释：

- 路由入口页 → `entries/`
- 经典脚本加载 → `platform/`
- 叶子工具 → `app/shared/util/`
- 认证页与 `SceneStage` / `PasswordField` 等**应用级**件位于 `src/views/auth/`、`src/components/common/`
  以及 `src/shared/components/auth/`（壳在 `@homeos/shared/components/*.vue`）

新增目录前先自问：这是「子系统内部」还是「应用级」？应用级的不要放进 studio。

## 3. URL 即公网路径的经典入口（勿动）

`app/auth/scene/scene-depth.ts` 看着像「单文件目录」，实则是**经典（非 module）入口桩**：
`index.html` 直接引 `/static/auth/scene/scene-depth.js`，`vite.config.ts` 把它列为 entry。
它只做一件事 —— 副作用 import 真正的实现 `@/studio/platform/scene-depth`（给 `<html>` 挂 `.hos-touch`）。
**路径即公网 URL，不能挪**；同理 `runtime/**` 也不能改名。

`app/logging/` 里的 `global-log-boot.ts` 亦是启动期副作用入口，保持独立。

## 4. 启动入口

| 视图 | 动态 import | 启动 / 销毁 |
| --- | --- | --- |
| `entries/StudioView.vue` | `@app/3d-studio/authoring/lifecycle` | `bootStudio` / `teardownStudio` |
| `entries/EditorView.vue` | `@app/editor/boot` | `bootEditor` / `teardownEditor` |
| `entries/DisplayView.vue` | `@app/display/display*` | `bootDisplay` / `teardownDisplay` |

根 router 通过 `@/studio` 的 `loadStudioView` / `loadEditorView` / `loadDisplayView` 懒加载这三页
（保持按路由分包，同时不让根直达 studio 内部）。外壳导航 / chrome 经
`@/studio/platform/shell-navigation` 暴露；legacy 作用域见 `platform/legacy-scope.ts`。

## 5. 创作域（`app/3d-studio/authoring/`）

| 路径 | 内容 |
| --- | --- |
| `lifecycle.ts` | 生命周期再导出（原 `boot.ts`，改名避开与 `boot/` 同名） |
| `boot/studio-boot.ts` | 引导序列 `startupStudio`（入口判定 → 渲染器 → 拉草稿 → 净化 → 应用 → 挂载舞台 / 开导出面板），依赖按 `StudioBootDeps` 注入 |
| `scene/` | 相机、阴影、总览、运动呈现、场景 / 楼层文档净化、遮挡与缓存（`studio-view-settings`、`studio-scene-payload`、`studio-document-payload`、`studio-box-mesh`） |
| `items/` | 家具 / 设备物件助手（`item-catalog`、各品类模型构件、`studio-item-model.ts` 入口）与 `item-model/` 分派族（14 族 / 59 类型分支，见 [`item-model/README.md`](./app/3d-studio/authoring/items/item-model/README.md)） |
| `lights/` | 灯光预设数据 |
| `ui/` | 微件、历史、纯函数助手（如 `studio-export-layers`） |
| `types/` | 共享的 studio-app 类型 |
| `studio-app/` | 拆分后的闭包函数域（`functions/groups/`、`render/`、`scene/`、`ui/`、`runtime/`、`materials/`）与两个 context 类型 |

`authoring/` 之外，`app/3d-studio/` 顶层还有一批同级创作域：
`plan/`（平面图真实体）、`materials/`、`export/`、`loaders/`（模型加载）、`reflection/`（反射呈现）、
`cache/`（几何 / 场景 / 模型三张持久化缓存的实现与共用内核 `cache-shared`，外加 `model-template-codec`）。

**新代码必须从域文件夹 import**（`./scene/…`、`./items/…` …）—— 不要新增平铺的 `studio-*.ts`。
平铺兼容转发桩已整批删除，`authoring/` 现只剩 `studio-app.ts`、`lifecycle.ts` 与少量仍属顶层的构件。

## 6. 面板编辑器 / 渲染器（`app/editor/`、`app/renderer/`）

`app/editor/` 顶层保留少量宿主与 `editor-*.ts` / `home-*.ts` 装配件，域文件夹：

| 文件夹 | 内容 |
| --- | --- |
| `bindings/` | 宿主 DOM 事件注册（语句级切片：依赖按 getter 惰性注入） |
| `controls/` | 检查器表单控件（数字输入 ± 步进器增强） |
| `copy-backup/` | 备份 / 复制对话框装配与执行 |
| `inspectors/` | 检查器域：`basic.ts`（`setInspectorToggle` / `inspectorComponentMetrics` 等共用原语）、`home/`（11 个 `home-*` 面板检查器：空调 / 摄像头 / 窗帘电机 / 图标按钮 / 灯光统计 / 折线图 / 导航 / 时间 / 标题按钮 / 扫地机地图 / 天气）、`flow-line` / `percentage-bar` 两个独立检查器 |
| `menus/` | 标题按钮图标菜单（定位 / 悬停滚动 / 图标选项装载） |
| `metadata/` | 导航 / 样式属性元数据表（纯数据）与透视常量 |
| `navigation-style-apply/` | 导航「套用到其它控件」弹窗 |
| `net/` | 编辑器请求面：`requestJson`（超时 / 中止 / CSRF / 401-403 跳转）+ 认证跳转闩 |
| `picker/` | 取数弹层 |
| `selection/` | 选中组件方向键微调 |
| `home/` | `bootEditor` 拆出的域（`editor-context.ts`、`elements/`、`functions/`） |
| `boot.ts` | 生命周期 |

`app/renderer/` 的域文件夹：`controls/`（控件渲染）、`flow-line/`（流线绘制）、`geometry/`（几何计算）、
`registry/`（组件注册表）、`panel-seams/`（见下）。

## 7. 面板渲染器命名与 seam

- 使用 `panel-renderer.ts`，不要再导出 `renderer.ts`
- 使用 `panel-document.ts` / `panel-caches.ts` / `panel-dialog-motion.ts`，不要用 `runtime-*.ts` 桩
- **`app/renderer/panel-seams/` 是「面板渲染器方法」域**：按 seam 拆成 21 个文件，
  调用方 `panel-renderer.ts` 显式 import + 一个 `Object.assign` 清单
- **class 方法域同在此目录**：`panel-renderer.ts` 的类方法按 seam 分布在
  `transform-interaction` / `selection-overlay` / `selection-bounds` / `runtime-refresh` /
  `details-popups` / `media-camera` / `runtime-dialogs` / `runtime-actions` / `optimistic-state`
  等文件。形态是「模块侧 `export function name(self: PanelRenderer, …)` + 类侧原地一行转发薄成员」——
  薄成员留在类里，签名因此仍受同名 interface 合并面的类型检查（漏一个名字 tsc 当场报错）
- `paint.ts`（`panel-renderer.ts` 自己的绘制 seam）尚未建立

## 8. 舞台配置 UI

配置编辑器统一使用 `@runtime/config-ui/*`。

## 9. 依赖规则（约定 + 门禁）

1. `entries` → `engine` → (`creator` | `panel` | `display`) → `platform`
2. `stage`（`runtime/`）→ `platform` / `@app/bridge` / 叶子 utils
3. `app/**` **不得** import `runtime/**`（改用 `@/studio/platform/*`）
4. `app/shared/**` **不得** import `app/editor/**` 或 `app/renderer/**`
5. `platform/**` 是叶子：不得 import editor、renderer 或 3d-studio
6. **根（非 studio）→ studio 只能经 `@/studio`**（禁止 `@app/*`、`@runtime/*`、`@/studio/<内部路径>`）

ESLint 对 `app/shared/**` 与 `platform/**` 亦有同等强制；规则 6 由
`bun run check:frontend-deps` 在 CI 兜底。

## 10. Runtime 多入口

每个 `runtime/**/*.ts` 都是一个 Vite 入口，以 `/api/v1/modules/interaction3d/<rel>.js` 投放。
未经同步更新 runtime manifest 与后端白名单，不要重命名这些公网路径；确需重命名时同步改掉所有
调用方，**不要留兼容再导出**。

## 11. 设备命名：两套不同的 `light` / `climate` / `cover` / `security` …

`runtime/<device>/` 是 **3D 舞台运行时** —— 把设备状态画进 3D 场景的模块，作为公网模块 URL 提供
（`/api/v1/modules/interaction3d/runtime/<device>/…`），**命名已冻结**。

根应用里的 `features/device` / `components/entities` / `composables/device` / `shared/device` 是
**2D 控制 UI**（设备列表、卡片、弹窗、批量操作）。

两者**同名但语义不同、不可互换、不可互相 import**：舞台侧只依赖 `platform/`、`@app/bridge` 与叶子
utils；UI 侧只依赖 `@/components`、`@/composables`、`@/stores`、`@/shared` 等。改名只在文档层面
消歧；物理改名会打断公网 URL，需同步后端 manifest 与 allowlist。

`studio-app.ts` / `home.ts` 的拆分目标：编排宿主变小，代码进**域文件夹**，不要新增平铺的
`*-foo.ts`。`items/item-model/` 是模板（分支按原链顺序进族，顺序不可重排）；改动后跑
`bun run check:studio-split`，门禁不全绿不得继续。

## 12. 该改哪里

| 任务 | 目录 |
| --- | --- |
| 平面图 / 灯光 / 材质创作 | `app/3d-studio/`（`authoring/scene`、`authoring/items`、`authoring/lights`、`plan/`、`materials/`） |
| 2D 仪表盘面板 / 检查器 | `app/editor/`、`app/renderer/`（含 `panel-seams/`） |
| 实时舞台设备动效 / 面板 | `runtime/<device>/`、`runtime/core/`、`runtime/config-ui/` |
| Vue chrome / 工作流步骤 | `entries/`、`chrome/`、`engine/` |
| 外壳桥接 / 实体角色档案 | `platform/` |

> 最后核对：2026-10-28（链接、命令与路径已逐条验证；体积类结论给 `wc -l` 而不写死行数）
