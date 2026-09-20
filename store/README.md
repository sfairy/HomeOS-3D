# HomeOS 授权商店与授权服务器（store/）

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
.venv-store/bin/pip install -r store/requirements.txt

# 2) 起服务（默认 0.0.0.0:18082）
#    授权密钥在启动时自动生成（私钥留在 store/keys/local，公钥镜像到客户端 keys/）；
#    商品目录与站点配置由 store.app 启动时幂等补齐。
.venv-store/bin/python -m store.run
```

浏览器打开 <http://127.0.0.1:18082/>，首次部署会引导到 `/setup` 页面创建管理员账号。早期版本在缺省时会用代码里写死的默认管理员（口令还公开在本文件里）建号 —— 那等于给每个照文档部署的实例装一个公开后门，现已移除。本地非 Docker 也可直接运行仓库根 `start.py`，它会一并起主应用与商店。

验证码投递由 `STORE_MAIL_MODE` 决定，三种取值：

- `log`（代码默认值）—— 只写进服务日志，接口不回显。**用它跑注册流程时用户收不到码，会卡在注册页**，只适合有日志查看权的调试。
- `echo` —— 验证码在 `POST /store/v1/verifications` 响应里回显，注册页会**自动填入并提示**。`start.py` 启动时默认用它（可被环境变量覆盖），本地联调走这条路。
- `smtp` —— 真实发信，需要配 `STORE_SMTP_*`；发信失败会自动回退到日志模式，不会阻断注册。

投递方式、SMTP 主机 / 端口 / 加密方式 / 授权码 / 发件人、验证码有效期与重发冷却，**都能在 `/admin` 的「站点配置 → 注册邮箱验证码」里改，保存即生效、免重启**。口径与支付渠道一致：后台留空 / 填 `0` 表示跟随 `.env`，填了值就以后台为准（授权码只显示打码值，留空不改动、勾「清除已保存的授权码」才回到环境变量）。区块顶部会直接显示**当前生效的配置**与「SMTP 是否就绪」，避免「填了 SMTP 但漏了授权码」这种安静退化成写日志、用户在注册页等一封永远不来的邮件的情况。

### 用 `.env` 放本地密钥

SMTP 授权码、支付宝私钥这类东西**别写进代码或提交**。项目根目录的 `.env` 就是给这个用的（已被 `.gitignore` 忽略）：

```bash
cp .env.example .env      # 然后填 STORE_SMTP_PASSWORD 等
```

优先级是 **真实环境变量 > `.env` > `start.py` 内置的开发默认值**，所以 CI/容器里注入的变量会自然压过本地文件。

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

163 邮箱同理（`smtp.163.com`）。配好后启动日志里不再出现 `[验证码]` 明文，接口返回 `delivered: true`；若想在本机也能同时看到码，可临时加 `STORE_EXPOSE_VERIFICATION_CODE=true`（**生产必须保持 false**）。

---

## 二、本地联调与部署

仓库不再内置自动化自检 / 端到端脚本（原 `store/tools/` 下的 `smoke.py`、`e2e.py`、`seed.py`、`gen_keys.py`、`migrate_points.py` 已随本次清理移除）。本地非 Docker 直接用仓库根 `start.py` 一键起主应用与商店：

```bash
.venv-store/bin/python start.py
```

Docker / Compose 部署见仓库根 `README.md`。改动前后请人工走一遍关键路径：管理员 `/setup` → 下单（模拟支付）→ 发码 → 客户端 `/license` 激活 → 心跳续租 → 后台吊销。

---

## 三、客户端默认已指向自建授权服务器（零配置）

客户端默认值写在 `backend/config.py`：端点 `http://127.0.0.1:18082`、公钥镜像 `keys/`、指纹为自建默认，**keyId 由公钥文件派生**（两侧各自从自己那份镜像算出同一个值，因此不必人工同步字符串）。**不设任何环境变量**，起服务后即可在 `/license` 页用「激活码 + 购买邮箱」激活（授权码来自账号中心）：

```bash
.venv-store/bin/python -m store.run     # 终端 A：授权服务器 + 商店
python start.py                         # 终端 B：客户端
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
- 指纹按 PEM **文件字节** 计算，所以 `keys/` 镜像必须与 `store/keys/local/` 逐字节一致。

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
| `STORE_DATA_DIR` | `store/data` | SQLite 与商品图目录 |
| `STORE_LICENSE_KEYS_DIR` | `store/keys/local` | 授权密钥目录（私钥留服务端） |
| `STORE_MAIL_MODE` | `log`（`start.py` 下为 `echo`） | `log` \| `echo` \| `smtp` |
| `STORE_EXPOSE_VERIFICATION_CODE` | `false` | 是否在接口响应里回显验证码（仅本地，**生产必须 false**） |
| `STORE_SMTP_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_USE_SSL` / `_STARTTLS` | — | SMTP 发信（`_PASSWORD` 填授权码，不是登录密码） |
| `STORE_PAYMENT_PROVIDER` | 空（未配置渠道 → 拒绝建单） | `mock` \| `alipay`（也可在 `/admin` 站点配置里改，DB 值优先） |
| `STORE_ALLOW_MOCK_PAYMENTS` | `false` | 是否允许模拟收银台。**默认关闭**；必须与 `STORE_PAYMENT_PROVIDER=mock` 同时设置才能用，仅供本地联调 |
| `STORE_ALIPAY_APP_ID` | — | 开放平台应用 APPID |
| `STORE_ALIPAY_APP_PRIVATE_KEY_PATH` / `STORE_ALIPAY_PUBLIC_KEY_PATH` | — | **推荐**：应用私钥 / 支付宝公钥的 PEM 文件路径 |
| `STORE_ALIPAY_APP_PRIVATE_KEY` / `STORE_ALIPAY_PUBLIC_KEY` | — | 等价的内联写法（单行裸 base64） |
| `STORE_ALIPAY_GATEWAY_URL` | 生产网关 | 沙箱填 `https://openapi.alipaydev.com/gateway.do` |
| `STORE_ALIPAY_SELLER_ID` | — | 可选：核验通知里的卖家号 |
| `STORE_ALIPAY_NOTIFY_URL` / `STORE_ALIPAY_RETURN_URL` | 由 `STORE_BASE_URL` 推导 | 可选：用内网穿透时指向穿透域名 |
| `STORE_ALIPAY_TRANSACTION_DESCRIPTION` | `HomeOS 授权` | 交易标题（出现在支付宝账单里） |
| `STORE_ALIPAY_VERIFY_RESPONSE` | `true` | 是否校验支付宝响应签名，除排障外不要关 |
| `STORE_LEASE_TTL_SECONDS` | `259200` | 租约有效期（72 小时），心跳 300s 续租。⚠ 该值同时是「离线可用时长」与「吊销生效上界」—— 对持续离线的客户端，停用授权 / 解绑设备最慢要等这么久才生效 |
| `STORE_HEARTBEAT_INTERVAL_SECONDS` | `300` | 下发给客户端的 `heartbeatIn` |
| `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT` | `3600` | `/v2/heartbeat` 与 `/v2/recover` 的**来源 IP** 小时配额。比 `/v2/activate` 固定的 60/小时宽得多：这两个端点收的是高熵令牌（不可枚举），却承载后台心跳与「授权页开着时的状态轮询」。额度**按出口地址**算，多台设备共用同一 NAT 出口时会叠加 —— 授权页卡住且日志里一片 `429` 时调大它 |
| `STORE_ORDER_TTL_SECONDS` | `120` | 订单有效期。**真实收款必须调大**，见下节 |
| `STORE_DEVICE_RELEASE_COOLDOWN_SECONDS` | `28800` | 解绑冷却（8 小时） |
| `STORE_VERIFICATION_TTL_SECONDS` / `_COOLDOWN_SECONDS` | `600` / `60` | 验证码有效期 / 重发冷却 |
| `STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT` | `500` | 验证码发信的**全站**小时上限（所有来源合计）。防「拿商店当发信机轰炸第三方」的兜底闸门；额度之内还按来源 IP（20/小时）、单邮箱（10/小时）各限一层。触顶时日志打 ERROR，并按正常业务量调高 |
| `STORE_SESSION_MAX_AGE_SECONDS` | `2592000` | 商店会话有效期 |
| `STORE_SETUP_TOKEN` | 空 | `/setup` 首次初始化的引导口令。留空时启动自动生成一份 32 字节随机串，落到 `data_dir/setup-token`（0600）并打印到标准错误 —— 非本机直连必须带上它，避免未初始化实例「先到先得」 |

**写错就起不来（这是刻意的）**：上面这些数值型 / 布尔型变量在启动时**严格解析** —— `STORE_ORDER_TTL_SECONDS=12o`、`STORE_COOKIE_SECURE=ture`、`STORE_PORT=99999` 都会让进程带着一条点名变量的错误信息拒绝启动，而不是静默回退默认值。只有「未设置」与「留空」才使用默认值（部署模板里常见的空占位写法不受影响）。布尔值接受 `true/false/1/0/yes/no/on/off`（大小写不限）。

静默回退的后果大多不表现为「少了个功能」：例如 `STORE_COOKIE_SECURE` 拼错恰好等于「显式关闭」，HTTPS 部署上的会话 Cookie 会丢掉 `Secure` 标记，而服务照常运行、日志里一个字都没有。另有几条跨字段校验，例如 `STORE_LEASE_TTL_SECONDS` 必须 ≥ 2× `STORE_HEARTBEAT_INTERVAL_SECONDS`，否则健康客户端会在两次心跳之间把租约耗到过期（表现为「网络正常但功能一阵阵消失」，两个配置项单独看都合法）。

站点名、公告、客服邮箱、维护模式、邀请比例、提现手续费、解绑冷却等**运行时配置**存在数据库里，直接在 `/admin` 的「站点配置」里改，不需要重启。邮件与验证码那几项（`STORE_MAIL_MODE` / `STORE_SMTP_*` / `STORE_MAIL_FROM` / `STORE_VERIFICATION_*` / `STORE_EXPOSE_VERIFICATION_CODE`）和支付宝的 `STORE_ALIPAY_*` 也搬进了「站点配置」，同样是 DB 值优先、留空跟随 `.env`，改完免重启。两个顺手加的排障入口：

- **发送测试邮件**（「站点配置 → 注册邮箱验证码」）—— 往任意邮箱真发一封，复用用户注册走的那条投递路径，但不写验证码记录、不占发信配额。用来区分「我们发不出去」和「对方网关拒收」。
- **当前生效的回调地址**（「站点配置 → 支付」）—— 展示后台值 / 环境变量 / 按 `STORE_BASE_URL` 推导三层里最终用的是哪个。地址填 `localhost` 或内网会被保存时拒掉：那种值支付宝永远访问不到，表现却是「用户付了钱订单不到账」。

---

## 五、接入支付宝（真实收款）

**默认不配置任何渠道**：未配置渠道时商店会拒绝建单（下单 503），而不是回落到模拟收银台 —— 这是刻意的 fail-closed，因为模拟收银台点一下就「已支付」并签发真实授权，**收不到真钱**。本地联调要同时设 `STORE_PAYMENT_PROVIDER=mock` 与 `STORE_ALLOW_MOCK_PAYMENTS=1`（`start.py` 会自动带上这两个变量）；正式收款请按下面的步骤切到支付宝。

模拟收银台页面地址形如 `/store/mock/pay/{order_no}?t=<短时票据>`：票据与订单绑定、30 分钟有效、只能打开这笔订单的收银台，页面加载后立刻把查询串从地址栏与历史里抹掉（`history.replaceState`）。**这里不放订单的 `lookupToken`** —— 那是长期有效、还能查订单详情的 bearer 凭据，写在 URL 里会进访问日志、`Referer` 与浏览器历史，漏出一次等于交出订单查询入口（详见审计记录 S53）。因此升级后**旧的 `?token=` 链接一律 404**，在账号中心点「继续支付」（走登录态）或重新下单即可。

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

# 真实收款必须调大订单有效期：默认 120 秒扫码根本来不及（二维码本身能活 2 小时）
STORE_ORDER_TTL_SECONDS=900

# 内网穿透时指向穿透域名（必须公网 HTTPS 可达）
STORE_ALIPAY_NOTIFY_URL=https://xxx.ngrok-free.app/store/v1/payments/alipay/notify
STORE_ALIPAY_RETURN_URL=https://xxx.ngrok-free.app/store/payment/return
```

沙箱联调时把 `STORE_ALIPAY_GATEWAY_URL` 换成 `https://openapi.alipaydev.com/gateway.do`，APPID 和密钥都换成沙箱的。

> ⚠️ **支付渠道是「/admin 站点配置」优先于 `.env` 的。** 如果你之前 seed 过站点配置，数据库里存着 `mock`，那么只改 `.env` 是**不生效**的（表现就是「照教程改了却还是模拟支付」）。两种改法二选一：
>
> - 到 `/admin` → 站点配置 → 支付渠道，选 **alipay**；或选「**跟随环境变量**」后交给 `.env`
> - 或者把数据库里那行清空：`UPDATE store_settings SET payment_provider='' WHERE id=1;`
>
> 另外，**支付显示名**留空即可（会用「支付宝」）；如果它还是 `模拟支付`，切换渠道后二维码弹窗上的名字也会跟着显示成「模拟支付」。

改完**重启 `start.py`**（商店进程没有 `--reload`，不重启就等于没改）。

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

## 六、巡检与入账异常（可观测性）

### 6.1 支付巡检状态

支付巡检（`payments/sweeper.py`）跑在 `app.py` 的 `try/except Exception` 里，坏掉时的表现是**完全无声的**：服务照常启动、下单照常成功、后台每个页面都正常，只是查单、认领已付款订单、关闭过期渠道交易这三件事都没发生 —— 用户付了钱、订单停在待支付，最后变成客服工单。所以巡检必须自己留下可被接口读到的状态：

| 读法 | 位置 |
| --- | --- |
| 人看 | 后台**运营概览**顶部的「支付巡检」卡片（常驻显示，不随健康与否隐藏） |
| 机器看 | `GET /healthz` → `paymentSweep`（`status` 仍只表示进程活着，探活的机器不会被它带偏） |

状态码（`sweeper.HEALTH_*`，前端 `SWEEP_HEALTH` 一一对应 —— 两边改动必须同步，已无自动化闸门会替你发现漂移）：

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

过去它们的共同出口是「往日志写一行 traceback」：服务照常、后台一片正常，出的事却正是最该有人立刻知道的那类（钱收了、码没发）。日志是写给已经在翻日志的人看的，不是告警。所以这些异常现在额外记一笔进程内计数（`store/ops/incidents.py`）：

| 读法 | 位置 |
| --- | --- |
| 人看 | 后台**运营概览**的「入账异常」卡片（常驻显示，`0` 也显示 —— 否则没人知道这项功能存在） |
| 机器看 | `GET /healthz` → `incidents`（`status` 仍只表示进程活着） |

字段与巡检同风格：`health`（`ok` / `degraded`，非零即 `degraded`）、`total`、`kinds[]`（类别、中文标签、次数、最近一次的时间 / 订单号 / 错误），以及 `clearedAt` / `clearedBy` / `clearedTotal`。类别与标签在 `incidents.KINDS` 里登记，后台、`/healthz` 与日志讲同一件事。

三条要点：**只在内存里**（同巡检，落库会让刚起来就出问题的进程看起来像「历史遗留」）；`note()` **绝不抛异常**（它唯一的调用场合就是 `except` 块内部，那里再抛等于把刻意吞下的失败重新变成 500，甚至盖掉原始错误）；**有「确认」按钮**（一次抖动会把灯永久点亮，而它是进程内的，按不灭的灯等于没有灯 —— 后台「确认已处理」会清零计数并记审计，卡片上仍能看到「上次确认在 xx 前」；清零**不修复任何订单**，所以确认框里写明了要先处理完 `fulfillment_failed` 的单）。

---

## 七、密钥与安全

- `store/keys/local/` 下的私钥**不要提交到任何公开仓库**，它是授权服务器签名与传输的真相源。
- 仓库根 `keys/*.pem` 是**客户端默认读取的公钥镜像**，由启动时的密钥准备流程（`docker/license_keys.py` / `start.py`）从 `store/keys/local/` 自动同步。客户端按 PEM **文件字节** 校验指纹，两处必须逐字节一致。
- 轮换密钥：按上文「密钥轮换」把现有四件套改名成 `*.previous.pem` 后生成新四件套，镜像到仓库根 `keys/`；若不改用环境变量覆盖，请把新公钥字节的 sha256 更新进 `backend/config.py` 的 `DEFAULT_LICENSE_*` 常量。
- 传输层：X25519 ECDH → HKDF-SHA256 → AES-256-GCM，`path` 参与 HKDF/AAD 派生，所以端点路径本身也被认证。
- 租约层：Ed25519 对 canonical JSON 的**原始字节**签名，`leaseSequence` 同 `activationCodeId` 下严格递增。
- 只有写入默认密钥目录（`store/keys/local/`）时才会同步 `keys/` 镜像；用临时目录做一次性测试时不要执行同步，否则会用一次性密钥覆盖客户端信任锚。

---

## 八、吊销语义（客户端契约）

管理后台「停用设备绑定 / 停用授权」后，对应端点返回 `403 {"detail": "...", "revoked": true, "code": "REVOKED"}`。客户端**只认结构化字段**（`code` 为 `REVOKED` / `LICENSE_REVOKED`，或 `revoked: true`）才判定为**确认吊销**并清空本地授权，不再匹配 `detail` 文案（服务端由 `LicenseServerError.as_body()` 统一补齐这两个字段，见 `store/licensing/crypto.py`）。

其余 401/403（无上述字段）视为瞬时故障（保留本地授权继续重试）。改动吊销响应时务必保留结构化 `code` / `revoked`，客户端契约见 `backend/license/service.py` 的 `CONFIRMED_REVOCATION_CODES` 与 `is_confirmed_revocation`。

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

同一口径也用在**功能码**上。功能码是主程序的能力码（`backend/license/service.py` 的 `BASE_FEATURES` + `backend/modules/interaction3d/access.py` 的 `module.3d_interaction`），过去是逗号分隔 / 手写英文代码的输入框：运营得背代码，抄错一个字母不会报错 —— 履约照发，客户端只是静默拦截。现在改成中文选择器，**三处共用同一个组件**（商品「功能码」多选，权益「手工补权益」与「改期 / 开关」单选）：

- 目录定义在 `store/ops/features.py`，由 `GET /store-admin/v1/feature-codes` 下发（`code` / `label` / `description` / `groupLabel`）。**新增能力码先改主项目，再补这里。**
- 实例配置写在根节点的 data-* 上：`data-feature-picker`（标记）、`data-feature-multiple`、`data-feature-empty`。表单里仍然只提交一个 `name` 与原来一致的隐藏域（多选存 CSV），所以 `form.elements.xxx.value` 的读取口径一行都没改。
- 历史数据可能带着目录外的代码：它们会落到「自定义代码」分组里保持勾选，否则一保存就被静默丢掉。
- 单选实例对应必填字段，而隐藏域不进浏览器的 `required` 校验，所以提交前用 `requireFeatureCode()` 自己拦一道。单选选项也不带 `name`（否则 `form.elements.featureCode` 变成 `RadioNodeList`）。
- 下拉打开时与行内 `⋯` 菜单一样切成 `position: fixed` 现算坐标（`.admin-main` 是滚动容器，`absolute` 弹层会被裁剪），Esc / 点外部 / 祖先滚动都会收起；事件统一委托到 `document`。

### 11.5 操作列收敛为「主操作 + ⋯ 菜单」

| 面板 | 主操作 | ⋯ 菜单 |
| --- | --- | --- |
| 订单 | 标记支付 / 履约（二者互斥） | 履约、线下收款入账、退款、取消订单、删除订单 |
| 商品 | 编辑 | 删除 |
| 激活码 | 停用 / 启用 | 彻底删除 |
| 优惠码 | 停用 / 启用 | 删除 |
| 提现审核 | 通过、驳回 | 删除 |
| 版本发布 / 审计日志 | — | 只有一个动作，不包菜单（多一次点击没有收益） |

菜单是手写的（`rowMenu` / `menuItem` + `.admin-main` 上的一个委托监听）。两个要点：**菜单标记仍留在单元格内**、靠绝对定位浮起 —— 若 `appendChild` 到 `document.body` 以免被 `overflow` 裁掉，就会离开各表 `<tbody id="xxx-rows">` 上的事件委托，那些处理函数得全部改写；**主区一滚就收起菜单**，因为按钮在滚动容器内部、会跟着行一起移动。

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

**导航**：15 个条目按「运营手上要办的事」分成五组 —— 业务运营（概览、订单、提现审核）、商品营销（商品、优惠码、版本发布）、授权用户（激活码、设备绑定、账号）、数据资产（功能权益、积分流水、客户档案、诊断数据）、系统设置（站点配置、审计日志）。默认全开（1440×900 下恰好一屏装下），切面板时按当前页反查所在分组并展开；折叠动画走 `grid-template-rows: 0fr → 1fr`，内层容器再配 `visibility` 过渡，收起后才真正移出 Tab 焦点序列。子项角标在分组收起时看不见，所以 `setNavBadge()` 会把该组合计挂到一级菜单上。窄屏（`max-width: 860px`）下侧栏是横排平铺，那里隐藏一级菜单标题、把两层折叠容器摊平成 `display: contents`，并显式还原 `visibility`。

**登录页**：`body { overflow: hidden }` 会让登录页在很矮的窗口（横屏手机）上被裁掉且无法滚动，因此登录页改成 `max-height: 100vh` + 自身 `overflow-y: auto`，并用元素自身的 `padding` 而非 `margin`（`margin` 不计入 `max-height`，也不会跟着滚动）。

**KPI 卡的主数字只放一个量级，且必须单行**：主数字给总额（`balancePoints` = 可用 + 冻结，也就是真正要兑付的数），拆解挪进 `.stat__note`。整排卡片行高由最高的那张决定，一张卡的折行会把它整排一起撑高。配套三件：`.stat__value` 用 `white-space: nowrap; text-overflow: ellipsis`（少了 `text-overflow` 就只剩无声截断，看起来是一个「少了一位」的错数字，比折行更危险），完整值兜在 `title`，放不下时按字符数降档（`.stat__value--sm/--xs`，等宽字符 ≈ 0.61em，可用宽 186px 列 − 32px 内边距 = 154px，三档分界取 9 / 13 字）。

### 11.10 字段名与说明的位置

`.admin-grid` 是 `repeat(auto-fit, minmax(186px, 1fr))`：列只会变宽不会变窄，所以**字段名在 186px 内排得下**（`--wide` 表单是 210px）就是它永不换行的充要条件。一旦折行，那个 `.hb-field` 就比同带的邻居高一行，而 `.hb-field` 各自独立成格（不是 `subgrid`），控件自然被顶下去 —— 同一带的输入框于是不在一条线上。两条硬规则（74 个字段名全核对过）：

1. **字段名不带长括号说明**，语义解释交给 `.admin-field-hint`。宽度按实测标定：全角 12.24px、半角 7px、空格 3.4px，留 8px 余量。
2. **说明写在控件之后。** 夹在字段名和控件之间，它同样把控件顶下去。独占整行的 `admin-grid__full` / `admin-grid__wide` 两条都豁免。

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

---

## 十二、目录

```
store/
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
  security/password_gate.py    # 登录与验证码的失败限流（基于数据库，跨进程一致）
  security/limiter.py          # 进程内滑动窗口限流（初始化守卫、支付跳转页查单）
  security/setup_guard.py      # 首次初始化窗口的访问守卫（本机放行 + 远程引导密钥 + 限流）
  security/secret_fields.py    # 后台「密钥类字段」的打码、识别与归一化
  security/schema_guard.py     # 启动时把存量库对齐到 ORM（补缺列 / 补缺索引 / 删退役列）
  commerce/            # 交易与账务：商品、订单、履约、优惠码、邀请与积分
  commerce/money.py          # ★ 积分/金额的分币运算唯一口径（Decimal，整数厘）
  commerce/catalog.py        # 商品类型 / 履约方式的合法取值（服务端唯一来源）
  commerce/order_status.py   # 订单状态枚举与中文口径（服务端唯一来源）
  commerce/fulfill.py        # 订单履约：发码 / 追加增量包 / 库存 / 邀请奖励
  commerce/coupons.py        # 优惠码核销的记账口径
  commerce/cashier.py        # 模拟收银台的短时票据：签发、查询、清理（S53）
  commerce/expiry.py         # 待支付订单过期处理 + 过期登录会话清理
  commerce/referrals.py      # 邀请钱包与积分账本、提现
  commerce/points_migration.py  # 邀请积分 FLOAT→整数厘 的回填/对账/退役/回滚
  ops/                 # 运营支撑：站点配置、邮件、发布信息、能力码目录、自检原语
  ops/site_settings.py       # 站点/支付/邀请 运行时配置
  ops/mailer.py              # 验证码投递：log | echo | smtp
  ops/mail_settings.py       # 注册邮箱验证码配置解析（站点配置优先，环境变量兜底）
  ops/release_info.py        # 当前版本的发布记录常量与兜底写入
  ops/features.py            # 客户端能力码目录（★唯一出处：与主项目 BASE_FEATURES 同集）
  ops/net_probe.py           # 网络可达性探测（后台「站点配置」自检按钮用）
  ops/incidents.py           # 资金与履约路径上「吞掉异常」的计数（S36）
  payments/            # base 接口 + mock 收银台 + 支付宝（签名/下单/验签/查单）+ 统一入账
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
  static/theme.css     # ★ 唯一设计系统：令牌 / 重置 / 排版 / 组件（前台 + 后台 + 收银台共用）
  static/store.css     # ★ 前台页面布局：外壳 + 首页落地页/商品/结算/认证/账号/邀请
  static/admin.css     # ★ 后台页面布局：窄侧栏、面板骨架、统计卡、表格
```

前端复刻策略：**结构与契约对齐参考站，视觉为本项目自研暗色主题**。`templates/store.html` 与 `static/store.js` / `static/referrals.js` 不保留参考站原有的 DOM 结构，但保留同一套 `data-store-page` 分页、全部 `id`/`data-*` 钩子与 `api(path) → /store/v1` 契约 —— 布局可以随时重排，前后端接口与 JS 行为不动。图标字体写在 `font.min.css` 里的路径是 `../fonts/font.woff2`，所以 `/fonts` 必须挂在根路径（`app.py` 已处理）。

### 界面主题（暗色 + 琥珀）

主题与主程序（`frontend/static/app.css`）同源：**暗色画布 + 单一琥珀强调色**。参考站那份浅色样板表（`bridge-store.css` / `merged.css` / `referrals.css` / `product-packages.css`）与后台的 Bootstrap 5.3 **已全部删除**，不再有「基线样式 + 事后补丁层」这套结构。

| 文件 | 作用 | 谁加载 |
| --- | --- | --- |
| `static/theme.css` | 设计令牌 + 重置 + 排版 + 全部组件（按钮/表单/卡片/表格/徽标/对话框/提示） | `store.html`、`admin.html`、模拟收银台 |
| `static/store.css` | 前台页面布局（外壳/首页/商品/结算/认证/账号/邀请/维护页） | `store.html`、模拟收银台 |
| `static/admin.css` | 后台页面布局（窄 rail、panels 骨架、统计卡、表格） | `admin.html` |

样式分层即「加载顺序即层级」：`theme.css`（令牌 + 组件）→ `store.css` | `admin.css`（只排区块，不重定义组件）。

令牌与主程序逐项对齐：画布 `#151a1f`、面 `#1a2026`、发丝线 `#303840`、强调 `#f2a20d`、成功 `#54bd78`，主按钮为琥珀渐变 `#ffb82e → #ef9900` 配深色字。

维护时的三条硬规矩：

1. **`theme.css` 必须排在任何页面样式表之前。** 顺序反了就会出现「页面布局被组件样式反向覆盖」这类难查的问题。
2. **新样式加进对应层级，不要靠提高特异性取胜。** 页面级差异写进 `store.css` / `admin.css`，组件级差异写进 `theme.css` 的组件章节 —— 不要在模板里内联 `<style>`。
3. **令牌改名即失效。** `--hb-bg` / `--hb-accent` / `--hb-success` 三个值与 `frontend/static/app.css` 的 `--bg` / `--accent` / `--success` 必须一致，主程序改色而商店没跟就会出现配色漂移。

另外两处**内联** HTML 也走同一套令牌，改配色时别漏：`api/pages.py` 的模拟收银台（`_cashier_html`）和 `api/alipay.py` 的同步跳转页（`_RETURN_PAGE`）。

自查手法：换布局最容易出的是「类名写出来了但没有对应样式」—— 节点照样渲染，只是没有边框和内边距，控制台一声不响。核对时把 `store.js` / `referrals.js` / 模板 `class=` 字面量里的类名逐个到三份样式表里比对，或直接用浏览器 DevTools 遍历 `document.querySelectorAll('*')`，把没有生效样式的节点打出来。

---

## 十三、升级与迁移：积分口径 FLOAT → 整数厘

邀请积分原先以 `FLOAT` 存「积分」、靠 `round(x, 2)` 维持两位小数。正确性建立在「SQL 侧 `round()` 与 Python 侧 `round()` 结果一致」这个**不成立**的前提上：SQLite 是 half-away-from-zero、Python 是 half-even，落在 `.xx5` 上时给出不同分币值（`0.125` → SQLite `0.13` / Python `0.12`）。后果是提现那条「用 round 后的值比对冻结额有没有被并发改过」的条件 UPDATE 会把**没有并发**的情况判成冲突，以及余额与流水之和能差 1 厘。

现已全部改为 `INTEGER` **厘**（1 积分 = 100 厘），运算集中在 `store/commerce/money.py`。**升级不需要手工执行任何命令**：`app.py` 启动时按 `ensure_schema`（补新列）→ `migrate_points`（回填 + 逐行对账 → 退役旧列）自动完成，迁移前会先做一次数据库文件级备份（`VACUUM INTO` 一致快照）。

**三条要知道的规则**：

1. **对账基准是「用户看到的数字」** —— `format_centi(新值) == f"{旧值:.2f}"`。任何一行不符就**整表跳过删列**并打印前 10 处差异，此时库是「新旧并存」的安全状态。
2. **旧列必须删掉，不能留着不管。** 旧列是 `NOT NULL` 且没有 DDL 默认值，ORM 已不再映射它，于是新的 `INSERT` 会以 `NOT NULL constraint failed` 失败 —— **且只在存量库上失败**（全新库本就没有这一列）。
3. 对外 JSON 契约**没变**：仍是 `"10.05"` 这样的两位小数字符串（厘正好是 1/100，无损），所以前端与客户端都不需要跟着改。

备份文件按 `store.db.pre-centi-<时间戳>.bak` 命名。用 WAL 模式时不要用文件复制取备份（见仓库根 `README.md` 的「商店侧」）。
