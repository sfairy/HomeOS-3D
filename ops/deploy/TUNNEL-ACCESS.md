# 内网穿透接入（没有公网 IP 时，用外网地址访问主应用与商店）

适用场景：`docker-compose.yml` 这套（商店 + 主应用同机）跑在一台**没有公网 IP** 的机器上
（家里 / 办公室 / NAS 后面），但要求：

- 客户的每台机器能通过 `https://homelifepay.iepose.cn` 连上商店（取公钥、激活、心跳、验证码）；
- 你自己（或运维）能从外网打开主应用面板，并且实时状态正常（面板走 WebSocket）；
- 支付宝 / 微信的异步回调能到达商店。

做法是**从本机出站**连到隧道服务，公网流量由隧道回灌到本机端口。本机不需要公网 IP，
也不用在路由器上做端口映射，对外看到的仍然是 `https://域名`（公共 CA 证书）。

> 如果这台机器**有**公网 IP / 已有 OpenResty 在 80/443 上服务这个域名，不需要本文档，
> 按 [`PUBLIC-ACCESS.md`](PUBLIC-ACCESS.md) §3.2 配普通反代即可。两者可以并存：
> 跳板机上的 OpenResty 只改上游端口，商店侧配置一个字都不用动。

---

## 1. 拓扑：两条隧道，两个域名

```
外网浏览器 / 客户机容器 / 支付平台
        │  https://homelifepay.iepose.cn   (商店)
        │  https://homelife.iepose.cn      (主应用)
        ▼
   ┌──────────────────────────────┐
   │ 跳板机（有公网 IP）           │   OpenResty :443（真实证书）
   │   或隧道服务商（Cloudflare）  │   上游：127.0.0.1:18802 / 127.0.0.1:18801
   └──────────────┬───────────────┘
                  │ 隧道（本机主动出站，无需开放入站端口）
                  ▼
   ┌──────────────────────────────┐
   │ 本机：docker-compose.yml      │
   │   frpc / cloudflared（客户端）│
   │     └─→ 127.0.0.1:8802  商店  │
   │     └─→ 127.0.0.1:8801  主应用 │
   └──────────────────────────────┘
```

要点：

| 项 | 商店 | 主应用 |
| --- | --- | --- |
| 隧道回灌到 | `127.0.0.1:8802`（HTTP 直连端口） | `127.0.0.1:8801`（HTTP 直连端口） |
| 对外地址写进 | `STORE_BASE_URL`（默认 `https://homelifepay.iepose.cn`） | `APP_BASE_URL`（默认 `https://homelife.iepose.cn`） |
| 浏览器链接 | 由主应用推导（`APP_STORE_URL` 留空） | —— |
| 客户机连过来用 | `APP_LICENSE_SERVER_URL`（客户机那份写死域名） | —— |

**两个域名都必须映射**，哪怕你平时只用其中一个访问：从公网域名打开主应用时，登录页的
「商店 / 重置密码」指向商店域名；从局域网打开时指向 `<同一 IP>:8802`。少映射一个，另一条
链接就是 404（`*.iepose.cn` 这类泛解析会实打实回一句 `404 page not found`）。

**不要**把隧道指到 8803：那是主应用镜像内置 Caddy 的**自签**入口，客户机（httpx / urllib 按系统
CA 校验）和支付平台都会拒绝。商店连这样的端口都没有（没有 8804，也没有任何 HTTPS 监听）；TLS
应该在跳板机或隧道服务商那一层终止。

**不要**让隧道暴露 8802 的原始公网端口：穿透的意义就是把入站端口收掉。
用 frp 的 TCP 模式时务必让 frps 只监听回环（`proxyBindAddr = "127.0.0.1"`），
再由跳板机上的 OpenResty 反代过去。

---

## 2. 隧道入口必须做到的 5 件事

和本地反代完全一样，穿透只是把「网线」换成了隧道，HTTP 语义不能变：

| 必须 | 少了会怎样 |
| --- | --- |
| `Host` 原样透传（等于公网域名） | 同源判定失败：登录 / 下单 / 备份 403；商店 `/store/v1/base-url` 回显错 |
| `X-Forwarded-Proto: https` | 商店以为自己在 http 上，绝对链接与 Cookie 的 `Secure` 判定错 |
| `X-Real-IP` / `X-Forwarded-For` | 限流与审计把所有人算成一个来源（隧道客户端） |
| **WebSocket 升级**（主应用） | 面板能打开但状态不刷新、开关点了不回显、日志不动 |
| `client_max_body_size ≥ 16m`（跳板机反代层） | 商店后台上传商品图在入口 413，商店日志里没有记录 |

主应用侧还有一个特有条件：公网域名必须写进 `APP_BASE_URL`（见 §3）。它同时是
同源校验基准、WebSocket 来源基准，以及 **socket.io 的 CORS 白名单**（白名单会自动并入
该值 —— 浏览器 WebSocket 一定带 `Origin`，白名单为空时只放行局域网来源，公网域名会被判
`Not an accepted origin`，表现为实时通道一直重连）。

---

## 3. compose 侧：公网域名已写死，商店入口会自己跟着走

商店的 `STORE_BASE_URL` / `STORE_COOKIE_SECURE` / `STORE_TRUSTED_PROXIES` **已经是公网口径**，
穿透不需要动：隧道客户端跑在宿主上时，反代到发布端口 → 容器看到的是 docker 网桥网关
（`172.x`，可信）；跑在容器里时源是那个容器的 `172.x`（也可信）。两条都已被
`STORE_TRUSTED_PROXIES` 里的 docker 网段覆盖。

主应用同理，`docker-compose.yml` 里默认已写死公网域名：

```yaml
      APP_BASE_URL: ${APP_BASE_URL:-https://homelife.iepose.cn}
```

换域名时用同名环境变量覆盖（客户机那份用 `HOMEOS_PUBLIC_URL`），不必改被跟踪的文件。
**不要**把它留空：留空只适合「公网域名与本机直连用的 Host 相同」的部署，否则一旦入口
改写了 `Host`，socket.io 会把公网来源判成非法（面板一直重连）。

填了之后**局域网 IP 直连仍然可用**：来源校验同时接受「与本请求 `Host` 同源」，WebSocket
握手也补了同源兜底，不会因为配了公网域名就把局域网访问拒掉。

### 商店入口（登录页「商店 / 重置密码」）不需要配

`docker-compose.yml` 里 `APP_STORE_URL` 是**留空**的，由主应用按访问者当前入口推导：

| 浏览器打开的地址 | 商店链接 |
| --- | --- |
| `http://<局域网IP>:8801` | `http://<同一 IP>:8802`（不联网、不依赖穿透） |
| `https://<局域网IP>:8803` | `http://<同一 IP>:8802` |
| `https://homelife.iepose.cn` | `STORE_BASE_URL` 声明的 `https://homelifepay.iepose.cn` |

判据是**容器出站主机名**（同机 compose 用服务名 `homeos-store`，浏览器解析不了），
所以写死的公网域名不会把「同机、只差端口」这件事掩盖掉。客户机那份
（`docker-compose.app.yml`）没有本机商店，`APP_STORE_URL` 直接写死公网域名。

**前提：商店自己的公网域名也必须能打开。** 主应用只给一个跳转链接，打不开是商店那条
入口的问题（映射没建 / 上游端口错），不是链接错了 —— 用 `preflight.sh` 的第 8 节验。
一句话检查：

```bash
curl -fsS https://homelife.iepose.cn/api/v1/public/config; echo
# {"storeUrl":"https://homelifepay.iepose.cn", ...} ← 从公网打开时应该是这个
# 从局域网打开则应变成 http://<你的 NAS IP>:8802
```

### 主应用的可信代理

`docker-compose.yml` / `docker-compose.app.yml` 里的
`APP_TRUSTED_PROXIES` / `UVICORN_FORWARDED_ALLOW_IPS` 已包含 docker 网段：

```yaml
      APP_TRUSTED_PROXIES: 127.0.0.1,::1,172.16.0.0/12
      UVICORN_FORWARDED_ALLOW_IPS: 127.0.0.1,::1,172.16.0.0/12
```

原因是隧道回灌到发布端口时，容器看到的源是网桥网关 `172.x`，不是 `127.0.0.1`。网段以实际值为准：

```bash
docker network inspect homeos-net -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
```

> 这两行只影响限流 / 审计里的来源 IP，以及 uvicorn 对请求 scheme 的识别；Cookie 的 `Secure`
> 直接读 `X-Forwarded-Proto`，同源与 WebSocket 来源看 `APP_BASE_URL` / 请求 `Host`。
> **不要**填 `*`：那等于让客户端自己写来源 IP。

---

## 4. 方案一：frp + 跳板机上的 OpenResty（推荐，可继续用现有域名）

适合你已有一台公网服务器、域名与证书都在那台上。**跳板机的 OpenResty 配置几乎不变**，
只把上游从 `127.0.0.1:8802` 换成隧道端口 `127.0.0.1:18802`。

### 4.1 跳板机：`frps.toml`

```toml
bindPort = 7000
# 关键：隧道端口只绑回环，公网只能经 OpenResty 进来
proxyBindAddr = "127.0.0.1"
auth.method = "token"
auth.token = "<换成一串随机值>"
```

```bash
# 跳板机（示例）
./frps -c frps.toml
```

放行入站：`7000/tcp`（隧道注册）与 `443/tcp`（OpenResty）。**不要**放行 18801 / 18802。

### 4.2 本机：`frpc.toml`

```toml
serverAddr = "<跳板机公网 IP>"
serverPort = 7000
auth.method = "token"
auth.token = "<与 frps 相同>"

# 断线自动重连、半死连接能被探活清掉（实时面板很依赖这条）
transport.heartbeatInterval = 10
transport.heartbeatTimeout = 30
transport.tcpMux = true

# 商店：跳板机 127.0.0.1:18802 → 本机 127.0.0.1:8802
[[proxies]]
name = "homeos-store"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8802
remotePort = 18802

# 主应用：跳板机 127.0.0.1:18801 → 本机 127.0.0.1:8801
[[proxies]]
name = "homeos-app"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8801
remotePort = 18801
```

用 TCP 模式的好处：`Host` / `X-Forwarded-*` / WebSocket 升级全部由 OpenResty 原样转发，
frp 只当一根网线，不存在「隧道把升级头吃掉」这类问题。

> 隧道客户端也可以做成容器（`snowdreamtech/frpc`），此时 `localIP` 换成服务名
> `homeos-store` / `homeos`（docker 网段已在可信代理里，见 §3）。

### 4.3 跳板机 OpenResty：两个 server 块

商店沿用 [`openresty.store.conf.example`](openresty.store.conf.example)，只改上游：

```nginx
upstream homeos_store_upstream { server 127.0.0.1:18802; keepalive 16; }
# 其余原样保留：Host / X-Forwarded-Proto / X-Real-IP / X-Forwarded-For / client_max_body_size 16m
```

主应用新增一个 server 块（**WebSocket 的两行是必须的**）：

```nginx
upstream homeos_app_upstream { server 127.0.0.1:18801; keepalive 16; }

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    http2 on;
    server_name homelife.iepose.cn;
    ssl_certificate     /etc/nginx/ssl/homelife.iepose.cn.fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/homelife.iepose.cn.key;

    # 商店/主应用都有 multipart 上传；主应用侧备份导入也走它
    client_max_body_size 64m;

    location / {
        proxy_pass http://homeos_app_upstream;
        proxy_set_header Host              $http_host;            # 必须（带端口；$host 会丢端口）
        proxy_set_header X-Forwarded-Proto $scheme;               # 必须
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;                # WebSocket 必须
        proxy_set_header Connection $connection_upgrade;          # WebSocket 必须
        proxy_read_timeout 3600s;                                 # 长连接别 60s 就掐
        proxy_buffering off;
    }
}
```

隧道是长连接，`proxy_read_timeout` 别用默认值；`frps` 那侧的心跳（§4.2）负责清掉半死连接。

主应用还要补一个 **80 → 443 跳转**块（商店那份 `openresty.store.conf.example` 里已经有了），
否则 `http://homelife.iepose.cn` 要么落成入口自己的 404，要么（更糟）让用户停在 http 上：
Cookie 不带 `Secure`、麦克风 / 语音 / PWA 全部不可用，而页面上看不出任何异常。

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name homelife.iepose.cn;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme;
        default_type "text/plain";
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

### 4.4 跳板机没有反代时

用 frp 的 `https` + `https2http` 插件让 frpc 自己终止 TLS（证书文件要放在**本机**
frpc 能读到的路径）：

```toml
# frps.toml 增加
vhostHTTPSPort = 443

# frpc.toml 里把商店 proxy 换成
[[proxies]]
name = "homeos-store"
type = "https"
customDomains = ["homelifepay.iepose.cn"]
[proxies.plugin]
type = "https2http"
localAddr = "127.0.0.1:8802"
crtPath = "/etc/certs/homelifepay.iepose.cn.fullchain.pem"
keyPath = "/etc/certs/homelifepay.iepose.cn.key"
hostHeaderRewrite = "homelifepay.iepose.cn"
# 插件不会自动补协议头，必须显式加
[proxies.plugin.requestHeaders.set]
X-Forwarded-Proto = "https"
```

主应用同理（`localAddr = "127.0.0.1:8801"`，`customDomains = ["homelife.iepose.cn"]`，
`hostHeaderRewrite` 同步换掉）。这种模式下没有 OpenResty 兜底，§2 的 5 条全靠
`hostHeaderRewrite` + `requestHeaders.set` + `X-Forwarded-For`（frp 默认会加）保证。

---

## 5. 方案二：Cloudflare Tunnel（不用自备公网服务器）

```yaml
# /etc/cloudflared/config.yml
tunnel: <tunnel-uuid>
credentials-file: /etc/cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: homelifepay.iepose.cn
    service: http://127.0.0.1:8802
  - hostname: homelife.iepose.cn
    service: http://127.0.0.1:8801
  - service: http_status:404
```

```bash
cloudflared tunnel run
```

Cloudflare 侧默认就会带 `Host`、`X-Forwarded-Proto: https`、`X-Forwarded-For`（真实客户端），
并支持 WebSocket，§2 的五条基本不用额外配。注意三点：

- 域名必须托管在 Cloudflare（或在控制台做 CNAME 接入），DNS 记录由
  `cloudflared tunnel route dns` 创建；
- **打开 SSL/TLS → Edge Certificates → Always Use HTTPS**。Cloudflare 默认允许
  `http://域名` 直接返回页面，那样浏览器拿到的就是非安全上下文（无麦克风 / PWA，
  Cookie 也不带 `Secure`）—— 和 §4.3 补 80 跳转是同一件事，只是 Cloudflare 在面板里做；
- Free 套餐请求体上限 100 MB，商店的 16 MB 商品图不受影响；但**别**把
  `client_max_body_size` 这种事指望在隧道上做 —— 它只在反代层存在。

`cloudflared` 也可以做容器（加入 `homeos-net`，`service: http://homeos-store:8802` /
`http://homeos:8801`），服务名同上（docker 网段已在可信代理里，见 §3）。

ngrok 一类工具同理：确认它保留了 `Host` 与 `X-Forwarded-Proto`，并且允许 WebSocket。

---

## 5.5 方案三：节点小宝（飞牛 / 群晖这类 NAS 的客户端穿透）

NAS 上最常见的做法：装「节点小宝」客户端，用它的 `*.iepose.cn` 域名做外网入口。
它和 frp / Cloudflare 的差别在于**映射登记在厂商控制台**，本机看不到配置，所以出错时
现象只有一句 404。下面几条是这套拓扑特有的。

### 5.5.1 先认出「边缘 404」——它不是应用返回的

```bash
curl -sS -D- -o /dev/null https://<你的域名>/
```

| 响应 | 含义 |
| --- | --- |
| `404`、`content-length: 19`、正文 `404 page not found`、带 `x-content-type-options: nosniff` | **穿透边缘**没找到这个 Host 的映射（Go 的默认 404）。流量没到 NAS |
| JSON 正文、带 `x-request-id` / CSP / `referrer-policy` 等一长串头 | 到了商店或主应用（应用自己的 404 是 JSON） |

`*.iepose.cn` 是**泛解析**：任何没登记的子域名都会解析到边缘并回同一句 19 字节 404。
所以「域名解析成功」完全不代表映射存在。

### 5.5.2 控制台里四条必须对齐

控制台 → 内网穿透 → 添加服务，各建一条：

| 字段 | 主应用 | 商店 |
| --- | --- | --- |
| 转发设备 | 这台 NAS（客户端已在线） | 同左 |
| 内网地址 | `<NAS 局域网 IP>:8801` | `<NAS 局域网 IP>:8802` |
| 外网域名 | `homelife.iepose.cn` | `homelifepay.iepose.cn` |
| 协议 | `http` | `http` |

四个易错点：

1. **内网地址填局域网 IP，别填 `127.0.0.1`**。客户端以容器方式跑时，`127.0.0.1`
   指的是那个容器自己；填 `ip -4 addr` 里 NAS 的地址最稳（Docker 已把 8801/8802
   发布到宿主机）。
2. **别映射 8803**。那是主应用镜像内置 Caddy 的**自签** HTTPS，穿透边缘再过一层会
   双重 TLS；客户机里的 httpx 按系统 CA 校验，遇到自签直接失败。
3. **访问规则必须是「公开访问 + 关闭认证访问」**。认证墙（扫码 / 密码）会把
   **客户机容器**挡在外面 —— 它无法扫码，取公钥 `/v2/keys`、激活、心跳、验证码全都会失败。
   公开访问需要先完成实名认证。
4. 新建后约 20 秒生效；期间 404 属正常。

### 5.5.3 验证

```bash
curl -fsS https://homelife.iepose.cn/health/ready && echo APP_OK
curl -fsS https://homelifepay.iepose.cn/healthz && echo STORE_OK
curl -fsS https://homelifepay.iepose.cn/store/v1/base-url; echo   # 期望 declared:true
curl -fsS https://homelifepay.iepose.cn/v2/keys | head -c 120
```

建好映射仍是 404 → 内网地址填错，或转发设备离线；其余报错按「§8 常见故障对照」处理。

### 5.5.4 它不适合长期当商店入口

| 限制 | 后果 |
| --- | --- |
| 公开访问同时**最多 5 个**用户，超出要扫码 | 多台客户机同时心跳 / 注册就会撞上限；支付回调无人值守，直接签不出码 |
| 只支持 http / https，**不支持 TCP / UDP** | 任何非 HTTP 场景都得另找通道 |
| 映射不可版本化 | 换域名 / 换 NAS IP 只能去控制台手改，排错也拿不到本地配置 |

建议分工：**`homelife`（只给自己远程看面板）用节点小宝**；**`homelifepay`（面向全部
客户机 + 支付回调）换 Cloudflare Named Tunnel（§5）或公网 VPS 上的 frp + OpenResty（§4）**。

---

## 6. 上线自检（在**外网**、不要在本机执行）

> 本机侧（容器 / 端口 / 出站 / 授权状态 / 指纹）先用 `bash ops/deploy/preflight.sh`
> 一次跑完，它会把上面这些链路逐条标 ✓ / ✗；本节只补「从外网看」的那几项。

```bash
# 1. 商店：入口真的到了商店（不是入口自己的 404）
curl -fsS https://homelifepay.iepose.cn/healthz && echo OK
curl -fsS https://homelifepay.iepose.cn/store/v1/base-url; echo
#    期望 {"baseUrl":"https://homelifepay.iepose.cn","declared":true}

# 2. 商店公钥（客户机只读这一步的信任链）
curl -fsS https://homelifepay.iepose.cn/v2/keys | head -c 120; echo

# 3. 主应用：浏览器入口与来源基准
curl -fsS https://homelife.iepose.cn/api/v1/public/config; echo
curl -fsS https://homelife.iepose.cn/health/ready && echo OK
```

```bash
# 4. 主应用实时通道：握手必须 101，不是 400 / 403
curl -i -s -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' \
  -H 'Origin: https://homelife.iepose.cn' \
  'https://homelife.iepose.cn/socket.io/?EIO=4&transport=websocket'
#    101 = 通；400 Not an accepted origin = APP_BASE_URL 没填 / 没进 CORS 白名单；
#    502/504 = 隧道或反代没把 Upgrade 透传
```

```bash
# 5. 真实来源 IP 没退化成隧道地址：连点几次错误密码，然后看商店日志里的来源
docker logs --tail 50 homeos-store
```

```bash
# 6. 明文端口没有漏到公网（跳板机与外网各跑一次，都应超时 / 拒绝）
curl -m 5 http://<跳板机IP>:18802/healthz
curl -m 5 http://<本机公网IP或域名>:8802/healthz
```

浏览器里再确认三件事：

- 主应用登录后**刷新页面不掉线**、面板数值会动（WebSocket 真的在用）；
- 商店登录后刷新仍保持登录（`Secure` Cookie 正常下发）；
- 商店后台「激活码」页能发码，客户机容器里 `curl -fsS https://homelifepay.iepose.cn/v2/keys`
  能过（这条才是客户机真正会走的链路）。

再在**局域网内**把主应用那两个入口各走一遍（公网通不代表内网通）：

- `http://<IP>:8801` 能登录、刷新不掉线；
- `https://<IP>:8803`（首次点「继续前往」放行自签证书）**同样能登录**。这条最容易漏：
  入口把 `Host` 的端口摘掉时，页面能打开、读接口也正常，只有登录 POST 会 403
  「此操作只允许从当前应用页面发起」—— 现象很像密码错，实际是来源校验。
  另外 `https://<IP>:8803` 只有在 `APP_HTTPS_DEFAULT_SNI` 填了那个 IP 时证书才对得上。

---

## 7. 可用性：隧道断了会怎样（先算一遍再上线）

穿透把「公网入口」变成了**你家宽带 + 隧道客户端 + 跳板机**三段串联，任何一段抖动都会让
所有客户机同时失联。这不是故障，而是拓扑的固有代价 —— 但必须知道哪一处会**真的停机**：

| 链路 | 断了的后果 |
| --- | --- |
| 你自己的面板（`homelife`） | 只影响远程访问；局域网 `http://<IP>:8801` / `https://<IP>:8803` 不受影响 |
| 客户机取公钥 / 激活 / 注册验证码（`homelifepay`） | 已激活的机器继续跑；新机无法激活，找回密码 / 注册验证码失败 |
| **客户机心跳（`homelifepay`）** | 见下面这条，**这是唯一会把客户机停掉的地方** |

租约（`STORE_LEASE_TTL_SECONDS`，默认 `259200` = **3 天**）到期且拿不到新租约时，
客户机的主应用会进入 `LEASE_EXPIRED`，`allows()` 直接返回 false，面板被授权门禁挡住 ——
不是「功能降级」，是**整机不可用**。所以：

- 隧道不是高可用的话，把租约放长到你承受得起的断线时长（例如 30 天：
  `STORE_LEASE_TTL_SECONDS=2592000`），代价是「吊销 / 退款」在客户机上生效变慢；
- 反过来，如果你要求「一天内必须回连」，就保持默认值，但要接受家里断网三天客户就停机；
- 心跳周期 `STORE_HEARTBEAT_INTERVAL_SECONDS`（默认 300 秒）决定恢复速度，不影响停机判定。

同一类坑还有两个，都是「本机时间/身份不对 → 客户机以为自己被吊销」：

- **时钟**：租约校验用签名里的 `issuedAt` / `expiresAt`，本机时间比商店快过
  `APP_LICENSE_CLOCK_SKEW_SECONDS` 会被判回拨（`CLOCK_ROLLBACK`），慢过租约时长会提前到期。
  跳板机和客户机都要开 NTP；
- **跳板机证书**：证书过期后客户机会直接 TLS 失败（`httpx` 用系统 CA，不做例外）。
  Caddy 的 ACME 会自动续期；手工证书请设到期提醒。

---

## 8. 常见故障对照

| 现象 | 原因 / 处理 |
| --- | --- |
| 登录 / 下单 / 备份 403，读接口正常 | `Host` 或 `X-Forwarded-Proto` 被隧道改写；主应用侧确认填了 `APP_BASE_URL`，商店侧确认隧道透传 `Host`。**用 `$http_host` 而不是 `$host` / `{host}`**：它们会把端口摘掉，只在 443 上碰巧正确 |
| 面板能打开，但状态不刷新 / 一直「连接中」 | WebSocket 没升级：反代缺 `Upgrade` / `Connection`，或 `socket.io` 返回 `400 Not an accepted origin`（`APP_BASE_URL` 没配） |
| 隧道连上几分钟后全部 502 | 反代 `proxy_read_timeout` 太短或 frp 心跳没配；调 §4.2 的心跳与 §4.3 的超时 |
| 限流 / 审计里 IP 全是 `127.0.0.1` 或 `172.x` | 隧道/反代没带 `X-Real-IP` / `X-Forwarded-For`；商店侧再核对 `STORE_TRUSTED_PROXIES` 是否包含隧道客户端的来源 |
| 商店返回 `404 page not found`（`server: openresty`） | 跳板机入口没匹配到 `server_name` 或上游端口写错（隧道端口 vs 8802）；商店自己的 404 是 JSON |
| 两个域名都返回 19 字节 `404 page not found` + `x-content-type-options: nosniff` | **穿透边缘**的默认 404（Go），流量没到 NAS。`*.iepose.cn` 是泛解析，随机子域名也是这个响应 —— 去穿透控制台确认映射已建、内网地址是 NAS 的局域网 IP、协议是 http（见 §5.5） |
| 登录成功立刻又变未登录 | `STORE_COOKIE_SECURE` 被写成了 `true`（恒带 Secure）却从 `http://` 进来，或入口丢了 `X-Forwarded-Proto` 让商店把 https 请求当成 http。保持默认 `auto` 并透传该头 |
| 内网 `https://<IP>:8804` 连不上 | 预期：商店没有 HTTPS 端口（8804 已移除），内网走 `http://<IP>:8802`、公网走域名 |
| 内网 `https://<IP>:8803` 能打开，但保存 / 开关 / HA 摄像头报 403 | 内置 Caddy 把端口摘了（`header_up Host {host}`）。镜像已改为 `{http.request.hostport}`；自己另配入口时同样别丢端口 |
| 客户机报「无法连接授权服务器」 | 客户机只能看到域名：先在那台机器上 `curl -fsS https://homelifepay.iepose.cn/v2/keys`，别用 `curl -k` 掩盖证书问题 |
| 断网 / 隧道挂过一阵后，客户机全部提示授权失效 | 断线时长超过了 `STORE_LEASE_TTL_SECONDS`（见 §7）；恢复隧道后会自动续租，但要等心跳周期 |
| 上传商品图 413，商店日志无记录 | 跳板机反代的 `client_max_body_size` 小于 16m（隧道本身不限体积） |
| 支付回调收不到 | 回调地址按 `STORE_BASE_URL` 推导；确认隧道把 POST body 原样送到商店，且入口没有 WAF 改写 body |

---

## 9. 与其它文档的关系

- [`PUBLIC-ACCESS.md`](PUBLIC-ACCESS.md)：两种拓扑、三条地址链路、反代四要素与证书方案；
- [`openresty.store.conf.example`](openresty.store.conf.example)：商店那个 server 块的可抄版本
  （本文档只改它的 `upstream`）；
- `docker-compose.yml` 文件头：不变式（商店与主应用永远同机）、首次启动与上线自检。
