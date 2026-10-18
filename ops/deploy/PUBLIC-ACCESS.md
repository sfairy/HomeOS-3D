# 商店对外接入（真实域名 + 可信证书）

适用场景：**客户机分布在不同网络**，需要跨公网连到你的商店；或者你要**卖授权**（支付宝 /
微信的异步回调必须公网可达）。本项目的客户机按「随时可能在任意网络」发货，商店地址固定为
公网域名，所以这份文件是**部署前置条件**而不是可选优化：没有这一层，客户机装好也连不上商店。

---

## 1. 先分清两种部署形态

同一个产品只有两种拓扑，配置项一样但**取值不同**，混了就会「看似健康、其实连不上」：

| | 同机部署 | 分机部署 |
| --- | --- | --- |
| 谁在哪 | 商店 + 主应用都在**厂商这台** | 厂商那台只跑商店，每台客户机跑主应用 |
| compose 文件 | `docker-compose.yml` | 客户机用 `docker-compose.app.yml` |
| 主应用容器**出站**找商店<br>（`APP_LICENSE_SERVER_URL`） | `http://homeos-store:8802`<br>同一个 compose 项目里用服务名，**永远不变** | 商店的**公网域名**<br>（已写死，客户机不假设与厂商内网互通） |
| **浏览器**打开商店<br>（`APP_STORE_URL`） | **留空**：跟着访问入口走<br>（内网 IP → `http://<同一IP>:8802`，域名 → 商店域名） | 商店域名（写死；客户机没有本机商店） |
| 商店自己的对外身份<br>（`STORE_BASE_URL`） | 商店域名，**不能**是 8802 | 同左 |

三个地址的分工是刚性的：容器出站走「容器网络内能解析的名字」，浏览器走「公网能打通的
地址」，商店自己的身份走「支付平台也能回调到的地址」。同机部署里出站与另外两者**必然不同**
（一个服务名、一个公网域名），所以别把它们填成同一个值。

登录页的商店入口地址 `APP_STORE_URL` 取值的规则变了（不再需要「两份都写死」）：

- **同机部署**（`docker-compose.yml`）**留空**。同一台机器会被内网 IP 与公网域名两种地址
  访问，商店入口必须跟着访问者走，写死任一个都会让另一条入口点不过去。推导在
  `domains/store/discovery.py`：判据是**容器出站主机名**，所以它不受 `STORE_BASE_URL` 里
  那串公网域名影响；同机 + IP 访问时连商店都不问，直接拼 `<同一 IP>:8802`（穿透抖了也成立）。
- **分机部署**（`docker-compose.app.yml`）**写死公网域名**。客户机上没有商店容器，商店只能
  走公网；写死还省掉一次网络往返，商店临时不可达时入口也不会消失。

两者在取不到地址时都会**隐藏入口**，而不是兜底成 `http://127.0.0.1:8802` —— 那是访问者
自己的电脑，只会在生产暴露。运维口径仍然清楚：出站看 `APP_LICENSE_SERVER_URL`，浏览器
链接看 `APP_STORE_URL`（留空则由访问入口推导）。

---

## 2. 商店不提供 HTTPS：没有 8804 这种入口

商店镜像里**没有** Caddy，也没有任何 HTTPS 监听端口。历史上曾有一个容器内的 `:8804` 自签反代，
已移除，原因是：

- **客户机里的主应用不会放行**：它用 httpx / urllib 按系统 CA 校验，自签会被拒 ——
  表现是「无法连接授权服务器」+「取回授权公钥超时」；
- **浏览器也不一定放行**：IP 访问不带 SNI，证书只能签给容器自己的 docker IP，浏览器会判
  「证书与地址不匹配」（部分 WebView / PWA 安装直接硬拦）；
- 支付宝 / 微信也不会信任自签证书的回调地址。

所以商店只有两个入口：内网 `http://<局域网IP>:8802`，公网 80·443 上的真实证书域名
（TLS 由隧道 / 跳板机终止）。少一个自签端口 = 少一个进程、少一类「证书不受信任 / 地址不匹配」
的排错，也不会有人误把 `https://…:8804` 填进 `APP_LICENSE_SERVER_URL`。

> 镜像启动器仍会在日志里主动警告你把 `APP_LICENSE_SERVER_URL` 写成了 `https://…:8804` ——
> 那个地址现在是**连接被拒**，不是证书问题。

所以跨公网只有两个选择。**本项目的两份 compose 已经按方案 B 写死**（商店地址是
`https://homelifepay.iepose.cn`），方案 A 只作为「实在拿不到域名」时的退路，选它就要同时改
三处：商店的 `STORE_BASE_URL` / `STORE_COOKIE_SECURE`（改 `false`），以及客户机那份的两行
商店地址。

| 方案 | 客户机里的 `APP_LICENSE_SERVER_URL` | 说明 |
| --- | --- | --- |
| **A. 明文 HTTP（退路）** | `http://<商店公网IP>:8802` | 靠 IP 白名单 / 防火墙收敛来源；传输不加密（租约由 Ed25519 签名保证真伪，但请求体明文）；**不能收款**（支付平台要求回调是可信 HTTPS） |
| **B. 真实证书 HTTPS（本项目的默认）** | `https://homelifepay.iepose.cn` | 公共 CA 证书，客户机与支付平台都信任；文件里已配好 |

---

## 3. 方案 B：域名 + 真实证书

分两步：商店那台改**身份**（谁都已经写好在 compose 里，只要换域名），80/443 上**放一层入口**。

### 3.1 商店那台：`docker-compose.yml` 的 `homeos-store.environment`

```yaml
      STORE_BASE_URL: https://store.example.com              # 商店对外身份：支付回调、同源判定都按它
      STORE_COOKIE_SECURE: "auto"                            # 按请求协议：公网 https 带 Secure，内网 http 不带
      STORE_TRUSTED_PROXIES: 127.0.0.1,::1,172.16.0.0/12     # 容器内回环 + docker 网段
```

- `STORE_BASE_URL` 是**唯一权威**：商店需要它才能知道「我对外是 https、域名是什么」。
  不配也不至于全坏（scheme 会退回可信代理报的值，见 `security/request_security.py`），
  但支付回调地址会推导错，所以公网部署必须配。它**必须是公网域名**，不能写成
  `http://<IP>:8802`（那个端口只该给内网直连 / 本机反代用）。
- `STORE_COOKIE_SECURE` 保持默认 `auto`：按**本次请求实际用的协议**决定会话 Cookie 要不要
  `Secure`。公网 https 那条带、内网 `http://<IP>:8802` 那条不带 —— 否则内网明文直连会
  「登录成功但刷新又变未登录」。写 `true` 等于恒带，只适合纯 HTTPS 部署；`false` 等于恒不带，
  只适合纯明文部署。
- 可信代理要**收敛到入口所在网段**，同时保留回环：
  - `127.0.0.1,::1` —— 容器内回环（本机调试 / 同容器进程）。
    少了它，从回环进来的请求会被当成没经过代理；
  - `172.16.0.0/12` —— **走发布端口进来的连接**：宿主反代 / 隧道客户端反代到
    `127.0.0.1:8802` 时，源地址是 docker 网桥网关（如 `172.18.0.1`），**不是** 127.0.0.1；
    容器化的入口（`caddy-public` / 容器化 OpenResty / cloudflared）也从这一段连进来。
    自定义过地址池就换成实际网段：
    `docker network inspect homeos-net -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}'`；
  - 入口在**另一台机器**上时，换成那台机器的 IP 或它所在网段。
  入口若跑在宿主机上，靠的是第二条（不是第一条）。**别填 `*`**。
  内网穿透同理且**无需改动**：`frpc` / `cloudflared` 在宿主上反代发布端口、或做成容器，
  两种情况都已被上面两条覆盖。只有隧道客户端在**另一台**机器上时才要补那台的地址。
- 商店侧**没有** `UVICORN_FORWARDED_ALLOW_IPS`：商店的 uvicorn 不带 `--proxy-headers`
  （`homeos-store/backend/src/run.py`），转发头完全由 `STORE_TRUSTED_PROXIES` 判定。
  写进去不会生效，所以刻意不配。主应用侧那个变量仍然有效，别一起删。

> ⚠️ 若把 `STORE_COOKIE_SECURE` 写成 `"true"`（恒带 Secure），内网 `http://<IP>:8802` 会
> 「登录成功但立刻又变回未登录」—— 部分浏览器拒收明文下的 `Secure` Cookie。默认的 `auto`
> 没有这个问题，它按请求实际协议判定，所以除非你确定只有 HTTPS 入口，否则别改成 `true`。

### 3.2 80/443 上放入口：三种选择

**选择一：你已经有入口（openresty / nginx / NAS 系统反代 / CDN）** —— 直接用它，别开内置的
那一段（会抢端口，两层入口终止 TLS 更容易出错）。完整可抄的配置在
[`openresty.store.conf.example`](openresty.store.conf.example)（含 80→443 跳转、
证书、超时与验证清单）。最小必要内容是：

```nginx
upstream homeos_store_upstream { server 127.0.0.1:8802; keepalive 16; }

server {
    listen 443 ssl;
    http2 on;
    server_name homelifepay.iepose.cn;
    ssl_certificate     /etc/nginx/ssl/homelifepay.iepose.cn.fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/homelifepay.iepose.cn.key;

    client_max_body_size 16m;              # 必须：商品图上传是 multipart

    location / {
        proxy_pass http://homeos_store_upstream;
        proxy_set_header Host              $http_host;            # 必须（带端口；$host 会丢端口）
        proxy_set_header X-Forwarded-Proto $scheme;               # 必须
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_buffering off;
    }
}
```

四条**必须**，少一条就是一类难查的故障：

| 设置 | 少了会怎样 |
| --- | --- |
| `Host $http_host` | 同源判定与 `/store/v1/base-url` 回显都对不上，商店写操作 403。**别用 `$host`**：它会把端口摘掉，入口一旦不在 443（本地拿 8443 试）就必炸 |
| `X-Forwarded-Proto $scheme` | 商店以为自己在 http 上，Cookie 的 `Secure` 与绝对链接都错 |
| `X-Real-IP` / `X-Forwarded-For` | 限流与审计把所有人算成一个来源（入口地址） |
| `client_max_body_size ≥ 16m` | 后台上传 8 MB 商品图在入口就被 413，商店日志里什么都没有 |

入口在**另一台机器**上时，`proxy_pass` 换成商店的内网地址，并把 §3.1 的可信代理改成那台
机器的地址或网段。入口在容器里时，上游改成 `homeos-store:8802` 并加入 `homeos-net`。

**选择二：机器上没有现成入口** —— 取消注释 `docker-compose.yml` 里那段
「可选：内置 Caddy 入口」（含文件末尾 `volumes:` 里两行），填域名与证书邮箱：

```yaml
    #   environment:
    #     STORE_DOMAIN: store.example.com        # ← 不合协议、不带端口
    #     ACME_EMAIL: you@example.com            # ← 证书到期 / 吊销通知邮箱（必填）
```

它会起一个 `caddy-public` 容器占 80/443，按域名自动申请并续期公共 CA 证书，反代到
`homeos-store:8802`，证书落在卷 `homeos_caddy-public-data` 里。

**选择三：机器没有公网 IP** —— 用内网穿透（frp + 跳板机 / Cloudflare Tunnel / ngrok）让隧道
客户端从本机**出站**，公网流量回灌到 `127.0.0.1:8802`。对外仍是这个域名，商店侧的三行配置
（`STORE_BASE_URL` / `STORE_COOKIE_SECURE` / `STORE_TRUSTED_PROXIES`）都不用改；主应用的公网域名
（`docker-compose.yml` 里的 `APP_BASE_URL`，当前是 `https://homelife.iepose.cn`）必须填对，
否则 socket.io 会把公网 `Origin` 判成非法来源，实时面板一直重连。
隧道入口同样要满足上面四条，另外**必须允许 WebSocket 升级**。详见
[`TUNNEL-ACCESS.md`](TUNNEL-ACCESS.md)。

**无论哪种选择**，都请确认商店发布的 **8802** 没有被公网放行：一旦能从公网直连 8802，就是一条
绕过 HTTPS 与入口的明文后台入口（限流、审计全部失效）。只在本机调试的话，把 `docker-compose.yml` 里
那行改成 `127.0.0.1:8802:8802` 即可。

### 3.3 启动与验证

改的是同一个文件，命令不变（`up -d` 会按新配置重建被改的容器）：

```bash
docker compose pull && docker compose up -d
```

```bash
# 证书可信（公共 CA 签发，不应有证书告警）
curl -fsS https://store.example.com/v2/keys | head -c 200; echo
# 商店自己认为的对外地址（应是这个域名，且 declared 为 true）
curl -fsS https://store.example.com/store/v1/base-url; echo
# 健康与后台
curl -fsS https://store.example.com/healthz && echo OK
open https://store.example.com/admin
```

再补一条**反向**检查（从外网执行，必须被拒）—— 通了就说明入口漏在公网上：

```bash
curl -m 5 http://<公网IP>:8802/healthz      # 超时 / 拒绝
curl -m 5 -k https://<公网IP>:8804/healthz  # 连接被拒：商店没有 8804
```

> **`404 page not found` 怎么读**：如果域名返回的是纯文本 `404 page not found`，且响应头
> 是 `server: openresty` / `server: nginx`，那是**入口自己的 404** —— 请求根本没到商店
> （没匹配到 server_name、`proxy_pass` 写错、或有别的 `default_server` 先接管了这个域名）。
> 商店自己的 404 是 JSON（`{"detail": ...}`）。同理，`/store/v1/base-url` 返回
> `{"baseUrl": "...", "declared": true}` 才算这条链路真的通了。

> 启用内置 Caddy 段时，还要核对：`STORE_DOMAIN` 不带协议 / 端口 / 空格（带了 Caddy 容器
> 会反复重启）、域名不是裸 IP（公共 CA 不给 IP 签证书）、`ops/deploy/Caddyfile.public.example`
> 确实存在（挂载源缺失时 Docker 会建出**空目录**，Caddy 读到的是一堆二进制乱码）。

### 3.4 客户机（每台）

客户机那份里的商店地址**永远是公网域名**，出厂已填好，不需要改：

```yaml
      APP_LICENSE_SERVER_URL: https://homelifepay.iepose.cn   # 容器出站
      APP_STORE_URL:          https://homelifepay.iepose.cn   # 浏览器里的商店链接
```

**不要**因为「厂商那台就在同一个办公室」就换成 `http://192.168.x.x:8802`：
客户机不在厂商的局域网里，那份文件一旦含私网地址，机器搬到别处就是个连不上商店的孤儿；
而且商店侧的 `STORE_BASE_URL` 仍是公网域名，登录页链接与支付回调都会对不上。
只有厂商换域名时这两行才跟着换（与商店那台的 `STORE_BASE_URL` / `APP_STORE_URL` 同一个域名）。

- `APP_LICENSE_SERVER_URL`：取公钥 / 激活 / 心跳 / 代发验证码 / 查更新。留空会直接启动失败。
  它依赖 80/443 上的入口把域名转到商店：入口挂掉时新客户机取不到公钥，已在跑的老客户机
  靠数据卷里的公钥缓存继续启动，但激活 / 心跳 / 验证码会失败。
- `APP_STORE_URL`：登录页「忘记密码 / 商店」两个链接。不填也能工作 —— 主应用取
  `/public/config` 时会问商店「你的对外地址是什么」，商店配了 `STORE_BASE_URL`
  （本例就是）就答这个域名，且带 `declared: true`，主应用原样采信。但商店不可达时前端
  兜底成 `http://127.0.0.1:8802`，客户点开的是自己电脑，所以公网部署建议显式写死。
- 两行必须指向同一个域名。它们不参与彼此：改出站地址不会自动改浏览器链接，反之亦然。

客户机开跑前先在**那台机器**上验证（容器里是 Debian 的 CA 包，与宿主的证书信任不一定同源）：

```bash
curl -fsS https://store.example.com/healthz
curl -fsS https://store.example.com/v2/keys | head -c 120
```

第二条报证书错误就说明容器里也校验不过（常见于自签 / 私有 CA）：换公共 CA 证书，
或把该 CA 装进宿主与镜像的信任链。别用 `curl -k` 掩盖 —— 主应用不会跳过校验。

### 3.5 支付回调

`STORE_BASE_URL=https://store.example.com` 时回调地址按它自动推导，无需另配：

- 支付宝：`https://store.example.com/store/v1/payments/alipay/notify`
- 微信：`https://store.example.com/store/v1/payments/wechat/notify`

本项目的实际域名对应：

- 支付宝：`https://homelifepay.iepose.cn/store/v1/payments/alipay/notify`
- 微信：`https://homelifepay.iepose.cn/store/v1/payments/wechat/notify`

入口对这两条路径必须**原样转发**：POST 方法、原始 body（渠道的签名是对 body 字节算的）、
`Content-Type`，都不能改写、不能加 Basic Auth / IP 白名单、不能套 WAF 的请求体解码。
商店侧对这两个回调路径豁免了同源校验（`app.py` 的 callback_paths），但仍会校验渠道签名。

要自定义再设 `STORE_ALIPAY_NOTIFY_URL` / `STORE_WECHAT_NOTIFY_URL`（必须公网可达，填内网
地址保存时会被拒）。配好后在商店 `/admin` 用「测试凭据」自检一次 —— 它只能证明凭据对，
**真正证明回调可达的是收到过一笔真实回调**。

---

## 4. 方案 A：明文 HTTP + 防火墙收敛

**退路，本项目默认不走这条路。** 它没有域名、也不能收款，且两份 compose 出厂都写死了
`https://homelifepay.iepose.cn`，所以选方案 A 意味着要**同时改三处**（下面是完整清单，
少改一处就是「看似健康、其实连不上」）：

1. `docker-compose.yml` 保持默认端口，公网只放行 **8802**，并用云安全组 / 实例防火墙把来源
   限制到客户机出口 IP；
2. 商店侧改成明文口径：
   ```yaml
   STORE_BASE_URL: http://<商店公网IP>:8802
   STORE_COOKIE_SECURE: "false"        # 只有明文入口：恒不带 Secure（auto 也可，会按请求判定）
   STORE_TRUSTED_PROXIES: ""           # 没有反代，别把公网请求当成「经由代理」
   ```
   `STORE_TRUSTED_PROXIES` 留空后，来源 IP 直接取 TCP 对端，由安全组保证可信。
3. 客户机那份 `docker-compose.app.yml` 里两行都填 `http://<商店公网IP>:8802`
   （`APP_LICENSE_SERVER_URL` 与 `APP_STORE_URL` 同一个值）—— 仍然是**外网地址**，
   不是厂商的私网 IP；
4. 商店 `/admin` 里若开启了收款，回调地址仍建议单独走一个带证书的域名（否则支付平台拒绝）。
   此时 `STORE_BASE_URL` 仍是 http，需要显式设 `STORE_ALIPAY_NOTIFY_URL` /
   `STORE_WECHAT_NOTIFY_URL` 指到那个域名。**要收款就别用方案 A**，直接用方案 B。

> `/v2/activate` 固定 60 / 小时、`/v2/heartbeat` 与 `/v2/recover` 按
> `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT`（默认 3600 / 小时）按来源 IP 限额。多台客户机
> 共用一个 NAT 出口时额度叠加，日志出现一片 429 就把该值调大。

---

## 5. 证书与备份

- 内置 Caddy 入口的证书与 ACME 账号落在卷 `homeos_caddy-public-data`（带 compose 项目名
  `homeos` 前缀）。容器重建不丢；删了这个卷会重新申请证书，频繁删除可能触发 CA 的签发
  限流，别当日常操作。用外部入口（§3.2 选择一）时，证书由那一层自己管。
- 商店授权私钥在 `homeos_homeos-license-keys`，**单独备份**，公网化不改变这条。

---

## 6. 常见问题

| 现象 | 处理 |
| --- | --- |
| 域名返回纯文本 `404 page not found`（`server: openresty`） | **入口**的 404，请求没到商店：`server_name` 没匹配、`proxy_pass` 写错、或被别的 `default_server` 先接管。商店自己的 404 是 JSON。按 §3.2 / `openresty.store.conf.example` 配好再验 `/store/v1/base-url` |
| 证书申请失败 / 一直 pending | 域名解析是否生效、80/443 是否公网可达；HTTP-01 需要 80 能连到本机 |
| 客户机报「无法连接授权服务器」 | 确认客户机能解析并访问该域名 443；确认没把地址写成 8804（商店没有这个端口）；用 `curl -fsS https://<域名>/v2/keys` 在客户机上验一次证书链 |
| 登录限流 / 审计里的 IP 全是入口地址（127.0.0.1 或 172.x） | 可信代理没收全：核对 `STORE_TRUSTED_PROXIES` 是否包含入口所在网段。宿主机反代 / 隧道反代到发布端口时，来源是 **docker 网桥网关**（`172.x`，用 `docker network inspect homeos-net` 核对），不是 127.0.0.1；只有容器内 Caddy 才是回环。商店侧**没有** `UVICORN_FORWARDED_ALLOW_IPS`，别改错地方 |
| 商店注册 / 登录 / 下单全部 403 | `Host` 或 `X-Forwarded-Proto` 没透传（§3.2）；同源判定认的是「浏览器实际用的来源」 |
| 登录成功但立刻变回未登录 | `STORE_COOKIE_SECURE` 与访问方式不匹配：默认 `auto` 已按请求协议判定，出现这条多半是写成了 `true`（恒带 Secure）—— 改回 `auto`；纯明文部署（§4）可以写 `false` |
| 内网 `https://<IP>:8804` 打不开 | 预期行为：商店没有 HTTPS 端口（8804 已移除）。内网走 `http://<IP>:8802`，公网走真实证书域名 |
| 后台上传商品图 413，但商店日志里没有记录 | 入口的 `client_max_body_size` 小于 16m，请求在 OpenResty 就被拦了 |
| 支付回调收不到 | `STORE_BASE_URL` 是否公网域名、入口是否原样转发 POST body、商店 `/admin` 的凭据与回调地址是否对；用「测试凭据」自检后，以收到一笔真实回调为准 |
| 登录页「商店 / 忘记密码」打开的是 127.0.0.1 | 显式写 `APP_STORE_URL`（§3.4）：商店不可达时前端会用这个兜底值 |
| 反代 / 穿透后主应用面板一直「连接中」，`socket.io` 返回 `400 Not an accepted origin` | 主应用没配 `APP_BASE_URL`：浏览器 WebSocket 一定带 `Origin`，白名单为空时只放行局域网来源。填公网域名即可（会自动并入 CORS 白名单），见 `TUNNEL-ACCESS.md` |
| 没有公网 IP 也要域名 HTTPS | 用内网穿透回灌 `127.0.0.1:8802`，见 `TUNNEL-ACCESS.md` |
| 想临时用 IP+HTTPS | 不建议：公共 CA 不给 IP 签证书，只能自签，客户机又会拒绝。商店内网请用 `http://<IP>:8802` |
