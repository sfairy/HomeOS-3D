# 授权商店与授权服务器（backend/src/）

端口 **8802**，同一进程提供：

1. **商店** — 账号、商品、订单、优惠码、邀请（`/store/v1/*`）
2. **授权服务器** — `/v2/activate`、`/v2/heartbeat`、`/v2/recover`（Ed25519 租约 + X25519 传输）
3. **运营后台** — `/admin` + `/store-admin/v1/*`

共用一个 SQLite，所以支付入账后可立刻发码并激活。主应用侧说明见仓库根 [README.md](../../../README.md)。

## 本地启动

推荐仓库根一键起双服务：

```bash
python3 ops/start.py
# 商店: http://127.0.0.1:8802/
```

只起商店：

```bash
# 在仓库根执行；PYTHONPATH 指向本项目 backend/
python -m venv .venv-store
.venv-store/bin/pip install -r homeos-store/backend/src/requirements.txt
PYTHONPATH=homeos-store/backend .venv-store/bin/python -m src.run
```

首次访问会进 `/setup` 建管理员。密钥在启动时生成（私钥 `homeos-store/keys/local/`，公钥镜像到仓库根 `keys/`）。

### 邮件

| `STORE_MAIL_MODE` | 用途 |
| --- | --- |
| `log`（本地默认） | 验证码打在服务日志 / `ops/start.py` 终端，接口不回显 |
| `smtp`（生产必用） | 真实发信；凭据可在 `/admin` → 站点配置 → 注册邮件改，保存即生效 |

生产勿使用任何「响应里回显验证码」的通道（已删除）。SMTP 示例见根目录 `.env.example`。

### 必须单进程

`run.py` 单 worker。不要 `--workers N`，也不要多实例共享同一数据目录：配色快照、进程内限流、巡检状态都在内存里。跨进程安全的限流（登录失败等）走数据库。

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

巡检与入账异常见后台「运营概览」卡片，机器可读 `GET /healthz` 的 `paymentSweep` / `incidents`。

## 环境变量（常用）

写根目录 `.env`。完整列表见 `.env.example`。

| 变量 | 说明 |
| --- | --- |
| `STORE_HOST` / `STORE_PORT` | 默认 `0.0.0.0:8802` |
| `STORE_BASE_URL` | 支付二维码 / 回调基址 |
| `STORE_DATA_DIR` / `STORE_LICENSE_KEYS_DIR` | 数据与私钥目录 |
| `STORE_MAIL_MODE` / `STORE_SMTP_*` | 邮件 |
| `STORE_PAYMENT_PROVIDER` | `alipay` 等；也可只走后台配置 |
| `STORE_ALIPAY_*` / `STORE_WECHAT_*` | 渠道凭据 |
| `STORE_LEASE_TTL_SECONDS` | 租约时长（默认 72h，亦为超时吊销上界） |
| `STORE_ORDER_TTL_SECONDS` | 订单有效期（建议 600–1800，过短易「过期才到账」） |
| `STORE_SETUP_TOKEN` | `/setup` 引导口令；空则自动生成 |

数值 / 布尔写错会**拒绝启动**（刻意）。站点名、公告、邀请、解绑冷却等在 `/admin` 改，免重启。

## 授权与密钥

- 客户端默认连 `http://127.0.0.1:8802`，公钥在仓库根 `keys/`。
- 仓库根 `keys/` 与 `homeos-store/keys/local/` 公钥必须逐字节一致。
- 轮换：旧四件套改名 `*.previous.pem` 再生成新钥；删四个 `*.previous.pem` 关闭重叠窗口。
- 吊销响应必须带 `code=REVOKED`（或 `LICENSE_REVOKED`）/ `revoked: true`；客户端只认结构化字段。
- `activate` / `recover` 会轮换会话与恢复凭证；`leaseSequence` 用数据库原子自增。

## 后台语义（摘要）

| 对象 | 删除行为 |
| --- | --- |
| 商品 / 优惠码 | 有引用则下架或停用，不硬删 |
| 授权 | 须先停用且无活跃绑定 |
| 订单 | 仅未支付且无授权可删；已付走退款 |
| 「标记支付」 | 人工放行，**不计入营收**；「线下收款入账」才计入 |

能力码目录唯一出处：`ops/features.py`（与主应用 `BASE_FEATURES` 对齐）。新增能力先改主应用再补这里。

## 目录结构

```text
homeos-store/
├── backend/src/            # 后端包名 src（PYTHONPATH=backend）
│   ├── run.py app.py config.py
│   └── core/ security/ commerce/ payments/ licensing/ ops/ api/
├── data/                   # 运行时（不入库）
├── keys/local/             # 授权私钥（不入库）
├── frontend/               # pages / src / public
└── dist/                   # templates + static
```

## 前端约定

- 样式源：`frontend/public/static/theme.css` 必须先于 `store.css` / `admin.css`。
- 构建：`bun run --cwd homeos-store build` → `homeos-store/dist/`；`auth-bootstrap` 仍为首屏前 IIFE。
- 配色注入点：构建后的 `dist/templates/*.html` 及页面壳里的 appearance 占位；漏一处会 500（刻意）。

## 支付后发码

个人中心展示与邮件必须同源（按 `license.id` 回读激活码）。发信在入账事务提交之后（BackgroundTasks），失败不回滚授权；巡检补发未送达邮件。履约失败订单由巡检重试（上限见代码常量）。
