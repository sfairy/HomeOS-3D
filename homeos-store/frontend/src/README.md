# 商店前端（授权商店 + 运营后台）

小型 Vue 应用，两个域 + 一个宿主层。**本文件是商店前端约定的唯一真源**：
`homeos-store/backend/src/README.md` 不再重复样式顺序与令牌规则，只指过来。

## 1. 分层

| 路径 | 职责 |
| --- | --- |
| `features/storefront/` | 前台商店域：路由页（`views/`）、支付 / 待支付弹窗（`components/`）、首页七幕（`components/home/`）、`catalog` / `order` store、首页文案与聚合（`content/home.ts` / `composables/useHomeView.ts`）、域内 `utils` |
| `features/admin/` | 运营后台域：14 个面板按业务对象分四簇（`views/catalog` 商品与权益、`views/settlement` 订单与结算、`views/accounts` 账号与授权、`views/ops` 概览/审计/诊断/设置含 `ops/settings/`）、宿主布局（`layouts/AdminLayout.vue`）、表格与弹窗子块（`components/`）、4 个 store（`admin` / `adminDialogs` / `adminRefresh` / `featureCatalog`）、`useAdminTabs` |
| `shared/` | 跨域 + 宿主级：HTTP 客户端与错误口径（`api/http.ts` / `api/error.ts`）、共享领域类型（`types/store.ts`）、四个 pinia store（`session` / `site` / `toast` / `confirm`）、共享 UI（`SceneStage` / `DeckTiles` / `AdminToastHost` / `ConfirmDialog`）、纯函数（`utils/`）、场景壳助手（`scene/`） |
| `router/` | 路由表与后台闸门（组合根） |
| `views/SetupView.vue` | 首次初始化页（宿主级页面，与 `App.vue` / `main.ts` 同层） |
| `App.vue` / `main.ts` / `auth-bootstrap.ts` | 宿主外壳与入口 |

每个域有**域根 barrel**（`features/<域>/index.ts`）：跨域只允许
`import … from "@store/features/<域>"`，域内细节不外借。域内仍按
`views / components / stores / composables / utils` 分开，**非视图文件不得 import 本域 `views/**`**。

## 2. 导入

优先使用 `@store/…` 别名（见 `frontend/vite.config.ts` / 根 `tsconfig.json`），而非深层相对
路径 `../../`；同目录内用 `./`。别名在构建期前缀匹配到 `frontend/src`，所以
`@store/shared/utils/money` 就是 `src/shared/utils/money.ts`。`.vue` 目标必须带扩展名
（Vite 的默认 `resolve.extensions` 不含 `.vue`）。

> 边界门禁跑的是主应用的脚本：`--root homeos-store/frontend/src --alias '@store/='`。
> **别名必须显式传**，否则所有 `@store/...` 都会被当成外部包静默放行，跑出假的「0 violation」。
> 根命令 `bun run check:frontend-deps` 已经连跑两棵树。

## 3. 样式（顺序是硬约束）

样式入口全在 `frontend/index.html`，实际顺序（以该文件为准）：

```text
/src/styles/design-tokens.css            ← packages/shared 的 canonical 令牌（最先）
内联首屏骨架                              ← 与 public/static/store-critical.css 同源
/store-static/theme.css                  ← 唯一阻塞的业务样式表（--hb-* 定义处）
/store-static/font.min.css               ┐
/store-static/scene/{fonts,page,scene,panel}.css │ media=print 先下载，齐了再一次切 all
/store-static/store-shell.css            │
/store-static/store.css                  │
/store-static/store-home.css（仅首页）    ┘
/src/styles/touch-a11y.css               ← 必须在业务样式之后
/store-appearance.css                    ← 后端填进 <!--{{APPEARANCE}}-->，必须最后
```

同优先级选择器**后加载者赢**，插错位置不会报错，只会静默套错样式。
`ops/ci/build_frontend_verify.sh` 会断言产物里 `store.css` 早于 `store-home.css`。
`admin.css` 由 `App.vue` 在后台路由下动态注入，**必须晚于 `theme.css`**。

**揭幕策略**：8 张 `data-defer-style` 表 **全部到位（或 8s 硬上限）后同一个任务里一次性切
`media=all`**，再置 `html[data-styles-ready]`。不要改成「每张 load 就单独切」—— 那会各触发一次
样式重算 + 重画，慢机型上肉眼可见地一步步变形。

- **颜色令牌**（`--hb-*`）**不重命名、不删除**：后台配色覆盖（`/store-appearance.css`）按名字注入。
  令牌名的生成侧（`src/scene/appearance.ts`）与校验侧（`backend/src/ops/appearance.py` 的
  `_TOKEN_NAME` / `_TOKEN_NAME_EXTRA`）必须对齐 —— 前端生成得出来、后端不认，管理员保存配色
  就会被 422 挡掉。
- **尺度令牌**（`--hb-space-*` / `--hb-text-*` / `--hb-leading-*` / `--hb-dur-*`）与共享原语
  （`.hb-panel` / `.hb-chip` / `.hb-stat` / `.hb-grid` / `.hb-divider` / `.hb-badge`）统一在
  `theme.css` 维护。
- **首页专属样式只在 `store-home.css`**（统一 `hm-` 前缀）；`store.css` 保留跨页组件
  （页头、商品、结算、账号、邀请）。
- 首页名称 / 价格 / 包含模块一律取接口，文案与兜底集中在 `features/storefront/content/home.ts`。

## 4. 首页（`data-store-page="home"`）

`HomeView.vue` 只做组合：七幕（首屏 / 授权 / 能力 / 模块 / 部署 / 保障 / 收尾）各自取
`useHomeView()` 的视图模型。**锚点契约**：`StoreLayout.vue` 的顶栏与页脚写死
`#home-tiers` / `#home-capability` / `#home-modules` / `#home-journey` / `#home-assurance`，
改区块组件可以，改 id 必须同步改布局页与页脚。`HomeView.vue` 还监听 `catalog.loaded`，目录到位后
按 `route.hash` 再对齐一次（从别的页面点「授权对比」时锚点才不会落空）。

**数据口径**：`useHomeView()` 一处聚合（`startingPrice` / `tiers` / `moduleGroups` / `stage`）；
`content/home.ts` 只放接口给不出的东西（能力怎么分组、模块怎么讲人话、部署怎么拆步、FAQ 怎么答）。
首页文案与版式属于产品层，改版直接改组件，不要回来同步本文件。

## 5. 依赖规则

自定义门禁已拆除，以下靠评审与 `check:frontend-deps` 维持：

- **R1** `shared/**` 不得回头依赖 `features/**`（shared 是 DAG 的底）；
- **R2** `shared/**` 与 `features/**` 不得依赖组合根（`router/**`、`views/**`、`App.vue`、
  `main.ts`、`auth-bootstrap.ts`）；
- **R3** 域到域只允许走域根 barrel（`@store/features/<域>`），禁跨域深引用；
- **R4** 域内非视图文件不得 import 本域 `views/**`（域根 barrel 与宿主除外）；
- **R5** 域内 `utils/**` 不得 import 同域 `stores/` `components/` `composables/`。

宿主（路由表 / 顶层 views / 入口）可以向下引用任何层；其中**懒加载**路由组件允许深引用域内
`views/*.vue`（经 barrel 转出会把所有路由页并进同一个 chunk，毁掉路由级分包）。

## 6. 构建

```bash
bun run --cwd homeos-store build        # → 工作区根 dist/homeos-store/frontend/
bun run build:store                     # 含 sync:scene（场景静态资源是生成物）
```

商店前端**没有**自己的 `package.json`，构建脚本由 `homeos-store/package.json` 驱动
（`vite --config frontend/vite.config.ts`）。`auth-bootstrap` 仍为首屏前 IIFE；
配色注入点在构建后的 `index.html` 外壳的 appearance 占位（漏一处会 500，刻意）。

CI 只保留语言级检查（`typecheck` / `lint:ci` / `ruff` / 构建 / 体积预算）。

> 最后核对：2026-10-28（链接、命令与路径已逐条验证；不再写死源文件数量）
