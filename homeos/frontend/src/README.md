# 主应用前端源码目录

横向分层 + 按域切分。Studio 是嵌套子系统，规则见 [studio/README.md](./studio/README.md)。

## 1. 分层与依赖 DAG

```
views / features  →  components  →  composables  →  shared/{utils,constants,types}
                  ↘  stores  ─────↗                ↘ services / shared/<域>/…
views (router)  -.->  studio  (只经 `@/studio` barrel 的懒加载器；不直达内部)
```

| 层 | 路径 | 可 import |
| --- | --- | --- |
| 路由 / 功能域 UI | `views/`, `features/` | components, composables, stores, shared, services, `@/studio` barrel |
| UI | `components/` | composables, utils, stores, services, shared — **不得** import `views/` / `features/` |
| Hooks | `composables/` | utils, stores, services, types, shared — **不得** import `components/` |
| 状态 | `stores/` | utils, services, types, `shared/<域>/…`（**深路径**） |
| 共享层 | `shared/` | `shared/**` + `services` 叶子池 — **不得** import stores / composables / components / views / features / layouts |
| 叶子 | `services/`、`shared/utils/`、`shared/{constants,types}/`、`shared/<域>/{utils,constants,types}/` | 仅叶子之间 — **不得** import composables / stores / components，也不得 import `shared/<域>` 裸 barrel |
| Studio | `studio/` | 子系统；根只能 `import '@/studio'` |

规则由 ESLint `no-restricted-imports`（编辑器即时反馈）与 `bun run check:frontend-deps`
（CI）共同强制，层违规白名单为空 —— 新增违规请改代码，不要加豁免。

> **设备域同名提示**：`studio/runtime/<device>`（3D 舞台运行时，公网模块 URL，命名冻结）与
> `features/<device>`、`composables/device`（2D 控制 UI）同名不同义，不可互相 import。
> 详见 [studio/README.md](./studio/README.md) 的「设备命名」。

## 2. 域边界（`features/<域>/`）

`features/<域>/` 自持本域的 `components/` `composables/` `utils/` `styles/`；**域内自由分层，
跨域只能走域根 barrel**：

```ts
// ✅ 跨域：只经域根 barrel
import { Overview } from '@/features/security'
// ✅ 域内：相对/绝对都行
import { useNav } from './composables/nav'
// ❌ 跨域深引用（禁止）
import Overview from '@/features/security/Overview.vue'
```

### 域根 barrel 与页面入口

| 文件 | 用途 | 谁用 |
| --- | --- | --- |
| `features/<域>/index.ts` | 跨域公开面 | 其它域 |
| `features/<域>/entry.ts` | 整页入口（只导出路由页面） | `views/` |

- **barrel 按需存在**：只有「确有跨域消费者」的域才建 `index.ts`。只被 `views/` 经 `entry`
  装配的叶子域不建，也不接受跨域引用 —— 门禁会报 `feature-barrel-missing`（比笼统的深引用
  错误更容易定位）。要恢复跨域消费，先补 barrel 把公开面写出来。
- **页面不进 barrel**：页面与页面 CSS 若进 barrel，会连带进入无关 chunk。
  `views/` 只允许 `@/features/<域>`、`@/features/<域>/entry` 或 `@/features/<域>/entry-<page>`，
  其它子路径禁止。
- **多页域按页拆 entry**：一个域有多条路由页时用 `entry-<page>.ts`，不要让两页共用一个
  `entry.ts` —— 两条 `import()` 指向同一模块时 Rollup 会把两个页面合并进同一个 shared chunk，
  懒加载边界失效。门禁的 `isFeatureEntry` 接受 `entry` 与 `entry-<page>` 两种形态。
- **域 barrel 无 `default`**：`import Foo from '@/features/<域>'` 会被门禁判
  `feature-barrel-default-import`（tsc 被 `esModuleInterop` 放行、打包器才报 `MISSING_EXPORT`）。
- **域不引用自身 barrel**（`feature-self-barrel`）。

现状（8 个域）：`device` / `earthquake` / `home-mode` / `security` / `settings` 有 barrel；
`embed` / `events` / `notifications` 只有 `entry.ts`。`device` 有两个 entry
（`entry-devices.ts` / `entry-device-detail.ts`），其余各一个。

## 3. 共享域（`shared/`）—— 域该进 `features/` 还是 `shared/`

**不是每个域都能进 `features/`**，判据是「真实入边」（DAG 位置）：

| 入边 | 判定 | 归宿 |
| --- | --- | --- |
| 只有 `views/` `layouts/` 或同域自身 | **叶子域** | `features/<域>/` |
| 出现 `stores/` `composables/` `shared/{utils,constants,types}/` 或根入口 | **共享域** | `shared/<域>/` |

理由：`shared` 在 DAG 里位于这些层**下方**，所以 `stores/defaults.ts → @/shared/energy/...` 合法；
同样的 import 指向 `features/` 就是分层倒置。

### 3.1 两条访问规则

- **上层消费者**（`views`/`features`/`components`/`composables`）→ 走域 barrel `@/shared/<域>`
- **叶子/下层消费者**（`stores`/`shared/utils`/`shared/{constants,types}`/`shared/<域>/{utils,constants,types}`）
  → 走深路径 `@/shared/<域>/{utils,constants,types}/…`

不能反过来：barrel 会带上 `composables/` 层（依赖 `vue`），让 `stores/defaults.ts` 去 import 它，
会把 Vue 运行时拖进本该纯净的常量/状态模块。

「叶子位置」按**位置**判定，含 `shared/utils/**` 与 `shared/<域>/{utils,constants,types}/**` ——
只认根级桶名会让这条规则对最大一批消费者静默失效。

### 3.2 barrel 面：薄 barrel 是按需引入，不是默认配置

- **硬约束**：叶子/下层消费者永不走 barrel；barrel 里**不许有死导出** —— 只导出上层消费者
  **实际取用**的符号，不写 `export *`。
- **引入时机**：域内会继续被搬动的件（`composables/`、跨域共用的决策函数）值得套一层 barrel，
  这样域内挪文件不会波及上层每一处调用点；纯 `utils/constants/types` 叶子池不套，消费者一律
  深路径（深路径本身也承担「这是纯函数」的语义）。
  **不要为了「统一好看」补 barrel**：那会把上百处调用点从深路径改成 barrel，换来零行为收益。

## 4. 桶命名铁律：一个名字只能有一个含义

建新桶（尤其 `shared/<域>/`）前，先 `find src -type d -name <候选名>` 确认它不是已有语义的另一件事。
同名双义会让 `rg` 结果失真、也让「该改哪个」变成猜谜。

| 名字 | 已有归属（**不要重名**） |
| --- | --- |
| `system` | `features/settings/system/`（含 `composables/`）、`components/widgets/system/` |
| `diagnostics` | `features/settings/system/diagnostics/` |
| `setup` | `components/setup/`（接入引导横幅） |
| `settings` | `features/settings/` |
| `system-config` | `features/settings/system/system-config/`（配置**工作区**：搜索 / 校验 / 面板壳）；字段**编辑器**件在 `shared/config-fields/`，两者刻意不同名 |

`shared/status/` 因此叫 `status` 而不叫 `system` / `diagnostics`：它装的是**本机状态**这类
只读查询（安装引导进度 + 健康诊断）。

**反过来也成立**：同一个含义不该有两个名字。域内部件统一用仓库既有词汇（模式类一律 `home-mode`）。

## 5. 该改哪里

> 归类工具只是启发式，不是归宿判决。**最终归宿以本表为准。**
> 已退役的按入边分类脚本看不到「`components → features` 被门禁禁止」「是壳层装配点」
> 「消费者跨多个视图 + 多个域」这类约束，会对下表中**有意留位**的桶给出错误建议。

| 任务 | 位置 |
| --- | --- |
| 设置面板 / 导航 | `features/settings/`（`{connect,display,system,interact,automate,home,shared}/`） |
| 设置路由外壳 | `views/SettingsView.vue`（7 行适配器）→ `features/settings/entry.ts` → `SettingsPage.vue` |
| 安防页面外壳 / 功能域 | `views/SecurityView.vue` → `features/security/entry.ts`；域在 `features/security/` |
| 设备 2D 控制 UI（域） | `features/device/`（组件 + `analytics/` + `styles/`（含域主题表 `devices-theme.css`）+ 两页 + 两个视图模型） |
| 设备页外壳 | `views/{DevicesView,DeviceDetailView}.vue` → `features/device/entry-devices.ts` / `entry-device-detail.ts` |
| 家庭模式触发日志页 | `views/ModeTriggerLogsView.vue` → `features/home-mode/entry.ts` → `ModeTriggerLogsPage.vue` |
| 内嵌网页页 | `views/EmbedView.vue` → `features/embed/entry.ts` → `EmbedPage.vue`（`/embed/movie-pilot` 与 `/embed/:id` 共用） |
| 设备 / 实体 hooks | `composables/{device,entity}/`；`entity/` 下按簇分子包：`ws/`（socket 与 ws-bind 链）、`popup/`（弹窗壳与各控制弹窗）、`device-group/`（批量 / 成员 / 离线），其余选择与投影 hooks 留根 |
| 界面 hooks | `composables/ui/`；子包 `popup/`（定位与互斥下拉）、`screensaver/`（屏保生命周期与布局）、`shell/`（主壳层导航 / 门铃 / teleport / 微件面板），通用原语（`useClickOutside` / `useFocusTrap` / `useEscStack` 等）留根 |
| 设备 / 实体纯函数 | `shared/{device,entity}/utils/`（含 `entity/utils/control/` 与 `popup-registry.util` 纯判定） |
| 事件 / 通知域 | `features/{events,notifications}/`（各 4 个 `View*` 组件 + 样式，具名 barrel 前缀 `Events*` / `Notifications*`） |
| 事件 / 通知纯逻辑 | `shared/{events,notifications}/utils/`：`dnd.util` 被 `composables/widget/useNotificationCenter`、`ws-sync.util` 被 `composables/entity/ws/ws-bind` 反向依赖，**不能进 features** |
| 安防 hooks | `features/security/composables/`（跨域经域根 barrel）；带 store 依赖的 `useSecurityPanelStatus` 在 `composables/security/`（`components/` 要它，而 `components` 禁 import `@/features/**`） |
| 安防纯函数 | `shared/security/utils/`（`panel-arm`、`panel-layout`、`panel-zones-bootstrap`、`zones-api`）+ `features/security/utils/`（域内自用） |
| 跨域纯常量 / 纯类型池 | `shared/constants/`、`shared/types/`（叶子池：不得 import 域 barrel，也不得反向依赖 stores/composables） |
| 推荐系统（算法 / 类型） | `shared/recommend/`（无 store 耦合 → 整体进 shared） |
| 摄像头流（WebRTC / HLS / go2rtc MSE） | `shared/camera/composables/`：主要消费者是 `components/HaCameraStream.vue`，而 `components → features` 被禁 |
| 在家状态（presence） | `shared/presence/`；消费者跨 `components/widgets/weather/SunInfo.vue`、`features/{home-mode,security}`、`features/settings` |
| 语音 / TTS 纯逻辑 | `shared/voice/utils/`（`speech`、`local-speech`、`resolve-tts-media-players`） |
| 能源 / 水电燃气计量 | `shared/energy/`（constants + utils + 无 store 的 composables + barrel）；store 耦合的三个 hook 在 `composables/energy/` |
| 本机状态（引导清单 / 健康诊断） | `shared/status/`；诊断 UI 仍在 `features/settings/system/diagnostics/` |
| 天气（数据面） | `shared/weather/`（纯函数，**无 barrel**，消费方一律深路径）；store 耦合的 `useWeather*` 留 `composables/` |
| 微件系统（配置化桌面部件） | 组件在 `components/widgets/`（不入 `features/`：`components/dashboard`、`components/shell/floating-hub`、`components/modals` 依 DAG 消费它）；纯逻辑 `shared/widget/` |
| 家居模式（图标 / 预设元数据） | `shared/home-mode/` |
| 家居模式（域 + 编辑器 UI + 状态内核） | `features/home-mode/`（含 `editor/` 与 `composables/home-mode-panel.internals.ts`） |
| 模式编辑器被设置页嵌入的适配层 | `features/settings/automate/styles/home-mode-embed.css`（属设置侧布局与皮肤） |
| 设置编排内核（待存登记 + 保存编排） | `composables/settings-kernel/`：绑 `useLayoutStore.saveConfig()` 故进不了 `shared/`，由 `features/settings` 与 `features/home-mode` 平等共用 |
| 实体共享 UI | `components/entities/`（含 `popups/`、`device-group/`）；**这是设计内位置**，不是待迁遗留 |
| 页面外壳（列表 / hero） | `components/list-page-shell/`（消费者是 5 个视图 + 2 个域 → 共享 UI） |
| 页面外壳（设置页 / 卡片） | `components/common/settings-page-shell/`（与上面的**列表**壳是两件事，故目录名各自显式） |
| 主屏壳层 UI | `components/dashboard/`（`Footer`、`RightSidebar`、`WidgetPanelSlot`、`PowerCardBody`）；唯一装配点是 `layouts/MainLayout.vue` |
| 首装引导横幅 | `components/setup/`（唯一装配点 `layouts/shell-overlays.ts`，数据来自 `shared/status/`） |
| 生活指数 / 图表宿主 composable | `composables/life/`（依赖 entities store；消费者含 `components/widgets/weather/LifeIndices.vue`，两侧都进不去） |
| 跨域 HTTP 查询内核 / 认证胶水 | `composables/api/useApiQuery.ts`、`composables/auth/useStoreLinks.ts`：**留原位** —— app 层胶水，不为此新开 `shared/api`、`shared/auth` |
| 备份包导出 / 还原弹窗 | `features/settings/system/profiles/BackupRestoreDialog.vue`（唯一使用者是同目录 `BackupSection.vue` → 域内自持） |
| 入户页场景壳 / 密码框 | 壳在 `@homeos/shared/components/`；本应用的薄适配层是 `shared/components/auth/AuthShell.vue`（转发 `EntryShell`）与 `components/common/{SceneStage.vue,scene-values.ts}`，`views/auth/*` 五页只填 props |
| 3D Studio / 面板编辑器 / 舞台 | `studio/` — [studio/README.md](./studio/README.md) |
| HTTP / WS 客户端 | `services/api/` |

**UI 桶的归位准则**：外部消费者全在 `views/` → 叶子域 → `features/<域>/`；外部消费者**含**
`components/` 或 `composables/` → 共享 UI → 留 `components/`；外部消费者是**壳层装配点**或
**跨多个视图 + 多个域** → 也是共享 UI；唯一消费者落在某个 feature 内部 → **域内自持**。
`shared/` 不能承接：它是最底层，禁反向依赖 stores/composables/components。

## 6. 跨应用共享包（`@homeos/shared`）

`packages/shared`（仓库根）**两个前端共用源码**，各自 Vite 直接编译。

| 面 | 子路径 | 说明 |
| --- | --- | --- |
| 纯逻辑池 | `@homeos/shared`（bare，`src/index.ts`） | 常量 / 类型 / 纯函数；主应用上百处使用，商店不用 |
| 场景壳契约 | `@homeos/shared/scene/scene-values` | `SceneShell` / `SceneValues` / `resolveSceneValues`：两侧字典**形状**单点化，文案各留各的 |
| 手持档判据 | `@homeos/shared/scene/touch-profile` | `isTouchProfile` / `applyTouchProfile`；本应用经 `studio/platform/scene-depth.ts` 进 `index.html` 的经典阻塞入口，商店在 `main.ts` import。**手抄兜底件** `public/static/auth/scene/scene-depth.js` 无法 import，改判据须与 shared 包同步 |
| 共享 SFC | `@homeos/shared/components/{SceneStage,PasswordField,EntryShell}.vue` | 两侧逐字同构的展示件，旧副本已删。本应用的 `shared/components/auth/AuthShell.vue` 只是 `EntryShell` 的薄转发（五个调用方零改动） |
| 入户步骤轨道 | `@homeos/shared/components/entry-step` | `EntryStep` 类型（抬头 / 标题 / 步骤轨道），本应用注册流程与商店登录、初始化三屏共用 |
| 剪贴板内核 | `@homeos/shared/utils/clipboard` | 纯拷贝（安全上下文走 Clipboard API，HTTP 降级 `execCommand`）；提示文案留各应用 |
| 场景静态资源 | `packages/shared/scene/static`（静态树，非 JS 子路径） | 4 个 CSS + 自托管字体；`bun run --cwd packages/shared sync:scene` 铺到两个 `public/`，该目录**不入库** |

**子路径解析到 `src/`，bare 入口解析到 `dist/`。** 子路径改完即时生效、不必 build；只有消费 bare
入口的一方（Node 脚本 / 后端）才需要 `bun run build:shared`。主应用用精确匹配别名
`/^@homeos\/shared$/` 把 bare 入口也钉到 `src/index.ts`，所以正常开发不需要预构建。

三条容易踩的坑（都已在配置里写死并注释）：

- **Vite 别名必须精确匹配**：字符串 `find` 在 Vite 里是**前缀匹配**，写成
  `'@homeos/shared': …` 会把 `@homeos/shared/components/*.vue` 这类子路径一并吞掉，
  症状是**构建静默不落盘**（产物目录整份为空，只在 `closeBundle` 报「SPA 入口缺失」）。
- **商店侧刻意不加该别名**：它只取子路径，交给包自己的 `exports`。
- **共享包自己带 lint**：`bun run lint:shared` 跑 `packages/shared/eslint.config.mjs`（含
  `eslint-plugin-vue` 段落）；否则 `.vue` 合过来后只剩各应用侧的 vue-tsc，那只查类型、不查规则。

`.vue` 只收**两侧逐字同构**的展示件；**数据 / 文案 / 版本号来源的差异一律留应用侧的薄适配层**
（样板：本应用 `components/common/SceneStage.vue` 只做 `values` + `version` 注入，版本来自本包
`package.json`；商店同名文件读 `site.version`）。

另有一批常量 / 枚举**天生只能各存一份**（前端包不能被 Python import），漂移的表现是
「前端有、后端认不出」：WS 事件名、可控实体域、通知来源与过滤优先级、实体引用种类、语音告警规则、
系统配置字段白名单，外加商店配色令牌名（`homeos-store` 的 TS 生成 ↔ Python 校验器）。
**改这些常量等于改契约**，两处一起改。

## 7. 设置功能模块

设置 UI 位于 `features/settings/{connect,display,system,interact,automate,home,shared}/`。
`views/SettingsView.vue` 是 7 行路由适配器；真正的页面（`SettingsPage.vue`）、面板 / 导航都在
`features/settings/` 下，经 `features/settings/entry.ts` 暴露。该域体量最大，**跨域只导出真实被
取用的成员**，全量 barrel 会把整个设置面板拖进任何引用方的 chunk。

**面板自持 hooks**：每个面板域把它的 hooks 收在自己的 `composables/` 下（
`<panel>/composables/*.internals.ts`），与面板组件同层 —— 改一个面板只动一棵子树。
被**多个面板**共用的 hooks 放 `shared/composables/`（`hub-ui` / `hub-env` / `hub-favorites` /
`hub-backup-orchestrator` / `env-sensor-map*` / `env-iaq.constants`）。

**跨面板引用**（同一 feature 内，不算域外引用）：`display/SettingsWholeHomeOffSection.vue` →
`../automate/composables/security-modes-extras.internals`、`connect/SettingsBindingsPanel.vue` →
`../display/composables/layout-dashboard.internals`、`home/SettingsLifeAccountsPanel.vue` →
`../connect/composables/bindings.internals`。新增跨面板引用前先判断：这是「真正的共用」还是
「面板放错了位置」——前者应下沉到 `shared/composables/`。

## 8. Studio

不要在 `studio/app/3d-studio/authoring/` 下新增平铺的 `studio-*.ts` 文件 —— 使用域文件夹
（`scene/`、`items/`、`lights/`、`ui/`）。详见 [studio/README.md](./studio/README.md)。

> 最后核对：2026-10-28（链接、命令与路径已逐条验证；计数类结论给出核对命令而不写死数字）
