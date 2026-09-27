# HomeOS 授权商店与授权服务器（apps/store/）

在 **18082** 端口同时提供两件事：

1. **授权商店**：账号、商品、订单、优惠码、邀请、账号中心，自研暗色 + 琥珀主题
2. **授权服务器**：`/v2/activate`、`/v2/heartbeat`、`/v2/recover`，Ed25519 签发租约、X25519 加密传输

另有一个自建的运营后台 `/admin` + `/store-admin/v1/*`（参考站没有公开管理台，为让商店可运营而自建）。

商店与授权服务器共用同一个 SQLite 库 —— 这正是「支付后自动发码并可立即可激活」的原因。

---

## 一、快速开始（本地联调）

```bash
# 1) 依赖（建议用独立虚拟环境，不要污染客户端运行环境）
python -m venv .venv-store
.venv-store/bin/pip install -r apps/store/requirements.txt

# 2) 起服务（默认 0.0.0.0:18082）
#    授权密钥在启动时自动生成（私钥留在 apps/store/keys/local，公钥镜像到客户端 keys/）；
#    商品目录与站点配置由 apps.store.app 启动时幂等补齐。
.venv-store/bin/python -m apps.store.run
```

浏览器打开 <http://127.0.0.1:18082/>，首次部署会引导到 `/setup` 页面创建管理员账号。早期版本在缺省时会用代码里写死的默认管理员（口令还公开在本文件里）建号 —— 那等于给每个照文档部署的实例装一个公开后门，现已移除。本地非 Docker 也可直接运行仓库根 `ops/start.py`，它会一并起主应用与商店。

验证码投递由 `STORE_MAIL_MODE` 决定，两种取值：

- `smtp` —— **生产唯一的合法取值**：真实发信，需要配 `STORE_SMTP_*`。发信失败不会阻断流程，但接口会如实回 `delivered: false` 与 `deliveryError`（注册页据此提示失败，而不是让用户对着收件箱干等）。
- `log`（代码默认值）—— 只写进服务日志，接口不回显。**用它跑注册流程时用户收不到码，会卡在注册页**，只适合有日志查看权的调试（`ops/start.py` 本地就是这条，验证码会打印在它的终端里）。

> **`echo` 与 `STORE_EXPOSE_VERIFICATION_CODE` 都已删除。** 它们会把验证码明文放进 `POST /store/v1/verifications` 的响应里，只对「可判定来自本机」的请求生效 —— 而那道判定依赖对端 IP 与转发头，部署形态一变（同机反代未配可信代理、容器网络）就可能失效，失效的后果是**任何人都能读到别人的验证码**。一个「只在某些拓扑下安全」的凭据回显通道，不该存在于生产代码里。

投递方式、SMTP 主机 / 端口 / 加密方式 / 授权码 / 发件人、验证码有效期与重发冷却，**都能在 `/admin` 的「站点配置 → 注册邮件」里改，保存即生效、免重启**。口径与支付渠道一致：后台留空 / 填 `0` 表示跟随 `.env`，填了值就以后台为准（授权码只显示打码值，留空不改动、勾「清除已保存的授权码」才回到环境变量）。区块顶部会直接显示**当前生效的配置**与「SMTP 是否就绪」，避免「填了 SMTP 但漏了授权码」这种安静退化成写日志、用户在注册页等一封永远不来的邮件的情况。

### 用 `.env` 放本地密钥

SMTP 授权码、支付宝私钥这类东西**别写进代码或提交**。项目根目录的 `.env` 就是给这个用的（已被 `.gitignore` 忽略）：

```bash
cp .env.example .env      # 然后填 STORE_SMTP_PASSWORD 等
```

优先级是 **真实环境变量 > `.env` > `ops/start.py` 内置的开发默认值**，所以 CI/容器里注入的变量会自然压过本地文件。

QQ 邮箱的填法（`STORE_SMTP_PASSWORD` 要用**授权码**，不是登录密码）：

```ini
STORE_MAIL_MODE=smtp
STORE_MAIL_FROM=HomeOS <156120718@qq.com>
STORE_SMTP_HOST=smtp.qq.com
STORE_SMTP_PORT=465
STORE_SMTP_USERNAME=156120718@qq.com
STORE_SMTP_PASSWORD=<QQ 邮箱设置里生成的授权码>
STORE_SMTP_USE_SSL=true
```

163 邮箱同理（`smtp.163.com`）。配好后启动日志里不再出现 `[验证码]` 明文，接口返回 `delivered: true`。若在本机也想看到码，把 `STORE_MAIL_MODE` 设成 `log` 即可（验证码打印在服务日志里，接口不回显 —— 回显通道已删除）。

---

## 二、本地联调与部署

自动化回归测试收在 `apps/store/tests/`（pytest，依赖见 `apps/store/requirements-dev.txt`，**不进运行时镜像**）。它替掉的只是原来那批一次性脚本（原 `apps/store/tools/` 下的 `smoke.py`、`e2e.py`、`seed.py`、`gen_keys.py`、`migrate_points.py` 已移除）：支付与发码是「收真钱、发真东西」的链路，README 里的口径靠人工走一遍是守不住的。

```bash
.venv-store/bin/pip install -r apps/store/requirements-dev.txt
.venv-store/bin/python -m pytest apps/store/tests -q
```

测试用**临时数据目录与临时密钥目录**，不会碰 `apps/store/data/` 与 `apps/store/keys/local/`；支付宝那几条用真 RSA2 密钥签名（验签、金额比对、幂等只有走完整路径才有意义），发信则把 SMTP 发送换成捕获器。本地非 Docker 直接用仓库根 `ops/start.py` 一键起主应用与商店：

```bash
.venv-store/bin/python ops/start.py
```

Docker / Compose 部署见仓库根 `README.md`。改动前后请人工走一遍关键路径：管理员 `/setup` → 下单（模拟支付）→ 发码 → 客户端 `/license` 激活 → 心跳续租 → 后台吊销。

### 必须单进程（一个 worker）运行

`run.py` 起的是单 worker 的 uvicorn。**不要加 `--workers N`**，也不要在反代后面挂多份商店实例共享同一个数据目录 —— 原因不是数据库（WAL + `busy_timeout` 已经就绪，多连接是安全的），而是**进程内状态**：

| 进程内状态 | 多 worker 下会怎样 |
| --- | --- |
| 站点配色快照（`ops/appearance.py` 启动时 `load()` 一次，保存只刷新处理该请求的那个进程） | 后台改完配色只有一个 worker 立刻生效，其余继续发旧配色，直到重启 |
| 进程内滑动窗口限流（`security/limiter.py`：初始化守卫、支付跳转页查单、发信配额、账号中心「重发激活码邮件」） | 每个 worker 各算一份预算，实际额度被放大成 N 倍 |
| 巡检 / 入账异常（`payments/sweeper.py`、`ops/incidents.py`） | `/healthz` 与后台卡片只反映**收到这次请求的那个进程**，「本进程没跑过」是设计如此（见「六、巡检与入账异常」），前提就是「进程即实例」 |

跨进程一致的那几件（登录与验证码失败限流 `security/password_gate.py`、初始化胜负判定）走的是数据库，不受这条约束。

---

## 三、客户端默认已指向自建授权服务器（零配置）

客户端默认值写在 `apps/server/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像 `keys/`、指纹为自建默认，**keyId 由公钥文件派生**（两侧各自从自己那份镜像算出同一个值，因此不必人工同步字符串）。**不设任何环境变量**，起服务后即可在 `/license` 页用「激活码 + 购买邮箱」激活（授权码来自账号中心）：

```bash
.venv-store/bin/python -m apps.store.run     # 终端 A：授权服务器 + 商店
python ops/start.py                         # 终端 B：客户端
```

需要把授权服务器部署到别处时才用环境变量覆盖（例如局域网内另一台机器）：

```bash
export APP_DATA_DIR=/tmp/hb-client-dev
export APP_LICENSE_SERVER_URL=https://license.example.com
export APP_LICENSE_PUBLIC_KEY_FILE=/path/to/license-public.pem
export APP_LICENSE_PUBLIC_KEY_SHA256=<license-public.pem 文件字节的 sha256>
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE=/path/to/license-transport-public.pem
export APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256=<license-transport-public.pem 文件字节的 sha256>
```

说明：

- **厂商生产节点与生产公钥已从代码中彻底移除**，默认配置只指向自建授权服务器。
- 只设 `APP_LICENSE_SERVER_URL` 时，客户端会把批次**收敛为单条 `direct`**，不会散到其它批次节点。
- 需要多批次时用 `APP_LICENSE_SERVER_BATCHES='esa=;eo=;direct=http://127.0.0.1:18082|http://127.0.0.1:18083'`（`;` 分隔批次，`|` 分隔组内地址，空组表示禁用）。
- `APP_LICENSE_TRUSTED_PUBLIC_KEYS='keyId:公钥路径:sha256|keyId2:路径:sha256'` 可整体替换可信公钥表。
- 指纹按 PEM **文件字节** 计算，所以 `keys/` 镜像必须与 `apps/store/keys/local/` 逐字节一致。

### 密钥轮换（重叠窗口）

`keyId` 是从公钥文件字节派生的 `hb-<16 位十六进制>`，所以直接覆盖密钥会让所有旧客户端**当场失效**。要让存量客户端平滑过渡：

1. 把当前四件套（`license-private.pem` / `license-public.pem` / `license-transport-private.pem` / `license-transport-public.pem`）改名成 `*.previous.pem`；
2. 生成新四件套并把新公钥镜像到仓库根 `keys/`。

服务端发现上一代四件套齐全就把两代都装进密钥环，**按请求里的 keyId 选代解密、并用同一代签名** —— 旧客户端在窗口内照旧心跳；客户端的可信表也会自动多登记一条上一代记录（`keys/license-public.previous.pem` 存在就登记），所以「客户端先升级、服务端后轮换」也不会中断。想立刻关闭窗口就删掉 `*.previous.pem` 四件套（四个缺一不可，只留公钥不算开窗）。

### 重启时的联网确认

客户端启动时会先做一次联网确认（`recover`），失败按性质分流：

- **确认吊销**（403 且含 `code=REVOKED` / `revoked: true`，服务端已明确停用）→ 保持拦截，本地授权已被清空，状态 `REVOKED`。
- **其余失败**（网络不可达、服务端 5xx）→ **不锁死**，把判定权交回离线验签：租约未过期则 `CONNECTION_WARNING`（门禁放行），已过期则 `LEASE_EXPIRED`（拦截）。

心跳循环会持续重试，服务器恢复后自动续租回到 `ACTIVE`。这样「离线验签」才真正成立：授权服务器短暂不可达不会让持有有效租约的安装失去功能。

---

## 四、环境变量

下面的变量都可以写进项目根目录的 `.env`：把 `.env.example` 复制成 `.env` 再按需取消注释（`.env` 已被 gitignore，模板本身随仓库分发）。优先级：**真实环境变量 > `.env` > 代码默认值**。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `STORE_HOST` / `STORE_PORT` | `0.0.0.0` / `18082` | 监听地址 |
| `STORE_BASE_URL` | 由请求推导 | 生成支付二维码、回调链接用的外部基址 |
| `STORE_DATA_DIR` | `apps/store/data` | SQLite 与商品图目录 |
| `STORE_LICENSE_KEYS_DIR` | `apps/store/keys/local` | 授权密钥目录（私钥留服务端） |
| `STORE_MAIL_MODE` | `log`（`ops/start.py` 下同为 `log`） | `log` \| `smtp`。**生产必须 `smtp`**；`echo` 与回显开关已删除 |
| `STORE_SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_USE_SSL` / `_STARTTLS` | — | SMTP 发信（`_PASSWORD` 填授权码，不是登录密码） |
| `STORE_PAYMENT_PROVIDER` | 空（未配置渠道 → 拒绝建单） | 目前只有 `alipay`（也可在 `/admin` 站点配置里改，DB 值优先） |
| `STORE_ALIPAY_APP_ID` | — | 开放平台应用 APPID |
| `STORE_ALIPAY_APP_PRIVATE_KEY_PATH` / `STORE_ALIPAY_PUBLIC_KEY_PATH` | — | **推荐**：应用私钥 / 支付宝公钥的 PEM 文件路径 |
| `STORE_ALIPAY_APP_PRIVATE_KEY` / `STORE_ALIPAY_PUBLIC_KEY` | — | 等价的内联写法（单行裸 base64） |
| `STORE_ALIPAY_GATEWAY_URL` | 支付宝生产网关 | 一般不要改（沙箱网关与开关已删除；自检会在它不等于生产域名时提示一句） |
| `STORE_WECHAT_MCH_ID` / `_APP_ID` | 空 | 微信支付商户号与公众号/应用 appid |
| `STORE_WECHAT_MERCHANT_PRIVATE_KEY(_PATH)` | 空 | 商户 API 私钥（apiclient_key.pem）：签每个请求 |
| `STORE_WECHAT_MERCHANT_SERIAL_NO` | 空 | 商户证书序列号，放进 Authorization 头 |
| `STORE_WECHAT_PLATFORM_PUBLIC_KEY(_PATH)` | 空 | 微信支付公钥（或平台证书）：验回调签名 |
| `STORE_WECHAT_API_V3_KEY` | 空 | **恰好 32 字符**：解密回调资源（AES-256-GCM）。不是证书 |
| `STORE_WECHAT_NOTIFY_URL` | 按 `STORE_BASE_URL` 推导 | 微信回调地址，必须公网可达 |
| `STORE_WECHAT_GATEWAY_URL` | 微信支付生产网关 | 一般不要改 |
| `STORE_ALIPAY_SELLER_ID` | — | 可选：核验通知里的卖家号 |
| `STORE_ALIPAY_NOTIFY_URL` / `STORE_ALIPAY_RETURN_URL` | 由 `STORE_BASE_URL` 推导 | 可选：用内网穿透时指向穿透域名 |
| `STORE_ALIPAY_TRANSACTION_DESCRIPTION` | `HomeOS 授权` | 交易标题（出现在支付宝账单里） |
| `STORE_ALIPAY_VERIFY_RESPONSE` | `true` | 是否校验支付宝响应签名，除排障外不要关 |
| `STORE_LEASE_TTL_SECONDS` | `259200` | 租约有效期（72 小时），心跳 300s 续租。⚠ 该值同时是「离线可用时长」与「吊销生效上界」—— 对持续离线的客户端，停用授权 / 解绑设备最慢要等这么久才生效 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT` | `3600` | `/v2/heartbeat` 与 `/v2/recover` 的**来源 IP** 小时配额。比 `/v2/activate` 固定的 60/小时宽得多：这两个端点收的是高熵令牌（不可枚举），却承载后台心跳与「授权页开着时的状态轮询」。额度**按出口地址**算，多台设备共用同一 NAT 出口时会叠加 —— 授权页卡住且日志里一片 `429` 时调大它 |
| `STORE_ORDER_TTL_SECONDS` | `900` | 订单有效期（秒）。真实收款的二维码在渠道侧能活约 2 小时，这个值太短会让每笔支付都变成「过期后才到账」的复活单。低于 300 且渠道是支付宝时启动会告警；建议 600~1800 |
| `STORE_DEVICE_RELEASE_COOLDOWN_SECONDS` | `28800` | **两次解绑之间**的冷却（8 小时）。解绑之后可以**立即**重新激活（同机或换机都行）；这个间隔只约束「下一次解绑」，用来给换机减速。后台「解绑冷却（秒）」可覆盖它：**留空 = 跟随本变量**，填 `0` = 不限间隔（两者是不同状态，所以库里用 `NULL` 而不是 `0` 表示「没配过」） |
| `STORE_VERIFICATION_TTL_SECONDS` / `_COOLDOWN_SECONDS` | `600` / `60` | 验证码有效期 / 重发冷却 |
| `STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT` | `500` | 验证码发信的**全站**小时上限（所有来源合计）。防「拿商店当发信机轰炸第三方」的兜底闸门；额度之内还按来源 IP（20/小时）、单邮箱（10/小时）各限一层。触顶时日志打 ERROR，并按正常业务量调高 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_SETUP_TOKEN` | 空 | `/setup` 首次初始化的引导口令。留空时启动自动生成一份 32 字节随机串，落到 `data_dir/setup-token`（0600）并打印到标准错误 —— 只有「loopback 对端 + loopback `Host` + 无转发头」的本机直连可以不带它，其余来源（含经反代/隧道）都必须带上，避免未初始化实例「先到先得」 |

**写错就起不来（这是刻意的）**：上面这些数值型 / 布尔型变量在启动时**严格解析** —— `STORE_ORDER_TTL_SECONDS=12o`、`STORE_COOKIE_SECURE=ture`、`STORE_PORT=99999` 都会让进程带着一条点名变量的错误信息拒绝启动，而不是静默回退默认值。只有「未设置」与「留空」才使用默认值（部署模板里常见的空占位写法不受影响）。布尔值接受 `true/false/1/0/yes/no/on/off`（大小写不限）。

静默回退的后果大多不表现为「少了个功能」：例如 `STORE_COOKIE_SECURE` 拼错恰好等于「显式关闭」，HTTPS 部署上的会话 Cookie 会丢掉 `Secure` 标记，而服务照常运行、日志里一个字都没有。另有几条跨字段校验，例如 `STORE_LEASE_TTL_SECONDS` 必须 ≥ 2× `STORE_HEARTBEAT_INTERVAL_SECONDS`，否则健康客户端会在两次心跳之间把租约耗到过期（表现为「网络正常但功能一阵阵消失」，两个配置项单独看都合法）。

站点名、公告、客服邮箱、维护模式、邀请比例、提现手续费、解绑冷却等**运行时配置**存在数据库里，直接在 `/admin` 的「站点配置」里改，不需要重启。邮件与验证码那几项（`STORE_MAIL_MODE` / `STORE_SMTP_*` / `STORE_MAIL_FROM` / `STORE_VERIFICATION_*`）和支付宝的 `STORE_ALIPAY_*` 也搬进了「站点配置」，同样是 DB 值优先、留空跟随 `.env`，改完免重启。

账号中心每张**有效**授权卡上的「一键部署」指令也在这里配：填「站点配置 → 站点信息 → 一键部署脚本地址」即可（脚本路径固定为 `install.sh`，完整命令由服务端拼好下发）。留空则整块不显示 —— 它没有可回落的默认地址，而一个猜出来的地址只会让用户 `curl` 到一个 404。

两个顺手加的排障入口：

- **发送测试邮件**（「站点配置 → 注册邮件」）—— 往任意邮箱真发一封，复用用户注册走的那条投递路径，但不写验证码记录、不占发信配额。用来区分「我们发不出去」和「对方网关拒收」。
- **当前生效的回调地址**（「站点配置 → 支付与维护」）—— 展示后台值 / 环境变量 / 按 `STORE_BASE_URL` 推导三层里最终用的是哪个。地址填 `localhost` 或内网会被保存时拒掉：那种值支付宝永远访问不到，表现却是「用户付了钱订单不到账」。

---

## 五、接入支付宝（真实收款）

**只有支付宝一种渠道，且默认不配置**：未配置时商店会拒绝建单（下单 503），而不是回落到任何「点一下就通过」的收银台 —— 这是刻意的 fail-closed。

> **模拟收银台已删除。** 它曾经是一个「不需要真实付款就能把订单标成已支付并签发真实授权」的本地联调通道（双开关：`STORE_PAYMENT_PROVIDER=mock` + `STORE_ALLOW_MOCK_PAYMENTS=1`）。它的问题不是配置错，而是**只要存在就有被误开到线上的可能** —— 收不到真钱却发得出真授权。本地联调现在只有一条路：配真实的支付宝生产凭据，用 **0.01 元小额自测**（见 5.5）。沙箱环境也删掉了 —— 它和模拟收银台一样，是一个「在生产上被打开后看不出来」的通道。

模拟收银台连同它的页面、路由与短时票据（`commerce/cashier.py`、`CashierTicket`）一起删除，`/store/mock/*` 全部 404。它留下的两条经验仍然有效，别在新代码里重犯：**订单查询凭据永远不进 URL**（那是长期有效、还能查订单详情的 bearer 凭据；URL 会进访问日志、`Referer` 与浏览器历史，详见审计记录 S53），以及**页面凭证要用与订单绑定的一次性票据，而不是长期令牌**。存量库里的 `cashier_tickets` 表会作为孤儿留下，没有任何代码再读写它。

同一条规则也适用于公开 API：`GET /store/v1/orders/lookup/{orderNo}?token=` **已移除** —— 它是唯一一处把 `lookupToken` 从 URL 里收下、再换出订单详情的接口。取单请用 `GET /store/v1/orders/{orderNo}` + `X-Order-Token` 头（账号中心与收银台走的都是这条）；外部集成若还在用旧路径，会拿到 404，改成请求头即可。

### 5.1 先决条件

1. **企业支付宝**账号，并签约 **当面付**（`alipay.trade.precreate` 扫码收款）。个人支付宝签不了这个产品，这是硬门槛。
2. 在[支付宝开放平台](https://open.alipay.com/)创建「网页/移动应用」，拿到 **APPID**。
3. 用「支付宝密钥工具」生成 **应用私钥**、**应用公钥**，把应用公钥上传到开放平台，然后下载 **支付宝公钥**。
   - ⚠️ `STORE_ALIPAY_PUBLIC_KEY` 要填**支付宝公钥**，不是你的应用公钥。填错的表现是所有异步通知验签失败、订单永远不到账。
4. 一个 **公网 HTTPS 地址**给支付宝回调（异步通知）。本机开发用 ngrok/frp 之类穿透，把穿透域名填进 `STORE_ALIPAY_NOTIFY_URL`。

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

# 订单有效期（默认已是 900）。确认与二维码寿命（约 2 小时）别差太多即可
STORE_ORDER_TTL_SECONDS=900

# 内网穿透时指向穿透域名（必须公网 HTTPS 可达）
STORE_ALIPAY_NOTIFY_URL=https://xxx.ngrok-free.app/store/v1/payments/alipay/notify
STORE_ALIPAY_RETURN_URL=https://xxx.ngrok-free.app/store/payment/return
```

网关**一般不要改**：默认就是支付宝生产网关。沙箱网关与后台的「沙箱」开关都已删除（见 5.5 的说明），所以这里不存在「换一套地址先联调」这条路。

> ⚠️ 老教程（以及本文件的历史版本）会教你指向 `openapi-sandbox.dl.alipaydev.com`：那个环境已经不再被本商店支持，指过去只会得到一个「谁都付不了」的收银台。

> ⚠️ **支付渠道是「/admin 站点配置」优先于 `.env` 的。** 数据库里存着的值会盖住 `.env`：如果你之前把渠道存成 `mock`（模拟收银台时代留下的），那个值现在**已经不是一个受支持的渠道**，表现是「照教程改了却还是下单失败」。两种改法二选一：
>
> - 到 `/admin` → 站点配置 → 支付渠道，选 **alipay**；或选「**跟随环境变量**」后交给 `.env`
> - 或者把数据库里那行清空：`UPDATE store_settings SET payment_provider='' WHERE id=1;`
>
> 另外，**支付显示名**留空即可（会用「支付宝」）。历史数据里残留的「模拟支付」不会再被当成显示名（读取时自动回落到「支付宝」），后台保存时也会拒绝再写回这个值 —— 否则顾客会在二维码弹窗上看到「模拟支付」而实际要付真钱。

改完**重启 `ops/start.py`**（商店进程没有 `--reload`，不重启就等于没改）。

### 5.3 到账是怎么确认的

两条路，都会走到同一段入账逻辑：

1. **异步通知**（主路径）：`POST /store/v1/payments/alipay/notify` —— 验签 → 校验 `app_id`/`seller_id` → 校验金额 → 入账发码，返回纯文本 `success`。
2. **主动查单**（兜底）：前端每 3 秒轮询 `GET /store/v1/orders/{orderNo}` 时，顺带调 `alipay.trade.query`。穿透掉线、通知延迟时靠它把订单补上。

安全性上做了这几件事：通知验签用支付宝公钥；金额与订单金额不一致直接拒绝入账；`seller_id` 配了就校验；入账走**带条件的 UPDATE**，所以通知重复推送、或通知与查单同时到达，都只会发一次码。

「钱付了但订单已超时关闭」是个刻意保留的例外：**照常发码**。钱已经扣了，把订单丢掉只会制造客服工单。

### 5.4 排障

| 现象 | 多半是 |
| --- | --- |
| 下单返回 503「收款尚未配置完整，缺少…」 | 按提示补 `appId`/私钥/公钥，然后**重启** |
| 下单返回 503「响应验签失败」 | 填的是应用公钥而不是支付宝公钥；或网关地址填错 |
| 下单返回 503「支付宝下单失败」 | 当面付没签约 / APPID 与密钥不匹配 / 金额有误 |
| 扫码付了钱但订单不动 | 通知没到（查穿透是否掉线、URL 是否公网可达）；查单兜底最多晚几秒 |
| 日志刷「通知验签未通过」 | 支付宝公钥填错，或把「应用公钥」当成了「支付宝公钥」 |
| 日志刷「金额不符，拒绝入账」 | 站点里改过价格导致订单金额与实付不一致，需人工核对这笔订单 |

---

### 5.5 真实收款验收清单（0.01 元小额自测）

**没有沙箱了。** 沙箱环境（网关常量、后台「沙箱」开关、店面提示）已整块删除：它是一个
「能在生产上被单点打开、打开后还看不出来」的通道 —— 沙箱下订单能建、二维码能出，只是那张码
只有沙箱买家账号付得了，真钱一分进不来，表现为**静默停收**。

代价是第一次联调就必须用真钱。做法是标准商户套路：把一个商品临时改成 **0.01 元**，自己扫码付一笔，
走完链路再把价格改回来。这笔钱会真的进你的商户账户，0.01 元的手续费可以忽略。

前置条件（见 5.1）：企业或个体工商户主体、已签约**当面付**、生产 APPID + 应用私钥 + 支付宝公钥。

| # | 动作 | 判定 |
| --- | --- | --- |
| 1 | 后台「站点配置 → 支付渠道」选 `alipay`，填 APPID / 应用私钥 / 支付宝公钥 | 保存后在字段右侧看到「已配置 · 后台配置」（或「环境变量」） |
| 2 | 点「**测试凭据**」 | 结论为「凭据可用：网关已完成验签（探测单号不存在属于预期结果）」 |
| 3 | 确认订单有效期（默认 900 秒） | 支付页没有 TTL 不匹配提示 |
| 4 | 把某个商品价格临时改成 0.01 元 | 商品列表显示 ¥0.01 |
| 5 | 用普通浏览器注册买家账号、下单 | 页面出现二维码 |
| 6 | 用**你自己的真实支付宝**扫码付款 0.01 元 | 订单变「已完成」；支付宝账单里能看到这笔 |
| 7 | 看买家账号中心 | 授权卡上出现激活码 |
| 8 | 看下单用的邮箱 | 收到**同一个**激活码（个人中心与邮件逐字符相同） |
| 9 | 客户端 `/license` 用「激活码 + 购买邮箱」激活 | 激活成功、心跳续租正常 |
| 10 | 把商品价格改回来 | —— |

**没有公网回调也能走完 6→8**：前端每 3 秒轮询会主动查单，30 秒巡检兜底（见十四.3）。有隧道（ngrok/frp）时把 `STORE_ALIPAY_NOTIFY_URL` 指过去，入账会更快。

第 2 步失败时先看它给的解释：

- 「凭据不可用（isv.invalid-app-id / isv.app-not-exist）」→ APPID 不对，或这个应用**没签约当面付**（未签约时网关同样回「应用不存在」，那是签约问题而不是密钥问题 —— 结论里会直接写出来）。
- 「验签失败」/「无法解析支付宝公钥」→ 公钥填错（最常见的是填成了**应用公钥**）。
- 「异步通知地址不可达」→ 回调地址不是公网可达（没有回调也能收款，但建议修好）。

> **已删除的测试通道**（不要再找它们）：模拟收银台（`mock` 渠道与 `/store/mock/*`）、沙箱环境、
> 验证码回显（`mail_mode=echo` 与 `STORE_EXPOSE_VERIFICATION_CODE`）、`/store-api-docs` 文档页、
> 以及「用环境变量关掉支付巡检」（`STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0` 现在会被拒绝，最小 5 秒）。
> 它们的共同点：都能在生产上被单点打开，而打开后的表现是**静默失效**而不是报错。


---

### 5.6 微信支付（Native 扫码）

与支付宝是**并列**的两个渠道。两者可以在后台同时启用，前台会让顾客自己选，订单会把顾客
选的渠道**冻结**下来 —— 之后的异步通知、查单、对账都按订单自己的渠道走，所以运营中途
切换默认渠道不会让在途订单失去对账能力。

**前置条件与支付宝同级**：企业或个体工商户主体 + 商户平台开通「Native 支付」权限。
个人收款码没有 API，接不进来。

**五件套缺一不可**（缺哪个都会在顾客付款那一刻才炸，而且报的是「签名错误」）：

| # | 字段 | 用途 | 最容易错在哪 |
| --- | --- | --- | --- |
| 1 | `mchid` + `appid` | 商户身份 + 应用身份 | 填成了公众号后台的 appid |
| 2 | 商户 API 私钥 | 签**我们发出**的每个请求 | 填成了「APIv3 密钥」 |
| 3 | 商户证书序列号 | 放进 Authorization 头 | 抄错/带了冒号（保存时会拒掉） |
| 4 | 微信支付公钥 | 验**微信推来**的回调 | 填成了自己的应用公钥 |
| 5 | APIv3 密钥（32 字符） | 解密回调资源（AES-256-GCM） | 填成了证书内容（保存时会拒掉） |

第 4 与第 5 项常被混为一谈，但它们管的是两件事：**公钥验签、密钥解密**。回调必须两步都
成功才算一条可信通知 —— 验签只证明「这条消息来自微信」，内容还在密文里。

验收顺序：

| # | 动作 | 判定 |
| --- | --- | --- |
| 1 | 后台「站点配置 → 微信支付凭据」填五件套 | 徽标变「已配置 · 后台配置」 |
| 2 | 点「**测试凭据**」 | 「凭据可用：网关接受了本次签名」 |
| 3 | 「站点配置 → 支付渠道」勾上「微信支付」 | 保存后前台支付页出现两个选项 |
| 4 | 把某个商品临时改成 0.01 元，用**微信**扫一扫付一笔 | 订单变「已完成」；微信账单可见 |
| 5 | 看账号中心与邮箱 | 同一个激活码（个人中心与邮件逐字符相同） |
| 6 | 把价格改回来 | —— |

第 2 步的原理与支付宝那条一样：拿一笔**不存在**的交易去查单，网关回 `ORDER_NOT_EXIST`
恰好证明它接受了我们的签名（签名不对时回的是 `SIGN_ERROR`）。

> **回调地址**：不配就按 `STORE_BASE_URL` 推导成 `/store/v1/payments/wechat/notify`。
> 没有公网回调也能收款（前台每 3 秒轮询 + 30 秒巡检兜底），但有回调会快很多。
---
## 六、巡检与入账异常（可观测性）

### 6.1 支付巡检状态

支付巡检（`payments/sweeper.py`）跑在 `app.py` 的 `try/except Exception` 里，坏掉时的表现是**完全无声的**：服务照常启动、下单照常成功、后台每个页面都正常，只是查单、认领已付款订单、关闭过期渠道交易这三件事都没发生 —— 用户付了钱、订单停在待支付，最后变成客服工单。所以巡检必须自己留下可被接口读到的状态：

| 读法 | 位置 |
| --- | --- |
| 人看 | 后台**运营概览**顶部的「支付巡检」卡片（常驻显示，不随健康与否隐藏） |
| 机器看 | `GET /healthz` → `paymentSweep`（`status` 仍只表示进程活着，探活的机器不会被它带偏） |

状态码（`sweeper.HEALTH_*`）与其中文名都由后端给出：`sweep_status()` 随状态一起下发 `healthLabel`（`sweeper.SWEEP_HEALTH_LABELS`），后台只保留「语气 → 徽标颜色」的映射（`SWEEP_HEALTH_TONE`）。中文名不再自存一份 —— 后端新增一档时，自存的那份会静默落到兜底（「连续失败」曾因此被显示成「等待中」，而这块存在的全部意义就是让坏掉的巡检一眼可见）。

| health | 含义 | 该做什么 |
| --- | --- | --- |
| `ok` | 最近一轮成功 | 无事 |
| `pending` | 循环还没跑完第一轮 | 稍等刷新 |
| `disabled` | `STORE_PAYMENT_SWEEP_INTERVAL_SECONDS=0`，巡检被关掉 | 改配置（这是选择，不是故障） |
| `stopped` | 循环已退出但服务还在跑 | 重启，并查日志里的巡检异常 |
| `never` | 本进程跑过若干轮，一次都没成功 | 看 `lastError` |
| `failing` | 成功过，当前正在连续失败 | 看 `lastError` 与「上次成功」距今多久 |

设计上的三条要点：状态**只在内存里**（重启后显示「从未成功」本身就是最该看到的信号，落库反而会把上一个进程的成功记录带过来）；失败**不清** `lastSuccessAt`（运维要判断的正是「已经坏了多久」）；计数与状态**一起原子更新**（读写都过 `threading.Lock`，否则可能读到「成功时间已写、失败次数还没清」的中间态）。

### 6.2 入账异常计数

有几处异常是**故意**被吞掉的，而且必须继续吞：

| 位置 | 为什么不能抛出去 | 吞掉的后果 |
| --- | --- | --- |
| `payments/settlement.py` 入账后履约 | 渠道收到失败会**无限重推**通知，而每次重推都走同一条失败路径 | 钱已经收到、订单被推到 `fulfillment_failed`，但没有任何接口报错 |
| `api/alipay.py` 同步跳转页对账 | 用户就站在这张页面上等结果，500 等于把支付页打没了 | 这一笔可能停在待支付（异步通知与巡检还会再试） |
| `api/store.py` 订单轮询对账 | 轮询接口 500 会让用户以为整个下单失败了 | 同上 |

过去它们的共同出口是「往日志写一行 traceback」：服务照常、后台一片正常，出的事却正是最该有人立刻知道的那类（钱收了、码没发）。日志是写给已经在翻日志的人看的，不是告警。所以这些异常现在额外记一笔进程内计数（`apps/store/ops/incidents.py`）：

| 读法 | 位置 |
| --- | --- |
| 人看 | 后台**运营概览**的「入账异常」卡片（常驻显示，`0` 也显示 —— 否则没人知道这项功能存在） |
| 机器看 | `GET /healthz` → `incidents`（`status` 仍只表示进程活着） |

字段与巡检同风格：`health`（`ok` / `degraded`，非零即 `degraded`）、`total`、`kinds[]`（类别、中文标签、次数、最近一次的时间 / 订单号 / 错误），以及 `clearedAt` / `clearedBy` / `clearedTotal`。类别与标签在 `incidents.KINDS` 里登记，后台、`/healthz` 与日志讲同一件事。

三条要点：**只在内存里**（同巡检，落库会让刚起来就出问题的进程看起来像「历史遗留」）；`note()` **绝不抛异常**（它唯一的调用场合就是 `except` 块内部，那里再抛等于把刻意吞下的失败重新变成 500，甚至盖掉原始错误）；**有「确认」按钮**（一次抖动会把灯永久点亮，而它是进程内的，按不灭的灯等于没有灯 —— 后台「确认已处理」会清零计数并记审计，卡片上仍能看到「上次确认在 xx 前」；清零**不修复任何订单**，所以确认框里写明了要先处理完 `fulfillment_failed` 的单）。


---

## 七、密钥与安全

- `apps/store/keys/local/` 下的私钥**不要提交到任何公开仓库**，它是授权服务器签名与传输的真相源。
- 仓库根 `keys/*.pem` 是**客户端默认读取的公钥镜像**，由启动时的密钥准备流程（`ops/docker/license_keys.py` / `ops/start.py`）从 `apps/store/keys/local/` 自动同步。客户端按 PEM **文件字节** 校验指纹，两处必须逐字节一致。
- 轮换密钥：按上文「密钥轮换」把现有四件套改名成 `*.previous.pem` 后生成新四件套，镜像到仓库根 `keys/`；若不改用环境变量覆盖，请把新公钥字节的 sha256 更新进 `apps/server/config.py` 的 `DEFAULT_LICENSE_*` 常量。
- 传输层：X25519 ECDH → HKDF-SHA256 → AES-256-GCM，`path` 参与 HKDF/AAD 派生，所以端点路径本身也被认证。
- 租约层：Ed25519 对 canonical JSON 的**原始字节**签名，`leaseSequence` 同 `activationCodeId` 下严格递增。
- 只有写入默认密钥目录（`apps/store/keys/local/`）时才会同步 `keys/` 镜像；用临时目录做一次性测试时不要执行同步，否则会用一次性密钥覆盖客户端信任锚。

---

## 八、吊销语义（客户端契约）

管理后台「停用设备绑定 / 停用授权」后，对应端点返回 `403 {"detail": "...", "revoked": true, "code": "REVOKED"}`。客户端**只认结构化字段**（`code` 为 `REVOKED` / `LICENSE_REVOKED`，或 `revoked: true`）才判定为**确认吊销**并清空本地授权，不再匹配 `detail` 文案（服务端由 `LicenseServerError.as_body()` 统一补齐这两个字段，见 `apps/store/licensing/crypto.py`）。

其余 401/403（无上述字段）视为瞬时故障（保留本地授权继续重试）。改动吊销响应时务必保留结构化 `code` / `revoked`，客户端契约见 `apps/server/license/service.py` 的 `CONFIRMED_REVOCATION_CODES` 与 `is_confirmed_revocation`。

另外两条同样是「确认吊销」的边界：

- **心跳实例不匹配**（`instanceId` 与绑定不符）：按 `403 + revoked` 处理 —— 设备解绑后重新激活会复用同一行绑定，旧设备手里的会话必须当场失效。
- **授权会话过期**（401）：不是吊销，客户端会转 `recover` 换一份新会话。

### 8.1 会话与恢复凭证的轮换

`/v2/activate` 与 `/v2/recover` 各发两份凭据：**会话 token**（心跳用，跟随租约 TTL）与**恢复凭证**（会话失效后换新会话用，有效期 180 天）。过去的规则是「只发不吊销」，于是仍然有效的凭据会堆积（客户端手里只剩最新那份，但旧的会话 token 照样能调心跳续租；恢复凭证本身就能换一份新会话），死行也只增不减。

现在的规则（`licensing/service.py`）：

| 时机 | 会话 | 恢复凭证 |
| --- | --- | --- |
| `activate` | 该绑定只保留**本次发出的这一份**（旧的直接删） | 换新，旧的直接删 |
| `recover` | 该绑定只保留本次新发的这一份 | 沿用；但签发超过 `RECOVERY_TOKEN_ROTATE_AFTER_SECONDS`（30 天）就轮换 |
| 两者 | 顺手删掉该绑定上**已过期**的行 | 同左 |

激活时敢直接删旧凭据，是因为激活响应里就带着新的两份、而激活码客户端自己存着（丢了还能再激活一次）；恢复时**不敢**激进轮换，是因为客户端只在响应里带回 `recoveryToken` 时才会更新本地存储 —— 换了新凭证而响应丢在路上，客户端手里就只剩一枚已作废的凭证。所以轮换由「这枚凭证已经用了很久」触发，被换下的旧凭证降级成 `RECOVERY_TOKEN_GRACE_SECONDS`（24 小时）的**宽限窗口**。净效果是「一枚凭证的有效期」从 180 天收敛到 30 天 + 1 天，而一次丢包仍然只是重试一次。

同一个文件里还修掉了 `leaseSequence` 的读-改-写：它过去是「读内存里的值、加一、写回」，两个并发心跳读到同一个值就会发出两张序号相同的租约，后到的那张被客户端当成重放丢掉，用户突然回到未授权状态，服务端日志里却没有任何异常。现在是一条 `UPDATE licenses SET lease_sequence = lease_sequence + 1 RETURNING lease_sequence`，读与写由数据库放在同一条语句里完成。

---

## 九、后台删除语义（守卫与降级）

后台的删除按钮不是「一律物理删除」。SQLite 连接上开了 `PRAGMA foreign_keys=ON`，而 `Order.product_id` 这类外键没有 `ondelete`（等同 RESTRICT），所以凡是可能撞约束、或会连带抹掉审计价值数据的删除，后端都会**降级**成一个可恢复动作，并在响应里回 `deleted: false` 加 `reason`；前端据 `deleted` 分支提示。

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

**提示文案必须与守卫同源。** 确认弹窗会预告「这次是真删还是降级」，这个预告的数据必须和守卫用同一套口径，否则管理员会被误导。踩过的两个坑：优惠码用量原本读反规范化计数列 `Coupon.redeemed_count`，而守卫数的是 `coupon_redemptions` 行（漂移时弹窗写着「尚未被使用，将被彻底删除」，点下去却只是停用）——现在一律以核销记录表为准；商品原本只能拿到前台的 `purchaseCount` / `customerCount`（只数 fulfilled 订单与 active 授权），与守卫「只要有任意一条引用就下架」不同口径 —— 现在后台列表额外暴露 `licenseCount` / `orderCount`（不带过滤）。

语气跟着结果走：不可恢复的删除用 `tone: 'danger'`（`.hb-button--danger`，红），会降级成停用/下架这类可恢复结果时用 `tone: 'warning'`（`.hb-button--warning`，琥珀）。`theme.css` 里的 `.hb-button--warning` 走 `--hb-accent` 同色系实心（Bootstrap 的 `.btn-warning` 是亮黄底 `#ffc107`，在暗色主题下既突兀又对比度不足），后台已不再引用任何 Bootstrap 类名。

---

## 十、订单与营收口径（人工补记）

后台点「标记支付」并不代表收到了钱 —— 它最常见的用法是「客户催单，先放行」和「赠送 / 补偿」。而营收按 `paid_at` 汇总，所以这一下过去会凭空多出一笔营收。现在的口径是：

| 入口 | 用途 | `manual_settlement` | 计入营收 |
| --- | --- | --- | --- |
| `POST /orders/{no}/mark-paid`（主操作「标记支付」） | 放行订单（客户催单、赠送、补偿） | `true` | **否** |
| `POST /orders/{no}/settle-offline`（⋯ →「线下收款入账」） | 人工确认钱**已收到**（转账 / 现金） | `false` | 是 |
| 渠道异步通知 / 查单（`settle_paid_order`） | 渠道报告收款 | 清为 `false` | 是 |

- 被标记的订单在订单列表状态列带「人工补记」芯片，概览营收卡的注脚里单列 `totalManualCents` / `manualCents`（时间窗另有 `manualOrders`）—— 排除不等于看不见，否则「订单不少、营收偏低」只能靠猜。
- 补记过的订单**不会**被永久挡在营收外：渠道随后真的收到钱时 `settle_paid_order` 会把标记清掉。
- 存量订单不回溯（旧行 `manual_settlement=0`，历史营收数字不变）。要自查历史里疑似人工补记的单：`SELECT order_no FROM orders WHERE payment_provider='manual' AND payment_trade_no IS NULL;`
- 这两条路径共用 `_manual_payment`，守卫 / 抢单 / 履约分流逐字节一致 —— 只改一个入口会出现「同一张单从哪个按钮点进去行为不同」。

---

## 十一、后台前端约定

后台**没有引入任何前端框架**，以下约定都是踩过坑后定下来的，改动时请照做。

### 11.1 只留一个滚动容器

照抄主程序的做法（`frontend/static/app.css`），后台把 `.admin-main` 当作唯一的滚动容器：

```
html, body      { height: 100%; }
body            { overflow: hidden; }
.admin-shell    { height: 100vh; overflow: hidden; }   /* 侧栏 + 主区 */
.admin-main     { flex: 1; min-height: 0; overflow: auto; }   /* ← 滚动只发生在这里 */
```

**不要用 `max-height: calc(100vh - 232px)` 这类硬编码**：它把面板头、内边距、统计卡等一堆东西钉进了一个数字，动任何一处就失准。表格高度应由 `100vh - 面板头 - 筛选条 - 内边距` 自动得出。

### 11.2 表头吸顶的三个前提

`sticky` 的吸附参照是**最近的滚动祖先**，因此：

1. **所有宽度下 `.table-wrap` 都是完整滚动视口**（横纵各滚各的），不要再用媒体查询切换 —— 早期版本让 `.table-wrap` 保持无 `overflow`、靠 `@media (max-width: 1420px)` 才开启横向滚动，结果是「窄屏下所有列够得着」与「表头常驻」二选一。
2. **`.table-wrap` 自己是纵向滚动容器**：`max-height: min(72vh, 820px)` + `overflow: auto`。它与「表头吸顶」不互斥 —— 互斥的是「同一个容器里既要吸顶又要靠它做页面级滚动」，而那个问题由第 3 条解决。表只有三五行时 `max-height` 只封顶不撑高。
3. **`.admin-main` 的 `padding-top` 必须是 0**，否则表头会停在 18px、上方留 18px 空档、行内容从缝里穿过去。

代价与取舍：一张 46 行的表在 `.table-wrap` 里滚动、页面同时在滚，等于一层嵌套滚动。这是有意的 —— 列头常驻比「少一层滚动」值钱。

### 11.3 列宽由容器决定，不由内容决定

`.table { table-layout: fixed }`。自动布局下 `min-width: auto` 让每列按内容定宽且不可压缩，8 列的订单表必然被顶宽；固定布局则把列宽钉死在 `#panel-xxx .table th:nth-child(n)` 上，超出部分一律省略号，完整值放在 `<span title>`。

单元格内部截断（`max-width` + `white-space: nowrap`）反而是错的方向 —— `nowrap` 会把每列的最小内容宽度顶大，表格照样溢出。

**列宽单位用 px，不用百分比。** 百分比列宽会随窗口一起缩放，窄窗口下连「状态」「有效期」这种短字段都被截断，而这类值（`已完成`、`2027-09-09`）一旦变成省略号就完全失去意义。规则是：

- **不许截断的列写死 px**：订单号、状态、金额、时间戳、激活码、有效期、操作列。数值来自浏览器实测的自然宽度（含单元格内边距），不是估的。
- **可以截断的长文本列留空宽度**：邮箱、商品名、功能码、更新说明、审计详情。`table-layout: fixed` 下未指定宽度的列平分剩余空间，这些列本来就有 `title` 悬浮提示兜底。
- **`min-width` 是安全阀**：保底列之和 + 每张不定宽列 150px，装不下就横向滚动，而不是把列挤成三个字。

复核手法：把表格克隆到离屏容器、临时改成 `table-layout: auto; width: auto`，逐列量 `scrollWidth` 得到自然宽度；再回到固定布局，遍历 `td` 找 `scrollWidth > clientWidth` 的单元格。目标是**只剩本该截断的长文本列**。

### 11.4 中文口径与列宽是同一件事

后台原本直接渲染后端的英文枚举（`payment_failed`、`addon/issue`、`payment_automatic`），除了在中文界面里突兀，还直接吃掉列宽 —— `payment_failed` 比「下单失败」宽一倍多，状态列因此放不下胶囊。

现在订单状态复用前台账号中心的口径（`static/store.js` 的订单状态映射），提现状态复用钱包流水口径（`static/referrals.js`），商品类型对齐 `store.js` 的「全授权 / 自定义套餐 / 增量包」。**改文案时先看前台是不是已有同一说法，不要另造一套。** 注意 `pending` / `paid` 在订单与提现里含义不同（订单「待付款 / 已付款」vs 提现「待审核 / 已提现」），所以 `statusBadge(status, labels)` 接受一张标签表，两张表不能合并共用。

同一口径也用在**功能码**上。功能码是主程序的能力码（`apps/server/license/service.py` 的 `BASE_FEATURES` + `apps/server/modules/interaction3d/access.py` 的 `module.3d_interaction`），过去是逗号分隔 / 手写英文代码的输入框：运营得背代码，抄错一个字母不会报错 —— 履约照发，客户端只是静默拦截。现在改成中文选择器，**三处共用同一个组件**（商品「功能码」多选，权益「手工补权益」与「改期 / 开关」单选）：

- 目录定义在 `apps/store/ops/features.py`，由 `GET /store-admin/v1/feature-codes` 下发（`code` / `label` / `description` / `groupLabel`）。**新增能力码先改主项目，再补这里。**
- 实例配置写在根节点的 data-* 上：`data-feature-picker`（标记）、`data-feature-multiple`、`data-feature-empty`。表单里仍然只提交一个 `name` 与原来一致的隐藏域（多选存 CSV），所以 `form.elements.xxx.value` 的读取口径一行都没改。
- 历史数据可能带着目录外的代码：它们会落到「自定义代码」分组里保持勾选，否则一保存就被静默丢掉。
- 单选实例对应必填字段，而隐藏域不进浏览器的 `required` 校验，所以提交前用 `requireFeatureCode()` 自己拦一道。单选选项也不带 `name`（否则 `form.elements.featureCode` 变成 `RadioNodeList`）。
- 下拉打开时与行内 `⋯` 菜单一样切成 `position: fixed` + `popover` 顶层现算坐标（见 11.5），Esc / 点外部 / 祖先滚动都会收起；事件统一委托到 `document`。

### 11.5 操作列收敛为「主操作 + ⋯ 菜单」

| 面板 | 主操作 | ⋯ 菜单 |
| --- | --- | --- |
| 订单 | 标记支付 / 履约（二者互斥） | 履约、线下收款入账、退款、取消订单、删除订单 |
| 商品 | 编辑 | 删除 |
| 激活码 | 停用 / 启用 | 彻底删除 |
| 优惠码 | 停用 / 启用 | 删除 |
| 提现审核 | 通过、驳回 | 删除 |
| 审计日志 | — | 只有一个动作，不包菜单（多一次点击没有收益） |

菜单是手写的（`rowMenu` / `menuItem` + `.admin-main` 上的一个委托监听）。三个要点：**菜单标记仍留在单元格内** —— 若 `appendChild` 到 `document.body` 以免被 `overflow` 裁掉，就会离开各表 `<tbody id="xxx-rows">` 上的事件委托，那些处理函数得全部改写；**弹出层必须带 `popover="manual"`**，见下条；**主区一滚就收起菜单**，因为按钮在滚动容器内部、会跟着行一起移动。

`popover="manual"` 不是装饰，是「`position: fixed` + 现算坐标」成立的前提：`fixed` 的包含块只在祖先没有 `transform` / `filter` / `backdrop-filter` / `contain` 时才是视口，而 `.table-wrap` 与编辑器卡片都为玻璃面挂了 `backdrop-filter: var(--a-glass-blur)` —— 于是弹层被表格 `overflow` 裁掉、还会被表格自己的内部滚动带着漂移（滚过的距离整段算进 `top`），表现是「点了 `⋯` 没反应」。`popover` 把节点放进顶层，包含块与裁剪才回到视口，而节点仍在单元格里，事件委托不受影响。用 `manual` 而非 `auto`：`auto` 的轻关闭发生在 `pointerdown`，会比 JS 早一步合上，与 `hidden` / `is-open` 错位 —— 点外部、Esc、同一时刻只开一个本来就由 `menus.js` 负责。改这一处、`.feature-picker__pop` 一处，加 CSS 里清掉 UA 给出的 `inset: 0` / `margin: auto` / `overflow: auto`（不清会直接改掉盒子行为）。

### 11.6 列表的三种瞬时状态

这三种状态过去只有「空」一种（`emptyRow()`），另外两种是**看不见的**：慢查询期间表格还是上一屏的旧数据，用户以为「查询」按钮没生效、于是连点几次；请求失败只弹一条 3.6 秒后消失的 toast，用户回头就不知道列表为什么空着。

现在由 `setTableState(key, state)` 集中渲染，入口是 `pagedFetch()` —— 它在发请求前先写「正在读取…」占位、成功后清掉忙标记、失败时把错误与**重试按钮**写进表格。之所以集中在 `pagedFetch` 而不是分散到 19 个 `loadXxx()` 里，是因为分散写法必然漏掉一半。三个约束：

1. **`PAGED_TABLES` 必须收录每个分页列表的 tbody 选择器。** 漏了不会报错，只是那一张表永远没有加载态。
2. **列数从 `<thead>` 现读（`tableSpan`），不要写死**，否则将来加一列就会整行错位。
3. **失败时保留错误行，不要清成空表。**「空」和「出错」对运营是两个完全不同的结论。

### 11.7 控件与脚本必须成对存在

分页改造曾给商品 / 订单 / 设备绑定三张表补了筛选逻辑（`loadProducts` / `loadOrders` / `loadBindings` 读 `#product-keyword`、`#order-date-from`、`#order-review`、`#binding-keyword` 等控件），但**对应的控件没有一起加进模板**、`bindPanelFilters()` 也从没被调用过。

这类漏项不是「少个筛选框」那么轻 —— `$('#order-reset').addEventListener(...)` 在顶层执行时拿到 `null` 会抛 `TypeError`，**整个内联脚本从这里往后全部不执行**：面板、登录、导航全哑，页面停在登录态且控制台只有一条 null 错误。表头写「刷新」、JS 找「查询」这种改名也会触发同样的雪崩。所以：

1. **模板里的控件 id 与脚本里的 `$('#id')` 必须一一对应。** 用一次性的 grep 核对（`\$\('#([\w-]+)'\)` 抽出的集合 ⊆ 模板的 `id="…"`）比事后翻控制台快得多。
2. **`bindPanelFilters()` 必须在 `bootstrap()` 之前调用，且只调一次**（调两次会让监听器挂两遍，改一次筛选发两次请求）。
3. 新增筛选控件要同时补进 `bindPanelFilters()` 的注册表与「重置」按钮的 `resetFilters` 清单。

### 11.8 提交忙态、复制与一次性结果

后台的每一次提交都是**有副作用**的（发码、占库存、扣名额、踢会话），所以：

- **所有表单统一走 `withBusy(form, task)`**：提交期间禁用按钮并换文案。这不是装饰，而是「点了没反应就再点一次」的第二道闸 —— 第一道是服务端的条件 `UPDATE`。
- **复制走一个委托处理器（`[data-copy-target]`）**，先建立选区再去写剪贴板。剪贴板 API 会因非安全上下文 / 缺少用户激活 / 权限策略失败，那时用户手上已经有选中内容，按一次 Ctrl+C 就行。
- **产出即交付的操作要有常驻结果面板**，不能只靠 toast。签发激活码后，激活码会写进 `#license-issue-result`（带复制按钮）并**保持显示**，直到下一次操作替换它 —— 运营的动作是「签发 → 复制 → 切到聊天窗口」，中间一分神，toast 早没了。为此管理接口的响应补了 `productName` / `accessExpiresAt`，省得前端再查一次分页列表去凑。

### 11.9 视觉层与导航

**令牌作用域**：`--a-*` 必须定义在 `:root`。确认弹窗、轻提示、登录页都是 `<body>` 的直接子元素，在 `.admin-shell` **之外** —— 令牌取不到值会让声明在计算值阶段失效，弹窗变成一层没有底色的虚影、边框退回 `currentColor`。

**层级与表面**：页面标题 22px、KPI 数值 26px（等宽数字 + `tabular-nums`，多张卡的数字才能对齐）、正文 13.5px、辅助 11.5px；面板标题前加一道 3px 琥珀渐变短条（`h2::before`，零 HTML 改动）。表面分画布 → 卡片 → 浮层三级，用「1px 顶部高光 + 大范围低透明投影」拉开厚度，而不是堆同色边框。状态统一成 `.pill`（柔和底色 + 同色文字 + 发光光点），琥珀只留给真正的强调与待办（待支付订单、待审提现、维护模式）。

**导航**：14 个条目按「运营手上要办的事」分成五组 —— 业务运营（概览、订单、提现审核）、商品营销（商品、优惠码）、授权用户（激活码、设备绑定、账号）、数据资产（功能权益、积分流水、客户档案、诊断数据）、系统设置（站点配置、审计日志）。默认全开（1440×900 下恰好一屏装下），切面板时按当前页反查所在分组并展开；折叠动画走 `grid-template-rows: 0fr → 1fr`，内层容器再配 `visibility` 过渡，收起后才真正移出 Tab 焦点序列。子项角标在分组收起时看不见，所以 `setNavBadge()` 会把该组合计挂到一级菜单上。窄屏（`max-width: 860px`）下侧栏是横排平铺，那里隐藏一级菜单标题、把两层折叠容器摊平成 `display: contents`，并显式还原 `visibility`。

**登录页**：`body { overflow: hidden }` 会让登录页在很矮的窗口（横屏手机）上被裁掉且无法滚动，因此登录页改成 `max-height: 100vh` + 自身 `overflow-y: auto`，并用元素自身的 `padding` 而非 `margin`（`margin` 不计入 `max-height`，也不会跟着滚动）。

**KPI 卡的主数字只放一个量级，且必须单行**：主数字给总额（`balancePoints` = 可用 + 冻结，也就是真正要兑付的数），拆解挪进 `.stat__note`。整排卡片行高由最高的那张决定，一张卡的折行会把它整排一起撑高。配套三件：`.stat__value` 用 `white-space: nowrap; text-overflow: ellipsis`（少了 `text-overflow` 就只剩无声截断，看起来是一个「少了一位」的错数字，比折行更危险），完整值兜在 `title`，放不下时按字符数降档（`.stat__value--sm/--xs`，等宽字符 ≈ 0.61em，可用宽 186px 列 − 32px 内边距 = 154px，三档分界取 9 / 13 字）。

### 11.10 字段名与说明的位置

`.admin-grid` 是 `repeat(auto-fit, minmax(186px, 1fr))`：列只会变宽不会变窄，所以**字段名在 186px 内排得下**（`--wide` 表单是 210px）就是它永不换行的充要条件。一旦折行，那个 `.hb-field` 就比同带的邻居高一行，而 `.hb-field` 各自独立成格（不是 `subgrid`），控件自然被顶下去 —— 同一带的输入框于是不在一条线上。两条硬规则（74 个字段名全核对过）：

1. **字段名不带长括号说明**，语义解释交给 `.admin-field-hint`。宽度按实测标定：全角 12.24px、半角 7px、空格 3.4px，留 8px 余量。
2. **说明写在控件之后。** 夹在字段名和控件之间，它同样把控件顶下去。独占整行的 `admin-grid__full` / `admin-grid__wide` 两条都豁免。

**站点配置是这套规则里唯一的例外，也是唯一踩过坑的地方。** 那六个面板不用 `auto-fit`，列数写死在 `#panel-settings .admin-tab-pane` 上（≥1121px 三列、861–1120px 两列、≤860px 一列）。两个原因：

- **`auto-fit` 配 `span 2` 会生成隐式轨道。** `auto-fit` 条数是算出来的：内容宽 554px、下限 340px 时它只给 1 条轨道，此时 `admin-grid__wide`（`grid-column: span 2`）会让浏览器**凭空补一条 `grid-auto-columns: auto` 的轨道** —— 两条轨道一宽一窄（340 / 200），紧跟其后的 `admin-grid__full` 因为 `1 / -1` 只跨「显式轨道」而拿到 340px 而不是整行 554px，整块栅格还会横向溢出。列数写死就没有这个自由度：3 条配 `span 2` 是 2 ≤ 3，2 条配 `span 2` 是整行，都不会溢出。低于 861px 时 `span 2` 由那条全局的 `@media (max-width: 860px) { .admin-grid__wide { grid-column: 1 / -1 } }` 打回整行，正好和单列档同宽，所以不需要第三条规则。
- **站点配置的字段名比别处长**，因为它全是站点名、URL、密钥、回调地址。原来它跟着普通表单用 210px 下限，列宽只有 240px 出头，长文本字段只能靠 `admin-grid__full` 躲折行 —— 结果是整整一行只有一两个字段、右边空掉三列。改成写死三列（每列 409px）后，那些长字段才敢放进多列带，行也就铺满了。

**代价是档位分界不能凭审美取，得按字段名预算倒推。** 判据从「最小列宽」（`auto-fit` 下轨道只会变宽，是恒定的下限）变成「本档最窄处」，因为列数固定时轨道会随视口一起收窄。实测站点配置里最长的单列字段名「网关地址（留空跟随沙箱开关 / 环境变量）」是 233px（该字段名后来缩短为「网关地址（留空即支付宝生产网关）」，所以这条预算现在更宽裕），要 241px 起；卡片正文宽 ≈ 视口 − 346px（侧栏 252 + 主区内边距 40 + 卡片内边距 40 + 4），于是三列档要 content ≥ 3×241 + 2×14 = 751px、即视口 ≥ 1097px，取 1120px 留余量（1121px 时轨道 249px）。**改档位或改字段名都要重算这一串**，别只改一半。另外「交易标题」（原 380px）和「发件人」（原 358px）就是这条预算逼出来的两次收窄：字段名只留主词，账单口径与显示名写法挪进 `.admin-field-hint`。

**两列档还要单独收一次尾：三字段一带会剩半行。** 站点配置里有三条「三个一列字段」的带 —— 支付渠道 / 支付显示名 / 交易标题，AppID / 卖家 PID / 网关地址，奖励比例 / 提现手续费 / 最低提现积分。三列档它们正好排满一行，两列档就成了「2 + 1」：第三个字段自己占一行、右半边整块空着（1120px 下实测空 394px，正好是行宽的一半），而它后面紧跟的往往是整行的东西（勾选框组、整行字段），这块空位就卡在中间，比别处稀疏 —— 行有没有铺满这件事，上一段刚在三列档上解决过，两列档会原样复发。修法是给这三个字段加 `admin-grid__fill-2col`，在 `@media (max-width: 1120px)` 里给 `grid-column: 1 / -1`：读起来的顺序不变（还是第三个），行也铺满了。三列档那一带本来就满、一列档本来就整行，所以这条规则只写进两列档那一个 media query，别提到外面去。**代价是这条补丁与「带里有几个字段」绑死了**：往这三条带里增删字段要回来重数一遍 —— 它不会自己失效，只会静默地少铺或多铺一格（栅格不会报错，只有量 `getBoundingClientRect().right` 才看得出来）。

说明文字用 `--hb-muted`（对卡片背景 5.66:1），比字段名（8.31:1）弱、又在 4.5 对比度下限之上。**不要用 `--hb-ink-soft`**（10.75:1，比它解释的字段名还亮，层级会反过来），也不要用 `--hb-muted-dim`（3.99:1，低于下限）。

### 11.11 验证手法

别再靠肉眼扫截图，直接量（`clientWidth` / `scrollWidth`、`getBoundingClientRect()`）：

- **双滚动条**：`documentElement.scrollHeight - innerHeight` 应为 0，且各 `.table-wrap` 的 `scrollHeight - clientHeight` 应为 0。
- **横向溢出**：宽窗口下 `.table-wrap` 的 `scrollWidth - clientWidth` 应为 0。
- **吸顶**：把主区滚到任意位置，表头 `getBoundingClientRect().top` 应恒等于滚动容器的 `top`。
- **可读性**：遍历所有 `td/th/.pill/p/label`，把前景色与「向上第一个不透明背景」做对比度计算，阈值 4.5（大字号 3.0）。这比肉眼看截图可靠 ——「白底白字」这种问题肉眼经常漏。
- **下拉菜单被裁**：打开表格**最后一行**的 `⋯`，比较菜单与 `.table-wrap` 的 `top/bottom`。
- **字段错位**：同一带内所有控件的 `getBoundingClientRect().top` 应相等。

造演示数据时要留意**密度**：20~30 行的真实数据才暴露得出这些问题，三五行的样例永远是「好看的」。另外注意 `pending` 订单的 `expires_at` —— 过期订单会被正常置为 `expired`，想看到「标记支付」得再造一张 `expires_at` 在未来的单。

### 11.12 标签页与「一段还要不要再分带」

**tab 名字就是这一段的标题，pane 里不要再把同一句话念一遍。** 六个分区的 pane 原先各自以 `<h4 class="admin-grid__section">` 开头，而其中五段的文字与 tab 按钮**逐字相同**（tab「站点信息」正下方紧跟标题「站点信息」），只剩一个带色的细线在区分 —— 同一句话在 20px 内出现两次，是「布局零乱」里最扎眼的一层。现在小标题只在**一段里真的还分几带**时才写：`支付宝凭据` → 凭据与自检 / 回调地址，`注册邮件` → 邮箱预设与自检 / SMTP 参数 / 验证码策略（17 个字段不分带就得通读一遍才能找到一项）。其余四段（站点信息、支付与维护、邀请与解绑、站点配色）没有小标题。

**空元素照样吃行距。** 字段栅格的网格项「高度 0」不等于「不占位」：一行 0 高的网格项仍然吃掉一个 14px 的行间距。站点配置展开前有四处空位 —— `#alipay-effective-urls`、`#alipay-diagnostic-list`、`#mail-preset-hint`、`#mail-diagnostic-list`，表现是「测试凭据」那一行下面莫名多出 14px 空白（与旁边等距的行不成比例），而当时界面上没有任何东西能解释这段空白。修法是 `.admin-hint:empty` / `.admin-diagnostic-list:empty` 一律 `display: none`。**以后往网格里放「先空着、稍后有内容」的块，都要记得这条。**

**一个面板的六个 pane 必须共用同一条栅格规则。** 站点配置的第六段（站点配色）刻意落在 `<form>` 之外（它走 `PUT /appearance`，放进 form 里会让在十六进制输入框里敲回车顺带把整张配置表存一次），而列宽原来挂在 `.admin-grid--wide > .admin-tab-pane` 上 —— 只对 form 里的五个 pane 生效。于是第六段是普通块级堆叠，连它里面的 `admin-grid__full` / `__wide` 都是空转（它压根不是网格）。规则现在挂在 `#panel-settings .admin-tab-pane:not([hidden])` 上，面板内不区分来源；第六段的孩子逐个显式声明占满整行。`<form>` 上的 `admin-grid admin-grid--wide` 也一并摘掉了 —— tab 条与 pane 都跨整行，那两条轨道从来没有真的被用来分列。

---

## 十二、目录

```
apps/store/
  run.py               # uvicorn 启动入口
  app.py               # 应用工厂（挂载静态资源、路由、授权机构）
  config.py            # StoreSettings，全部走环境变量
  core/                # 运行时基座：连接 / 表 / 请求体模型 / 序列化 / 公共依赖 / .env / 启动默认数据
  core/database.py     # engine / session
  core/models.py       # 全部表
  core/schemas.py      # 请求体模型（响应统一 camelCase dict）
  core/serializers.py  # 响应序列化
  core/deps.py         # API 层公共依赖（数据库会话、登录态、按主键取行）
  core/env.py          # 极简 .env 加载器（仅标准库）
  core/bootstrap.py    # 启动时幂等补齐的默认数据（商品目录、站点配置）
  security/            # 口令与会话、来源/同源判定、失败限流、初始化守卫、密钥字段、库结构守卫
  security/security.py         # 密码哈希、会话 token、激活码/邀请码生成、ISO 时间
  security/request_security.py # 真实来源 IP / Cookie Secure / CSRF（与主应用同构的另一份实现）
  security/body_guard.py       # 请求体字节上限（默认 1 MiB；multipart 按声明长度 16 MiB）
  security/password_gate.py    # 登录与验证码的失败限流（基于数据库，跨进程一致）
  security/limiter.py          # 进程内滑动窗口限流（初始化守卫、支付跳转页查单）
  security/setup_guard.py      # 首次初始化窗口的访问守卫（本机放行 + 远程引导密钥 + 限流）
  security/secret_fields.py    # 后台「密钥类字段」的打码、识别与归一化
  security/schema_guard.py     # 启动时把存量库对齐到 ORM（补缺列 / 补缺索引）
  commerce/            # 交易与账务：商品、订单、履约、优惠码、邀请与积分
  commerce/money.py          # ★ 积分/金额的分币运算唯一口径（Decimal，整数厘）
  commerce/catalog.py        # 商品类型 / 履约方式的合法取值（服务端唯一来源）
  commerce/order_status.py   # 订单状态枚举与中文口径（服务端唯一来源）
  commerce/fulfill.py        # 订单履约：发码 / 追加增量包 / 库存 / 邀请奖励
  commerce/coupons.py        # 优惠码核销的记账口径
  commerce/cashier.py        # 模拟收银台的短时票据：签发、查询、清理（S53）
  commerce/expiry.py         # 待支付订单过期处理 + 过期登录会话清理
  commerce/referrals.py      # 邀请钱包与积分账本、提现
  ops/                 # 运营支撑：站点配置、邮件、发布信息、能力码目录、自检原语
  ops/site_settings.py       # 站点/支付/邀请 运行时配置
  ops/mailer.py              # 验证码投递：log | smtp
  ops/mail_settings.py       # 注册邮箱验证码配置解析（站点配置优先，环境变量兜底）
  ops/release_info.py        # 当前版本的发布记录常量与兜底写入
  ops/features.py            # 客户端能力码目录（★唯一出处：与主项目 BASE_FEATURES 同集）
  ops/net_probe.py           # 网络可达性探测（后台「站点配置」自检按钮用）
  ops/incidents.py           # 资金与履约路径上「吞掉异常」的计数（S36）
  payments/            # base 接口 + 支付宝（签名/下单/验签/查单）+ 统一入账
  payments/sweeper.py  # 后台巡检：认领「已付款但通知丢了」的单、关闭过期渠道交易 + 状态登记
  licensing/           # 服务端 TransportCipher + LeaseSigner + 三端点业务
  api/store.py         # /store/v1/*
  api/license.py       # /v2/*
  api/admin.py         # /store-admin/v1/*
  api/setup.py         # /store/v1/setup/*（初始化状态 + 创建管理员）
  api/alipay.py        # 支付宝异步通知 + 同步跳转页
  api/pages.py         # 页面路由（含 /setup）+ /store-static + /fonts + 商品图 + 模拟收银台
  templates/           # store.html（前台：首页落地页 + 8 个分页）+ admin.html（后台 15 个 panel）
  static/              # 自研前端资源：设计系统 CSS + 字体/图标 + jquery + 前端 JS
                       #  自研 JS 一律是 ESM（页面用 <script type="module"> 加载）：
                       #  store.js（页面编排）/ store-shared.js（共享状态与请求原语）/
                       #  store-catalog.js（商品目录）/ store-orders.js（订单与支付）/ referrals.js
                       #  模块之间用带 ?v= 的 import（模块表以含查询串的 URL 为键，不带戳 = 两份实例；
                       #  tools/check_invariants.mjs 有一条正是防这个）。
                       #  只有三份不是模块：vendor 的 jquery.min.js / jquery.qrcode.min.js，
                       #  以及 auth-bootstrap.js —— 它要在首屏之前给 <html> 打登录提示类，
                       #  模块是延迟执行的，等它跑起来样式已经闪一下了。
  static/theme.css     # ★ 唯一设计系统：令牌 / 重置 / 排版 / 组件（前台 + 后台 + 收银台共用）
  static/store.css     # ★ 前台页面布局：外壳 + 首页落地页/商品/结算/认证/账号/邀请
  static/admin.css     # ★ 后台页面布局：窄侧栏、面板骨架、统计卡、表格
```

前端复刻策略：**结构与契约对齐参考站，视觉为本项目自研暗色主题**。`templates/store.html` 与 `static/store.js` / `static/referrals.js` 不保留参考站原有的 DOM 结构，但保留同一套 `data-store-page` 分页、全部 `id`/`data-*` 钩子与 `api(path) → /store/v1` 契约 —— 布局可以随时重排，前后端接口与 JS 行为不动。图标字体写在 `font.min.css` 里的路径是 `../fonts/font.woff2`，所以 `/fonts` 必须挂在根路径（`app.py` 已处理）。

### 界面主题（暗色 + 琥珀）

主题与主程序同源，但**不是逐字同源**：两边都以 `design/scene/page.css` 为唯一真值（canonical），商店侧通过 `--hb-*` 镜像令牌（53 对，逐 token 相等，由 `tools/check_invariants.mjs` 的镜像令牌条目每次校验）再派生出 `-soft` / `-line` / `-text` 等商店特有的语义档。`theme.css` 文件头写明了这一点 —— 它与 `frontend/static/app.css` 的取值**不再**逐字对齐（app.css 只是把历史令牌名转发到工具面族）。整体仍是**暗色画布 + 单一琥珀强调色**。参考站那份浅色样板表（`bridge-store.css` / `merged.css` / `referrals.css` / `product-packages.css`）与后台的 Bootstrap 5.3 **已全部删除**，不再有「基线样式 + 事后补丁层」这套结构。

| 文件 | 作用 | 谁加载 |
| --- | --- | --- |
| `static/theme.css` | 设计令牌 + 重置 + 排版 + 全部组件（按钮/表单/卡片/表格/徽标/对话框/提示） | `store.html`、`admin.html`、模拟收银台 |
| `static/store.css` | 前台页面布局（外壳/首页/商品/结算/认证/账号/邀请/维护页） | `store.html`、模拟收银台 |
| `static/admin.css` | 后台页面布局（窄 rail、panels 骨架、统计卡、表格） | `admin.html` |

样式分层即「加载顺序即层级」：`theme.css`（令牌 + 组件）→ `store.css` | `admin.css`（只排区块，不重定义组件）。

令牌不再由本文件各自维护：`theme.css` 的 `--hb-*` 与主程序的 `--hos-*` 现在同源于
`design/scene/page.css`（手工同步到各分发副本，没有自动比对兜底）。
主控色 `--hb-accent` 是暖金（与入口页场景、主程序同一枚），三束居家光分别编码语义 —— 暖光 `--hb-lumen`（灯光 / 已激活）、
极光紫 `--hb-aura`（氛围 / 恢复）、薄荷 `--hb-eco`（在线 / 节能）；温度与安防读色另有其名，
它们编码物理含义（热 / 冷、布防 / 异常），不参与主控色替换。

管理员改过的配色由后端生成在 `/store-appearance.css`（见 `ops/appearance.py`），
后端把它作为 `<link>` 注入每个页面的 `<!--{{APPEARANCE}}-->` 占位处；那份样式表排在
所有样式表之后，所以它赢。删掉 `data/appearance.json` 即回到设计系统默认值。

**五处页面都要有插入点**：`store.html`、`admin.html`、`setup.html`、模拟收银台
（`api/pages.py` 的 `_cashier_html`）、支付宝同步跳转页（`api/alipay.py` 的 `_RETURN_PAGE`）。
`inject_scene` 找不到插入点会**抛异常**（刻意的守卫：少了那个 `<link>`，页面只会安静地
停在默认配色，管理员会以为保存没生效），漏一处就是那一页直接 500。

后两处是 Python f-string **或** `str.format` 模板，手打占位符必然出错：f-string 会把
`<!--{{APPEARANCE}}-->` 折叠成 `<!--{APPEARANCE}-->`，`str.format` 更狠，要四层花括号才
还原得回两层。**一律插值 `page_shell.APPEARANCE_PLACEHOLDER` 常量**，不要在模板里手写
那串花括号 —— 这两种写法都真实翻过车，且报错点在渲染期而不是编译期。

报错提示走 `store.js` 的 `toast()`：同一个节点两个语义档，`toast(msg)` 是 `role=status` /
`aria-live=polite`（等用户读完再播报），`toast(msg, 'err')` 是 `role=alert` / `assertive` 并加
`.hb-toast.is-err`（红边红字）。属性在写 `textContent` **之前**设置：读屏器是在 DOM 变更
那一刻取用当前的角色与 politeness。后台走自己那套 `admin-toast__item.is-danger`。

订单状态的色相只有一张真值表：`static/admin/format.js` 的 `STATUS_TONES`（状态 → 语气），
`TONE_HUES`（语气 → `.is-tone-*` 族色类）与派生的 `STATUS_HUES`（漏斗条用）。语气只有
success / warning / danger / muted 四种，所以漏斗最多四种色相。`.is-tone-accent` 是**域色**
（跟随主控色），不是「蓝族的一员」—— 它曾经叫 `is-tone-cyan`，而值是琥珀。

维护时的四条硬规矩：

1. **`theme.css` 必须排在任何页面样式表之前。** 顺序反了就会出现「页面布局被组件样式反向覆盖」这类难查的问题。
2. **新样式加进对应层级，不要靠提高特异性取胜。** 页面级差异写进 `store.css` / `admin.css`，组件级差异写进 `theme.css` 的组件章节 —— 不要在模板里内联 `<style>`。
3. **改配色只改 `design/scene/page.css`，别在商店里补一份。** `--hb-bg` / `--hb-accent` / `--hb-success` 与主程序的 `--bg` / `--accent` / `--success` 必须同步，主程序改色而商店没跟就会出现配色漂移，而这已无自动比对，只能靠人记得改两侧。
4. **`static/scene/` 是只读分发副本。** 里面的 `fonts.css` / `page.css` / `scene.css` / `panel.css` / `appearance.js` / `scene-depth.js` 都由 `design/scene/` 手工同步而来（`apps/store/templates/_scene.html` 同理，它是 `scene.html` 的片段版）。就地改这里等于改一份会被下次同步覆盖的副本，而且改出来的差异谁也看不见：源文件不会跟着变，主应用那份副本也不会。**要改就改 `design/scene/` 的源文件，再按主 README「design/scene 分发副本」一节列出的三份副本逐个同步。**

另外两处**内联** HTML 也走同一套令牌，改配色时别漏：`api/pages.py` 的模拟收银台（`_cashier_html`）和 `api/alipay.py` 的同步跳转页（`_RETURN_PAGE`）。

自查手法：换布局最容易出的是「类名写出来了但没有对应样式」—— 节点照样渲染，只是没有边框和内边距，控制台一声不响。核对时把 `store.js` / `referrals.js` / 模板 `class=` 字面量里的类名逐个到三份样式表里比对，或直接用浏览器 DevTools 遍历 `document.querySelectorAll('*')`，把没有生效样式的节点打出来。
---

## 十四、支付后自动发码与投递契约

「付款 → 发码」这条链路有两个**必须同时成立**的交付面，它们互为兜底：

| 交付面 | 实现位置 | 要求 |
| --- | --- | --- |
| **个人中心可见** | `core/serializers.py` 的 `license_payload`（下发 `activationCode`）+ `static/store.js` 渲染授权卡 + `commerce/fulfill.py` 签发时写入 `account_id=order.account_id` | 支付入账并履约后，买家**立刻**能在账号中心看到这张授权的激活码。`account_id` 是「按账号查得到」的唯一依据，**不要改** |
| **邮件送达** | `commerce/delivery.py` + `ops/mailer.send_license_email` | 同一个激活码发到**下单时冻结的** `order.email`（不是「当前账号邮箱」：账号后来改邮箱时，历史订单的投递去向仍要可追溯） |

两条通道的内容必须**同源**：发送前按 `license.id` 从数据库回读激活码，不用内存里的对象 —— 否则「邮件里的码」与「个人中心的码」可能出现一次小偏差，而那种偏差用户只会当成「邮箱收到的是错的」。
增量包（`patch`）与升级（`upgrade`）**不签发新码**，但邮件照发：正文重复展示**既有**激活码并说明本次变更，否则买家只会觉得「付了钱什么也没收到」。
回归测试：`apps/store/tests/test_license_delivery.py`（断言邮件正文里的码与个人中心下发的码逐字符相同）。

### 14.1 发送时机、幂等与失败隔离

- **发送必须发生在入账事务提交之后。** HTTP 路径用 FastAPI 的 `BackgroundTasks`：`DbSession` 的提交发生在响应发出之前、后台任务在响应之后运行，于是发信看到的一定是已经落库的授权，同时不拖慢给支付宝的 ack（支付宝有超时重推，ack 越慢越容易重复通知）。后台履约、模拟收银台同理。
- **不在请求事务里发信**还有第二个理由：SMTP 是几秒到二十秒的网络等待，而 `busy_timeout` 只有 5 秒 —— 持着 SQLite 写锁等 SMTP，并发的下单 / 心跳会直接报 `database is locked`。
- **幂等靠条件自增领取**：`orders.license_email_attempts` 用「未发送且未达上限」的 `UPDATE` 抢标记，抢不到的调用方直接退出。异步通知、前端轮询、后台巡检同时触发也只会真发一封。
- **失败绝不回滚授权**：结果写进 `orders.license_email_error` 并记一条 `incidents`（`delivery`）。邮件失败时授权与个人中心显示都不受影响。
- **巡检兜底**：`payments/sweeper.py` 每轮调用 `delivery.sweep_undelivered`（上限 `STORE_PAYMENT_SWEEP_BATCH`），把「已履约但邮件没发出去」的订单补发一遍。进程重启、后台任务丢失、当时 SMTP 抖动都靠它收尾。自动重试上限 `MAX_AUTO_DELIVERY_ATTEMPTS = 3`。
- **买家的自助入口**：账号中心每张授权卡上的「重发激活码邮件」→ `POST /store/v1/account/licenses/{licenseId}/email`。它跳过「已经发过」与「重试次数用尽」两道闸门（`force=True`），但仍走同一个领取标记，并按**账号**限流 5 次/小时（进程内限流器，见「二、必须单进程」）。
- **总开关**：站点配置「注册邮件 → 发货邮件」（`store_settings.delivery_email_enabled`）。库里的 `NULL` 与 `1` 都算**开** —— 一个空值不该静默关掉这条通道。

### 14.2 履约失败会自动重试

入账时履约失败会被**刻意吞掉**（抛给支付宝会让它无限重推），订单被推到 `fulfillment_failed`。过去这条状态的结局是「钱收了、码没发、没有任何东西会再碰它」，只能等运营偶然看到。现在巡检会捞它：

- 条件：状态为 `fulfillment_failed`、`fulfillment_attempts` 未达 `MAX_FULFILLMENT_RETRIES`（5）、创建时间在 `FULFILLMENT_RETRY_LOOKBACK_HOURS`（24）小时内。
- 每次尝试先自增计数（用尽上限的单自然退出候选集），成功即清 `needs_review` 并触发发码邮件；仍失败则记 `incidents`（`fulfillment.retry`）。
- 手动发卡（`fulfillment_mode` 为 `manual`）的商品不在此列：它本来就该等人来点，不是失败。

### 14.3 支付宝侧的四个口径

1. **公钥填错回 `failure`，不回 500。** `verify_content` 只回答是非问题，任何失败（含「公钥不是合法 PEM」这种 `PaymentError`）都返回 `False`。以前这个异常会逃到端点层变成 HTTP 500 JSON —— 支付宝看到的是「商户故障」，于是重推数小时，而订单永远停在待支付。同时会在通知路径上记一条 `incidents`（`alipay.config`），让这类配置故障在后台概览可见（验签失败本身**不**记账，否则任何人往回调地址 POST 垃圾都会刷爆告警）。
2. **非成功交易状态要分两种处理。** `WAIT_BUYER_PAY` 是「还没付」，本地保持待支付；`TRADE_CLOSED` 是「这笔交易已经死了」，本地同步收尾（归还库存预留与优惠码名额并写 `channel_closed_at`），否则它会一直占着资源直到本地 TTL 或巡检。
3. **渠道被切走不再搁置在途通知。** 回调与查单按**渠道名**解析支付宝（与巡检同口径的 `name_override`），只在这笔订单确实不是支付宝时才拒收。运营把站点渠道临时清空（或改成别的值）时，在途的那批订单仍然能被对账。
4. **订单 TTL 必须与二维码寿命对齐。** 支付宝二维码在渠道侧可存活约 2 小时，而本地订单默认 120 秒就过期 —— 用户扫码稍慢就会变成「订单已过期后才到账」的复活单，每笔都要人工核对。`payment_provider=alipay` 且 `STORE_ORDER_TTL_SECONDS < 300` 时启动日志会点名告警；建议 600~900 秒。

另外两条与「自动发码」直接相关的顺序约定：**先对账、后过期**。`GET /store/v1/orders/{no}` 与订单列表都先向渠道查单再跑本地过期收尾（与巡检 `reconcile_due_orders` 同一顺序）。反过来的话，一笔刚跨过 TTL 的订单会先被本地置为 `expired`（顺带归还预留），而查单只处理待支付 —— 那次本可以确认收款的主动对账就这样被跳过。没有公网回调时，这条顺序 + 30 秒巡检就是「付了钱也能收到码」的全部保证。

### 14.4 邮箱验证码的三个口径

1. **先提交、再发信。** `POST /store/v1/verifications` 把验证码行提交后才调用 SMTP：发信期间不持有任何写事务，且进程在「已发信」与「已提交」之间崩溃不会留下一个用户手里有、服务端却没有的码。投递结果在第二个短事务里落库，**它失败不会让验证码失效**（只记 `incidents`）。
2. **没发出去必须如实说。** 响应里的 `delivered` / `deliveryMode` / `deliveryError` 是唯一口径，前端照着它说话：`delivered` 为假且带 `deliveryError` 时提示失败且**不**谎报「已发送」。SMTP 未配置完整这条以前连 `deliveryError` 都不返回，用户对着收件箱干等 —— 那是注册彻底走不下去。
3. **配额可运营。** 全站小时发信上限（`verification_global_hourly_limit`，库内 0 = 跟随环境变量）在后台「注册邮件」里直接改：触顶时**所有人**都收不到验证码，运营必须能在这一页把它调大。配额校验排在参数校验**之后**，写错邮箱的请求不会白扣额度。

单条验证码的尝试上限（8 次）落在**独立提交的事务**里：错码路径紧接着就 `raise`，而请求作用域的会话会整体回滚 —— 写在同一事务里的自增会连同失败一起消失，上限就永远不会生效。
「更换邮箱」的发码阶段**不再**回答「这个邮箱注册过没有」（那是个对任何登录用户开放的枚举探针），占用校验放在验证码消费之后。

### 14.5 排障表

| 现象 | 先看哪里 |
| --- | --- |
| 付了钱、账号中心没有码 | `orders.status`。`fulfillment_failed` 说明履约失败（看 `review_note` 与 `incidents` 的 `fulfillment`），巡检会重试最多 5 次；`pending` 说明还没入账，看巡检状态与通知记录 |
| 有码但没收到邮件 | `orders.license_email_sent_at` / `license_email_error`；后台概览的「入账异常」；再到「注册邮件 → 发送测试邮件」区分「我们发不出去」与「对方网关拒收」 |
| 买家说邮箱丢了这封信 | 让他到账号中心的授权卡上点「重发激活码邮件」（5 次/小时/账号） |
| 注册页一直收不到验证码 | 后台「注册邮件」顶部的「SMTP 是否就绪」；全站小时上限是否触顶；再确认没有把 `mail_mode` 留在 `log` |
| 日志刷「通知验签未通过」 | 大概率是 `STORE_ALIPAY_PUBLIC_KEY` 填成了**应用公钥**。填错时通知会回纯文本 `failure`（不再是 500），并在「入账异常」里记 `alipay.config` |


