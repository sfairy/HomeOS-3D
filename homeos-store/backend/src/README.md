# 授权商店与授权服务器（backend/src/）

端口 **8802**，同一进程提供：

1. **商店** — 账号、商品、订单、优惠码、邀请（`/store/v1/*`）；其中 `GET /store/v1/base-url`
   回答「我的对外地址是什么」（给主应用拼登录页的商店链接用，见
   `security/request_security.request_origin`）
2. **授权服务器** — `/v2/activate`、`/v2/heartbeat`、`/v2/recover`（Ed25519 租约 + X25519 传输）
3. **运营后台** — `/admin` + `/store-admin/v1/*`

共用一个 SQLite，所以支付入账后可立刻发码并激活。主应用侧说明见仓库根 [README.md](../../../README.md)。

## 本地启动

推荐仓库根一键起双服务：

```bash
bun run dev
# 商店: http://127.0.0.1:8802/
# 只起后端（不启 Vite HMR）：bun run dev:backend
```

只起商店：

```bash
# 在仓库根执行；PYTHONPATH 指向本项目 backend/
python -m venv .venv-store
.venv-store/bin/pip install -r homeos-store/backend/requirements.txt
PYTHONPATH=homeos-store/backend node ops/lib/py.mjs -m src.run
```

> 包名与主应用同一套约定：**源码态是 `src`，镜像里是 `app`**（镜像用
> `COPY homeos-store/backend/src ./app` 映射，所以容器内入口是
> `ops/docker/start_store.py` 的 `import app.run`）。本地照抄镜像那条 `-m app.run` 会
> `No module named 'app'` —— 完整说明见 [homeos/backend/src/README.md](../../../homeos/backend/src/README.md)。

首次访问会进 `/setup` 建管理员。密钥在启动时生成（私钥 `homeos-store/keys/local/`，公钥镜像到仓库根 `keys/`）。

`/setup` 的**引导密钥**（`STORE_SETUP_TOKEN` 那份，空则由服务生成后落到 `<数据目录>/setup-token`）在未初始化时随启动打印一次。它只出现一次，所以取它用：`docker logs homeos-store 2>&1 | grep -m1 SETUP-TOKEN=`（或直接读 `docker exec homeos-store cat /data/setup-token`）；用 `localhost` / `127.0.0.1` **未经代理**直连本机时这一栏留空即可。

### 邮件

| `STORE_MAIL_MODE` | 用途 |
| --- | --- |
| `log`（本地默认） | 验证码打在服务日志 / `ops/dev.mjs` 终端，接口不回显 |
| `smtp`（生产必用） | 真实发信；凭据可在 `/admin` → 站点配置 → 注册邮件改，保存即生效 |

生产勿使用任何「响应里回显验证码」的通道（已删除）。邮件也可用 `STORE_MAIL_MODE` / `STORE_SMTP_*` 环境变量配置（读取逻辑见 `src/config.py`；这两组变量**不在** `.env.example` 模板里，需要时手工补进 `.env`）；推荐直接用后台配置。

### 必须单进程

`run.py` 单 worker。不要 `--workers N`，也不要多实例共享同一数据目录：配色快照、进程内限流、巡检状态都在内存里。跨进程安全的限流（登录失败等）走数据库。

启动时 `create_app()` 会调 `homeos_shared.single_process.assert_single_process()` 校验
`WEB_CONCURRENCY` / `UVICORN_WORKERS` / `GUNICORN_WORKERS` / `STORE_WORKERS` 等变量；
配成 >1（或 `auto`）直接拒绝启动。

退款不在此列：`order_refunds.out_request_no` 用确定性幂等键（`RF{订单号}-{累计目标金额}`），该列上的唯一索引就是跨进程闸门，多 worker 也不会把同一笔退款退两次。但「不退两次」不等于「可以多开」——其余内存态仍需单进程。

## 支付

**默认不配置渠道 → 拒绝建单（fail-closed）。** 支持支付宝当面付与微信支付 Native；可在后台同时启用，订单冻结顾客所选渠道。

本地联调：配真实生产凭据，商品临时改 **0.01 元** 自测（无模拟收银台 / 沙箱）。

### 支付宝要点

1. 企业/个体户 + 签约**当面付**；开放平台拿 APPID、应用私钥、**支付宝公钥**（勿填应用公钥）。
2. 公网 HTTPS 回调（可用 ngrok）；无回调时靠前端轮询 + 巡检查单也能入账。
3. `.env` 或 `/admin` 站点配置填写；**后台 DB 值优先于 `.env`**，改完需重启商店进程（无 reload）。
4. 入账：异步通知验签 + 金额校验；主动查单兜底；带条件 UPDATE，重复通知只发一次码。

### 微信要点

五件套：`mchid` + `appid`、商户 API 私钥、商户证书序列号、微信支付公钥、APIv3 密钥（恰 32 字符）。后台「测试凭据」通过后再勾选渠道。

### 排障（常见）

| 现象 | 常见原因 |
| --- | --- |
| 下单 503 缺配置 | 补齐渠道凭据并重启 |
| 验签失败 | 填成了应用公钥 / 密钥不匹配 |
| 付了钱订单不动 | 回调不可达；等轮询/巡检，或查穿透 |
| 改了 `.env` 无效 | 后台仍存着旧渠道值 → 站点配置改回「跟随环境变量」 |
| 启动日志里找不到 `/setup` 引导密钥 | 那一段**只在未初始化时随启动打印一次**：别用 `docker logs -f` 边刷边找（正常请求的访问日志已不显示，横幅不会再被顶走）；日志轮转过就直接读文件 `docker exec homeos-store cat /data/setup-token`，若文件不存在说明已有管理员、窗口早已关闭 |
| 排查时想看到每一条请求 | 设 `STORE_LOG_HTTP_ACCESS=all`：恢复正常返回也会逐条显示（默认只显示 4xx/5xx），且关掉重复折叠 |
| 同一条告警只看到一次，后面只写着「同类已折叠 N 条」 | 这是刻意的：重复告警按窗口折叠（`STORE_LOG_STATUS_DEDUPE_MS`，默认 30 分钟，`0` 关闭）。安全类告警（限流触顶等）会在折叠满 10 / 100 / … 条时各补一行，规模仍看得见；支付与巡检异常日志**不参与折叠**，逐条可见 |
| 日志里只有 `WARNI [src] …`（没时间戳）且看不到 INFO | 说明进程没走到应用 lifespan（`core/console_log.py` 会在那里重装 root 日志） |

巡检与入账异常见后台「运营概览」卡片，机器可读 `GET /healthz` 的 `paymentSweep` / `incidents`。

## 环境变量（常用）

写根目录 `.env`（或后台 `/admin` 站点配置）。`.env.example` 覆盖大部分变量，但 `STORE_MAIL_MODE` / `STORE_SMTP_*` / `STORE_SETUP_TOKEN` **不在模板里**，需要时手工补进 `.env`。

| 变量 | 说明 |
| --- | --- |
| `STORE_HOST` / `STORE_PORT` | 默认 `0.0.0.0:8802` |
| `STORE_BASE_URL` | 商店的**对外身份**（`https://<域名>`）：支付二维码 / 回调基址、同源判定与会话 Cookie 的 `Secure` 都按它推导，也是 `/store/v1/base-url` 对外的答案 |
| `STORE_DATA_DIR` / `STORE_LICENSE_KEYS_DIR` | 数据与私钥目录 |
| `STORE_MAIL_MODE` / `STORE_SMTP_*` | 邮件 |
| `STORE_PAYMENT_PROVIDER` | `alipay` 等；也可只走后台配置 |
| `STORE_ALIPAY_*` / `STORE_WECHAT_*` | 渠道凭据 |
| `STORE_LEASE_TTL_SECONDS` | 租约时长（默认 72h，亦为超时吊销上界） |
| `STORE_ORDER_TTL_SECONDS` | 订单有效期（建议 600–1800，过短易「过期才到账」） |
| `STORE_SETUP_TOKEN` | `/setup` 引导口令；空则自动生成（未初始化时随启动打印，取法见上文） |
| `STORE_LOG_HTTP_ACCESS` | 访问日志详略：`errors`（默认，只显示 4xx/5xx）/ `all`（逐条显示）/ `off`（静默）。与主应用 `LOG_HTTP_ACCESS` 同一份实现；写错按默认处理，**不**拒绝启动 |
| `STORE_LOG_STATUS_DEDUPE_MS` | 重复日志折叠窗口（毫秒，默认 30 分钟，`0` 关闭）：同一条状态告警只显示一次，跨数量级时补「同类已折叠 N 条」。`error`/`fatal` 恒放行；**支付（`src.payments`）与巡检异常（`src.ops.incidents`）永不折叠**；访问日志不受它影响 |

数值 / 布尔写错会**拒绝启动**（刻意）。站点名、公告、邀请、解绑冷却等在 `/admin` 改，免重启。

## 授权与密钥

- 客户端默认连 `http://127.0.0.1:8802`，公钥在仓库根 `keys/`。
- 仓库根 `keys/` 与 `homeos-store/keys/local/` 公钥必须逐字节一致。
- 吊销响应必须带 `code=REVOKED`（或 `LICENSE_REVOKED`）/ `revoked: true`；客户端只认结构化字段。
- `activate` / `recover` 会轮换会话与恢复凭证；`leaseSequence` 用数据库原子自增。

## 后台语义（摘要）

| 对象 | 删除行为 |
| --- | --- |
| 商品 / 优惠码 | 有引用则下架或停用，不硬删 |
| 授权 | 须先停用且无活跃绑定 |
| 订单 | 仅未支付且无授权可删；已付走退款 |
| 「标记支付」 | 人工放行，**不计入营收**；「线下收款入账」才计入 |

能力码目录唯一出处：`ops/contracts/feature_codes.json`（与主应用 `domains/license/features.py` 的 `BASE_FEATURES` 对齐，靠评审保证）。新增能力先改主应用再补这里。

## 目录结构

```text
homeos-store/
├── backend/src/            # 后端包名 src（PYTHONPATH=backend）
│   ├── run.py app.py config.py
│   └── core/ security/ commerce/ payments/ licensing/ ops/ api/
│       # api/ 下按入口面分组：admin/（/store-admin/v1/*）、store/（/store/v1/*）、
│       # payments/（渠道回调 + 授权激活）；pages / setup / telemetry / page_shell 留根
│       # payments/ 下再分 alipay/ wechat/（各 provider + signing）与 common/（base、渠道注册表、
│       # 凭据、http_pool、pem、reconcile、refunds、settlement、sweeper、urls）
│       # core/persistence/：database / migrations / schema（ORM 模型仍在 core/models.py）
├── data/                   # 运行时（不入库）
├── keys/local/             # 授权私钥（不入库）
├── frontend/               # index.html / src / public / vite.config.ts
└── dist/                   # index.html + static
```

### 结构门禁

本包没有像主应用那样在 README 里声明依赖方向，因此门禁**不臆造** B1/B2 分层规则，
只跑与约定无关的两条结构不变量 + 绝对导入检查：

```bash
bun run check:backend-deps     # 同时覆盖 homeos 与 homeos-store
node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --project store
```

- `B3 absolute-src`：禁止 `from src.…` —— 镜像构建期 Cython 烤成 `.so` 后该写法会炸。
- `B4 package-cycle`：`commerce / core / ops / payments / security` 目前是一个 5 元强连通分量
  （**文件级无环**，运行时安全），已冻结进白名单；新增第六个包级环会让门禁变红。
- `B5 file-cycle`：文件级 import 环必须为空。

前端的同一套边界规则（`views` 只能经 `features/<域>/entry`、`shared` 不得反向依赖上层等）
也覆盖本包，由主应用脚本带 `--alias '@store/='` 执行 —— 注意本包别名是 `@store/*` 而非 `@/`，
不传 `--alias` 的话所有 import 都会被当成外部包**静默放行**，跑出假的「0 violation」。


> 与主应用共用的叶子模块（日志降噪三件套、文件锁、schema 建库 / 迁移内核、email 归一化、ETag 协商、
> 可信代理、限流、授权传输参数、能力码目录）**不在本包内**：真源是
> `packages/shared-py/homeos_shared`（两个后端唯一的共享源码包，模块清单见该目录 README）。
> 源码态由本包 `src/__init__.py` 挂好 `sys.path`，镜像态由构建阶段各自 COPY 后内联编译。
> `core/migrations.py` 是**迁移注册表**（版本号 + 每条迁移的表名 / 补列 SQL / 文案前缀），留在本包；
> `database.py` / `run.py` 刻意不共享（判据见该 README）。

## 前端

商店前端的目录、样式加载顺序、`--hb-*` 令牌规则与依赖边界**统一写在**
[`../../frontend/src/README.md`](../../frontend/src/README.md)，本文件不重复，避免两处漂移。

与后端直接相关的两条：

- **配色令牌名双向契约**：`ops/appearance.py` 的 `_TOKEN_NAME` / `_TOKEN_NAME_EXTRA` 必须与前端
  `frontend/src/scene/appearance.ts` 生成的名字对齐 —— 前端生成得出来、后端校验器不认，管理员
  保存配色就会被 422 挡掉。
- **外观注入点**：后端把 `/store-appearance.css` 的 `<link>` 填进 SPA 模板的
  `<!--{{APPEARANCE}}-->`（`api/page_shell.py`）；模板缺占位符时后端会显式报错，不会静默丢配色。

## 支付后发码

个人中心展示与邮件必须同源（按 `license.id` 回读激活码）。发信在入账事务提交之后（BackgroundTasks），失败不回滚授权；巡检补发未送达邮件。履约失败订单由巡检重试（上限见代码常量）。
