# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控。版本号的唯一来源是根 `package.json` 的 `version`。

| 我想 | 做什么 | 去看 |
| --- | --- | --- |
| 改代码 | `bun install && bun run dev` | [§3](#3-本地开发) |
| 实时数据 / 静态资源问题 | 查两条 WS 通道与静态交付 | [§4](#4-运行时) |
| 改模型或材质 | 先看契约生成顺序 | [§5](#5-3d-studio-与模型库) |
| 装自己这台（含商店） | `docker compose up -d` | [§6](#6-部署) |
| 给客户装一台 | `docker compose -f docker-compose.app.yml up -d` | [§6](#6-部署) |

---

## 1. 入口

| 能力 | 路由 |
| --- | --- |
| 3D 仪表盘 | `/`、`/display/:projectId`、`/homeos/:name` |
| 户型绘制 | `/3d-studio` |
| 面板编辑器 | `/studio/editor`（从「设置 → 布局」进入） |
| 设备 | `/devices`、`/device` |
| 房间 | `/rooms` → 重定向 `/settings?tab=rooms` |
| 安防 / 通知 | `/security`、`/notifications` |
| 其它 | `/events`、`/earthquake-history`、`/mode-logs`、`/settings` |
| 内嵌 | `/embed/:id`、`/embed/movie-pilot` |
| 3D 舞台 | `/api/v1/modules/interaction3d/stage.html` |
| 认证外 | `/login`、`/register`、`/reset-password`、`/activate`、`/license-recovery` |

后端领域（`homeos/backend/src/domains/`）：

| 领域 | 内容 |
| --- | --- |
| `ha` | HA WebSocket 订阅 + REST 回退、实体目录、状态中枢 |
| `security` / `alerts` | 布防、区域、告警规则、安防事件 |
| `earthquake` | 地震预警（中国地震台网 / 四川局 / Wolfx EEW） |
| `awareness` | STT / TTS / 语音指令 |
| `agent` | LLM 提供商、工具调用、记忆、`mcp/` |
| `notification` / `channels` | 通知持久化与投递（Email / WebPush / 企微） |
| `home_mode` / `home_exec` | 家庭模式、场景执行 |
| `backup` / `retention` | 自动备份、数据库留存清理 |
| `weather` / `fonts` / `ui_config` / `app_config` | 天气、字体子集、界面配置 |
| `license` / `store` | 授权校验、商店客户端 |
| `studio3d` / `state_store` | 场景存档、共享状态 |

另有 MCP 网关 `/api/v1/mcp`（+ `/sse`），鉴权为 IP 白名单 + `x-homeos-mcp-key`，不走 JWT/CSRF。

## 2. 结构与约定

### 目录

```text
HomeOS/
├── homeos/                        # 主应用
│   ├── backend/src/               # FastAPI（包名 src）
│   │   ├── api/                   # 路由：auth / ha / projects / studio3d / mcp / security …
│   │   ├── domains/               # 领域服务（见 §1 领域表）
│   │   ├── platform/              # core / http_cache / security
│   │   ├── realtime/              # Socket.IO 网关、状态中枢、广播
│   │   ├── panel/ modules/        # 面板模块、interaction3d 运行时投放
│   │   └── bootstrap/             # 装配、中间件、静态挂载、lifespan
│   ├── frontend/
│   │   ├── src/                   # views / features / components / composables / stores
│   │   │                          # shared / studio / router / services / layouts / styles / workers
│   │   ├── src/studio/            # 3D 创作、面板编辑器与渲染器、实时舞台（runtime/）
│   │   ├── scripts/models/        # 模型库工具：重建、目录归位、契约与名字索引
│   │   ├── vite.config.ts         # 主应用构建（含资源版本戳、发布到 dist）
│   │   ├── vite.runtime.config.ts # 第二条构建：runtime/** 每个 .ts 一个入口
│   │   └── public/static/3d-studio/models/   # 336 个 id / 672 个 GLB（27 MB）
│   ├── assets-default/            # 随镜像烘焙的默认 UI 素材（容器内 /app/assets-default）
│   ├── data/                      # 源码态运行时数据（不入库；容器内 /data）
│   └── scripts/run.mjs            # TS 侧 prep / typecheck / build 编排
├── homeos-store/                  # 授权商店
│   ├── backend/src/               # api / commerce / licensing / payments / security / core / infra / ops
│   ├── frontend/
│   │   └── scripts/stage-plan.mjs # 首屏 3D 舞台示意图生成
│   └── data/ keys/local/          # 源码态运行时数据 + 开发态授权密钥
├── packages/
│   ├── shared/                    # @homeos/shared 前端共享契约包
│   │   └── scene/static/          # 场景 CSS / 字体的唯一真源
│   └── shared-py/                 # homeos_shared Python 共享包（构建期各自内联进 .so）
├── ops/
│   ├── gates.mjs                  # 门禁清单（唯一来源）
│   ├── dev.mjs / build.py / ports.mjs   # 本地联调 / 镜像与后端构建 / 端口唯一真源
│   ├── docker-pins.json           # 基础镜像 tag + digest 真源
│   ├── contracts/                 # feature_codes.json（能力码唯一真源）
│   ├── checks/                    # 架构 / 模型 / 棘轮 / 边界门禁
│   ├── scripts/                   # 构建期产物处理：CSS 压缩、预压缩 sidecar、codemod
│   ├── release/                   # set-version.mjs
│   ├── dev/                       # clean-local.mjs
│   ├── deploy/                    # 公网接入与穿透示例、preflight.sh、run-backend.sh
│   └── ci/ docker/ caddy/ vite/   # 容器入口、Caddyfile、Vite 辅助、CI 脚本
├── assets/                        # 运行期可替换 UI 素材（挂载到 /app/assets）
├── backups/                       # 备份包落点（挂载到 /data/backups）
├── keys/                          # 授权公钥（私钥只在商店侧）
├── dist/                          # 构建产物（不入库；镜像只消费它）
├── docker-compose.yml             # 管理员这台：商店 + 主应用
├── docker-compose.app.yml         # 客户机：只有主应用
├── Dockerfile                     # 双目标运行镜像：--target app / --target store
└── package.json / bun.lock        # 版本号唯一来源 + 全仓唯一依赖锁
```

`homeos/data/` 与 `homeos-store/data/` 是源码态运行时数据，容器内对应 `/data`。

### 两个独立项目

| 项目 | 部署位置 |
| --- | --- |
| `homeos` | 每台客户机 |
| `homeos-store` | 厂商侧唯一一台 |

互不 import 后端包。主应用启动时 `GET /v2/keys` 取授权公钥并缓存到数据卷，之后商店不可达可离线启动。

| 服务 | 容器名 | HTTP | HTTPS | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803（自签） | `/login` |
| 商店 | `homeos-store` | 8802 | —— | `/setup`、`/admin` |

容器名 / 镜像名 / 数据卷名里的 `homeos` 不改（改名即换卷，且 hostname 参与授权指纹）。

### 全局约定

- 产物只进根 `dist/`，镜像只消费它。
- 依赖只在仓库根装一份（`bun.lock` 唯一，子包无 `node_modules`）。
- 磁盘中文文件名、代码英文 id；存档 / 撤销历史 / 导出包按 id 引用。
- `docs/` 不入库，只放可重跑产物；快照路径由 `model-audit-paths.mjs` 给（默认 `docs/model-audit/`），留历史用 `--out`。
- Python 解释器只走 `ops/lib/py.mjs`（`HOMEOS_PYTHON` → `.venv-store` → `python3`），脚本不写死路径。
- 门禁只登记在 `ops/gates.mjs`，workflow 不另抄命令。

## 3. 本地开发

依赖：Bun 1.4.4、Python 3.15+。端口真源：`ops/ports.mjs`。

```bash
bun install
bun run setup:hooks
bun run dev
bun run dev -- --lan     # 局域网
```

`setup:hooks` 装 `.githooks/`：`pre-commit` 拦场景生成物，`pre-push` 就地跑 `gate:static`（约 60s，
失败中止推送；`git push --no-verify` 跳过）。

| 地址 | 用途 |
| --- | --- |
| 127.0.0.1:8805 | 主应用 HMR |
| 127.0.0.1:8806 | 商店 HMR |
| 127.0.0.1:8801/login | 主应用 API |
| 127.0.0.1:8802/setup | 商店 API |

`bun run dev` 自带 watch-build（`frontend/{src,public}` 与 `studio/runtime` → 根 `dist/`，刷新 8801 生效），`--no-watch-build` 关闭。只绑 `127.0.0.1`。

| 脚本 | 作用 |
| --- | --- |
| `dev:backend` | 只起两个后端 |
| `dev:frontend` / `dev:store` | 只起 Vite HMR |
| `dev:prepare` | 只装 `.venv-store` |
| `dev:runtime` | 只 watch runtime 构建 |
| `build` | 前端（Vite + CSS 压缩 + 预压缩）+ 后端（Cython `.so`）→ `dist/` |
| `build:app` / `build:store` | 单侧前端 |
| `check:precompress` | 校验 `.br` / `.gz` sidecar |
| `image:app` / `image:store` | 组装运行镜像 |
| `set-version <x.y.z>` | 全仓版本槽位对齐 |
| `typecheck` | shared 构建 + 两个前端 `vue-tsc` |
| `typecheck:node` | vite 配置 / `ops` 脚本类型 |
| `lint:py` | `ruff check`（Python 唯一阻断项；类型检查无 `bun run` 入口） |

### 门禁

清单唯一来源 `ops/gates.mjs`（`--list` 查）。分三层：阻断（`gate:*`）、手动审计（`audit:*`）、生成（`generate:*` / `organize:*` / `index:*` / `rebuild:*` / `build:slot-contracts`）。

| 组 | 管什么 | 项 |
| --- | --- | --- |
| `static` | typecheck / Biome / ruff / node 类型、场景资源、`any` 与重复代码棘轮、画布断点与缩放、DOM 工厂、多边形与场景载荷不变量、样式棘轮、静默 `except`、async DB、Python 锁与镜像导入、PEP 758、WS 鉴权、路由基线与 API 契约、文件体积 / 复杂度、studio 拆分、前后端依赖方向 | 36 |
| `model` | 几何、槽位、槽位角色、材质角色、资产、目录布局、中文名索引 | 7 |
| `build` | 清 `dist` → 构建与产物断言 → 预压缩 → chunk 初始化顺序 → 字体子集 | 4 |
| `infra` | shellcheck / actionlint / compose ×3 / Caddy 格式与校验 / Cython | 9 |

`bun run gate` = static + model。`node ops/gates.mjs --all` 含 build + infra。缺工具本机 SKIP、CI 失败。

棘轮（`any` / 重复代码 / 代码量 / 样式 / 复杂度 / 文件体积）只许降。`update:<同名>` 是放宽手段。

### 调试

`bun run dev -- --debug` → attach 主应用 `8811`、商店 `8812`。端口占用时 `pkill -f ops/dev.mjs`。

首次联调：`/login` 建本机账号（验证码由商店代发）→ `/activate` → 商店 `/setup` 建管理员、`/admin` 配 SMTP 与支付 → 下单拿码后回来填下单邮箱 + 激活码 → 配 HA → `/3d-studio` 保存户型。激活码按商店下单邮箱归属。

## 4. 运行时

| 通道 | URL | 用途 |
| --- | --- | --- |
| 实体流（Socket.IO） | `/socket.io/` | 全量快照 + 增量 delta，`since` / `lastEventId` 续传 |
| 舞台流（原生 WS） | `/api/v1/ws/runtime` | 按订阅集合下快照 + 增量，一槽多分片、`update_subscription` |
| MCP | `/api/v1/mcp`（+ `/sse`） | IP 白名单 + `x-homeos-mcp-key` |

bfcache 交接在 `shared/utils/page-cache-lifecycle.ts`：`pagehide(persisted)` / `freeze` 断开并保留订阅，`pageshow(persisted)` / `resume` 重连。`Page entered Back-Forward Cache` 是 Chrome 149+ 预期行为，JS 侧消不掉。

静态交付三层：

| 机制 | 真源 |
| --- | --- |
| 内容哈希文件名 `/static/assets/<name>-<hash>.js` | Vite |
| 稳定 URL 补 `?v=<revision>` | `writeResourceVersion()` → `resource-version.json` → `frontend_resources.py` |
| 预压缩 sidecar `.br` / `.gz`（同目录同名同 mtime） | `ops/scripts/precompress-static.mjs` |

`/static/vendor/<lib>/<版本>/` 发 `immutable`（一年）。`sw.js` 缓存名 = revision。

`studio/runtime/**` 是第二条构建：每个 `.ts` 是入口，按 `/api/v1/modules/interaction3d/<相对路径>.js` 投放，**URL 即公网路径**。

## 5. 3D Studio 与模型库

创作页与展示页共用 `buildStudioScene`。根应用只 `import '@/studio'`，不直达 `@app/*` / `@runtime/*`（`check:frontend-deps` 守）。

### 模型库

`homeos/frontend/public/static/3d-studio/models/`：3 个一级分区、32 个二级目录、336 个 id、672 个 GLB（27 MB）。

- 每 id 两文件：`<中文名>-lite.glb`（首选）、`<中文名>.glb`（兜底）。
- 磁盘中文名、代码英文 id；映射在 `model-asset-folders.ts` + `model-file-names.generated.ts`。
- `MODEL-NAMES.md` 由 `bun run index:model-names` 生成。
- 物品模型 14 族 / 59 类型分支（`item-model/`），族序不可重排。
- vendor：three 0.187.0、hls.js 1.7.4、meshoptimizer 0.25、mdi 7.4.47。

新增模型：`model-asset-folders.ts` 登记 id → 放两个 GLB → `StudioView.vue` 加 `data-library-name` 卡片 → `index:model-names` → `gate:model`。

### 材质契约（生成物）

| 文件 | 命令 |
| --- | --- |
| `model-slot-contracts.json` | `build:slot-contracts` |
| `model-slot-roles.generated.ts` | `generate:slot-tables` |
| `legacy-material-aliases.generated.ts` | `generate:slot-tables` |
| `material-role-baseline.json`（672 文件 / 3136 条） | `audit_glb_materials.mjs --write-role-baseline` |
| `asset-baseline.json`、`geometry-baseline.json` | 对应 `audit:*` |

顺序：`audit:materials`（写 `docs/model-audit/glb-material-audit.json`）→ `build:slot-contracts` → `generate:slot-tables`。日常构建只需已提交的 `model-slot-contracts.json`。

### 模型门禁

| 命令 | 作用 |
| --- | --- |
| `check:assets` | GLB 结构 |
| `check:geometry` | 包围盒 / 拓扑 / 面数 |
| `check:slots` | 槽位命名与契约 |
| `check:slot-roles` | 槽位角色与契约一致 |
| `check:materials` / `audit:materials` | 材质角色指纹 / 写报告 |
| `check:models-layout` / `organize:models` | 目录布局 |
| `check:model-names` / `index:model-names` | 中文名索引 |
| `check:studio-split` | 拆分预算 + 物品模型等价性（`static` 组） |
| `rebuild:items` | 按配方重建精修件 |

无 `repair:*` 层。模型坏了用 `audit:*` 定位后重导出或 `rebuild:items`。

## 6. 部署

| 文件 | 起什么 | 给谁 |
| --- | --- | --- |
| `docker-compose.yml` | 商店 + 主应用 | 管理员这台 |
| `docker-compose.app.yml` | 只有主应用 | 客户机 |

前者商店与主应用同机（`http://homeos-store:8802`）；后者商店地址为公网域名。

环境变量、内网 HTTPS 与 SNI、穿透、备份与升级、排错：见 `.env.example` 与两个 compose 的注释。

镜像：`bun run build` → `bun run image:app` / `image:store`。基础镜像按多架构 digest 钉死，真源 `ops/docker-pins.json`。

## 7. 版本真源

| 值 | 真源 | 消费方 |
| --- | --- | --- |
| 产品版本 | 根 `package.json` | `set-version.mjs` 同步各槽位；`_version.py` 构建期生成 |
| JS 依赖 | `package.json` + `bun.lock` | 全仓（hoisted） |
| Bun | `packageManager` | workflow `bun-version` |
| Python 依赖 | 两个 `requirements.txt` | `python_lock.py` → 根 `requirements.lock`（48 项 + sha256） |
| Python | `Dockerfile` 的 `PYTHON_IMAGE` + `python_lock.py` | 构建 |
| 基础镜像 digest | `ops/docker-pins.json` | Dockerfile ARG / compose / `ops/build.py` |
| 端口 | `ops/ports.mjs` | dev 脚本 / compose |

改 Python 依赖必须 `python3 ops/ci/python_lock.py generate`（单包 `--upgrade-package <名>`），否则 `check:python-lock` 与镜像 `--require-hashes` 都会失败。`overrides` 与子包声明要一起改。

## 8. 文档

| 文档 | 内容 |
| --- | --- |
| `ops/gates.mjs` | 门禁清单 |
| `ops/docker-pins.json` | 基础镜像 tag / digest |
| `MODEL-NAMES.md` | 模型中文名索引（生成，`index:model-names`） |
| [`meshoptimizer LICENSE`](homeos/frontend/public/static/vendor/meshoptimizer/0.25/LICENSE.md) | 第三方许可（勿改） |
| `.env.example` | 全部环境变量 |

全仓库只有这三个 `.md`（本文件 + 上面两个生成/第三方文件），不另维护文档副本：约定写在门禁脚本、部署信息写在 compose 与 `.env.example`。

| 工作流 | 触发 | 内容 |
| --- | --- | --- |
| `checks.yml` | push 到 main、PR、`workflow_call`、手动 | static / model / build / lint-infra 四个 job |
| `docker.yml` | 手动 | amd64 + arm64 → GHCR；发版前经 `workflow_call` 复用 checks |
| `audit.yml` | 每周一 03:17 UTC、手动 | `bun audit --production`、依赖许可证、`pip-audit`、`detect-secrets` |
