# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控：3D 户型展示与编辑、
设备触控、安防、能源管理与语音交互。版本号的唯一来源是仓库根 `package.json` 的 `version`。

| 我想 | 做什么 | 去看 |
| --- | --- | --- |
| 改代码 | `bun install && bun run dev` | [§3](#3-本地开发) |
| 装到自己这台（含商店） | `docker compose up -d` | [ops/deploy/README.md](ops/deploy/README.md) |
| 给客户装一台 | `docker compose -f docker-compose.app.yml up -d` | [ops/deploy/README.md](ops/deploy/README.md) |

提交前跑 `bun run gate`（static + test + model）；动过 compose / Dockerfile / 脚本再加
`bun run gate:build` 与 `bun run gate:infra`。

---

## 1. 是什么

### 用户看到的入口（同一个 SPA 的不同路由）

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 3D 仪表盘 | `/`、`/display/:projectId`、`/homeos/:name` | 只读展示：户型、家具、灯光与设备状态都在 3D 场景里 |
| 户型绘制 | `/3d-studio` | 墙 / 门窗 / 房间 / 家具摆放，草稿存后端，带撤销重做 |
| 面板编辑器 | `/studio/editor` | 2D 仪表盘排版与控件绑定（只从「设置 → 布局」进入，不占导航） |
| 设备与安防 | `/devices`、`/device`、`/security`、`/notifications` | 设备卡片 / 弹窗、布防、事件流与通知中心 |
| 其它页面 | `/events`、`/earthquake-history`、`/mode-logs`、`/settings` | 事件、地震记录、模式触发日志、设置（HA 接入 / 房间 / 外观 / 自动化） |
| 3D 舞台 | `/api/v1/modules/interaction3d/stage.html` | 以 public 模块 URL 投放的实时舞台（设备动效） |

3D 创作是仓库里体量最大的一块：模型库 **336 个 id / 672 个 GLB**（31 MB）、材质槽位 **3136 条**，
由 7 条模型门禁守着，详见 [§4](#4-3d-studio-与模型库)。

### 仓库里是两个相互独立的项目

| 项目 | 是什么 | 部署在哪里 |
| --- | --- | --- |
| `homeos`（主应用） | 仪表盘 / 中控，装在**客户家里** | 每个客户一台 |
| `homeos-store`（授权商店） | 商店前台 + 运营后台 + 授权签发 | **厂商侧唯一一台**（中心商店） |

两个项目互不 import 后端包，可分别构建与部署。商店只跑一处，客户机装的是同一个镜像、各自通过
`APP_LICENSE_SERVER_URL` 指向商店：

```text
      ┌──────── 管理员 / 厂商（唯一一台商店）────────┐
       │  homeos-store  :8802（内网 HTTP）           │
       │  homeos        :8801 / :8803（同一份 compose）│
      └──────────────────┬──────────────────────────┘
   /v2/keys ⟵────────────┼────────────⟶ /v2/activate · /v2/heartbeat
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
 客户机 homeos      客户机 homeos      客户机 homeos
 :8801 / :8803      :8801 / :8803      :8801 / :8803
```

授权公钥**无需人工投放**：主应用启动时向商店 `GET /v2/keys` 取回并缓存到自己的数据卷，之后商店暂时
不可达也能离线启动。

| 服务 | 容器名 | 内网 HTTP | 内网 HTTPS | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803（自签，可选） | `/login` 登录；首装零用户时同一页给「创建本机唯一账号」 |
| 授权商店 | `homeos-store` | 8802 | ——（刻意没有） | `/setup` 建运营管理员，`/admin` 运营后台 |

> 端口上的「没有」和「自签」都有原因，别当成没做完 —— 见 [部署手册 §5](ops/deploy/README.md#5-内网直连与-https)。
>
> **运行期身份一律不改**：容器名 / 镜像名 / **数据卷名**里的 `homeos` 是刻意保留的。改了就等于换一套
> 卷，存量部署的数据会看起来「丢了」，而且容器 hostname 参与授权实例指纹。从更早的多文件编排迁过来
> 时，商店侧卷名会从 `homeos-store_*` 变成 `homeos_*`，需要保留数据就先拷进新卷再启动。

---

## 2. 目录结构

只列需要认识的：

```text
HomeOS/
├── homeos/                        # 主应用：backend/（FastAPI，包名 src）+ frontend/（Vue + studio）
│   ├── backend/src/               # api / domains（ha、license、security、studio3d…）/ platform / realtime
│   └── frontend/
│       ├── src/                   # views / features / components / composables / stores / shared / studio
│       ├── src/studio/            # 3D 创作、面板编辑器 / 渲染器、实时舞台（runtime/）
│       ├── scripts/models/        # 模型库工具（重建、目录归位、契约与名字索引生成）
│       └── public/static/3d-studio/models/   # 模型库：336 个 id / 672 个 GLB（31 MB）
├── homeos-store/                  # 授权商店：backend/（commerce / licensing / payments）+ frontend/
├── packages/shared/               # @homeos/shared 前端共享契约包；scene/static 是场景 CSS / 字体的唯一真源
├── packages/shared-py/            # homeos_shared Python 共享包（构建期各自内联进 .so）
├── ops/
│   ├── gates.mjs / lib/py.mjs     # 门禁编排（唯一清单）+ Python 解释器统一入口
│   ├── dev.mjs / build.py / ports.mjs   # 本地联调 / 构建 / 端口唯一真源
│   ├── deploy/                    # 部署手册、公网接入、穿透、preflight.sh、入口配置示例
│   ├── checks/                    # 架构、3D 模型（资产 / 几何 / 材质 / 槽位）、体积预算、回归用例
│   ├── perf/                      # 性能口径 / harness / 阈值（不存日期报告）
│   └── ci/ docker/ caddy/ vite/   # 容器入口、Caddyfile、Vite 辅助、CI 脚本
├── assets/                        # 运行期可替换 UI 素材（compose bind mount 到 /app/assets）
├── backups/                       # 备份包落点（compose bind mount 到 /data/backups）
├── keys/                          # 授权公钥（本地开发由 ops/dev.mjs 镜像；私钥只在商店侧）
├── dist/                          # 构建产物（不入库；镜像只消费它）
├── docker-compose.yml             # 管理员这台：商店 + 主应用
├── docker-compose.app.yml         # 客户机：只有主应用（商店地址已填好）
├── Dockerfile                     # 双目标运行镜像：--target app / --target store
└── package.json / bun.lock        # 版本号唯一来源 + 全仓唯一的依赖锁
```

`homeos/data/` 与 `homeos-store/data/` 是源码态运行时数据（不入库），容器里对应 `/data`。

六条全局约定：

- **产物只进根 `dist/`**，与源码树彻底分开；镜像只消费它。
- **依赖只在仓库根装一份**（根 `bun.lock` 是唯一来源，项目目录内没有 `node_modules`）。
- **磁盘是中文文件名，代码是英文 id**；场景存档、撤销历史、导出包都按英文 id 引用。
- **`docs/` 不入库，也不许出现「唯一的输入」**：目录里只有可重跑的产物，随时可整个删掉。
  生成物重建若需要快照，路径统一由 `homeos/frontend/scripts/models/lib/model-audit-paths.mjs`
  给出（默认 `docs/model-audit/`），目录名不带日期——要留历史快照用 `--out` 显式指定，
  不要改默认值（见 [§4.2](#42-材质槽位契约全部是生成物)）。
- **Python 解释器只有一条选择路径**：`HOMEOS_PYTHON` → 仓库根 `.venv-store` → `python3` / `python`，
  由 `ops/lib/py.mjs` 决定；脚本和文档里不要写死 `.venv-store/bin/python`。
- **门禁只在 `ops/gates.mjs` 里登记**，CI 与本地跑同一份清单，不在 workflow 里另抄一遍命令。

---

## 3. 本地开发

需要 **Bun 1.4.3+** 与 **Python 3.15+**（`package.json` 的 `packageManager` 与 `Dockerfile` 的基础镜像
tag 就是这两个值的真源）。

```bash
bun install
bun run setup:hooks    # 装 git pre-commit（取一次即可）：拦「场景静态资源生成物被误提交」
bun run dev            # 后端热重载 + Vite HMR
bun run dev -- --lan   # 同网段平板 / 墙面板访问（绑 0.0.0.0，终端会打印局域网地址）
```

| 地址 | 用途 |
| --- | --- |
| http://127.0.0.1:8805/ | 主应用前端 HMR（改页面走这里） |
| http://127.0.0.1:8806/ | 商店前端 HMR |
| http://127.0.0.1:8801/login | 主应用 API / 登录（零用户时同页给「创建本机唯一账号」） |
| http://127.0.0.1:8802/setup | 商店 API / 首次建运营管理员 |

`bun run dev` 只绑 `127.0.0.1`，缺前端产物时会自动跑一次 Vite 构建，本地验证码默认打印在启动终端
（`STORE_MAIL_MODE=log`）。**它不是部署脚本**。

### 常用脚本

| 脚本 | 作用 |
| --- | --- |
| `bun run dev:backend` | 只起两个后端的热重载（不起前端） |
| `bun run dev:app` / `dev:store` | 只起主应用 / 商店前端的 Vite HMR（不动后端） |
| `bun run dev:prepare` | 只装 Python 环境（仓库根共享 venv `.venv-store`），不起服务 |
| `bun run dev:runtime` | watch 3D runtime 模块 → 根 `dist/homeos/frontend/modules/runtime` |
| `bun run build` | 完整构建：前端（Vite 压缩产物）+ 后端（Cython `.so`）→ 根 `dist/` |
| `bun run build:app` / `build:store` | 只构建一侧前端（含 `sync:scene`） |
| `bun run image:app` / `image:store` | 从根 `dist/` 组装运行镜像（`--tag` 自定义） |
| `bun run typecheck` | 两个前端的 `vue-tsc`。Python 侧没有类型检查命令：CI 只跑 `ruff`，Pylance / 手动 `basedpyright` 读仓库根 `pyrightconfig.json` |
| `bun run gate` / `gate:*` | 门禁编排入口，见下节 |

`node ops/gates.mjs --list` 打印全部阻断项 —— 那是唯一清单，本文不重复抄一份。

### 门禁分层

命令前缀就是层级，只有三层：

| 层 | 命令 | 谁跑 | 说明 |
| --- | --- | --- | --- |
| 阻断 | `gate` / `gate:static` / `gate:test` / `gate:model` / `gate:build` / `gate:infra` | 本地手动 + CI 五个 job | 清单唯一来源是 `ops/gates.mjs`；CI 每个 job 就是「装环境 + `bun run gate:<组>`」 |
| 手动审计 | `audit:*`、`perf:*`、不带 `--check` 的同名脚本 | 人 | 只报告不阻断；`audit:quality` 是模型损伤台账，`audit:architecture` 盘点模块规模 |
| 生成 | `generate:*`、`organize:*`、`index:*`、`rebuild:*`、`build:slot-contracts` | 人 | 写盘命令，产物是提交进仓库的派生表或资产（见 [§4.2](#42-材质槽位契约全部是生成物)） |

| 组 | 管什么 |
| --- | --- |
| `static` | 两个前端的 typecheck / lint、`eslint ops`、`ruff`、场景静态资源、`any` 棘轮、静默 `except`、async DB、依赖锁与镜像导入 |
| `test` | 前端 / studio / 架构 / 安防 / 首页模式 / 鉴权导航用例，前后端依赖 DAG，拆分预算 |
| `model` | 3D 模型：几何、槽位、槽位角色、材质角色指纹、资产结构、目录布局、中文名索引 |
| `build` | 清 `dist` → 前端构建与产物断言 → 体积预算 → 跨 chunk 初始化顺序 |
| `infra` | shellcheck / actionlint / compose 三种形态 / Caddy 校验 / Cython 兼容性 |

`bun run gate` 默认跑 static + test + model（改代码时够用）；`node ops/gates.mjs --all` 含 build + infra，
发版前或动过 compose / Dockerfile / shell 时再跑。缺工具（shellcheck / actionlint / docker）时本机
显式 SKIP 并给安装提示，**CI 里同一缺失直接失败**。pre-commit 只是客户端兜底，不是门禁层。

### 调试与首次联调

断点调试：`bun run dev -- --debug` 后在编辑器 attach（主应用 `8811`、商店 `8812`）；热重载不会被关掉，
重载出的新进程照样命中。端口占用时脚本直接退出，`pkill -f ops/dev.mjs` 后重试。

首次联调：`/login`（零用户时给「创建本机唯一账号」）注册时验证码由商店代发 → 注册成功自动打开商店
购买页、当前页进 `/activate` → 商店 `/setup` 建管理员并在 `/admin` 配 SMTP 与支付 → 下单拿激活码后
回来填**下单邮箱 + 激活码** → 编辑器配 HA → 在 `/3d-studio` 保存户型，保存后总览首页（`/`）就会渲染它。

> 商店账号与本机账号是两套体系：激活码按**商店下单邮箱**归属。两处用同一个邮箱最省事。

---

## 4. 3D Studio 与模型库

创作页（`/3d-studio`）与展示页（`/`）**共用同一份场景构建**（`buildStudioScene`），区别只在外壳与
可编辑性。根应用只能 `import '@/studio'`（barrel 里的懒加载器），不得直达 `@app/*` / `@runtime/*`；
`studio/runtime/**` 每个 `.ts` 都是 Vite 入口，按 `/api/v1/modules/interaction3d/<rel>.js` 投放 ——
**URL 即公网路径**，改名要同步后端 manifest 与白名单。分层与设备运行时约定见
[`studio/README.md`](homeos/frontend/src/studio/README.md)。

### 4.1 模型库

磁盘位置 `homeos/frontend/public/static/3d-studio/models/`，三个分区（`家居` / `庭院` / `电器`）、
32 个二级目录：

- **336 个模型 id，672 个 GLB（31 MB）**：每个 id 两个文件 —— `<中文名>-lite.glb`（降面，运行时首选）
  与 `<中文名>.glb`（完整件，lite 加载失败时兜底）。
- 磁盘上目录 / 文件名是**中文**，代码里仍是**英文 id**；映射由
  `loaders/external-models/model-asset-folders.ts` 与 `model-file-names.generated.ts` 维护。
- 中文名索引 [`MODEL-NAMES.md`](homeos/frontend/public/static/3d-studio/models/MODEL-NAMES.md)
  由 `bun run index:model-names` 生成，**不要手改**。
- 物品模型按 14 个族、59 个类型分支分派，规则与「族顺序不可重排」的原因见
  [`item-model/README.md`](homeos/frontend/src/studio/app/3d-studio/authoring/items/item-model/README.md)。

新增一个模型：登记 id 到 `model-asset-folders.ts` → 放进对应分区的两个 GLB → 在模型库加一张带
`data-library-name` 的卡片（`src/studio/entries/StudioView.vue`）→ `bun run index:model-names` →
跑 `bun run gate:model`。

### 4.2 材质槽位契约（全部是生成物）

契约在 `homeos/frontend/scripts/models/specs/`，两个 `.generated.ts` 在
`studio/app/3d-studio/materials/`，基线在 `ops/checks/studio/`：

| 文件 | 作用 | 生成命令 |
| --- | --- | --- |
| `model-slot-contracts.json` | 每个模型的槽位 → 目标名 / 动作 | `build:slot-contracts` |
| `model-slot-roles.generated.ts` | 新 token → 语义角色 | `generate:slot-tables` |
| `legacy-material-aliases.generated.ts` | 旧材质名 → 新名的单点归一 | `generate:slot-tables` |
| `material-role-baseline.json` | 672 个文件的「槽位下标 → 角色」快照（3136 条） | `audit_glb_materials.mjs --write-role-baseline` |
| `asset-baseline.json`、`geometry-baseline.json` | 资产与几何基线 | 对应 `audit:*` |

生成顺序有依赖，别跳步：`audit:materials`（写 `docs/model-audit/glb-material-audit.json`）
→ `build:slot-contracts`（读它，写 `model-slot-contracts.json`）→ `generate:slot-tables`（写两个
`.ts`）。审计快照是**派生物**、`docs/` 不入库，所以**重建契约时**必须先跑第一步；缺文件会直接报错
并打印该跑哪条命令，不会静默降级。日常构建只用已提交的 `model-slot-contracts.json`，不需要它。

角色变化（重导出位移、token 表误改）会让 `check:materials` 直接失败 —— 基线的意义是「改模型必须留下
可解释的 diff」，不是自动放行。

### 4.3 模型门禁

| 命令 | 作用 |
| --- | --- |
| `bun run check:assets` | GLB 结构（扩展、贴图、节点、buffer） |
| `bun run check:geometry` | 包围盒 / 拓扑 / 面数 |
| `bun run check:slots` / `build:slot-contracts` | 槽位命名与契约，旧名别名单点归一 |
| `bun run check:slot-roles` | 槽位角色表与契约声明的变更是否一致 |
| `bun run check:materials` / `audit:materials` | 材质角色指纹与基线（`audit:materials` 写报告） |
| `bun run check:models-layout` / `organize:models` | 中文目录布局是否归位 / 归位（写盘） |
| `bun run check:model-names` / `index:model-names` | 中文名索引是否最新 / 重建 |
| `bun run check:studio-split` | 拆分预算 + 物品模型等价性（改 `item-model/` 后必跑） |
| `bun run audit:quality` | 模型损伤台账（HEAD 原始件 vs 当前工作区，只报告） |
| `bun run rebuild:items` | 按 `items/<id>.mjs` 配方重建精修件（写盘） |

前 7 条即 `bun run gate:model`（CI 的 `model` job）；`check:studio-split` 在 `test` 组。

**没有 `repair:*` 层**：能自动修的东西要么已经修完并落进基线，要么不该自动修。模型坏了用 `audit:*`
定位，然后重导出或 `rebuild:items` 重建 —— 前者保证几何来自 Blender 原件，后者保证材质与节点名不动
（`rebuild:items` 落盘前后都过 `lib/asset-guard.mjs` 的指纹比对，任何可观测退化直接拒绝）。GLB 批量
改名不是脚本层的日常操作：`repair_glb_material_slots.mjs` 只以 `generate:slot-tables` 一个入口暴露，
`--write` 要手工敲全路径，且改完必须跟 `check:slot-roles` 对账。

---

## 5. 部署

两份 compose 文件，值都写死在文件里 —— 不需要 `.env`、不需要装 Bun/Python、也不需要把整份仓库复制到
目标机：

| 文件 | 起什么 | 给谁 |
| --- | --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | 商店 + 主应用 | 管理员自己这台（整个产品唯一一处商店） |
| [`docker-compose.app.yml`](docker-compose.app.yml) | 只有主应用 | 客户机，每台一份 |

真正的约束只有两条：用前一份时**商店与主应用永远同机**（走服务名 `http://homeos-store:8802`，换 IP
换域名都不影响）；用后一份时**商店地址永远是公网域名**（没有「改成私网 IP」的分支）。

装机步骤、四个地址变量（`APP_LICENSE_SERVER_URL` / `APP_STORE_URL` / `STORE_BASE_URL` /
`APP_BASE_URL`）、内网 HTTPS 与 SNI、内网穿透、备份与升级、排错表 —— 全部在
**[ops/deploy/README.md](ops/deploy/README.md)**。

---

## 6. 文档索引

| 文档 | 内容 |
| --- | --- |
| [ops/deploy/README.md](ops/deploy/README.md) | **部署手册**（部署/运维唯一入口）：装机两步、地址变量、HTTPS、穿透、备份、升级、排错 |
| [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) | 商店公网接入（域名 + 真实证书 HTTPS、支付回调），配置片段用 `store.example.com` 占位 |
| [ops/deploy/TUNNEL-ACCESS.md](ops/deploy/TUNNEL-ACCESS.md) | 没有公网 IP 时的内网穿透（frp / cloudflared / 节点小宝），用本项目实际域名 |
| [ops/BUILD.md](ops/BUILD.md) | 镜像构建细节（Cython 产物、基础镜像钉版、镜像站） |
| [ops/perf/README.md](ops/perf/README.md) | 性能口径与预算（体积 / 3D 首帧、harness、真机待补项）；不存日期战报 |
| [ops/perf/manual-baseline.md](ops/perf/manual-baseline.md) | 手工回归清单（B1–B6）与行为基线填表 |
| [ops/gates.mjs](ops/gates.mjs) | 门禁清单与分组（CI 五个 job 与本地 `bun run gate` 的唯一来源） |
| [homeos/frontend/src/README.md](homeos/frontend/src/README.md) | 主应用前端分层 DAG、域边界、桶命名与 studio 的关系 |
| [homeos/frontend/src/studio/README.md](homeos/frontend/src/studio/README.md) | Studio 子系统分层、启动入口、面板渲染器与设备运行时 |
| [item-model/README.md](homeos/frontend/src/studio/app/3d-studio/authoring/items/item-model/README.md) | 物品模型 14 族 / 59 分支的拆分规则 |
| [homeos/backend/src/README.md](homeos/backend/src/README.md) | 主应用后端目录、业务域与关键契约 |
| [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md) | 商店 / 授权服务器细节 |
| [homeos-store/frontend/src/README.md](homeos-store/frontend/src/README.md) | 商店前端（前台 + 运营后台）目录与样式/令牌约定（商店前端约定唯一真源） |
| [packages/shared-py/README.md](packages/shared-py/README.md) | 两个后端共享的 Python 源码包（模块清单 + 共享判据） |
| [packages/shared/scene/README.md](packages/shared/scene/README.md) | 入户场景静态资源（两个前端共用） |
| [MODEL-NAMES.md](homeos/frontend/public/static/3d-studio/models/MODEL-NAMES.md) | 模型库中文名索引（**生成，勿手改**：`bun run index:model-names`） |
| [meshoptimizer LICENSE](homeos/frontend/public/static/vendor/meshoptimizer/0.25/LICENSE.md) | 第三方许可证（**勿改**） |
| [.env.example](.env.example) | 全部环境变量（分区注释；compose 文件已写死常用值） |

> 文档纪律：性能报告按日期**不入库**（口径与阈值见 `ops/perf/`）；本表外的 `.md` 只有
> 上面两个「生成 / 第三方」文件，其余新增文档请一并登记到本表。

CI：两个工作流都**只能手动触发**（Actions 页面 Run workflow），推送不会自动构建：

- `.github/workflows/checks.yml`：五个 job 对应 `ops/gates.mjs` 的五个组，也被 `docker.yml` 通过
  `workflow_call` 复用于发版前；
- `.github/workflows/docker.yml`：amd64 + arm64 构建并推 GHCR。
