# HomeOS 商店前端目录结构

面向授权商店与运营后台的小型 Vue 应用（80 个源文件）。

## 分层

| 路径 | 职责 |
|------|------|
| `features/storefront/` | 前台商店域：路由页（`views/`）、支付/待支付弹窗（`components/`）、`catalog` / `order` store、域内 `utils` `composables` |
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
