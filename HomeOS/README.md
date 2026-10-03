# HomeOS — 智能家居中央控制平台

[![Docker Build](https://github.com/sfairy/homeos/actions/workflows/docker-build.yml/badge.svg)](https://github.com/sfairy/homeos/actions/workflows/docker-build.yml)

> 仓库：[github.com/sfairy/homeos](https://github.com/sfairy/homeos) · 当前版本：`2026.09.22.08`

HomeOS 是面向**家庭局域网**的智能家居中央控制平台，作为 **Home Assistant（HA）上层 UI 网关**：Dashboard、户型图触控、安防、能源/环境、语音、墙面板充放电联动等。通过 WebSocket 与**单套** HA 长连接，实时同步实体状态。

**边界**：单 HA 实例；首选墙面触控平板；不支持多 HA。外网请自备 VPN/反代，并配置 `CORS_ORIGINS` 与强 `JWT_SECRET`。

## 目录

- [简介](#简介)
- [快速开始](#快速开始)
- [架构](docs/architecture.md)
- [功能](#功能)
- [部署](docs/deploy.md)
- [开发](#开发)
- [参考](#参考)
- [许可证](#许可证)

---

## 简介

| 层次     | 技术 |
| -------- | ---- |
| 后端     | NestJS 11（Bun + TypeScript） |
| 前端     | Vue 3.5 + Vite 8（SPA，Hash 路由）· Tailwind 4 · Lucide |
| 编排     | Vue Flow · Comlink · ECharts 6 |
| 数据     | PostgreSQL 16（Prisma，43 model）· Redis 7（L2，可选） |
| 实时     | 原生 ws → HA · Socket.IO（MsgPack）→ 前端 |
| 认证     | HttpOnly JWT Cookie · CSRF · 多角色 |
| 包管理   | Bun workspaces（`backend` / `frontend` / `packages/shared`） |
| 静态资源 | 仓库根 [`assets/`](#静态资源目录assets)（Docker 挂载，可替换） |
| 部署     | Docker 多阶段 + Compose（Postgres + Redis + Caddy 内网 HTTPS） |
| PWA      | `frontend/public/{manifest.json,sw.js}` · 图标 `/logo/logo.svg` |

---

## 快速开始

### 本地开发

```bash
git clone https://github.com/sfairy/homeos.git && cd homeos
bun install
cp backend/.env.example backend/.env   # 编辑 DATABASE_URL

bun run dev:db                         # Docker 映射 postgres/redis 到本机
cd backend && bunx prisma db push && cd ..

bun run dev:backend                    # http://127.0.0.1:8501
bun run dev:frontend                   # http://127.0.0.1:5173
```

浏览器打开 `http://localhost:5173`，首次进入 `#/setup`。Vite 代理 API/素材到 8501；logo/sounds 开发态直读 `assets/`。本地可用 `db push`；生产 Docker 用 `migrate deploy`。

### 生产构建

```bash
bun run build                           # 按序构建：@homeos/shared → backend → frontend（dist/backend + dist/frontend）
bun run start:prod                      # 后端托管 dist/frontend（单一 HTTP 端口）
```

> `bun run build` 在仓库**根目录**执行即同时产出前后端；单独构建用 `bun run build:backend` / `bun run build:frontend`。backend 入口脚本已内置 Nest / SWC 兼容补丁链，无需手动预处理。

### Docker

```bash
bash scripts/deploy.sh up --interactive
# 或上传 docker-compose.yml 后在 NAS 面板启动（口令可留空，首次自动写入 ./secrets/）
```

默认 **HTTP** `:8126` · **HTTPS** `:8443`（墙面板采电量需 HTTPS）。详见 [部署](#部署)。

---

## 架构

见 **[docs/architecture.md](docs/architecture.md)**（数据流、分层、顶层模块与目录约定）。

---

## 功能

### 总览

| 分类 | 能力 |
| ---- | ---- |
| HA / 同步 | WebSocket 长连接、熔断重连、Socket.IO 增量、L1/L2 缓存 |
| Dashboard | 90+ Widget、户型图热点（约 30 种部件）、27 种实体弹窗 |
| 联动器 | 自动化/场景/脚本/模板 · 本地引擎 + HA 双轨 · Vue Flow · 漂移修复 |
| 安防 | 门铃、Frigate、mmWave、安防面板、离家模拟、监控轮巡 |
| 能源 / 环境 | 趋势与预算、阶梯电价、IAQ、用水、环境健康 |
| 语音 / 顾问 | STT、唤醒词、HA Assist、TTS；智能顾问与习惯推荐 |
| 家庭模式 | 情景触发器、设备快照恢复 |
| 访问 / 通知 | 多用户 ACL、访客、儿童模式；告警 DSL、站内 + Email/WebPush/企微 |
| 客户端电量 | 墙面板 Battery API 上报、滞回自充、峰谷错峰 |
| 素材 / 运维 | `assets/` 可替换挂载；诊断、灾备、PITR |

### 设置中心（6 组 · 29 面板）

见 [`settings-nav.util.ts`](frontend/src/utils/registry/settings-nav.util.ts)。

| 分组 | 面板 |
| ---- | ---- |
| 入门与连接 | 首装向导 / HA 连接 / 集成绑定 / 设备管理 |
| 家居配置 | 房间 / 环境与健康 / 生活账户 / 智能充放电 / 常用设备 |
| 界面与体验 | 基础设置 / 素材库 / 仪表板布局 / 面板部件 / 浮动组件 / 内嵌网页 |
| 自动化与安防 | 联动中心 / 家庭模式 / 安防场景 |
| 感知交互 | 语音中心 / 智能管家 / 告警规则 / 智能服务 |
| 系统与账户 | 家庭状态 / 账户与安全 / 数据保留 / 方案与备份 / 执行历史 / 运维诊断 / 高级参数 |

未配 HA 时默认首装向导；已配置默认基础设置。**adult** 默认「家庭状态」只读页。

### 终端体验

- **触控优先**，辅以语音；短边 &lt; 600px 可走竖屏 `/#/m`
- 默认设计区 **1366×1024**，`ScaledViewport` 整页等比缩放（平板首次默认开启）
- 多终端可用独立 **display profile**（设置 → 方案与备份），HA 连接与实体仍共享
- 性能默认 `high`；硬件不足时可降 `medium` / `low`（设置 → 基础设置）
- 屏保可即时进入/唤醒并节流渲染（高级参数 `screensaver`）；EEW 全屏时不进屏保

### 联动与配置

| 模式 | 说明 |
| ---- | ---- |
| `runOnHa=false`（默认） | HomeOS 本地引擎（state/time/sun/event/webhook 等；详见 `GET /automation/engine/capabilities`） |
| `runOnHa=true` | 推送到 HA 执行 |

联动中心用 Vue Flow 编辑（`geekGraph` → YAML）。可漂移检测后 `repair-drift`；场景/脚本/模板支持 `sync-to-ha` / `pull-from-ha`。远程改 `configuration.yaml` 需配置 `automation.haConfigDir`。

运行参数在 **`SystemConfig`** 单例（schema **v14**，`GET/PUT /system/config`，仅 `id=default`）；运行时快照在 **`RuntimeKv`**；各方案布局在 **`ProjectConfig`**。高级参数侧栏与设置六组同名，部分分区委托到对应设置页。灾备：应用配置 v14 · 联动器 v1 · 完整包 v2。

### 客户端智能充放电

墙面板经 Battery API 上报电量；后端滞回控制充电器开关，支持待配对、峰谷错峰与失败重试。配置：设置 → 智能充放电（`clientPower`）。采电量需 HTTPS，见 [部署 · 内网 HTTPS](docs/deploy.md#内网-https-与混合内容)。

---

## 部署

完整步骤见 **[docs/deploy.md](docs/deploy.md)**（Compose、内网 HTTPS、PITR）。

```bash
docker compose up -d
# HTTPS :8443 · HTTP :8126 · 首次 migrate deploy
```

---

## 开发

### 前置与命令

- Bun 1.4+ · PostgreSQL 16+ · Redis 7+（可选）· Docker Compose v2（生产）
- NestJS **当前锁定 11.x**：`@nestjs/throttler@6.5.0` peer 约束仅支持 ≤11；等 throttler 出 12 兼容版后再整体升至 Nest 12
- 根 [`package.json`](package.json) 用 `overrides` 锁定部分传递依赖；发版前可 `bun audit`

| 命令 | 说明 |
| ---- | ---- |
| `bun run prep` | 生成 `@homeos/shared` + Prisma Client（后续步骤的前置） |
| `bun run dev:db` / `dev:backend` / `dev:frontend` | 本地开发：DB · Nest（含 watch）· Vite |
| `bun run build` | **全量生产构建**：prep → backend → frontend |
| `bun run build:backend` / `build:frontend` | 仅构建指定端（均隐式 prep） |
| `bun run start:prod` | 启动生产后端（`bun dist/backend/main.js`） |
| `bun run lint` / `typecheck` / `typecheck:strict` | 三端 ESLint / TSC（strict 额外 prep 验证） |
| `bun run check` | lint + typecheck + `@homeos/shared` 单测 |
| `bun run test` | `@homeos/shared`（test/ 独立目录） + backend 单测 |
| `bun run audit:deadcode` | knip 死代码扫描（孤立导出 / 未用依赖） |
| `bun run audit:structure` | 结构膨胀门禁（CI 加 `-- --ci` 对新增问题直接 fail） |
| `bun run bump` / `clean:local` | 版本号三段同步 · 清 dist/缓存/本地产物 |
| `bash scripts/deploy.sh …` | Docker 部署：init / up / down / pull / logs / bundle（`help` 查看完整用法） |

版本由 [`scripts/bump-version.mjs`](scripts/bump-version.mjs) 同步 package.json、`backend/version.js` 与本页眉。镜像默认 `ghcr.io/sfairy/homeos:latest`。

### 质量门禁

**数据库迁移**：单条 init baseline；旧库 `P3005`/`P3009` 须清卷重建（停服务后 `docker compose down -v postgres` 再 `up` 会自动跑 migrate deploy），entrypoint 不做自愈。

**静态门禁（Quality Checks 工作流）**：

> **延迟 SLO**：以 `GET /metrics` 的 `homeos_ha_sync_latency_ms` 为口径——`hot_apply`+`ws_emit` p99<10ms、`fe_critical_apply` p99<16ms、局域网 E2E p99<100ms。

| 步骤 | 检查项 |
| ---- | ------ |
| `bun audit --audit-level=high` | 依赖漏洞审计（high+ 失败） |
| `bun run audit:structure -- --ci` | 结构膨胀门禁（新增超大文件 / 过薄 util / 空分层脚手架 / 跨模块 internals） |
| `lint` | 三端 ESLint |
| `typecheck` | 三端 TypeScript（先 prep；CI 可设 `HOMEOS_PREP_DONE=1`） |
| `backend` + `frontend` build | 生产构建（prep 已在前置步骤完成） |
| `prisma migrate deploy` | 迁移可应用（Postgres service；空库 / 与 init baseline 一致的库） |

**API 错误规范**：后端业务错误统一为 `BusinessException` + [`API_ERROR`](backend/src/common/errors/api-error-messages.ts) 码表，经 [`GlobalExceptionFilter`](backend/src/common/errors/global-exception.filter.ts) 返回结构化 JSON（`apiErrorCode`、`message`、`traceId`）。`backend/src/modules` 内禁止裸 `throw new Error`；前端可据此做稳定错误提示。


### 约定要点

- 命名：后端 `*.util.ts` / `*-helper.ts` / `*-internals.ts`；前端 `kebab-case.util.ts`、`useXxx.ts`；`composables/` 与 `utils/` **按域分子目录**（勿把散落文件堆在根上）
- 依赖：`modules` → `common`（禁反）；前端 `views` → 下层（禁 components→views）；契约用 `@homeos/shared`
- 设置页：`connect|home|display|automate|interact|system`；深链/注册表在 `frontend/src/utils/registry/`；组件 CSS 旁路 `styles/`，全局主题见 `frontend/src/assets/styles/*.css`
- Worker 在 `frontend/src/workers/`；事件总线在 `utils/bridge/`；结构自检 `audit-structure-bloat.mjs`（CI `--ci` 对新增大文件/空脚手架 fail）
- 「联动」产品面 ≠ `orchestrator` 代码面 ≠ `automation|scene|script` 模块——**勿强行合并目录**

### 域对照

产品「联动中心」在代码中拆成多层命名（**勿强行合并目录**）：

| 概念 | 代码位置 | 说明 |
| ---- | -------- | ---- |
| 产品文案 / UI 枢纽 | `components/linkage/`、`views/settings/automate/linkage/` | 用户可见「联动」 |
| 编排 API / 微件 / composable | `services/api/orchestrator.ts`、`components/widgets/orchestrator/`、`composables/orchestrator/`、`utils/orchestrator/` | 统一编排面 |
| 后端引擎（shared） | `backend/src/shared/orchestrator/` | 本地编排运行时（无 HTTP） |
| 后端 HTTP mixin | `backend/src/modules/orchestrator-http/` | 联动器共用 CRUD / HA sync 路由 |
| 后端特性模块 | `automation` + `scene` + `script` + `template-entity` + `ha-sync`（配置导入） | 按资源类型分模块 |

设备 vs 实体（**勿强行合并**，语义不同）：

| 概念 | 代码位置 | 说明 |
| ---- | -------- | ---- |
| 设备列表 / 分析 / 健康 | `components/devices/`、`widgets/device/`、`composables/device/`、`views/DevicesView.vue`、`views/DeviceDetailView.vue` | 面向「设备」产品面（统计、详情、健康） |
| HA 实体状态 / 弹窗 / 分组 | `components/entities/`、`composables/entity/`、`utils/entity/`、`stores/entities.store.ts` + `stores/entities/` | 面向 HA `entity_id` 状态与控制 |

其它对照：布局/`api/config` → `ui-config`；顾问 → `awareness`；充放电 → `client-power`；告警/收件箱 → `notification` + `channels`；实体状态 → `state-store`。

### GitHub Actions

| 工作流                                                       | 触发                                                              | 说明                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------- |
| [`quality-checks.yml`](.github/workflows/quality-checks.yml) | `pull_request`、手动、`docker-build` 调用 | lint、typecheck、`@homeos/shared` 单测、生产构建、结构膨胀门禁、`bun audit --audit-level=high` |
| [`docker-build.yml`](.github/workflows/docker-build.yml)     | 手动 `workflow_dispatch`                                          | quality-checks → 多架构镜像（linux/amd64 + linux/arm64）推送到 GHCR                  |

> **说明**：质量门禁在 PR 时自动运行，也可在 Actions 页手动触发。发版镜像选择 **Docker Build & Push** 手动运行（会先跑 quality-checks）。

---

## 参考

### 仓库结构

```
HomeOS/
├── backend/                    # NestJS 后端（24 个业务模块）
│   ├── src/
│   │   ├── main.ts             # 入口：CORS、Helmet、JWT、SPA 回退、go2rtc/embed WS 反代
│   │   ├── common/             # 基础设施 + utils（禁止 import modules/*）
│   │   │   └── alert-support/ crud/ database/ embed/ http-security/ platform/ resilience/ errors/ observability/ utils/
│   │   ├── shared/             # infra 内核（Prisma/Redis/AppConfig + HA 流水线 + 联动引擎；勿改名为 infra）
│   │   │   ├── prisma/ redis/ app-config/ jobs/
│   │   │   ├── ha/             # 状态桥接（HaEntityStateSharedModule）+ Hot/Cold 管道（HaStatePipelineModule）+ go2rtc WS 反代
│   │   │   └── orchestrator/   # 联动器 HA 同步引擎 + 共享 DTO（无 Nest HTTP）
│   │   ├── modules/            # 业务模块（energy / environment / child-mode / linkage-health / weather 已提升）
│   │   └── generated/prisma/   # Prisma Client（gitignore，prep 生成）
│   ├── prisma/                 # schema + migrations（PostgreSQL，40 model）
│   └── scripts/                # docker-entrypoint、ensure-prisma-client、fix-dist-imports 等
├── frontend/                   # Vue 3 + Vite 8 前端
│   ├── src/
│   │   ├── components/         # 户型图、Widget、实体弹窗、布局壳层
│   │   ├── composables/        # 按域分子目录（energy/home/security/ui/…）
│   │   ├── views/              # 页面 + settings/{connect,home,display,automate,interact,system} + mobile/
│   │   ├── stores/             # Pinia（entities、ui / chrome / layout 等）
│   │   ├── services/           # HTTP API + store 相邻副作用（如 notify）
│   │   ├── utils/              # 实体派生、registry（微件/深链）、联动器引擎
│   │   └── workers/            # *.worker.ts + Comlink 适配器
│   └── public/                 # PWA：manifest.json、sw.js（≠ 仓库根 assets/）
├── packages/shared/            # @homeos/shared：前后端共享类型与工具
├── assets/                     # 可替换静态资源（Docker 挂载，见下节）
├── license/                    # 商业授权 JWT（license.jwt）
├── backups/                    # JSON 灾备包、pg_dump、PITR basebackup
├── docs/                       # architecture.md · deploy.md
├── deploy/                     # Caddy、init-layout.sh、PITR postgres 配置
├── dist/                       # 生产构建产物（gitignore）
├── docker-compose.yml          # 生产 / NAS 编排
├── docker-compose.local.yml    # 本地把 postgres/redis 端口映射到宿主机
├── Dockerfile                  # 多阶段镜像（含 icons/backgrounds/… seed）
├── .env.docker.example         # Compose 环境变量模板
├── .github/workflows/          # quality-checks、docker-build
└── package.json                # Bun workspaces 根配置
```

**根目录 `scripts/`**：`run.mjs`（prep/lint/typecheck/build）· `bump-version.mjs` · `clean-local.mjs` · `audit-structure-bloat.mjs` · `deploy.sh` · `docker-*.sh` · `pg-basebackup.sh` · `lib/repo.mjs`。结构膨胀：`bun run audit:structure`（CI `-- --ci`）。

### 静态资源目录（assets/）

仓库根 [`assets/`](assets/) 为可替换素材；Nest 按 URL 前缀托管，Compose 挂载 `./assets/<name>:/app/<name>`。

| 宿主机目录 | 容器路径 | HTTP 前缀 | 说明 |
| ---------- | -------- | --------- | ---- |
| `assets/floorplans/` | `/app/floorplans` | `/floorplans/` | 户型图（seed 含 `lights_off.png`） |
| `assets/backgrounds/` | `/app/backgrounds` | `/backgrounds/` | 仪表盘氛围图 |
| `assets/icons/` | `/app/icons` | `/icons/` | 状态图标 |
| `assets/room_images/` | `/app/room_images` | `/room_images/` | 竖屏房间背景 |
| `assets/logo/` | `/app/logo` | `/logo/` | 品牌 Logo → **`/logo/logo.svg`** |
| `assets/sounds/` | `/app/sounds` | `/sounds/` | 音效（如 `/sounds/doorbell.mp3`） |

`frontend/public/` 仅 PWA（`manifest.json`、`sw.js`）；`license/`、`backups/` 在仓库根，不在 `assets/`。覆盖宿主机文件后刷新即可（`/logo/*`、`/sounds/*` 为 `must-revalidate`）。开发态 Vite 经 [`vite-plugin-root-assets`](frontend/vite-plugin-root-assets.ts) 直读 logo/sounds；素材库上传走 `/api/v1/config/*`。镜像将上述目录打入 `*-seed/`，挂载卷为空时由 entrypoint 灌入（init-layout 会 `chmod 0777`，否则 seed 失败 → 404）。

### 后端目录约定（common 边界）

`alert-support` / `crud` / `database` / `embed` / `http-security` / `platform` / `resilience` / `errors` / `observability` / `utils` 为 `common/` 横切基础设施；`prisma` / `redis` / `app-config` / `ha` / `orchestrator` / `jobs` 为 `shared/` **infra 内核**（领域引擎 + 底层设施，目录名保持 `shared` 以免全仓改 import）。**禁止** `common/**` → `modules/**`；Nest HTTP mixin 在 `modules/orchestrator-http/`。勿预建空的 clean-architecture / `features` 目录。

### 共享包 `@homeos/shared`

见 [`packages/shared`](packages/shared)；常用：HA URL 校验、危险控制 denylist、实体 ACL、语音告警、联动引擎能力、房间目录等。前端 Vite 直指 `packages/shared/src`；后端 / 生产构建需 `bun run prep`。

### 后端模块

`backend/src/app.module.ts` 装配以下 NestJS 模块：

| 模块                                              | 职责                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **HaConnectorModule**                             | HA WebSocket/REST、TTS、熔断、断连防抖（扁平文件 + `*-helper` / `*-internals`）                                        |
| **HaEntityStateSharedModule**                     | HA 状态 ingress、过滤、注册表/快照委托（`shared/ha`，@Global，不依赖 StateStore） |
| **HaStatePipelineModule**                         | HA 状态 Hot/Cold 管道（`HaStatePipelineService`；端口来自 StateStore / WsPush） |
| **JobRegistryModule**                            | 调度作业统一注册中心与运行监控（`shared/jobs`；`JobRegistryService` 暴露 `GET /system/jobs` 只读诊断）                  |
| **StateStoreModule**                              | 实体 L1/L2 缓存、域统计、EventLog、房间管理                                                                           |
| **CommandProxyModule**                            | HA 服务调用、审计、历史、媒体代理                                                                                     |
| **WsPushModule**                                  | Socket.IO 网关，MsgPack，全量/增量推送                                                                                |
| **LicenseModule**                                 | 商业授权门禁（RS256 JWT、HWID、`LICENSE_REQUIRED`）；HTTP Guard + WS 握手校验                                            |
| **AuthModule**                                    | JWT Cookie、多用户/访客、CSRF、速率限制                                                                               |
| **UiConfigModule**                                | 多 Profile、素材 API（户型图/图标/背景/房间图）、灾备导入导出                                                         |
| **SecurityModule**                                | 门铃/Frigate/mmWave/异常/安防面板/离家模拟（`panel` / `presence` / `surveillance`）                                    |
| **EnergyModule**                                  | 能耗分析、预算、阶梯电价（顶层）；副作用在 `EnergySideEffectModule`，供 EventLog 注入 |
| **EnvironmentModule**                             | IAQ / 环境健康 / 节律照明 / 自适应温控（顶层）                                                                        |
| **ChildModeModule**                               | 儿童模式白名单与时间窗（顶层）                                                                                        |
| **LinkageHealthModule**                           | 联动健康与统一执行历史                                                                                                |
| **SystemModule**                                  | 配置 / 备份 / ops / lifestyle / setup / access / embed / device                                                       |
| **MoviePilotProxyModule**                         | MoviePilot `/system/moviepilot/*` 透明代理（`ops/`，**AppModule 末尾注册**；URL 在设置 → 内嵌网页）                    |
| **AutomationModule / SceneModule / ScriptModule** | 三大联动器 + 本地引擎 + HA Config API 同步                                                                            |
| **TemplateEntityModule**                          | 模板实体 CRUD、YAML 生成/同步                                                                                         |
| **HaConfigImportModule**（旧名 `HaSyncModule`）   | 从 HA **导入** automation / scene / script（≠ `OrchestratorHaSyncModule`）                                            |
| **HomeModeModule**                                | 家庭情景模式、触发器、快照恢复                                                                                        |
| **NotificationModule**                            | 告警 DSL、站内通知、DND（渠道工具在 `common/alert-support`）                                                          |
| **ChannelsModule**                                | Email / WebPush / 企业微信通道（企微回调热重载；WebPush 订阅持久化 + `POST /channels/webpush/*`；未配置 LLM 时通道对话回引导文案） |
| **AreaModule**                                    | 移动端房间 Area / AreaEntity 持久化与排序                                                                               |
| **AgentModule**                                   | 自然语言家居控制（LLM 工具调用）+ MCP JSON-RPC 网关（`POST /api/v1/mcp`，头 `x-homeos-mcp-key`）                         |
| **EarthquakeModule**                              | Wolfx EEW 预警、CENC/USGS 震情目录、TTS 倒计时、Redis 多副本桥接                                                      |
| **AwarenessModule**                               | 智能顾问、习惯推荐、语音对话、离线基线                                                                                |
| **ClientPowerModule**                             | 墙面板电量上报、滞回自充（顶层模块 [`modules/client-power`](backend/src/modules/client-power/)）                       |
| **AppConfigModule / PrismaModule / RedisModule**  | 系统配置、数据库、Redis                                                                                               |
| **OrchestratorHaSyncModule**                      | 联动器与 HA 配置同步引擎（`shared/orchestrator`）                                                                     |
| **OrchestratorBootstrapModule**                   | 联动器定时从 HA 自动导入（编排各 HaSync 服务）                                                                        |
| **orchestrator-http**（路由 mixin）               | 联动器共用 CRUD / HA sync / 占位符路由 mixin（automation / scene / script 复用）                                      |

全局：`ConfigModule`、`EventEmitterModule`、`ScheduleModule`、`ThrottlerModule`（300 次/60s）。静态托管见 [静态资源目录](#静态资源目录assets)。

### MCP

`POST /api/v1/mcp`，头 `x-homeos-mcp-key`（`MCP_GATEWAY_SECRET` 或设置 → 智能管家）。协议 `2025-03-26` 子集：`initialize` · `tools/*` · `resources/*` · `prompts/*` · `ping`。SSE 传输：`GET /api/v1/mcp/sse`。危险控制走 denylist。

```bash
curl -sS -X POST "http://127.0.0.1:8501/api/v1/mcp" \
  -H "Content-Type: application/json" -H "x-homeos-mcp-key: YOUR_SECRET" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

### 运维入口（摘要）

- 模板占位：`GET/POST /automation/:id/placeholders` · `replace-placeholders`
- 习惯推荐采纳：`POST /system/recommendations/:id/adopt`
- 绑定缺口 / 配置健康：`GET /system/bindings/gaps` · `GET /system/config/health`
- Hazard 演习：`POST /security/hazard/drill`；Blueprint：`GET /ha-sync/blueprints/automation`
- HA 离线时阀/锁/报警等高风险 service 前后端双重拦截

### 前端路由

| 路由                    | 页面                 | 说明                                     |
| ----------------------- | -------------------- | ---------------------------------------- |
| `/#/setup`              | SetupView            | 首次创建管理员                           |
| `/#/activate`           | ActivationView       | 商业授权激活（离线 JWT）                 |
| `/#/login`              | LoginView            | 登录                                     |
| `/#/guest?token=`       | GuestView            | 访客受限访问                             |
| `/#/`                   | DashboardView        | 主仪表板（户型图 + 侧栏 Widget）         |
| `/#/devices`            | DevicesView          | 设备目录                                 |
| `/#/device?id=`         | DeviceDetailView     | 设备详情                                 |
| `/#/rooms`              | （重定向）           | → `/#/settings?tab=rooms` 房间配置       |
| `/#/linkage`            | LinkageHubView       | 联动中心（场景 / 自动化 / 脚本 / 模板）  |
| `/#/notifications`      | NotificationsView    | 通知收件箱                               |
| `/#/security`           | SecurityView         | 安防页（`?tab=monitor` 监控中心）        |
| `/#/events`             | EventsView           | EventLog                                 |
| `/#/reports`            | ReportsView          | 统计报表（周期对比 / 横向对比 / CSV 导出） |
| `/#/mode-logs`          | ModeTriggerLogsView  | 家庭模式触发日志                         |
| `/#/earthquake-history` | EarthquakeHistoryView | 地震预警历史                             |
| `/#/life`               | LifeView             | 生活页                                   |
| `/#/settings`           | SettingsView         | 设置（6 组 · 29 子面板）                 |
| `/#/embed/:id`          | EmbedView            | 嵌入式 iframe                            |
| `/#/builder/:id`        | WidgetBuilderView    | 小组件生成器                             |
| `/#/m/*`                | MobileLayout         | 竖屏手机壳（home / rooms / energy / alerts / more / devices / security / settings） |

### Widget、实体与布局

- **Widget**：**90+** 类型（[`widget-registry-meta.ts`](frontend/src/utils/registry/widget-registry-meta.ts)），侧栏 / 仪表盘 / 浮动组件 / 浮动基础
- **户型热点**：约 **30** 种（[`widget-type-labels.ts`](frontend/src/constants/widget-type-labels.ts)）；放置时 [`resolveWidgetType`](frontend/src/composables/widget/useWidgetPlacement.ts) 自动推断
- **实体弹窗**：**27** 种（`components/entities/popups/` + `frontend/src/utils/entity/popup-registry.ts`）
- **壳层**：`FloorplanCanvas` + `FloatingHub`；`MainLayout` → `ScaledViewport`；竖屏 `/#/m`
- **素材 / Worker**：见 [静态资源目录](#静态资源目录assets)；Worker 在 `frontend/src/workers/`

### API

前缀 `/api/v1`（`/health`、`/metrics` 除外）。Swagger：开发环境 `/api/docs`。变更类需 `X-CSRF-Token`（与 `csrf_token` Cookie 一致，`GET /auth/status` 下发）。

### 公开接口（无需登录）

| 方法 | 路径                           | 说明                      |
| ---- | ------------------------------ | ------------------------- |
| GET  | `/health`                      | 健康检查                  |
| GET  | `/metrics`                     | Prometheus 文本指标（up / HA / 实体数 / Socket 客户端；生产环境需 `METRICS_TOKEN`） |
| GET  | `/api/v1/auth/status`          | 是否已初始化 + CSRF token |
| POST | `/api/v1/auth/setup`           | 创建管理员                |
| POST | `/api/v1/auth/login`           | 登录                      |
| POST | `/api/v1/auth/guest-login`     | 访客登录                  |
| GET  | `/api/v1/system/config/public` | 公开系统配置              |
| GET  | `/api/v1/ha/status`            | HA 连接状态               |
| GET  | `/api/v1/config/icons`         | 图标列表（`assets/icons`） |
| GET  | `/api/v1/config/floorplans`    | 户型图列表                 |
| GET  | `/api/v1/config/backgrounds`   | 背景图列表                 |
| GET  | `/api/v1/config/room_images`   | 房间背景图列表             |

> `GET /api/v1/entities` 与 `GET /api/v1/config/project/:id` 需登录（JwtAuthGuard），不再作为公开接口。

### 主要受保护接口（需登录）

| 域          | 路径前缀                                                                                | 说明                                                 |
| ----------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 实体        | `/api/v1/entities`                                                                  | 实体列表（需登录）                               |
| 控制        | `/api/v1/services/call`、`/api/v1/ha/queue/retry`                                   | HA 服务调用与丢弃指令重试                    |
| 审计        | `/api/v1/audit/commands`                                                                | 操作审计                                             |
| 安防        | `/api/v1/security/*`、`/api/v1/security-panel/*`                                        | 安防事件与面板                                       |
| 系统        | `/api/v1/system/*`                                                                      | 配置、语音、媒体、客户端电量、诊断、灾备 |
| 能源        | `/api/v1/energy/*`                                                                      | 趋势、预算、电价、光伏、分路             |
| 环境        | `/api/v1/environment/*`                                                                 | 健康、IAQ、趋势、用水                    |
| 客户端电量  | `/api/v1/system/client-power/report`                                                    | 上报终端电量（需登录）                               |
| 客户端电量  | `/api/v1/system/client-power/status`                                                    | 各终端电量快照                                       |
| 客户端电量  | `/api/v1/system/client-power/pending`                                                   | 待配对客户端（管理员）                               |
| 模式        | `/api/v1/modes`                                                                         | 家庭模式                                             |
| 通知        | `/api/v1/notifications`                                                                 | 通知与告警规则                                       |
| 配置        | `/api/v1/config/*`                                                                      | 方案 / 素材（户型图·图标·背景·房间图）上传删除 / 导入导出 |
| 联动器      | `/api/v1/automation`、`/scene`、`/script`、`/template-entity`                           | CRUD + HA 同步                                       |
| 同步        | `/api/v1/ha-sync`                                                                       | HA 联动器发现、Blueprint 列表与 YAML 校验            |
| 占位 / 健康 | `/api/v1/automation/:id/placeholders`、`/system/config/health`、`/system/bindings/gaps` | 占位扫描替换、配置健康分、绑定缺口                   |
| 演习        | `/api/v1/security/hazard/drill`                                                         | 烟/燃气/漏水联动演习（跳过关阀）                     |
| 日志        | `/api/v1/event-logs`、`/api/v1/rooms`                                                   | 事件日志与房间                                       |

### 环境变量

| 变量                                    |   必需    | 默认值                          | 说明                                                     |
| --------------------------------------- | :-------: | ------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                          | Docker 否 | compose 自动生成                | 本地开发须自行配置；连接池参数走 `PRISMA_*`，勿写 URL query |
| `POSTGRES_PASSWORD`                     | Docker 否 | 全新部署自动生成                | 写入 `./secrets/postgres_password`；已有数据卷勿改         |
| `REDIS_PASSWORD`                        | Docker 否 | 全新部署自动生成                | 写入 `./secrets/redis_password`                            |
| `PORT`                                  |    否     | `8501`                          | 监听端口                                                 |
| `REDIS_URL`                             |    否     | compose 注入                    | 须含 Redis 密码；不设则仅内存缓存                        |
| `JWT_SECRET`                            |    否     | 自动生成                        | 写入 `data/.jwt-secret` 卷                               |
| `GUEST_PASS_SECRET`                     |    否     | 自动生成                        | 写入 `data/.guest-pass-secret` 卷                        |
| `JWT_EXPIRES_IN`                        |    否     | `30d`                           | JWT / WebSocket 会话有效期（墙屏常亮建议 365d）          |
| `HA_URL` / `HA_TOKEN`                   |    否     | —                               | 可在 UI 配置                                             |
| `HOST_IP`                               |  NAS 是   | —                               | Linux 容器访问同机 HA                                    |
| `CORS_ORIGINS`                          |    否     | 局域网白名单                    | 公网部署务必限制                                         |
| `COOKIE_SECURE`                         |    否     | `auto`（compose）               | `true`/`false`/`auto`                                    |
| `TRUST_PROXY`                           |    否     | 仅私有网段/回环                 | 反代信任策略（同 Express `trust proxy` 取值）           |
| `METRICS_TOKEN`                         |    否     | —                               | 生产环境 `/metrics` 的 Bearer/query token；未设则 404     |
| `FLOORPLANS_DIR`                        |    否     | `/app/floorplans`（Docker）     | 本地默认 `./assets/floorplans`                           |
| `BACKGROUNDS_DIR`                       |    否     | `/app/backgrounds`（Docker）    | 本地默认 `./assets/backgrounds`                          |
| `ICONS_DIR`                             |    否     | `/app/icons`（Docker）          | 本地默认 `./assets/icons`                                |
| `ROOM_IMAGES_DIR`                       |    否     | `/app/room_images`（Docker）    | 本地默认 `./assets/room_images`                          |
| `LOGO_DIR`                              |    否     | `/app/logo`（Docker）           | 本地默认 `./assets/logo`（`logo.svg` → `/logo/logo.svg`） |
| `SOUNDS_DIR`                            |    否     | `/app/sounds`（Docker）         | 本地默认 `./assets/sounds`                               |
| `HA_CONFIG_DIR`                         |    否     | —                               | 本机 HA config（低于系统参数优先级）                     |
| `PRISMA_CONNECTION_LIMIT` 等            |    否     | `10` / `30` / `10`              | Prisma 连接池/超时参数（adapter-pg）                     |
| `PRISMA_MAX_RETRIES` / `PRISMA_RETRY_DELAY_MS` | 否 | `3` / `2000`              | 启动时数据库连接失败重试                                   |
| `HOMEOS_HARDENED`                       |    否     | Compose `1`                     | 生产拒绝过弱 / 演示默认 DB 密码（≥12 位随机）            |
| `MCP_GATEWAY_SECRET`                    |    否     | —                               | MCP 网关密钥（也可用 UI `mcpGatewaySecret`）             |
| `MCP_GATEWAY_ALLOW_IPS`                 | 生产 MCP  | —                               | 逗号分隔 IP/网段前缀；生产未配置则拒绝全部 MCP 请求      |
| `WS_PUSH_MAX_BUFFER_MB`                 |    否     | `32`                            | Socket.IO 单帧缓冲上限 MB（8~50）                        |
| `EVENTLOG_RETENTION_DAYS`               |    否     | `7`                             | 事件日志保留天数（AppConfig 优先，此为 fallback）       |
| `AGENT_ALLOW_MOCK`                      |    否     | `false`（生产）                 | 生产默认关闭 Mock LLM；未配置 Key 时 Agent 返回错误     |
| `LICENSE_REQUIRED`                      |    否     | 生产 `1` / 其它 `0`             | `1` 启用商业授权门禁；未设置时 production 默认开启；未激活仅放行登录/激活等引导接口 |
| `LICENSE_DIR` / `LICENSE_FILE`          |    否     | `/app/license`（Docker）        | 宿主机 `./license/license.jwt`                           |
| `LICENSE_PUBLIC_KEY` / `_PATH`          |    否     | 构建内嵌公钥                    | 验签 PEM；须与卖家侧签发密钥对匹配                        |
| `HOMEOS_LICENSE_BYPASS`                 |    否     | —                               | 仅非 production 开发绕过；production 设置将拒绝启动      |
| `HOMEOS_INTERNAL_SECRET`                |  多副本是  | 自动生成并持久化到 `data/.internal-secret` | 多副本内部 HMAC 共享密钥（Follower→Leader 命令桥接）；未配置时各实例须共享 data 卷，否则命令校验失败 |

模板见 [`backend/.env.example`](backend/.env.example)、[`.env.docker.example`](.env.docker.example)。

> 站内通知 = 应用内 + Socket + TTS；外部渠道见 ChannelsModule。
>
> **商业授权**：生产默认门禁。`/#/activate` 复制指纹 → 卖家侧签发工具签发 → 写入 `./license/license.jwt`。飞牛/Linux 默认挂载 `/etc/machine-id`；本地可 `LICENSE_REQUIRED=0`。

---

### 数据库模型

Prisma schema：[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)（**43** 个 model）

| 模型                                                         | 说明                       |
| ------------------------------------------------------------ | -------------------------- |
| `User` / `LoginAudit` / `GuestShareCode`                     | 用户、登录审计、访客分享码 |
| `ProjectConfig` / `SystemConfig` / `RuntimeKv`               | UI 方案、AppConfig 单例、运行时快照 |
| `EventLog`                                                   | 实体状态变更日志           |
| `CommandAudit`                                               | HA 调用审计                |
| `Automation` / `AutomationVariable` / `Scene` / `Script` / `TemplateEntity` | 联动器主表（含自动化变量） |
| `AutomationExecution` / `SceneExecution` / `ScriptExecution` | 联动器执行历史             |
| `Notification` / `AlertRule`                                 | 通知与告警规则             |
| `SecurityEvent` / `EarthquakeAlertHistory`                   | 安防面板事件、地震预警历史 |
| `HomeMode` / `ChildModeRuntime`                              | 家庭情景模式、儿童模式运行时 |
| `SceneSchedule`                                              | 场景定时触发               |
| `DeviceLifespan` / `DeviceUsageStat`                         | 设备健康与使用统计         |
| `EnergyBaseline` / `EnergyHourlyBaseline`                    | 能源基线（时/日级）        |
| `EnergyUsageDaily` / `EnergyUsageMonthly`                    | 能源用量统计（日/月级）    |
| `EnergyCandidateEntity`                                      | 能源候选实体               |
| `EnvironmentRecord` / `WaterRecord`                          | 环境与用水记录             |
| `PricingConfig`                                              | 电价阶梯配置快照           |
| `ScheduleItem` / `AdvisorCooldown`                           | 日程提醒、顾问冷却         |
| `AdaptiveOverride` / `ActivityBaseline`                      | 温控覆盖学习、活动基线     |
| `AwayPatternBucket` / `Recommendation`                       | 离家模式统计、习惯推荐     |
| `GuestPass` / `WebPushSubscription`                          | 访客门锁临时密码、WebPush 推送订阅 |
| `Area` / `AreaEntity`                                        | 区域与区域实体             |

---

### 故障排查

### 常见问题

**HA 连接失败 / Docker 实体数为 0**

- 容器内勿填 `localhost`；用 `host.docker.internal` 或宿主机 LAN IP
- 设置 → HA 连接 → 测试连接
- `docker compose logs homeos | findstr "HA"`
- `curl http://localhost:8126/health` 查看 `ha_connected`、`entity_count`

**平板户型图拉伸 / 侧栏挤压**

- 设置 → 仪表板布局 → 开启「整页等比缩放」
- 将「中控页面最大宽度」设为 **1366**，或点「匹配当前屏幕」
- 短边 ≥ 600px 的平板应显示顶栏 Tab + 右侧信息栏（非底栏手机布局）

**前端白屏 / 数据陈旧 / API 502**

- 确认后端已启动：`curl http://localhost:8501/health`
- 后端冷启动约 15s，此前前端可能报 `ECONNREFUSED` 或 502
- 端口占用：自行结束占用 8501 / 5173 的进程
- 清除 IndexedDB `homeos_entity_cache`
- 清除 Vite 预构建缓存：删除 `frontend/node_modules/.vite` 后重启 `dev:frontend`

**摄像头无画面 / WebRTC 失败**

- 确认 HA 中 camera 实体在线且 `frontend_stream_type` 为 `web_rtc` / `hls` 或支持 `camera_proxy_stream`
- HTTPS 访问 HomeOS + HTTP HA 时，WebRTC 信令经 `/api/v1/ha/webrtc/negotiate` 转发，无需浏览器直连 HA
- 浏览器 Console 无 CORS / mixed-content 报错；若有，检查是否仍使用旧版直连 HA URL
- WebRTC 跨网段需 **TURN** 中继：设置 → 高级参数 → **WebRTC / TURN** 填写 coturn 地址；或在 HA 侧配置 ICE 后由 HomeOS 自动合并
- 自动降级：WebRTC → HLS（Safari 原生 / 其它浏览器 hls.js）→ MJPEG → 快照

**访客门铃 / 访客看摄像头**

- 访客 JWT 默认**不能**访问摄像头；须在 **设置 → 访问控制 → 访客链接** 的「实体白名单」中加入门铃实体，如 `camera.doorbell`
- 白名单写入访客 token 的 `restrictions`；仅列出的 `camera.*` 可调用 WebRTC / 流代理
- 未配置白名单时，门铃弹窗仍可显示，但实时画面会被拒绝（403）

**WebSocket 不工作**

- 反代需支持 WebSocket Upgrade
- Console：`window.__homeos_socket__?.connected`

**联动器同步失败**

- HA ≥ 2024.2；Token 需读写配置权限
- `POST /api/v1/ha-sync/validate-yaml` 校验 YAML
- 检查 `automation.haSyncEnabled` 与漂移标记

**墙面板电量不上报 / 自充不生效**

- `clientPower.enabled` + 终端已配对；局域网用 HTTPS `:8443`（见 [内网 HTTPS](#内网-https-与混合内容)）
- Chrome / Edge；Safari / iOS 无 Battery API；`localhost` 开发可读电量
- 检查充电器实体与滞回阈值；`GET /api/v1/system/client-power/status`

**获取 HA 长期访问令牌**：HA → 用户头像 → 安全 → 长期访问令牌 → 创建

**Logo / 音效 404**：确认 `assets/logo/`、`assets/sounds/` 可写且已挂载；硬刷新或清 SW；见 [静态资源目录](#静态资源目录assets)

### 诊断命令

```bash
curl http://localhost:8501/health
docker compose logs -f homeos
docker exec -it homeos-postgres psql -U homeos -d homeos
```

**开发调试（可选）**：桌面浏览器 `Ctrl+K` 打开命令面板；Console 日志前缀 `[HomeOS:DEBUG/WARN/ERROR]`。

---

## 许可证

私有软件（`UNLICENSED`）。运行时授权见 [环境变量](#环境变量)（私钥勿打入用户镜像）。
