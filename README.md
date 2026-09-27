# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控平台，当前版本 **0.6.5**（见 `VERSION`）。

提供可视化编辑器、3D 户型工作室、全屏展示页与中控配对；后端 FastAPI，前端原生 HTML / CSS / JavaScript，数据默认落在本机 SQLite。既可直接跑源码树，也可用 Docker Compose 双容器自托管（主应用 + 授权商店）。**授权校验始终开启**，激活走仓库自带的授权商店与授权服务器（`apps/store/`），不连接任何外部厂商节点。

## 功能

- 仪表盘编辑：页面、控件、实体绑定、弹窗、主题（内置 `homeos-dark`）
- 正式展示：`/display/{项目名称}` 打开全屏中控页；中控配对用 6 位配对码，适合墙面平板或独立浏览器
- 3D 户型：建模 / 导入，按楼层或全楼自动导图并回写仪表盘；灯光按区域归类，墙体与灯光属性可批量应用
- 3D 交互：控件嵌入户型舞台，控制灯、开关、窗帘（含卷帘与一拖多组合）、空调、空气净化器 / 新风机、电视、门锁（门磁与电量只读）与通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的附加功能；温湿度计、扫地机、NAS、摄像头与人体传感器只作状态展示；展示页用 iframe 打开同一舞台
- Home Assistant：HTTP / WebSocket 同步实体与状态，代理摄像头和媒体
- 全局日志：按级别、分类、关键词筛选，导出时遮盖敏感信息
- 授权商店：账号、邮箱验证码、商品与优惠码、邀请返利与提现、订单查询、设备自助解绑
- 授权服务器：Ed25519 签名租约 + X25519 加密传输，心跳续租与启动联网确认
- 运营后台：`/admin` 管理商品、订单、授权、绑定、优惠码、提现、站点配置、版本与审计日志

## 组件

仓库根目录下同时运行两个服务。本地开发共用 `.venv-store`，生产用 Docker Compose 各跑一个容器：

```text
HomeOS/
├── apps/server + frontend   主应用                http://127.0.0.1:18081
└── apps/store               授权商店与授权服务器   http://127.0.0.1:18082
```

- **主应用**：`apps/server/`（FastAPI）+ `frontend/`（HTML / 原生 JS），负责仪表盘编辑、展示、中控配对、HA 连接、3D 工作室与 3D 交互舞台。启动时自动执行 Alembic 迁移。
- **授权商店与授权服务器**（`apps/store/`）：独立 FastAPI 应用，在 **18082** 同时提供 ① 授权商店（账号 / 商品 / 订单 / 优惠码 / 邀请，`/store/v1/*`）② 授权服务器（`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，Ed25519 签发租约 + X25519 加密）③ 运营后台（`/admin` + `/store-admin/v1/*`）。三者共用同一个 SQLite 库，所以「支付后自动发码并可立即激活」。支付渠道**默认不配置**（未配置时拒绝建单，刻意 fail-closed；模拟收银台需同时 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`），正式收款切换支付宝当面付。完整说明见 [apps/store/README.md](apps/store/README.md)。

## 仓库结构

工程在仓库根目录：两个可独立部署的应用在 `apps/server/` 与 `apps/store/`（平级、互不 import），运维与部署脚本在 `ops/`，Alembic 脚本在 `db/migrations/`，构建期生成的合约件与「同名双份」的契约面清单在 `packages/`。不再套一层 `app/`。

```text
HomeOS/
├── apps/                       # 两个可独立部署的应用：互不 import、可能分机部署（第 43 条守卫强制）
│   ├── server/                 # 主应用 FastAPI（PYTHONPATH 指向仓库根，启动为 apps.server.main:app）
│   │   ├── core/               # 数据库 / ORM 模型 / 请求响应模型 / 迁移 / 画布与地址常量
│   │   ├── security/           # 会话、认证授权依赖、限流、来源与同源校验、初始化守卫
│   │   ├── http/               # 请求体上限、缓存响应头、流式落盘、访问日志过滤
│   │   ├── observability/      # 全局事件日志、版本更新检查
│   │   ├── api/                # 认证、项目、HA、资源、3D、日志、图标、中控
│   │   ├── ha/                 # HA 客户端、同步、状态推送
│   │   ├── panel/              # 仪表盘文档与校验（含全局弹窗）
│   │   ├── modules/            # 增量能力（3D 交互）
│   │   ├── license/            # 客户端授权：租约验签、心跳、能力门禁
│   │   ├── app/                # 装配层：lifespan / middleware / pages / errors / request_context
│   │   └── config.py main.py   # main.py 只剩 create_app 的接线与模块级 app（102 行）
│   └── store/                  # 授权商店 + 授权服务器 + 运营后台
│       ├── app.py run.py config.py
│       ├── core/               # 连接 / 表 / 请求响应模型 / 序列化 / 公共依赖 / 启动默认数据
│       ├── security/           # 口令会话、来源与同源校验、失败限流、初始化守卫、请求体上限、库结构守卫
│       ├── commerce/           # 商品 · 订单 · 履约 · 优惠码 · 积分与邀请
│       ├── ops/                # 站点配置、邮件、发布信息、能力码目录、可达性探测、异常计数
│       ├── api/                # store.py(/store/v1) license.py(/v2) admin.py alipay.py setup.py pages.py
│       ├── licensing/          # 服务端传输加密 + 租约签发 + 三端点业务
│       ├── payments/           # base / mock / alipay / 统一入账
│       ├── templates/ static/  # store.html + admin.html；theme.css / store.css / admin.css / admin/
│       ├── keys/local/         # 授权私钥（不入库）
│       └── data/               # 商店 SQLite 与商品图（不入库）
├── frontend/
│   ├── *.html              # index / display / license / login / pair / setup / 3d-studio
│   ├── modules/runtime/    # 3D 交互舞台与编辑器，按功能域细分（经 interaction3d 下发）
│   │   ├── core/ camera climate cover light nas television vacuum presence environment security/
│   │   └── editor/         # 配置编辑器与量程对话框
│   └── static/             # 挂载为 /static
│       ├── app.css         # 唯一全局样式表
│       ├── bridge/ editor/ renderer/ display/ auth/ shared/ logging/ utils/ templates/
│       ├── 3d-studio/      # 户型工作室（studio/ plan/ reflection/ materials/ loaders/ export/）
│       ├── assets/         # icons/ manifest/ component-thumbnails/
│       └── vendor/         # three.js、hls.js、MDI
├── keys/                   # 客户端默认读取的公钥镜像（启动时自动同步）
├── db/migrations/          # Alembic 基线 0001 + 增量 0002（项目名唯一）/ 0003（展示地址别名）/ 0004（3D 交互同步）
├── image/                  # 可选的自定义内置素材目录（默认空）
├── tools/                  # 静态守卫与建模流水线（只用 Node 内置模块，无 npm 依赖）
│   ├── paths.mjs           # 仓库路径的**唯一事实来源**：脚本不许自己拼路径（有守卫强制）
│   └── fixtures/           # 守卫用的固定基线（含 admin 路由基线：拆组时逐项比对注册顺序）
├── packages/               # 构建期产物与契约清单：contracts/surfaces.json 声明哪些同名双份必须一致
├── ops/                    # 运维与部署（只有构建期与本地启动用它，运行期代码不 import 它）
│   ├── ops/start.py            # 本地开发拉起两个服务：python ops/start.py
│   ├── ops/container_entrypoint.py  # 容器 ENTRYPOINT：校正数据目录属主，再交给 CMD
│   ├── ops/docker/             # 容器启动器与构建期保护（Cython 编译 py / 混淆 js）
│   └── ops/deploy/             # 生产清单与反代示例（Caddy / nginx）
├── data/                   # 主应用运行时数据（不入库）
├── .env.example Dockerfile docker-compose.app.yml docker-compose.store.yml
└── alembic.ini VERSION
```

不要删除 `frontend/`。内置素材目录 `image/` 可自行增删，编辑器里也可改用用户上传图片。

以下已写入 `.gitignore`：`data/`、`apps/store/data/`、`apps/store/keys/local/`、`.env` 与 `.env.*`（`.env.example` 除外）、`.venv/`、`.venv-store/`、`*-private.pem`，以及本地临时目录 `/app/`（解包旧构建）、`.deobf/`（反混淆产物）、`原项目/`（对照快照）。

## 环境

- Python 3.11+（本地已在 3.14 验证）
- 本机同时跑两个进程：主应用 **18081**、授权商店 **18082**
- 连接 Home Assistant 时，主应用需要能访问 HA 的 HTTP 与 WebSocket

依赖见 [apps/store/requirements.txt](apps/store/requirements.txt)：FastAPI、Uvicorn、SQLAlchemy、Pydantic、httpx、cryptography、python-multipart（主应用与商店共用）。其中 `watchfiles` 只服务本地热重载：`ops/start.py` 会给商店设 `STORE_RELOAD=1`，`apps/store/run.py` 据此以 uvicorn reload 模式监听 `apps/store/` 目录。

## 本地启动

仓库根目录一条命令：

```bash
python3 ops/start.py
```

生产或容器部署请改走 [Docker](#docker)，不必用 `ops/start.py`。

`ops/start.py` 会：① 缺失时创建 `.venv-store` 并按 `apps/store/requirements.txt` 安装依赖；② 读取根目录 `.env`（已存在的真实环境变量优先）；③ 依次拉起授权商店 **18082** 与主应用 **18081**（主应用带 `--reload`）。

首次启动**不需要任何准备命令**：`ops/start.py` 会先在 `apps/store/keys/local/` 生成缺失的授权密钥，并把公钥镜像到仓库根 `keys/`（客户端信任锚），商店启动时再幂等补齐商品目录与站点配置。

> 公钥镜像 `keys/` 与 `apps/store/keys/local/` 必须**逐字节一致**：客户端按 PEM 文件字节校验 sha256。镜像由启动时自动同步，不要手工只覆盖其中一处，否则激活会因指纹不匹配而失败。

主应用打开 <http://127.0.0.1:18081/setup>，商店打开 <http://127.0.0.1:18082/>。

数据库结构由基线 `0001` 加增量 `0002` / `0003` / `0004` 在主应用启动时自动建立（迁移串行化，动结构前留一份可还原快照）。需要手工执行时：

```bash
APP_DATA_DIR=./data PYTHONPATH=. alembic upgrade head
```

## 首次使用

1. 打开 `/setup` 创建管理员（用户名 3–64 个字符，密码至少 8 位）。从**本机**（`localhost` / `127.0.0.1`）打开时直接填账号密码；从其它地址打开时页面多出「引导密钥」一栏，需填服务启动日志里打印的那一串 —— 见下方[首次设置窗口](#首次设置窗口)。
2. 打开 <http://127.0.0.1:18082/>：首次部署会先经 `/admin` 跳到 `/setup` 创建**商店管理员**；随后注册商店账号（本地联调默认 `STORE_MAIL_MODE=echo`，验证码直接回显），选择商品并用模拟收银台完成支付（`ops/start.py` 已自动带上 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`），账号中心会发放激活码。
3. 回到主应用登录后进入 `/license`，用「激活码 + 购买邮箱」激活。未激活时编辑器会跳到 `/license`，展示页和受保护静态资源返回 401 / 403。
4. 在编辑器里配置 Home Assistant 的地址和长期访问令牌，然后创建空白仪表盘。
5. 使用 3D 交互：先在 `/3d-studio` 保存户型，再在编辑器添加「3D 交互」控件并载入户型快照，绑定 `light.*` / `switch.*` 等实体后即可在舞台里控制。
6. 墙面中控：在编辑器生成 6 位配对码，设备打开 `/pair` 完成配对。

未初始化时任意页面都会跳到 `/setup`。

### 首次设置窗口

`/api/v1/setup/admin` 不能要求登录（此时还没有账号），所以必须自己管住「谁有资格创建管理员」，否则任何能连上这台机器的人都能抢先建掉管理员并当场拿到会话：

- **本机直连放行**：三个条件同时成立 —— TCP 对端是 `127.0.0.1` / `::1`、`Host` 头的主机名也是 `127.0.0.1` / `::1` / `localhost`、且请求不带任何转发头（`X-Forwarded-*`、`Forwarded`）。带转发头说明前面还有代理；`Host` 那条专门挡**同机反向代理**（nginx 默认连转发头都不补、对端又是 `127.0.0.1`）。**从本机操作请用 `localhost` 或 `127.0.0.1` 打开**，用域名打开则要填引导密钥。
- **其它来源必须带引导密钥**：`APP_SETUP_TOKEN` 的值，或首次启动时自动生成的那一串。生成的密钥写在 `$APP_DATA_DIR/setup-token`（权限 `0600`）并打印到启动日志 / 容器日志：

  ```text
  HomeOS 尚未初始化（库中没有任何管理员账号），完成首次设置后本窗口自动关闭。
    密钥来源: /data/setup-token
    密钥内容: 1Bv...（32 字节随机串）
  ```

  取用方式：`docker logs <容器>`，或 `cat $APP_DATA_DIR/setup-token`。自动生成的那份会**另留一个 `setup-token.generated`**（同目录、`0600`）记录密钥指纹，用来在重启时区分「上次没走完的窗口留下的」与「运维自己预置的恢复手段」——只有前者会被清理。自己往 `setup-token` 放密钥时不要放这个文件。
- 失败会计入限流（与登录共用限流器），成功与失败都写审计日志；初始化成功后密钥立即作废（自动生成的那份文件会被删除），窗口关闭。重置账号（删除 `data/admin-account.json` 后重启）会重新打开窗口并重新生成密钥。

忘记主应用管理员账号或密码：停掉进程，删除 `data/admin-account.json` 再启动，系统回到设置页。户型、HA 配置、授权和中控配对不会被删。

## 安全基线

以下是代码里已生效的默认行为，不需要额外配置；只有反向代理部署才需要补一对变量。两条硬边界：**授权校验不能通过环境变量关闭**，**首次设置的窗口不会长期敞开**。

- **请求来源**：默认不信任任何转发头（`APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` 留空），一律按 TCP 对端地址统计，伪造 `X-Forwarded-For` 换不来新的限流桶；配了可信代理后，也只在这条连接确实来自代理时才从转发链里取真实来源。uvicorn 的 `--forwarded-allow-ips` 默认 `127.0.0.1,::1`（只信回环），**不要填 `*`**，否则登录限流、配对码枚举预算与审计来源 IP 会同时变成「客户端自己说了算」；前面确有反代时填代理自身的地址或网段。
- **会话与 Cookie**：Cookie `Secure` 按请求自动判定（显式开关 / `*_BASE_URL` 是 https / 可信代理转发了 `X-Forwarded-Proto: https` / 连接本身是 https，任一成立即加），漏配不会明文下发，纯 http 局域网也不会误加。登录会话为滑动有效期 `APP_SESSION_MAX_AGE_SECONDS`（默认 8 小时）+ 绝对寿命（默认 30 天），后者不能被续期突破；会话列表与撤销见 `/api/v1/auth/sessions`。中控令牌默认滑动 180 天（活跃即续期），可选硬上限。
- **CSRF**：非 GET 的 `/api/*`（商店为 `/store/v1/*` 与 `/store-admin/v1/*`）做显式 Origin / Referer 同源校验，只认「裸的 `scheme://host`」；GET / HEAD / OPTIONS 不拦。豁免 `/v2/*` 授权端点（加密封套 + 签名）与支付宝异步回调（真伪由签名校验）。
- **首次设置**：主应用 `apps/server/security/setup_guard.py` 与商店 `apps/store/security/setup_guard.py` 各一份（两个服务独立部署、刻意不互相 import）；商店侧再用一条 `INSERT ... WHERE NOT EXISTS` 由数据库定胜负。
- **配对 / 上传 / 日志**：配对码两档限流（按 IP + 跨来源总预算），被在用设备占用返回 409，配对前校验授权允许 `display`；上传按 `Content-Length` 早拒 + 逐块累计兜底（SVG 5 MB / 位图 64 MB，超限 413 且不留垃圾文件）；全局日志写盘移交给唯一的后台写线程，同处刷屏折叠成一条并累加 `repeatCount`。
- **归属与出网**：3D 导出与效果变体按项目归属（跨项目 403，文件不存在统一 404）；改 HA 地址但不重输令牌返回 409 `HA_URL_CHANGED_TOKEN_REUSE`；云元数据地址（`169.254.169.254` 等）在 `/api/v1/ha/test` 直接 422。
- **商店侧**：商品字段取值由 `apps/store/commerce/catalog.py` 收敛；订单终态保护（`cancelled` / `expired` / `refunded` 不能再被标记支付或履约）；商品图按魔数识别（SVG 明确 422）；改库前用 `VACUUM INTO` 取一致快照（WAL 模式直接复制主库会得到空壳）；能力码清单只在 `apps/store/ops/features.py` 定义。详见 [apps/store/README.md](apps/store/README.md)。

## 授权体系

### 零配置指向自建授权服务器

客户端默认值写在 `apps/server/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像 `keys/` 及其 sha256，**密钥 id 由公钥文件字节派生**（形如 `hb-3f2a…`），服务端与客户端各自从自己那份镜像算出同一个值，无需人工同步字符串。**不设任何环境变量**，起服务后即可在 `/license` 激活。

整个体系是「服务端签发 Ed25519 签名租约 → 客户端离线验签 → 定期心跳续租」：租约 7 天有效，客户端每 300 秒续租一次；传输层为 X25519 ECDH → HKDF-SHA256 → AES-256-GCM，端点路径本身也参与派生与认证。

需要把授权服务器部署到别处时才用环境变量覆盖，例如：

```bash
export APP_LICENSE_SERVER_URL=https://license.example.com
export APP_LICENSE_PUBLIC_KEY_FILE=/path/to/license-public.pem
export APP_LICENSE_PUBLIC_KEY_SHA256=<license-public.pem 文件字节的 sha256>
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE=/path/to/license-transport-public.pem
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256=<license-transport-public.pem 文件字节的 sha256>
```

- 只设 `APP_LICENSE_SERVER_URL` 时，客户端会把批次收敛为单条 `direct`，不会散到其它节点；多批次用 `APP_LICENSE_SERVER_BATCHES='esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083'`（`;` 分隔批次，`|` 分隔组内地址，空组禁用）。
- **密钥轮换**：`keyId` 由公钥派生，重新生成密钥必然换 id，直接覆盖会让旧客户端当场失效。平滑过渡：把当前四件套改名成 `*.previous.pem`，再生成新四件套并镜像到 `keys/`；服务端按请求 keyId 选代解密并用同一代签名，客户端也会自动多信任上一代（`keys/license-public.previous.pem` 存在才登记）。删掉四个 `*.previous.pem`（缺一不可）即立即关闭窗口。

### 能力码

租约携带的能力码决定主应用各部分是否可用（`LicenseService.allows`）：`api`、`assets`、`editor`、`display`、`ha.sync`、`ha.configure`、`ha.control`、`projects.write`、`runtime.websocket`、`module.3d_interaction`。首次启动自动补齐三条商品与能力码对应关系：

| 商品 | 类型 | 能力码 |
| --- | --- | --- |
| 编辑器+绘制工具 | `base` | 上表除 `module.3d_interaction` 外的全部 |
| 3D交互包 | `module` | `module.3d_interaction` |
| 编辑器+绘制工具+3D交互 | `package` | 基础能力 + `module.3d_interaction` |

### 重启联网确认与吊销

客户端启动时先做一次 `recover` 联网确认，失败按性质分流：

- **确认吊销**（403 且响应含结构化 `code=REVOKED` / `revoked: true`）→ 保持拦截，清空本地授权，状态 `REVOKED`。
- **其余失败**（网络不可达、服务端 5xx）→ 不锁死：租约未过期则 `CONNECTION_WARNING`（门禁放行），已过期则 `LEASE_EXPIRED`（拦截）。心跳循环持续重试，服务器恢复后自动续租回到 `ACTIVE`。

运营后台「停用设备绑定 / 停用授权」后，端点返回 `403 {"detail": "...", "revoked": true, "code": "REVOKED"}`。客户端只认结构化 `code`（`REVOKED` / `LICENSE_REVOKED`）或 `revoked: true`，才判定为确认吊销并清空本地授权；其余 401/403（无上述字段）视为瞬时故障（保留本地授权继续重试）。详见 `apps/server/license/service.py` 的 `is_confirmed_revocation`。

## 3D 户型工作室

打开 `/3d-studio`。左侧是模型库与检查器，右侧是平面图画布。工作室只编辑草稿，不会直接改动仪表盘；户型和场景要另外导出，或生成 3D 交互快照后供仪表盘与展示页使用。

### 平面图工具

| 工具 | 说明 |
| --- | --- |
| 选择 | 单击精确选择，空白处拖拽框选；移动时 `Shift` 锁轴、缩放时 `Shift` 等比例，`Option`/`Alt` 拖动复制，`⌘`/`Ctrl+C`、`V` 复制粘贴 |
| 平移 | 按住左键拖动平移画布（只改视角，不写入草稿、不进撤销栈） |
| 参考线 | 依次单击两个端点确定真实比例； `Shift` 强制锁定水平或垂直 |
| 墙体 | 逐点绘制并回到起点闭合空间；未闭合不生成地面，按住 `Shift` 锁轴，`Esc` 结束 |
| 窗户 / 门 / 栏杆 | 靠近墙体单击自动吸附，分别生成真实窗洞 / 门洞 / 玻璃栏杆（替换对应的实体墙） |
| 铭牌 | 单击画布放置户型铭牌，选中后可改文字、拖动、缩放和旋转 |
| 楼板洞口 | 位于工具栏右侧，拖出矩形洞口，仅切除当前层楼板 |

滚轮缩放、中键拖动、按住空格拖动在任何工具下都可用。切到「灯光」分类后户型会锁定，只能使用「选择」工具，点击其他工具会提示先切回家居或电器。

### 灯光区域与灯组

「灯光」分类下会出现图层面板（区域 → 灯组的二级树），顶部有 `全关`、`新建区域`、`新建灯组`。

- **区域**用于按房间或空间给灯组分类，只有名称（最长 16 字，同层不可重名），可重命名或删除。
- **灯组**包含名称（最长 24 字）、启用状态和所属区域；未归入任何区域的显示为「未分类」。
- **拖入区域**：拖动灯组行到目标区域标题上即可移入（标题高亮提示）；拖到另一个灯组行上则是在区域内调整顺序。
- **右键菜单**：灯组行可选 `设置区域` / `重命名` / `复制灯组` / `删除`；区域标题可选 `重命名区域` / `删除区域`。`设置区域` 弹窗里也可直接输入新名称就地新建，选「未分类」则移出区域。
- **删除区域不会删除灯组**，组内灯组会回到「未分类」。区域和归属按楼层保存，展开／收起状态只在当前会话内有效。

### 墙体属性与批量应用

选中墙体后，检查器里每一项都可以单独修改，其中四项各自带一个 `应用到所有` 按钮：

| 字段 | 取值范围 | 说明 |
| --- | --- | --- |
| 墙长 | 只读 | 由两端点决定 |
| 墙高（m） | 0.01–6 | 同时成为本层新画墙体的默认值 |
| 厚度（m） | 0.01–3 | 同时成为本层新画墙体的默认值 |
| 透明度设置 | 跟随通用 / 单独设置 | 选择「跟随通用」即清除该墙的单独设置 |
| 透明度（%） | 0–100 | 仅在「单独设置」下生效 |
| 开放端点提醒 | 自动判断 / 允许开放端点 | — |

点击 `应用到所有` 打开「应用墙体属性」弹窗：上方显示将要应用的值，下方是带复选框的墙体列表（每行标注当前值，当前墙标「当前墙」），可 `全选` / `取消全选`，确认按钮为 `应用所选`。作用范围是**当前楼层**，只改所选这一项属性，整批只产生一次撤销快照；应用墙高 / 厚度时本层的默认值也会同步更新。灯光的色温、亮度、照射范围、照射角度、离地使用同一套批量入口；左侧顶部的「墙体」卡片（高 / 厚 / 透明度）不弹选择框，会直接覆盖当前楼层的所有墙体。

### 模型库与草稿

- **壁画**（1.20 × 0.80 m，离地 0.90 m）与**背景墙**（3.00 × 2.40 m）都由程序化生成（画布纹理加几何体），不依赖外部模型文件，因此不会出现模型加载失败；背景墙的「格栅条」样式会额外出真实 3D 格栅。
- **柱子**（默认 0.45 × 0.45 m，位于「结构与特殊物件」分类）：形状支持方形 / 圆形 / 半圆形 / 1/4 圆形（含内弧），可垂直站立或水平躺放；非方形柱子使用轻量模型 `pillar-*-lite.glb`，加载失败时自动回退到完整模型，方形柱子回退到程序化几何体。
- **草稿保存**是自动的：停止操作约 650 ms 后写入 `data/studio3d/draft.json`，状态依次为「有未保存修改」「正在保存…」「已自动保存」。同一份草稿已在另一个页面被修改时会弹出版本冲突提示，自动保存暂停，需选择 `加载服务器版本` 或 `使用当前页面覆盖`。

## 页面与接口

### 主应用（18081）

| 路径 | 说明 |
| --- | --- |
| `/setup` | 首次安装或重置管理员 |
| `/login` | 管理员登录 |
| `/license` | 用激活码 + 购买邮箱激活 |
| `/` | 仪表盘编辑器 |
| `/3d-studio` | 3D 户型工作室 |
| `/pair` | 中控设备配对 |
| `/display/{project_name}` | 正式展示地址：按项目名称打开全屏中控页 |
| `/health/live` · `/health/ready` | 进程存活 · 数据库就绪 |
| `/api/v1/auth/*` | 初始化、登录、登出、当前用户；`/auth/sessions` 列出 / 撤销登录会话 |
| `/api/v1/projects/*` | 仪表盘项目与草稿（`projects.write`） |
| `/api/v1/ha/*` | HA 连接、实体、翻译、历史、区域、设备、同步、健康、服务调用、媒体浏览；`ha.configure` / `ha.sync` / `ha.control` 分别门禁 |
| `/api/v1/displays/*` | 中控设备与配对码 |
| `/api/v1/assets/*` | 内置素材、用户图片、灯光效果变体、户型导出 |
| `/api/v1/icons` · `/api/v1/studio3d/*` | 图标目录 · 3D 草稿与导出 |
| `/api/v1/modules/interaction3d/*` | 3D 交互：场景快照、舞台页、灯光缓存、配置编辑脚本 |
| `/api/v1/logs` · `/api/v1/updates` | 全局日志（列表、导出、上报、清空）· 版本更新检查 |
| `/api/v1/license/status` · `/api/v1/license/activate` | 授权状态与激活 |
| `/api/v1/ws/runtime` | 实时状态 WebSocket（需 `runtime.websocket`） |
| `/api/camera_hls/*`、`/api/camera_proxy/*`、`/api/hls/*` 等 | 摄像头与媒体代理（反向代理需一并转发） |
| `/static/*` | 前端静态资源（按功能域分区：`/static/editor/home.js`、`/static/app.css`） |
| `/assets/builtin/*` | 需登录或已配对，且授权允许 `assets` |
| `/component-lab`、`/template-assets/*` | 有意保留的 404 占位路由 |

登录、设置、配对、授权页的脚本和样式可匿名访问。编辑器、展示页、3D 工作室和大部分静态资源需要登录或已配对，并且当前授权允许对应能力。

### 授权商店与授权服务器（18082）

| 路径 | 说明 |
| --- | --- |
| `/` · `/products` · `/item/{product_id}` | 商店首页、商品列表、商品详情 |
| `/user/authentication/login` · `register` · `forget` | 登录、注册、找回密码 |
| `/user/dashboard/index` · `/user/index/query` · `/user/referrals` | 账号中心、订单查询、邀请返利 |
| `/admin` | 运营后台 |
| `/setup` | 商店首次部署：创建管理员（非本机直连需带引导密钥） |
| `/store/v1/setup/status` · `/store/v1/setup/admin` | 初始化状态与创建管理员接口 |
| `/store/v1/*` | 商店 API：验证码、账号、商品、订单、优惠码、邀请、提现 |
| `/v2/activate` · `/v2/heartbeat` · `/v2/recover` | 授权服务器端点（加密封套） |
| `/store-admin/v1/*` | 运营后台 API |
| `/store/v1/payments/alipay/notify` · `/store/payment/return` | 支付宝异步通知与同步跳转 |
| `/store/mock/pay/{order_no}?t=…` | 模拟收银台（仅 `mock` 渠道，需短时票据或登录态） |
| `/store-static/*` · `/fonts/*` | 商店静态资源与图标字体 |
| `/healthz` · `/store-api-docs` | 存活检查 · OpenAPI 文档 |

## 运行时数据

`APP_DATA_DIR` 默认是仓库下的 `data/`。

| 路径 | 说明 |
| --- | --- |
| `app.db` | 主应用 SQLite 主库 |
| `admin-account.json` | 独立管理员账号 |
| `instance-id` / `hardware-fallback-id` | 安装实例 ID（缓存；真相源是硬件指纹）/ 硬件不全时的本机封印兜底熵（拷到别的机器会失效） |
| `secrets/` | HA、配对、授权密钥 |
| `assets/` | 用户上传图片 |
| `studio3d/` | 3D 草稿 |
| `modules/interaction3d/` | 3D 交互场景快照与灯光渲染缓存 |
| `exports/` | 3D 导出 |
| `logs/` | 全局事件日志 |
| `cache/effect-variants/` | 灯光效果变体缓存 |

授权商店数据在 `apps/store/data/`：`store.db` 与商品图。授权私钥在 `apps/store/keys/local/`。**不要提交这些文件。**

### 升级与迁移

- 数据库结构由基线 `0001` 加增量 `0002`（项目名唯一）/ `0003`（展示地址别名）/ `0004`（3D 交互同步）建立，主应用启动时自动执行并在动结构前留一份可还原快照。若库内记录的是更早构建的 revision，会先认领基线再升级（不改动任何业务数据）。
- 邀请积分从 `FLOAT`（积分）改为 `INTEGER` **厘**（1 积分 = 100 厘）：原先靠 `round(x, 2)` 维持两位小数，而 SQLite 的 `round()` 是 half-away、Python 的是 half-even，落在 `.xx5` 上两侧会给出不同分币值。**升级不需要手工执行任何命令**：商店启动时自动按「补列 → 回填 + 逐行对账 → 退役旧列」完成，动手前先备份 `store.db.pre-centi-<时间戳>.bak`；对账有任何一行不一致就保留新旧列并存并打印差异，不会丢数据。对外 JSON 契约没变（仍是 `"10.05"` 这样的两位小数字符串）。详见 [apps/store/README.md](apps/store/README.md)。

## 环境变量

主应用与商店的变量统一写进仓库根目录的 `.env`：把 [.env.example](.env.example) 复制成 `.env` 再按需取消注释（`.env` 已被 gitignore）。优先级：**真实环境变量 > `.env` > 代码 / `ops/start.py` 默认值**。

模板按用途分区，**多数部署只需改 A 区**：

| 区 | 内容 |
| --- | --- |
| **A. 部署常改** | 公网域名、可信反代、Cookie Secure、模拟支付总闸 |
| **B. 主应用** | 数据目录、会话 / 中控寿命、HA / 授权超时与密钥路径 |
| **C. 商店基础设施** | 监听、数据目录、租约 TTL、巡检间隔、限流等后台改不了的项 |
| **D. 首次初始化** | 两个 `/setup` 页面的引导口令（`APP_SETUP_TOKEN` / `STORE_SETUP_TOKEN`），不设则首次启动自动生成并打印 |

站点名、公告、客服、维护、邀请提现、解绑冷却、验证码 TTL、**邮件 / SMTP、支付渠道、支付宝商户与回调**等请到商店 `/admin`「站点配置」改（**保存即生效、免重启**）。`.env.example` 有意不再罗列这些项，避免和生产后台双源配置打架。

### 部署常改（A 区）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_BASE_URL` | 空 | 主应用对外根地址；反代时建议设置，供 WebSocket 校验 Origin |
| `APP_LICENSE_SERVER_URL` | 本地 `http://127.0.0.1:18082`；Compose 默认 `http://homeos-3d-store:18082` | 授权服务器地址；同 Compose 网络通常不用改 |
| `APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` | 空 | 可信反向代理 IP / CIDR（逗号分隔）；留空则不信任任何转发头 |
| `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1,::1`（Compose 与容器启动器） | uvicorn 允许改写对端地址的来源范围。**不要填 `*`**，否则限流与审计来源 IP 由客户端自己决定；前面有反代时填代理自身地址 / 网段 |
| `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` | `false` | 强制会话 Cookie 加 `Secure`；不设时按请求自动判定 https |
| `STORE_BASE_URL` | 由请求推导 | 商店对外基址（支付二维码 / 回调链接） |
| `STORE_ALLOW_MOCK_PAYMENTS` | `false` | 模拟收银台总闸；**仅本地联调**，生产保持关闭 |

### 主应用常用（B 区摘要）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DATA_DIR` | `<仓库>/data`（容器 `/data`） | 运行时数据目录 |
| `APP_PORT` | `18081` | 容器监听端口 |
| `APP_SESSION_MAX_AGE_SECONDS` | `28800` | 登录会话滑动时长（8 小时）；必须为正整数，配成 0 / 负数启动即报错 |
| `APP_SESSION_HARD_MAX_AGE_SECONDS` | `2592000` | 会话绝对寿命（30 天）；`0` = 不设绝对上限 |
| `APP_SETUP_TOKEN` | 空 | 首次引导密钥；留空则首次启动自动生成 |
| `APP_DISPLAY_COOKIE_MAX_AGE_SECONDS` / `APP_DISPLAY_TOKEN_TTL_SECONDS` | `15552000` | 中控 Cookie / 令牌滑动有效期（180 天） |
| `APP_DISPLAY_TOKEN_HARD_TTL_SECONDS` | `0` | 中控令牌硬上限；`0` = 不设 |
| `APP_UPDATE_CHECKS` | `0`（关闭） | 打开版本更新检查；开启后每 6 小时向发布端点外发一次本机版本与渠道 |
| `APP_UPDATE_ENDPOINTS` / `APP_UPDATE_WIKI_URL` | 内置厂商端点 | 自建部署应指向自建商店的 `/store/v1/updates/latest` |
| `APP_LICENSE_PUBLIC_KEY_FILE` · `_SHA256` / `APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE` · `_SHA256` | 仓库 `keys/`（容器由共享卷注入） | 签名 / 传输公钥及其指纹 |
| `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` | 留空（由宿主标识派生） | 显式钉住授权实例指纹，用于宿主标识不稳或跨服务器迁移；改动等于换设备，商店侧 1 授权 : 1 绑定会拒绝，须先解绑 |

授权校验始终开启（`license_required=True`），不能通过环境变量关闭；激活只连接自建授权服务器。

### 授权商店常用（C 区摘要）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STORE_HOST` / `STORE_PORT` | `0.0.0.0` / `18082`（`ops/start.py` 下为 `127.0.0.1`） | 监听地址 |
| `STORE_DATA_DIR` / `STORE_LICENSE_KEYS_DIR` | `apps/store/data` / `apps/store/keys/local`（容器 `/data` 与 `/data/license-keys`） | 数据目录 / 授权私钥目录 |
| `STORE_COOKIE_NAME` | `ha_bridge_store_session` | 商店会话 Cookie 名 |
| `STORE_LEASE_TTL_SECONDS` | `259200` | 租约有效期（72 小时）。⚠ 该值同时是「离线可用时长」与「吊销生效上界」：对持续离线的客户端，停用授权最慢要等这么久才生效 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT` | `3600` | `/v2/heartbeat` 与 `/v2/recover` 的来源 IP 小时配额（`/v2/activate` 固定 60/小时）；按 NAT 出口地址算，多设备共用出口时调大 |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期（真实收款须调大） |
| `STORE_PAYMENT_SWEEP_INTERVAL_SECONDS` / `_BATCH` | `30` / `25` | 支付巡检间隔与每轮上限 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 接口是否回显验证码（生产必须 false） |

商店这一节的数值 / 布尔变量在启动时**严格解析**：写错（如 `STORE_ORDER_TTL_SECONDS=12o`）会让进程带着一条点名变量的错误拒绝启动，只有「不写 / 留空」才用默认值。本地 `ops/start.py` 会临时打开 `STORE_PAYMENT_PROVIDER=mock`、`STORE_ALLOW_MOCK_PAYMENTS=1` 与 `STORE_MAIL_MODE=echo`；Docker 生产路径不会自动打开。后台「站点配置」口径：留空 / 填 `0` 表示跟随环境变量，填了值就以后台为准。完整变量、支付宝接入与排障见 [apps/store/README.md](apps/store/README.md)。

## Docker

双容器分别跑主应用（**18081**）与授权商店 / 授权服务器（**18082**）。GitHub Actions 手动触发构建两个 GHCR 镜像：`ghcr.io/sfairy/homeos-3d`（Dockerfile target `app`）与 `ghcr.io/sfairy/homeos-3d-store`（target `store`）；从 `main` 手动运行打 `latest` 与 `VERSION` 标签，从 `v*` tag 手动运行打 semver。

最终运行镜像**不包含可读业务源码**：构建阶段用 **Cython** 把 `apps/server/`、`apps/store/`、`ops/docker/` 与 `ops/container_entrypoint.py` 下的全部 `.py`（含各包 `__init__.py`）编译成原生扩展 `.so` 后删除 `.py`，业务 JS 用 `javascript-obfuscator` 混淆（跳过 `vendor/` 与 `*.min.js`）。唯一保留源码的是 `db/migrations/`（Alembic 按文件路径读取执行，只有建表 DDL，不含业务逻辑）。编译期约束：入口脚本已编译成扩展模块，容器用 `python -c "import ... as m; m.main()"` 拉起；Cython 版本在 `Dockerfile` 钉死（`ARG CYTHON_VERSION=3.1.6`，3.3.0 有回归会导致构建失败，升级前请两个 target 各构建一次验证）；原生扩展按平台编译，`amd64` / `arm64` 各跑原生 runner 后由 `merge` job 合并 manifest list（见 `.github/workflows/docker.yml`）。

### 快速启动

两个项目可**独立部署**，各一条命令（脚本见 [ops/deploy/deploy.sh](ops/deploy/deploy.sh)）：

```bash
git clone https://github.com/sfairy/HomeOS-3D.git && cd HomeOS-3D

./ops/deploy/deploy.sh --role app --license-server https://pay.example.com   # 客户机：只部署主应用
./ops/deploy/deploy.sh --role store                                          # 厂商机：只部署授权商店
./ops/deploy/deploy.sh                                                       # 同机：先起商店，再起主应用
```

脚本依次做：解析 tag（`--version` → `HOMEOS_VERSION` → 仓库 `VERSION` 文件 → `latest`）→ 缺失时
从 `.env.example` 生成 `.env` → `--role app` 时把两个授权公钥落到 `./keys` 并校验指纹 → 备好宿主标识
符号链接 → 按角色 `docker compose pull` + `up -d` → 等健康检查 → 打印访问地址与引导密钥取法。

常用开关：`--version 0.6.5` 钉版本、`--dry-run` 只打印将要执行的命令、`--host-binds skip` 跳过宿主标识、
`--dir DIR` 指定 compose 目录。**`--role app` 必须给 `--license-server`**：留空会退回
`http://127.0.0.1:18082`（容器里没人监听），表现为授权一直连不上。

默认拉取 GHCR 预构建镜像，不需要本地构建；要自己出包见 [Dockerfile](Dockerfile) 的 `--target app` / `--target store`。
tag 规则：默认分支手动跑打 `latest` 与本仓 `VERSION`；`v*` tag 手动跑打 semver；amd64 / arm64 已合并成同一个 tag。

容器启动后：**先 `docker logs homeos-3d` 取首次设置的引导密钥**（容器内 `/data/setup-token`），再访问 `http://<主机>:18081/setup` 填入。仅桥接网络下，从宿主机访问也会被当成远程来源（对端是 `172.17.0.1` 这类网关地址），因此这一步不能省。商店首次部署同样在 `http://<主机>:18082/setup` 创建管理员。

启动顺序与密钥：① `homeos-3d-store` 生成或复用授权私钥（`/data/license-keys`）并同步公钥到共享卷；② `homeos-3d` 等待 `/data/keys` 里两个 PEM 就绪后再启动 uvicorn（超时 120s 会直接退出并说明原因）；③ `ops/container_entrypoint.py` root 校正目录属主后降权为 `homeos` 用户。独立部署（`--role app`）时没有商店：公钥由脚本落到宿主 `./keys` 并只读挂进 `/data/keys`。

容器内默认路径：

| 用途 | 服务 | 路径 |
| --- | --- | --- |
| 主应用数据 | `homeos-3d` | `/data` |
| 商店数据 | `homeos-3d-store` | `/data` |
| 授权私钥 | `homeos-3d-store` | `/data/license-keys`（独立卷） |
| 授权公钥 | 主应用 | `/data/keys`（同机＝商店写入的共享卷；独立部署＝宿主 `./keys` 只读挂载） |
| 首次设置引导密钥 | `homeos-3d` | `/data/setup-token`（初始化成功后自动删除） |
| HA / 中控 / 授权凭据密钥 | `homeos-3d` | `/run/secrets/*.key` |

健康检查：主应用 `/health/ready`，商店 `/healthz`。反向代理请转发 WebSocket（`/api/v1/ws/runtime`）以及 `/api/hls/`、`/api/camera_proxy/` 等媒体路径；站点走 HTTPS 时设置 `APP_COOKIE_SECURE=true` / `STORE_COOKIE_SECURE=true`，并配置 `APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES`。

主应用还会读**宿主**的机器标识来做授权实例指纹，`docker-compose.app.yml` 挂了 `/host/etc/machine-id` 与 `/host/sys/class/dmi/id` 两个只读入口。`deploy.sh` 会自动建这两个符号链接（`--host-binds auto|force|skip`）；手工部署时准备一次：

```bash
sudo mkdir -p /host/etc /host/sys/class/dmi
sudo ln -sfn /etc/machine-id /host/etc/machine-id
sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
```

**顺序要紧**：宿主路径不存在时 docker 会把它建成**目录**，之后再建符号链接就会失败 —— 所以先准备、再 `up`。不准备也能启动，指纹退到 `data/` 下的兜底 ID。

升级时不要清空数据卷（`homeos-3d-data` / `homeos-3d-store-data` / `homeos-3d-license-keys` / `homeos-3d-client-keys`）。注意前四个带 compose 项目名前缀：主应用的仍是 `homeos-3d_*`，商店的变成 `homeos-3d-store_*`；只有共享公钥卷用了固定名 `homeos-3d-client-keys`。

**两台服务器分开部署**：两侧各跑一次脚本 —— `--role store`（厂商机）、`--role app --license-server https://pay.example.com`（客户机）。主应用侧**不再需要**共享网络与共享卷：`docker-compose.app.yml` 自带 `./keys` 公钥挂载，脚本按 tag 从仓库 `keys/` 取两个 PEM（与 `apps/server/config.py` 钉死的指纹一致）；要手工搬时把它们放进 `./keys` 并 `chmod 644`。同机部署用 `--role all`，脚本会叠加 `docker-compose.app.shared.yml` 让主应用加入商店的网络与公钥卷。授权实例指纹派生自宿主硬件，换机器会被判成「换设备」，想平滑迁移要用 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` 钉住身份。完整清单与反代示例见 [ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md) 与 [ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md)。

原先那份单文件 `docker-compose.yml` **已删除**：它的商店数据卷与授权私钥卷名与这里不同（`homeos-3d_homeos-3d-*` vs `homeos-3d-store_homeos-3d-*`），混用会以空库启动、让已激活客户端全部失效。若曾用它跑过，先 `docker compose -f docker-compose.yml down` 再按上面的命令迁移。

## 开发注意

- 静态资源缓存标记统一为 `?v=YYMMDDHHMM`（10 位本地时间，年份取后两位、不带秒，例如 `?v=2609201045`），改 JS / CSS / HTML 后按「开发工具」一节的换戳命令全站同戳更新。同一次改动的资源务必用同一个时间戳；`home.js` 与 `renderer/core/renderer.js` 必须使用同一条 `renderer/core/registry.js?v=`，否则会出现两份控件注册表。**后端渲染页面时拼出来的**静态链接（舞台页 `stage.css`、模拟收银台与支付宝回跳页样式等）改用文件 mtime 现算版本号，见 `apps/server/core/static_revision.py` 与 `apps/store/core/static_revision.py`。
- mdi 图标版本只在前端 `frontend/static/utils/icon-url.js` 的 `MDI_VERSION` 里写一次（图标地址一律经 `mdiIconUrl` / `applyMdiMask` 取用），后端 `api/icons.py` 从 `static/vendor/mdi/` 目录扫出版本。升级图标库 = 放新版本目录 + 改 `MDI_VERSION` + 同步 `3d-studio/studio/studio.css` 里那三条遮罩地址。
- 前端 JS / CSS / HTML 约定 `printWidth=100`（HTML 为 120）；`frontend/static/vendor/` 不参与格式化，也不要改其中的 three.js、hls.js、OrbitControls 等第三方文件。界面中文文案保持原词。
- 静态资源按功能域分区：`app.css` 留在挂载根，其余分入 `bridge/`、`editor/`、`renderer/`、`display/`、`auth/`、`shared/`、`logging/`、`assets/`，以及原有的 `utils/`、`templates/`、`component-thumbnails/`、`audio/`、`vendor/`；`3d-studio/` 内部再按 `studio/`、`plan/`、`reflection/`、`materials/`、`loaders/`、`export/` 分组（`models/` 是模型素材，不是代码目录）。移动文件后请人工核对引用与后端路径清单（没有打包器，路径写错只在浏览器里变成 404）。
- `db/migrations/env.py` 必须从 `apps.server.core` 导入 `database` 和 `models`（`from apps.server.core.database import Base`），不要写成相对导入，否则会重复注册表。
- **Cython 必须钉死 `3.1.6`**：`3.3.0` 的 `AnalyseExpressionsTransform` 在本项目的 `apps/server/observability/global_log.py` 上会崩（`(value or {}).items()` 触发类型推断回归），`3.1.x` / `3.2.x` 正常。升级 Dockerfile 的 `CYTHON_VERSION` 前先用两个 target 各跑一次构建验证。
- **compose 部署顺序**：先起商店（`docker-compose.store.yml`，它创建共享网络与公钥卷），再起主应用（`docker-compose.app.yml`）。
- 3D 交互舞台脚本由 `/api/v1/modules/interaction3d/{filename:path}` 下发（路径含功能域子目录，如 `core/runtime.js`），需要已登录或已配对，且当前授权允许编辑器或 `module.3d_interaction`。
- 商店的样式只有一层设计系统：`theme.css`（令牌 + 组件）必须排在任何页面样式表之前。它与 `frontend/static/app.css` 共享同一份 canonical 调色板 `design/scene/page.css`，商店侧由 `--hb-*` 镜像令牌（53 对，逐 token 相等，由 `tools/check_invariants.mjs` 的「商店 theme.css 的 `--hb-*` 与 `design/scene/page.css` 的 `--hos-*` 逐 token 相等」一条守着）与派生的 `-soft` / `-line` / `-text` 组成自己的语义层。详见 [apps/store/README.md](apps/store/README.md) 的「界面主题」。
- 改动商店授权端点吊销响应时，须保留结构化 `code` / `revoked` 字段（客户端只认这些，不再匹配 detail 文案）。
- Docker 联调改业务代码后需要重新 `docker compose … --build`；镜像内是混淆 / 去源码产物，不能挂载源码热重载。
- **首屏权重基线（2026-09 实测）**：从 `frontend/index.html` 做引用闭包，冷启动需要 **154 个 `/static` 资源、原始合计 3.95 MB**；其中最大的两块是 `static/editor/home.js` 951 KB（gzip 195 KB）与 `renderer/core/renderer.css` 430 KB（gzip 102 KB）。这两块的拆分**已登记在文件规模台账里但本轮未实施**：拆的时候要顺带量一次首屏资源数与可交互时间。
- **前端的两棵树不是重复机制，不要合并**：`frontend/static/**` 是公开/资产类资源（`StaticFiles` 挂载 + 匿名白名单，能力码 `assets`）；`frontend/modules/runtime/**` 是**按增量包能力码下发的模块包**（`editor` 或 `module.3d_interaction`，后者可单独售卖），走 `manifest.json` 清单下发，清单同时是可下发集合与安全边界。另外 runtime 树有 8 个文件、36 处写了对 `file:` 的分流（舞台页可被直接打开），相对回退路径按"两棵树是 `frontend/` 下的兄弟目录"算 —— 合进 `/static` 会同时动到授权模型、安全边界与这条契约。
- **两个项目互相独立，绝不要 import 对方，也不要把同名实现合并成共享模块**：`apps/server/`（主应用，18081）与 `apps/store/`（授权商店 + 授权服务器，18082）是**两个独立项目，可能部署在不同服务器上**。任何一个方向上的 import 都会立刻导致三件事：单独发商店会 ImportError、两侧版本被绑死、无关业务代码被带进授权服务器镜像。因此 `core/static_revision.py`、`core/appearance.py`、`security/body_guard.py` / `compression.py` / `access_log.py` 这些**同名双份是刻意的隔离成本**，不是可以顺手合并的重复代码。要防两边漂移用**清单 + 静态守卫**，而不是运行时共享：`design/scene` 的三份分发副本由 `tools/check_invariants.mjs` 的「design/scene 的五份文件在三处副本里逐字节一致」一条守着；上面这些同名双份里**真的会走散**的名字登记在 `packages/contracts/surfaces.json`，由 `tools/check_invariants.mjs` 的最后一条按「剥掉注释与 docstring 后逐字相同」比较 —— 两侧各写各的模块说明不受影响（哪些该登记、哪些是有意差异，判据见 `packages/contracts/README.md`）。`tools/check_invariants.mjs` 的「两个可独立部署的项目互相 import」一条把「不许 import 对方」这条规则钉死。
- **访问日志里已知两类第三方噪音，都不必当成缺陷去查**：① `GET /sm/<sha256>.map` 的 404 —— 浏览器侧第三方脚本按内容哈希取 source map，本项目没有 `/sm/` 路由，这类访问行已由 `AccessLogNoiseFilter` 挡在访问日志外（见 `apps/server/http/access_log.py` 与 `apps/store/security/access_log.py`），首次命中会在 `uvicorn.error` 留一条说明。② 第三方扩展挂钩 XHR 后对 HLS 分片打的 `console.error`，由 `client-log.js` 按前缀丢弃。

## 注释规范

全仓只保留**功能注释**。解释性注释（为什么、历史、踩坑、取舍、代价）一律不留 —— 这类叙述随代码演进最先失真，而失真之后没有人会发现。

**保留**

1. **工具指令**：`# noqa: …`、`# type: ignore`、`# pylint:`、`eslint-disable*`、`@ts-check` / `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`、`# syntax=` / `# escape=`、shebang、`@license` / `@preserve` / `sourceMappingURL`、`istanbul ignore`、`prettier-ignore`、`stylelint-disable*`、Alembic 的 `# revision identifiers` 与 `# ### commands auto generated`、`@generated`。指令行只保留指令本身，尾随说明删掉（`# noqa: BLE001 - 巡检是附加工作` → `# noqa: BLE001`）。
2. **类型标签**：JSDoc 的 `@param` / `@returns` / `@type` / `@typedef` / `@template` / `@property` / `@this` / `@extends` / `@implements` / `@satisfies` / `@callback` / `@enum` / `@overload` / `@deprecated` / `@see` / `@example` / `@since` / `@default` / `@readonly` / `@private` / `@public` / `@protected` / `@abstract` / `@namespace` / `@module`。含标签的块保留「首行摘要 + 全部标签行」。
3. **待办标记**：`TODO` / `FIXME` / `NOTE` / `WARN` / `HACK`。
4. **分节标题**：分隔符占该行非空字符半数以上的横幅整行保留（`# ─── 主应用构建 ───`、`/* ===== 配色 ===== */`、`// ---------- 1) 三份分发副本 ----------`）。
5. **docstring / JSDoc 首行摘要**：紧跟声明的文档块，首行非叙事且不超过 60 字符时只保留这一行（Python docstring 同规则；裁完函数体为空则补 `pass`）。
6. **单行功能注释**：孤立单行注释不超过 60 字符且不含叙事标记时保留 —— 这是「一行式契约说明」的判据，用于单位、上限、状态码语义与边界。

**删除**：其余全部 —— 多行叙事块、命中叙事标记的行、超过 60 字符的说明行、docstring 正文段、历史与踩坑叙述、取舍与代价论证。

叙事标记（判定口径、可审阅可修改）：`为什么｜原因｜因为｜所以｜否则｜避免｜曾经｜以前｜原本｜当初｜那时｜后来｜上一轮｜本轮｜踩｜坑｜教训｜历史｜有意｜刻意｜取舍｜代价｜回退｜原先是｜过去｜当年｜why｜because｜histor`

**不参与本规范**：`frontend/static/vendor/**`、`tools/vendor/**`、`node_modules/**`、`*.min.js`、`data/**`、`keys/**`、`design/scene/fonts/**`、`.env.example`（模板注释即配置文档）、`*.md`（文档正文本身就是解释）。

**没有自动门禁**：本仓只保留静态可判定的守卫，注释风格靠人工 review。写代码时按上面六条来，不要重新引入「为什么」段落。

## 开发工具

改 JS / CSS / HTML 后统一换静态资源缓存戳：

```bash
# 把全站现有的 ?v= 统一换成同一个新戳（YYMMDDHHMM，本地时间）
NEW=$(date +%y%m%d%H%M)
grep -rlE '\?v=[0-9]{10}' frontend apps/store/static design | while read -r f; do
  sed -E "s/\?v=[0-9]{10}/?v=$NEW/g" "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
node tools/check_invariants.mjs   # 守卫会拦「两个戳」与「带戳 / 不带戳混用」
```

> **踩过的坑**：戳没变时浏览器直接复用本地缓存，磁盘上的新内容根本不加载 —— 页面「照常打开」，改的规则静默不生效。命令只**替换已有的戳**：新**增**的引用（新文件、新模块）要手工补 `?v=`，漏写的会被守卫的「带戳 / 不带戳混用」一条拦下。新增 / 改名令牌这类改动必须在真实页面复查（换戳后用 `getComputedStyle(document.documentElement).getPropertyValue("--新令牌")`，得到空字符串就是没生效）。

改动前 / 提交前跑一遍不变量护栏（**唯一一道自动守卫**）与静态检查：

```bash
node tools/check_invariants.mjs
ruff check .                       # 未使用 import / 重复定义 / 未使用局部变量 / 未定义名字 / 注释掉的代码
```

`ruff.toml` 只挑上面这几条（F401 / F811 / F841 / F821 / ERA001），因为全仓当前已达标 —— 纳入 CI 即把「已经做到的事」钉成回归护栏。**不要顺手加 RET / UP / SIM / ARG / C4 / PIE 之类的美化规则**：全仓还有 180+ 处未达标，加了会当场拦死出包。复现规模（不要加进 CI）：`ruff check . --select F,ERA,B,SIM,C4,UP,PIE,RET,ARG`。

### 性能收益实测（可复现）

/api/v1/ha/translations 是全站慢请求的绝对大头，改动（内存 + 磁盘 + 同键并发去重）之后
该实例**没有该接口的新流量**：真实流量只能给出改前基线，改后收益由 `ops/bench_translations.py`
用真实缓存实现 + 注入固定回源延迟跑确定性基准，回源次数与落盘都被断言钉住（不是打印数字给人看）：

```bash
.venv-store/bin/python ops/bench_translations.py
.venv-store/bin/python ops/bench_translations.py --logs data/logs/global-events.jsonl   # 只提取真实基线
```

| 口径 | 结果 |
| --- | --- |
| 真实基线（`data/logs`，UTC 2026-09-20 → 09-26） | 慢请求 1714 条，本接口 **1691 条（98.7%）**；中位 2896 ms / p90 3616 ms / 最大 23158 ms |
| 真实基线：5 秒内 ≥2 次的批次 | **570** 个（最大一批 9 次）—— 多个客户端同时冷启动时各自回源一遍 |
| 改后（本地基准，8 并发同键，注入 50 ms 回源） | 上游回源 **1 次** / 墙钟 52 ms |
| 改前（反事实，同参数） | 上游 **8 次**往返 / 顺序回源墙钟 409 ms（**8× 上游负载**） |
| 磁盘缓存（新实例 = 进程重启） | 命中，**0 次**回源；落盘 128 字节 |
| `clear()`（HA 连接重建） | 内存清空 + 磁盘删除 + 在途回源不写回（代次生效） |

**未闭环项**：改后的**真实流量**对比仍缺样本（该实例在改动后没有请求过这个接口）；
上表「改后」一栏全部来自本地注入延迟的基准，不能当成真实流量结论。

`check_invariants.mjs` 钉住一组「不报错、只静默失效」的不变量，每条都对应一次真实踩坑；引用时一律用条目名而不是序号。归纳如下：

- **前端模块与资源**：运行侧裸 `/static/` 静态 import（只能经 `core/static-helpers.js` / `static-helpers-editor.js` 桥，或带 `import.meta.url.startsWith("file:")` 分流的动态 import）；入口页取不存在的 id（`selectElement` / `getElementById` 目标必须在同名 HTML 里存在，动态创建的登记进 `DYNAMIC_IDS`）；缓存戳出现第二个值、或同一模块被「带戳 / 不带戳」两种写法引用（模块表按解析后的 URL 为键，会被当成两份实例，各留一份模块级状态）；import 说明符解析不到真实文件、或 runtime 资源没登记进 `get_resource()` 白名单；`<script src>` / `<link href>` / CSS `url()` / `@import` 指向不存在的资源（按 URL 而非磁盘判定）；`import` 的名字不在目标模块的导出里（含默认导入、命名空间成员、动态解构与 `export { … } from` 转出口）。
- **后端结构**：`apps/server/**` 跨二级包的新环（只登记了一条例外 `api | modules`）；mdi 图标版本出现第二个值；`theme-color` / webmanifest 写死色值必须等于色板「页面最底层」那一档。
- **清单一致性**（同一份清单被抄在多处，漏改一处就静默少效果）：模型注册表与 `models/` 目录两端对齐（文件键不许是纯数字戳、注册项类型必须在 `EXTERNAL_MODEL_ITEM_TYPES` / `APPLIANCE_MODEL_ITEM_TYPES` 里）；「环境模型类型」七处清单一致；净化器模型类型三处同源（`sceneModelTypes()` / `collectClimateBindings()` / `PURIFIER_MODEL_TYPES`）；吊柜挂高三处（`model-specs.mjs` / `storage-cabinets.js` / `ITEM_TYPE_DEFINITIONS`）；授权状态文案三处（后端 `labels` / `license-recovery.js` / 编辑器顶栏）；扫地机状态字典含上游全部别名；窗帘面板返回键集合含 `deactivate`；聚焦可用设备清单 `isFocusableDevice` 与上游同集合；前端可派发的 HA 服务都登记进后端 `ALLOWED_SERVICES`；两个项目里**同名双份**的共享面（压缩口径与响应头常量、日志噪音表、`file_revision`、配色令牌白名单、权益码集合）与清单 `packages/contracts/surfaces.json` 一致。
- **配色类**：JS 写入的自定义属性没人读；`var(--x)d1` 这类令牌后粘十六进制残渣（整个声明无效）；`var()` 兜底值与令牌 canonical 值不一致；八族可配置光的 `-soft` / `-line` α 与 `appearance.js` 契约（0.13 / 0.32）不符；SVG 注释含连续两个连字符（整个文件解析失败、画面空白）；材质风格档位漏角色、或 `auto` 档位角色没有出口（那一块网格退回基础色）。
- **3D 图纸与模型**：圆形占地的物件在户型图上被画成方角矩形（实测轮廓为圆必须进 `ROUND_FOOTPRINT_ITEM_TYPES`，且名单真的接上外轮廓那一支）；流水线 GLB 的内容与规格 / `scaleBasis` 不自洽；流水线 GLB 之间存在会闪的共面重叠（z-fighting）；既有资产尺寸债务（只探测、不设护栏）；物件构建体用了 context 里没解构的键；素材库页签与类型词表两端错位。
- **自由变量**：引用了本文件解析不出绑定的名字（`tools/lib/free-variables.mjs` 用 acorn 建真语法树 + 作用域链，只治执行到那一行才 `ReferenceError` 的引用）。

两份工作流共用同一份清单：`.github/workflows/guards.yml`（push / PR 触发，日常改动即校验）与 `.github/workflows/docker.yml` 的 `guards` job（挂在镜像 `build` 之前，该工作流仅手动触发）。改清单时**两份都要改**，否则会出现「CI 绿、出包红」的错配。

结构改动只有一部分有自动校验（ESM 说明符、HTML `<script src>` / `<link href>`、CSS `url()` 与 interaction3d 资源白名单已由上面两条覆盖，**不覆盖**页面路由 URL）。以下必须人工过一遍：`apps/server/main.py` 的 `public_static_files`、`<img src>` / `srcset` 与 HTML 内联 `<style>`、后端 `frontend_dir / …` 拼接链、注释里写到的文件路径、`apps/server/config.py` 的仓库根推导、`Dockerfile` 里的仓库相对路径。前端结构 / 卫生类护栏（死类名与重复规则、控件注册表分片可达、`design/scene` 分发副本一致、两侧 HTML 转义集逐字节相同、入口页门链与状态名对齐、场景小屋缩放等）已全部移除，同样落回人工 review。

**没有 e2e / 冒烟 / 探针**：护栏只覆盖静态可判定的事（引用能否解析、清单与树是否一致、某个策略是否只有一个主人），行为正确性依旧要靠人工走关键路径。后端与商店没有自动冒烟，增删路由没有任何自动信号，改动路由请人工核对 OpenAPI 与调用方。

### 资源下发清单是唯一事实来源

3D 交互运行时资源（`frontend/modules/runtime/**`）的"可下发集合"只有一处事实来源：
`frontend/modules/runtime/manifest.json`。后端 `modules/interaction3d/runtime_manifest.py` 读它，
`tools/check_invariants.mjs` 也读它做双向核对。

**新增一个运行时模块只改这一处**（清单里加一行），媒体类型按扩展名推导。清单同时是安全边界：
这条路由按增量包能力码门禁（`editor` 或 `module.3d_interaction`），"文件放进磁盘"不等于"可以被下发" ——
所以清单是**显式 allowlist**，不是"扫磁盘全下发"。漏登记的旧表现是浏览器里那个模块 404、整条 import 链断掉。

### 接手指南：`apps/store/api/admin.py` 的最后两组

`admin.py` 已从 4479 行拆到 1774 行（router + 10 个子路由，72 条路由逐项一致含顺序），**还剩两组没抽**：

| 组 | 段数 | 规模 | 阻塞项（只读检查已给出） |
|---|---|---|---|
| `orders`（order-status-meta / orders / refunds） | 1 段 | 695 行 | `_FULFILLABLE_STATUS_TEXT` |
| `products` | 2 段 | 381 行 | `_FULFILLABLE_STATUS_TEXT`、`_admin_product_context`、`_product_admin_payload`、`_product_delete_refs`、`_safe_image_target` |

抽之前先把那 5 个助手移进 `apps/store/api/admin_shared.py`，并注意三点：

1. `ORDER_FULFILLABLE_STATUSES` 是**带别名的导入**（`commerce/order_status.py` 导出的名字是 `FULFILLABLE_STATUSES`），写成不带别名的形式会一直 F821；
2. `_FULFILLABLE_STATUS_TEXT` 是**模块级即时求值**的常量，导入必须插在它**之前**，追加到文件末尾会 `NameError`；
3. 插入位置取「第一段导入区最后一个顶层 `Import` / `ImportFrom` 节点的 `end_lineno`」—— 按「最后一个以 import/from 开头的行」插入会落进多行括号导入内部，或落在 `_FULFILLABLE_STATUS_TEXT` 之后。

多段组会生成 `router` + `router_extra` 两个子路由、各自在原位置 include，以此保持注册顺序；每抽一组都按下面四条验证：

```bash
/usr/local/bin/node tools/check_invariants.mjs
.venv-store/bin/python -m ruff check .                                         # 必须 0 错误，尤其 F821
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18081/health/ready   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18082/healthz        # 200
```

拆完后 `admin.py` 应移出 `tools/file-size-baseline.json` 台账（或继续降行数），守卫会提醒。

**两条硬约束**：① `apps/server/` 与 `apps/store/` 是两个独立项目、可能分机部署，绝不互相 import，也不要把同名实现合并成共享模块 —— 守卫会拦；② `ruff --fix` 会把「只供再导出」的名字当未使用静默删掉，跨模块再导出要用 `__all__` 固定公开面。

原拆分过程中用到的抽取器与路由基线脚本放在 `/tmp` 下、**不随仓库保存**，重新接手时按上表重建；路由等价性用 `apps/store/app.py` 的实际 `include_router` 展开逐项对账。`node` 不在 PATH 上，用绝对值 `/usr/local/bin/node`；Python 用 `.venv-store/bin/python`。

### 其它未完成项

| # | 项 | 说明 |
|---|---|---|
| 1 | **同名双份防漂移** | `core/static_revision.py`、`core/appearance.py`、`security/body_guard.py` / `compression.py` / `access_log.py`、能力码 `BASE_FEATURES` ↔ `FEATURE_CATALOG` 各两份。做法只能是构建期生成 + 逐字节校验（样板：`design/scene` 的三份分发副本），不许共享运行时实现 |
| 2 | **首屏按需加载** | `renderer.js` 静态 import 了全部 13 个 `device-controls/*.js`；改完必须在浏览器里验（能开页面、控制台无 404、面板正常）—— 只跑守卫不足以下结论 |
| 3 | **超标文件** | 台账 `tools/file-size-baseline.json` 里仍有登记项，棘轮守卫保证只减不增 |
| 4 | **翻译接口真实流量对比** | 见上「性能收益实测」的未闭环项 |

### 本轮新增的三条守卫

- **表达式被静默改写的语法陷阱**：行首残留的「数字 + |」会把紧跟其后的模板串位或成数字。
  本仓真踩过一次 —— `client-log.js` 里的 `370|` 让**所有慢请求/失败请求的日志消息恒为 `370`**，
  而它语法合法，acorn、浏览器、ruff 与其余守卫全都不报错。
- **文件规模预算（棘轮）**：Python 单文件 800 行、JS/MJS 1200 行。超标的既有文件登记在
  `tools/file-size-baseline.json`，**行数只许减不许增**；拆到限额以内要把那条删掉（守卫会提醒）。
  要拆就按仓库里已有的缝走：`item-builders/`、`plan/`、`loaders/`、`editor/home/*`、
  `panel-renderer/device-controls/*`；外提之后必须换一次全站 `?v=` 戳（同模块两枚戳 = 两份实例）。
- **运行时清单 ↔ 磁盘双向核对**（见上）。

## 更新日志

更早的版本记录已随文档精简移除；项目按**首个发布版本**维护，不再保留历史版本的数据迁移说明。

### v0.6.5

对齐上游 0.6.5 的业务能力：**交互对象从 8 类扩到 16 类**（新增冰箱 / 洗碗机 / 洗衣机 / 烘干机 / 绿植 / 空气净化器 / 门锁含门磁 / 温湿度计），动画体系补上卷帘与全类型门。落地方式遵循本仓既有目录约定，不是路径级照搬。

- **新增品类**：通用设备弹窗（`device.py` + `device-profiles.js` 等，六类设备不推断主实体，绑定必须写 `deviceId`）；空气净化器（`purifier.py`，**新风机按需求算作净化器的一种**，运行时与空调同属 climate 模块，靠实体域 `fan` 决定渲染）；门锁与门磁（`lock.py`，门扇按平开 / 推拉 / 卷帘 / 入户门分支，事件源支持 `sensor` / `single-event` / `dual-event`）；温湿度计卡片；窗帘组合控制；卷帘（`coverKind` 支持 `standard / roller / dream`）；「1 字型悬空楼梯」模型。
- **光影**：保留 `standard`（标准光影，原生灯光 + 实时阴影）与 `region`（轻量柔光）两档，**默认 standard**；灯效量程固定 1~100%（上游允许 150%，本仓为不过曝有意收回）。
- **3D 缓存与清理**：新增 IndexedDB 模型 / 场景持久缓存（`model-persistent-cache.js` / `scene-persistent-cache.js`，版本 + `syncKey` + TTL 三重校验，7 天），避免首次进入编辑器后户型偶发重新生成；删除模型后的级联清理（`studio_cleanup.py`，**只清理 3D 交互绑定、不删除任何 HA 实体**），凭 `confirmation_token` 才同步清理并可撤销。
- **修复**：折线图状态重试定时器、未绑定实体灯光误亮、2D 热水器弹窗空数据、未配置实体无法保存 3D 控件、实时连接恢复后状态补齐。另对上游做全量复核（文件级差分 + 中文串差分 + 分域业务逻辑审读），修掉门锁 / 门磁、3D 持久缓存、服务白名单（补齐 `lock.*` 与 `input_*`）、状态订阅、门牌配色、环境页面归一、运行期面板行为等多处「不报错、只静默失效」的缺陷，并新增不变量第 25 / 27 / 30–34 条。
- **有意与上游不同**：运行期 / 编辑器前端按本仓既有目录约定落位（`frontend/modules/runtime/<域>/` 与 `frontend/static/bridge/`）；未移植反射几何 LOD 与运行时家具合批两个性能模块（本仓由可配置分辨率反射 + 静态批处理覆盖）；环境模型类型清单以本仓素材库为准；净化器模型有效性校验为本仓加严；新建 3D 控件默认透明；只保留 `/display/{项目名}` 一个展示入口。

### v0.6.3

以质量清理为主体：零引用代码清零（具名导出 168 处、死函数 3 处）、删除调试与测试残留、重复实现逐族收敛（`clamp` / `hexToRgb` / 数值换算 / HTML 转义 / 指针捕获等）、`window.__haBridge*` 全局改为 ESM 显式导入导出。修复 3D 运行时 `climate.turn_on` 三层契约不一致、释放路径与 `didReplaceScene` 时序；安全上补未鉴权入口请求体上限、商店本机直连补 `Host` 校验、匿名静态白名单闭环。回归网一度恢复后整体移除（见「开发工具」）。

### v0.6.2

授权恢复与重试：新增 `POST /api/v1/license/retry` 与匿名可读的 `GET /api/v1/license/availability`，受限时 `/pair` 与 `/display/*` 渲染恢复页而不是 403；失败分级（等一会儿再来 / 再点也没用 / 被节流）；租约凭证写入加跨进程文件锁。修复户型导图底图分辨率换算、导图浮层出口、展示端 403 自愈。

### v0.6.1

P1–P12 全量深度审计：商店 `S1–S58`、主应用后端 `B1–B66`、前端 `W1–W30` 与代码质量专项，逐批修复并带「把修好的东西弄坏一次确认断言变红」验证。新增迁移 `0002`（项目名唯一）/ `0003`（展示地址别名）；`apps/server/` 与 `apps/store/` 按主题分包，`frontend/modules/runtime` 按功能域细分；不再内置任何自动化测试 / 探针。

### v0.5.6

自托管 Docker：双容器 Compose + 多目标 Dockerfile（Cython 编译 Python、`javascript-obfuscator` 混淆 JS，运行镜像不含源码）；GHCR 镜像；`ops/deploy/PRODUCTION.md` 与 Caddy / nginx 示例；`.env.example` 收敛为 A/B/C/D 分区。**破坏性变更**：授权传输协议与产品标识改名（`homeos-license-transport-v1` / `homeos`），两者参与 HKDF / AES-GCM AAD，必须先升级客户端、再升级服务端。
