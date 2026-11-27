# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控。版本号的唯一来源是根 `package.json` 的 `version`（本文件不重复写版本号，避免与真源脱节）。

| 我想 | 做什么 | 去看 |
| --- | --- | --- |
| 改代码 | `bun install && bun run dev` | [§3](#3-本地开发) |
| 实时数据 / 静态资源问题 | 查两条 WS 通道与静态交付 | [§4](#4-运行时) |
| 改模型或材质 | 先看契约生成顺序 | [§5](#5-3d-studio-与模型库) |
| 改设置页某个面板 | 先看「设置页结构」与卡片约定 | [§2.3](#23-设置页结构) |
| 改工具链版本（Bun / Python / 基础镜像） | 先看唯一真源与跟随点 | [§7](#7-版本真源) |
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

后端领域（`homeos/backend/src/domains/`）。路由基线 365 operations / 292 paths（`check:routes` 守）：

| 领域 | 内容 |
| --- | --- |
| `ha` | HA WebSocket 订阅 + REST 回退、实体目录、状态中枢、实时事件合批 |
| `state_store` | 共享状态（L1 内存 + SQLite），实体区域索引，热更新 |
| `security` / `alerts` | 布防、区域、告警规则与条件运算、安防事件 |
| `earthquake` | 地震预警（中国地震台网 / 四川局 / Wolfx EEW）、跨源去重 |
| `awareness` | STT / TTS / 语音指令 |
| `agent` | LLM 提供商、工具调用、IntentGate、快路径、执行实证、记忆；`learning/`（别名 / 房间默认 / 习惯候选）、`mcp/`（网关） |
| `device_profile` | 媒体 / 空调 / 热水器的类型确认、别名、房间默认设备、人工确认审计、Apple TV 控制 |
| `media` | Music Assistant 搜索 / 点歌 + MoviePilot 入库轮询 |
| `automation` | 自动化草案（只预览不写 HA）、发现与落地 |
| `notification` / `channels` | 通知持久化、去重与投递（Email / WebPush / 企微） |
| `logs` | 操作日志、事件分层、能耗采集与自愈（SGCC、异常跳变护栏） |
| `home_mode` / `home_exec` | 家庭模式、场景执行与回放 |
| `proxy` | 命令代理唯一出口（白名单、幂等、三态后置校验） |
| `backup` / `retention` | 自动备份、数据库留存清理 |
| `weather` / `fonts` / `ui_config` / `app_config` | 天气、字体子集、界面配置、系统参数校验 |
| `license` / `store` | 授权校验、商店客户端 |
| `studio3d` | 场景存档与户型文档 |
| 运行期服务 | `lifestyle`（生活账户）、`client_power`（终端电量与充放电）、`setup`（首装向导）、`system`（运维、网络信息、僵尸绑定扫描） |

另有 MCP 网关 `/api/v1/mcp`（+ `/sse`），鉴权为 IP 白名单 + `x-homeos-mcp-key`，不走 JWT/CSRF（见 CSRF 豁免表）。

## 2. 结构与约定

### 2.1 目录

```text
HomeOS/
├── homeos/                        # 主应用
│   ├── backend/src/               # FastAPI（包名 src）
│   │   ├── api/                   # 路由：auth / ha / projects / studio3d / mcp / device_profile / media / automation …
│   │   ├── domains/               # 领域服务（见 §1 领域表）
│   │   ├── platform/              # core（db / ha / entity / http / runtime）/ security
│   │   ├── realtime/              # Socket.IO 网关、状态中枢、订阅与广播、msgpack 兼容
│   │   ├── panel/ modules/        # 面板文档与 schema、interaction3d 运行时投放
│   │   └── bootstrap/             # 装配、中间件、静态挂载、lifespan、HA 状态副作用
│   ├── frontend/
│   │   ├── src/                   # views / features / components / composables / stores
│   │   │                          # shared / studio / router / services / layouts / styles / workers
│   │   ├── src/studio/            # 3D 创作、面板编辑器与渲染器、实时舞台（runtime/）
│   │   ├── scripts/models/        # 模型库工具：重建、目录归位、契约与名字索引
│   │   ├── vite.config.ts         # 主应用构建（含资源版本戳、发布到 dist）
│   │   ├── vite.runtime.config.ts # 第二条构建：runtime/** 每个 .ts 一个入口
│   │   └── public/static/3d-studio/models/   # 336 个 id / 672 个 GLB（29 MB）
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
│   ├── contracts/                 # feature_codes.json（能力码唯一真源，18 项 / 2 组）
│   ├── checks/                    # 检查脚本，按域分目录：
│   │   ├── run_*.{mjs,py}          #   批量入口（一个进程跑完一类检查）
│   │   ├── business/               #   19 个业务规则自检 + 共享骨架
│   │   ├── python/ frontend/ contract/ studio/   # 各类静态检查
│   │   ├── architecture/ security/ #   路由契约 / 依赖方向 / WS 鉴权
│   │   ├── baselines/              #   全部棘轮基线（按域再分一层）
│   │   ├── unittests/              #   bun test + stdlib unittest
│   │   └── lib/ fixtures/          #   断言辅助、夹具
│   ├── scripts/                   # 构建期与离线工具：CSS 压缩、预压缩 sidecar、时序表瘦身
│   ├── lib/                       # 解释器入口（py.mjs）、walk、vue-tsc 与 biome 包装
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

### 2.2 两个独立项目

| 项目 | 部署位置 |
| --- | --- |
| `homeos` | 每台客户机 |
| `homeos-store` | 厂商侧唯一一台 |

互不 import 后端包。主应用启动时 `GET /v2/keys` 取授权公钥并缓存到数据卷，之后商店不可达可离线启动。

| 服务 | 容器名 | HTTP | HTTPS | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803（自签，镜像内置 Caddy） | `/login` |
| 商店 | `homeos-store` | 8802 | —— | `/setup`、`/admin` |

容器名 / 镜像名 / 数据卷名里的 `homeos` 不改（改名即换卷，且 hostname 参与授权指纹）。

### 2.3 设置页结构

`/settings?tab=<id>` 是唯一入口，侧栏分 6 组（`shared/utils/registry/settings-nav.util.ts` 是标签与文案的唯一真源）：

| 组 | 标签 |
| --- | --- |
| 入门与连接 | 首装向导 / HA 连接 / 集成绑定 / 绑定清理 |
| 家居配置 | 房间配置 / 设备画像 / 生活账户 / 智能充放电 / 常用设备库 |
| 界面与体验 | 基础设置 / 仪表板编辑 / 面板部件 / 浮动组件 / 内嵌网页管理 |
| 自动化与安防 | 家庭模式 / 安防场景 / 自动化草案 |
| 感知交互 | 语音中心 / 智能管家 / 告警规则 / 媒体与入库 |
| 系统与账户 | 家庭状态 / 访问控制 / 方案与备份 / 授权状态 / 数据保留 / 运维诊断 / 网络信息 / 高级参数 |

面板约定（`features/settings/shared/styles/` + `components/common/settings-page-shell/`）：

- 外壳统一 `SettingsPageShell`（页头 + actions + 单/双列 `layout`）+ `SettingsCard`；
- 卡片开头优先用 `SettingsCardIntro`（图标球 + 眉标 + 标题 + 说明；已有 20 处采用，新面板照抄即可）；
- 按钮只用 `settings-btn-accent / settings-btn-ghost`（紧凑档加 `settings-btn--sm`），高度取 `--control-height-*`；
- 颜色 / 时长只用 `--hos-*` / `--set-*` 令牌（约定，不再由门禁逐字面量扫描）；
- 断点用 `@container hos-canvas`，不写窗口 `@media`（约定，同上）。

开机氛围（原「素材库」入口已并入此处，不再有独立 Tab）：

- **基础设置 → 大屏背景**（`/settings?tab=general&section=backdrop`）：开灯 / 关灯两张图，
  写入布局的 `lightOnBackgroundUrl` / `lightOffBackgroundUrl`，随侧栏「保存布局」一起落库；
- 消费方是 `composables/display/display-light-backdrop.ts`：总览首页由 `MainLayout` 铺在页面布局区域，
  独立整屏（`display` / `homeos`）由 `App.vue` 铺满视口；灯亮判定优先看收藏灯，否则看 `lightCount`；
- 图片存在「随包只读层（`homeos/assets/backgrounds`）+ 用户层（`data/ui-assets/backgrounds`）」，
  `/backgrounds/**` 分层取值；删随包图只写 `.hidden-assets.json`，升级不会复活；
- 旧链接 `?tab=assets` 会自动改写到 `tab=general&section=backdrop`（`LEGACY_TAB_SECTIONS`）；
- 状态图标素材库已下线：`/icons/**` 与 `/api/v1/config/icons*` 不再存在，历史 `icons/` 目录在
  启动时改名为 `.icons-retired`（`UiConfigStaticAssetService.retire_legacy_icon_assets`，只改名不删）。
- 保存口径两种：多数面板随布局一起保存（侧栏「保存全部」），列在 `INDEPENDENT_SAVE_TABS` 的面板
  自己即时保存、不受「保存全部」影响 —— 新增面板要先决定属于哪一类，别两边都写。

### 2.4 全局约定

- 产物只进根 `dist/`，镜像只消费它。
- 依赖只在仓库根装一份（`bun.lock` 唯一，子包无 `node_modules`）。
- 磁盘中文文件名、代码英文 id；存档 / 撤销历史 / 导出包按 id 引用。
- `docs/` 不入库（`.gitignore` 忽略）：可重跑产物（模型审计、重复代码报告）与本地分析笔记都放这里，随时可删。
- Python 解释器只走 `ops/lib/py.mjs`（`HOMEOS_PYTHON` → `.venv-store` → `python3`），脚本不写死路径。
- 门禁只登记在 `ops/gates.mjs`，workflow 不另抄命令。
- 三份「唯一真源」不要各写一份：端口 `ops/ports.mjs`、能力码 `ops/contracts/feature_codes.json`、基础镜像 `ops/docker-pins.json`。

## 3. 本地开发

依赖：Bun 1.4.5（根 `packageManager`）、Python 3.15（镜像 `PYTHON_IMAGE`）——两者都由 `check:toolchain` 守。端口真源：`ops/ports.mjs`。

```bash
bun install
bun run setup:hooks
bun run dev
bun run dev -- --lan     # 局域网
```

`setup:hooks` 装 `.githooks/`：`pre-commit` 拦场景生成物，`pre-push` 就地跑 `gate:static`（约 60s，
失败中止推送；`git push --no-verify` 跳过）。pre-push 对「即将推送的提交」验证：工作区干净就地跑，
否则在临时 worktree 里检出该提交再跑，避免被未提交的 WIP 误拦。

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
| `lint:py` | `ruff check`（Python 唯一阻断项；类型检查无 `bun run` 入口，直接跑 `.venv-store/bin/pyright`） |

### 门禁

清单唯一来源 `ops/gates.mjs`（`--list` / `--list --json` 查）。分三层：阻断（`gate:*`）、手动审计（`audit:*`）、生成（`generate:*` / `organize:*` / `index:*` / `rebuild:*` / `build:slot-contracts`）。

| 组 | 管什么 |
| --- | --- |
| `static` | 类型 / lint / 契约（路由·依赖·环境变量）/ 棘轮 / 不变量 / 测试 |
| `model` | 资产·几何·槽位·材质审计 + 目录布局与中文名索引 |
| `build` | 清 `dist` → 构建与产物断言 → chunk 初始化顺序 → 字体子集 → 静态产物处理 |
| `infra` | shellcheck / actionlint / compose / Caddy 格式与校验 / Cython |

static 的步骤按**标签**分六类（`--list` 按此打印，`--tag` 可整类跑）：`types` / `lint` /
`contract` / `ratchet` / `invariant` / `business`。新增 static 步骤必须在 `TAG_GROUPS` 里登记标签，
否则启动即报错 —— 分类过期比没有分类更糟。

### 批量入口与单项调试

同一批文件被多条检查反复扫描时，门禁只登记一个**批量入口**，被合并的原脚本写进 `covers`：

| 入口 | 子检查 | 合并收益 |
| --- | --- | --- |
| `check:frontend` | 2 | 1974 个 ts/vue 只遍历一次；离线计数 / 受限写法共用同一份 `SourceFile` |
| `check:backend` | 6 | 694 个 `.py` 只 `ast.parse` 一次（此前每条都重解析）；`guards` / `parity` 各收三条 |
| `check:contracts` | 6 | 后端应用只导入一次；覆盖率检查复用前两条算出的路由表；`parity` 收两张跨语言表 |
| `check:tests` | 3 | 三类断言一个步骤，失败仍按模块定位 |
| `check:studio-invariants` | 7 | 八条不变量里画布两条合成一条（同一份 `canvas-layout.util.ts`） |
| `check:model-assets` | 4 | 四条 GLB 只读审计 |
| `check:model-index` | 2 | 目录布局 + 中文名索引 |

单项调试不必跑整批：批量入口都收 `--module`（精确名优先、其余按子串），例如
`bun run check:backend -- --module guards`；原脚本也都能单独执行
（`bun run check:parity`、`node ops/checks/python/check_guards.py --module pep758`）。

**脚本按域分目录**：`business/`（19 个自检）/ `python/`（后端 AST 检查）/ `frontend/`（前端扫描与棘轮）/
`contract/`（版本、环境变量、跨语言表）/ `studio/`（3D 与模型）/ `architecture/`、
`security/`（路由与鉴权）/ `baselines/`（全部基线）。`run_*.{mjs,py}` 留在顶层作为唯一执行入口，
`ops/checks/` 顶层因此只有 8 个文件 + 子目录。

Python 脚本的 `PYTHONPATH`（仓库根 + 各子目录）由 `ops/lib/py.mjs` 统一注入 —— 脚本里不再各写
`sys.path.insert`，否则那 3 行会变成九份克隆。

```bash
bun run gate                 # static + model（默认）
bun run gate:fast            # 日常快检：static 的 types + lint
bun run check:frontend       # 只跑前端那批
bun run check:backend -- --module kinds   # 批量入口里的单条（子串匹配）
node ops/gates.mjs --tag ratchet          # 只跑某一类
node ops/gates.mjs --step offline         # 命中 check:frontend（批量入口按 covers 匹配）
node ops/gates.mjs --group static --jobs 1  # 串行逐条看
node ops/gates.mjs --list --json          # 机器可读（含 covers）
```

默认并行 4（`--jobs` / `HOMEOS_GATE_JOBS` 可改）；`build` / `infra` 有组内先后依赖，恒为串行。
并行模式下通过的步骤只留一行结果，失败才展开完整输出。缺工具本机 SKIP、CI 失败。

仍保留的棘轮只守**语义**：接口覆盖（路由 / `response_model` / 状态码）、离线计数口径、
受限写法。`update:<同名>(-baseline)` 是放宽手段，必须在提交说明里写清为什么。基线统一放在
`ops/checks/baselines/{backend,contracts,model}/`。

已删除的门禁（连同脚本、基线、`package.json` 条目）：代码量总量（`check:code-size`）、
单文件行数审计（`audit:file-size`）、巨型文件扇出审计（`audit:giant-files`）、
重复代码棘轮（`check:duplicates`）、别名 / 性能反模式计数（`check:aliases` /
`check:perf-ratchet`）、命名与目录形态（`check:naming`）、覆盖率棘轮（`check:coverage`）、
视觉回归（`check:visual`）、可访问性基线（`check:a11y`）、Web Vitals（`check:vitals`）、
HTTP 微基准（`check:perf-http`）、依赖许可证审计（`check:licenses`）、突变测试套件、
`any` 计数、前端 / 后端函数复杂度、硬编码样式、UI 溢出、CSS 重复、CSS 令牌、画布断点、
Studio 拆分预算、0.8.9 对齐、后端热点字节预算、bundle 体积预算。它们共同的问题是把
「代码长什么样」固化成像素或数字门槛，而门槛只能靠不断重录基线维持 —— 与「不设巨型文件定义」
是同一条原则。一次性重构工具（`ops/scripts/codemod/`）也随重构收口一并删除。

**行数不作任何判据**：项目不再统计单文件行数，也不再设「巨型文件」定义；
按行数或扇出取证的手动入口已一并删除，不维护任何体量基线。

`check:toolchain` 守三条「写了两遍以上」的版本线，任何一处漂移都不影响编译、只会在换机或发版时才炸：

| 线 | 真源 | 必须跟随的地方 |
| --- | --- | --- |
| Bun | 根 `packageManager` | workflow 的 `bun-version`（禁止 `bun-version-file`）、`homeos-store` 的 `engines.bun` 下界 |
| 基础镜像 | `ops/docker-pins.json`（tag 与 digest 分开写） | `Dockerfile` 的 `ARG *_IMAGE`、compose 里同 tag 的 `image:`（含注释态可选段） |
| Python | `ops/docker-pins.json` 的 `python` 标签 | workflow 的 `python-version` |

`ruff.toml` 的 `target-version` 与 `pyproject.toml` 的 `requires-python` 是**声明**，允许落后运行时一个 minor
（上游工具链常还没支持最新 minor，强行要求相等会把「升 Python」卡在工具上），但绝不允许超前 ——
超前等于放行跑不了的语法。

业务规则层「跑断言」的门禁是 `ops/checks/business/*_selftest.py`（标准库 + 运行期依赖，不需要 pytest）。
`check:tests` 串起三类断言（bun test 契约单测 + stdlib unittest + 19 个自检模块，都在
`ops/checks/business/` 与 `ops/checks/unittests/`），单项调试仍用原脚本
（`bun run check:device-profile`、`check:backup`、`check:event-log` …）：

- 设备画像（58 项）：分类规则、别名归一与房间作用域、在线 / 可用二分、确认与审计、
  房间默认设备校验、climate / water_heater 命令校验、快路径不 fail-open；
- 备份（29 项）：排除项语义（`backups/` 永不算业务数据）、超限报错必须点名占位最大项、
  迁移快照按字节预算清理且永不清空；
- 事件日志（37 项）：能耗副作用失败时**不得**重复写事件日志、批内去重、清空世代，以及
  「保留策略的键 / 表 / 时间列必须三处对齐」（写错列名会静默删 0 行）。
- 其余：用水 / 用能 / 室内环境监测、电价与逐小时聚合、昼夜节律、日出日落、安防进入延时、
  设备倒计时、通知静音、公开配置、商店入口、UI 素材、设备时序、来源判定、命令出口。

合并只改执行方式：省掉重复的解释器启动与导入，断言一条不少；失败仍按模块名定位。
其余 `check:*` 都是「读源码 / 读产物做不变量断言」（几何、场景载荷、状态游标等）。

### 调试

`bun run dev -- --debug` → attach 主应用 `8811`、商店 `8812`（首次会装 debugpy）。端口占用时 `pkill -f ops/dev.mjs`。

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

### 4.1 几条不轻易改的语义

| 位置 | 语义 | 为什么 |
| --- | --- | --- |
| `domains/proxy/command_proxy.py` | 所有下发走唯一下发出口；`policy` 默认 `"http"`（白名单 + 字段校验），已校验的管家通道显式传 `"agent"` | 「忘传参数 = 最严」，新增通道不会静默漏校验 |
| `domains/ha/integration/live_events.py` | 状态事件先合批再落库 / 广播（默认 16ms 窗口，按实体取最后一条） | 场景切换一次推上百条，逐条事务 + 逐条广播会写放大成卡顿 |
| `domains/device_profile/` | 空调 / 热水器 kind **恒为 unknown 直到人工确认**；确认即真相，规则不再覆盖；`available`（在线）与 `usable`（可自动选中）分开 | 猜错形态会把 `hvac_mode` 发给地暖；把「待确认」当「不可用」会让面板误导 |
| `domains/device_profile/` 别名 | 只匹配**已确认**画像，且优先限定在用户提到的房间内 | 「卧室冷气」不能命中客厅的同名别名 |
| `domains/logs/` 显示行与能耗记账 | 两条路径**各自独立容错**：显示行提交后，能耗失败只损失记账，绝不能让整批回灌 | 回灌会重写已提交的行 —— 11-18→11-21 的 1200 万行重复就是这么来的（`event_logs` 1222 万行里只有 4365 条真事件，库涨到 9.9 GB） |
| `domains/logs/` 批内去重 | 同一 `(实体, 时刻, 变化)` 在一批里只写一条 | 上游重复投递不该等比例放大表体积 |
| `platform/core/db/retention.py` | 保留策略的「键 / 表 / 时间列」三处对齐（时序表是 `changedAt`，不是 `createdAt`） | 写错列名不报错，只会每轮静默删 0 行：表一直涨，面板显示「已清理」 |
| `domains/agent/runtime/fast_path*` | 只做确定性解析；有任何画像 / 多候选疑义就返回 `None` 交给 LLM | 快路径宁可不答，也不能猜错设备 |
| `domains/agent/learning/` | 别名 / 房间默认按 `household` 共享，偏好按 `user:{id}` 隔离 | 设备叫法是一家人的常识，偏好是个人习惯 |

## 5. 3D Studio 与模型库

创作页与展示页共用 `buildStudioScene`。根应用只 `import '@/studio'`，不直达 `@app/*` / `@runtime/*`（`check:deps` 守）。

### 模型库

`homeos/frontend/public/static/3d-studio/models/`：3 个一级分区、32 个二级目录、336 个 id、672 个 GLB（29 MB）。

- 每 id 两文件：`<中文名>-lite.glb`（首选）、`<中文名>.glb`（兜底）。
- 磁盘中文名、代码英文 id；映射在 `model-asset-folders.ts` + `model-file-names.generated.ts`。
- `MODEL-NAMES.md` 由 `bun run index:model-names` 生成。
- 物品模型 14 族 / 59 类型分支（`item-model/`），族序即命中优先级，重排前先确认没有交叠条件。
- vendor：three 0.187.0、hls.js 1.7.4、meshoptimizer 0.25、mdi 7.4.47、meteocons。

新增模型：`model-asset-folders.ts` 登记 id → 放两个 GLB → `StudioView.vue` 加 `data-library-name` 卡片 → `index:model-names` → `gate:model`。

### 材质契约（生成物）

| 文件 | 命令 |
| --- | --- |
| `model-slot-contracts.json` | `build:slot-contracts` |
| `model-slot-roles.generated.ts` | `generate:slot-tables` |
| `legacy-material-aliases.generated.ts` | `generate:slot-tables` |
| `baselines/model/material-role-baseline.json`（672 文件 / 3136 条） | `audit_glb_materials.mjs --write-role-baseline` |
| `baselines/model/{asset,geometry}-baseline.json` | 对应 `audit:*` |

顺序：`bun ops/checks/studio/audit_glb_materials.mjs`（写 `docs/model-audit/glb-material-audit.json`）→ `build:slot-contracts` → `generate:slot-tables`。日常构建只需已提交的 `model-slot-contracts.json`。

### 模型门禁

| 命令 | 作用 |
| --- | --- |
| `check:model-assets` | 资产 / 几何 / 槽位 / 材质四条审计（`--module` 可单跑） |
| `check:model-index` | 目录布局 + 中文名索引（`--module` 可单跑） |
| `organize:models` / `index:model-names` | 迁移目录 / 生成索引（生成物，需提交） |
| `rebuild:items` | 按配方重建精修件 |

无 `repair:*` 层。模型坏了用 `audit_glb_*` 定位后重导出或 `rebuild:items`。

### 备份包含什么

`domains/backup/business_backup.py` 的口径是「配置 + 实体目录」，**不是**整机快照：

| 进包 | 不进包 |
| --- | --- |
| 数据库（清空历史 / 时序 / 运行时缓存表后） | `data/backups/`（迁移快照与备份包自身） |
| `secrets/`（HA 令牌与授权凭据的加密密钥） | `cache/`、`logs/`、`backup-work/`、`backup-recovery/` |
| `assets/`、`studio3d/`、`exports/`、场景与窗帘记忆 | `event_logs`、`notifications`、能耗与时序、`agent_context_timeline`、`agent_task_execution_logs`、`sessions`、HA 目录缓存 |

判据是「换机后是否仍然有意义」：配置、用户、设备画像、别名、场景要留；「什么时候什么变成了什么」
不要 —— 那是本机的观测历史，不是家的配置。表的清单在 `domains/backup/scope.py`（`EXCLUDED_DB_TABLES`）。

两条容易踩的边界：

- **排除项必须覆盖 `data_dir/backups`**。迁移前快照默认落在 `backups/schema/*.db`，每份都是整库的
  `VACUUM INTO` 副本；漏排时备份会把自己装进去（实测 9.9 GB 的库被收成 54 GB 而失败）。
- **上限是「展开后 4 GB / 50000 文件」**，超限报错必须点名占位最大的几项，否则排查只能靠猜。
  `check:backup` 钉住这两条。
- **历史表要同时有保留策略**。`agent_context_timeline` 曾既进备份又无清理（2 个多月 224 万行 /
  0.94 GB）；现在它已不进包，并在「数据保留」里有一行可调（默认 30 天），
  `check:event-log` 钉住「键 / 表 / 时间列」对齐。

## 6. 部署

| 文件 | 起什么 | 给谁 |
| --- | --- | --- |
| `docker-compose.yml` | 商店 + 主应用 | 管理员这台 |
| `docker-compose.app.yml` | 只有主应用 | 客户机 |

前者商店与主应用同机（`http://homeos-store:8802`）；后者商店地址为公网域名。

环境变量、内网 HTTPS 与 SNI、穿透、备份与升级、排错：见 `.env.example`（约 90 个变量，分 A–G 七段）与两个 compose 的注释。模板里不允许出现没有读取方的键（`check:env-inventory` 守）。

镜像：`bun run build` → `bun run image:app` / `image:store`。基础镜像按多架构 digest 钉死，真源 `ops/docker-pins.json`。

## 7. 版本真源

| 值 | 真源 | 消费方 |
| --- | --- | --- |
| 产品版本 | 根 `package.json` | `set-version.mjs` 同步各槽位；`_version.py` 构建期生成 |
| JS 依赖 | `package.json` + `bun.lock` | 全仓（hoisted） |
| Bun | 根 `packageManager`（`homeos-store` 另有 `engines`）；CI 的 `bun-version` 必须跟随，`check:toolchain` 守 | workflow `bun-version` |
| Python 解释器 | `ops/docker-pins.json` 的 `python` 标签 | `Dockerfile` 的 `PYTHON_IMAGE`、workflow 的 `python-version`、`ruff.toml` / `pyproject.toml` 的声明（允许落后一个 minor） |
| Python 依赖 | 两个 `requirements.txt` | `python_lock.py` → 根 `requirements.lock`（49 项 + sha256），构建按 `--require-hashes --only-binary=:all:` 装 |
| 基础镜像 digest | `ops/docker-pins.json` | Dockerfile ARG / compose / `ops/build.py`（`check:toolchain` 对账） |
| 端口 | `ops/ports.mjs` | dev 脚本 / compose |
| 设置页标签与文案 | `shared/utils/registry/settings-nav.util.ts` | 侧栏 / 页头 / 深链 |
| 能力码 | `ops/contracts/feature_codes.json` | 授权校验（18 项 / 2 组） |

改 Python 依赖必须 `python3 ops/ci/python_lock.py generate`（单包 `--upgrade-package <名>`），否则 `check:python-lock` 与镜像的哈希校验都会失败。`overrides` 与子包声明要一起改。

镜像装依赖同时要求 `--require-hashes` 与 `--only-binary=:all:`：前者校验下载物的哈希，后者禁止任何「没有兼容轮子就退回源码编译」的降级 —— 两件事独立，只靠前者时，锁里同时钉了 sdist 哈希的包会静默走源码编译，而 base 阶段没有 C/Rust 工具链，失败点会停在编译器上而非真因（基础镜像 glibc 太旧，见 `Dockerfile` 里 trixie 那段）。因此**升级基础镜像或改 Python minor 时必须核对锁里每个包是否都有匹配的轮子**：比 `manylinux_2_<N>` 的 N 还低的 glibc 会让对应包直接装不上。

## 8. 文档

| 文档 | 内容 |
| --- | --- |
| `ops/gates.mjs` | 门禁清单 |
| `ops/docker-pins.json` | 基础镜像 tag / digest |
| `ops/ports.mjs` | 端口表（含归属 dev / proxy / debug） |
| `MODEL-NAMES.md` | 模型中文名索引（生成，`index:model-names`） |
| [`meshoptimizer LICENSE`](homeos/frontend/public/static/vendor/meshoptimizer/0.25/LICENSE.md) | 第三方许可（勿改） |
| `.env.example` | 全部环境变量 |

**入库**的 `.md` 只有三个：本文件、`MODEL-NAMES.md`（生成）、`meshoptimizer LICENSE.md`（第三方）。不另维护文档副本：约定写在门禁脚本、部署信息写在 compose 与 `.env.example`。`docs/` 被 gitignore 忽略，只放可重跑产物与本地分析笔记，不入库、不作为契约。

| 工作流 | 触发 | 内容 |
| --- | --- | --- |
| `checks.yml` | push 到 main、PR、`workflow_call`、手动 | static / model / build / lint-infra 四个 job |
| `docker.yml` | 手动 | amd64 + arm64 → GHCR；发版前经 `workflow_call` 复用 checks |
| `audit.yml` | 每周一 03:17 UTC、手动 | `bun audit --production`、依赖许可证、`pip-audit`、`detect-secrets` |
