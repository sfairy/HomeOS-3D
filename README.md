# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控平台，当前版本 **0.5.6**（见 `VERSION`）。

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
├── backend + frontend        主应用         http://127.0.0.1:18081
└── store/                    授权商店与授权服务器  http://127.0.0.1:18082
```

自托管镜像见下方 [Docker](#docker)；一步检查清单见 [deploy/PRODUCTION.md](deploy/PRODUCTION.md)。

### 主应用

`backend/`（FastAPI）+ `frontend/`（HTML / 原生 JS）。负责仪表盘编辑、展示、中控配对、Home Assistant 连接、3D 户型工作室与 3D 交互舞台。启动时自动执行 Alembic 迁移。

### 授权商店与授权服务器（`store/`）

一个独立的 FastAPI 应用，在 **18082** 端口同时提供三件事：

1. **授权商店**：页面与 `/store/v1/`* API 对齐 `https://pay.habridge.cn/`（账号、商品、订单、优惠码、邀请、账号中心），视觉为本项目自研的暗色 + 琥珀主题。2. **授权服务器**：`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，签发 Ed25519 租约并使用 X25519 加密传输。
3. **运营后台**：`/admin` + `/store-admin/v1/`*（参考站没有公开管理台，为本项目自建）。

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
│   ├── modules/runtime/    # 3D 交互舞台与配置编辑器（经 /api/v1/modules/interaction3d 下发）
│   └── static/             # 挂载为 /static
│       ├── app.css         # 唯一全局样式表（保留在挂载根）
│       ├── bridge/         # 3D 交互编辑器桥接、场景渲染助手、封面、定义
│       ├── editor/         # 仪表盘编辑器入口与全部编辑助手
│       ├── renderer/       # 仪表盘控件运行时
│       ├── display/        # 中控展示页脚本与样式
│       ├── auth/           # 登录 / 初始化 / 配对 / 激活页脚本与样式
│       ├── shared/         # 编辑器与运行时共用（动作规则、确认框、实体域、弹窗布局）
│       ├── logging/        # 客户端日志与全局日志面板
│       ├── assets/         # 图标与 webmanifest
│       ├── utils/          # 与业务无关的纯工具
│       ├── 3d-studio/      # 户型工作室
│       ├── templates/      # 控件模板
│       └── component-thumbnails/  audio/  vendor/（three.js、hls.js、MDI）
├── store/                  # 授权商店 + 授权服务器 + 运营后台
│   ├── app.py run.py config.py models.py schemas.py serializers.py
│   ├── api/                # store.py(/store/v1) license.py(/v2) admin.py alipay.py pages.py
│   ├── licensing/          # 服务端传输加密 + 租约签发 + 三端点业务
│   ├── payments/           # base / mock / alipay（签名·下单·验签·查单）/ 统一入账
│   ├── fulfill.py referrals.py site_settings.py release_info.py mailer.py security.py
│   ├── catalog.py          # 商品类型 / 履约方式的合法取值（服务端唯一来源）
│   ├── request_security.py # 商店侧同源实现：真实来源 IP / Cookie Secure / CSRF
│   ├── net_probe.py        # 网络可达性探测（后台「站点配置」自检用）
│   ├── templates/          # store.html（前台 8 个分页）+ admin.html（后台 15 个 panel）
│   ├── static/             # theme.css（唯一设计系统）+ store.css / admin.css（页面布局）+ 字体·图标·jQuery·JS
│   ├── keys/local/         # 授权私钥（不入库）
│   └── data/               # 商店 SQLite 与商品图（不入库）
├── keys/                   # 客户端默认读取的公钥镜像（启动时由密钥准备流程自动同步）
├── migrations/             # Alembic 单条基线迁移 0001
├── image/                  # 可选的自定义内置素材目录（默认空）
├── tools/                  # check_structure_refs.mjs（引用完整性）· bump_static_cache_versions.mjs（?v=）
├── docker/                 # 容器启动（start_app / start_store）与构建期保护（strip py / obfuscate js）
├── deploy/                 # 生产清单与反代示例（Caddy / nginx）
├── docs/                   # 时间点记录（audits / releases），索引见 docs/README.md
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

其中 `watchfiles` 只服务本地热重载：`start.py` 会给商店设 `STORE_RELOAD=1`，`store/run.py` 据此以 uvicorn reload 模式启动并监听 `store/` 目录。缺这个包时商店不会跟随 `store/api/*.py` 的改动重启，改了模块级常量（例如模拟收银台的内联 HTML 与静态资源版本戳）就必须手动重启才能生效。

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

首次启动**不需要任何准备命令**：`start.py` 会先生在 `store/keys/local/` 生成缺失的授权密钥并把公钥镜像到仓库根 `keys/`（客户端信任锚），商店启动时再幂等补齐商品目录与站点配置。

> 公钥镜像 `keys/` 与 `store/keys/local/` 必须**逐字节一致**：客户端按 PEM 文件字节校验 sha256。镜像由启动时的密钥准备流程自动同步，不要手工只覆盖其中一处，否则激活会因指纹不匹配而失败。

主应用打开 <http://127.0.0.1:18081/setup>，商店打开 <http://127.0.0.1:18082/>。

数据库结构由单条基线迁移在主应用启动时自动建立。需要手工执行时：

```bash
APP_DATA_DIR=./data PYTHONPATH=. alembic upgrade head
```

## 首次使用

1. 打开 `/setup`，创建管理员（用户名 3–64 个字符，密码至少 8 位）。
   从**本机**（`localhost` / `127.0.0.1`）打开时直接填账号密码即可；从其它地址打开时页面会多出「引导密钥」一栏，需要填服务启动日志里打印的那一串 —— 详见下方「首次设置窗口」。
2. 打开 <http://127.0.0.1:18082/>，注册商店账号（本地联调默认 `STORE_MAIL_MODE=echo`，验证码直接回显），选择商品并用模拟收银台完成支付（`start.py` 已自动带上 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`），账号中心会发放激活码。
3. 回到主应用登录后进入 `/license`，用「激活码 + 购买邮箱」激活。未激活时编辑器会跳到 `/license`，展示页和受保护静态资源返回 401 / 403。
4. 在编辑器里配置 Home Assistant 的地址和长期访问令牌，然后创建空白仪表盘。
5. 使用 3D 交互：先在 `/3d-studio` 保存户型，再在编辑器添加「3D 交互」控件并载入户型快照，绑定 `light.*` / `switch.*` 等实体后即可在舞台里控制。
6. 墙面中控：在编辑器生成 6 位配对码，设备打开 `/pair` 完成配对。

未初始化时任意页面都会跳到 `/setup`。

### 首次设置窗口

`/api/v1/setup/admin` 不能要求登录（此时还没有账号），所以它必须自己把「谁有资格创建
管理员」这件事管住，否则**任何能连上这台机器的人都能抢先把管理员建掉**（并当场拿到
会话），随后就能写 Home Assistant 连接、配对中控、导出日志。当前规则：

- **本机直连放行**：TCP 对端是 `127.0.0.1` / `::1`，且请求不带任何转发头（`X-Forwarded-`*、
  `Forwarded`）。带转发头说明前面还有代理，对端地址不再代表真实来源，此时不再按本机放行。
- **其它来源必须带引导密钥**：`APP_SETUP_TOKEN` 的值，或者首次启动时自动生成的那一串。
  生成的密钥写在 `$APP_DATA_DIR/setup-token`（权限 `0600`），并打印到启动日志/容器日志：

  ```text
  HomeOS 尚未初始化（库中没有任何管理员账号），完成首次设置后本窗口自动关闭。
    密钥来源: /data/setup-token
    密钥内容: 1Bv...（32 字节随机串）
  ```

  取用方式：`docker logs <容器>`，或直接 `cat $APP_DATA_DIR/setup-token`。
  **自动生成的那份会另留一个 `setup-token.generated`**（同目录、`0600`）：它记着这枚密钥的
  指纹，用来在重启时区分「上次没走完的窗口留下的」与「运维自己预置在这里的恢复手段」——
  只有前者会被清理。自己往 `setup-token` 放一枚密钥时**不要**放这个文件，那份就会被当作
  运维预置而一直保留。
- 失败会计入限流（与登录共用限流器，同一来源连续失败会被短暂拒绝），成功与失败都写审计日志。
- 初始化成功后密钥立即作废（自动生成的那份文件会被删除），窗口关闭。

重置账号（删除 `data/admin-account.json` 后重启）会重新打开这个窗口，也会重新生成一份密钥。

忘记主应用管理员账号或密码：停掉进程，删除 `data/admin-account.json` 再启动，系统回到设置页。户型、HA 配置、授权和中控配对不会被删。

## 安全基线

下面这些是代码里已经生效的默认行为，不需要额外配置；只有反向代理部署才需要补一对变量。
两条硬边界先说清楚：**授权校验不能通过环境变量关闭**，**首次设置的窗口不会长期敞开**。

### 请求来源：谁在代理、能不能信转发头

限流、审计与首次设置的放行都建立在「请求到底来自哪个 IP」上，而 `X-Forwarded-For`
是客户端可以自己写的。判定规则（`backend/security/http_security.py` 与 `store/request_security.py`
是同一套逻辑的两份实现，两个服务独立部署、刻意不互相 import）：

- **默认不信任任何转发头**（`APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` 留空）：
  一律按 TCP 对端地址统计。此时伪造 `X-Forwarded-For` 换不来新的限流桶。
- **配了可信代理**（逗号分隔的 IP / CIDR）后，仍只在这条连接确实来自代理时，才从转发链里
  取真实来源。代理没传转发头时地址是共享的，按 IP 那一档限流会主动让位 —— 否则任何一个人
  失败几次就会锁掉所有人。
- **还有一层在 uvicorn 上**：`--forwarded-allow-ips` 决定 uvicorn 会不会拿 `X-Forwarded-For`
  改写对端地址，而上面两条规则的前提正是「对端不可伪造」。容器启动器与 Compose 的默认值是
  `127.0.0.1,::1`（只信回环）；万一配成 `*`，容器启动与主应用启动都会告警，因为这个取值会让
  登录限流、配对码枚举预算与审计来源 IP 同时变成「客户端自己说了算」。前面确有反向代理时，
  把 `UVICORN_FORWARDED_ALLOW_IPS` 填成**代理自身的地址或网段**，不要用 `*`。
- 检测到转发头却没配可信代理时，启动日志会警告一次（只记一次，避免刷屏）。

### 会话与 Cookie

| 机制 | 行为 |
| --- | --- |
| Cookie `Secure` | 按请求自动判定，任一成立即加：显式 `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` → `APP_BASE_URL` / `STORE_BASE_URL` 是 https → 可信代理转发了 `X-Forwarded-Proto: https` → 连接本身是 https。漏配开关不会让会话 Cookie 明文裸奔，纯 http 局域网也不会误加（误加会让浏览器直接丢弃 Cookie，表现为「登录后又变回未登录」） |
| 登录会话 | 滑动有效期 `APP_SESSION_MAX_AGE_SECONDS`（默认 8 小时）+ 绝对寿命 `APP_SESSION_HARD_MAX_AGE_SECONDS`（默认 30 天），后者不能被续期突破 |
| 会话列表与撤销 | `GET /api/v1/auth/sessions` 列出全部登录会话（只回令牌哈希，不回原文），`DELETE /api/v1/auth/sessions/{id}` 踢掉单个，`DELETE /api/v1/auth/sessions` 一键退出其它设备 |
| 中控令牌 | 滑动有效期 `APP_DISPLAY_TOKEN_TTL_SECONDS`（默认 180 天，活跃即续期，带 5 分钟节流避免每次请求写库）+ 可选硬上限 `APP_DISPLAY_TOKEN_HARD_TTL_SECONDS`（默认 `0` = 不设）。滑块基准是「最近一次活跃」而不是「配对时刻」，所以常年挂墙的平板不会被定期赶去重配 |
| 中控设备列表 | 附带 `expiresAt` / `expired`，后台能看到每台平板还能用到什么时候；过期设备仍然可见，管理员可手动解绑 |

### CSRF：改状态的请求必须同源

SameSite=Lax + 只收 JSON 是第一道闸，代码里另有一道显式的 Origin / Referer 校验：

- 主应用拦所有非 GET 的 `/api/*`；商店拦非 GET 的 `/store/v1/*` 与 `/store-admin/v1/*`。
- 只认「裸的 `scheme://host`」：`http://evil@本机地址/`、带路径或查询串的写法一律不算同源。
- GET / HEAD / OPTIONS 不拦。
- 两类豁免：`/v2/*` 授权端点（程序调用，报文加密封套 + 签名，本就没有浏览器 Origin）
  与支付宝异步回调（服务器直连，真伪由签名校验）。

### 首次设置

未初始化实例的「先到先得」问题由 `backend/security/setup_guard.py` 兜住，规则见上方
[首次设置窗口](#首次设置窗口)。

### 配对、上传与日志

- **配对码生命周期**：6 位码不再可无限复用。两档限流（按 IP + 跨来源总预算，后者防
  「换 IP 继续枚举」），被拦返回 429 + `Retry-After`；配对码已被在用设备占用时返回 409，
  必须先在后台解绑才能重配（否则拍到墙上那张码的人就能把合法设备顶下线）；配对前校验
  授权允许 `display`。
- **上传体积上限**：`POST /api/v1/assets/user` 先按 `Content-Length` 早拒，再按逐块累计字节数
  兜底（分块传输 / 不带长度也拦得住）：SVG 5 MB、位图 64 MB，超限 413 且不留垃圾文件。
- **全局日志不放大**：写盘移交给唯一的后台写线程（请求路径零磁盘 I/O），同一处刷屏折叠成
  一条并累加 `repeatCount`，超限裁剪带最小间隔（最密 10 秒一次），应用关闭时刷盘并回收线程。

### 归属与出网

- **3D 导出与效果变体按项目归属**：中控设备只能读自己仪表盘引用的导出图 / 效果变体，
  跨项目 403，文件不存在统一 404（不泄露存在性）；管理员不受限。
- **HA 换址确认**：改 `baseUrl` 但不重输令牌时返回 409 与错误码 `HA_URL_CHANGED_TOKEN_REUSE`，
  必须显式带 `reuseTokenForNewUrl: true` 确认新地址可信；被拒时库里的地址不会被改动。
- **云元数据地址拒绝**：`169.254.169.254`（含 `::ffff:` 映射写法）等云元数据地址在
  `/api/v1/ha/test` 直接 422，链路本地地址会单独提示。

### 商店侧

- **商品字段取值收敛**：`product_type` 与 `fulfillment_mode` 由 `store/catalog.py` 统一校验
  （取值与后台两个 `<select>` 一致）。这两个字段过去完全没有校验，
  拼错一个字母会让「手工发卡」静默变成自动发卡，或让增量包被当成基础授权直接买走。
- **订单终态保护**：`cancelled` / `expired` / `refunded` 的订单不能再被标记支付或履约。
- **待复核标记**：`needs_review` 目前只由「订单超时关闭后款项才到账」的复活单产生，
  后台可看到并用 `POST /store-admin/v1/orders/{order_no}/review` 标记已处理，处理结论追加进
  `review_note` 而不覆盖原原因。
- **支付巡检自报状态**：巡检坏掉时过去完全无声，现在概览卡片与 `GET /healthz` 都能读到，
  详见 [store/README.md](store/README.md) 的「巡检还活着吗」。
- **入账异常计数**：资金/履约路径上有几处 `except Exception` 是刻意吞掉异常的（对账失败
  不能把用户的支付页打成 500、入账后履约失败不能给渠道回失败免得它无限重推），它们过去
  只写日志 —— 服务照常、后台一片正常，而实际是「钱收了、授权没发出去」。现在这些异常会
  累计成进程内计数，`GET /healthz` 的 `incidents` 与后台概览都能看到（非零即 `degraded`），
  后台还有「确认已处理」把计数清零并记审计。详见 [store/README.md](store/README.md) 的
  「入账异常计数」。
- **商品图格式按内容判定**：过去只看文件名后缀，且不认识的后缀会被**静默改成 `.png`** ——
  运营选一张 SVG 上传不报错，落盘的却是一份「后缀叫 png、内容是 XML」的文件，商品图永远
  显示不出来，而前后端都说自己没错；把 SVG 改名成 `.png` 也能绕过白名单。现在按内容魔数
  识别 PNG / JPEG / GIF / WebP，SVG 明确 422 并给可读文案（它是能内嵌脚本的 XML，而商品图
  是按后缀回 `Content-Type` 的同源资源），落盘后缀由真实内容决定、换格式不留孤儿文件，
  前端 `accept` 与后端白名单由断言钉住不许各写一份。
- **前端转义只有一份实现**：后台的 `esc()`、前台的 `escapeHtml()`、邀请页的 `esc()` 曾各写
  一遍，后台那份还漏了单引号 —— 少转一个字符不会有任何报错，只会让某个拼接点变成注入点，
  而那些位置上写的是别人的邮箱、订单备注、商品名。现统一为 `store/static/htmlsafe.js` 的
  `HtmlSafe.esc`（用 `&#39;` 而非 `&apos;`：旧版解析器会把后者原样显示）；后台渲染模板里的
  模板里的数据直插靠同一份实现转义，渲染前不要手写拼接。
- **改库前的备份真的能还原**：商店的库跑在 WAL 模式，而删列/积分迁移前的「备份」过去是直接
  复制主库文件 —— 新写入的行还在 `store.db-wal` 里，复制出来的 `.bak` 打开是一张表都没有的
  空壳，可它文件名对、大小非零，看上去一切正常。这比没有备份更危险（会让人以为退路存在），
  而旧断言只比较字节、从不打开，恰好把它放过。现改用 `VACUUM INTO` 取一致快照，检查改成
  **把备份当数据库打开、读出即将被删的那一列的原值**，并要求删列时日志点名备份路径。
- **能力码清单只有一处定义**：基础能力码曾在三份常量里各存一遍（其中一份是没人引用的死代
  码，两份顺序还不一样）。「抄错一个字母不会报错 —— 履约照发，客户端只是静默拦截」，所以
  分叉的代价没人会发现。现统一由 `store/features.py` 的能力目录派生，校验直接读主项目
  `backend/` 的 `BASE_FEATURES` 对账（同一仓库，不靠记性），并静态扫描防止别处再抄一份。

## 授权体系

### 零配置指向自建授权服务器

客户端默认值写在 `backend/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像 `keys/` 及其 sha256，**密钥 id 由公钥文件字节派生**（形如 `hb-3f2a…`；服务端与客户端各自从自己那份镜像算出同一个值，因此不需要人工同步字符串）。**不设任何环境变量**，起服务后即可在 `/license` 激活。厂商生产节点与生产公钥已从代码中彻底移除，默认配置只指向自建授权服务器。

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

`keyId` 由公钥文件派生，所以**重新生成密钥一定会换 id**（这正是要修的：静态 id 不变时，客户端会把新公钥报成「指纹不匹配」，听起来像被篡改，而轮换在配置上也无法表达成「多了一个新身份，旧的还能用一段时间」）。

直接覆盖密钥会让旧客户端当场全部失效。要平滑过渡：把当前四件套（`license-private.pem` / `license-public.pem` / `license-transport-private.pem` / `license-transport-public.pem`）改名成 `*.previous.pem`，再生成新四件套并镜像到 `keys/`。服务端据此把两代都装进密钥环，**按请求里的 keyId 选代解密并用同一代签名** —— 旧客户端在窗口内照旧心跳；客户端也会自动多信任一条上一代记录（`keys/license-public.previous.pem` 存在才登记），因此「客户端先升级、服务端后轮换」也不中断。窗口是一次轮换的长度，删掉四个 `*.previous.pem`（缺一不可）即立即关闭。

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

运营后台「停用设备绑定 / 停用授权」后，端点返回
`403 {"detail": "...", "revoked": true, "code": "REVOKED"}`。
客户端只认结构化 `code`（`REVOKED` / `LICENSE_REVOKED`）或 `revoked: true`，
才判定为确认吊销并清空本地授权。

其余 401/403（无上述字段）视为瞬时故障（保留本地授权继续重试）。
详见 `backend/license/service.py` 的 `is_confirmed_revocation`。

## 3D 户型工作室

打开 `/3d-studio`。左侧是模型库与检查器，右侧是平面图画布。工作室只编辑草稿，不会直接改动仪表盘；户型和场景要另外导出，或生成 3D 交互快照后供仪表盘与展示页使用。

### 平面图工具

画布上方工具栏提供以下工具，悬停会显示对应提示：

| 工具 | 说明 |
| --- | --- |
| 选择 | 单击精确选择，空白处拖拽框选；移动时 `Shift` 锁轴，缩放时 `Shift` 等比例，`Option`/`Alt` 拖动复制，`⌘`/`Ctrl+C`、`V` 复制粘贴 |
| 平移 | 按住左键拖动平移画布 |
| 参考线 | 依次单击两个端点，用于确定真实比例；按住 `Shift` 强制锁定水平或垂直轴线 |
| 墙体 | 逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 `Shift` 锁轴，`Esc` 结束 |
| 窗户 | 靠近墙体单击，窗户自动吸附并生成真实窗洞 |
| 门 | 靠近墙体单击，门自动吸附并生成门洞；选中后可翻转开启方向 |
| 栏杆 | 靠近墙体单击，玻璃栏杆吸附到墙段并替换对应的实体墙 |
| 铭牌 | 单击画布放置户型铭牌；选中后可修改文字、拖动、缩放和旋转 |
| 楼板洞口 | 位于工具栏右侧，拖出矩形洞口；仅切除当前层楼板 |

「平移」只改变画布视角，不修改户型，因此既不写入草稿也不会进入撤销栈。它与既有操作共用同一套平移逻辑：滚轮缩放、中键拖动、按住空格拖动在任何工具下都可用。

切到「灯光」分类后户型会锁定，只能使用「选择」工具，点击其他工具会提示先切回家居或电器，避免在灯光编辑中误改墙体。

### 灯光区域与灯组

「灯光」分类下会出现图层面板，顶部有三个操作：`全关`、`新建区域`、`新建灯组`。

- **区域**用于按房间或空间给灯组分类，只有名称（最长 16 字，同层不可重名），可随时重命名或删除。
- **灯组**包含名称（最长 24 字）、启用状态和所属区域。未归入任何区域的灯组显示为「未分类」。
- **拖入区域**：直接拖动灯组行到目标区域标题上即可移入，标题会高亮提示；拖到另一个灯组行上则是在区域内调整顺序。
- **右键菜单**：灯组行右键可选 `设置区域` / `重命名` / `复制灯组` / `删除`；区域标题右键可选 `重命名区域` / `删除区域`。`设置区域` 弹窗里除了选择已有区域，也可以直接输入新名称就地新建区域，选「未分类」则移出区域。
- **删除区域不会删除灯组**，组内灯组会回到「未分类」。

面板本身是一棵两级树：区域 → 区域内灯组。区域标题带折叠箭头和成员数量，未分类的灯组排在最外层，空区域显示「暂无灯组」。区域和归属按楼层保存，展开／收起状态只在当前会话内有效。

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

### 升级：积分口径迁移会自动完成

邀请积分的存储从 `FLOAT`（积分）改成了 `INTEGER` **厘**（1 积分 = 100 厘）——原先靠
`round(x, 2)` 维持两位小数，而 SQLite 的 `round()` 是 half-away、Python 的是 half-even，
落在 `.xx5` 上时两边给出不同分币值，会让提现的并发比对误报冲突、并让余额与流水差 1 厘。

**升级到本版本不需要手工执行任何命令**：商店启动时自动按
`ensure_schema`（补 `*_centi` 列）→ 回填 + **逐行对账**（迁移前后用户看到的数字必须一模一样）
→ 退役旧 `FLOAT` 列 的顺序完成，动手前先备份一份 `store.db.pre-centi-<时间戳>.bak`。
对账有任何一行不一致就只保留不销毁（新旧列并存）并打印差异，不会丢数据。

整个过程在主应用启动时自动完成，不需要手工执行命令（原 `store.tools.migrate_points`
CLI 已随本次清理移除）。
对外 JSON 契约没变（仍是 `"10.05"` 这样的两位小数字符串），前端与客户端无需跟着改。
详见 [store/README.md](store/README.md) 的「升级与迁移」。


## 环境变量

主应用与商店的变量统一写进仓库根目录的 `.env`：把 [.env.example](.env.example) 复制成 `.env` 再按需取消注释（`.env` 已被 gitignore）。优先级：**真实环境变量 > `.env` > 代码 / `start.py` 默认值**。

模板按用途分区，**多数部署只需改 A 区**：

| 区 | 内容 |
| --- | --- |
| **A. 部署常改** | 公网域名、可信反代、Cookie Secure、模拟支付总闸 |
| **B. 主应用** | 数据目录、会话 / 中控寿命、HA / 授权超时与密钥路径（默认即可） |
| **C. 商店基础设施** | 监听、数据目录、租约 TTL、巡检间隔等（后台改不了的项） |
| **D. 首次初始化** | `/setup` 页面创建管理员用的引导口令（`STORE_SETUP_TOKEN`，不设则启动时自动生成并落到 `data/setup-token`） |

站点名、公告、客服、维护、邀请提现、解绑冷却、验证码 TTL、**邮件 / SMTP、支付渠道、支付宝商户与回调**等请到商店 `/admin`「站点配置」改（**保存即生效、免重启**）。`.env.example` 故意不再罗列这些项，避免和生产后台双源配置打架。

### 部署常改（A 区）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_BASE_URL` | 空 | 主应用对外根地址；反代时建议设置，供 WebSocket 校验 Origin |
| `APP_LICENSE_SERVER_URL` | 本地 `http://127.0.0.1:18082`；Compose 默认 `http://homeos-3d-store:18082` | 授权服务器地址；同 Compose 网络通常不用改 |
| `APP_TRUSTED_PROXIES` | 空 | 可信反向代理 IP / CIDR（逗号分隔）；留空则不信任任何转发头 |
| `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1,::1`（Compose 与容器启动器） | uvicorn 允许改写对端地址的来源范围。**不要填 `*`**：那会让限流与审计的来源 IP 由客户端自己决定；前面有反代时填代理自身地址/网段 |
| `APP_COOKIE_SECURE` | `false` | 强制会话 Cookie 加 `Secure`；不设时按请求自动判定 https |
| `STORE_BASE_URL` | 由请求推导 | 商店对外基址（支付二维码 / 回调链接） |
| `STORE_TRUSTED_PROXIES` | 空 | 商店侧可信反代，语义同主应用 |
| `STORE_COOKIE_SECURE` | `false` | 商店会话 Cookie 的强制 `Secure` |
| `STORE_ALLOW_MOCK_PAYMENTS` | `false` | 模拟收银台总闸；**仅本地联调**，生产保持关闭 |

管理员不走环境变量：首次部署后访问 `http://<商店地址>:18082/setup` 创建（早期版本的
`STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` 预置路径已移除，因为它等于给每个照文档
部署的实例留一个公开默认账号）。

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
| `STORE_LICENSE_KEY_ID` / `STORE_LICENSE_TRANSPORT_KEY_ID` | 留空（由公钥派生） | 显式钉住签发租约与传输密钥的 keyId；默认由公钥文件派生，轮换后自动改变 |
| （轮换窗口） | 无 | 目录里存在 `license-*.previous.pem` 四件套即自动开启：旧客户端在窗口内仍可解密与验签 |
| `STORE_COOKIE_NAME` | `ha_bridge_store_session` | 商店会话 Cookie 名 |
| `STORE_LEASE_TTL_SECONDS` | `259200` | 租约有效期（72 小时）。⚠ 该值同时是「离线可用时长」与「吊销生效上界」：对持续离线的客户端，停用授权最慢要等这么久才生效 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT` | `3600` | `/v2/heartbeat` 与 `/v2/recover` 的来源 IP 小时配额（`/v2/activate` 固定 60/小时）。这两个端点不可枚举却承载常态流量，额度按 NAT 出口地址算，多设备共用出口时调大 |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期（真实收款须调大） |
| `STORE_PAYMENT_SWEEP_INTERVAL_SECONDS` / `_BATCH` | `30` / `25` | 支付巡检间隔与每轮上限 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 接口是否回显验证码（生产必须 false） |

本地 `start.py` 会临时打开 `STORE_PAYMENT_PROVIDER=mock`、`STORE_ALLOW_MOCK_PAYMENTS=1` 与 `STORE_MAIL_MODE=echo`，方便联调；Docker 生产路径不会自动打开这些开关。

后台「站点配置」口径：留空 / 填 `0` 表示跟随环境变量，填了值就以后台为准。SMTP 授权码只显示打码值；支付宝回调不能填 `localhost` / 内网地址。完整变量、支付宝接入与排障见 [store/README.md](store/README.md)。

## Docker

双容器分别跑主应用（**18081**）与授权商店 / 授权服务器（**18082**）。
GitHub Actions 构建两个 GHCR 镜像：

- `ghcr.io/sfairy/homeos-3d`（Dockerfile target `app`）
- `ghcr.io/sfairy/homeos-3d-store`（Dockerfile target `store`）

该 workflow **只支持手动触发**（在 Actions 页面 Run workflow），不在 `push` / PR 上自动构建。
从 `main` 手动运行时打 `latest` 与 `VERSION` 标签，从 `v*` tag 手动运行时打 semver。

最终运行镜像**不包含可读业务源码**：

- Python：构建阶段编成 legacy `.pyc` 后删除 `.py`（只保留 `migrations/*.py`）
- JavaScript：`javascript-obfuscator` 混淆；跳过 `vendor/` 与 `*.min.js`
- 不包含构建脚本

生产清单与反代示例见 [deploy/PRODUCTION.md](deploy/PRODUCTION.md)、
[deploy/Caddyfile.example](deploy/Caddyfile.example)、
[deploy/nginx.conf.example](deploy/nginx.conf.example)。

### 快速启动

```bash
cp .env.example .env
# 多数部署不用改；生产填 APP_BASE_URL / STORE_BASE_URL / *_TRUSTED_PROXIES / *_COOKIE_SECURE
# 管理员账号首次部署时在浏览器打开 :18082/setup 创建，不走环境变量

docker compose pull
docker compose up -d

# 或本地构建
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

容器启动后：**先 `docker logs homeos-3d` 取首次设置的引导密钥**（容器内 `/data/setup-token`），
再访问 `http://<主机>:18081/setup` 填入。仅桥接网络下，从宿主机访问也会被当成远程来源
（对端是 `172.17.0.1` 这类网关地址），因此这一步不能省。

商店默认映射 **18082**。主应用默认 `APP_LICENSE_SERVER_URL=http://homeos-3d-store:18082`
（可在 `.env` 覆盖）。首次部署还需要在其中**任一**容器里创建管理员账号：访问
`http://<主机>:18082/setup`，用启动日志里的引导口令（或容器内 `data/setup-token`）填入。

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

反向代理请转发 WebSocket（`/api/v1/ws/runtime`）以及 `/api/hls/`、`/api/camera_proxy/` 等媒体路径。
站点走 HTTPS 时设置 `APP_COOKIE_SECURE=true` / `STORE_COOKIE_SECURE=true`，并配置
`APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES`。

升级时不要清空数据卷（`homeos-3d-data` / `homeos-3d-store-data` / `homeos-3d-license-keys` /
`homeos-3d-client-keys`）。数据库结构由单条基线迁移 `0001` 建立；若库内记录的是更早构建的 revision，启动时会直接认领该基线（不改动任何业务数据）。

### GitHub Actions

- [`.github/workflows/docker.yml`](.github/workflows/docker.yml)：**仅手动触发**；多架构构建推送 GHCR

可选远端部署：在仓库 Secrets 配置 `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` /
`DEPLOY_PATH`（可选 `DEPLOY_PORT`），然后在 Actions 里手动运行 **Docker** workflow 并勾选
「构建推送后 SSH 拉取并重启远端 compose」。远端目录需已放好本仓库的 `docker-compose.yml`
（可用 `HOMEOS_IMAGE` / `HOMEOS_STORE_IMAGE` 覆盖镜像名）。

从运行中的主应用容器导出应用目录：

```bash
docker exec homeos-3d tar -czf /tmp/app.tar.gz -C /app .
docker cp homeos-3d:/tmp/app.tar.gz ~/Desktop/
docker exec homeos-3d rm /tmp/app.tar.gz
```

## 开发注意

- 静态资源缓存标记统一为 `?v=YYYYMMDDHHMMSS`（14 位本地时间，例如 `?v=20260915103715`），不要再拼接 feature-label 长串。改 JS / CSS / HTML 后需要**手工把受影响的 `?v=` 同戳更新**（原先的批量改写脚本已随本次清理移除）；同一次改动的资源务必用同一个时间戳，`home.js` 与 `renderer.js` 必须使用同一条 `registry.js?v=`，否则会出现两份控件注册表。
- 前端 JS / CSS / HTML 约定 `printWidth=100`（HTML 为 120）。`frontend/static/vendor/` 不参与格式化。
- 不要改 `frontend/static/vendor/` 下的 three.js、hls.js、OrbitControls 等第三方文件。
- 界面中文文案保持原词；缓存戳改动请用 `tools/bump_static_cache_versions.mjs`。
- 静态资源按功能域分区：`app.css` 留在挂载根，其余分入 `bridge/`、`editor/`、`renderer/`、`display/`、`auth/`、`shared/`、`logging/`、`assets/`，以及原有的 `utils/`、`3d-studio/`、`templates/`、`component-thumbnails/`、`audio/`、`vendor/`。移动文件后请跑 `node tools/check_structure_refs.mjs` 校验引用与后端路径清单。
- `migrations/env.py` 必须从 `backend` 导入 `database` 和 `models`（`from backend.core.database import Base`），不要写成相对导入，否则会重复注册表。
- 3D 交互舞台脚本由 `/api/v1/modules/interaction3d/{filename}` 下发，需要已登录或已配对，且当前授权允许编辑器或 `module.3d_interaction`。
- 商店的样式只有一层设计系统：`theme.css`（令牌 + 组件）必须排在任何页面样式表之前，令牌值与 `frontend/static/app.css` 对齐。详见 [store/README.md](store/README.md) 的「界面主题」。
- 改动商店授权端点吊销响应时，须保留结构化 `code` / `revoked` 字段（客户端只认这些，不再匹配 detail 文案）。
- Docker 联调改业务代码后需要重新 `docker compose … --build`；镜像内是混淆 / 去源码产物，不能挂载源码热重载。

## 开发工具

改 JS / CSS / HTML 后统一 bump 静态资源缓存戳：

```bash
node tools/bump_static_cache_versions.mjs
```

可选参数：`--dry-run` 只列出会改哪些文件与处数（不写盘）、`--version=YYYYMMDDHHMMSS` 指定戳而不取当前本地时间。

## 开发注意

- 静态资源缓存标记统一为 `?v=YYYYMMDDHHMMSS`（14 位本地时间，例如 `?v=20260915103715`），不要再拼接 feature-label 长串。改 JS / CSS / HTML 后执行 `node tools/bump_static_cache_versions.mjs` 全局同戳 bump；`home.js` 与 `renderer.js` 必须使用同一条 `registry.js?v=`，否则会出现两份控件注册表。

## 更新日志

### 未发布

测试与死代码清理

- 不再内置任何自动化测试 / 探针：删除 `.github/workflows/ci.yml`、`docker-compose.smoke.yml`、`backend/tools/*`（冒烟、前端探针、API 错误探针）与 `store/tools/{smoke,e2e,*probe}`；`docker.yml` 去掉 `smoke` job，只保留多架构构建与可选远端部署。**仓库此后没有自动化回归网，改动请人工走关键路径。**
- 删除运维脚本 `store/tools/{seed,gen_keys,migrate_points}.py`：密钥准备改由 `docker/license_keys.py`（`start.py` 与容器启动共用）完成，商品目录 / 站点配置由 `store/bootstrap.py` 启动时幂等补齐，积分迁移在启动时自动执行。同步删除 `ruff.toml`、`eslint.config.mjs`、根 `package.json` / `package-lock.json`（`docker/package*.json` 保留）。`tools/bump_static_cache_versions.mjs` **保留**（静态资源 `?v=` 同戳仍靠它统一改写；它只用 Node 内置模块，不依赖被删的根 `package.json`）。
- 清理死代码与重复实现：删除 `floor-lamp.glb` 孤儿模型、`is_blacklisted()`、`public_key_pem()`、`showCapabilityDetails()`、`bootstrap_admin_*` 配置项、两个限流器的 `tracked_keys()` 与全局日志的三个排障计数器；新增 `backend/core/canonical_json.py`、`backend/http/http_cache.py`、`frontend/static/utils/icon-url.js`、`frontend/static/utils/datetime.js`、`frontend/static/utils/interaction-pages.js` 收敛此前逐处手写的规范 JSON、Cache-Control、图标 URL、时间格式与交互页面清单（那份清单原有三份字面量）。
- 资金路径上的重复释放收敛为两处唯一实现：`store/fulfill.close_pending_order()`（CAS 抢 `pending` 后推进终态，「用户取消 / 后台取消 / 模拟收银台取消 / 超时过期 / 渠道对账兜底」五处共用）与 `store/fulfill.release_order_effects()`（归还预占 + 名额，闭单与「下单即失败」路径共用）。原先这段在十余处各写一遍，抄漏一处就会让 `reserved_stock` 虚高或优惠码名额被永久占用 —— 都不报错，只在某天被发现。
- `canonical_json` 补齐漏网调用点：`interaction3d/config.py`（光区覆盖表键比对）、`api/assets.py`（裁剪元数据落盘）、`api/global_logs.py`（导出上下文）、`license/service.py`（权益集落库），以及 `interaction3d/api.py` 分桶摘要那处**漏写 `ensure_ascii=False`** 的真实分歧。
- `meteoconUrl` 并入 `utils/icon-url.js`：它与 `mdiIconUrl` 是同一条「图标名 → vendor 地址」知识（共用同一条「只放行小写字母 / 数字 / 连字符」的白名单约束），原先 `home.js` 与 `registry.js` 各写一份 mdi 版本、`weather-chart-runtime.js` 自带 meteocons 版本。
- 密钥准备指引的标识符改名（`gen_keys_hint` → `key_preparation_hint`、`GEN_KEYS_HINT` → `KEY_PREPARATION_HINT`）：文案早已指向 `start.py` / `docker/start_store.py`，只剩名字还叫着已删除的 `gen_keys.py`。
- 首次管理员只剩 `/setup` 一条路径：`STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` 的预置分支（解析后从未被消费）连同 README / `.env.example` / 启动提示里的说明一并移除。
- 注释里的失效引用同步改写：产品代码中「探针 `xxx` / 第 N 条闸 / 契约助手手册已钉住」这类指向已删测试设施的表述，改为「口径仍然有效、但改动时需手工核对」，不再暗示背后有回归网。
- 3D 工作室的 `dataset` 诊断属性（约 60 处写入）逐项核对后**保留**：它们不是残留死代码，而是浏览器里排查阴影 / 合批 / 预编译状态的唯一观测面（例如 `studio-shadow-atlas.js` 那几项就写着「给浏览器里排查阴影问题用」），删掉等于把排障手段一并删掉。顺带补齐两处遗漏的开关：`?material-test` / `?instance-test` 与 `?model-export` 一样要求 `?debug=1`，不再进入生产运行时。
- 更新 README / store/README 与产品代码注释里对已删脚本、已删断言的全部引用。

### v0.5.6

自托管 Docker

- 双容器 Compose：`homeos-3d`（主应用 18081）+ `homeos-3d-store`（商店 / 授权服务器 18082），共享公钥卷、独立数据卷与授权私钥卷。
- 多目标 Dockerfile：target `app` / `store`；构建期 strip Python 源码、混淆业务 JS；GHCR 镜像 `ghcr.io/sfairy/homeos-3d` 与 `…-store`。
- 商店容器启动时生成或复用授权密钥并同步公钥；主应用等待公钥就绪后再起；首次管理员在 `/setup` 页面创建。
- 新增 `deploy/PRODUCTION.md`、Caddy / nginx 反代示例，以及 `.github/workflows/docker.yml`（冒烟 → 多架构推送；可选 SSH 远端重启）。
- `.env.example` 收敛为 A/B/C/D 分区：部署常改项置顶，SMTP / 支付 / 站点文案改到 `/admin` 配置，避免双源。
- 移除已过时的 `frontend/NAMING.md` 与根目录 `COMMENTING.md`。
- 客户端「检查更新」发布记录写入 `store/release_info.py`（`CURRENT_UPGRADE_NOTES`），启动时幂等补写 / 同步到 `releases` 表。

### v0.5.5

安全加固

- 首次设置窗口（`backend/security/setup_guard.py`）：`/api/v1/setup/admin` 过去只受「管理员账号文件是否存在」这一道闸门保护，任何能连上机器的人都能抢先把管理员建掉并当场拿到会话。现在**本机直连放行**（TCP 对端是 loopback 且请求不带任何转发头），其它来源必须带引导密钥（`APP_SETUP_TOKEN`，或首次启动自动生成并落盘到 `data/setup-token`、打印到启动日志的那一串）；失败计入登录限流，成功与失败都写审计，初始化成功后密钥立即作废。
- 真实来源 IP（`backend/security/http_security.py`、`store/request_security.py`）：两个服务默认**不信任任何转发头**，限流、审计与登录记录一律按 TCP 对端统计 —— 此前不可信来源自己写 `X-Forwarded-For` 就能给限流换一个新桶，形同虚设。配了 `APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` 后也只在连接确实来自代理时才认转发链；拿不到真实来源时按 IP 那一档主动让位，避免共享地址被一个人的失败锁死所有人。
- Cookie `Secure` 自动判定：漏配 `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` 不再让会话 Cookie（能看订单、能提现、能控中控）明文下发，纯 http 局域网也不会误加。
- CSRF 同源闸门：主应用拦非 GET 的 `/api/*`，商店拦非 GET 的 `/store/v1/*` 与 `/store-admin/v1/*`；只认裸的 `scheme://host`，`http://evil@本机地址/` 这类写法不会被误判为同源。`/v2/*` 授权端点与支付宝异步回调豁免（前者报文加密签名、后者靠签名校验，都没有浏览器 Origin）。
- 登录会话管理：新增 `GET /api/v1/auth/sessions`（只回令牌哈希）、`DELETE /api/v1/auth/sessions/{id}` 与 `DELETE /api/v1/auth/sessions`，并补上绝对寿命 `APP_SESSION_HARD_MAX_AGE_SECONDS` —— 滑动续期不能再把一枚被盗 Cookie 无限续下去。
- 全局日志的写入放大自 DoS（H1）：写盘移交唯一后台写线程（请求路径不再做磁盘 I/O），去重签名剔除逐请求变化的 `requestId` / `durationMs`（此前「5 秒折叠」形同虚设），超限裁剪带最小间隔（最密 10 秒一次，此前每次 append 都会读全量并重写），应用关闭时刷盘并回收线程。
- 中控配对码生命周期（H2）：两档限流（按 IP + 跨来源总预算，换 IP 也躲不掉）、在用设备被同一码再次配对时返回 409（此前会直接顶掉合法设备）、配对前校验授权允许 `display`；顺带修掉「把 `block_seconds` 属性当函数调用」导致拦截时返回 500 而不是 429 的问题。
- 中控令牌有效期：滑动有效期 `APP_DISPLAY_TOKEN_TTL_SECONDS`（活跃即续期，带 5 分钟节流）+ 可选硬上限 `APP_DISPLAY_TOKEN_HARD_TTL_SECONDS`；后台设备列表补 `expiresAt` / `expired`，过期设备仍可见可解绑。
- 上传体积上限（H3）：`POST /api/v1/assets/user` 补 `Content-Length` 早拒与逐块累计上限（SVG 5 MB / 位图 64 MB），413 且不留垃圾文件 —— 此前无任何字节上限，一个请求就能把磁盘写满。
- 3D 导出与效果变体的跨项目 IDOR（M4）：中控设备只能读自己仪表盘引用的导出图 / 效果变体，跨项目 403，不存在统一 404 不泄露存在性。
- HA 换址的令牌复用确认（M5）：改 `baseUrl` 但不重输令牌时返回 409 `HA_URL_CHANGED_TOKEN_REUSE`，需显式 `reuseTokenForNewUrl: true`；云元数据地址（`169.254.169.254`，含 IPv4 映射写法）在 `/api/v1/ha/test` 直接拒绝。
- 商店商品字段取值收敛（`store/catalog.py`）：`product_type` / `fulfillment_mode` 此前完全没有校验，拼错一个字母会让「手工发卡」静默变成自动发卡、或让增量包被当成基础授权买走；现由服务端唯一来源校验，并与后台两个 `<select>` 对齐。
- 商店订单：`cancelled` / `expired` / `refunded` 的终态订单不能再被标记支付或履约；「超时关闭后款项才到账」的复活单打上 `needs_review`，后台新增 `POST /store-admin/v1/orders/{order_no}/review` 标记已处理，结论追加进 `review_note` 而不覆盖原原因。
- 商店营收口径：后台「标记支付」只放行订单、**不再计入营收**（新增 `orders.manual_settlement`，存量库自动补列且历史数字不变）；人工确认钱已收到走新的 `POST /store-admin/v1/orders/{order_no}/settle-offline`，渠道随后确认收款会自动清掉标记。概览营收卡单列「人工补记」金额，订单列表带芯片标注 —— 详见 [store/README.md](store/README.md) 的「人工补记与营收口径」。

清理

- 删除 8 个开发期的探针 / 临时脚本（`backend/probe_*.py` 四个、`store/tools/probe_request_security.py`、`store/tools/_probe_{admin,stock}.py`、`store/tools/_ui_demo_seed.py`），并同步移除 `store/tools/smoke.py` 里对其中两个的悬空引用。
- `.gitignore` 去掉指向已删除功能的三条死规则（`register/data/`、`upgrade-backups/`、`户型图.png`），本地临时目录 `/app/`、`.deobf/`、`原项目/` 归拢到一处并加注释。
- `.env.example` 补齐安全相关变量（`APP_TRUSTED_PROXIES`、`APP_SESSION_HARD_MAX_AGE_SECONDS`、`APP_DISPLAY_*`、`STORE_TRUSTED_PROXIES`、`STORE_PAYMENT_SWEEP_*`），并修正两处格式说明（`APP_LICENSE_SERVER_BATCHES` 与 `APP_LICENSE_TRUSTED_PUBLIC_KEYS` 是 `;`/`|`/`:` 分隔的字符串，不是 JSON）。

移除

- 彻底下线**栖光 UI 方案**（`ui.base` / DWELL LIGHT）：删除前后端 UI Pack 抽象（`ui_packs.py`、`/api/v1/ui-packs`、`uiPack` / `templateRef.uiPackId` 字段、`ui.base` 能力码），控件模板注册改为按 `templateId` 单键，文档归一化收敛为 `normalizeDashboardDocument`。
- 删除内置仪表盘模板 `dwell-light`（`dashboard_templates/`、预览轮播与项目创建时的模板选择）与全部栖光预览/封面资源；新建仪表盘只有「空白画布」一种路径。
- 删除整个 `image/v1` 内置素材（61 张，含示例户型图）与 `legacy_asset_ids` 户型图路径映射；素材选择器只保留「我的图片」。`image/` 目录保留但默认为空。
- 数据迁移：本项目按**首个发布版本**维护，不再保留历史版本数据迁移。Alembic `0001–0015` 合并为单条基线 `0001_initial_schema`；删除升级前备份 / 失败回滚、`data/secrets/` 密钥搬迁、管理员凭据外置的 `migrated` 分支、旧中控令牌补挂，以及商店启动时的补列 / 品牌标识回填 / 旧图标路径自愈 / `ui.base` 剔除（发布记录兜底迁至 `store/release_info.py`）。库内残留旧 revision 时由启动流程直接认领基线，业务数据不受影响。
- 下线发布清单与 SBOM：删除 `release-manifest.json` 与 `sbom.cdx.json`。仓库内既没有生成器（`tools/release_artifacts.py` 从未入库），CI 的 `Release manifest consistency` 步骤也已一并移除。

品牌

- 品牌统一更名为 **HomeOS**：全部 36 个图标资产由 `ha-bridge-*` 改名为 `homeos-*`，矢量源改为方形画布（房子满宽满高），对应 CSS 盒子同步为正方形。
- 启动时自愈库内遗留数据：`store_settings.logo_url` 的旧图标路径、`releases.product` 与 `products.product_code` 的旧品牌标识都会自动归一。

破坏性变更

- 授权传输协议标识与产品标识改名（`ha-bridge-license-transport-v1` → `homeos-license-transport-v1`，`PRODUCT` → `homeos`）。两者参与 HKDF / AES-GCM AAD，服务端只认新标识：**必须先升级客户端、再升级服务端**，老客户端会在解密阶段直接失败、没有降级路径。升级顺序与影响已写进 0.5.5 的 `upgrade_notes`，客户端「检查更新」可见。

修复

- 库存口径：发码时扣减 `stock_quantity`（`fulfill.consume_stock`），退款「已支付未发码」订单时释放 `reserved_stock` —— 此前限量商品履约后可用量会「长」回来，同一件库存能反复卖出。
- 订单终态保护：`cancelled` / `expired` / `refunded` 订单不再能被标记支付或履约（此前可凭空发码）。
- 优惠码名额：取消与退款会归还名额；「每人限用」只统计仍占用名额的订单 —— 此前一单被取消，用户就永久失去该优惠码。
- 后台时间：一律按浏览器本地时区显示与录入，提交时转成 UTC 入库 —— 此前手填的时间在 `Asia/Shanghai` 下会整体偏 8 小时。
- 手动履约商品（`fulfillment_mode=manual`）被后台「标记支付」时只入账、不发码，与真实支付宝到账路径语义一致。

数据可维护性

- 后台补齐写入口：商品全部运营字段与商品图上传、优惠码全字段编辑、账号邮箱/密码/启停/管理员、授权有效期修正、权益与积分调账、版本记录修正。
- 后台新增只读入口：客户端会话、找回令牌、积分流水、核销记录、客户档案、诊断数据（登录会话/登录尝试/邮箱验证码/解绑事件）。
- 新增维护动作：登录会话单条踢下线、客户端会话与找回令牌撤销、按安全谓词清理日志（只清过期或已消费记录）、优惠码核销记录单条作废并重算占用名额。
- 诊断类列表统一支持 `limit/offset/total` 翻页；管理接口的请求体改为拒绝未知字段（`extra="forbid"`），不再静默丢弃后台表单里的改动。

新增

- 仓库自带完整的**授权商店 + 授权服务器 + 运营后台**（`store/`），取代原 `register/` 本机店：
    - 商店前台与 `pay.habridge.cn` 对齐页面结构与 `/store/v1/*` 契约：账号注册 / 登录 / 找回密码、邮箱验证码、商品列表与详情、优惠码、订单查询与归档、邀请返利与提现、账号中心与设备自助解绑；视觉为本项目自研的暗色 + 琥珀主题。
    - 授权服务器提供 `/v2/activate`、`/v2/heartbeat`、`/v2/recover`：Ed25519 签名租约、X25519 + HKDF-SHA256 + AES-256-GCM 加密传输，租约 7 天、心跳 300 秒续租。
    - 运营后台 `/admin` + `/store-admin/v1/*`：概览、商品、订单、授权、设备绑定、优惠码、提现审核、账号、站点配置、版本发布与审计日志；暗色 + 琥珀统一主题。
    - 支付渠道 `mock`（本地收银台）与 `alipay`（当面付扫码）可切换；异步通知验签 + 主动查单兜底，统一入账且重复通知只发一次码。
- 客户端默认零配置指向自建授权服务器（`backend/config.py` 内置端点、由公钥派生的 keyId 与公钥 sha256），厂商生产节点与生产公钥已彻底移除。
- 仓库根 `keys/` 作为客户端信任锚公钥镜像，由 `store.tools.gen_keys` 从 `store/keys/local/` 自动同步，二者逐字节一致。
- 新增 `.env` 本地配置（SMTP 授权码、支付宝私钥等只落在被 gitignore 的 `.env` 里，随仓库分发的 `.env.example` 只含占位符）与 `store/env.py` 极简加载器。
- 新增 `tools/bump_static_cache_versions.mjs`（统一静态资源 `?v=YYYYMMDDHHMMSS`）。

优化

- 后端与前端源码可读性与命名规范化；Alembic 迁移为 `migrations/` 下 14 个真实脚本（`0001 → 0014`）。
- 依赖收敛到 `store/requirements.txt`，主应用与商店共用一个虚拟环境 `.venv-store`。

说明

- 授权校验始终开启，激活只连接自建授权服务器，不接入官方授权云。
- 功能面与 0.5.2.1 保持一致，主要差异在授权体系。

### v0.5.2.1

新增

- 3D 工作室灯光「区域」：灯光分类下新增图层面板，可 `新建区域` 并按房间或空间归类灯组。
    - 灯组行支持拖拽：拖到区域标题上即移入该区域，拖到另一个灯组行上则在区域内调整顺序。
    - 右键灯组可 `设置区域`，可选择已有区域、就地新建，或选「未分类」移出区域；右键区域标题可 `重命名区域` / `删除区域`。
    - 面板按「区域 → 灯组」两级展示，区域标题带折叠箭头与成员数量；删除区域不会删除灯组，组内灯组回到「未分类」。
    - 区域与归属按楼层保存，加载时非法归属会自动回落到「未分类」。
- 模型库新增壁画与背景墙：壁画提供 6 种画面风格（包豪斯几何、柔和色域、极简线条、硬边色块、水墨意象、水磨石纹），背景墙提供 7 种墙面材质（大理石、木纹、格栅条、岩板、微水泥、布纹、金属拉丝）。两者均为程序化生成，不依赖外部模型文件；背景墙的「格栅条」会额外出真实 3D 格栅。
- 柱子支持多种截面形状与立 / 卧布置：形状可选方形、圆形、半圆形、1/4 圆形、1/4 圆形（内弧）；`布置方向` 可选垂直（站立）或水平（躺放）。躺放时平面占位改为「宽 × 长」、平面符号改用内轮廓、3D 姿态旋转 90° 后重新贴地，检查器的「高（m）」相应变为「长（m）」。
    - 非方形柱子附带轻量 GLB（`pillar-*-lite.glb`），加载失败时自动回退到完整模型；方形柱子回退到程序化几何体，界面无需手动切换。
- 平面图新增「平移」工具：按住左键拖动即可平移画布。它只改变画布视角，不修改户型，也不触发保存与撤销；滚轮缩放、中键拖动与按住空格拖动仍然可用。
- 墙高、厚度、透明度支持「应用到所有」：选中墙体后，检查器的墙高 / 厚度 / 透明度设置 / 透明度各有 `应用到所有` 按钮，弹窗中可按复选框挑选目标墙体（默认全选，可 `全选` / `取消全选`），确认后一次应用所选。
    - 作用范围为当前楼层，仅修改这一项属性，整批应用只记一次撤销。
    - 应用墙高 / 厚度会同时更新本层默认值，之后新画的墙继承新值；透明度按单墙覆盖，选择「跟随通用」即清除覆盖。
    - 灯光的色温、亮度、照射范围、照射角度、离地采用同一套批量入口。

优化

- HA HTTP 客户端改为长生命周期 `AsyncClient`，复用连接池，减少重复握手。
- 全局日志改为后台写入线程，请求路径不再因刷盘阻塞事件循环。
- 仪表盘渲染侧裁剪灯光视觉缓存与自定义下拉残留，降低长时间运行的内存压力。
- 3D 工作室可读性重构：巨型家具 mesh 构建与世界预览拆解为 helper，清理占位符标识符。

修复

- 登录校验固定走一次 argon2 验证，避免用响应时间枚举用户名是否存在。
- 本机授权店按邮箱查询时返回脱敏激活码，不再直接回传完整码与订单号。
- 修复 3D 工作室改名遗留的悬挂引用（如窗帘绘制分支的 `helperFn`），消除加载与导图时的 `ReferenceError`。

说明

- 上述工作室功能的使用说明见 [3D 户型工作室](#3d-户型工作室)。

### v0.5.2

新增

- 展示页开屏：`display-boot.js` / `display-boot.css`，进入仪表盘前显示品牌 splash，等待首屏图片与 3D 资源就绪后淡出。
- 支持 `?capturePreview=1` 跳过开屏；加载失败可重试或「先进入仪表盘」。

修复

- 3D 空间 ALL 总览下，人体传感器等对象不再响应点击聚焦，统一禁用总览中的对象点击交互。
- 安防摄像头：补齐摄像头实体的状态订阅与聚焦判定，配置完成后状态与实际在线情况一致，不再误报离线；弹窗预览点击不再触发 `event.contains is not a function` 崩溃。
- 安防摄像头：对不支持原生 HLS 的摄像头（如 Frigate）自动回落到 MJPEG 代理流，`/api/camera_hls` 不再返回 502，画面直达无需先失败一次。
- 3D 工作室阴影图集：烘焙前补齐灯光 layer 与隐藏楼层组的可见性，避免合法灯光被渲染 pass 跳过；单盏灯无法生成阴影贴图时不再拖垮整张图集并回退到无阴影。
- 自动生成控件遇到同名文件夹时，确认弹窗可正常操作，支持选择覆盖、改名或不覆盖，保留原有生成流程。
- 3D 交互设备配置中，空列表提示不再挤压「添加设备」按钮，修复文字竖排和布局异常；补齐参考实现中紧凑列表的跨列与最小宽度样式（`.i3d-compact-list>.i3d-note`、`.i3d-compact-list>.i3d-config-list-row`）。
- 与 0.5.2 参考实现逐模块对齐：渲染缓存模块导出名统一为 `sha256`；外部家具模型的 `bed` 声明 `geometryRevision: 20260908-base-inset-v1`，与参考一致。
- 3D 交互组件缩略图改用 `<component-thumbnails>/interaction3d.jpg`，与组件库其余缩略图的 `.jpg` 命名保持一致。

说明

- 本版本以 0.5.2 参考实现对齐展示页开屏，并补齐上述 3D 修复。

### v0.5.1

新增

- 3D 安防：户型舞台支持摄像头与在场传感器标记，新增安防配置编辑器（`security-editor.js`），统一管理 `security.cameras` 与 `security.presenceSensors`。
- 新增摄像头状态组件（`camera-status.js`）与摄像头弹窗布局计算（`camera-popup-layout.js`）。
- 户型工作室新增安防模型（`studio-security-models.js`）、车漆材质（`studio-car-finish.js`）、动态演示（`studio-motion-presentation.js`）、墙面材质（`studio-wall-materials.js`）与窗户几何（`studio-window-geometry.js`）模块。
- 在场编辑器支持按楼层定位与聚焦（`security-focal`）、在场页面（`presence-pages`）与路线重绘，并新增地面世界波纹（`world-waves`）。
- 3D 配置编辑器统一设备设置版式（`unified-settings`）与工作区切换（`workspace-switch`）；展示页与仪表盘新增导航灯（`navigation-light`）与 3D 舞台保留（`stage-retain`）。
- 后端 3D 配置契约新增 `security.cameras` 校验（实体需匹配 `camera.*`，楼层不得为 `all`）。

说明

- 本版本以 0.5.1 参考实现对齐前后端功能，保留本仓库既有改造（静态目录、`help.html`、three.js 0.186.0、hls.js 1.7.2、端口 18081）。

### v0.5.0

新增

- 3D 交互扩展：空调、窗帘、电视、NAS、在场感应、扫地机地图等运行时面板与环境效果。
- 户型工作室：地面反射、楼层洞口/过渡、Plan2 区域光与接触阴影、反射细节与家具运行时模块。
- 栖光 UI Pack 预览轮播与仪表盘模板资源。
- meshoptimizer 轻量化支持（反射细节管线）。

优化

- 3D `/control` 按模型绑定与 HA 能力校验窗帘、空调、电视控制。
- 控件配置契约扩展环境、设备、反射、楼层与页面行为字段。

### v0.4.8

新增

- 3D 交互控件：从户型工作室草稿生成场景快照，仪表盘与展示页用 iframe 嵌入同一舞台；舞台内仅控制已绑定的灯和开关。
- 3D 灯光配置编辑器：绑定实体、灯光按钮、聚焦视角与进阶光照，图层 PNG 缓存走本机数据目录。
- 本机授权将 3D 交互计入基础能力。已开通编辑器的旧租约可直接使用；不接入官方授权云与商城付费墙。

### v0.4.6

新增

- 自动户型图支持选择全楼或指定楼层生成。
- 管理员账号改为独立存储，删除账号文件并重启后可重新设置账号密码，原有户型、HA 配置、授权及中控数据不受影响。

优化

- 优化 3D 灯光预加载，减少首次开灯时的卡顿。
- 完善全局日志、完整导出和故障诊断，问题排查更加准确。

修复

- 修复部分反向代理环境下 3D 家具和家电模型无法加载的问题。
- 修复全楼预览工具栏在较窄窗口中超出边界的问题。
- 修复空调和浴霸选项显示不合理的问题，可放下时显示按钮，放不下时自动使用下拉菜单。
- 修复户型外家具、汽车和灯具等物件导致 3D 旋转中心偏移的问题。
- 完善旧版本数据库升级兼容性。

### v0.4.5

新增

- 摄像头新增“实时/快照”显示模式，支持自定义快照刷新间隔；切到后台后自动暂停，返回页面立即恢复。
- 新增全局运行日志，可按级别、分类和关键词筛选，支持刷新、清空和导出；自动遮盖敏感信息。
- 新增户型图自动导图功能，可直接根据当前 3D 视角生成仪表盘底图、户型图、灯光、电视和汽车图层。
- 自动导图重新生成时，可保留已有实体绑定、按钮位置、图标和样式。
- 图片管理支持直接删除自动导图文件夹，并优化图片名称和文件夹切换显示。
- 3D 新增进阶光照设置，可调整主光方向、保存当前光照并恢复默认设置。
- 折线图新增自动阈值模式，可根据不同实体的实际数值范围自动分色，同时保留手动阈值。
- 空调弹窗根据实体实际功能展示运行模式、预设模式、风速和摆风选项；选项较多或文字较长时自动使用下拉菜单。
- 空调关机状态现在会在运行模式中正确显示“关闭”。
- 3D 模型库新增二级分类筛选，查找家具和电器更加方便。
- 同步更新当前默认仪表盘模板及相关控件封面。

优化

- 大幅优化 3D 模型加载与交互性能：模型按需加载、分批调度、材质复用、重复模型批量绘制和静态几何合并。
- 完成家居、电器、门窗、栏杆等模型轻量化，并保留加载失败时的原模型回退。
- 优化 3D 相机拖动阻尼、关闭灯光时的帧率、楼层模型加载范围和地面网格渐隐效果。
- 优化多灯光场景：静态阴影缓存、灯组独立缓存、实时阴影按需更新，减少重复计算。
- 提升自动导图预览与导出清晰度，按照仪表盘原始分辨率生成高清图片。
- 优化自动导图按钮布局、底图排序和逐层导出流程。
- 加快首次进入仪表盘时实体状态和摄像头画面的加载速度。
- 页面进入后台后自动暂停摄像头、扫地机器人地图和历史数据请求，回到前台后自动恢复。
- 摄像头快照刷新时保留上一帧，减少空白和画面闪烁。
- 优化实体列表分页、搜索与统计查询，减少大型实体目录的加载压力。
- 实时状态消息只发送给实际订阅相关实体的页面，降低多页面运行压力。
- 编辑器修改普通属性和折线图属性时改用局部刷新，减少整个画布重复重建。
- 优化控件模板弹窗布局，小窗口下无需反复滚动。
- 统一整理空调、热水器、空气净化器、灯光、窗帘、摄像头、媒体播放器、扫地机器人、电动床、传感器等设备弹窗的显示与动画。
- 优化吸顶灯亮度表现、多灯连续开关延迟以及灯光效果首帧稳定性。

修复

- 修复实时状态消息过多时可能丢失最新状态，以及实体被删除后页面继续显示旧状态的问题。
- 修复仪表盘可能自动使用其他相似实体的问题，现在始终使用用户实际绑定的实体。
- 修复首次进入页面时部分实体状态和摄像头加载较慢的问题。
- 修复摄像头流长时间占用数据库连接，可能导致连接池耗尽的问题。
- 修复摄像头弹窗扫描动画结束后画面短暂卡顿的问题。
- 修复扫地机器人地图首次加载失败后不再重试的问题。
- 修复成组设备和成组摄像头可能无法点击的问题。
- 修复隐藏控件选择框尺寸异常、选择框位置不一致以及实体和图片选择末行被遮挡的问题。
- 修复图标按钮灯光效果闪灭、首帧跳变、层级遮挡以及成组后层级异常的问题。
- 修复电视和汽车导图无法分别生成独立透明图层的问题。
- 修复自动导图预览偶发重建、首次加载超时、取消添加行为和返回页面后预览未恢复的问题。
- 修复自动导图生成图片不够清晰、按钮布局拥挤以及部分图层导出不完整的问题。
- 修复 3D 界面无法加载、轻量模型加载失败和模型分类切换挤压画面的问题。
- 修复 3D 灯光阴影条纹、透明墙体灯光穿透和 WebGL 纹理数量超限问题。
- 修复 3D 平面编辑、移动墙体和调整设置时的卡顿问题。
- 修复空调组合弹窗文字裁剪、长摆风选项显示不全、下拉选择后状态未及时同步的问题。
- 修复热水器关联参数显示不全、空气净化器动画不一致、媒体弹窗标题和选择器尺寸不统一等问题。
- 完善历史版本升级保护：升级前自动备份数据库并生成校验信息，迁移失败时自动恢复，覆盖现有全部历史版本升级。
