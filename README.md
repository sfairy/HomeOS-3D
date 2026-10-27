# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控：3D 户型展示与编辑、
设备触控、安防、能源管理与语音交互。版本号见仓库根 `package.json` 的 `version`。

用户实际看到的入口（同一个 SPA 的不同路由）：

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 3D 仪表盘 | `/`、`/display/:projectId`、`/homeos/:name` | 只读展示：户型、家具、灯光与设备状态都在 3D 场景里 |
| 户型绘制 | `/3d-studio` | 墙 / 门窗 / 房间 / 家具摆放，草稿存后端，带撤销重做 |
| 面板编辑器 | `/studio/editor` | 2D 仪表盘排版与控件绑定（只从「设置 → 布局」进入，不占导航） |
| 设备与安防 | `/devices`、`/device`、`/security`、`/notifications` | 设备卡片 / 弹窗、布防、事件流与通知中心 |
| 其它页面 | `/events`、`/earthquake-history`、`/mode-logs`、`/settings` | 事件、地震记录、模式触发日志、设置（HA 接入 / 房间 / 外观 / 自动化） |
| 3D 舞台 | `/api/v1/modules/interaction3d/stage.html` | 以 public 模块 URL 投放的实时舞台（设备动效） |

3D 创作是仓库里体量最大的一块：模型库 **336 个 id / 672 个 GLB**（`-lite` 降面件 + 完整件）、
材质槽位 **3136 条**，另有资产 / 几何 / 材质 / 槽位门禁与修复脚本，见下文「3D Studio 与模型库」。

仓库里是两个**相互独立**的项目：

| 项目 | 是什么 | 部署在哪里 |
| --- | --- | --- |
| `homeos`（主应用） | 仪表盘 / 中控，装在**客户家里** | 每个客户一台 |
| `homeos-store`（授权商店） | 商店前台 + 运营后台 + 授权签发 | **厂商侧唯一一台**（中心商店） |

两个项目互不 import 后端包，可分别构建与部署。构建产物统一收敛到工作区根 `dist/`，与源码树
彻底分开；前端依赖只在工作区根装一份（根 `bun.lock` 是唯一依赖来源，项目目录内没有 `node_modules`）。

生产形态是**商店 + 多台客户机**（商店只跑一处，可以就跑在你自己那台）：

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

客户机上装的是同一个镜像，各自通过 `APP_LICENSE_SERVER_URL` 指向商店。授权公钥**无需人工
投放**：主应用启动时向商店 `GET /v2/keys` 取回并缓存到自己的数据卷，之后商店暂时不可达也能离线启动。

| 服务 | 容器名 | 内网 HTTP | 内网 HTTPS | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803（自签，可选） | `/login` 登录（首装零用户时同一页给「创建本机唯一账号」） |
| 授权商店 | `homeos-store` | 8802 | ——（没有） | `/setup` 建运营管理员，`/admin` 运营后台 |

> **商店没有任何 HTTPS 入口**：内网 `http://<IP>:8802`，公网 `https://homelifepay.iepose.cn`
> （TLS 只终止在隧道 / 跳板机的 80·443）。镜像里**不含**商店侧的 Caddy，也就没有 8804 ——
> 那是个自签端口：客户机的 httpx 按系统 CA 校验会直接拒绝，支付平台同理，留着只会多一类
> 「证书不受信任 / 地址不匹配」的排错，而它保护的本来就是局域网流量。
>
> **主应用的 8803 仍保留**，因为摄像头 / 麦克风、PWA 安装、剪贴板这些浏览器能力只在安全上下文
> 可用。但它用 IP 打开会报证书错误，这是设计使然，不是坏了：浏览器访问 IP 字面量时**不发 SNI**
> （RFC 6066：SNI 只能是主机名），Caddy 只能按容器自己的 docker IP 签证书（实测
> SAN=`IP:172.19.0.x`），浏览器遂判「证书与地址不匹配」——部分 WebView / PWA 安装会硬拦，
> 连「继续前往」都没有。两种解法，任选其一：
>
> - **填一个变量**（推荐）：`APP_HTTPS_DEFAULT_SNI=<你输入的那个IP>`，证书就签给这个地址，
>   浏览器只剩「不受信任的 CA」这一步；
> - 或改用**主机名**访问（如 `https://homeos.local:8803`）：有 SNI，证书天然匹配。
>
> 想彻底不报警告，把容器里的 Caddy 根证书装到客户端：
> `docker cp homeos:/data/caddy/data/caddy/pki/authorities/local/root.crt .`。公网接入请用真实
> 证书域名（见 `ops/deploy/PUBLIC-ACCESS.md`），不要依赖这套自签入口。

> 运行期的容器名 / 镜像名 / **数据卷名**里的 `homeos` 是刻意保留的：改了就等于换一套卷，
> 存量部署的数据会看起来「丢了」，而且容器 hostname 参与授权实例指纹。所以运行期身份一律不动；
> 从更早的多文件编排迁过来时商店侧卷名会从 `homeos-store_*` 变成 `homeos_*`，需要保留数据就先
> 把旧卷内容拷进新卷再启动（主应用侧卷名不变）。

目录（只列需要认识的）：

```text
HomeOS/
├── homeos/                        # 主应用：backend/（FastAPI，包名 src）+ frontend/（Vue + studio）
│   ├── backend/src/               # api / domains（ha、license、security、studio3d…）/ platform / realtime
│   └── frontend/
│       ├── src/                   # views / features / components / composables / stores / shared / studio
│       ├── src/studio/            # 3D 创作、面板编辑器 / 渲染器、实时舞台（runtime/）
│       └── public/static/3d-studio/models/   # 模型库：336 个 id / 672 个 GLB（31 MB）
├── homeos-store/                  # 授权商店：backend/（commerce / licensing / payments）+ frontend/
├── packages/shared/               # @homeos/shared 前端共享契约包；scene/static 是场景 CSS / 字体的唯一真源
├── packages/shared-py/            # homeos_shared Python 共享包（构建期各自内联进 .so）
├── ops/
│   ├── dev.mjs / build.py / ports.mjs        # 本地联调、构建、端口唯一真源
│   ├── deploy/                    # PUBLIC-ACCESS、TUNNEL-ACCESS、preflight.sh、入口配置示例
│   ├── checks/                    # 架构、命名、3D 模型（资产 / 几何 / 材质 / 槽位）、体积预算
│   ├── perf/                      # 性能基线与预算（含 3D bench）
│   └── docker/ caddy/ vite/ ci/ lib/         # 容器入口、Caddyfile、Vite 辅助、CI 脚本
├── assets/                        # 运行期可替换 UI 素材（compose bind mount 到 /app/assets）
├── backups/                       # 备份包落点（compose bind mount 到 /data/backups）
├── keys/                          # 授权公钥（本地开发由 ops/dev.mjs 镜像；私钥只在商店侧）
├── dist/                          # 构建产物（不入库；镜像只消费它）
├── docker-compose.yml             # 管理员这台：商店 + 主应用（NAS / 单机一键）
├── docker-compose.app.yml         # 客户机：只有主应用（商店地址已填好）
├── Dockerfile                     # 双目标运行镜像：--target app / --target store
└── package.json / bun.lock        # 版本号唯一来源 + 全仓唯一的依赖锁
```

`homeos/data/` 与 `homeos-store/data/` 是源码态运行时数据（不入库），容器里对应 `/data`。

---

## 本地开发

需要 **Bun 1.4.3+** 与 **Python 3.15+**。

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

`bun run dev` 只绑 `127.0.0.1`，缺前端产物时会自动跑一次 Vite 构建，本地验证码默认
打印在启动终端（`STORE_MAIL_MODE=log`）。**它不是部署脚本**。

常用脚本：

| 脚本 | 作用 |
| --- | --- |
| `bun run dev:backend` | 只起两个后端的热重载（不起前端） |
| `bun run dev:app` / `dev:store` | 只起主应用 / 商店前端的 Vite HMR（不动后端，各开一个终端；`dev:frontend` 是 `dev:app` 的别名） |
| `bun run dev:prepare` | 只装 Python 环境（仓库根共享 venv `.venv-store`），不起服务 |
| `bun run setup:hooks` | 装客户端 git 钩子（`core.hooksPath=.githooks`）：pre-commit 只跑 `packages/shared/scripts/sync-scene-static.mjs --tracked-only`，拦场景静态资源生成物入库 |
| `bun run dev:runtime` | watch 3D runtime 模块 → 根 `dist/homeos/frontend/modules/runtime` |
| `bun run build` | 完整构建：前端（Vite 压缩产物）+ 后端（Cython `.so`）→ 根 `dist/` |
| `bun run build:shared` | 只构建 `@homeos/shared`；它的 `dist/` 被 gitignore，干净检出上必须先建 |
| `bun run build:app` / `build:store` | 只构建一侧前端 |
| `bun run image:app` / `image:store` | 从根 `dist/` 组装运行镜像 |
| `bun run typecheck` | 两个前端的 `vue-tsc`。Python 侧**没有**类型检查命令（历史入口已拆），CI 只跑 `ruff`；Pylance / 手动 `basedpyright` 读仓库根 `pyrightconfig.json` |
| `bun run gate` / `gate:static` / `gate:test` / `gate:model` / `gate:build` / `gate:infra` | 门禁编排入口，见下方「门禁分层」 |
| `bun run check:frontend-deps` / `check:backend-deps` / `test:architecture` / `audit:architecture` | 前端依赖 DAG（含 `homeos-store`）、后端分层方向 B1–B3 + 包级/文件级环 B4/B5（两个后端）、架构门禁用例（含路由基线）、模块规模盘点（只报告，写 `docs/architecture/inventory/`） |
| `bun run check:bundle-budget` / `check:chunk-init` | 前端产物体积预算、构建产物跨 chunk 初始化顺序（顶层读跨 chunk 常量的门禁） |
| `bun run perf:baseline` / `perf:after` / `perf:compare` / `perf:contracts` / `perf:behavior` / `audit:perf-budget` | 性能基线与前后对比（详见 `ops/perf/README.md`） |
| `bun run update:any-baseline` | 压低 `any` 棘轮基线（只在确实减少时用；`check:any` 会拦「变多」） |
| `bun run check:assets` / `check:geometry` / `check:slots` / `check:materials` … | 3D 模型门禁与修复，见下文「3D Studio 与模型库」 |

### 门禁分层

命令前缀就是层级，只有三层：

| 层 | 命令 | 谁跑 | 说明 |
| --- | --- | --- | --- |
| 阻断 | `gate` / `gate:static` / `gate:test` / `gate:model` / `gate:build` / `gate:infra` | 本地手动 + CI 五个 job | 清单唯一来源是 `ops/gates.mjs`；CI 每个 job 就是「装环境 + `bun run gate:<组>`」，本地与 CI 跑同一批命令 |
| 手动审计 | `audit:*`、`check:*`（不带 `--check`）、`perf:*` | 人 | 只报告不阻断；例如 `audit:perf-budget` 需要本机 perf 结果目录，`audit:quality` 是模型损伤台账，`audit:architecture` 盘点模块规模 |
| 生成 | `generate:*`、`organize:*`、`index:*`、`rebuild:*` | 人 | 生成/重排资产与派生表；会写盘的命令都在脚本文档里注明 |

`bun run gate` 默认跑 static + test + model；`node ops/gates.mjs --all` 含 build + infra，
`--list` 打印清单。缺工具（shellcheck / actionlint / docker）时本机显式 SKIP 并给安装提示，
CI 里同一缺失直接失败；`ciOnly` 步骤（Cython 兼容性）本机 SKIP，CI 由 `lint-infra` 装好
Dockerfile 里钉的版本后再跑。pre-commit 只是客户端兜底（直接跑 `sync-scene-static.mjs --tracked-only`），不是门禁层。

改完后端的断点调试：`bun run dev -- --debug` 后在编辑器 attach（主应用 `8811`、商店 `8812`）；
热重载不会被关掉，重载出的新进程照样命中。端口占用时脚本直接退出，`pkill -f ops/dev.mjs` 后重试。

首次联调：打开主应用 `/login`（零用户时页面给「创建本机唯一账号」）注册本机账号（验证码由商店
代发代验），注册成功会自动打开商店购买授权、当前页进 `/activate` → 商店 `/setup` 建管理员并在
`/admin` 配好 SMTP 与支付 → 在商店下单拿到激活码后回 `/activate`，用**下单邮箱 + 激活码**绑定 →
编辑器配 HA，3D 先在 `/3d-studio` 保存户型，保存后总览首页（`/`）就会渲染它。

> 商店账号与本机账号是两套体系：激活码按**商店下单邮箱**归属。两处用同一个邮箱最省事。

---

## 3D Studio 与模型库

### 页面与入口，共用同一份场景构建

| 页面 | 路由 | 入口组件 | 说明 |
| --- | --- | --- | --- |
| 3D 仪表盘（只读） | `/`、`/display/:projectId`、`/homeos/:name` | `entries/DisplayView.vue` | 总览首页就是它；`/homeos/<project>` 由后端按路径下发，`display.ts` 取整段项目名 |
| 户型绘制 | `/3d-studio` | `entries/StudioView.vue` | 墙 / 门窗 / 房间 / 家具 / 灯光，草稿走 `GET /api/v1/studio3d` 与 `PUT /api/v1/studio3d` |
| 面板编辑器 | `/studio/editor` | `entries/EditorView.vue` | 2D 仪表盘排版与控件绑定，只从「设置 → 布局」进入 |
| 实时舞台 | `/api/v1/modules/interaction3d/stage.html` | `StudioView` 的 `interaction3d-stage` 模式 | `body` 加 class 裁成只剩 `#preview-3d` 的只读 3D |

创作页与展示页共用同一份场景构建（`buildStudioScene`），区别只在外壳与可编辑性。根应用**只能**
`import '@/studio'`（barrel 里的懒加载器），不得直达 `@app/*` / `@runtime/*`；`studio/runtime/**`
每个 `.ts` 都是 Vite 入口，按 `/api/v1/modules/interaction3d/<rel>.js` 投放 —— **URL 即公网路径**，
改名要同步后端 manifest 与白名单。分层、启动顺序与设备运行时约定见
[`homeos/frontend/src/studio/README.md`](homeos/frontend/src/studio/README.md)。

### 模型库

磁盘位置 `homeos/frontend/public/static/3d-studio/models/`，三个分区、32 个二级目录：

| 分区 | 二级目录（节选） |
| --- | --- |
| `家居/` | 客厅家具、卧室家具、厨房家具、柜架收纳、卫浴用品、室内植物、影音设备、建筑与交通… |
| `庭院/` | 家具与铺装、构筑物、植物、水景、花箱与花坛、设施 |
| `电器/` | 厨房电器、洗衣烘干、清洁设备、环境设备、影音设备、办公数码、装饰灯具… |

- **336 个模型 id，672 个 GLB（31 MB）**：每个 id 两个文件 —— `<中文名>-lite.glb`（降面，运行时首选）
  与 `<中文名>.glb`（完整件，lite 加载失败时兜底）。
- 磁盘上目录 / 文件名是**中文**，代码里仍是**英文 id**；映射由
  `loaders/external-models/model-asset-folders.ts` 与 `model-file-names.generated.ts` 维护。
  场景存档、撤销历史与导出包都按英文 id 引用，改中文名不影响存量数据。
- 中文名索引 [`MODEL-NAMES.md`](homeos/frontend/public/static/3d-studio/models/MODEL-NAMES.md)
  由 `bun run index:model-names` 生成，**不要手改**。

新增一个模型：登记 id 到 `model-asset-folders.ts` → 放进对应分区的两个 GLB → 在模型库加一张带
`data-library-name` 的卡片（`src/studio/entries/StudioView.vue`）→ `bun run index:model-names` →
跑一遍下面的门禁。

### 材质槽位契约

模型按 `itemType + 槽位` 解析材质角色，契约与基线都是生成物：

| 文件 | 作用 |
| --- | --- |
| `materials/model-slot-roles.generated.ts` | 新 token → 语义角色（`generate:slot-tables` 生成） |
| `materials/legacy-material-aliases.generated.ts` | 旧材质名 → 新名的单点归一 |
| `ops/checks/studio/material-role-baseline.json` | 672 个文件的「槽位下标 → 角色」快照（3136 条材质） |
| `ops/checks/studio/asset-baseline.json`、`geometry-baseline.json` | 资产与几何基线 |

角色变化（重导出位移、token 表误改）会让 `check:materials` 直接失败 —— 基线的意义是「改模型必须
留下可解释的 diff」，不是自动放行。

### 模型门禁

| 命令 | 作用 |
| --- | --- |
| `bun run check:assets` | GLB 结构（扩展、贴图、节点、buffer）体检；不带 `--check` 时只出报告 |
| `bun run check:geometry` | 包围盒 / 拓扑 / 面数；不带 `--check` 时只出报告 |
| `bun run check:slots` / `build:slot-contracts` | 槽位命名与契约，旧名别名单点归一 |
| `bun run check:materials` / `audit:materials` | 材质角色指纹与基线（`audit:materials` 写报告；刻意改角色后跑 `audit_glb_materials.mjs --write-role-baseline` 重写基线） |
| `bun run check:slot-roles` / `check:models-layout` / `check:model-names` | 槽位角色表、目录布局、中文名索引 |
| `bun run generate:slot-tables` | 重写两个 `.generated.ts`（槽位角色表 / 旧名别名表）；GLB 改名走同一脚本的 `--write`，属人工高危操作 |
| `bun run organize:models` / `rebuild:items` / `index:model-names` | 目录归位、精修件按配方重建、中文名索引重建 |
| `bun run check:studio-split` | 拆分结构 + 物品模型等价性门禁（改 `item-model/` 后必跑；已含 `verify_item_model`） |
| `bun run audit:quality` | 模型损伤台账（HEAD 原始件 vs 当前工作区，只报告不阻断） |
| `bun run check:bundle-budget` | 前端产物体积（chunk 数 / 体积）预算 |
| `bun run check:chunk-init` | 构建产物里「顶层读跨 chunk 常量 + 来源 chunk 反向可达」的门禁（环内 const 为 `undefined` 时抛错或静默丢表） |

`check:geometry` / `check:slots` / `check:slot-roles` / `check:materials` / `check:assets` /
`check:models-layout` / `check:model-names` 都在阻断层（`bun run gate:model`，CI 的 `model` job）。

修复脚本默认 dry-run，只有 `*:write` 才落盘；每次审计 / 修复的台账写在 `docs/architecture/<日期>/`
（本地生成，不入库）。物品模型按 14 个族、59 个类型分支分派，规则见
[`item-model/README.md`](homeos/frontend/src/studio/app/3d-studio/authoring/items/item-model/README.md)。

### 运行时模块

`homeos/frontend/src/studio/runtime/` 是**实时 3D 舞台**的设备模块（灯 / 空调 / 窗帘 / 摄像头 /
扫地机 / 车辆 / 电视 / 空气净化器…），另有 `core/`、`panels/`、`config-ui/` 与 `editor/`。改完用
`bun run dev:runtime` watch 到 `dist/homeos/frontend/modules/runtime`；生产构建直接投放。

---

## 部署

两份 **compose 文件**，值都写死在文件里：不需要 `.env`、不需要装 Bun/Python、不需要跑脚本，
也**不需要把整份仓库复制到目标机**（只有一份除外：公网接入时商店那台还要带上
`ops/deploy/Caddyfile.public.example`）。

| 文件 | 起什么 | 给谁 |
| --- | --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | 授权商店 + 主应用 | **开发者 / 管理员**自己这台：整个产品唯一一处商店就在这里，你的面板也一起起 |
| [`docker-compose.app.yml`](docker-compose.app.yml) | 只有主应用 | **客户**：每台一份，商店地址固定是公网域名，不用改 |

两条硬性不变式，别绕开：

- **用 [`docker-compose.yml`](docker-compose.yml) 时，商店与主应用永远在同一台服务器上。**
  两者是同一个 compose 项目、同一个 `homeos-net`、同一个生命周期，主应用连商店走的就是服务名
  `http://homeos-store:8802` —— 这台机器换 IP、换域名、公网入口抖动都不影响它。公钥还走共享
  卷，主应用启动时**不联网**取公钥，商店容器临时重启也不耽误已授权的机器。
- **用 [`docker-compose.app.yml`](docker-compose.app.yml) 时，商店地址永远是公网域名。**
  客户机不在厂商的局域网里，文件里没有「改成私网 IP」的分支；它出站访问的是
  `https://homelifepay.iepose.cn`（443），浏览器里的商店链接也是同一个域名。

厂商这台的两个对外地址（都终止在隧道 / 反代边缘，回灌到明文端口）：

| 入口 | 公网地址 | 回灌到 |
| --- | --- | --- |
| 主应用 | `https://homelife.iepose.cn` | `127.0.0.1:8801`（不要指到 8803，那是自签证书） |
| 商店 | `https://homelifepay.iepose.cn` | `127.0.0.1:8802` |

两份的项目名都是 `homeos`，服务名与卷名也一致 —— 客户机将来想换回管理员那份也不会换错数据。
公网接入（真实域名 + 可信证书 HTTPS）不是第三个文件，而是**部署前置条件**：80/443 上必须
有一层带真实证书的入口把域名转到商店（用你已有的，或取消注释 `docker-compose.yml` 里那段
内置 Caddy）。完整前提、验证与排错见 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。

### 地址怎么分，别混

部署涉及四个地址，取值规则是刚性的 —— 混了就会「容器看着健康、浏览器却连不上」：

| 地址 | 谁在用 | 同机部署 | 分机部署 |
| --- | --- | --- | --- |
| `APP_LICENSE_SERVER_URL` | **主应用容器出站**：取授权公钥 / 激活 / 心跳 / 代发验证码 | `http://homeos-store:8802`（compose 服务名，写死，**永远不变**） | `https://homelifepay.iepose.cn`（写死，公网域名） |
| `APP_STORE_URL` | **浏览器**：登录页「重置商店密码 / 商店」链接 | **留空**：跟着访问者当前入口走（内网 IP → `<同一 IP>:8802`，公网域名 → 商店域名） | `https://homelifepay.iepose.cn`（写死；客户机没有本机商店，只能公网） |
| `STORE_BASE_URL`（商店侧） | 商店对外身份：支付回调、同源判定、Cookie | 商店域名（**不能**是 8802） | 同左 |
| `APP_BASE_URL`（主应用侧） | 主应用对外身份：WebSocket / socket.io 来源、绝对链接（同源校验**不再**只认它） | `https://homelife.iepose.cn`（穿透）；纯局域网可留空 | 客户自己的公网地址；纯局域网留空 |

两条入口必须**同时**能开，这是这套部署的硬要求：

| 入口 | 主应用 | 商店（同机部署） | 商店（客户机） |
| --- | --- | --- | --- |
| 内网 `IP:端口` | `http://<IP>:8801` / `https://<IP>:8803`（自签） | `http://<IP>:8802` | 不适用（只能公网） |
| 公网域名 | `https://homelife.iepose.cn` | `https://homelifepay.iepose.cn` | `https://homelifepay.iepose.cn` |

`APP_STORE_URL` 在**开发者那份**留空是有意的：同一台机器会被两种地址访问，商店入口必须
跟着访问者走。推导规则在 `domains/store/discovery.py` —— 判据是**容器出站主机名**（同机
用服务名 `homeos-store`，浏览器解析不了），所以它不受 `STORE_BASE_URL` 里那串公网域名
影响；同机 + IP 访问时**连商店都不问**，直接拼 `<同一 IP>:8802`，穿透抖动 / 离线也成立。
**取不到地址时前端隐藏商店入口**，不再兜底成 `http://127.0.0.1:8802` —— 那个地址在
客户机上指向用户自己的电脑，只会在生产暴露。

### 前置条件

- 目标机装好 **Docker Engine + Compose v2**（文件用了顶层 `name:`，需要 ≥ 2.3.3）。
- 能拉 GHCR：包若是私有的，先 `docker login ghcr.io`（PAT 需 `read:packages`）。
- 所有机器**时钟同步**；建议各机器用**同一个镜像 tag**（便于排障；授权协议不校验版本）。
- 架构：后端编译成 per-arch `.so`，amd64 / arm64 镜像不通用；GHCR 两种都有，`docker pull` 自动选。

### 第 1 步：管理员这台（唯一一台，先跑）

```bash
# 把 docker-compose.yml 放到这台机器上（能 clone 仓库就直接用仓库根这份）
docker compose up -d

# 未初始化时，启动日志里有引导密钥；用它打开 /setup 建运营管理员（账号 / 邮箱 / 密码）
docker logs homeos-store | grep -A4 '引导密钥'
```

起完先跑一次自检（在仓库根执行；目标机只放了 compose 的话可跳过，它只是把下面这些链路
一次性验完：容器 / 端口 / 容器→商店 / 公钥 / 授权状态 / 指纹绑定源）：

```bash
bash ops/deploy/preflight.sh --app-domain https://homelife.iepose.cn \
                             --store-domain https://homelifepay.iepose.cn
```

**容器出站地址不用改**（`APP_LICENSE_SERVER_URL` 写死成容器内网服务名
`http://homeos-store:8802`，同一份 compose 里就是它）；登录页的商店入口也不用配 —— 它会
跟着浏览器当前用的地址走（内网 IP → `<同一 IP>:8802`，公网域名 → `STORE_BASE_URL`）。
换域名时用**同名环境变量**覆盖，不必改这两份被跟踪的文件：商店侧 `STORE_BASE_URL`，
主应用侧 `APP_BASE_URL`（客户机那份是 `APP_LICENSE_SERVER_URL` / `APP_STORE_URL`）。
两条容易踩的：

- **先建 `/host` 符号链接**（命令见 `docker-compose.yml` 文件头），必须在第一次 `up -d`
  **之前** —— 否则 Docker 会把路径建成目录，之后再也 `ln` 不上去，授权指纹会退化成可拷贝的兜底 ID；
- 浏览器入口别写 `https://…:8804`：商店没有 HTTPS 端口（8804 已移除），内网直连用
  `http://<局域网IP>:8802`，公网用真实证书域名。

然后浏览器打开 `https://homelifepay.iepose.cn/setup`（或你配的域名）建管理员：填
**账号、邮箱、密码**三项，管理员免邮箱验证码（创建即 `emailVerified`）。建好之后这个管理员
**本身就是商店用户** —— 可以像普通客户一样用账号名或邮箱登录前台、下单、在账号中心看自己的
授权；`/setup` 也会 302 到 `/admin`，创建管理员的界面不会再出现。

本机 / 局域网调试直接用 `http://<局域网IP>:8802/setup`（或 `http://127.0.0.1:8802/setup`）即可：
会话 Cookie 的 `Secure` 按**本次请求实际协议**判定（`STORE_COOKIE_SECURE=auto`），明文直连不会
因为「Cookie 被浏览器丢弃」而登录不上。商店不提供内网 HTTPS 入口。
建完管理员后**注册一个客户账号**并给它发激活码（`/admin/licenses`，页面名「激活码」）：

- 验证码默认写日志（`STORE_MAIL_MODE: log`）：`docker logs homeos-store | grep 验证码`；
  正式对外请在 `/admin` 配好 SMTP（或写 `STORE_SMTP_*` 环境变量）。
- 发码要求邮箱**已有商店账号**，否则报「该邮箱尚未注册账号」。

### 第 2 步：客户机 —— 起主应用（每台一次）

```bash
docker compose -f docker-compose.app.yml up -d
```

**商店地址固定是公网域名**（`APP_LICENSE_SERVER_URL` 与 `APP_STORE_URL` 两行），不用改、
也不该改：客户机不在厂商局域网里，改成私网 IP 只会让这台机器变成一个连不上商店的孤儿。
`/host` 符号链接同样必须先建好。

> **macOS（Docker Desktop）本地验证**：`/host` 那套只对 Linux 客户机成立 —— macOS 没有
> `/etc/machine-id`，Docker Desktop 也不共享 `/etc`、`/sys`，`up` 会直接报
> `mounts denied: The path /host/etc/machine-id is not shared from the host`。
> 不用另加 compose 文件：在仓库根 `.env`（已被 git 忽略）里给三条变量即可，
> `docker compose -f docker-compose.app.yml up -d` 的命令一个字都不用改。
>
> ```bash
> # 两条 /host 挂载改指向可共享路径（挂成目录、读不到都无妨，内容不参与指纹）
> HOMEOS_MACHINE_ID_PATH=.
> HOMEOS_DMI_PATH=.
> # 用本机 IOPlatformUUID + 硬件序列号钉住实例指纹（换机改这两行、先去商店解绑）
> HOMEOS_FINGERPRINT_MACHINE_ID=4d2ccbf2-8251-5b3a-a296-838df2570a99
> HOMEOS_FINGERPRINT_BOARD_ID=mwf064134j
> ```
>
> 这两个值怎么来的：
> `ioreg -rd1 -c IOPlatformExpertDevice | awk -F'"' '/IOPlatformUUID|IOPlatformSerialNumber/{print $4}'`。
> 在 Linux 客户机上这四条保持不设，行为与原来完全一致（指纹由 `/host` 派生）。

起容器前先在这台机器上确认商店可达（证书也要过系统 CA 校验）：

```bash
curl -fsS https://homelifepay.iepose.cn/healthz
curl -fsS https://homelifepay.iepose.cn/v2/keys | head -c 120
```

跑完浏览器打开 `http://<客户机IP>:8801/` ：

- **已有账号** → 停在 `/login`，填账号（或注册邮箱）+ 密码即可进入（已激活过就直接进系统）。
- **首次部署（本机零用户）** → 同一个登录页会多出「创建本机唯一账号」，点进去注册（验证码由商店
  代发，所以这台必须能出站访问商店的 HTTPS 443；内网部署则是对应 IP 的 8802）。注册成功会
  **自动打开商店购买页**（新标签页，被浏览器拦截时激活页上仍有按钮），当前页进 `/activate`，
  授权邮箱已按注册邮箱预填。
- **还没有激活码** → `/activate` 上有「去商店购买授权」与「商店账号中心」两个入口；下单后激活码
  发到下单邮箱，也在商店账号中心可见。回来填**下单邮箱 + 激活码**即完成绑定。

> 商店账号与本机账号是两套：本机账号只在这台机器上（注册后入口即关闭），商店账号是买东西用的。
> 激活码按**商店下单邮箱**归属 —— 两个邮箱不一致时激活会报「激活码或邮箱不正确」。

> 未激活**不会**停在「授权恢复」页：那张页只服务「授权仍在、只是暂时连不上」。未激活走的是
> 登录 / 注册 → 商店购买 → 激活这条漏斗；如果你的旧镜像停在恢复页，直接访问 `/register`
> 或 `/login` 即可绕过。

> 跨公网接入时用**真实证书域名**。商店**没有** `https://<厂商机IP>:8804` 这种入口（该端口已
> 随商店内置反代一起移除），别把它写进 `APP_LICENSE_SERVER_URL`，见
> [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。

### 公网接入（商店跨公网 / 要收款）

**这是部署前置条件**：客户机那份 compose 的商店地址永远写死成公网域名，没有「只在内网跑」
的分支。三步，细节与验证见 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)：

1. **商店那台**（自己这台）：`docker-compose.yml` 里 `homeos-store.environment` 的
   `STORE_BASE_URL` 已是域名，`STORE_COOKIE_SECURE` 保持默认 `auto`（按请求协议决定
   Cookie 的 Secure，**内网 http 直连与公网 https 才能并存**），可信代理已放宽到
   `127.0.0.1,::1,172.16.0.0/12`（容器内回环 + 宿主机反代 / 隧道进来的网桥网关）。
   它决定支付回调地址与同源判定。
2. **80/443 上的入口**：已经有 openresty / nginx / CDN 就用它反代到 `127.0.0.1:8802`
   （`Host`、`X-Forwarded-Proto`、`X-Real-IP`、`X-Forwarded-For` 必须透传，
   `client_max_body_size` 要 ≥ 16m；可直接抄
   [openresty.store.conf.example](ops/deploy/openresty.store.conf.example)）；没有就取消注释
   `docker-compose.yml` 里那段「可选：内置 Caddy 入口」，填域名与证书邮箱，它会自动申请
   公共 CA 证书。
   域名返回纯文本 `404 page not found`（`server: openresty`）说明请求没到商店 —— 那是入口的
   404，不是商店的（商店的 404 是 JSON）。
3. **每台客户机**：`docker-compose.app.yml` 出厂已写好 `APP_LICENSE_SERVER_URL` 与
   `APP_STORE_URL`（都是 `https://homelifepay.iepose.cn`），**不用改**。客户机可以从任意网络
   接入 —— 只要它出站能访问该域名的 443。

```bash
docker compose -f docker-compose.yml up -d      # 商店那台
```

### 没有公网 IP：内网穿透

上面第 2 步说的「80/443 上的入口」**不必在本机**。用 frp（跳板机是你那台有公网 IP 的服务器）
或 Cloudflare Tunnel 让本机**主动出站**建隧道，公网流量再回灌到 `127.0.0.1:8802`（商店）与
`127.0.0.1:8801`（主应用）——本机不用公网 IP、不用在路由器上开端口，对外仍是 `https://域名`。

两条隧道、两个域名：商店 `https://homelifepay.iepose.cn`、主应用 `https://homelife.iepose.cn`。
商店侧配置一个字都不用改（`STORE_BASE_URL` / 可信代理已是公网口径）；主应用域名默认已写进
`docker-compose.yml` 的 `APP_BASE_URL`，换域名用同名环境变量覆盖即可（客户机那份用
`HOMEOS_PUBLIC_URL`）：

```yaml
      APP_BASE_URL: ${APP_BASE_URL:-https://homelife.iepose.cn}
```

它同时是同源校验基准、WebSocket 来源基准与 socket.io 的 CORS 白名单（自动并入，不必再抄一份
到 `CORS_ORIGINS`）；留空则按请求 `Host` 判断 —— 纯局域网直连就是这样工作的。填了之后局域网
IP 直连仍然可用。隧道入口必须透传 `Host`、`X-Forwarded-Proto: https`、真实客户端 IP，并允许
**WebSocket 升级**（面板实时状态走它）。完整示例（frpc / frps / cloudflared）与自检清单见
[TUNNEL-ACCESS.md](ops/deploy/TUNNEL-ACCESS.md)。

> 在飞牛 / 群晖这类 NAS 上用「节点小宝」这类客户端穿透时，映射登记在厂商控制台，本机看不到
> 配置 —— 没登记的子域名会由**边缘**回一句 19 字节的 `404 page not found`，看起来和应用 404
> 一模一样。协议选 `http`、内网地址填 NAS 的局域网 IP（别填 `127.0.0.1`）、访问规则设为
> 「公开访问」，细节与验证见 TUNNEL-ACCESS.md §5.5。


### 内网直连：主应用 HTTP + HTTPS，商店只走 HTTP

| | HTTP（不经反代） | HTTPS（镜像内置 Caddy，自签） |
| --- | --- | --- |
| 主应用 | `http://<局域网IP>:8801` | `https://<局域网IP>:8803` |
| 商店 | `http://<局域网IP>:8802` | **不提供**（商店镜像里没有 Caddy，也没有 8804） |

商店不提供 HTTPS 是刻意的：公网那条已经是真实证书域名（TLS 在隧道 / 跳板机的 80·443 终止），
内网再放一个自签入口只会多一类「证书不受信任 / 地址不匹配」的排错 —— 自签证书还会让客户机的
httpx（按系统 CA 校验）和支付平台直接拒绝。它保护的也只是一段本来就在局域网里的流量。

主应用的 HTTPS 是开箱即用的：Caddy 内置在镜像里、与应用同容器，按连入的 SNI 动态签发**自签**
证书，首次访问手动放行即可 —— 不需要另备反代容器或证书。**但用 IP 访问要先设 SNI 兜底名**：

浏览器访问 **IP 字面量时不发 SNI**（RFC 6066：SNI 只能是主机名），Caddy 的 on_demand 拿不到
名字，只能签给容器自己的 docker IP，浏览器随即判「证书与地址不匹配」，页面直接打不开。所以
要让 `https://<局域网IP>:8803` 可用，必须把实际会输入的地址告诉 Caddy：

```yaml
      APP_HTTPS_DEFAULT_SNI: 192.168.1.20      # 主应用，换成这台机器的局域网 IP
```

改完 `docker compose up -d` 重建容器才生效（环境变量不会热更新）。只填地址本身，别带
`https://` / 端口 / 路径；用主机名访问（`homeos.local`）本来就匹配，可以不改。
零告警要把根证书装进访问设备的信任库：

```bash
docker cp homeos:/data/caddy/data/caddy/pki/authorities/local/root.crt ./homeos-root.crt
```

原因与实测见 `ops/caddy/app.Caddyfile` 的注释。

**HTTP 与 HTTPS 怎么选**：同一次使用里别来回切。Cookie 按**主机**保存、不区分端口和协议，
在 https 下登录拿到的会话 Cookie 带 `Secure`，换到 `http://<同一IP>:8801` 就不会被发送，看起来
像「登录掉了」。二选一，推荐 https —— PWA 安装、剪贴板、摄像头/麦克风等浏览器能力都要求
安全上下文，明文 IP 不算。反过来 http 登录后去 https 是正常的（非 Secure Cookie 两种协议都会发）。

Cookie 的 `Secure` 是按**本次请求实际用的那层**判定的（主应用 `COOKIE_SECURE=auto`，商店
侧 `STORE_COOKIE_SECURE=auto`），所以「公网 https 域名 + 内网 http 直连」「公网 https + 内网
https」这些组合可以同时存在，不会互相拖累。前提是入口透传 `X-Forwarded-Proto`（内置 Caddy
会自动带）。商店不会因为内网入口而改 `STORE_BASE_URL` —— 它仍是公网域名（支付回调与客户机
链接要用），内网 http 只是同一个商店的另一个入口。

端口冲突就改 compose 文件里 `ports:` 的**左侧**（容器内端口不变）：
8801 / 8803 是主应用，8802 是商店。管理员那份的 `APP_BASE_URL` / `STORE_BASE_URL` 已写死公网
域名；换域名时改那里，纯局域网部署可以留空（按请求 `Host` 推导）。
反代 / 内网穿透下 `APP_BASE_URL` 填浏览器实际用的那个来源（`https://域名`），它也是来源校验与
socket.io 白名单的基准；填了不会影响局域网 IP 直连。

主应用的 `APP_TRUSTED_PROXIES` / `UVICORN_FORWARDED_ALLOW_IPS` 已含 docker 网段（隧道 / 反代
回灌到发布端口时，容器看到的源是网桥网关 `172.x`，不是 `127.0.0.1`），**不要**填 `*`；自定义过
网段就按实际值改。商店侧不同：只用 `STORE_TRUSTED_PROXIES`（回环 + 入口所在网段），商店的
uvicorn 不读 `UVICORN_FORWARDED_ALLOW_IPS`，写它不会生效。
商店的邮件 SMTP、支付渠道、站点文案登录 `/admin` 后台改（免重启），未配真实凭据时下单会返回
503（刻意 fail-closed）。

### 对外售卖前（检查清单）

| 项 | 必须做的事 |
| --- | --- |
| 邮件 | `/admin → 站点配置 → 邮件` 配 SMTP 并点「发送测试邮件」；默认 `log` 模式下客户**收不到**验证码。发件域配 SPF / DKIM |
| 客服邮箱 | `/admin` 改成自有邮箱（出厂值只是占位）；新装也可用 `STORE_SUPPORT_EMAIL` 预设 |
| 首次初始化 | 顺序是 `up -d` → 用日志里的 token 建管理员 → **再**放 DNS / 开 80·443。别让未初始化的 `/setup` 停在公网 |
| 端口 | 云安全组只放行 80 / 443；8801 / 8802 / 8803 不对公网放行（Docker 映射会绕过 ufw） |
| 域名 | 大陆服务器需 ICP 备案；证书链完整；支付平台登记的回调域名与 `STORE_BASE_URL` 一致 |
| 支付 | 后台填商户凭据，真实付一笔并在渠道后台看到回调成功（回调地址按 `STORE_BASE_URL` 推导） |
| 备份 | 定时备份 `homeos_homeos-license-keys` 与 `homeos_homeos-store-data`：私钥丢了 = 所有已激活设备失效 |
| 镜像 | 商业分发把 `image:` 固定到具体 tag 或自有仓库，别长期用 `:latest`（客户机会被动升级） |
| 时钟 | 各机器 NTP 同步：租约、会话、订单都按时间判定（本机快于商店 → 判时钟回拨；慢于租约 → 提前到期） |
| 穿透可用性 | 用隧道时先算一遍「最长可中断多久」：`STORE_LEASE_TTL_SECONDS`（默认 3 天）到期且拿不到新租约，**客户机整机被授权门禁挡住**，不是降级。扛不住就把租约放长（如 30 天），代价是吊销生效变慢 |

### 升级与回滚

**先商店、后客户机**，建议两头用同一个 tag。改 compose 里的镜像 tag（或就用 `:latest`）后：

```bash
# ① 管理员这台
docker compose pull && docker compose up -d

# ② 每台客户机
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

只想重启容器不会换镜像；**永远不要执行 `docker compose down -v`** —— 那会连数据一起删。
回滚＝把 tag 换成上一个版本重跑。

### 授权公钥目录（三种部署下是同一个路径）

私钥只在商店；主应用只读公钥。容器内路径统一为 **`/data/client-keys`**，三种部署的差别
只在「这份文件从哪来」，不在路径名 —— 排查「为什么读的是旧公钥」时只需看一个地方。

| 部署 | 商店私钥 | 主应用读的公钥 | 来源 |
| --- | --- | --- | --- |
| 本地开发 | `homeos-store/keys/local` | 仓库根 `keys/` | `ops/dev.mjs` 启动时镜像 |
| 同机 docker | `/data/license-keys` | `/data/client-keys` | 商店写同一卷，主应用只读挂载 |
| 客户机 | （在厂商那台） | `/data/client-keys` | 首次启动向商店取回，之后离线可用 |

同机部署里公钥卷挂在数据卷内部（`/data/client-keys` 覆盖 `homeos-data` 的那一角），所以
两份 compose 的 `APP_CLIENT_KEYS_DIR` 完全相同。客户机上 `/data/client-keys` 位于
`homeos_homeos-data` 卷内：**删掉它重启即会重新取回**（换机后签名对不上时用这招）。

历史上主应用曾单独读 `/shared-keys`，已废弃 —— 路径一多，「到底哪个目录」就成了每次排查的
第一道坎。要确认现场实际用的是哪个，跑 `bash ops/deploy/preflight.sh`（2e 段会打印）。

### 备份数据卷

卷名带 compose 项目名前缀 `homeos_`（两份文件的项目名都是 `homeos`，所以卷名一致；客户机上
只有后两个）：

| 卷 | 归属 |
| --- | --- |
| `homeos_homeos-license-keys` | **商店授权私钥，最关键，单独备份**（丢了所有已激活客户机失效） |
| `homeos_homeos-store-data` | 商店库、订单、审计、商品资源 |
| `homeos_homeos-client-keys` | 公钥镜像（商店写；丢了主应用会重新取回） |
| `homeos_homeos-data` | 主应用数据（含自动取回的公钥缓存；备份包**不在这里**，见下） |
| `homeos_homeos-secrets` | 主应用 HA / 授权凭据签名密钥 |
| `homeos_caddy-public-data` | 公网接入的 TLS 证书与 ACME 账号（仅启用公网段时存在） |
| `homeos_caddy-public-config` | 内置 Caddy 入口的配置与 ACME 中间态（同上） |

备份包**不在数据卷里**：两份 compose 都把 compose 文件同目录的 `./backups` bind mount 到容器的
`/data/backups`（服务器全量 / 自动备份 / 网页导出的 `.habackup` 都在那儿），宿主机直接可见，
换机时整个目录拷走即可。容器内路径没变，所以「备份不能把自己装进包里」的排除逻辑与镜像默认
完全一致。

```bash
mkdir -p backup
docker run --rm -v homeos_homeos-data:/data -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/homeos-data.tgz .
tar -czf backup/backups.tgz backups      # 备份包本身就在宿主目录，直接打包
```

授权私钥卷丢了等于所有已激活客户端失效；公钥丢了不用慌，主应用下次启动会自己取回。

### 替换 UI 素材（图标 / 背景图 / 音效 / Logo）

随包的默认素材（`homeos/assets`）在镜像里是**种子**，compose 把仓库根的 `./assets`
bind mount 到容器 `/app/assets` 作为**实例目录**。替换素材不用重建镜像、不用进容器：

```bash
# 首次 up 后 entrypoint 会自动铺好 ./assets/{icons,backgrounds,sounds,logo}
ls assets/logo                     # 例如 logo.svg
cp my-logo.svg assets/logo/logo.svg   # 直接覆盖同名文件
# 浏览器刷新即可（前端按 URL 缓存，必要时 Ctrl/Cmd+Shift+R 或清一次站点缓存）
```

规则只有一条，**按子目录判定**：

| `./assets/<子目录>` 状态 | 启动时的行为 |
| --- | --- |
| 不存在 / 空 | 从镜像种子铺满该子目录（首次启动、或你想恢复出厂默认时） |
| 有任何文件 | 整棵视为你自己的素材，**一个文件都不动**（替换过的不会被覆盖，删掉的单个文件也不会复活） |

所以恢复出厂默认只要 `rm -rf assets/logo`（清空那个子目录）后
`docker compose restart homeos`。想在 UI 里隐藏某个默认素材，用界面上的隐藏功能
（记录在数据卷的 `.hidden-assets.json`），别去改这个只读层的文件。

### 出问题

| 现象 | 处理 |
| --- | --- |
| `pull` 报 `unauthorized` / `denied` | GHCR 包是私有的：先 `docker login ghcr.io`（PAT 需 `read:packages`） |
| `manifest unknown` / `not found` | 该 tag 还没构建：到 GitHub Actions 手动 Run workflow，或改用 `:latest` |
| `no matching manifest` | 宿主架构缺镜像层：确认宿主是 amd64 / arm64 |
| 主应用启动即退出、提示取回授权公钥超时 | 连不上 `APP_LICENSE_SERVER_URL`：确认商店已起、客户机能访问该地址与端口 |
| 客户机连不上，地址写的是 `https://…:8804` | 商店没有 8804（该端口已随商店内置反代移除），连接必然被拒：客户机必须填公网真实证书域名；内网临时调试可填 `http://<商店>:8802` |
| `https://<局域网IP>:8803` 打不开 / 报「证书与地址不匹配」 | 浏览器用 IP 访问不发 SNI，证书只能签给容器 IP：设 `APP_HTTPS_DEFAULT_SNI=<该IP>`，或改用主机名访问。商店侧没有 HTTPS 入口，内网请用 `http://<IP>:8802`。页面白屏且控制台报 `MIME type ('application/json')` 是另一回事（静态资源被授权门禁挡成 401），见下面的 401 一条 |
| 未激活时页面白屏、资源全 401 | 生产默认开启授权门禁：确认 `/static/assets/**`、`/static/**` 等前端产物未被门禁拦下（`docker logs homeos \| grep 授权门禁`），升级到修掉该问题的镜像 |
| 激活报「租约使用了不受信任的授权公钥」 | 数据卷是别台机器搬来的：删掉主应用数据卷里的 `client-keys` 后重启即会重新取回 |
| 已激活的客户端被判「换设备」 | `/host` 挂载或主机名变了导致实例指纹改变：商店后台解绑后重新激活，或钉住 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID`（macOS 跑 compose 时用 `.env` 里的 `HOMEOS_FINGERPRINT_MACHINE_ID` / `HOMEOS_FINGERPRINT_BOARD_ID`） |
| 商店注册 / 登录 / 下单一律 403 | 反代没透传 `Host` 与 `X-Forwarded-Proto`（公网接入时必配，见 PUBLIC-ACCESS.md） |
| 商店能登录但一刷新又变未登录 | 会话 Cookie 带 `Secure` 却走了 `http://`：默认 `auto` 已按协议判定，出现这条多半是把 `STORE_COOKIE_SECURE` 写成了 `true`（恒带 Secure）—— 改回 `auto`（主应用同理，`COOKIE_SECURE=auto`） |
| 内网 `https://<IP>:8803` 打不开或证书不匹配 | 没设 SNI 兜底名：`APP_HTTPS_DEFAULT_SNI` 填你实际输入的地址，`docker compose up -d` 重建容器。商店侧没有内网 HTTPS，用 `http://<IP>:8802` |
| 内网原来用 `http://…:8801` 能开，访问过一次内网 https 后反而连不上 | 浏览器吃下了 HSTS。商店侧已只对公网 FQDN 下发；主应用在 `auto` 下不发 HSTS。若手动设过 `COOKIE_SECURE=true`，改回 `auto` 并清除该主机的 HSTS 记录 |
| 点语音/麦克风提示「需 HTTPS 安全上下文」 | 浏览器只在安全上下文给麦克风：改用内网 https `https://<同一IP>:8803`（或公网域名），别用 `http://…:8801` |
| 登录页「商店 / 重置商店密码」跳错地址 | 推不出来的地址：取消注释 `APP_STORE_URL` 显式写死（见上面「两个地址，别混」） |
| 本机管理员忘记密码 | 登录页「忘记本机密码」→ `/reset-password`：需商店 SMTP 可达，并向**注册邮箱**收验证码。邮箱等同本机管理员恢复密钥，请确保注册邮箱长期可用 |
| 商店起来了但注册收不到验证码邮件 | 默认 `STORE_MAIL_MODE: log`：验证码在 `docker logs homeos-store \| grep 验证码`；正式对外配 SMTP |

健康检查：`curl -fsS http://127.0.0.1:8801/health/ready`（主应用）、
`curl -fsS http://127.0.0.1:8802/healthz`（商店）；容器与日志用 `docker compose ps` / `docker logs homeos`。

### 可选：自己构建镜像

不走 GHCR、要自己出镜像时：

```bash
bun install
bun run build:frontend                    # 前端 → 根 dist/
python3 ops/build.py backend              # 后端 Cython .so → 根 dist/
python3 ops/build.py image --project app   --tag homeos:local
python3 ops/build.py image --project store --tag homeos-store:local
```

然后把 compose 文件里的 `image:` 换成这两个本地 tag 即可（不需要改别的地方）。

细节（为什么产物里没有明文 `.py`、架构绑定、基础镜像钉版真源、拉不动 Docker Hub 时换镜像站）
见 [ops/BUILD.md](ops/BUILD.md)。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docker-compose.yml](docker-compose.yml) | 管理员这台：商店 + 主应用（同一份编排，公网接入也在这里配） |
| [docker-compose.app.yml](docker-compose.app.yml) | 客户机：只有主应用，商店地址已填好（内网直连时才需改） |
| [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) | 商店公网接入（域名 + 真实证书 HTTPS、支付回调） |
| [ops/deploy/TUNNEL-ACCESS.md](ops/deploy/TUNNEL-ACCESS.md) | 没有公网 IP 时的内网穿透（frp / cloudflared / 节点小宝） |
| [ops/BUILD.md](ops/BUILD.md) | 镜像构建细节（Cython 产物、基础镜像钉版、镜像站） |
| [homeos/frontend/src/README.md](homeos/frontend/src/README.md) | 主应用前端分层 DAG、域边界、桶命名与 studio 的关系 |
| [homeos/frontend/src/studio/README.md](homeos/frontend/src/studio/README.md) | Studio 子系统分层、启动入口、面板渲染器与设备运行时 |
| [item-model/README.md](homeos/frontend/src/studio/app/3d-studio/authoring/items/item-model/README.md) | 物品模型 14 族 / 59 分支的拆分规则 |
| [homeos/backend/src/README.md](homeos/backend/src/README.md) | 主应用后端目录、业务域与关键契约 |
| [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md) | 商店 / 授权服务器细节 |
| [homeos-store/frontend/src/README.md](homeos-store/frontend/src/README.md) | 商店前端（前台 + 运营后台）目录 |
| [MODEL-NAMES.md](homeos/frontend/public/static/3d-studio/models/MODEL-NAMES.md) | 模型库中文名索引（生成，勿手改） |
| [ops/perf/README.md](ops/perf/README.md) | 性能基线与预算（前端体积、3D bench、前后对比） |
| [ops/gates.mjs](ops/gates.mjs) | 门禁清单与分组（CI 五个 job 与本地 `bun run gate` 的唯一来源） |
| [packages/shared/scene/README.md](packages/shared/scene/README.md) | 入户场景静态资源（两个前端共用） |
| `.env.example` | 全部环境变量（按 A–G 分区注释；compose 文件已写死常用值） |

CI：工作流**全部手动触发**（Actions 页面 Run workflow），推送不会自动构建：

- `.github/workflows/checks.yml`：五个 job 对应 `ops/gates.mjs` 的五个组
  （static / test / model / build / infra），也被 `docker.yml` 通过 `uses:` 复用于发版前；
- `.github/workflows/docker.yml`：amd64 + arm64 构建并推 GHCR。
