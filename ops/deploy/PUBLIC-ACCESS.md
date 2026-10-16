# 商店对外接入（真实域名 + 可信证书）

适用场景：**客户机分布在不同网络**，需要跨公网连到你的商店；或者你要**卖授权**（支付宝 /
微信的异步回调必须公网可达）。只在内网分发（同一个局域网）时不需要本文件。

---

## 1. 先分清两种部署形态

同一个产品只有两种拓扑，配置项一样但**取值不同**，混了就会「看似健康、其实连不上」：

| | 同机部署 | 分机部署 |
| --- | --- | --- |
| 谁在哪 | 商店 + 主应用都在**厂商这台** | 厂商那台只跑商店，每台客户机跑主应用 |
| compose 文件 | `docker-compose.yml` | 客户机用 `docker-compose.app.yml` |
| 主应用容器**出站**找商店<br>（`APP_LICENSE_SERVER_URL`） | `http://homeos-store:8802`<br>同一个 compose 项目里用服务名 | 商店的**对外地址**<br>（IP 或域名，浏览器也能打开） |
| **浏览器**打开商店 | 商店自己答的对外地址 | 同左 |

两个地址的分工是刚性的：容器出站走「容器网络内能解析的名字」，浏览器走「公网能打通的
地址」。同机部署里这两者**必然不同**（一个服务名、一个宿主地址），所以别把它们填成同一个值。

登录页的商店入口地址（原来要手填的 `APP_STORE_URL`）**现在不用填**：主应用会问商店
「你的对外地址是什么」（`GET /store/v1/base-url`），并按回答里的 `declared` 标记决定要不要
修正主机名 —— 详见 §2.4。

---

## 2. 为什么不能直接用镜像内置的 8804 HTTPS

主应用与商店的镜像各自内置了 Caddy 反代（主应用 `:8803`、商店 `:8804`）。它用的是
**Caddy 内部 CA 的自签证书**，浏览器手动放行能用，但：

- **客户机里的主应用不会放行**：它用 httpx / urllib 按系统 CA 校验，自签会被拒——
  表现是「无法连接授权服务器」+「取回授权公钥超时」；
- 支付宝 / 微信也不会信任自签证书的回调地址。

> 镜像启动器会在日志里主动警告你把 `APP_LICENSE_SERVER_URL` 写成了 `https://…:8804`。

所以跨公网只有两个选择：

| 方案 | 客户机里的 `APP_LICENSE_SERVER_URL` | 说明 |
| --- | --- | --- |
| **A. 明文 HTTP（最简单）** | `http://<商店公网IP>:8802` | 靠 IP 白名单 / 防火墙收敛来源；传输不明文加密（租约本身由 Ed25519 签名保证真伪，但请求体明文） |
| **B. 真实证书 HTTPS（推荐）** | `https://store.example.com` | 本文件方案：公共 CA 证书，客户机与支付平台都信任 |

---

## 3. 方案 B：域名 + 真实证书

分两步：商店那台改**身份**（谁都已经写好在 compose 里，只要换域名），80/443 上**放一层入口**。

### 3.1 商店那台：`docker-compose.yml` 的 `homeos-store.environment`

```yaml
      STORE_BASE_URL: https://store.example.com    # 商店对外身份：支付回调、同源判定都按它
      STORE_COOKIE_SECURE: "true"                  # 公网只走 HTTPS
      STORE_TRUSTED_PROXIES: 172.16.0.0/12         # TLS 在容器之外终止了
      UVICORN_FORWARDED_ALLOW_IPS: 172.16.0.0/12
```

- `STORE_BASE_URL` 是**唯一权威**：商店需要它才能知道「我对外是 https、域名是什么」。
  不配也不至于全坏（scheme 会退回可信代理报的值，见 `security/request_security.py`），
  但支付回调地址会推导错，所以公网部署必须配。
- 可信代理要**收敛到入口所在网段**（默认 docker 网段即可）：否则 uvicorn 会把入口容器当成
  客户端本人，真实来源 IP、登录限流与审计一起失真。**别填 `*`**。

> ⚠️ `STORE_COOKIE_SECURE: "true"` 之后，会话 Cookie 带 `Secure`：**本机调试请走 https**
> （公网域名，或自签的 `https://127.0.0.1:8804`）。部分浏览器会拒收 `http://` 下的
> `Secure` Cookie，表现为「登录成功但立刻又变回未登录」。

### 3.2 80/443 上放入口：两种选择

**选择一：你已经有入口（openresty / nginx / NAS 系统反代 / CDN）** —— 直接用它，别开内置的
那一段（会抢端口，两层入口终止 TLS 更容易出错）。把域名反代到商店：

```nginx
location / {
    proxy_pass http://127.0.0.1:8802;
    proxy_set_header Host              $host;   # 必须
    proxy_set_header X-Forwarded-Proto $scheme; # 必须
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
}
```

两个 `proxy_set_header` 是**必须**的：少了 `Host`，商店的同源判定与回显都对不上；少了
`X-Forwarded-Proto`，商店会以为自己在 http 上（Cookie 的 `Secure`、绝对链接都会错）。
入口在**另一台机器**上时，`proxy_pass` 换成商店的内网地址，并把 §3.1 的可信代理改成那台
机器的地址或网段。

**选择二：机器上没有现成入口** —— 取消注释 `docker-compose.yml` 里那段
「可选：内置 Caddy 入口」（含文件末尾 `volumes:` 里两行），填域名与证书邮箱：

```yaml
    #   environment:
    #     STORE_DOMAIN: store.example.com        # ← 不合协议、不带端口
    #     ACME_EMAIL: you@example.com            # ← 证书到期 / 吊销通知邮箱（必填）
```

它会起一个 `caddy-public` 容器占 80/443，按域名自动申请并续期公共 CA 证书，反代到
`homeos-store:8802`，证书落在卷 `homeos_caddy-public-data` 里。

**无论哪种选择**，都请确认商店自身的 8802 / 8804 **没有被公网放行**：一旦能从公网直连
8802，就是一条绕过 HTTPS 与入口的明文后台入口（限流、审计、Cookie 的 Secure 全失效）。
只在本机调试的话，把 `docker-compose.yml` 里那两行改成 `127.0.0.1:8802:8802` 即可。

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

> 启用内置 Caddy 段时，还要核对：`STORE_DOMAIN` 不带协议 / 端口 / 空格（带了 Caddy 容器
> 会反复重启）、域名不是裸 IP（公共 CA 不给 IP 签证书）、`ops/deploy/Caddyfile.public.example`
> 确实存在（挂载源缺失时 Docker 会建出**空目录**，Caddy 读到的是一堆二进制乱码）。

### 3.4 客户机（每台）

`docker-compose.app.yml` **只改一行**：

```yaml
      APP_LICENSE_SERVER_URL: https://store.example.com
```

登录页的商店入口**不用另填**：主应用取 `/public/config` 时会问商店「你的对外地址是什么」，
商店配了 `STORE_BASE_URL`（本例就是）就答这个域名，且带 `declared: true` —— 主应用原样采信。

只有推出来的地址不合期望时才取消注释 `APP_STORE_URL` 显式覆盖，例如商店另有一层**只给
浏览器**用的反代（容器走内网穿透地址、浏览器走公网域名）。

### 3.5 支付回调

`STORE_BASE_URL=https://store.example.com` 时回调地址按它自动推导，无需另配：

- 支付宝：`https://store.example.com/store/v1/payments/alipay/notify`
- 微信：`https://store.example.com/store/v1/payments/wechat/notify`

要自定义再设 `STORE_ALIPAY_NOTIFY_URL` / `STORE_WECHAT_NOTIFY_URL`（必须公网可达，填内网
地址保存时会被拒）。配好后在商店 `/admin` 用「测试凭据」自检一次。

---

## 4. 方案 A：明文 HTTP + 防火墙收敛

最省事，适合客户机数量少、来源 IP 固定（如各客户机有固定公网出口）时：

1. `docker-compose.yml` 保持默认端口，公网只放行 **8802**（**不要**同时放行 8804），并用
   防火墙 / 安全组把来源限制到客户机出口 IP；
2. 客户机的 `APP_LICENSE_SERVER_URL` 填 `http://<商店公网IP>:8802`（登录页的商店入口地址
   由主应用问回来，不用另填）；
3. 商店 `/admin` 里若开启了收款，回调地址仍建议单独走一个带证书的域名（否则支付平台拒绝）。

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
| 证书申请失败 / 一直 pending | 域名解析是否生效、80/443 是否公网可达；HTTP-01 需要 80 能连到本机 |
| 客户机报「无法连接授权服务器」 | 确认客户机能解析并访问该域名 443；确认没把地址写成 8804 |
| 登录限流 / 审计里的 IP 全是入口容器地址 | 可信代理没放宽：核对 `STORE_TRUSTED_PROXIES` 与 `UVICORN_FORWARDED_ALLOW_IPS` |
| 商店注册 / 登录 / 下单全部 403 | `Host` 或 `X-Forwarded-Proto` 没透传（§3.2）；同源判定认的是「浏览器实际用的来源」 |
| 登录成功但立刻变回未登录 | `STORE_COOKIE_SECURE` 与访问方式不匹配：HTTPS 部署请走 https（§3.1 的警告） |
| 支付回调收不到 | `STORE_BASE_URL` 是否公网域名、商店 `/admin` 的凭据与回调地址是否对；用「测试凭据」自检 |
| 想临时用 IP+HTTPS | 不建议：公共 CA 不给 IP 签证书，只能自签，客户机又会拒绝 |
