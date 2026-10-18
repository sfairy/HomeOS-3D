# HomeOS 商店前端目录结构

面向授权商店与运营后台的小型 Vue 应用（94 个源文件）。

## 分层

| 路径 | 职责 |
|------|------|
| `features/storefront/` | 前台商店域：路由页（`views/`）、支付/待支付弹窗（`components/`）、首页区块（`components/home/`）、`catalog` / `order` store、首页文案与聚合（`content/home.ts` / `composables/useHomeView.ts`）、域内 `utils` |
| `features/admin/` | 运营后台域：15 个面板（`views/`，含 `views/settings/`）、表格与弹窗子块（`components/`）、4 个 store（`admin` / `adminDialogs` / `adminRefresh` / `featureCatalog`）、`useAdminTabs` |
| `shared/` | 跨域 + 宿主级：HTTP 客户端与错误口径（`api/` 的 `http.ts` / `error.ts`）、共享领域类型（`types/store.ts`）、两套 toast/confirm store、共享 UI（`SceneStage` / `DeckTiles` / `AdminToastHost` / `ConfirmDialog`）、纯函数（`utils/`）、场景壳助手（`scene/`） |
| `router/` | 路由表与后台闸门（组合根） |
| `views/SetupView.vue` | 首次初始化页（宿主级页面，与 `App.vue` / `main.ts` 同层） |
| `App.vue` / `main.ts` / `auth-bootstrap.ts` | 宿主外壳与入口 |

每个域有**域根 barrel**（`features/<域>/index.ts`）：跨域只允许 `import … from "@store/features/<域>"`，
域内细节不外借。域内仍按 `views / components / stores / composables / utils` 分开，
**非视图文件不得 import 本域 `views/**`**。

## 导入

优先使用 `@store/…` 别名（见 `frontend/vite.config.ts` / 根 `tsconfig.json`），而非深层相对路径 `../../`；
同目录内用 `./`。别名在构建期前缀匹配到 `frontend/src`，所以 `@store/shared/utils/money` 就是 `src/shared/utils/money.ts`。
`.vue` 目标必须带扩展名（Vite 的默认 `resolve.extensions` 不含 `.vue`）。

## 样式

静态样式在 `frontend/public/static/`，`index.html` 的加载顺序是硬约束：
`store-critical.css` → `theme.css` → `scene/*.css` → `store-shell.css` → `store.css` → `store-home.css`（仅首页）。
同优先级选择器后加载者赢，插错位置不会报错，只会静默套错样式；`ops/ci/build_frontend_verify.sh` 会断言
`store.css` 早于 `store-home.css`。`admin.css` 由 `App.vue` 在后台路由下动态注入，必须晚于 `theme.css`。

- 颜色令牌（`--hb-*`）不重命名、不删除：后台配色覆盖（`store-appearance.css`）按名字注入。
- 尺度令牌（`--hb-space-*` / `--hb-text-*` / `--hb-leading-*` / `--hb-dur-*`）与共享原语
  （`.hb-panel` / `.hb-chip` / `.hb-stat` / `.hb-grid` / `.hb-divider` / `.hb-badge`）统一在 `theme.css` 维护。
- 首页专属样式只在 `store-home.css`（统一 `hm-` 前缀）；`store.css` 保留跨页组件（页头、商品、结算、账号、邀请）。
- 首页名称 / 价格 / 包含模块一律取接口，文案与兜底集中在 `features/storefront/content/home.ts`。

## 首页结构（`data-store-page="home"`）

首页按**购买决策**排列（钱 → 能力 → 模块 → 部署 → 保障），不再按功能目录排列。
`HomeView.vue` 只做组合，七幕各自取 `useHomeView()` 的视图模型：

| 幕 | 组件 | 锚点 | 版式 |
|---|---|---|---|
| 首屏 | `HomeHero.vue` + `HomeStageDemo.vue` | — | 左文案右舞台；等距户型渲染图（`/store-static/media/stage-plan.jpg`）作底，设备锚点按百分比落位，状态坞浮在图下方 |
| 授权 | `HomePricing.vue` | `#home-tiers` | 左侧标题，右侧三档比价，推荐档只加描边 |
| 能力 | `HomeCapabilityIndex.vue` | `#home-capability` | 六域图标格，点中后在下方展开 |
| 模块 | `HomeModuleBoard.vue` | `#home-modules` | 可购卡 + 含于全功能版的图标墙 |
| 部署 | `HomeSetup.vue` | `#home-journey` | 三步横排，终端通栏放在步骤下面 |
| 保障 | `HomeTrust.vue` | `#home-assurance` | 四格 + FAQ |
| 收尾 | `HomeCta.vue` | — | 通栏一条，起价与两个按钮 |

**锚点契约**：`StoreLayout.vue` 的顶栏与页脚直接写死 `#home-tiers` / `#home-capability` /
`#home-modules` / `#home-journey` / `#home-assurance`。改区块组件可以，改 id 必须同步改布局页与页脚。

**数据口径**：`useHomeView()` 一处聚合 —— `startingPrice`（在售主授权最低价，无商品时不渲染）、
`tiers`（按价格升序，`package` 档设为推荐）、`moduleGroups`（有增量商品的进 `purchasable`）、
`stage`（首屏单画面）。`content/home.ts` 只放接口给不出的东西：
能力怎么分组、模块怎么讲人话、部署怎么拆步、FAQ 怎么答。

**异步对齐**：首屏不再放异步甲板（`DeckTiles`）。`HomeView.vue` 监听 `catalog.loaded`，
目录到位后按 `route.hash` 再对齐一次，避免从别的页面点「授权对比」时锚点落空。
`DeckTiles` 仍服务登录页 / 初始化页 / 后台。

## 依赖规则（约定；自定义门禁已拆除）

仍建议遵守：

- **R1** `shared/**` 不得回头依赖 `features/**`（shared 是 DAG 的底）；
- **R2** `shared/**` 与 `features/**` 不得依赖组合根（`router/**`、`views/**`、`App.vue`、`main.ts`、`auth-bootstrap.ts`）；
- **R3** 域到域只允许走域根 barrel（`@store/features/<域>`），禁跨域深引用；
- **R4** 域内非视图文件不得 import 本域 `views/**`（域根 barrel 与宿主除外）；
- **R5** 域内 `utils/**` 不得 import 同域 `stores/` `components/` `composables/`。

宿主（路由表 / 顶层 views / 入口）可以向下引用任何层；其中**懒加载**路由组件允许深引用域内
`views/*.vue`（经 barrel 转出会把所有路由页并进同一个 chunk，毁掉路由级分包）。

CI 仅保留 `typecheck` / `lint:ci` / `ruff` / 构建等语言级检查。

> 注意：商店前端**没有**自己的 `package.json`，构建脚本由 `homeos-store/package.json` 驱动
> （`vite --config frontend/vite.config.ts`）。
