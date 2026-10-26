# HomeOS 前端源码目录结构

横向分层，外加一个用于设置的 feature 模块。Studio 是嵌套的子系统。

## 依赖 DAG

```
views / features  →  components  →  composables  →  utils / services / constants / types
                  ↘  stores  ─────↗
                          shared/   ← 最底层：被上面所有层反向依赖
views (router)  -.->  studio  (只经 `@/studio` barrel 的懒加载器；不直达内部)
```

| 层 | 路径 | 可 import |
|-------|------|------------|
| 路由 / 功能域 UI | `views/`, `features/` | components, composables, stores, utils, services, shared, `@/studio` barrel |
| UI | `components/` | composables, utils, stores, services, shared — **不得** import `views/` / `features/` 面板 |
| Hooks | `composables/` | utils, stores, services, types, shared — **不得** import `components/`（白名单持续收缩中） |
| 状态 | `stores/` | utils, services, types, `shared/<域>/…`（**深路径**，见下） |
| **共享层** | `shared/` | `shared/**` + `services` 叶子池（`types/`、`constants/` 已于 P3 并入本层）— **不得** import stores / composables / components / views / features / layouts |
| 叶子 | `services/`, `shared/utils/`, `shared/{constants,types}/`, `shared/<域>/{utils,constants,types}/`（**根级 `src/utils/`、`constants/`、`types/` 均已清零**） | 彼此（仅叶子间） — **不得** import composables / stores / components，也不得 import `shared/<域>` 裸 barrel |
| Studio | `studio/` | 子系统；根只能 `import '@/studio'`，见 [studio/README.md](./studio/README.md) |

> **设备域同名提示**：`studio/runtime/<device>`（3D 舞台运行时，公网模块 URL，命名冻结）与根
> `features/<device>`、`composables/device`（2D 控制 UI）**同名不同义**，
> 不可互相 import。详见 [studio/README.md](./studio/README.md) 的「设备命名」一节。

分层约定由评审与 ESLint `no-restricted-imports` 维护。

`utils` → composables/stores/components 的白名单**为空**。  
`composables` → components 白名单**已清零**：最后一处 `composables/shell/useFloatingHub.ts` 已归位到
`components/shell/floating-hub/useFloatingHub.ts`（它按定义就是组件层装配——用 `defineAsyncComponent`
懒加载 `components/entities/popups/*`，放进 `composables/` 才是错的），`composables/shell/` 目录随之删除。
层违规白名单（`LAYER_WHITELIST`）为**空**。弹窗注册按「纯元数据 / 组件映射」两层拆分：
纯判定「entity_id → 弹窗种类」在 `@/shared/entity/utils/popup-registry.util`（可被
utils/composables/stores 安全引用），「种类 → 懒加载组件」映射在
`@/components/entities/popup-registry`（需要 `components/`）。

**P2 utils 收尾（本轮）**：根级 `src/utils/` **整个目录已清零** —— 8 个域桶按「纯逻辑落共享域」
重排为 `shared/{agent,client,earthquake,floorplan,presence,recommend,security,voice}/utils/`。
其中 `shared/security/utils/` 是唯一**从 `features/` 反向下沉**的：`components/widgets/security/PanelWidget.vue`
需要那 4 个纯函数，而 `components/` 明禁 import `@/features/**` —— 域自持原则在此让位于 DAG，
故真源落 `shared/`、由 `features/security` 域 barrel 转出；原 `utils/security` compat barrel 随之删除。

连带清掉 3 处**配置死引用**：ESLint 里 `src/utils/**` 的层块与 compat 豁免、
`check-frontend-deps.mjs` 的 `COMPAT_BARREL_DIRS` 条目、
`vite.config.ts` warmup 中指向早已迁走的 `src/utils/registry/widget-registry.ts`；
以及 9 处注释里的悬空 `@/` 引用（`services/api/orchestrator`、`composables/orchestrator/useYamlValidation`、
`features/security/utils/security-*.util` 等——见「该改哪里」下方「注释路径卫生」）。
（这些历史路径**故意不写 `@/` 前缀**：它们已被删除，写成完整形式会被下述门禁判为悬空引用。）

`check:frontend-deps` 另外强制：

- `shared/**` ↛ `stores`/`composables`/`components`/`views`/`features`/`layouts`（共享域必须待在 DAG 底部）
- 叶子/下层消费者 ↛ `shared/<域>` 裸 barrel（只许深路径，见上）。「叶子位置」按**位置**判定，含
  `shared/utils/**` 与 `shared/<域>/{utils,constants,types}/**` —— utils 池已迁到 `shared/` 下，
  只认根级桶名会让这条规则对最大一批消费者静默失效
- `import Foo from '@/features/<域>'`（域 barrel 无 `default`；tsc 被 `esModuleInterop` 放行、打包器会报 `MISSING_EXPORT`）

## 域边界（域优先的约束）

`features/<域>/` 自持本域的 `components/` `composables/` `utils/` `styles/`；**域内部自由分层，跨域只能走域根 barrel**：

```ts
// ✅ 跨域：只经域根 barrel
import { Overview } from '@/features/security'
// ✅ 域内：相对/绝对都行
import { useNav } from './composables/nav'
// ❌ 跨域深引用（禁止）
import Overview from '@/features/security/Overview.vue'
```

**域根 barrel 是按需文件，不是每个域都必须有。** 只有「确有跨域消费者」的域才建 `index.ts`；
只被 `views/` 经 `entry` 装配的叶子域（`events`、`notifications`）没有 barrel，也**不允许**
被跨域引用 —— 门禁会把它报成 `feature-barrel-missing`（比笼统的深引用错误更容易定位）。
要恢复跨域消费，先补 `features/<域>/index.ts` 把公开面写出来。

跨域规则由 ESLint `no-restricted-imports` 在编辑器里即时反馈（按域自动生成，新增域无需改配置）；
`bun run check:frontend-deps`（`homeos/frontend/scripts/check-frontend-deps.mjs`）在 CI/`lint:ci` 里兜底。

同一套脚本也用 `--root` / `--alias` 覆盖 `homeos-store` 前端（根命令 `check:frontend-deps` 会连跑
两棵树）。**别名必须显式传**：store 的路径别名是 `@store/*`，而脚本里的默认别名表是
`@/`（主应用）；解析不了的说明符会被当成外部包跳过，于是门禁照样打印「0 violation」——
绿色但一条都没检查。对照用例见 `ops/checks/architecture/tests/test_frontend_deps.py`
的 `test_custom_alias_is_resolved_not_silently_skipped`。


### 页面入口（`entry.ts`）

整页装配走独立的 `features/<域>/entry.ts`，不要塞进域根 barrel：

```ts
// features/security/entry.ts —— 只导出路由页面
export { default as SecurityPage } from './SecurityPage.vue'
```

```ts
// views/SecurityView.vue —— 7 行路由适配器
import { SecurityPage } from '@/features/security/entry'
```

理由：域 barrel 会被其它域消费（如 `features/settings` 引 `features/security`），页面与页面 CSS 若进
barrel，会连带进入无关 chunk。`views/` 只允许 `@/features/<域>`（跨域公开面）或
`@/features/<域>/entry`（整页入口），其它 feature 子路径禁止。

**多页域按页拆 entry（`entry-<page>`）**：一个域有多条路由页时，**不能**让两个页面共用一个 `entry.ts` ——
两条 `import()` 指向同一个模块，Rollup 会把该模块连同两个页面合并进同一个 shared chunk，
懒加载边界失效。实测：`features/device` 最初用一个 `entry.ts` 导出两页，构建后 `/devices`
的 chunk 变成 140KB（含详情页），拆成 `entry-devices.ts` / `entry-device-detail.ts` 后
是 71KB / 91KB 两个互不包含的 chunk。门禁的 `isFeatureEntry` 接受
`entry` 与 `entry-<page>` 两种形态，用例见 `ops/checks/architecture/tests/test_frontend_deps.py`。

迁移顺序见根仓库重构计划：`security` 试点 → 其余域分批 → `views/` 收敛为薄壳。2026-10-20 完成
`settings` / `earthquake` / `security` / `events` / `notifications` 五页；2026-10-26 补齐剩余五页：
`features/device/{DevicesPage,DeviceDetailPage}.vue`（两页各有独立 entry：`entry-devices.ts` /
`entry-device-detail.ts`，原因见上一条）、`features/home-mode/ModeTriggerLogsPage.vue`
（含私有子件 `components/ModeLogsAnalyticsRail.vue`）、`features/embed/EmbedPage.vue`。
`views/styles/` 随之清空删除 —— 设备域主题表（2,205 行）原本寄存在视图层，现在归位
`features/device/styles/devices-theme.css`，列表页与详情页各自引入，不再依赖「先访问过列表页」。
仍未迁的是 `views/auth/*`（5 页 / 1,477 行）：它们是**登录前流程**，未在本次迁移清单内，
要动需先决策是否单开 `features/auth` 域。
新增域时**先定公开面**：要跨域被消费就建 `features/<域>/index.ts`（只导出实际被取用的符号），
只给 `views/` 装配就只建 `entry.ts`；两者的区别见上一条。

## 共享域（`shared/`）—— 域该进 `features/` 还是 `shared/`

**不是每个域都能进 `features/`。** 判据是「真实入边」（DAG 位置）：

| 入边 | 判定 | 归宿 |
|------|------|------|
| 只有 `views/` `layouts/` 或同域自身 | **叶子域** | `features/<域>/` |
| 出现 `stores/` `composables/` `shared/{utils,constants,types}/` 或根入口 | **共享域** | `shared/<域>/` |

理由：`shared` 在 DAG 里位于这些层**下方**，所以 `stores/defaults.ts → @/shared/energy/...` 合法；
同样的 import 指向 `features/` 就是分层倒置。

分层倒置靠评审与 ESLint 约定兜住（排除纯 re-export 兼容桩，否则已迁域会被自己的桩伪造成假阳性）。

### `shared/<域>/` 的两条访问规则

样板：`shared/energy/`（`constants/` + `utils/` + `composables/` + `index.ts`；带 `stores` 耦合的
`useCommInfoPopup` / `useUtilityMeterPopup` / `useClientPowerReporter` 仍留在 `composables/energy/`）。

- **上层消费者**（`views`/`features`/`components`/`composables`）→ 走域 barrel `@/shared/<域>`
- **叶子/下层消费者**（`stores`/`shared/utils`/`shared/{constants,types}`/`shared/<域>/{utils,constants,types}`）→ 走深路径
  `@/shared/<域>/{utils,constants,types}/…`

不能反过来：barrel 会带上 `composables/` 层（`shared/energy/composables/useUtilityMeter` 依赖 `vue`），
让 `stores/defaults.ts` 去 import 它会把 Vue 运行时拖进本该纯净的常量/状态模块。

### `shared/<域>/` 的 barrel 面（哪些域出 barrel）

**结论：薄 barrel 是「按需引入」，不是默认配置。** 判据与硬约束：

- **硬约束**：叶子/下层消费者永不走 barrel（上一条，`isLeafConsumer`）；barrel 里**不许有死导出**
  ——所以 barrel 只导出上层消费者**实际取用**的符号。
- **引入时机**：域内会继续被搬动的件（`composables/`、跨域共用的决策函数）值得套一层 barrel，
  这样域内挪文件不会波及上层每一处调用点；纯 `utils/constants/types` 叶子池不套，消费者一律深路径
  （深路径本身也承担「这是纯函数」的语义）。
- **现状**：18 个域中 **3 个出 barrel** —— `energy`（样板：`constants` + `utils` + 无 store 的 `composables`）、
  `status`（`useSetupChecklist` / `useSystemDiagnostics`）、`home-mode`（3 个纯元数据件，被
  `features/home-mode` 与 `studio` 双侧消费）；其余 15 个（含 `entity` 22 文件、`recommend` 12 文件）
  统一深路径。**不要为了「统一好看」给它们补 barrel**：那会把 200+ 处调用点从深路径改成 barrel，
  换来的是零行为收益。

## 桶命名铁律：一个名字只能有一个含义

建新桶（尤其 `shared/<域>/`）前，先 `find src -type d -name <候选名>` 确认它不是已有语义的另一件事。
同名双义会让 `rg` 结果失真、也让「该改哪个」变成猜谜。

本仓库已有的坑位：

| 名字 | 已有归属（**不要重名**） |
|------|--------------------------|
| `system` | `features/settings/system/`（系统配置面板）、`features/settings/composables/system/`、`components/widgets/system/`（系统类组件卡片） |
| `diagnostics` | `features/settings/system/diagnostics/`（设置内的诊断面板 UI） |
| `setup` | `components/setup/`（接入引导横幅） |
| `settings` | `features/settings/`（设置面板功能域） |

故 `shared/status/` 才叫 `status` 而不叫 `system` / `diagnostics`：它装的是**本机状态**这类只读查询
（安装引导进度 + 健康诊断），语义上恰好覆盖两者，且与上表全部错开。

**反过来也成立**：同一个含义不该有两个名字。`composables/home/` 曾同时装「家居模式」
（`useHomeModes` 等）与「全屋批量操作」（`batch-actions.ts`）——同名双义的镜像形态。
域内部件统一用仓库既有词汇（模式类一律 `home-mode`）。

## 域 barrel 要「薄」：只导出被跨域真正用到的成员

`shared/<域>/index.ts` 与 `features/<域>/index.ts` 不做 `export *` 全量再导出。口径不是「这个概念
在外被人用」，而是**「有没有人真的从这条 barrel import 它」**。

> barrel 不写 `export *`：死导出躲得过 typecheck / lint（多导出一条不需要的东西，这两层都不会报错）。
> 文档描述的接口面往往比实际入边更宽，**文档描述的设计意图会漂移，`export` 的实际入边不会**，
> 所以接口面以真实 import 为准。

理由有三：

1. **避免拖重图**。域内 `utils` 与画布/粒子/Worker 一类实现模块常互相引用成一张重图；全量 barrel
   会让「只想用其中一个纯函数的调用方」被迫拉进整张图。故这类域**不出 barrel**，或只出真正被跨域
   取用的决策面，其余一律走深路径 `@/shared/<域>/utils/…`。
2. **避免拖 Vue 运行时**。`shared/energy` 的 `composables/` 层依赖 `vue`，全量 barrel 会把它
   带进本该纯净的常量/状态模块（见上「两条访问规则」）。
3. **避免假接口表**。域根上每多一条没人走的转发，读代码的人就要多花一次判断「这条到底谁在用」。
   本批清掉的 58 条里，`features/earthquake` 一家占 12 条、`shared/energy` 占 10 条，
   全是域内相对引用或下层直连源模块的转发。

同理 `features/settings/index.ts` 只导出被跨域用到的 `useEnvSensorMap` —— 该域 180+ 个源文件（`.ts`/`.vue` 186 个，含样式共 264），
全量 barrel 会把整个设置面板拖进任何引用方的 chunk。

## 该改哪里

> **归类工具只是启发式，不是归宿判决。** 已退役的 `ops/frontend_domain_classify.py`（`bun run classify:domains`）只做「入边测试」
> （入边出现 `stores/` `composables/` 等下层 → SHARED，只有 `views/`/`layouts/` → LEAF），它**看不到**
> 「`components → features` 被门禁禁止」「是壳层装配点」「消费者跨多个视图 + 多个域」这类约束，因而会对下面这些
> **有意留位**的桶给出 `LEAF → src/features/` 的错误建议：`components/{dashboard,page-shell,setup}`（壳层装配点 / 多域消费者，
> 且依 DAG 消费 `components/widgets`）、`composables/{life,widget,api,auth,security,settings-kernel}`（store 耦合 → 进不了 `shared/`，
> 消费者含 `components/` → 也进不了 `features/`；`api`/`auth` 是 app 层胶水而非域）。**最终归宿以本表为准**，
> 各条的实测理由见本表对应行。

| 任务 | 位置 |
|------|----------|
| 设置面板 / 导航 | `features/settings/` |
| 设置路由外壳 | `views/SettingsView.vue`（7 行适配器）→ `features/settings/entry.ts` → `SettingsPage.vue` |
| 设备 UI（域） | `features/device/`（`DeviceRow` 等 13 组件 + `analytics/` + `styles/`（含 2,205 行域主题表 `devices-theme.css`）+ 2 个页面 + 2 个视图模型）；跨域经域根 barrel，页面经 `entry.ts` |
| 设备页外壳 | `views/{DevicesView,DeviceDetailView}.vue`（各 7 行适配器）→ `features/device/entry-devices.ts` / `entry-device-detail.ts` → `DevicesPage.vue` / `DeviceDetailPage.vue`（按页拆 entry 保懒加载边界） |
| 家庭模式触发日志页 | 外壳 `views/ModeTriggerLogsView.vue`（7 行）→ `features/home-mode/entry.ts` → `ModeTriggerLogsPage.vue`；分析轨道在 `features/home-mode/components/ModeLogsAnalyticsRail.vue`（域内私有子件，不进 barrel） |
| 内嵌网页页 | 外壳 `views/EmbedView.vue`（7 行）→ `features/embed/entry.ts` → `EmbedPage.vue`；两条路由 `/embed/movie-pilot` 与 `/embed/:id` 共用同一页 |
| 设备 hooks | `composables/device/` |
| 设备纯函数助手 | `shared/device/utils/`（`attr-format`、`domain-labels`、`devices-route`、`entity-attr-labels`、`group-battery`、`group-offline`） |
| 安防页面外壳 | `views/SecurityView.vue`（7 行适配器）→ `features/security/entry.ts` → `SecurityPage.vue` |
| 安防功能域 UI | `features/security/` |
| 事件 / 通知功能域 UI（域） | `features/events/`、`features/notifications/`（各 4 个 View* 组件 + 样式 + 具名 barrel，导出名带 `Events*`/`Notifications*` 前缀以避开两域同名文件）；视图模型在 `features/*/composables/` |
| Events / Notifications 纯逻辑 | `shared/events/utils/`（`events-display`）、`shared/notifications/utils/`（`analytics`、`dnd`、`ws-sync`）。**不能进 features**：`dnd.util` 被 `composables/widget/useNotificationCenter`、`ws-sync.util` 被 `composables/entity/ws-bind` 反向依赖 |
| 安防 hooks | 10 个真源在 `features/security/composables/`（`useSecurityView` / `useSecurityOverview` / `useSecuritySensors` / `useSecurityAuditEvents` / `useSecurityZoneEditorList` / `useSecurityZoneMonitor` / `useSecurityZoneRooms` / `useHazardBindingStatus` / `useReduceSecuritySensitivity` / `useYamlValidation`），跨域经域根 barrel `@/features/security`。`useSecurityPanelStatus` 带 store 依赖（`@/stores/auth.store`），真源落在 `composables/security/useSecurityPanelStatus.ts`（`components/widgets/security/PanelWidget.vue` 要它，而 `components/` 禁 import `@/features/**`、它又进不了 `shared/`）。原 `composables/security/*` 的 5 个 compat 桩已全部删除，`COMPAT_BARREL_DIRS` 现为空 |
| Security 纯函数 | `shared/security/utils/`（`panel-arm`、`panel-layout`、`panel-zones-bootstrap`、`zones-api` —— 因 `components/` 要消费故落 shared）+ `features/security/utils/`（域内自用：`event-display`、`sensor-filter`、`zone-mode`、`zone-room`） |
| 跨域纯常量 / 纯类型池 | `shared/constants/`（15 文件）、`shared/types/`（20 文件）—— P3 从根级 `constants/`、`types/` 整体并入（205 处引用一次性改写，仓库内无配置硬编码这两个路径）。两者是**叶子池**：不得 import 域 barrel（门禁 `isLeafConsumer` 已把新前缀一并认作叶子），也不得反向依赖 stores/composables（`shared/types/floating-hub.ts` 唯一一处 store 类型引用已改成结构化声明 `{ layoutConfig: UILayoutConfig }`） |
| 推荐系统（推荐卡算法 / 类型） | `shared/recommend/`（`utils/` 8 个 `*-recommend.util` + `insight.util`；`types/recommend.types.ts`；Vue 侧 `composables/{useRecommendInsight,useEventLogStats}`）。**无 store 耦合 → 整体进 shared**：消费者是 `features/settings/{composables/interact/alert-rules.internals,connect/connection/EventLogRecordFilterSection.vue}` |
| 摄像头流（WebRTC / HLS / go2rtc MSE 传输） | `shared/camera/composables/`（`useHaWebRtcPlayer`、`useCameraMediaTransport`、`useGo2RtcMseTransport`）。主要消费者是 `components/HaCameraStream.vue`；`components → features` 被门禁禁止，两者又无 store 耦合，故落 `shared/`（与 `shared/widget/composables` 同理） |
| 在家状态（presence） | `shared/presence/`（`utils/display.util` + `composables/{load-presence-home,usePresenceHome}`）；消费者跨三类：`components/widgets/weather/SunInfo.vue`、`features/{home-mode,security}`、`features/settings` |
| 备份包导出/还原弹窗 | `features/settings/system/profiles/BackupRestoreDialog.vue`（**域内自持**：唯一使用者就是同目录 `BackupSection.vue`，不再挂 `components/`） |
| 环境 IAQ 缓存前缀 | `features/settings/composables/env-iaq.constants.ts`（域内自持：唯一使用者是同目录 `env-sensor-map.internals.ts`；原 `composables/climate/` 桶已清空） |
| 语音 / TTS 纯逻辑 | `shared/voice/utils/`（`speech`、`local-speech`、`resolve-tts-media-players`） |
| 其余小域纯逻辑 | `shared/agent/utils/`（`chat-limit`）、`shared/client/utils/`（`system`、`system-display`、`power-battery-display`、`infer-terminal-label`）、`shared/earthquake/utils/`（`history-analytics`）、`shared/floorplan/utils/`（`floating-hub-layout`）、`shared/presence/utils/`（`display`） |
| 能源 / 水电燃气计量 | `shared/energy/`（constants + utils + 无 store 的 composables + barrel）；store 耦合的 `useCommInfoPopup` / `useUtilityMeterPopup` / `useClientPowerReporter` 在 `composables/energy/` |
| 本机状态（安装引导清单 / 健康诊断） | `shared/status/`（`useSetupChecklist`、`useSystemDiagnostics`）；设置面板内的诊断 UI 仍在 `features/settings/system/diagnostics/` |
| 天气（数据面） | `shared/weather/`（`constants/weather-labels` + `utils/{sun-times,weather-metric,life-indices}` 纯函数，**无 barrel**，消费方一律深路径）；store 耦合的 `composables/{ui,entity}/useWeather*.ts` 留原位。原「天气背景特效」（`layouts/WeatherBackground.vue`、粒子 Worker、`shared/weather/utils/{effect-*,background-*,particle-*}`）与配套设置页、后端 `weatherEffects` 分区已整体下线 |
| 微件系统（配置化桌面部件） | `components/widgets/`（9 种子部件 + `widget-registry` 组件注册表 + `shared/WidgetHubHeader`）；纯逻辑 `shared/widget/`（`useHubTabs`、`useScheduledPoll`、`panel-widget-height`、`profile-filter`）；store 耦合的 `composables/widget/{useNotificationCenter,notification-center.context}` 留原位。**UI 不入 `features/`**：`components/dashboard`、`components/shell/floating-hub`、`components/modals` 依 DAG 消费它，而 `components → features` 被门禁禁止 |
| 家居模式（图标 / 预设元数据） | `shared/home-mode/`（`mode-icon`、`mode-preset-meta`） |
| 家居模式（域：切换器 / 数据 / 日志分析 / 编辑器契约） | `features/home-mode/` |
| 家居模式（编辑器 UI：11 分区组件 + 4 样式表 + 状态内核） | `features/home-mode/editor/`、`features/home-mode/composables/home-mode-panel.internals.ts` |
| 模式编辑器被设置页嵌入的适配层 | `features/settings/automate/styles/home-mode-embed.css`（属**设置侧**：`.settings-home-mode-workspace` 的布局与皮肤） |
| 设置编排内核（待存登记 + 保存编排） | `composables/settings-kernel/`（`pending.internals` 待存登记/离开确认、`save.internals` 的 `useSettingsSave`）；绑 `useLayoutStore.saveConfig()` 故不能进 `shared/`，由 `features/settings` 与 `features/home-mode` **平等**共用 |
| 编排工具条（通用 Tab 工具条） | `components/common/SettingsOrchTabs.vue`（API 通用、无 store；`settings-orch-*` 设计语言） |
| 入户页场景壳 / 密码框（与授权商店共用一份） | 壳在 `@homeos/shared/components/`；本应用的取数适配层是 `components/common/{SceneStage.vue,scene-values.ts}`，四个视图 `views/auth/*` 只传 `page` |
| 设备域（2D 控制 UI） | `features/device/`（13 组件 + `analytics/` + `styles/` + `composables/{useDevicesView,useDeviceDetailView}` 两个视图模型） |
| 设备/实体纯逻辑 | `shared/device/utils/`、`shared/entity/utils/`（含 `control/` 控制内核与 `popup-registry.util` 纯判定）；store/Vue 耦合件留 `composables/{device,entity}/` |
| 实体共享 UI | `components/entities/`（含 `popups/`、`device-group/`、`styles/`）。**这是设计内的正确位置**，不是待迁遗留：`views/features → components → composables → …` 的 DAG 里 `components/` 就是「共享 UI 层」，且明禁 `components → features`。归位准则：UI 桶的外部消费者**全在 `views/`** → 叶子域 → `features/<域>/`（如 `components/devices → features/device/`）；外部消费者**含 `components/` 或 `composables/`** → 共享 UI → 留 `components/`（本桶与 `components/widgets`、`components/modals` 皆属此类）；外部消费者是**壳层装配点**（`layouts/MainLayout.vue`、`layouts/shell-overlays.ts`）或**跨多个视图 + 多个域** → 也是共享 UI，留 `components/`（`components/dashboard`、`components/setup`、`components/list-page-shell` 三条即按此判）；反之**唯一消费者落在某个 feature 内部** → **域内自持**，不挂 `components/`（`components/backup/BackupRestoreDialog.vue → features/settings/system/profiles/`）。`shared/` 不能承接：它是最底层，禁反向依赖 stores/composables/components |
| 桌面微件 | `components/widgets/`（见上「微件系统」行） |
| 页面外壳（列表 / hero） | `components/list-page-shell/`（`ListPageHero`、`ListPageMetrics`、`ListPageQueryToolbar`）；消费者是 5 个视图 + `features/{events,notifications}` 两个域 → 共享 UI，不入 `features/` |
| 页面外壳（设置页 / 卡片） | `components/common/settings-page-shell/`（`SettingsPageShell`、`SettingsPageHeader`、`SettingsCard`、`SettingsCardIntro`）；与上面的**列表**壳是两件事，故目录名各自显式（此前两者都叫 `page-shell`，同名不同义） |
| 主屏壳层 UI（页脚 / 右栏 / 卡片体 / 部件槽） | `components/dashboard/`（`Footer`、`RightSidebar`、`WidgetPanelSlot`、`PowerCardBody` + 3 张同域样式表）。唯一装配点是 `layouts/MainLayout.vue`，`views/` 里没有对应视图 → 共享壳层 UI，不入 `features/`（本批删掉该目录 11 张宿主已不存在的零引用样式表，共 4,115 行） |
| 首装引导横幅 | `components/setup/`（`ChecklistBanner`、`ColdEntityPerfBanner`），唯一装配点是 `layouts/shell-overlays.ts`；数据来自 `shared/status/` |
| 生活指数 / 图表宿主 composable | `composables/life/`（**留原位**：`useLifeIndices` 依赖 `useEntitiesStore` 与 `@/composables/entity/*` → 进不了 `shared/`；消费者含 `components/widgets/weather/LifeIndices.vue` → 也进不了 `features/`） |
| 跨域 HTTP 查询内核 / 认证胶水 | `composables/api/useApiQuery.ts`（消费者 `features/{earthquake,settings}`）、`composables/auth/useStoreLinks.ts`（消费者 `views/auth/LoginView.vue`）：**留原位** —— 是 app 层胶水而非域，不为此新开 `shared/api`、`shared/auth` |
| 3D Studio / 面板编辑器 / 舞台 | `studio/` — [studio/README.md](./studio/README.md) |
| HTTP / WS 客户端 | `services/api/` |

### 注释路径卫生

文件头 `@dependencies` / `@module` 与迁移批次里留下的 `@/` 说明是最容易腐烂的地方：既没有编译器把关，
批量改路径时又会被正则「顺手套用前缀」，生成看起来合理、实际不存在的路径。

因此有了一条**注释 / 文档纪律**：注释与 `.md` 里**不要写完整的假 `@/` 路径**，改用占位符（`@/components/<x>`、`@/foo/**`、
`@/shared/<域>/utils/…`）或省掉 `@/` 前缀（写 `…/shared/client/utils/system.util`）。
文档里的 `import` 示例是示意，不是真引用。

### 样式表卫生

样式表容易腐烂：`@import` 与 `<style src>` 没有编译器把关，宿主组件被删除后样式表会静默留下。
本批实测：`components/dashboard/styles/` 原有 14 个文件，其中 11 个已
**零引用**（宿主 `AutomationBuilder` / `SceneBatchPickerModal` / `SceneBatchStepField` / `SimpleAutomationWizard` /
`TemplateEntityBuilder` / `Orchestrator{DriftDiffModal,EngineCapsPanel,ExecutionEngineBadge,PlaceholderWizard,SyncAlert}` /
`OrchestratorBuilder.shared` 全仓已不存在），合计 4,115 行，整批删除。

**同批第二处（P3 收尾扫出来的）**：`components/widgets/device/styles/` 7 个 + `components/widgets/voice/styles/` 1 个，
共 8 文件 / 1,658 行，全仓零 import（宿主 `CoverGroupPanel` / `FunctionSwitchesWidget` / `HealthPanel` /
`QuickSwitchesWidget` / `SwitchControlPanel` / `SwitchGroupPanel` / `UsageHeatmap` / `voice-command` 组件均已不存在）。
目录随文件一起删空。注意 `rg "HealthPanel"` 会命中 `features/settings/shared/styles/bindings-theme.css:1293` 的
**注释**、`voice-command` 会命中 `SettingsVoicePanel.vue` 的**类名/props 名** —— 判据必须是「有没有 import /
`<style src>` / `@import` 指向这个文件」，不是「仓里有没有出现过这个名字」。

判定口诀：**一个既无 `<style src>` 也无 `@import` 的样式表，删掉它是运行期无操作**（没有任何元素会被它命中），
不必逐条比对类名；真正需要小心的只有「仍被引用、但类名已死」的情形。

### 构建分块组不能悬空

`vite.config.ts` 的 `codeSplitting.groups` 是**纯配置**：文件被搬走后正则照样编译、构建照样成功，那条分组只是
静默失效（表现是「没报错，但产物里那个 chunk 不见了」）。文件被搬走或删除后，
对应分组必须同步删除。

改 `codeSplitting.groups` 时请人工核对：每组的 `test` 仍能命中真实模块；`(media|weather)` 这类
alternation 的每条分支都要有文件，否则只是静默少覆盖一块。

`wr-*` 命名空间没有应用侧消费者，不要再往样式表里新增。

判定：一个**规则块**只要其**每条逗号分支**都硬依赖某个**不可发射**的类名（该分支永远不会匹配），
整块可判死、直接删除。

判定与删除口径：一个**规则块**只要其**每条逗号分支**都硬依赖某个**不可发射**的类名（该分支永远不会
匹配），整块可判死、直接删除。残留仅剩「活选择器里的 no-op 守卫 / 混合选择器列表里的死分支」，
按「含仍存活类名的选择器不动」保留：`main.css` 的 `input[type="range"]:not(.wr-range)…` 与
`.wr-btn-add` / `.wr-btn-weak` 所在的混合选择器列表，外加 `hos-select.css` 里一条 `wr-dd` 注释。

## 跨应用共享包（`@homeos/shared`）—— 主应用 ↔ 授权商店

`packages/shared`（仓库根）不只是一个纯逻辑包：**两个前端共用它的源码**，各自 Vite 直接编译。
`exports` 里每条子路径都指向 `src/*.ts` / `*.vue`（不是 `dist`），所以改完立刻生效、不必先 build 共享包；
只有后端/Node 消费 `dist` 时才需要 `bun run build:shared`。

| 面 | 子路径 | 说明 |
|---|---|---|
| 纯逻辑池 | `@homeos/shared`（bare，`src/index.ts`） | 常量 / 类型 / 纯函数。主应用 100+ 处使用；商店目前不用 |
| 场景壳契约 | `@homeos/shared/scene/scene-values` | `SceneShell` / `SceneValues` / `resolveSceneValues`：两侧字典**形状**单点化，文案各留各的（本应用 `components/common/scene-values.ts` ↔ 商店 `components/scene-values.ts`，兜底页各点名 `login` / `store`） |
| 场景静态资源 | `packages/shared/scene/static`（静态树，非 JS 子路径） | 4 个 CSS + 4 个自托管字体 + 归因文件；`bun run --cwd packages/shared sync:scene` 把它铺到 `public/static/auth/scene/`，该目录**不入库**（`build` / `dev` 脚本已代为执行），`scene.html` 是标记设计稿 |
| 手持档判据 | `@homeos/shared/scene/touch-profile` | `isTouchProfile` / `applyTouchProfile`；本应用经 `studio/platform/scene-depth.ts` 进 `index.html` 的经典阻塞入口，商店在 `main.ts` import。**手抄兜底件** `public/static/auth/scene/scene-depth.js` 无法 import，改判据须与 shared 包同步 |
| 共享 SFC | `@homeos/shared/components/{SceneStage,PasswordField}.vue` | 本包承载的第一批 `.vue`：两侧逐字同构的展示件，旧副本已删 |
| 剪贴板内核 | `@homeos/shared/utils/clipboard` | 纯拷贝（安全上下文走 Clipboard API，HTTP 降级 `execCommand`）；提示文案留各应用（本应用接 `services/notify`，商店接 `useToast`）。商店 4 处消费**全部**走本店 `utils/clipboard` 包装：`LicensesView` 一直如此，`ItemView` / `AccountView` / `ReferralsView` 三个视图原先裸调 `navigator.clipboard.writeText`（**HTTP 非安全上下文下必抛**，正是该内核存在的理由），本轮并入 |

另有一批常量 / 枚举**天生只能各存一份**（前端包不能被 Python import），漂移的表现是「前端有、后端认不出」：
WS 事件名、可控实体域、通知来源与过滤优先级、实体引用种类、语音告警规则、系统配置字段白名单，
外加商店配色令牌名（`homeos-store` 的 TS 生成 ↔ Python 校验器）。**改这些常量等于改契约**，两处一起改。

三条容易踩的坑（都已在配置里写死并注释）：

- **Vite 别名必须精确匹配**：本应用写的是 `{ find: /^@homeos\/shared$/, … }`。字符串 find 在 Vite 里是**前缀匹配**，
  写成 `'@homeos/shared': …` 会把 `@homeos/shared/components/*.vue` 这类子路径一并吞掉，
  症状是**构建静默不落盘**（产物目录整份为空，只在 `closeBundle` 报「SPA 入口缺失」）。
- **商店侧刻意不加该别名**：它只取子路径，交给包自己的 `exports`。
- **共享包自己带 lint**：`bun run lint:shared`（仓库根）跑 `packages/shared/eslint.config.mjs`，含 `eslint-plugin-vue` 段落。
  否则 `.vue` 合过来后只剩各应用侧的 vue-tsc —— 那只查类型、不查规则。

`.vue` 只收**两侧逐字同构**的展示件；**数据 / 文案 / 版本号来源的差异一律留应用侧的薄适配层**
（样板：本应用 `components/common/SceneStage.vue` 只做 `values` + `version` 注入，版本来自本包 `package.json`；商店同名文件读 `site.version`）。

## 设置功能模块

设置 UI 位于 `features/settings/{connect,display,system,interact,automate,home,shared}/`。
`views/SettingsView.vue` 是 7 行路由适配器；真正的页面（`SettingsPage.vue`）、面板 / 导航都在
`features/settings/` 下，经 `features/settings/entry.ts` 暴露。

## Studio

不要在 `studio/app/3d-studio/authoring/` 下新增平铺的 `studio-*.ts` 文件 —— 使用域文件夹（`scene/`、`items/`、`lights/`、`ui/`）。旧的兼容桩已删除。详见 [studio/README.md](./studio/README.md)。
