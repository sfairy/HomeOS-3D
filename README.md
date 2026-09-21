# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控平台，当前版本 **0.6.3**（见 `VERSION`）。

提供可视化编辑器、3D 户型工作室、全屏展示页和中控配对；后端是 FastAPI，前端是原生 HTML / CSS / JavaScript，数据默认落在本机 SQLite。

本仓库是可本地运行的源码树，也可用 Docker Compose 双容器自托管（主应用 + 授权商店）。**授权校验始终开启**，激活走仓库自带的自建授权商店与授权服务器（`store/`），不连接任何外部厂商节点。

## 功能

- 仪表盘编辑：页面、控件、实体绑定、弹窗、主题（内置 `homeos-dark`）
- 正式展示：`/display/{项目名称}` 打开全屏中控页
- 中控配对：6 位配对码，适合墙面平板或独立浏览器
- 3D 户型：建模、导入、按楼层或全楼自动导图并回写到仪表盘；灯光按「区域」归类，墙体与灯光属性可批量应用
- 3D 交互：仪表盘控件嵌入户型舞台；从工作室草稿快照场景，在舞台里开关已绑定的灯、开关、窗帘、空调、电视等；展示页用 iframe 打开同一舞台
- Home Assistant：HTTP / WebSocket 同步实体与状态，代理摄像头和媒体
- 全局日志：按级别、分类和关键词筛选，导出时遮盖敏感信息
- 授权商店：账号注册 / 登录、邮箱验证码、商品与优惠码、邀请返利与提现、订单查询、设备自助解绑
- 授权服务器：Ed25519 签名租约 + X25519 加密传输，心跳续租与启动联网确认
- 运营后台：`/admin` 管理商品、订单、授权、绑定、优惠码、提现、站点配置、版本与审计日志

## 组件

仓库根目录下同时运行两个服务。本地开发共用 `.venv-store`；生产可用 Docker Compose 各跑一个容器：

```text
HomeOS/
├── backend + frontend       主应用                http://127.0.0.1:18081
└── store/                   授权商店与授权服务器   http://127.0.0.1:18082
```

自托管镜像见下方 [Docker](#docker)；一步检查清单见 [deploy/PRODUCTION.md](deploy/PRODUCTION.md)。

### 主应用

`backend/`（FastAPI）+ `frontend/`（HTML / 原生 JS）。负责仪表盘编辑、展示、中控配对、Home Assistant 连接、3D 户型工作室与 3D 交互舞台。启动时自动执行 Alembic 迁移。

### 授权商店与授权服务器（`store/`）

一个独立的 FastAPI 应用，在 **18082** 端口同时提供三件事：

1. **授权商店**：账号、商品、订单、优惠码、邀请、账号中心等页面与 `/store/v1/*` API，自研暗色 + 琥珀主题。
2. **授权服务器**：`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，签发 Ed25519 租约并使用 X25519 加密传输。
3. **运营后台**：`/admin` + `/store-admin/v1/*`。

商店与授权服务器共用同一个 SQLite 库 —— 这正是「支付后自动发码并可立即激活」的原因。支付渠道**默认不配置**（未配置渠道时商店拒绝建单，属刻意的 fail-closed；模拟收银台需 `STORE_PAYMENT_PROVIDER=mock` 加 `STORE_ALLOW_MOCK_PAYMENTS=1` 同时显式打开），正式收款请切换为支付宝当面付。完整说明见 [store/README.md](store/README.md)。

## 仓库结构

工程在仓库根目录，不再套一层 `app/`：后端是 `backend/`，商店是 `store/`，两者平级。

```text
HomeOS/
├── backend/                # FastAPI 应用（PYTHONPATH 指向仓库根，启动为 backend.main:app）
│   ├── core/               # 数据库 / ORM 模型 / 请求响应模型 / 迁移与装配依赖
│   ├── security/           # 身份会话、登录与配对限流、来源与同源校验、初始化守卫
│   ├── http/               # 请求体上限、缓存响应头、流式落盘
│   ├── observability/      # 全局事件日志与版本更新检查
│   ├── api/                # 认证、项目、HA、资源、3D、日志、图标、中控、更新
│   ├── ha/                 # HA 客户端、同步、状态推送
│   ├── panel/              # 仪表盘文档与校验（含全局弹窗定义）
│   ├── modules/            # 增量能力（3D 交互）
│   ├── license/            # 客户端授权：租约验签、心跳、能力门禁
│   ├── config.py           # 运行期配置（仓库根路径解析、授权默认值）
│   └── main.py             # 应用装配（uvicorn backend.main:app）
├── frontend/               # 页面与静态资源
│   ├── *.html              # index / display / license / login / pair / setup / 3d-studio
│   ├── modules/runtime/    # 3D 交互舞台与编辑器，按功能域细分（经 /api/v1/modules/interaction3d 下发）
│   │   ├── core/           # 舞台 / 运行入口 / 共享桥 / 场景同步 / 空闲轮转 / 弹窗预览
│   │   ├── camera climate cover light nas television vacuum presence environment security/
│   │   └── editor/         # 配置编辑器与量程对话框
│   └── static/             # 挂载为 /static
│       ├── app.css         # 唯一全局样式表（保留在挂载根）
│       ├── bridge/         # 3D 交互编辑器桥接、场景渲染助手、封面、定义
│       ├── editor/         # 仪表盘编辑器入口（home.js）与主体；picker/ 为控件/资源选择器
│       ├── renderer/       # 控件运行时：core/（渲染主体与共享基建）· controls/（按域）· geometry/
│       ├── display/        # 中控展示页脚本与样式
│       ├── auth/           # 登录 / 初始化 / 配对 / 激活页脚本与样式
│       ├── shared/         # 编辑器与运行时共用（动作规则、确认框、实体域、弹窗布局、浮动菜单定位）
│       ├── logging/        # 客户端日志与全局日志面板
│       ├── assets/         # icons/（favicon / 触屏图标 / 品牌图）· manifest/（webmanifest）
│       ├── utils/          # 与业务无关的纯工具（颜色 / 数值 / 日期 / 实体域等）
│       ├── 3d-studio/      # 户型工作室（入口 studio/studio-app.js，models/ 为模型素材）
│       │   ├── studio/     # 编排层、相机/过渡/呈现、场景样式、控件、studio.css
│       │   ├── plan/       # 底图与户型几何：比例、开洞、窗洞、平面绘制与光影
│       │   ├── reflection/ # 地面反射：细节层 Worker、剔除、反射体
│       │   ├── materials/  # 程序化材质：墙面/地面/柜体/车漆/电视玻璃与海报/暖阳植被
│       │   ├── loaders/    # 外部模型装载、规范化、运行时家具、安防模型、窗帘轨道
│       │   └── export/     # 出图与导出：预设、工具、Draco 解码器与同源 Worker
│       ├── templates/      # 控件模板
│       └── component-thumbnails/  audio/  vendor/（three.js、hls.js、MDI）
├── store/                  # 授权商店 + 授权服务器 + 运营后台
│   ├── app.py run.py config.py
│   ├── core/               # 连接/表/请求体模型/序列化/公共依赖/.env/启动默认数据
│   ├── security/           # 口令会话、来源与同源校验、失败限流、初始化守卫、请求体上限、库结构守卫
│   ├── commerce/           # 商品·订单·履约·优惠码·积分与邀请（含 money/catalog/order_status）
│   ├── ops/                # 站点配置、邮件、发布信息、能力码目录、可达性探测、异常计数
│   ├── api/                # store.py(/store/v1) license.py(/v2) admin.py alipay.py setup.py pages.py
│   ├── licensing/          # 服务端传输加密 + 租约签发 + 三端点业务
│   ├── payments/           # base / mock / alipay（签名·下单·验签·查单）/ 统一入账
│   ├── templates/          # store.html（前台 8 个分页）+ admin.html（后台 15 个 panel）
│   ├── static/             # theme.css（唯一设计系统）+ store.css / admin.css + 字体·图标·JS
│   ├── keys/local/         # 授权私钥（不入库）
│   └── data/               # 商店 SQLite 与商品图（不入库）
├── keys/                   # 客户端默认读取的公钥镜像（启动时由密钥准备流程自动同步）
├── migrations/             # Alembic 基线 0001 + 增量 0002（项目名唯一）/ 0003（展示地址别名）
├── image/                  # 可选的自定义内置素材目录（默认空）
├── tools/                  # bump_static_cache_versions.mjs（全站静态资源缓存戳同戳刷新）
├── docker/                 # 容器启动（start_app / start_store）与构建期保护（compile py / obfuscate js）
├── deploy/                 # 生产清单与反代示例（Caddy / nginx）
├── data/                   # 主应用运行时数据（不入库）
├── .env.example            # 环境变量模板（复制为 .env；A 区为部署常改项）
├── Dockerfile              # 多目标：app（主应用）与 store（商店）
├── docker-compose.yml      # 双容器自托管（默认拉 GHCR）
├── docker-compose.build.yml # 本地构建覆盖
└── alembic.ini  VERSION  start.py  container_entrypoint.py
```

不要删除 `frontend/`。内置素材目录 `image/` 可自行增删，编辑器里也可改用用户上传图片。

以下内容已写入 `.gitignore`：`data/`、`store/data/`、`store/keys/local/`、`.env` 与 `.env.*`（`.env.example` 除外）、`.venv/`、`.venv-store/`、`*-private.pem`，以及本地临时目录 `/app/`（解包旧构建）、`.deobf/`（反混淆产物）、`原项目/`（对照快照）。

## 环境

- Python 3.11+（本地已在 3.14 验证）
- 本机同时跑两个进程：主应用 **18081**、授权商店 **18082**
- 连接 Home Assistant 时，主应用需要能访问 HA 的 HTTP 与 WebSocket

依赖见 [store/requirements.txt](store/requirements.txt)：FastAPI、Uvicorn、SQLAlchemy、Pydantic、httpx、cryptography、python-multipart。主应用与商店共用同一份依赖。

其中 `watchfiles` 只服务本地热重载：`start.py` 会给商店设 `STORE_RELOAD=1`，`store/run.py` 据此以 uvicorn reload 模式启动并监听 `store/` 目录。缺这个包时，改了商店模块级常量（例如模拟收银台的内联 HTML 与静态资源版本戳）必须手动重启才会生效。

## 本地启动

仓库根目录一条命令：

```bash
python3 start.py
```

生产或容器部署请改走 [Docker](#docker)，不必用 `start.py`。

`start.py` 会：

1. 缺失时创建 `.venv-store` 并按 `store/requirements.txt` 安装依赖；
2. 读取根目录 `.env`（已存在的真实环境变量优先）；
3. 依次拉起授权商店 **18082** 与主应用 **18081**（主应用带 `--reload`）。

首次启动**不需要任何准备命令**：`start.py` 会先在 `store/keys/local/` 生成缺失的授权密钥并把公钥镜像到仓库根 `keys/`（客户端信任锚），商店启动时再幂等补齐商品目录与站点配置。

> 公钥镜像 `keys/` 与 `store/keys/local/` 必须**逐字节一致**：客户端按 PEM 文件字节校验 sha256。镜像由启动时的密钥准备流程自动同步，不要手工只覆盖其中一处，否则激活会因指纹不匹配而失败。

主应用打开 <http://127.0.0.1:18081/setup>，商店打开 <http://127.0.0.1:18082/>。

数据库结构由基线 `0001` 加增量 `0002` / `0003` 在主应用启动时自动建立（迁移串行化，动结构前留一份可还原快照）。需要手工执行时：

```bash
APP_DATA_DIR=./data PYTHONPATH=. alembic upgrade head
```

## 首次使用

1. 打开 `/setup` 创建管理员（用户名 3–64 个字符，密码至少 8 位）。从**本机**（`localhost` / `127.0.0.1`）打开时直接填账号密码；从其它地址打开时页面多出「引导密钥」一栏，需填服务启动日志里打印的那一串 —— 见下方[首次设置窗口](#首次设置窗口)。
2. 打开 <http://127.0.0.1:18082/>：首次部署会先经 `/admin` 跳到 `/setup` 创建**商店管理员**；随后注册商店账号（本地联调默认 `STORE_MAIL_MODE=echo`，验证码直接回显），选择商品并用模拟收银台完成支付（`start.py` 已自动带上 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`），账号中心会发放激活码。
3. 回到主应用登录后进入 `/license`，用「激活码 + 购买邮箱」激活。未激活时编辑器会跳到 `/license`，展示页和受保护静态资源返回 401 / 403。
4. 在编辑器里配置 Home Assistant 的地址和长期访问令牌，然后创建空白仪表盘。
5. 使用 3D 交互：先在 `/3d-studio` 保存户型，再在编辑器添加「3D 交互」控件并载入户型快照，绑定 `light.*` / `switch.*` 等实体后即可在舞台里控制。
6. 墙面中控：在编辑器生成 6 位配对码，设备打开 `/pair` 完成配对。

未初始化时任意页面都会跳到 `/setup`。

### 首次设置窗口

`/api/v1/setup/admin` 不能要求登录（此时还没有账号），所以必须自己把「谁有资格创建管理员」管住，否则任何能连上这台机器的人都能抢先建掉管理员并当场拿到会话。当前规则：

- **本机直连放行**：三个条件同时成立 —— TCP 对端是 `127.0.0.1` / `::1`、`Host` 头的主机名也是 `127.0.0.1` / `::1` / `localhost`、且请求不带任何转发头（`X-Forwarded-*`、`Forwarded`）。带转发头说明前面还有代理，对端地址不再代表真实来源；`Host` 那一条专门挡**同机反向代理** —— nginx 默认连转发头都不补、对端又是 `127.0.0.1`，只看前两条时一个「公网域名 → `127.0.0.1`」的反代与运维坐在本机操作完全一样（`kubectl port-forward`、`ssh -L`、`socat` 同理）。Caddy / Traefik / `proxy_set_header Host $host` 的 nginx 会把访问者用的域名原样透传，因此这类请求不再被当成本机。**从本机操作请用 `localhost` 或 `127.0.0.1` 打开**，用域名打开则要填引导密钥。
- **其它来源必须带引导密钥**：`APP_SETUP_TOKEN` 的值，或首次启动时自动生成的那一串。生成的密钥写在 `$APP_DATA_DIR/setup-token`（权限 `0600`）并打印到启动日志 / 容器日志：

  ```text
  HomeOS 尚未初始化（库中没有任何管理员账号），完成首次设置后本窗口自动关闭。
    密钥来源: /data/setup-token
    密钥内容: 1Bv...（32 字节随机串）
  ```

  取用方式：`docker logs <容器>`，或 `cat $APP_DATA_DIR/setup-token`。

  自动生成的那份会**另留一个 `setup-token.generated`**（同目录、`0600`）记录密钥指纹，用来在重启时区分「上次没走完的窗口留下的」与「运维自己预置的恢复手段」——只有前者会被清理。自己往 `setup-token` 放密钥时不要放这个文件，那份就会被当作运维预置而一直保留。
- 失败会计入限流（与登录共用限流器），成功与失败都写审计日志。
- 初始化成功后密钥立即作废（自动生成的那份文件会被删除），窗口关闭。重置账号（删除 `data/admin-account.json` 后重启）会重新打开窗口并重新生成密钥。

忘记主应用管理员账号或密码：停掉进程，删除 `data/admin-account.json` 再启动，系统回到设置页。户型、HA 配置、授权和中控配对不会被删。

## 安全基线

以下是代码里已生效的默认行为，不需要额外配置；只有反向代理部署才需要补一对变量。两条硬边界：**授权校验不能通过环境变量关闭**，**首次设置的窗口不会长期敞开**。

### 请求来源：谁在代理、能不能信转发头

`backend/security/http_security.py` 与 `store/security/request_security.py` 是同一套逻辑的两份实现（两个服务独立部署、刻意不互相 import）。限流、审计与首次设置的放行都建立在「请求到底来自哪个 IP」上，而 `X-Forwarded-For` 是客户端可以自己写的：

- **默认不信任任何转发头**（`APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` 留空）：一律按 TCP 对端地址统计，伪造 `X-Forwarded-For` 换不来新的限流桶。
- **配了可信代理**（逗号分隔的 IP / CIDR）后，仍只在这条连接确实来自代理时才从转发链里取真实来源。代理没传转发头时地址是共享的，按 IP 那一档限流会主动让位，否则一个人的失败会锁掉所有人。
- **还有一层在 uvicorn 上**：`--forwarded-allow-ips` 决定 uvicorn 会不会拿 `X-Forwarded-For` 改写对端地址，而上面两条规则的前提正是「对端不可伪造」。容器启动器与 Compose 默认 `127.0.0.1,::1`（只信回环）；**不要填 `*`**，否则登录限流、配对码枚举预算与审计来源 IP 会同时变成「客户端自己说了算」。前面确有反向代理时，填成**代理自身的地址或网段**。
- 检测到转发头却没配可信代理时，启动日志会警告一次（只记一次）。

### 会话与 Cookie

| 机制 | 行为 |
| --- | --- |
| Cookie `Secure` | 按请求自动判定，任一成立即加：显式 `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` → `APP_BASE_URL` / `STORE_BASE_URL` 是 https → 可信代理转发了 `X-Forwarded-Proto: https` → 连接本身是 https。漏配开关不会让会话 Cookie 明文下发，纯 http 局域网也不会误加（误加会让浏览器直接丢弃 Cookie） |
| 登录会话 | 滑动有效期 `APP_SESSION_MAX_AGE_SECONDS`（默认 8 小时）+ 绝对寿命 `APP_SESSION_HARD_MAX_AGE_SECONDS`（默认 30 天），后者不能被续期突破 |
| 会话列表与撤销 | `GET /api/v1/auth/sessions` 列出全部登录会话（只回令牌哈希），`DELETE /api/v1/auth/sessions/{id}` 踢掉单个，`DELETE /api/v1/auth/sessions` 一键退出其它设备 |
| 中控令牌 | 滑动有效期 `APP_DISPLAY_TOKEN_TTL_SECONDS`（默认 180 天，活跃即续期，带 5 分钟节流）+ 可选硬上限 `APP_DISPLAY_TOKEN_HARD_TTL_SECONDS`（`0` = 不设）。基准是「最近一次活跃」而不是「配对时刻」，常年挂墙的平板不会被定期赶去重配 |
| 中控设备列表 | 附带 `expiresAt` / `expired`；过期设备仍然可见，管理员可手动解绑 |

### CSRF：改状态的请求必须同源

SameSite=Lax + 只收 JSON 是第一道闸，代码里另有一道显式的 Origin / Referer 校验：

- 主应用拦所有非 GET 的 `/api/*`；商店拦非 GET 的 `/store/v1/*` 与 `/store-admin/v1/*`。
- 只认「裸的 `scheme://host`」：`http://evil@本机地址/`、带路径或查询串的写法一律不算同源。
- GET / HEAD / OPTIONS 不拦。
- 两类豁免：`/v2/*` 授权端点（程序调用，报文加密封套 + 签名，本就没有浏览器 Origin）与支付宝异步回调（服务器直连，真伪由签名校验）。

### 首次设置

未初始化实例的「先到先得」问题由主应用与商店各自的守卫兜住：`backend/security/setup_guard.py`（规则见上方[首次设置窗口](#首次设置窗口)）与 `store/security/setup_guard.py`（本机直连放行 + 远程引导密钥 + 限流，再用一条 `INSERT ... WHERE NOT EXISTS` 由数据库定胜负，见 [store/README.md](store/README.md)）。两者是两个服务独立部署下刻意保留的两份实现，不互相 import。

### 配对、上传与日志

- **配对码生命周期**：6 位码不再可无限复用。两档限流（按 IP + 跨来源总预算，后者防「换 IP 继续枚举」），被拦返回 429 + `Retry-After`；配对码已被在用设备占用时返回 409，必须先在后台解绑才能重配；配对前校验授权允许 `display`。
- **上传体积上限**：`POST /api/v1/assets/user` 先按 `Content-Length` 早拒，再按逐块累计字节数兜底（分块传输 / 不带长度也拦得住）：SVG 5 MB、位图 64 MB，超限 413 且不留垃圾文件。
- **全局日志不放大**：写盘移交给唯一的后台写线程（请求路径零磁盘 I/O），同一处刷屏折叠成一条并累加 `repeatCount`，超限裁剪带最小间隔（最密 10 秒一次），应用关闭时刷盘并回收线程。

### 归属与出网

- **3D 导出与效果变体按项目归属**：中控设备只能读自己仪表盘引用的导出图 / 效果变体，跨项目 403，文件不存在统一 404（不泄露存在性）；管理员不受限。
- **HA 换址确认**：改 `baseUrl` 但不重输令牌时返回 409 与错误码 `HA_URL_CHANGED_TOKEN_REUSE`，必须显式带 `reuseTokenForNewUrl: true` 确认新地址可信；被拒时库里的地址不会被改动。
- **云元数据地址拒绝**：`169.254.169.254`（含 `::ffff:` 映射写法）等云元数据地址在 `/api/v1/ha/test` 直接 422，链路本地地址会单独提示。

### 商店侧

- **商品字段取值收敛**：`product_type` 与 `fulfillment_mode` 由 `store/commerce/catalog.py` 统一校验（取值与后台两个 `<select>` 一致）。过去没有校验，拼错一个字母会让「手工发卡」静默变成自动发卡，或让增量包被当成基础授权买走。
- **订单终态保护**：`cancelled` / `expired` / `refunded` 的订单不能再被标记支付或履约。
- **待复核标记**：`needs_review` 目前只由「订单超时关闭后款项才到账」的复活单产生，后台可用 `POST /store-admin/v1/orders/{order_no}/review` 标记已处理，结论追加进 `review_note` 而不覆盖原原因。
- **营收口径**：后台「标记支付」只放行订单、**不计入营收**；人工确认收款走 `settle-offline`。详见 [store/README.md](store/README.md) 的「订单与营收口径」。
- **可观测性**：支付巡检状态与入账异常计数都能在后台概览与 `GET /healthz` 读到（非零即 `degraded`）。详见 [store/README.md](store/README.md) 的「巡检与入账异常」。
- **商品图格式按内容判定**：按魔数识别 PNG / JPEG / GIF / WebP，SVG 明确 422（它是能内嵌脚本的 XML，而商品图是按后缀回 `Content-Type` 的同源资源）；落盘后缀由真实内容决定，换格式不留孤儿文件。
- **前端转义只有一份实现**：后台、前台与邀请页统一走 `store/static/htmlsafe.js` 的 `HtmlSafe.esc`（用 `&#39;` 而非 `&apos;`）。少转一个字符不会有任何报错，只会让某个拼接点变成注入点。
- **改库前的备份真的能还原**：商店的库跑在 WAL 模式，直接复制主库文件得到的 `.bak` 是空壳（新行还在 `store.db-wal` 里）。现改用 `VACUUM INTO` 取一致快照。
- **能力码清单只有一处定义**：由 `store/ops/features.py` 的能力目录派生，校验直接读主项目 `backend/` 的 `BASE_FEATURES` 对账，并静态扫描防止别处再抄一份。

## 授权体系

### 零配置指向自建授权服务器

客户端默认值写在 `backend/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像 `keys/` 及其 sha256，**密钥 id 由公钥文件字节派生**（形如 `hb-3f2a…`；服务端与客户端各自从自己那份镜像算出同一个值，因此不需要人工同步字符串）。**不设任何环境变量**，起服务后即可在 `/license` 激活。厂商生产节点与生产公钥已从代码中彻底移除。

整个体系是「服务端签发 Ed25519 签名租约 → 客户端离线验签 → 定期心跳续租」：租约 7 天有效，客户端每 300 秒续租一次；传输层为 X25519 ECDH → HKDF-SHA256 → AES-256-GCM，端点路径本身也参与派生与认证。

需要把授权服务器部署到别处时才用环境变量覆盖，例如：

```bash
export APP_LICENSE_SERVER_URL=https://license.example.com
export APP_LICENSE_PUBLIC_KEY_FILE=/path/to/license-public.pem
export APP_LICENSE_PUBLIC_KEY_SHA256=<license-public.pem 文件字节的 sha256>
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE=/path/to/license-transport-public.pem
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256=<license-transport-public.pem 文件字节的 sha256>
```

- 只设 `APP_LICENSE_SERVER_URL` 时，客户端会把批次收敛为单条 `direct`，不会散到其它节点。
- 需要多批次时用 `APP_LICENSE_SERVER_BATCHES='esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083'`（`;` 分隔批次，`|` 分隔组内地址，空组表示禁用）。
- `APP_LICENSE_TRUSTED_PUBLIC_KEYS='keyId:公钥路径:sha256|keyId2:路径:sha256'` 可整体替换可信公钥表。

#### 密钥轮换与重叠窗口

`keyId` 由公钥文件派生，所以**重新生成密钥一定会换 id**。直接覆盖密钥会让旧客户端当场全部失效；要平滑过渡：

1. 把当前四件套（`license-private.pem` / `license-public.pem` / `license-transport-private.pem` / `license-transport-public.pem`）改名成 `*.previous.pem`；
2. 生成新四件套并镜像到 `keys/`。

服务端据此把两代都装进密钥环，**按请求里的 keyId 选代解密并用同一代签名** —— 旧客户端在窗口内照旧心跳；客户端也会自动多信任一条上一代记录（`keys/license-public.previous.pem` 存在才登记），因此「客户端先升级、服务端后轮换」也不中断。窗口是一次轮换的长度，删掉四个 `*.previous.pem`（缺一不可）即立即关闭。

### 能力码

租约携带的能力码决定主应用各部分是否可用（`LicenseService.allows`）：

`api`、`assets`、`editor`、`display`、`ha.sync`、`ha.configure`、`ha.control`、`projects.write`、`runtime.websocket`、`module.3d_interaction`。

首次启动自动补齐的三条商品与能力码对应关系：

| 商品 | 类型 | 能力码 |
| --- | --- | --- |
| 编辑器+绘制工具 | `base` | 上表除 `module.3d_interaction` 外的全部 |
| 3D交互包 | `module` | `module.3d_interaction` |
| 编辑器+绘制工具+3D交互 | `package` | 基础能力 + `module.3d_interaction` |

### 重启时的联网确认

客户端启动时会先做一次 `recover` 联网确认，失败按性质分流：

- **确认吊销**（403 且响应含结构化 `code=REVOKED` / `revoked: true`）→ 保持拦截，清空本地授权，状态 `REVOKED`。
- **其余失败**（网络不可达、服务端 5xx）→ 不锁死：租约未过期则 `CONNECTION_WARNING`（门禁放行），已过期则 `LEASE_EXPIRED`（拦截）。

心跳循环持续重试，服务器恢复后自动续租回到 `ACTIVE`。

### 吊销语义（客户端契约）

运营后台「停用设备绑定 / 停用授权」后，端点返回 `403 {"detail": "...", "revoked": true, "code": "REVOKED"}`。客户端只认结构化 `code`（`REVOKED` / `LICENSE_REVOKED`）或 `revoked: true`，才判定为确认吊销并清空本地授权；其余 401/403（无上述字段）视为瞬时故障（保留本地授权继续重试）。详见 `backend/license/service.py` 的 `is_confirmed_revocation`。

## 3D 户型工作室

打开 `/3d-studio`。左侧是模型库与检查器，右侧是平面图画布。工作室只编辑草稿，不会直接改动仪表盘；户型和场景要另外导出，或生成 3D 交互快照后供仪表盘与展示页使用。

### 平面图工具

| 工具 | 说明 |
| --- | --- |
| 选择 | 单击精确选择，空白处拖拽框选；移动时 `Shift` 锁轴、缩放时 `Shift` 等比例，`Option`/`Alt` 拖动复制，`⌘`/`Ctrl+C`、`V` 复制粘贴 |
| 平移 | 按住左键拖动平移画布 |
| 参考线 | 依次单击两个端点，用于确定真实比例；按住 `Shift` 强制锁定水平或垂直 |
| 墙体 | 逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 `Shift` 锁轴，`Esc` 结束 |
| 窗户 | 靠近墙体单击，自动吸附并生成真实窗洞 |
| 门 | 靠近墙体单击，自动吸附并生成门洞；选中后可翻转开启方向 |
| 栏杆 | 靠近墙体单击，玻璃栏杆吸附到墙段并替换对应的实体墙 |
| 铭牌 | 单击画布放置户型铭牌；选中后可修改文字、拖动、缩放和旋转 |
| 楼板洞口 | 位于工具栏右侧，拖出矩形洞口；仅切除当前层楼板 |

「平移」只改变画布视角，不修改户型，因此既不写入草稿也不进入撤销栈。它与既有操作共用同一套平移逻辑：滚轮缩放、中键拖动、按住空格拖动在任何工具下都可用。

切到「灯光」分类后户型会锁定，只能使用「选择」工具，点击其他工具会提示先切回家居或电器，避免在灯光编辑中误改墙体。

### 灯光区域与灯组

「灯光」分类下会出现图层面板（区域 → 灯组的二级树），顶部有三个操作：`全关`、`新建区域`、`新建灯组`。

- **区域**用于按房间或空间给灯组分类，只有名称（最长 16 字，同层不可重名），可随时重命名或删除。
- **灯组**包含名称（最长 24 字）、启用状态和所属区域；未归入任何区域的灯组显示为「未分类」。
- **拖入区域**：拖动灯组行到目标区域标题上即可移入，标题会高亮提示；拖到另一个灯组行上则是在区域内调整顺序。
- **右键菜单**：灯组行可选 `设置区域` / `重命名` / `复制灯组` / `删除`；区域标题可选 `重命名区域` / `删除区域`。`设置区域` 弹窗里除了选择已有区域，也可以直接输入新名称就地新建，选「未分类」则移出区域。
- **删除区域不会删除灯组**，组内灯组会回到「未分类」。
- 区域和归属按楼层保存，展开／收起状态只在当前会话内有效。

### 模型库：壁画、背景墙与柱子

| 模型 | 分类 | 默认尺寸 | 可选样式 |
| --- | --- | --- | --- |
| 壁画 | 客厅常用 | 1.20 × 0.80 m，离地 0.90 m | 画面风格：包豪斯几何、柔和色域、极简线条、硬边色块、水墨意象、水磨石纹 |
| 背景墙 | 客厅常用 | 3.00 × 2.40 m | 墙面材质：大理石、木纹、格栅条、岩板、微水泥、布纹、金属拉丝 |

两者都由程序化生成（画布纹理加几何体），不依赖外部模型文件，因此不会出现模型加载失败。背景墙的「格栅条」样式会额外出真实 3D 格栅。

柱子位于「结构与特殊物件」分类，默认 0.45 × 0.45 m：

- **形状**：方形、圆形、半圆形、1/4 圆形、1/4 圆形（内弧）。
- **布置方向**：垂直（站立）或水平（躺放）。躺放时平面占位改为「宽 × 长」，平面符号改用内轮廓表示，3D 中绕轴旋转 90° 后重新贴地，检查器里的「高（m）」相应改名为「长（m）」。
- **轻量 GLB**：非方形柱子使用轻量模型 `pillar-*-lite.glb`，加载失败时自动回退到完整模型；方形柱子回退到程序化几何体。轻量与完整的选择是自动的，界面没有开关。

### 墙体属性与「应用到所有」

选中墙体后，检查器里每一项都可以单独修改，其中四项各自带一个 `应用到所有` 按钮：

| 字段 | 取值范围 | 说明 |
| --- | --- | --- |
| 墙长 | 只读 | 由两端点决定 |
| 墙高（m） | 0.01–6 | 同时成为本层新画墙体的默认值 |
| 厚度（m） | 0.01–3 | 同时成为本层新画墙体的默认值 |
| 透明度设置 | 跟随通用 / 单独设置 | 选择「跟随通用」即清除该墙的单独设置 |
| 透明度（%） | 0–100 | 仅在「单独设置」下生效 |
| 开放端点提醒 | 自动判断 / 允许开放端点 | — |

点击 `应用到所有` 会打开「应用墙体属性」弹窗（`APPLY TO WALLS`）：上方显示将要应用的值，下方是带复选框的墙体列表，每行标注该墙的当前值，当前选中的那面墙会标出「当前墙」；可以 `全选` / `取消全选`，确认按钮为 `应用所选`。

- 作用范围是**当前楼层**，不会影响其他楼层。
- 只改所选的这一项属性，其他属性保持不变。
- 整批应用只产生一次撤销快照。
- 应用墙高 / 厚度时，本层的默认墙高 / 墙厚也会同步更新，之后新画的墙会继承新值。

灯光的色温、亮度、照射范围、照射角度、离地使用同一套批量入口。此外，左侧顶部的「墙体」卡片（高 / 厚 / 透明度）是另一种更直接的方式：它不弹选择框，会直接覆盖当前楼层的所有墙体。

### 草稿保存

编辑是自动保存的：停止操作约 650 ms 后写入草稿，状态依次为「有未保存修改」、「正在保存…」、「已自动保存」，失败会提示 `3D 草稿保存失败。`。草稿落在 `data/studio3d/draft.json`。

如果同一份草稿已在另一个页面被修改，会弹出版本冲突提示（「其他页面已经修改了户型」），此时自动保存暂停，需要选择 `加载服务器版本` 或 `使用当前页面覆盖`。

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
| `/api/v1/ha/*` | HA 连接、实体、翻译、历史、区域、设备、同步、健康、服务调用、媒体浏览 |
| `/api/v1/ha/*` 子集 | `ha.configure` / `ha.sync` / `ha.control` 分别门禁 |
| `/api/v1/displays/*` | 中控设备与配对码 |
| `/api/v1/assets/*` | 内置素材、用户图片、灯光效果变体、户型导出 |
| `/api/v1/icons` | 图标目录 |
| `/api/v1/studio3d/*` | 3D 草稿与导出 |
| `/api/v1/modules/interaction3d/*` | 3D 交互：场景快照、舞台页、灯光缓存、配置编辑脚本 |
| `/api/v1/logs` | 全局日志（列表、导出、上报、清空） |
| `/api/v1/license/status` · `/api/v1/license/activate` | 授权状态与激活 |
| `/api/v1/updates` | 版本更新检查 |
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
| `/setup` | 商店首次部署：创建管理员（非本机直连需带引导密钥，见「首次设置窗口」） |
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
| `instance-id` | 当前硬件派生的安装实例 ID（缓存；真相源是硬件指纹） |
| `hardware-fallback-id` | 硬件不全时的本机封印兜底熵（拷到别的机器会失效） |
| `secrets/` | HA、配对、授权密钥 |
| `assets/` | 用户上传图片 |
| `studio3d/` | 3D 草稿 |
| `modules/interaction3d/` | 3D 交互场景快照与灯光渲染缓存 |
| `exports/` | 3D 导出 |
| `logs/` | 全局事件日志 |
| `cache/effect-variants/` | 灯光效果变体缓存 |

授权商店数据在 `store/data/`：`store.db` 与商品图。授权私钥在 `store/keys/local/`。**不要提交这些文件。**

### 升级与迁移

- 数据库结构由基线 `0001` 加增量 `0002`（项目名唯一）/ `0003`（展示地址别名）建立，主应用启动时自动执行并在动结构前留一份可还原快照。若库内记录的是更早构建的 revision，会先认领基线再升级（不改动任何业务数据）。
- 邀请积分从 `FLOAT`（积分）改为 `INTEGER` **厘**（1 积分 = 100 厘）：原先靠 `round(x, 2)` 维持两位小数，而 SQLite 的 `round()` 是 half-away、Python 的是 half-even，落在 `.xx5` 上时两侧给出不同分币值。**升级不需要手工执行任何命令**，商店启动时自动按「补列 → 回填 + 逐行对账 → 退役旧列」完成，动手前先备份一份 `store.db.pre-centi-<时间戳>.bak`；对账有任何一行不一致就保留新旧列并存并打印差异，不会丢数据。对外 JSON 契约没变（仍是 `"10.05"` 这样的两位小数字符串）。

详见 [store/README.md](store/README.md) 的「升级与迁移」。

## 环境变量

主应用与商店的变量统一写进仓库根目录的 `.env`：把 [.env.example](.env.example) 复制成 `.env` 再按需取消注释（`.env` 已被 gitignore）。优先级：**真实环境变量 > `.env` > 代码 / `start.py` 默认值**。

模板按用途分区，**多数部署只需改 A 区**：

| 区 | 内容 |
| --- | --- |
| **A. 部署常改** | 公网域名、可信反代、Cookie Secure、模拟支付总闸 |
| **B. 主应用** | 数据目录、会话 / 中控寿命、HA / 授权超时与密钥路径（默认即可） |
| **C. 商店基础设施** | 监听、数据目录、租约 TTL、巡检间隔等（后台改不了的项） |
| **D. 首次初始化** | 两个 `/setup` 页面创建管理员用的引导口令：主应用 `APP_SETUP_TOKEN` → `data/setup-token`、商店 `STORE_SETUP_TOKEN` → `store/data/setup-token`；都不设时首次启动自动生成并打印到启动日志 |

站点名、公告、客服、维护、邀请提现、解绑冷却、验证码 TTL、**邮件 / SMTP、支付渠道、支付宝商户与回调**等请到商店 `/admin`「站点配置」改（**保存即生效、免重启**）。`.env.example` 故意不再罗列这些项，避免和生产后台双源配置打架。

### 部署常改（A 区）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_BASE_URL` | 空 | 主应用对外根地址；反代时建议设置，供 WebSocket 校验 Origin |
| `APP_LICENSE_SERVER_URL` | 本地 `http://127.0.0.1:18082`；Compose 默认 `http://homeos-3d-store:18082` | 授权服务器地址；同 Compose 网络通常不用改 |
| `APP_TRUSTED_PROXIES` | 空 | 可信反向代理 IP / CIDR（逗号分隔）；留空则不信任任何转发头 |
| `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1,::1`（Compose 与容器启动器） | uvicorn 允许改写对端地址的来源范围。**不要填 `*`**：那会让限流与审计的来源 IP 由客户端自己决定；前面有反代时填代理自身地址 / 网段 |
| `APP_COOKIE_SECURE` | `false` | 强制会话 Cookie 加 `Secure`；不设时按请求自动判定 https |
| `STORE_BASE_URL` | 由请求推导 | 商店对外基址（支付二维码 / 回调链接） |
| `STORE_TRUSTED_PROXIES` | 空 | 商店侧可信反代，语义同主应用 |
| `STORE_COOKIE_SECURE` | `false` | 商店会话 Cookie 的强制 `Secure` |
| `STORE_ALLOW_MOCK_PAYMENTS` | `false` | 模拟收银台总闸；**仅本地联调**，生产保持关闭 |

管理员不走环境变量：首次部署后访问 `http://<商店地址>:18082/setup` 创建（早期版本的 `STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` 预置路径已移除，它等于给每个照文档部署的实例留一个公开默认账号）。

Compose 还可选：`HOMEOS_IMAGE` / `HOMEOS_STORE_IMAGE`（覆盖镜像名）、`APP_PUBLISH_PORT` / `STORE_PUBLISH_PORT`（宿主机映射，默认 18081 / 18082）。

### 主应用常用（B 区摘要）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_DATA_DIR` | `<仓库>/data`（容器 `/data`） | 运行时数据目录 |
| `APP_PORT` | `18081` | 容器监听端口 |
| `APP_SESSION_MAX_AGE_SECONDS` | `28800` | 登录会话滑动时长（8 小时） |
| `APP_SESSION_HARD_MAX_AGE_SECONDS` | `2592000` | 会话绝对寿命（30 天） |
| `APP_SETUP_TOKEN` | 空 | 首次引导密钥；留空则首次启动自动生成（见「首次设置窗口」） |
| `APP_DISPLAY_COOKIE_MAX_AGE_SECONDS` | `15552000` | 中控 Cookie 浏览器侧有效期（180 天） |
| `APP_DISPLAY_TOKEN_TTL_SECONDS` | `15552000` | 中控令牌滑动有效期（活跃即续期） |
| `APP_DISPLAY_TOKEN_HARD_TTL_SECONDS` | `0` | 中控令牌硬上限；`0` = 不设 |
| `APP_UPDATE_CHANNEL` | `docker` | 更新检查渠道 |
| `APP_LICENSE_KEY_ID` / `APP_LICENSE_TRANSPORT_KEY_ID` | 留空（由公钥派生） | 显式钉住 keyId；默认派生，轮换密钥后自动改变 |
| `APP_LICENSE_PUBLIC_KEY_FILE` · `_SHA256` | 仓库 `keys/`（容器由共享卷注入） | 签名公钥 |
| `APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE` · `_SHA256` | 仓库 `keys/` | 传输公钥 |
| `APP_HA_CREDENTIAL_FILE` 等 | 数据目录内默认路径 | HA / 中控 / 授权凭据密钥文件 |

授权校验始终开启（`license_required=True`），不能通过环境变量关闭。激活只连接自建授权服务器。

### 授权商店常用（C 区摘要）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `STORE_HOST` / `STORE_PORT` | `0.0.0.0` / `18082` | 监听地址（`start.py` 下为 `127.0.0.1`） |
| `STORE_DATA_DIR` | `store/data`（容器 `/data`） | SQLite 与商品图目录 |
| `STORE_LICENSE_KEYS_DIR` | `store/keys/local`（容器 `/data/license-keys`） | 授权私钥目录 |
| `STORE_LICENSE_KEY_ID` / `STORE_LICENSE_TRANSPORT_KEY_ID` | 留空（由公钥派生） | 显式钉住签发租约与传输密钥的 keyId；轮换后自动改变 |
| （轮换窗口） | 无 | 目录里存在 `license-*.previous.pem` 四件套即自动开启：旧客户端在窗口内仍可解密与验签 |
| `STORE_COOKIE_NAME` | `ha_bridge_store_session` | 商店会话 Cookie 名 |
| `STORE_LEASE_TTL_SECONDS` | `259200` | 租约有效期（72 小时）。⚠ 该值同时是「离线可用时长」与「吊销生效上界」：对持续离线的客户端，停用授权最慢要等这么久才生效 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT` | `3600` | `/v2/heartbeat` 与 `/v2/recover` 的来源 IP 小时配额（`/v2/activate` 固定 60/小时）。额度按 NAT 出口地址算，多设备共用出口时调大 |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期（真实收款须调大） |
| `STORE_PAYMENT_SWEEP_INTERVAL_SECONDS` / `_BATCH` | `30` / `25` | 支付巡检间隔与每轮上限 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 接口是否回显验证码（生产必须 false） |

本地 `start.py` 会临时打开 `STORE_PAYMENT_PROVIDER=mock`、`STORE_ALLOW_MOCK_PAYMENTS=1` 与 `STORE_MAIL_MODE=echo`，方便联调；Docker 生产路径不会自动打开这些开关。

后台「站点配置」口径：留空 / 填 `0` 表示跟随环境变量，填了值就以后台为准。SMTP 授权码只显示打码值；支付宝回调不能填 `localhost` / 内网地址。完整变量、支付宝接入与排障见 [store/README.md](store/README.md)。

## Docker

双容器分别跑主应用（**18081**）与授权商店 / 授权服务器（**18082**）。GitHub Actions 构建两个 GHCR 镜像：

- `ghcr.io/sfairy/homeos-3d`（Dockerfile target `app`）
- `ghcr.io/sfairy/homeos-3d-store`（Dockerfile target `store`）

该 workflow **只支持手动触发**（在 Actions 页面 Run workflow），不在 `push` / PR 上自动构建。从 `main` 手动运行时打 `latest` 与 `VERSION` 标签，从 `v*` tag 手动运行时打 semver。

最终运行镜像**不包含可读业务源码**：

- **Python**：构建阶段用 **Cython** 把 `backend/`、`store/`、`docker/` 与 `container_entrypoint.py` 下的全部 `.py`（含各包 `__init__.py`）编译成原生扩展 `.so`，随后删除 `.py`。镜像里只剩机器码，读不到源码也反编译不回去。
- **JavaScript**：`javascript-obfuscator` 混淆（跳过 `vendor/` 与 `*.min.js`）。

镜像内不含构建脚本、`node_modules`，也不残留 `__pycache__` / `.pyc` / Cython 中间产物 `.c`。

唯一保留源码的是 `migrations/`（`env.py` + 各 revision）：Alembic 按文件路径读取源码执行（`load_python_file`），编译成 `.so` 后无法加载。这些文件只有建表 DDL，不含业务逻辑。

编译期约束（`docker/compile_python.py`）：

- 入口脚本已编译成扩展模块，`python -m` 不能运行扩展模块，因此容器 `ENTRYPOINT` / `CMD` 与 `docker/start_store.py` 都用 `python -c "import ... as m; m.main()"` 拉起。
- Cython 版本在 `Dockerfile` 里钉死（`ARG CYTHON_VERSION=3.1.6`）。**3.3.0 有回归**：在 `backend/observability/global_log.py` 的 `for key, item in (value or {}).items()` 上类型推断崩溃，导致构建失败。升级该 ARG 前请先用两个 target 各构建一次验证。
- Cython 并行 `cythonize` 偶发崩溃，脚本默认并行、失败自动回退单进程重试。
- 需要 `gcc` + `libc6-dev` + `cython` / `setuptools`，只在构建阶段安装，不进运行镜像。原生扩展按平台编译，所以 CI 不再用 QEMU 模拟：`amd64` / `arm64` 各跑在原生 runner 上按 digest 推送，再由 `merge` job 合并 manifest list（见 `.github/workflows/docker.yml`）。

生产清单与反代示例见 [deploy/PRODUCTION.md](deploy/PRODUCTION.md)、[deploy/Caddyfile.example](deploy/Caddyfile.example)、[deploy/nginx.conf.example](deploy/nginx.conf.example)。

### 快速启动

```bash
cp .env.example .env
# 多数部署不用改；生产填 APP_BASE_URL / STORE_BASE_URL / *_TRUSTED_PROXIES / *_COOKIE_SECURE
# 管理员账号首次部署时在浏览器打开 :18082/setup 创建，不走环境变量

docker compose pull
docker compose up -d

# 或本地构建（Python 编译成 .so，需要 gcc 与几分钟编译时间）
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

容器启动后：**先 `docker logs homeos-3d` 取首次设置的引导密钥**（容器内 `/data/setup-token`），再访问 `http://<主机>:18081/setup` 填入。仅桥接网络下，从宿主机访问也会被当成远程来源（对端是 `172.17.0.1` 这类网关地址），因此这一步不能省。

商店默认映射 **18082**，主应用默认 `APP_LICENSE_SERVER_URL=http://homeos-3d-store:18082`（可在 `.env` 覆盖）。首次部署还需要在其中**任一**容器里创建管理员账号：访问 `http://<主机>:18082/setup`，用启动日志里的引导口令（或容器内 `data/setup-token`）填入。

启动顺序与密钥：

1. `homeos-3d-store`：生成或复用授权私钥（`/data/license-keys`），同步公钥到共享卷 `/data/keys`
2. `homeos-3d`：等待共享公钥就绪后，再启动 uvicorn
3. `container_entrypoint.py`：root 校正目录属主后降权为 `homeos` 用户

容器内默认路径：

| 用途 | 服务 | 路径 |
| --- | --- | --- |
| 主应用数据 | `homeos-3d` | `/data` |
| 商店数据 | `homeos-3d-store` | `/data` |
| 授权私钥 | `homeos-3d-store` | `/data/license-keys`（独立卷） |
| 授权公钥镜像 | 两者共享 | `/data/keys`（商店写入，主应用只读挂载） |
| 首次设置引导密钥 | `homeos-3d` | `/data/setup-token`（初始化成功后自动删除） |
| HA / 中控 / 授权凭据密钥 | `homeos-3d` | `/run/secrets/*.key` |

健康检查：主应用 `/health/ready`，商店 `/healthz`。

反向代理请转发 WebSocket（`/api/v1/ws/runtime`）以及 `/api/hls/`、`/api/camera_proxy/` 等媒体路径。站点走 HTTPS 时设置 `APP_COOKIE_SECURE=true` / `STORE_COOKIE_SECURE=true`，并配置 `APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES`。

升级时不要清空数据卷（`homeos-3d-data` / `homeos-3d-store-data` / `homeos-3d-license-keys` / `homeos-3d-client-keys`）。

### GitHub Actions

[`.github/workflows/docker.yml`](.github/workflows/docker.yml) **仅手动触发**，多架构构建推送 GHCR。

可选远端部署：在仓库 Secrets 配置 `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` / `DEPLOY_PATH`（可选 `DEPLOY_PORT`），然后在 Actions 里手动运行 **Docker** workflow 并勾选「构建推送后 SSH 拉取并重启远端 compose」。远端目录需已放好本仓库的 `docker-compose.yml`（可用 `HOMEOS_IMAGE` / `HOMEOS_STORE_IMAGE` 覆盖镜像名）。

从运行中的主应用容器导出应用目录：

```bash
docker exec homeos-3d tar -czf /tmp/app.tar.gz -C /app .
docker cp homeos-3d:/tmp/app.tar.gz ~/Desktop/
docker exec homeos-3d rm /tmp/app.tar.gz
```

## 开发注意

- 静态资源缓存标记统一为 `?v=YYYYMMDDHHMMSS`（14 位本地时间，例如 `?v=20260920104554`），不要再拼接 feature-label 长串。改 JS / CSS / HTML 后请跑 `node tools/bump_static_cache_versions.mjs` 全站同戳更新；同一次改动的资源务必用同一个时间戳，`home.js` 与 `renderer/core/renderer.js` 必须使用同一条 `renderer/core/registry.js?v=`，否则会出现两份控件注册表。全站只许存在一个戳（`README` 与历史文档里的示例除外）—— 这条现在只能靠人工核对。
- 前端 JS / CSS / HTML 约定 `printWidth=100`（HTML 为 120）。`frontend/static/vendor/` 不参与格式化。
- 不要改 `frontend/static/vendor/` 下的 three.js、hls.js、OrbitControls 等第三方文件。
- 界面中文文案保持原词；缓存戳改动请用 `tools/bump_static_cache_versions.mjs`。
- 静态资源按功能域分区：`app.css` 留在挂载根，其余分入 `bridge/`、`editor/`、`renderer/`、`display/`、`auth/`、`shared/`、`logging/`、`assets/`，以及原有的 `utils/`、`templates/`、`component-thumbnails/`、`audio/`、`vendor/`；`3d-studio/` 内部再按 `studio/`、`plan/`、`reflection/`、`materials/`、`loaders/`、`export/` 分组（`models/` 是模型素材，不是代码目录）。移动文件后请人工核对引用与后端路径清单（没有打包器，路径写错只在浏览器里变成 404）。
- `migrations/env.py` 必须从 `backend` 导入 `database` 和 `models`（`from backend.core.database import Base`），不要写成相对导入，否则会重复注册表。
- 3D 交互舞台脚本由 `/api/v1/modules/interaction3d/{filename:path}` 下发（路径含功能域子目录，如 `core/runtime.js`），需要已登录或已配对，且当前授权允许编辑器或 `module.3d_interaction`。
- 商店的样式只有一层设计系统：`theme.css`（令牌 + 组件）必须排在任何页面样式表之前，令牌值与 `frontend/static/app.css` 对齐。详见 [store/README.md](store/README.md) 的「界面主题」。
- 改动商店授权端点吊销响应时，须保留结构化 `code` / `revoked` 字段（客户端只认这些，不再匹配 detail 文案）。
- Docker 联调改业务代码后需要重新 `docker compose … --build`；镜像内是混淆 / 去源码产物，不能挂载源码热重载。

## 开发工具

改 JS / CSS / HTML 后统一 bump 静态资源缓存戳：

```bash
node tools/bump_static_cache_versions.mjs
```

可选参数：`--dry-run` 只列出会改哪些文件与处数（不写盘）、`--version=YYYYMMDDHHMMSS` 指定戳而不取当前本地时间。

**结构改动没有自动校验**（原先的 `check_structure_refs.mjs` 已移除）。前端没有打包器，路径写错
只在浏览器里变成 404，所以这类改动必须人工过一遍：`/static/...` 引用、前端相对 ESM 导入、
`backend/main.py` 的 `public_static_files`、interaction3d 资源白名单与 `frontend/modules/runtime`
的对应、`/api/v1/modules/interaction3d/<path>` 资源 URL、`/store-static/...` 引用、CSS 里的相对
`url(...)`、后端 `frontend_dir / …` 拼接链、静态资源缓存戳、注释里写到的文件路径、
`backend/config.py` 的仓库根推导、`Dockerfile` 里的仓库相对路径。

**前端结构 / 卫生护栏已全部移除**（原先的 `check_frontend_hygiene.mjs` / `check_studio_palette.mjs` /
`check_registry_split.mjs` / `check_esm_exports.mjs` / `check_scene_sync.mjs` / `check_entry_pages.mjs`
六道守卫与本目录的场景分发工具 `sync_scene_assets.mjs` 一起删去）。它们把关的都是**不报错、只静默
失效**的那一类问题，所以下面这些不变量现在全部落回人工 review：

- **死类名 / 重复规则**：删一条 CSS 规则前先 grep 类名；跨文件同名规则、重复 `@keyframes`、
  与令牌逐字节同值的 hex 都要人工看。
- **3D 工作室素材卡**（`3d-studio/studio/studio-asset-palette.js`）：渲染结果必须与拆分前的 HTML
  逐字一致（缩进、属性顺序、`i`/`span`/`small` 顺序都算数），改完请人工比对结构与字段。
- **控件注册表分片**（`renderer/core/registry.js`）：注册是 import 副作用，漏引入一个
  `registry/components/<类型>.js` 不会报错、不会 404，只会在页面上变成「控件尚未实现」。
- **design/scene 分发副本**：`design/scene/` 下的 `scene.css` / `panel.css` / `page.css` /
  `fonts.css` / `appearance.js` / `scene-depth.js` / `scene.html` 各有三份分发副本
  （`frontend/static/auth/scene/`、`store/static/scene/`、`store/templates/_scene.html`），改动必须
  手工同步到每一份；商店 `theme.css` 的 `--hb-*` 与设计源 `--hos-*` 令牌要逐个相等；两侧 HTML
  转义集（`utils/html-escape.js` 与 `store/static/htmlsafe.js`）必须逐字节相同。

**五个入口页**（`/setup` → `/login` → `/license` → `/pair` → 进中控）的轨道读数不在 HTML 里，
由 `backend/http/commissioning.py` 按**访问者**填：同一条 `/pair` 对管理员（带着会话）与一台
墙面板（不走登录、键盘都没有）读数是两种，写死在页面上必然对其中一种撒谎。改「页面 ↔ 读数分支 ↔
CSS 状态名」任一处都要人工核对三者是否还互相对得上 —— 走散不会报错，只会让某一步安静地不亮、
或者亮错一格。

Python 侧的死代码门禁由仓库根的 `ruff.toml` 单独钉住（只挑全仓已达标的那几条，边界写在该文件注释里）：

```bash
ruff check .                                      # 未使用 import / 重复定义 / 未使用局部变量 / 未定义名字 / 注释掉的代码
```

**两条工作流现在只跑 `ruff check .`**（原先的七道 Node 守卫已随本轮清理移除）：

- `.github/workflows/guards.yml` —— `push` / `pull_request` 触发，日常改动即校验。
- `.github/workflows/docker.yml` 的 `guards` job —— 挂在镜像 `build` 之前。该工作流只有
  `workflow_dispatch`（仓库有意不在 push 上自动构建、也不向 GHCR 推未打算发布的镜像），
  所以它是出包前那道。

两份工作流共用同一份清单，改时**两份都要改**，否则会出现「CI 绿、出包红」这种最难查的错配。

**HTML 转义**由 `frontend/static/utils/html-escape.js`（应用侧）与 `store/static/htmlsafe.js`
（商店侧）各一份提供 —— 商店是独立构建上下文（`store/app.py` 只挂 `/store-static` 与 `/fonts`，
拿不到 `/static`），它 import 不到应用侧那份，只能各留一份。转义集不一致**不会报错**，只会让
同一个值在两个页面里显示成不同的东西（少转一个 `"` 就是属性提前闭合，现场看着只是「布局怪」），
原先由 `check_scene_sync.mjs` 比对两份映射表，现在必须人工同步 —— 不一致不会报错，只会让同一个值
在两个页面里显示成不同的东西（少转一个 `"` 就是属性提前闭合，现场看着只是「布局怪」）。

**ESM 导出的两类静默故障**（原先由 `check_esm_exports.mjs` 静态钉住，现在只能人工核对）：

- **分片自己漏写 `export`**：导入它的模块整页抛 SyntaxError，而报错信息指向**导入方**
  （`air-conditioner.js:26`），很容易被误判成缓存没刷或路径写错。
- **导出方把「只在 `export {}` 里出现的名字」当本地变量读**：`export { clampNumber as clamp } from
  "utils/numbers.js"` 只把 `clamp` 挂上对外接口、**不在本模块作用域建绑定**，于是同文件里那些
  `clamp(...)` 成了运行期 ReferenceError，栈顶指向导出方自己的函数（`geometry.js` 的
  `adaptiveDeviceLightBudget`）—— 现场看着像几何/预算算法坏了，其实是导出写法。换成
  `import { clampNumber } …; export { clampNumber as clamp };` 同样不建绑定，长得还更像「修复」，
  两种写法都要靠人认出来。
- 另有一处这两类写法都看不见：运行时树通往 `/static/` 的共享桥
  `modules/runtime/core/static-helpers.js`。桥写的是 `const { a, b } = await (… ? import(相对路径)
  : import("/static/…"))`，既不是 `import … from` 也不是 `export const { … }`，所以桥里漏一个
  `export`、拼错一个目标路径都不会有任何静态报错，只有浏览器会炸 —— 加名字到桥里后请人工核对：
  解构出的每个名字都得是两个分支目标的真实导出、两个分支必须指向同一个文件、末尾 `export { … }`
  必须与解构出的名字集合逐字相同（桥自己的「登记表」纪律）。

`utils/state-entry.js` 的契约（**已无自动断言**）：状态文本归一
（`String(state).trim().toLowerCase()`）曾散落二十余处，如今只此一份，各域只负责
「哪些词算活动」。要小心 `stateTextOf` 里那个 `?? ""`：改成 `|| ""` 之后 `state: 0` 与
`state: ""` 会一起塌成空串，而 `0` / `1` 正是 HA 开关量的常见写法 —— 现场表现只是「离线设备显示成
未知」，不报错、不 404。同一处还要保证 `normalizedTextOf` 真被复用，而不是在 `stateTextOf` 里又手写
一遍归一。

后端与商店**目前没有自动冒烟**：`smoke_backend.py`（导入 `backend.main` / `store.app` + 路由清单双向
比对 + 关键路径状态码）已在清理中移除，连同它的快照 `tools/routes.snapshot.txt`。移除的代价要说清楚 ——
它是**唯一的路由清单校验**，此后增删路由没有任何自动信号，改动路由请人工核对 OpenAPI 与调用方。

几处口径值得记住：

- **CSS 的相对 `url(...)` 按 URL 而非磁盘目录解析**：`/store-static/font.min.css` 里的 `url(../fonts/font.woff2)` 实际请求 `/fonts/font.woff2`，由 `store/app.py` 的 `/fonts` 根挂载提供。这条检查因此同时钉住字体文件与那个挂载。
- **有若干路径是在 Python 里拼出来的**，不在 `public_static_files` 清单里：`/static` 挂载本身、两个 apple-touch-icon 路由、`static/vendor/mdi` 图标根。`frontend_dir / …` 链逐段验证字面前缀存在。
- **注释里写到的文件路径按「可 grep 到」判定**（容忍省略前缀，如 `interaction3d/config.py`），只报 basename 仍存在却已不成后缀的失效引用 —— 因此历史叙述里对已删文件的**故意**提及不会被误报。
- **缓存戳检查钉三处**：模块 import、HTML 的 `<script src>` / `<link href>`、商店模板里非压缩的 `/store-static/…` 引用，外加「全站只许有一个戳」。

`/static/renderer|editor|bridge|utils/**` 不是 `no-store`（只有页面、`/api/v1/`、`/static/display/display.js|css` 与 `/static/3d-studio/` 是），所以对这些模块来说 `?v=` 是唯一的缓存失效手段：漏戳会让改动在浏览器里迟迟不生效，而「同模块一处带戳一处不带」会让浏览器当成两个模块、各留一份模块级状态。

## 更新日志

更早的版本记录已随文档精简移除；项目按**首个发布版本**维护，不再保留历史版本的数据迁移说明。

### v0.6.3

**质量清理（这一版的主体）**

- 零引用代码清零：无人引用的具名导出 168 处（含 `renderer.js` / `registry.js` 两个 barrel 中转的 89 处）、死函数 3 处、未使用导入 1 处；各树里只在本文件内使用的函数摘掉 `export`。护栏随之补上 allow-list 说明，避免为了「保持 API 面」把无人用的名字再堆回来。
- 删除调试与测试残留：`studio-app.js` 三块自检钩子（245 行）、5 个无门禁调试参数与配套的诊断 / HUD 子系统（583 行）、4 个 smoke 脚本与孤儿 `tools/routes.snapshot.txt`、只写不读的帧统计钩子。
- 重复实现逐族收敛到单一实现：`clamp` / `hexToRgb`（`frontend/static/utils/`）、数值换算（`utils/numbers.js`）、复合模型键（`modules/runtime/core/scene-model-key.js`）、`prefers-reduced-motion`（`core/motion-preference.js`）、401 / 403 处置（`utils/api-request.js`）、指针捕获（`utils/pointer-capture.js`）。HTML 转义此前应用侧**一份都没有** —— 83 处 `innerHTML` 全靠人工判断插值来源，唯一实现是 `studio-asset-palette.js` 里的私有副本；现在归入 `utils/html-escape.js`，转义集与商店侧 `htmlsafe.js` 由 `check_scene_sync.mjs` 逐字节比对（商店是另一个构建上下文、`/static` 根本挂不到，两边必须各留一份，但语义不能分叉：同一个值在两个页面显示成不同的东西比缺转义更难发现）。
- 静默失败不再无从判断：指针捕获的 41 处调用此前分成「裸调 / `try{}catch{}` / `?.`」三种写法，且 12 个 `catch` 是空的 —— 现在收口成 `utils/pointer-capture.js`，把容忍的失败写在文件头；其余 JS 空 `catch`、`.catch(() => {})` 与 Python `except: pass` 逐处补上「为什么可以吞」。顺带修掉 `display.js` 一处被自动改写弄花的单飞表达式（多余括号 + 两条语句挤在一行）。
- `window.__haBridge*` 全局改为 ESM 显式导入导出：跨树通信不再经全局对象，删掉一半时能由 import 图直接发现，而不是等到运行时才报 undefined。

**3D 运行时修复**

- `climate.turn_on` 的三层契约（服务名 / 允许列表 / 调用点）此前互相对不上，开空调会落进静默失败。
- 释放路径加固：`pagehide` 关键释放前置兜错、两个 `window` 监听回收、`handleHostMessage` / `televisionPanel` / `nasPanel` 的释放守卫。
- `didReplaceScene` 置位时机改到替换成功之后，回滚失败不再吞掉原始错误；`vacuum-map-editor` 的 `resizeObserver` TDZ 隐患。

**安全**

- 未鉴权入口补请求体上限：主应用与商店各一层（默认 1 MiB，流式请求放行）。此前未鉴权端点可以先让进程把请求体读进内存。
- 商店首次初始化的「本机直连放行」补 `Host` 校验：只认本机地址还不够，伪造 `Host` 就能命中。
- **匿名静态白名单闭环**：`/static/` 下未列名的文件一律 401，而 `auth/license.js`（未登录也要加载）所 import 的 `utils/api-request.js` 漏列 —— 未登录打开 `/license` 时那个 import 被挡下，ESM 图整页不执行：HTML 与样式都在，页面只是永远不活。已补齐（当时新增的护栏随本版回归网收缩一并移除）。

**回归网：短暂恢复后整体移除**

- 一度新增 `.github/workflows/guards.yml`（push / PR 触发）与 `ruff.toml`；`check_structure_refs.mjs` 加三条「单例所有权」检查：`LICENSE_RESTRICTED` 字面量、`setPointerCapture` / `releasePointerCapture`、匿名模块图闭合。每条都用「把修好的东西弄坏一次、确认断言变红」验证过。
- 随后这些守卫又被整体移除：`check_structure_refs.mjs`、`check_esm_exports.mjs`、`check_registry_split.mjs`、`check_studio_palette.mjs`、`check_frontend_hygiene.mjs`、`check_scene_sync.mjs`、`check_entry_pages.mjs`，以及场景分发工具 `tools/sync_scene_assets.mjs`（`tools/bump_static_cache_versions.mjs` 保留）。`guards.yml` 与 `docker.yml` 的清单同步收缩为 `ruff check .` 一道，两份仍共用，改时两份都要改。
- **移除的代价**：这些脚本把关的都是「不报错、只静默失效」的那类问题 —— 结构引用能否解析、ESM 具名导出、控件注册表分片可达、design/scene 分发副本与令牌一致、两侧 HTML 转义集逐字节相同、入口页门链与状态名对齐。它们不再是自动的，全部落回人工 review；README「开发工具」一节改为逐条列出要人工核对的不变量。
- 运行时报错提示里指向已删脚本的指引（`backend/http/page_shell.py`、`store/api/page_shell.py` 的「请先运行 node tools/sync_scene_assets.mjs」）改为「请从 design/scene/scene.html 同步分发副本」—— 否则排障时会被指去跑一个并不存在的命令；另同步清理约 40 处指向已删脚本的注释与文档引用，并移除 `.cursor/rules/temp-dir-cleanup.mdc`。
- 口径仍然明确：**没有 e2e / 冒烟 / 探针**。护栏只覆盖静态可判定的事 —— 引用能否解析、清单与树是否一致、某个策略是否只有一个主人；行为正确性依旧要靠人工走关键路径。

**文档**

- README「开发工具」一节重写：写清七道 Node 守卫各自把关什么；此前列为「故意没纳入」的两条（前端卫生 `--strict`、场景同步）已转入清单。也写清运行时冒烟的**移除代价** —— `smoke_backend.py` 连同它的路由快照一起删了，**后端与商店目前没有自动冒烟**，`check_registry_split.mjs` 是分片可达性唯一的一道证明。
- `docker.yml` 的守卫清单同步为「七道 Node 守卫 + ruff」，并写明「改动即校验」由 push / PR 触发的 `guards.yml` 承担、本工作流只在手动出包时跑；README 与注释里对已删脚本的引用一并修正。

**数据库**

- 无结构变更、无迁移，升级只需替换镜像；请保留全部数据卷 / 数据目录（`homeos-3d-data` / `homeos-3d-store-data` / `homeos-3d-license-keys` / `homeos-3d-client-keys`）。

### v0.6.2

**授权恢复与重试**

- 新增 `POST /api/v1/license/retry`：立即发起一轮授权恢复并清掉端点黑名单 —— 「重新连接」不必再等下一个心跳周期，也不会被上一轮失败留下的冷却直接挡回。管理员会话拿完整状态，中控设备只拿脱敏摘要（`availability()` 的白名单字段），展示端既不需要、也不该看到授权标识与凭证。
- 新增匿名可读的 `GET /api/v1/license/availability`，并把连接状态页挂到已有的展示入口上：`allows('display')` 为假时 `/pair` 与 `/display/*` 直接渲染 `frontend/license-recovery.html`，而不是落 403 错误页。不新增路由是有意的 —— 设备刷新后仍停在自己的地址上，授权一恢复就能进画面，也避免「授权不可用反而要先去登录」这种死路。页面打开即自检、每 5 秒复查、`online` 事件立刻复查，网络恢复后无需人工操作；已有项目与设备配对不受影响。
- 授权失败分级处置：区分「等一会儿再来」（网络抖动 / 5xx）与「再点也没用」（要求人工重新激活、刚点过被节流），把结论（`canRetry` / `nextRetryAt` / `retryAttempt` / `retrying`）交给前端决定是否继续显示重试按钮，而不是让前端从状态码猜。端点拉黑时长与重试节奏对齐为 120 秒：黑名单若比重试节奏还长，每一轮自动重试都会整轮撞在冷却里。
- 授权租约凭证写入加跨进程文件锁（`backend/license/process_lock.py`）：同一数据目录只允许一个「凭证写入者」，第二个实例启动即失败并说明原因。用文件锁而不是「建锁文件 + 退出删除」，是因为内核会在进程结束（含被 kill）时自动释放，不存在要人来清理的陈旧锁；取非阻塞语义是有意的 —— 抢不到锁意味着确实已有实例在跑，正确行为是立刻失败而不是排队等一个永远不会结束的对方。
- 编辑器授权卡片新增「重新连接授权后台」：与授权页、恢复页共用同一份状态文案（`frontend/static/auth/license-recovery.js`），三处不再各说各话；完整状态行仍只显示一次错误原文，重试倒计时另起一行，两者不互相覆盖。

**修复**

- 户型自动导图底图分辨率改为「保留控件宽高比、面积对齐画布」换算（`frontend/static/editor/floorplan-auto-diagram-layout.js`）：此前直接按画布尺寸导出，底图与预览不同比，放进控件框会被拉伸 / 留边，表现为「导图与预览位置对不上」。面积对齐保证渲染像素量与画布同级，宽高比一致保证不产生偏移。
- 导图生成完成改为可关闭的浮层：它铺满整个编辑区，所以「点得掉」是硬要求 —— 完成按钮、关闭按钮、背景点击、Esc 四个出口都在，并在 `pagehide` 时兜底移除（浮层挂在 `body` 上，残留监听会一直引用旧 DOM）。置换失败改为恢复预览图元并提示「请重试」，不再静默留下一个已隐藏的图元。
- 展示端授权受限（403 `LICENSE_RESTRICTED`）改为刷新当前页并把原因交给启动层：墙面屏前通常没人能填激活码，让后端门禁重新判定、把页面换成连接状态页才是可自愈的路径；启动失败时 `online` 事件自动重试一次。

**数据库**

- 无结构变更、无迁移，升级只需替换镜像；请保留全部数据卷 / 数据目录（`homeos-3d-data` / `homeos-3d-store-data` / `homeos-3d-license-keys` / `homeos-3d-client-keys`）。

### v0.6.1

**安全与质量审计（P1–P12）**

- 对主应用与授权商店做了一次全量深度审计（含三路并行探索与逐行复核，审计台账为时间点记录、不随仓库分发），发现项按「项目 → 严重度」编号并逐批修复，各批都带「把修好的东西弄坏一次确认断言会变红」的牙齿验证。修复面覆盖商店 `S1–S58`、主应用后端 `B1–B66`、前端 `W1–W30` 与代码质量专项。
- **商店（S1–S58）**：首次初始化守卫（引导密钥 + 本机直连放行 + 原子写入）、验证码回显只对本机、数据库依赖改为 `scope="function"`（下单与支付宝通知在响应送出前完成提交）、心跳校验 `instanceId`、支付宝回跳 `force` 只对持订单凭证者生效、邀请积分整数厘、配置严格校验、唯一索引去重（存量库合并重复行）、收银台 URL 改短时票据、人工补记与营收口径、入账异常计数与支付巡检状态上报。
- **主应用后端（B1–B66）**：媒体代理按实体归属校验（跨项目 403）、转发头默认只信回环、凭据解析收敛到 `backend/security/access.py`、阻塞端点移出事件循环（导出 ZIP / 素材落盘 / 授权服务查库）、上传与导出改为流式落盘、先查后写的并发冲突落 409/422、项目名唯一（迁移 `0002`）与展示地址别名（迁移 `0003`）、素材总量配额与孤儿回收、全局日志写入线程化、授权轮询配额按端点分桶 + 429 退避且不降级状态、网关时钟容差与租约序号自愈。
- **前端（W1–W30）**：接口超时预算只留一个主人（`utils/api-fetch.js`）、按钮复位一律进 `finally`、展示页横幅按槽位分语义、WS 断开给可见提示、未激活页面（`pair` / `setup` / `license`）的出口、编辑器启动分片失败聚合、草稿快照只留要救的东西、乐观开关仅在真回滚时上报、ESC 逐层收口、挂载失败带原因、保存冲突留出口、弹窗模态语义与焦点、共享模块单份实例、缓存上限只认常量。
- **代码质量（P9–P12）**：删除零引用符号与模块级死导出，重复实现收敛到 `utils/`（`numbers` / `colors` / `entities` / `datetime` / `icon-url` / `state-entry` / `api-error` / `device-profiles` 等）。
- **失效声明**：上述自动化闸门（smoke / e2e / 各探针 / CI workflow / `ruff.toml` / `eslint.config.mjs`）已在下方「测试与死代码清理」中整体移除。修复结论仍然成立、口径仍然有效，但**改动相关代码时需人工对照**，不要再以为背后还有回归网。（v0.6.3 曾按静态可判定的部分恢复护栏，同一版又整体移除，见该版本的「回归网」一节 —— e2e / 冒烟 / 探针始终没有回来。）

**数据库**

- 新增迁移 `0002_project_name_unique`：项目名同时是展示地址 `/display/{名称}` 的路径段，此前只在应用层「先查后写」查重，并发创建会产生同名行；现加唯一索引，并对历史重名行按 `(created_at, id)` 做确定性改名（保留最早那一行）。迁移只向前：`downgrade` 只删索引、不还原名字。
- 新增迁移 `0003_project_path_aliases`：项目改名后，已配对墙面平板手里的旧展示地址不再永久 404 —— 旧名称 → 项目的别名表让旧地址 303 跳到当前地址。只建表、不回填：过去发生的改名本就没有被记录。

**新增**

- 编辑器记住「上次打开的仪表盘」（`sessionStorage`，随标签页存活；记忆项已被删除时回落到列表第一项）。
- 商店新增首次部署初始化页 `/setup`（引导密钥 + 本机直连放行），管理员一律在浏览器创建；后台新增修改密码与右上角全局操作栏；商品目录与站点配置在启动时幂等补齐。
- 摄像头 HLS 初始化失败时补一条全局日志（并在 `?debug=1` 下给控制台告警）：此前会静默降级到 MJPEG，用户只看到「能播了」，无从知道 HLS 在哪些设备上根本起不来。
- 3D 导出档位的悬停提示补上摘要（分辨率 · 楼层 · 投影）：档位名由用户自起，名字随意时只有这些信息能说明它导的是什么。

**修复**

- 全站静态资源缓存戳统一（`?v=` 同戳），并补齐此前遗漏的 19 处（含两组「一处带戳一处不带」，会让浏览器把同一模块实例化两份、各留一份模块级状态）。

**目录结构分包**（路径明细见上方「仓库结构」）

- `backend/` 扁平根模块按主题分包：`core/`、`security/`、`http/`、`observability/`，`global_popups.py` 并入 `panel/`。`main.py` / `config.py` 留在根部：前者是启动契约与 `Dockerfile` 构建期断言，后者的 `PROJECT_ROOT = parents[1]` 决定仓库根解析。
- `store/` 同样分包：`core/`、`security/`、`commerce/`、`ops/`。`app.py` / `run.py` / `config.py` 留在根部（`python -m store.run`、`store.app:create_app` 与 `STORE_ROOT = parents[0]`）。
- `frontend/modules/runtime` 按功能域细分，下发路由由 `/api/v1/modules/interaction3d/{filename}` 改为 `{filename:path}`（白名单键改成含子目录的相对路径）；`frontend/static/3d-studio`、`static/assets`、`static/renderer`、`static/editor` 同步按语义细分。
- `tools/check_structure_refs.mjs` 增加多项检查（见「开发工具」），并修掉 38 处注释里的过期路径、补齐 19 处缺失的静态资源缓存戳。

**测试与死代码清理**

- 不再内置任何自动化测试 / 探针：删除 `.github/workflows/ci.yml`、`docker-compose.smoke.yml`、`backend/tools/*`（冒烟、前端探针、API 错误探针）与 `store/tools/{smoke,e2e,*probe}`；`docker.yml` 去掉 `smoke` job，只保留多架构构建与可选远端部署。**仓库此后没有自动化回归网，改动请人工走关键路径。**
- 删除运维脚本 `store/tools/{seed,gen_keys,migrate_points}.py`：密钥准备改由 `docker/license_keys.py`（`start.py` 与容器启动共用）完成，商品目录 / 站点配置由 `store/core/bootstrap.py` 启动时幂等补齐，积分迁移在启动时自动执行。同步删除 `ruff.toml`、`eslint.config.mjs`、根 `package.json` / `package-lock.json`（`docker/package*.json` 保留）。`tools/bump_static_cache_versions.mjs` **保留**（只用 Node 内置模块，不依赖被删的根 `package.json`）。
- 清理死代码与重复实现，新增 `backend/core/canonical_json.py`、`backend/http/http_cache.py`、`frontend/static/utils/{icon-url,datetime,interaction-pages}.js` 收敛此前逐处手写的规范 JSON、Cache-Control、图标 URL、时间格式与交互页面清单。
- 资金路径上的重复释放收敛为 `store/commerce/fulfill.py` 的 `close_pending_order()`（CAS 抢 `pending` 后推进终态，「用户取消 / 后台取消 / 模拟收银台取消 / 超时过期 / 渠道对账兜底」五处共用）与同文件的 `release_order_effects()`（归还预占 + 名额）。原先这段在十余处各写一遍，抄漏一处就会让 `reserved_stock` 虚高或优惠码名额被永久占用。
- 首次管理员只剩 `/setup` 一条路径：`STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` 的预置分支（解析后从未被消费）连同 README / `.env.example` / 启动提示里的说明一并移除。
- 3D 工作室的 `dataset` 诊断属性（约 60 处写入）**保留**：它们不是残留死代码，而是浏览器里排查阴影 / 合批 / 预编译状态的唯一观测面。同一批的 `?material-test` / `?instance-test` / `?model-export` 三块自检钩子曾只要求 `?debug=1`，后续清理中已**整体删除** —— 它们是被动探针（打开页面自己跑一遍再打印结论），不构成产品能力，留着就是一条生产可达的调试旁路。
- 更新 README / store/README 与产品代码注释里对已删脚本、已删断言的全部引用。

### v0.5.6

**自托管 Docker**

- 双容器 Compose：`homeos-3d`（主应用 18081）+ `homeos-3d-store`（商店 / 授权服务器 18082），共享公钥卷、独立数据卷与授权私钥卷。
- 多目标 Dockerfile：target `app` / `store`；构建期用 Cython 把 Python 编译成原生 `.so`、用 `javascript-obfuscator` 混淆业务 JS，运行镜像不含源码（`migrations/` 除外，Alembic 需要）；GHCR 镜像 `ghcr.io/sfairy/homeos-3d` 与 `…-store`。
- 商店容器启动时生成或复用授权密钥并同步公钥；主应用等待公钥就绪后再起；首次管理员在 `/setup` 页面创建。
- 新增 `deploy/PRODUCTION.md`、Caddy / nginx 反代示例，以及 `.github/workflows/docker.yml`（多架构推送 + 可选 SSH 远端重启）。
- `.env.example` 收敛为 A/B/C/D 分区：部署常改项置顶，SMTP / 支付 / 站点文案改到 `/admin` 配置，避免双源。
- 移除已过时的 `frontend/NAMING.md` 与根目录 `COMMENTING.md`。
- 客户端「检查更新」发布记录写入 `store/ops/release_info.py`（`CURRENT_UPGRADE_NOTES`），启动时幂等补写 / 同步到 `releases` 表。

**破坏性变更**

- 授权传输协议标识与产品标识改名（`ha-bridge-license-transport-v1` → `homeos-license-transport-v1`，`PRODUCT` → `homeos`）。两者参与 HKDF / AES-GCM AAD，服务端只认新标识：**必须先升级客户端、再升级服务端**，老客户端会在解密阶段直接失败、没有降级路径。
