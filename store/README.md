# HomeOS 授权商店与授权服务器（store/）

在 **18082** 端口同时提供两件事：

1. **授权商店**：结构、页面与 API 对齐 `https://pay.habridge.cn/`（`/store/v1/*`），视觉为本项目自研的暗色 + 琥珀主题
2. **授权服务器**：`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，Ed25519 签发租约、X25519 加密传输

另有一个自建的运营后台 `/admin` + `/store-admin/v1/*`（参考站没有公开管理台，为让商店可运营而自建）。

商店与授权服务器共用同一个 SQLite 库 —— 这正是参考站能做到"支付后自动发码并立即可激活"的原因。

---

## 一、快速开始（本地联调）

```bash
# 1) 依赖（建议用独立虚拟环境，不要污染客户端运行环境）
python -m venv .venv-store
.venv-store/bin/pip install -r store/requirements.txt

# 2) 生成授权密钥（私钥留在 store/keys/local，公钥自动镜像到客户端 keys/）
.venv-store/bin/python -m store.tools.gen_keys

# 3) 初始化管理员 + 3 条商品 + 版本记录
.venv-store/bin/python -m store.tools.seed

# 4) 起服务（默认 0.0.0.0:18082）
.venv-store/bin/python -m store.run
```

浏览器打开 <http://127.0.0.1:18082/>。管理员账号**必须由你自己指定**：执行 `python -m store.tools.seed` 前设置 `STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD`，缺任一项会直接退出。

```bash
STORE_ADMIN_EMAIL=you@example.com STORE_ADMIN_PASSWORD='一个足够强的口令' \
  .venv-store/bin/python -m store.tools.seed
```

早期版本在缺省时会用代码里写死的默认管理员（口令还公开在本文件里）建号 —— 那等于给每个照文档部署的实例装一个公开后门，现已移除。`start.py` 首次启动会引导你走 `/setup`，也可以用那里的图形界面创建管理员。

验证码投递由 `STORE_MAIL_MODE` 决定，三种取值：

- `log`（代码默认值）—— 只写进服务日志，接口不回显。**用它跑注册流程时用户收不到码，会卡在注册页**，只适合有日志查看权的调试。
- `echo` —— 验证码在 `POST /store/v1/verifications` 响应里回显，注册页会**自动填入并提示**。`start.py` 启动时默认用它（可被环境变量覆盖），本地联调走这条路。
- `smtp` —— 真实发信，需要配 `STORE_SMTP_*`；发信失败会自动回退到日志模式，不会阻断注册。

想让真实用户收到邮件，就配 `STORE_MAIL_MODE=smtp` 和 SMTP 账号。

上面这些（投递方式、SMTP 主机 / 端口 / 加密方式 / 授权码 / 发件人、验证码有效期与重发冷却）**也都能在 `/admin` 的「站点配置 → 注册邮箱验证码」里改，保存即生效、免重启**，口径与支付渠道一致：后台留空 / 填 `0` 表示跟随 `.env`，填了值就以后台为准（授权码只显示打码值，留空不改动、勾「清除已保存的授权码」才回到环境变量）。区块顶部会直接告诉你**当前生效的配置**和「SMTP 是否就绪」——「填了 SMTP 但漏了授权码」过去只会安静地退化成写日志，用户在注册页等一封永远不来的邮件，界面上却每样都填好了。

### 用 `.env` 放本地密钥

SMTP 授权码、支付宝私钥这类东西**别写进代码或提交**。项目根目录的 `.env` 就是给这个用的（已被 `.gitignore` 忽略）：

```bash
cp .env.example .env      # 然后填 STORE_SMTP_PASSWORD 等
```

优先级是 **真实环境变量 > `.env` > `start.py` 内置的开发默认值**，所以 CI/容器里注入的变量会自然压过本地文件。

QQ 邮箱的填法（注意 `STORE_SMTP_PASSWORD` 要用**授权码**，不是登录密码）：

```ini
STORE_MAIL_MODE=smtp
STORE_MAIL_FROM=HomeOS <156120718@qq.com>
STORE_SMTP_HOST=smtp.qq.com
STORE_SMTP_PORT=465
STORE_SMTP_USERNAME=156120718@qq.com
STORE_SMTP_PASSWORD=<QQ 邮箱设置里生成的授权码>
STORE_SMTP_USE_SSL=true
```

163 邮箱同理（`smtp.163.com`）。配好后启动日志里不再出现 `[验证码]` 明文，接口返回 `delivered: true`；若想在本机也能同时看到码，再加 `STORE_EXPOSE_VERIFICATION_CODE=true`（**生产必须保持 false**）。

---

## 二、自检

```bash
# 协议级自检：用客户端自己的 crypto.py 做字节级对齐校验
.venv-store/bin/python -m store.tools.smoke      # 全部通过

# 真实链路端到端：子进程起 store.run + 真实 socket + 客户端整套授权栈
.venv-store/bin/python -m store.tools.e2e        # 44 项
```

- `smoke.py` 用 `httpx.ASGITransport` 在**同进程**内直连应用，覆盖：传输加解密往返、租约签发/客户端验签、activate→heartbeat→recover、商店只读接口、注册下单模拟支付、增量包、后台停用/强制解绑、优惠码、订单取消/过期/归档、授权备注、自助解绑冷却、邀请奖励与提现审核、支付宝签名拼接规则/往返/篡改拒绝/裸 base64 密钥解析、异步通知验签（含错误密钥与金额不符必须拒绝、重复通知不重复发码）、**后台支付巡检**（已付款但通知丢了的单必须被认领并履约、本地已过期而渠道侧还开着的单必须被关掉、没事可做时返回 `None`、节流窗口内不重复查同一笔单）、0 元订单直接开通、静态资源完整性（模板/CSS 引用都存在、JS 可被 node 解析、字体未截断）、前后端方法契约，以及「零配置下客户端默认指向自建授权服务器、公钥镜像与服务器同源、生产端点已彻底移除」的静态断言。

  巡检这条检查是有来历的：`store/payments/sweeper.py` 曾把 `result.queried` 写成 `result.queryed`，而巡检跑在 `app.py` 的 `try/except Exception` 里——异常被吃成一行 `logger.exception`，服务照常启动、下单照常成功，只是每 30 秒往日志里刷一次 traceback，**查单、认领已付款订单、关闭过期渠道交易三件事一件都没发生**。界面上看不出异常，只有「用户付了钱、订单还停在待支付」慢慢堆成工单。而 `store/tools` 里当时搜不到任何 `sweep`，所以这个错别字能一路跑到线上。凡是跑在 `try/except Exception` 里的**后台循环**（巡检、清理、重试），都要有一条把它当黑盒跑一轮的自检，否则它坏了没人知道。

  巡检的状态登记（见下节）也有两条检查：`check_payment_sweep_loop_runs()` 用真实 `lifespan_context` 起一次服务，等循环自己跑完第一轮，专门盯「单轮跑得通但**没人去跑**」——循环漏了 `configure_sweep_loop`、或忘了换成登记状态的入口，都会让后台永远停在「尚未启动」而单轮检查全绿；`check_admin_dom_bindings()` 里钉死「后端 `HEALTH_*` 常量 ↔ 前端 `SWEEP_HEALTH` 文案」一一对应，因为缺文案不会报错，徽标会静默退化成「尚未启动」——把「连续失败」说成别的东西，正是这块报警卡片最不该出的错。
- 其中 `check_theme_matches_app()` 还会比对商店主题与 `frontend/static/app.css` 的令牌（`--hb-bg`/`--hb-accent`/`--hb-success` 必须等于 `--bg`/`--accent`/`--success`），并锁定 `theme.css` 在 `store.html` 中最后加载、后台模板不再内联 `<style>`。
- `e2e.py` 用 `subprocess` 真起服务（真实 socket），并用客户端自己的 `config.load_settings` + `LicenseEndpointPool` + `LicenseTransportCipher` + `LeaseVerifier` + `LicenseService` 走完整 HTTP 链路，验证「商店发码 → 客户端 ACTIVE → 心跳续租 → 后台吊销 → 客户端 REVOKED → 冷却期内无法重绑」。

两者都用临时目录，不会污染 `store/data` 与 `store/keys`。`e2e.py` 默认用 18082，被占用时自动退让到随机端口。

---

## 三、客户端默认已指向自建授权服务器（零配置）

客户端默认值写在 `backend/app/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像
`keys/`、keyId 与指纹均为自建默认。**不设任何环境变量**，起服务后即可在 `/license`
页用「激活码 + 购买邮箱」激活（授权码来自账号中心）：

```bash
.venv-store/bin/python -m store.run     # 终端 A：授权服务器 + 商店
python start.py                         # 终端 B：客户端
```

需要把授权服务器部署到别处时才用环境变量覆盖（例如局域网内另一台机器）：

```bash
export APP_DATA_DIR=/tmp/hb-client-dev
export APP_LICENSE_SERVER_URL=https://license.example.com
export APP_LICENSE_KEY_ID=hb-local-2026
export APP_LICENSE_PUBLIC_KEY_FILE=/path/to/license-public.pem
export APP_LICENSE_PUBLIC_KEY_SHA256=<gen_keys 打印的签名公钥 sha256>
export APP_LICENSE_TRANSPORT_KEY_ID=hb-local-transport-2026
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE=/path/to/license-transport-public.pem
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256=<gen_keys 打印的传输公钥 sha256>
```

说明：

- **厂商生产节点与生产公钥已从代码中彻底移除**，`store.tools.smoke` 用断言锁住「零配置指向自建」与「生产残留为零」。
- 只设 `APP_LICENSE_SERVER_URL` 时，客户端会把批次**收敛为单条 `direct`**，不会散到其它批次节点。
- 需要多批次时用 `APP_LICENSE_SERVER_BATCHES='esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083'`（`;` 分隔批次，`|` 分隔组内地址，空组表示禁用）。
- `APP_LICENSE_TRUSTED_PUBLIC_KEYS='keyId:公钥路径:sha256|keyId2:路径:sha256'` 可整体替换可信公钥表。
- 指纹按 PEM **文件字节** 计算，所以 `keys/` 镜像必须与 `store/keys/local/` 逐字节一致（有断言防漂移）。

### 重启时的联网确认

客户端启动时会先做一次联网确认（`recover`），失败按性质分流：

- **确认吊销**（403 且含 `code=REVOKED` / `revoked: true`，服务端已明确停用）→ 保持拦截，本地授权已被清空，状态 `REVOKED`。
- **其余失败**（网络不可达、服务端 5xx）→ **不锁死**，把判定权交回离线验签：租约未过期则 `CONNECTION_WARNING`（门禁放行），已过期则 `LEASE_EXPIRED`（拦截）。

心跳循环会持续重试，服务器恢复后自动续租回到 `ACTIVE`。这样「离线验签」才真正成立：授权服务器短暂不可达不会让持有有效租约的安装失去功能。`store.tools.e2e` 对这条语义有断言（断网重启放行 / 吊销后重启仍锁死）。

---

## 四、环境变量

下面的变量都可以写进项目根目录的 `.env`：把 `.env.example` 复制成 `.env` 再按需取消注释（`.env` 已被 gitignore，模板本身随仓库分发）。
优先级：**真实环境变量 > `.env` > 代码默认值**。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `STORE_HOST` / `STORE_PORT` | `0.0.0.0` / `18082` | 监听地址 || `STORE_BASE_URL` | 由请求推导 | 生成支付二维码、回调链接用的外部基址 |
| `STORE_DATA_DIR` | `store/data` | SQLite 与商品图目录 |
| `STORE_LICENSE_KEYS_DIR` | `store/keys/local` | 授权密钥目录（私钥留服务端） |
| `STORE_MAIL_MODE` | `log`（`start.py` 下为 `echo`） | `log` \| `echo` \| `smtp` |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 是否在接口响应里回显验证码（仅本地，**生产必须 false**） |
| `STORE_SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_USE_SSL` / `_STARTTLS` | — | SMTP 发信（`_PASSWORD` 填授权码，不是登录密码） |
| `STORE_PAYMENT_PROVIDER` | 空（未配置渠道 → 拒绝建单） | `mock` \| `alipay`（也可以在 `/admin` 站点配置里改，DB 值优先） |
| `STORE_ALLOW_MOCK_PAYMENTS` | `false` | 是否允许模拟收银台。**默认关闭**；必须与 `STORE_PAYMENT_PROVIDER=mock` 同时设置才能用，仅供本地联调 |
| `STORE_ALIPAY_APP_ID` | — | 开放平台应用 APPID |
| `STORE_ALIPAY_APP_PRIVATE_KEY_PATH` / `STORE_ALIPAY_PUBLIC_KEY_PATH` | — | **推荐**：应用私钥 / 支付宝公钥的 PEM 文件路径 |
| `STORE_ALIPAY_APP_PRIVATE_KEY` / `STORE_ALIPAY_PUBLIC_KEY` | — | 等价的内联写法（单行裸 base64） |
| `STORE_ALIPAY_GATEWAY_URL` | 生产网关 | 沙箱填 `https://openapi.alipaydev.com/gateway.do` |
| `STORE_ALIPAY_SELLER_ID` | — | 可选：核验通知里的卖家号 |
| `STORE_ALIPAY_NOTIFY_URL` / `STORE_ALIPAY_RETURN_URL` | 由 `STORE_BASE_URL` 推导 | 可选：用内网穿透时指向穿透域名 |
| `STORE_ALIPAY_TRANSACTION_DESCRIPTION` | `HomeOS 授权` | 交易标题（出现在支付宝账单里） |
| `STORE_ALIPAY_VERIFY_RESPONSE` | `true` | 是否校验支付宝响应签名，除排障外不要关 |
| `STORE_LEASE_TTL_SECONDS` | `604800` | 租约有效期（7 天），心跳 300s 续租 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期。**真实收款必须调大**，见下节 |
| `STORE_DEVICE_RELEASE_COOLDOWN_SECONDS` | `28800` | 解绑冷却（8 小时） |
| `STORE_VERIFICATION_TTL_SECONDS` / `_COOLDOWN_SECONDS` | `600` / `60` | 验证码有效期 / 重发冷却 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_ADMIN_EMAIL` / `STORE_ADMIN_PASSWORD` | —（**必填**） | `seed` 初始化管理员；缺失时任一项都会让 `seed` 直接退出，不再有内置默认值 |

站点名、公告、客服邮箱、维护模式、邀请比例、提现手续费、解绑冷却等**运行时配置**存在数据库里，直接在 `/admin` 的"站点配置"里改，不需要重启。

邮件与验证码那几项（`STORE_MAIL_MODE` / `STORE_SMTP_*` / `STORE_MAIL_FROM` / `STORE_VERIFICATION_*` / `STORE_EXPOSE_VERIFICATION_CODE`）和支付宝的 `STORE_ALIPAY_*` 也搬进了「站点配置」，同样是 DB 值优先、留空跟随 `.env`，改完免重启。两个顺手加的排障入口：

- **发送测试邮件**（「站点配置 → 注册邮箱验证码」）—— 往任意邮箱真发一封，复用用户注册走的那条投递路径，但不写验证码记录、不占发信配额。用来区分「我们发不出去」和「对方网关拒收」。
- **当前生效的回调地址**（「站点配置 → 支付」）—— 直接展示后台值 / 环境变量 / 按 `STORE_BASE_URL` 推导三层里最终用的是哪个，省得去猜为什么支付宝不回调。地址填 `localhost` 或内网会被保存时拒掉：那种值支付宝永远访问不到，表现却是「用户付了钱订单不到账」。

---

## 五、接入支付宝（真实收款）

**默认不配置任何渠道**：未配置渠道时商店会拒绝建单（下单 503），而不是回落到模拟收银台
—— 这是刻意的 fail-closed，因为模拟收银台点一下就「已支付」并签发真实授权，**收不到真钱**。
本地联调要同时设 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`
（`start.py` 会自动带上这两个变量）；正式收款请按下面的步骤切到支付宝。

### 5.1 先决条件

1. **企业支付宝**账号，并签约 **当面付**（`alipay.trade.precreate` 扫码收款）。
   个人支付宝签不了这个产品，这是硬门槛。
2. 在[支付宝开放平台](https://open.alipay.com/)创建「网页/移动应用」，拿到 **APPID**。
3. 用「支付宝密钥工具」生成 **应用私钥**、**应用公钥**，把应用公钥上传到开放平台，
   然后下载 **支付宝公钥**。
   - ⚠️ `STORE_ALIPAY_PUBLIC_KEY` 要填**支付宝公钥**，不是你的应用公钥。填错的表现是
     所有异步通知验签失败、订单永远不到账。
4. 一个 **公网 HTTPS 地址**给支付宝回调（异步通知）。本机开发用 ngrok/frp 之类穿透，
   把穿透域名填进 `STORE_ALIPAY_NOTIFY_URL`。

### 5.2 配置

```bash
mkdir -p keys/alipay
# 把关具生成的密钥放进去（PEM 多行，用文件路径最稳）
#   keys/alipay/app_private.pem      应用私钥
#   keys/alipay/alipay_public.pem    支付宝公钥
```

在 `.env` 里：

```ini
STORE_PAYMENT_PROVIDER=alipay
STORE_ALIPAY_APP_ID=202100xxxxxxxxxxxx
STORE_ALIPAY_APP_PRIVATE_KEY_PATH=keys/alipay/app_private.pem
STORE_ALIPAY_PUBLIC_KEY_PATH=keys/alipay/alipay_public.pem

# 真实收款必须调大订单有效期：默认 120 秒扫码根本来不及（二维码本身能活 2 小时）
STORE_ORDER_TTL_SECONDS=900

# 内网穿透时指向穿透域名（必须公网 HTTPS 可达）
STORE_ALIPAY_NOTIFY_URL=https://xxx.ngrok-free.app/store/v1/payments/alipay/notify
STORE_ALIPAY_RETURN_URL=https://xxx.ngrok-free.app/store/payment/return
```

沙箱联调时把 `STORE_ALIPAY_GATEWAY_URL` 换成 `https://openapi.alipaydev.com/gateway.do`，
APPID 和密钥都换成沙箱的。

> ⚠️ **支付渠道是「/admin 站点配置」优先于 `.env` 的。**
> 如果你之前 seed 过站点配置，数据库里存着 `mock`，那么只改 `.env` 是**不生效**的
> （表现就是「照教程改了却还是模拟支付」）。两种改法二选一：
>
> - 到 `/admin` → 站点配置 → 支付渠道，选 **alipay**；或选「**跟随环境变量**」后交给 `.env`
> - 或者把数据库里那行清空：`UPDATE store_settings SET payment_provider='' WHERE id=1;`
>
> 另外，**支付显示名**留空即可（会用「支付宝」）；如果它还是 `模拟支付`，
> 切换渠道后二维码弹窗上的名字也会跟着显示成「模拟支付」。

改完**重启 `start.py`**（商店进程没有 `--reload`，不重启就等于没改）。

### 5.3 到账是怎么确认的

两条路，都会走到 `payments/settlement.py` 的同一段入账逻辑：

1. **异步通知**（主路径）：`POST /store/v1/payments/alipay/notify`
   验签 → 校验 `app_id`/`seller_id` → 校验金额 → 入账发码，返回纯文本 `success`。
2. **主动查单**（兜底）：前端每 3 秒轮询 `GET /store/v1/orders/{orderNo}` 时，
   顺带调 `alipay.trade.query`。穿透掉线、通知延迟时靠它把订单补上。

安全性上做了这几件事：通知验签用支付宝公钥；金额与订单金额不一致直接拒绝入账；
`seller_id` 配了就校验；入账走**带条件的 UPDATE**，所以通知重复推送、或通知与查单
同时到达，都只会发一次码。

「钱付了但订单已超时关闭」是个刻意保留的例外：**照常发码**。钱已经扣了，
把订单丢掉只会制造客服工单。

### 5.4 排障

| 现象 | 多半是 |
| --- | --- |
| 下单返回 503「收款尚未配置完整，缺少…」 | 按提示补 `appId`/私钥/公钥，然后**重启** |
| 下单返回 503「响应验签失败」 | 填的是应用公钥而不是支付宝公钥；或网关地址填错 |
| 下单返回 503「支付宝下单失败」 | 当面付没签约 / APPID 与密钥不匹配 / 金额有误 |
| 扫码付了钱但订单不动 | 通知没到（查穿透是否掉线、URL 是否公网可达）；查单兜底最多晚几秒 |
| 日志刷「通知验签未通过」 | 支付宝公钥填错，或把「应用公钥」当成了「支付宝公钥」 |
| 日志刷「金额不符，拒绝入账」 | 站点里改过价格导致订单金额与实付不一致，需人工核对这笔订单 |

### 5.5 巡检还活着吗：后台概览的卡片与 `/healthz`

支付巡检（`payments/sweeper.py`）跑在 `app.py` 的 `try/except Exception` 里，坏掉时的
表现是**完全无声的**：服务照常启动、下单照常成功、后台每个页面都正常，只是查单、认领
已付款订单、关闭过期渠道交易这三件事都没发生。用户付了钱、订单停在待支付，最后变成
客服工单——运维只能靠翻日志发现。所以巡检必须自己留下可被接口读到的状态：

| 读法 | 位置 |
| --- | --- |
| 人看 | 后台**运营概览**顶部的「支付巡检」卡片（常驻显示，不随健康与否隐藏） |
| 机器看 | `GET /healthz` → `paymentSweep`（`status` 仍只表示进程活着，探活的机器不会被它带偏） |

状态码（`sweeper.HEALTH_*`，前端 `SWEEP_HEALTH` 一一对应，冒烟测试钉死两边一致）：

| health | 含义 | 该做什么 |
| --- | --- | --- |
| `ok` | 最近一轮成功 | 无事 |
| `pending` | 循环还没跑完第一轮 | 稍等刷新 |
| `disabled` | `STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0`，巡检被关掉 | 改配置（这是选择，不是故障） |
| `stopped` | 循环已退出但服务还在跑 | 重启，并查日志里的巡检异常 |
| `never` | 本进程跑过若干轮，一次都没成功 | 看 `lastError` |
| `failing` | 成功过，当前正在连续失败 | 看 `lastError` 与「上次成功」距今多久 |

几个刻意的设计：

- **状态只在内存里，不落库。** 重启后显示「从未成功」本身就是最该看到的信号；落库会把
  上一个进程的成功记录带过来，让刚起就坏的巡检看起来很正常。
- **失败不清 `lastSuccessAt`。** 运维要判断的正是「已经坏了多久」，失败时把它清掉等于
  连这个信息一起抹掉。所以 `_record_failure` 只递减健康度，不动成功时间。
- **`stopped` 由 `finally` 落，并带上本次循环的代号。** 循环以任何方式结束（取消、任务
  异常）都要登记，否则界面会一直显示「上次成功 xx 分钟前」，看着像还活着。代号
  （`generation`）解决的是收尾迟到：旧循环的 `finally` 跑得比新循环的启动还晚时，只有
  当前代号的写入才算数，不会把刚起来的循环标成「已停止」。
- **计数与状态一起原子更新。** 循环跑在 `asyncio.to_thread` 的线程里，状态却被请求线程
  读，所以读写都过 `threading.Lock`——否则可能读到「成功时间已写、失败次数还没清」的
  中间态。

---

## 六、密钥与安全

- `store/keys/local/` 下的私钥**不要提交到任何公开仓库**，它是授权服务器签名与传输的真相源。
- 仓库根 `keys/*.pem` 是**客户端默认读取的公钥镜像**，由 `gen_keys` 从 `store/keys/local/` 自动同步。客户端按 PEM **文件字节** 校验指纹，两处必须逐字节一致（`store.tools.smoke` 有断言防漂移）。
- 轮换密钥：`python -m store.tools.gen_keys --force` 会刷新密钥对并同步镜像，同时打印新的 sha256；若不改用环境变量覆盖，请把新 sha256 更新进 `backend/app/config.py` 的 `DEFAULT_LICENSE_*` 常量。
- 传输层：X25519 ECDH → HKDF-SHA256 → AES-256-GCM，`path` 参与 HKDF/AAD 派生，所以端点路径本身也被认证。
- 租约层：Ed25519 对 canonical JSON 的**原始字节**签名，`leaseSequence` 同 `activationCodeId` 下严格递增。
- `gen_keys` 只在 `--out` 为默认密钥目录时才隐式写 `keys/`；用 `--out <临时目录>`（如 `e2e`）时必须带 `--no-sync`，否则会用一次性密钥覆盖客户端信任锚。

---

## 七、吊销语义（客户端契约）

管理后台"停用设备绑定 / 停用授权"后，对应端点返回 `403 {"detail": "..."}`，文案必须命中以下之一，客户端才判定为**确认吊销**并清空本地授权：

- `实例绑定已停用`
- `客户授权或激活码已停用`
- `客户、激活码或实例绑定已停用`
- `商品授权有效期已结束`

其余 401/403 视为瞬时故障（保留本地授权继续重试）。改文案前请先看 `backend/app/license/service.py` 的 `is_confirmed_revocation`。

---

## 八、目录

```
store/
  run.py               # uvicorn 启动入口
  app.py               # 应用工厂（挂载静态资源、路由、授权机构）
  config.py            # StoreSettings，全部走环境变量
  database.py          # engine / session
  models.py            # 全部表
  schemas.py           # 请求体模型（响应统一 camelCase dict）
  serializers.py       # 响应序列化
  security.py          # 密码哈希、会话 token、激活码/邀请码生成、ISO 时间
  site_settings.py     # 站点/支付/邀请 运行时配置
  mailer.py            # 验证码投递：log | echo | smtp
  password_gate.py     # 登录失败限流
  fulfill.py           # 订单履约：发码 / 追加增量包 / 库存 / 邀请奖励
  referrals.py         # 邀请钱包与积分账本、提现
  features.py          # 客户端能力码目录（中文名 + 说明），与主项目 BASE_FEATURES 对齐
  payments/            # base 接口 + mock 收银台 + 支付宝（签名/下单/验签/查单）+ 统一入账
  payments/sweeper.py  # 后台巡检：认领「已付款但通知丢了」的单、关闭过期渠道交易 + 状态登记（概览 / healthz）
  licensing/           # 服务端 TransportCipher + LeaseSigner + 三端点业务
  api/store.py         # /store/v1/*
  api/license.py       # /v2/*
  api/admin.py         # /store-admin/v1/*
  api/alipay.py        # 支付宝异步通知 + 同步跳转页
  api/pages.py         # 页面路由 + /store-static + /fonts + 商品图 + 模拟收银台
  templates/           # store.html（前台：首页落地页 + 8 个分页）+ admin.html（后台 15 个 panel，样式全部外置）
  static/              # 自研前端资源：设计系统 CSS + 字体/图标 + jquery + 前端 JS
  static/theme.css     # ★ 唯一设计系统：令牌 / 重置 / 排版 / 组件（前台 + 后台 + 收银台共用）
  static/store.css     # ★ 前台页面布局：外壳 + 首页落地页/商品/结算/认证/账号/邀请
  static/admin.css     # ★ 后台页面布局：窄侧栏、面板骨架、统计卡、表格
  tools/gen_keys.py    # 生成密钥对，并同步公钥镜像到客户端 keys/
  tools/seed.py        # 初始化管理员 + 商品 + 版本
  tools/smoke.py       # 协议级自检
  tools/e2e.py         # 真实链路端到端（44 项）
```

前端复刻策略：**结构与契约对齐参考站，视觉为本项目自研暗色主题**。`templates/store.html` 与 `static/store.js` / `static/referrals.js` 不保留参考站原有的 DOM 结构，但保留同一套 `data-store-page` 分页、全部 `id`/`data-*` 钩子与 `api(path) → /store/v1` 契约——布局可以随时重排，前后端接口与 JS 行为不动。图标字体写在 `font.min.css` 里的路径是 `../fonts/font.woff2`，所以 `/fonts` 必须挂在根路径（`app.py` 已处理）。

### 界面主题（暗色 + 琥珀）

主题与主程序（`frontend/static/app.css`）同源：**暗色画布 + 单一琥珀强调色**。参考站那份浅色样板表（`bridge-store.css` / `merged.css` / `referrals.css` / `product-packages.css`）与后台的 Bootstrap 5.3 **已全部删除**，不再有「基线样式 + 事后补丁层」这套结构。

| 文件 | 作用 | 谁加载 |
| --- | --- | --- |
| `static/theme.css` | 设计令牌 + 重置 + 排版 + 全部组件（按钮/表单/卡片/表格/徽标/对话框/提示） | `store.html`、`admin.html`、模拟收银台 |
| `static/store.css` | 前台页面布局（外壳/首页/商品/结算/认证/账号/邀请/维护页） | `store.html`、模拟收银台 |
| `static/admin.css` | 后台页面布局（窄 rail、panels 骨架、统计卡、表格） | `admin.html` |

样式分层即「加载顺序即层级」，不再需要靠特异性互相打赢：

```
theme.css（令牌 + 组件）  →  store.css | admin.css（只排区块，不重定义组件）
```

令牌与主程序逐项对齐：画布 `#151a1f`、面 `#1a2026`、发丝线 `#303840`、强调 `#f2a20d`、成功 `#54bd78`，主按钮为琥珀渐变 `#ffb82e → #ef9900` 配深色字。

维护时的三条硬规矩（都踩过坑，`smoke.py` 已加断言）：

1. **`theme.css` 必须排在任何页面样式表之前。** 组件定义在 `theme.css`，`store.css` / `admin.css` 只负责摆放区块；顺序反了就会出现「页面布局被组件样式反向覆盖」这类难查的问题。
2. **新样式加进对应层级，不要靠提高特异性取胜。** 页面级差异写进 `store.css` / `admin.css`，组件级差异写进 `theme.css` 的组件章节——不要在模板里内联 `<style>`（`smoke.py` 会拦）。
3. **令牌改名即失效。** `--hb-bg` / `--hb-accent` / `--hb-success` 三个值与 `frontend/static/app.css` 的 `--bg` / `--accent` / `--success` 必须一致，`smoke.py` 的 `check_theme_matches_app()` 会直接比对，主程序改色而商店没跟就会 FAIL。

另外两处**内联** HTML 也走同一套令牌，改配色时别漏：`api/pages.py` 的模拟收银台（`_cashier_html`）和 `api/alipay.py` 的同步跳转页（`_RETURN_PAGE`）。

自查手法：换布局最容易出的是「类名写出来了但没有对应样式」——节点照样渲染，只是没有边框和内边距，控制台一声不响。`smoke.py` 的 `check_design_class_coverage()` 会把 `store.js` / `referrals.js` / 模板 `class=` 字面量里的类名逐个到三份样式表里核对；肉眼核对时则用浏览器 DevTools 遍历 `document.querySelectorAll('*')`，把没有生效样式的节点打出来。

---

## 九、后台删除语义（守卫与降级）

后台的删除按钮不是「一律物理删除」。SQLite 连接上开了 `PRAGMA foreign_keys=ON`，而
`Order.product_id` 这类外键没有 `ondelete`（等同 RESTRICT），所以凡是可能撞约束、或会连带
抹掉审计价值数据的删除，后端都会**降级**成一个可恢复动作，并在响应里回 `deleted: false`
加 `reason`；前端据 `deleted` 分支提示。

| 对象 | 允许物理删除的条件 | 不满足时降级为 | 原因 |
| --- | --- | --- | --- |
| 商品 | 无任何授权，且无任何订单 | 下架（`active=false`） | 硬删会撞 `Order.product_id` 的 FK 约束直接 500 |
| 优惠码 | 从未被核销 | 停用 | `coupon_redemptions` 是 ON DELETE CASCADE，硬删会抹掉核销历史 |
| 授权 | 已停用，且无活跃设备绑定 | 409 拒绝（要求先停用/解绑） | 强制「停用 → 再删」两步，避免误点抹掉在用授权 |
| 订单 | 状态为 `cancelled` / `expired` 且未关联授权 | 409 拒绝 | 订单是营收与授权来源凭证；已支付请走退款保留资金流水 |
| 提现申请 | 状态不是 `pending` | 409 拒绝 | 待审申请带着被冻结的积分，删掉会让冻结额度对不上账 |
| 版本记录 | 始终可删（叶子表） | — | 客户端「检查更新」会自动回退到次新记录 |
| 审计日志 | 单条可删；批量要求 `older_than_days ≥ 1` | 400 拒绝 | 让「一键清空全部」在接口层面就不成立 |
| 账号 | 不提供删除 | 仅停用 / 启用 | 账号承载授权与钱包账本 |

### 提示文案必须与守卫同源

确认弹窗会预告「这次是真删还是降级」。**这个预告的数据必须和守卫用同一套口径**，否则管理
员会被误导。踩过的两个坑（`smoke.py` 已加断言锁住）：

- 优惠码用量原本读 `Coupon.redeemed_count` 这个反规范化计数列，而守卫数的是
  `coupon_redemptions` 行。两者一旦漂移，弹窗会写着「尚未被使用，将被彻底删除」，点下去却
  只是停用。现在列表与 `_coupon_payload` 一律以核销记录表为准。
- 商品原本只能拿到前台的 `purchaseCount` / `customerCount`（只数 fulfilled 订单与 active
  授权），和守卫「只要有任意一条引用就下架」不同口径。现在后台列表额外暴露 `licenseCount` /
  `orderCount`（不带过滤，与守卫完全一致），弹窗据此决定结论。

语气跟着结果走：不可恢复的删除用 `tone: 'danger'`（`.hb-button--danger`，红），会降级成停用/下架
这类可恢复结果时用 `tone: 'warning'`（`.hb-button--warning`，琥珀），避免两者长得一模一样。

> 这两个语义色都是自研的：Bootstrap 的 `.btn-warning` 是亮黄底 `#ffc107`，在暗色主题下既突兀
> 又对比度不足；现在 `theme.css` 里的 `.hb-button--warning` 走 `--hb-accent` 同色系实心，
> 后台已经不再引用任何 Bootstrap 类名。

---

## 十、后台骨架与视觉层（单滚动容器 + 控制台观感）

后台最初是「固定高度 + 绝对数字」的骨架，问题是每加一行、一列、一个按钮，压力就转移到
别处：**双滚动条**、**横向溢出**、**同一后台两套框架**。这些不是互相独立的 bug，而是同一个
根因的不同症状，所以不能逐条打补丁。

实测在 1180×760 视口下的三个症状：`audits` 面板页面滚 77px 且表格内部再滚 992px（滚到表格
底部会「卡住」，要再滚才动页面）；`orders` 表格 1095px 塞进 896px 容器，**溢出 201px**，
1280×800 笔记本上右侧的「删除」要横向拖才能点到；9 个表格面板是「标题下一条线 + 容器框一
条线」夹 14px 空档，而概览 / 站点配置又完全没有这两条线。

### 10.1 只留一个滚动容器

照抄主程序的做法（`frontend/static/app.css`：`body{overflow:hidden}` + `.editor-shell{
height:calc(100vh - 52px);overflow:hidden}` + `.panel{overflow:auto}`），后台把 `.admin-main`
当作那个唯一的滚动容器：

```
html, body      { height: 100%; }
body            { overflow: hidden; }
.admin-shell    { height: 100vh; overflow: hidden; }   /* 侧栏 + 主区 */
.admin-main     { flex: 1; min-height: 0; overflow: auto; }   /* ← 滚动只发生在这里 */
```

随之删掉的 `.table-wrap { max-height: calc(100vh - 232px) }` 是这套骨架的病灶：232px 把面板
头、内边距、统计卡等一堆东西硬编码了进去，动任何一处就失准。现在表格高度完全由
`100vh - 面板头 - 筛选条 - 内边距` 自动得出，任何视口都成立。

### 10.2 表头吸顶的三个前提

`sticky` 的吸附参照是**最近的滚动祖先**，因此：

1. **表头的滚动祖先只能是 `.table-wrap`，不能是 `.admin-main`。** 表头会吸附在滚动容器内容
   盒顶部。过去 `.table-wrap` 没有 `overflow`，唯一能产生滚动的是 `.admin-main`（它有
   `padding-top`），两者叠加的结果就是「表头停在 18px，上方留 18px 空档、行内容从缝里穿
   过去」。现在 `.admin-main` 的 `padding-top` 归零，`.table-wrap` 自己就是滚动视口。
2. **`.table-wrap` 必须是自己的纵向滚动容器。** `max-height: min(72vh, 820px)` + `overflow:
   auto`。它与「表头吸顶」不互斥——两者都是那个容器自己的能力；互斥的是「同一个容器里既
   要吸顶又要靠它做页面级滚动」，而那个问题已经由第 1 条解决。
3. **`.admin-main` 的 `padding-top` 必须是 0。** 只要表头可能吸附到 `.admin-main`（例如某
   张表没包在 `.table-wrap` 里），这条就仍然成立。

**代价与取舍**：一张 46 行的表在 `.table-wrap` 里滚动、页面同时在滚，等于一层嵌套滚动。这是
有意的：列头常驻比「少一层滚动」值钱。而表只有三五行时 `max-height` 只封顶不撑高，不会有
空盒子。

**曾经走错的路**：早期版本让 `.table-wrap` 保持无 `overflow`，靠 `@media (max-width:
1420px)` 才开启横向滚动。结果是「窄屏下所有列够得着」与「表头常驻」二选一，选了前者，于是
窄屏（1280×800 笔记本）上表头必失效。现在的做法是**所有宽度下 `.table-wrap` 都是完整滚动
视口**（横纵各滚各的），媒体查询整块删掉，两个诉求不再互斥。

### 10.3 列宽由容器决定，不由内容决定

`.table { table-layout: fixed }`。自动布局下 `min-width: auto` 让每列按内容定宽且不可压缩，
8 列的订单表必然被顶宽；固定布局则把列宽钉死在 `#panel-xxx .table th:nth-child(n)` 上，超出
部分一律省略号，完整值放在 `<span title>`。

单元格内部截断（`max-width` + `white-space: nowrap`）反而是错的方向——`nowrap` 会把每列的
最小内容宽度顶大，表格照样溢出，这点已验证过。

**列宽单位用 px，不用百分比。** 这一条是踩过坑才定的：百分比列宽会随窗口一起缩放，在窄窗口
下连「状态」「有效期」这种短字段都被截断——而这类值（`已完成`、`2027-09-09`）一旦变成省略号
就完全失去意义。现在的规则是：

- **不许截断的列写死 px**：订单号、状态、金额、时间戳、激活码、有效期、操作列。数值来自浏览
  器实测的自然宽度（含单元格内边距），不是估的。
- **可以截断的长文本列留空宽度**：邮箱、商品名、功能码、更新说明、审计详情。`table-layout:
  fixed` 下未指定宽度的列平分剩余空间，这些列本来就有 `title` 悬浮提示兜底。
- **`min-width` 是安全阀**：保底列之和 + 每张不定宽列 150px，装不下就横向滚动，而不是把列挤
  成三个字。

复核手法：把表格克隆到离屏容器、临时改成 `table-layout: auto; width: auto`，逐列量
`scrollWidth` 得到自然宽度；再回到固定布局，遍历 `td` 找 `scrollWidth > clientWidth` 的单元
格。目标是**只剩本该截断的长文本列**——状态胶囊、时间戳、ID 出现在截断清单里就是列宽配错了。

### 10.4 中文口径与列宽是同一件事

后台原本直接渲染后端的英文枚举（`payment_failed`、`addon/issue`、`payment_automatic`），
除了在中文界面里突兀，还直接吃掉列宽——`payment_failed` 比「下单失败」宽一倍多，状态列因此
放不下胶囊。

现在订单状态复用前台账号中心的口径（`static/store.js` 的订单状态映射），提现状态复用钱包
流水口径（`static/referrals.js`），商品类型对齐 `store.js` 的「全授权 / 自定义套餐 / 增量包」
取短说法。**改文案时先看前台是不是已有同一说法，不要另造一套。**

注意 `pending` / `paid` 在订单与提现里含义不同（订单「待付款 / 已付款」vs 提现「待审核 / 已
提现」），所以 `statusBadge(status, labels)` 接受一张标签表，两张表不能合并共用。

同一口径也用在**功能码**上。功能码是主程序的能力码（`backend/app/license/service.py`
的 `BASE_FEATURES` + `backend/app/modules/interaction3d/access.py` 的 `module.3d_interaction`），
决定客户端能用哪些能力。后台过去是逗号分隔 / 手写英文代码的输入框：运营得背代码，抄错一个
字母不会报错——履约照发，客户端只是静默拦截，这类隐性故障极难定位。现在改成中文选择器，
**三处共用同一个组件**（商品「功能码」多选，权益「手工补权益」与「改期 / 开关」单选）：

- 目录定义在 `store/features.py`，由 `GET /store-admin/v1/feature-codes` 下发（`code` /
  `label` / `description` / `groupLabel`）。**新增能力码先改主项目，再补这里**；两边对不上
  等于运营勾了发不出去的能力。
- 实例配置写在根节点的 data-* 上：`data-feature-picker`（标记）、`data-feature-multiple`
  （多选；缺省单选，选中即收起）、`data-feature-empty`（空值摘要文案）。表单里仍然只提交
  一个 `name` 与原来一致的隐藏域（多选存 CSV），所以 `form.elements.xxx.value` 的读取口径
  一行都没改。列表里的功能码列也改显示中文名，代码留在 `title` 里备查。
- 历史数据可能带着目录外的代码（旧版本、脚本导入）：它们会落到「自定义代码」分组里保持勾
  选，否则一保存就被静默丢掉，等于后台擅自改了授权内容。
- 单选实例对应必填字段（权益的功能码），而隐藏域不进浏览器的 `required` 校验，所以提交前
  用 `requireFeatureCode()` 自己拦一道——否则空值会直接打到服务端换回一句 pydantic 校验错误。
  单选选项也不带 `name`（否则 `form.elements.featureCode` 变成 `RadioNodeList`，各处
  `.value` 的语义就变了），互斥由 `change` 处理器自己管。
- 下拉打开时与行内 `⋯` 菜单一样切成 `position: fixed` 现算坐标（`.admin-main` 是
  `overflow: auto` 的滚动容器，`absolute` 弹层会被裁剪），Esc / 点外部 / 祖先滚动都会收起。
  事件统一委托到 `document`：三个实例散落在反复开关的编辑器里，逐个 `addEventListener`
  会越绑越多。

### 10.5 操作列收敛为「主操作 + ⋯ 菜单」

订单行原本最多堆 5 个按钮（标记支付 / 履约 / 退款 / 取消 / 删除），且「履约」与「退款」视觉
权重相同。现在只留推进流程的那一步做主操作，其余收进 `⋯`：

| 面板 | 主操作 | ⋯ 菜单 |
| --- | --- | --- |
| 订单 | 标记支付 / 履约（二者互斥） | 履约、退款、取消订单、删除订单 |
| 商品 | 编辑 | 删除 |
| 激活码 | 停用 / 启用 | 彻底删除 |
| 优惠码 | 停用 / 启用 | 删除 |
| 提现审核 | 通过、驳回 | 删除 |
| 版本发布 / 审计日志 | — | 只有一个动作，不包菜单（多一次点击没有收益） |

后台**没有引入任何前端框架**，所以菜单是手写的（`rowMenu` / `menuItem` + `.admin-main` 上的
一个委托监听）。两个实现要点：

- **菜单标记仍留在单元格内**，靠绝对定位浮起。若把它 `appendChild` 到 `document.body` 以免被
  `overflow` 裁掉，就会离开各表 `<tbody id="xxx-rows">` 上的事件委托，那些处理函数得全部改写。
  留在单元格里则一行都不用动。
- 主区一滚就收起菜单。因为按钮在滚动容器内部、会跟着行一起移动，滚动与悬停无法同时成立。

### 10.6 验证手法

别再靠肉眼扫截图，直接量（`clientWidth`/`scrollWidth`、`getBoundingClientRect()`）：

- **双滚动条**：`documentElement.scrollHeight - innerHeight` 应为 0，且各 `.table-wrap` 的
  `scrollHeight - clientHeight` 应为 0。
- **横向溢出**：宽窗口下 `.table-wrap` 的 `scrollWidth - clientWidth` 应为 0。
- **吸顶**：把主区滚到任意位置，表头 `getBoundingClientRect().top` 应恒等于滚动容器的 `top`。
- **可读性**：遍历所有 `td/th/.pill/p/label`，把前景色与「向上第一个不透明背景」做对比度计
  算，阈值 4.5（大字号 3.0）。这比肉眼看截图可靠——`白底白字` 这种问题肉眼经常漏。
- **下拉菜单被裁**：打开表格**最后一行**的 `⋯`，比较菜单与 `.table-wrap` 的 `top/bottom`。

造演示数据时要留意**密度**：20~30 行的真实数据才暴露得出这些问题，三五行的样例永远是「好看
的」。另外注意 `pending` 订单的 `expires_at`——过期订单会被正常置为 `expired`，想看到「标记支
付」得再造一张 `expires_at` 在未来的单。

### 10.7 修掉的三个隐蔽缺陷

**① `--a-*` 令牌一度挂在 `.admin-shell` 上。** 确认弹窗、轻提示、登录页都是 `<body>` 的直接
子元素，在 `.admin-shell` **之外**。令牌取不到值会让声明在计算值阶段失效：`background` 变透
明（弹窗成了一层没有底色的虚影）、`border-color` 退回 `currentColor`（边框变成近白色）。现象
是「弹窗看着发灰、像半个浮层」，根因却是作用域。现在统一定义在 `:root`，改令牌时别把它挪回
组件选择器上。

**② `⋯` 菜单的翻转判据只看视口。** `.table-wrap` 有 `overflow: clip`（裁圆角 + 窄屏时不让表
格戳出卡片），所以菜单会被裁剪容器切掉。原先只判断 `bottom > innerHeight - 8`，但列表下方还
有内容时（例如「商品」表下面就是新增表单），最后一行的菜单并不会碰到视口底部，于是向下弹
出、被 `.table-wrap` 整块裁掉。现在同时取「裁剪容器底部」和「视口底部」的较小值做判据，向
上也放不下才退回向下。

**③ 窄窗口下右侧列够不着。** 保底列宽是按桌面定的（订单表 1072px），窗口不够宽时如果仍
`overflow: clip`，「操作」列会被裁掉且无法滚到——这是功能问题，不是观感问题。当时的改法是
`max-width: 1420px` 起让 `.table-wrap` 横向滚动，**代价是表头吸顶失效**。
这个二选一后来被推翻了：`.table-wrap` 现在在所有宽度下都是完整滚动视口，横纵各滚各的，
表头照旧常驻（见 10.2）。订单表的保底宽也在第二遍收口时从 1072 收到 1040，消掉 1440 宽度
下那根只为 12px 而存在的横向滚动条（见 10.14）。

### 10.8 视觉层：从「能用的表单」到控制台

骨架修完后界面依然显旧，但那是另一层问题——**结构和观感是两件事**。原来所有文字都在
11–13px，KPI 数值和正文一样大，等于没有层级；状态用框架自带实心 `badge`，一屏几十个亮色
块把视线拉散；卡片、表格、面板各用一套边框，全靠同色的 1px 线分隔。这一层做了三件事：

1. **建立层级。** 页面标题 22px、KPI 数值 26px（等宽数字 + `tabular-nums`，多张卡的数字才能
   对齐）、正文 13.5px、辅助 11.5px。面板标题前加一道 3px 琥珀渐变短条（`h2::before`，零
   HTML 改动就让每个面板有强调色）。
2. **分层表面。** 画布 → 卡片 → 浮层三级，用「1px 顶部高光 + 大范围低透明投影」拉开厚度，
   而不是堆同色边框。卡片走 `--a-card` 渐变。顶部高光用 `::after` 叠一条
   `linear-gradient(90deg, transparent, #ffffff17, transparent)`。
3. **收敛色彩。** 状态统一成 `.pill`（柔和底色 + 同色文字 + 发光光点），替代实心 `badge`。
   琥珀只留给真正的强调与待办（待支付订单、待审提现、维护模式）。

顺带把侧栏从 11 个平铺条目改成五组（`.nav-group`），每项配一个 17px 内联 SVG 图标
（`currentColor` 描边，跟随文字色变化），选中态加左侧琥珀指示条（`::before`）。

一级菜单名按「运营手上要办的事」重写，不再用「数据维护」这类内部视角：

| 一级菜单 | 收纳的面板 |
| --- | --- |
| 业务运营 | 概览、订单、提现审核 |
| 商品营销 | 商品、优惠码、版本发布 |
| 授权用户 | 激活码、设备绑定、账号 |
| 数据资产 | 功能权益、积分流水、客户档案、诊断数据 |
| 系统设置 | 站点配置、审计日志 |

**折叠态是默认态，且一次只展开一组。** 15 个条目全展开时侧栏要滚过一屏才能看到「站点配置」，
折叠后 5 行标题一屏到底。实现上有三处值得留意：

1. 手风琴逻辑在 `activate()` 里顺带完成——切面板时按当前页反查所在分组再展开。
   这样「概览待办」「优惠码 → 核销记录」这类跳转也会落在看得见的菜单上，不会出现
   「面板切了、菜单还收着」的割裂感。
2. 折叠动画走 `grid-template-rows: 0fr → 1fr`，高矮由内容真实决定，不用写死 `max-height`；
   内层容器再配 `visibility` 过渡，收起后才真正移出 Tab 焦点序列。
3. 子项角标（待支付订单 / 待审提现）在分组收起时看不见，所以 `setNavBadge()` 会把该组
   合计挂到一级菜单上；展开时又隐藏它，避免与子项角标重复。

窄屏（`max-width: 860px`）下侧栏本来就是横排平铺，折叠没有意义：那里隐藏一级菜单标题，
把两层折叠容器摊平成 `display: contents`，并显式还原 `visibility`（竖屏折叠态的
`visibility: hidden` 会顺着继承把平铺出来的链接一起藏掉）。

**令牌作用域见 10.7 ①**：`--a-*` 必须定义在 `:root`，否则弹窗 / 提示 / 登录页全部失效。

### 10.9 顺带修掉的回归

`body { overflow: hidden }` 会让**登录页**在很矮的窗口（横屏手机）上被裁掉且无法滚动。登录页
因此改成 `max-height: 100vh` + 自身 `overflow-y: auto`，并把 `margin: 12vh` 换成元素自身的
`padding`（`margin` 不计入 `max-height`，也不会跟着滚动）。

### 10.10 筛选条：控件与 `$('#id')` 必须成对存在

分页改造给商品 / 订单 / 设备绑定三张表补了筛选逻辑（`loadProducts` / `loadOrders` /
`loadBindings` 读 `#product-keyword`、`#order-date-from`、`#order-review`、`#binding-keyword`
等控件），但**对应的控件没有一起加进模板**，`bindPanelFilters()` 也从没被调用过。

这类漏项不是「少个筛选框」那么轻——`$('#order-reset').addEventListener(...)` 在顶层执行时
拿到 `null` 会抛 `TypeError`，**整个内联脚本从这里往后全部不执行**：面板、登录、导航全哑，
页面停在登录态且控制台只有一条 null 错误。表头写「刷新」、JS 找「查询」这种改名也会触发
同样的雪崩。

所以改后台的前端时：

1. **模板里的控件 id 与脚本里的 `$('#id')` 必须一一对应。** 顶层 `$('#x').addEventListener`
   对 `null` 零容忍；用一次性的 grep 核对（`\$\('#([\w-]+)'\)` 抽出的集合 ⊆ 模板的 `id="…"`）
   比事后翻控制台快得多。
2. **`bindPanelFilters()` 必须在 `bootstrap()` 之前调用**（脚本末尾统一调用）：它给筛选控件
   注册 change / input / 回车事件，而 `bootstrap()` 里第一次加载列表就要读这些控件的值。
3. 新增筛选控件要同时补进 `bindPanelFilters()` 的注册表与「重置」按钮的 `resetFilters` 清单，
   否则「重置」按下去控件没反应，运营会以为筛选坏了。

### 10.11 列表的三种瞬时状态：加载中 / 读取出错 / 空

这三种状态过去只有「空」一种（`emptyRow()`），另外两种是**看不见的**：

* 慢查询期间表格还是上一屏的旧数据，用户以为「查询」按钮没生效，于是连点几次；
* 请求失败只弹一条 3.6 秒后消失的 toast，用户回头就不知道列表为什么空着，
  只能反复刷新页面。

现在这两种状态由 `setTableState(key, state)` 在一个地方渲染，入口是 `pagedFetch()`——
它在发请求前先写「正在读取…」占位、成功后清掉忙标记、失败时把错误与**重试按钮**写进表格。
之所以集中在 `pagedFetch` 而不是分散到 19 个 `loadXxx()` 里，是因为分散写法必然漏掉一半。
三个约束：

1. **`PAGED_TABLES` 必须收录每个分页列表的 tbody 选择器。** 漏了不会报错，只是那一张表
   永远没有加载态——所以新增列表时要顺手补进去。
2. **列数从 `<thead>` 现读（`tableSpan`），不要写死。** 写死的话，将来加一列就会整行错位。
3. **失败时保留错误行，不要清成空表。** 「空」和「出错」对运营是两个完全不同的结论。

### 10.12 提交忙态、复制与一次性结果

后台的每一次提交都是**有副作用**的（发码、占库存、扣名额、踢会话），所以：

* **所有表单统一走 `withBusy(form, task)`**：提交期间禁用按钮并换文案。这不是装饰，
  而是「点了没反应就再点一次」的第二道闸——第一道是服务端的条件 `UPDATE`。
* **复制走一个委托处理器（`[data-copy-target]`）**，先建立选区再去写剪贴板。
  剪贴板 API 会因非安全上下文 / 缺少用户激活 / 权限策略失败，那时用户手上已经有选中内容，
  按一次 Ctrl+C 就行；不要给出「复制失败」然后让他自己拖鼠标。
* **产出即交付的操作要有常驻结果面板**，不能只靠 toast。签发激活码后，
  激活码会写进 `#license-issue-result`（带复制按钮）并**保持显示**，
  直到下一次操作替换它——运营的动作是「签发 → 复制 → 切到聊天窗口」，中间一分神，
  toast 早没了。为此 `POST /store-admin/v1/licenses` 的响应补了
  `productName` / `accessExpiresAt`，省得前端再查一次分页列表去凑。

### 10.13 首页是落地页，不是收银入口

首页（`data-store-page="home"`）现在承担「解释 HomeOS 是什么」。区块顺序固定为：
Hero 定位 → 四条事实条 → 购买三步 → 能力矩阵 → 中控示意 → 部署四步 → 授权版本 → 保障 → FAQ。

两条维护约定：

1. **中控示意是纯 CSS 画的（`.hb-console*`），不引入任何截图。** 截图会随产品迭代过期，
   而且换肤时不会跟着变色；纯 CSS 的示意图永远和当前主题一致。
2. **文案里的能力必须能在 `README` 的功能清单里找到出处。** 落地页写的每一条
   （3D 户型、交互舞台、HA 直连、中控配对、气候面板、安防、扫地机地图）都对应
   主程序里真实存在的模块，不要为了版面好看写没做的功能。

新增类名记得同时补进 `store.css`：`smoke.py` 的 `check_design_class_coverage()`
会把模板里的 `class=` 字面量逐个到三份样式表里核对，写漏了直接 FAIL。

### 10.14 第二遍布局收口（15 个面板逐页量过）

10.8 解决的是「有没有层级」，这一遍解决的是「同一件事在不同面板上长得不一样」。同样是量
出来的，不是看截图看出来的：

| 症状 | 量到的数 | 改法 |
| --- | --- | --- |
| 侧栏 5 组默认折叠，15 个入口散在 5 次点击后面 | 展开后 728px 内容 / 659px 可视 | 默认全开，行高 34→32、标题 29→26、组间距 6→4；1440×900 下 699/699 恰好一屏装下 |
| `.stat-grid` 用 `flex-wrap`，同一页不同行的卡宽不一致 | 首行 5 张 194px、次行 4 张 240px | 改 `grid-template-columns: repeat(auto-fit, minmax(186px, 1fr))`，全页统一 194px |
| 积分负债卡的主数字折成 3 行，整排卡片被撑高 | 「1,039,400.5 可用 / 0 冻结」在 194px 卡里 25px 等宽字 `getClientRects().length` = 3 | 主数字只放总额（`balancePoints`），拆解挪进 `.stat__note`；主数字统一单行 + 降档 + 省略号兜底（§10.14.2） |
| 概览两张预警表继承全局 `min-width: 860px`，被 540px 卡片裁掉右列 | 520 容器 / 860 表格 | 给两张表单独 `min-width: 0` + 列宽覆盖，`max-height: min(34vh, 340px)` |
| 订单表常态带一根 12px 横向滚动条 | 保底列 1072px / 容器 1060px | `min-width` 1072 → 1040（等于让可截断的邮箱列少 6px，换掉一根常驻横条） |
| 站点配置 19 个字段、商品编辑器 16 个字段平铺 | 无分组 | 加 `.admin-grid__section`（12px 大写字距 + 右侧细线），按语义切 3–5 段；动作条加顶部细线收口 |
| 版本发布页是「表单在上、列表在下」，其余 5 个 CRUD 面板相反 | 面板块序不一致 | 对齐成「列表在上、编辑器在下」，顺手删掉只为垫间距存在的 `.admin-table-block` |
| 地址栏 hash 与画面不一致 | 无 `hashchange` 监听 | 补监听（面板 id 相同则跳过，避免点击导航时重复加载） |
| `bindPanelFilters()` 被调了两次 | 监听器挂两遍，改一次筛选发两次请求 | 只留一次 |
| 商品编辑器首行 3 个输入框高低不齐 | 「商品码」字段名 258px 折成两行，把它自己的输入框压低 19px（647/666/647） | 字段名收成「商品码」，说明挪进 `.admin-field-hint`；同一行的控件落回 647/647/647 |

#### 10.14.1 字段名必须排得下一行，说明必须写在控件之后

上表最后一条是这次唯一一处「用户肉眼先发现、断言查不出」的错位，所以单独说清成因，免得下次
又在别的地方重犯。

`.admin-grid` 是 `repeat(auto-fit, minmax(186px, 1fr))`：列只会变宽不会变窄，所以**字段名在 186px
内排得下**（`--wide` 表单是 210px）就是它永不换行的充要条件。一旦折行，那个 `.hb-field` 就比同带
的邻居高一行，而 `.hb-field` 各自独立成格（不是 `subgrid`），控件自然被顶下去——同一带的输入框
于是不在一条线上。

两条硬规则，已由 `store/tools/smoke.py::check_field_label_fit` 钉住（74 个字段名全核对）：

1. **字段名不带长括号说明。** 语义解释交给 `.admin-field-hint`。宽度按实测标定：全角 12.24px、
   半角 7px、空格 3.4px，留 8px 余量——当初那条 22 字的字段名算出来 257px，浏览器实测 258px。
2. **说明写在控件之后。** 夹在字段名和控件之间，它同样把控件顶下去，错位照旧。独占整行的
   `admin-grid__full` / `admin-grid__wide` 两条都豁免（列宽由容器给，且没有邻列可比）。

说明文字的颜色用 `--hb-muted`（对卡片背景 5.66:1），比字段名（8.31:1）弱、又在 4.5 对比度下限
之上。**不要用 `--hb-ink-soft`**——那是 10.75:1，比它解释的字段名还亮，层级会反过来；也不要用
`--hb-muted-dim`（3.99:1），低于下限。（此前 `.admin-field-hint` 只有 (0,1,0)，压不过主题里
`.hb-field > span` 的 (0,1,1)，写在 `<label>` 里的说明会被当成字段名渲染成 12px/620 的加粗标签；
现在选择器带上 `.hb-field >` 一层，`<span>` 与 `<small>` 两种写法结果一致。）

#### 10.14.2 概览 KPI 卡的主数字只放一个量级，且必须单行

积分负债卡原来把拆解写进了主数字：`1,039,400.5 可用 / 0 冻结`。这张卡和另外 8 张同在一个
`.stat-grid` 里，行高由最高的那张决定，于是**一张卡的折行会把它整排的卡片一起撑高**（浏览器实测
194px 卡里 25px 等宽字排了 3 行，同行卡片 85px → 108px）。数字本身的量级也被中文字稀释，扫一眼
读不出「负债多少」。

改法是复用营收卡已有的三件套（标签 / 主数字 / `.stat__note`）：

* **主数字只放一个量级**。积分负债给总额 `balancePoints`（= 可用 + 冻结，也就是真正要兑付的数），
  `可用 x · 冻结 y` 放 note。给「可用」会低估要付的账，给 balance 又不写拆解则看不出多少已申请提现。
* **主数字永远单行**：`.stat .stat__value { white-space: nowrap; text-overflow: ellipsis }`。
  少了 `text-overflow`，超长值就只剩 `.stat` 的 `overflow: hidden` 无声截断——那看起来是一个
  「少了一位」的错数字，比折行更危险。完整值兜在 `title` 上。
* **放不下先降档**：`valueSize()` 按字符数给 `.stat__value--sm/--xs`。可用宽 = 列宽下限 186px −
  左右内边距 16px×2 = 154px，等宽字符 ≈ 0.61em（实测 0.59–0.60）：25px 放 10 个、19px 放 13 个、
  15px 放 16 个，所以三档分界取 9 / 13 字。

`check_stat_card_fit` 按同一套标定值核对「阈值 ↔ 字号」的容量关系，并守住「拆解不许再写回
主数字」。字号或阈值任改一边都会 FAIL——因为这两者是一对，只改一个就会让某一档本来该放下的值
开始出省略号。

