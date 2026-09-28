# 商店公网接入（真实域名 + 可信证书）

适用场景：**客户机分布在不同网络 / 不同地方**，需要跨公网连到你的中心商店；或者你要
**卖授权**（支付宝 / 微信的异步回调必须公网可达）。

只在内网分发（同一个局域网）时不需要本文件，直接看 [SPLIT-DEPLOY.md](SPLIT-DEPLOY.md)。

---

## 1. 为什么不能直接用镜像内置的 8804 HTTPS

主应用与商店的镜像各自内置了 Caddy 反代（主应用 `:8803`、商店 `:8804`）。它用的是
**Caddy 内部 CA 的自签证书**，浏览器手动放行能用，但：

- **客户机里的主应用不会放行**：它用 httpx / urllib 按系统 CA 校验，自签会被拒——
  表现是「无法连接授权服务器」+「取回授权公钥超时」；
- 支付宝 / 微信也不会信任自签证书的回调地址。

所以跨公网只有两个选择：

| 方案 | 客户机里的 `APP_LICENSE_SERVER_URL` | 说明 |
| --- | --- | --- |
| **A. 明文 HTTP（最简单）** | `http://<商店公网IP>:8802` | 靠 IP 白名单 / 防火墙收敛来源；传输不明文加密（租约本身由 Ed25519 签名保证真伪，但请求体明文） |
| **B. 真实证书 HTTPS（推荐）** | `https://store.example.com` | 本文件方案：Caddy 自动申请公共 CA 证书，客户机与支付平台都信任 |

> 无论哪种，都**不要**用 `https://<公网IP>:8804`。

---

## 2. 方案 B：Caddy 自动 HTTPS（推荐）

仓库已备好两个文件，配合基础商店 compose 使用，**不用改 Caddyfile**：

- `ops/deploy/Caddyfile.public.example` — 站点配置，域名走环境变量
- `docker-compose.store.public.yml` — 叠加一个 `caddy-public` 容器（80/443）

### 2.1 前置

1. **域名**：一条 A（或 AAAA）记录指向商店机器的公网 IP，例如
   `store.example.com → 203.0.113.10`。
2. **放行端口**：公网放行 **80**（ACME HTTP-01 校验 / 跳转）与 **443**（站点）。
3. **收掉商店自身的公网端口**：不要裸奔 8802 / 8804，在 `.env` 里绑到回环：

```bash
STORE_PUBLISH_PORT=127.0.0.1:8802
STORE_PROXY_PUBLISH_PORT=127.0.0.1:8804
```

4. `.env` 里填域名相关：

```bash
STORE_DOMAIN=store.example.com
STORE_BASE_URL=https://store.example.com
ACME_EMAIL=you@example.com          # 证书到期 / 吊销通知（必填：Caddy 的 email 不接受空值）
```

5. **让 `deploy.sh` 先替你体检**：只要 `.env` 里有 `STORE_DOMAIN`，`deploy.sh --role store`
   在启动前会自动校验下列各项，把「Caddy 日志里一句证书申请失败」这种难查的症状挡在前面。
   带 **阻挡** 标记的会直接终止，不会带着坏配置把容器拉起来。

   | 检查 | 挡不住的后果 | 处理 |
   |---|---|---|
   | `STORE_DOMAIN` 不带协议 / 路径 / 空格 | Caddy 配置解析失败，容器反复重启 | **阻挡** |
   | `STORE_DOMAIN` 不带端口 / IPv6 字面量 | 对外固定用 80/443，写了端口就不再匹配 | **阻挡** |
   | `STORE_DOMAIN` 不是裸 IP | ACME 不给 IP 签发证书，`https://<IP>` 永远连不上 | **阻挡** |
   | `ACME_EMAIL` 已设置 | Caddy 的 `email` 不接受空值，配置解析失败 | **阻挡** |
   | `ACME_EMAIL` 像邮箱 | 不影响签发，但到期 / 吊销通知收不到 | 警告 |
   | `STORE_BASE_URL` 与域名一致 | 支付回调会被推导到另一个地址 | 警告 |
   | 8802 / 8804 已收到回环 | 明文后台直接暴露，绕过反代（限流与审计失效） | 警告 |
   | `ops/deploy/Caddyfile.public.example` 存在 | 挂载源缺失时 Docker 会建出**目录**，容器起不来 | **阻挡**（改为不加载叠加并说明） |

   > 第 7 项容易被忽略：叠加文件复制过来了、Caddyfile 没跟着复制时，Docker 会把缺失的
   > bind 源建成空目录，Caddy 读到的是一堆二进制乱码而不是配置。这时脚本会拒绝启用叠加
   > 并明确提示，而不是让你去猜容器为什么起不来。

### 2.2 启动

```bash
docker compose -f docker-compose.store.yml -f docker-compose.store.public.yml up -d
```

> **用 `deploy.sh` / `upgrade.sh` 时不用手写这两个 `-f`。** 只要 `.env` 里有 `STORE_DOMAIN`，
> `deploy.sh --role store`（以及 `upgrade.sh --role store`）会**自动带上**这个叠加文件。
> 这一点很关键：如果升级时漏了叠加文件，compose 会用内网环境变量重建商店容器，
> `STORE_BASE_URL` / `STORE_COOKIE_SECURE` / 可信代理会一起悄悄退回内网值，而容器看起来
> 还是健康的。

叠加文件会做三件事：

1. 起 `caddy-public`，按 `STORE_DOMAIN` 自动签发并续期证书，反代到 `homeos-3d-store:8802`；
2. 把 `STORE_BASE_URL` 设为公网域名（支付回调按它推导）；
3. 放宽商店的可信代理到 docker 网段（反代在容器之外了），并强制
   `STORE_COOKIE_SECURE=true`。

> 反代在**镜像外**时，`STORE_TRUSTED_PROXIES` / `UVICORN_FORWARDED_ALLOW_IPS` 必须包含
> 反代容器所在网段，否则 uvicorn 会把反代当成客户端本人，真实来源 IP、登录限流与审计
> 一起失真。收敛到 docker 网段（默认 `172.16.0.0/12`）即可，**别填 `*`**。

### 2.3 验证

```bash
# 证书是否可信（公共 CA 签发，不应有证书告警）
curl -fsS https://store.example.com/v2/keys | head -c 200; echo

# 健康
curl -fsS https://store.example.com/healthz && echo OK

# 后台
open https://store.example.com/admin
```

### 2.4 客户机接入

客户机侧把商店地址换成域名即可（此时 https 是可信的，不会踩自签的坑）：

```bash
./install.sh --license-server https://store.example.com
# 等价于 deploy.sh --role app --license-server https://store.example.com
```

### 2.5 支付回调

`STORE_BASE_URL=https://store.example.com` 时，回调地址按它自动推导，无需另配：

- 支付宝：`https://store.example.com/store/v1/payments/alipay/notify`
- 微信：`https://store.example.com/store/v1/payments/wechat/notify`

要自定义再设 `STORE_ALIPAY_NOTIFY_URL` / `STORE_WECHAT_NOTIFY_URL`（必须公网可达，填内网
地址保存时会被拒）。配好后在商店 `/admin` 用「测试凭据」自检一次。

---

## 3. 方案 A：明文 HTTP + 防火墙收敛

最省事，适合客户机数量少、来源 IP 固定（如各客户机有固定公网出口）时：

1. `.env` 保持默认端口，公网只放行 **8802**，并用防火墙 / 安全组把来源限制到客户机出口 IP；
2. 客户机：`./install.sh --license-server http://<商店公网IP>:8802`；
3. 商店 `/admin` 里若开启了收款，回调地址仍建议单独走一个带证书的域名（否则支付平台拒绝）。

> `/v2/activate` 固定 60 / 小时、`/v2/heartbeat` 与 `/v2/recover` 按
> `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT`（默认 3600 / 小时）按来源 IP 限额。多台客户机
> 共用一个 NAT 出口时额度叠加，日志出现一片 429 就把该值调大。

---

## 4. 已有入口的情况

如果你已经有 nginx / 别的负载均衡 / CDN 终止 TLS：**不要**用上面的 overlay，直接把入口
转发到商店的 `8802`（内网明文即可），并把两层可信代理改成那一层入口的地址或网段：

```bash
STORE_TRUSTED_PROXIES=<入口地址或网段>
UVICORN_FORWARDED_ALLOW_IPS=<入口地址或网段>
STORE_BASE_URL=https://store.example.com
STORE_COOKIE_SECURE=true
```

参考 [Caddyfile.intranet.example](Caddyfile.intranet.example) 里的反代写法。

---

## 5. 证书与备份

- Caddy 的证书与 ACME 账号数据落在卷 `homeos-3d-store_caddy-public-data`（overlay 里定义，
  compose 项目名 `homeos-3d-store` 前缀）。容器重建不丢；删了这个卷会重新申请证书，
  频繁删除可能触发 Let's Encrypt 的签发限流，别当日常操作。
- 商店授权私钥仍在 `homeos-3d-store_homeos-3d-license-keys`，**单独备份**，公网化不改变这条。

---

## 6. 常见问题

| 现象 | 处理 |
| --- | --- |
| 证书申请失败 / 一直 pending | 检查域名解析是否已生效、80/443 是否公网可达；HTTP-01 需要 80 能连到本机 |
| 客户机报「无法连接授权服务器」 | 确认客户机能解析并访问该域名 443；确认没把地址写成 8804 |
| 登录限流 / 审计里的 IP 全是反代容器地址 | 可信代理没放宽：核对 `STORE_TRUSTED_PROXIES` 与 `UVICORN_FORWARDED_ALLOW_IPS` |
| 支付回调收不到 | `STORE_BASE_URL` 是否公网域名、商店 `/admin` 的凭据与回调地址是否对；用「测试凭据」自检 |
| 想临时用 IP+HTTPS | 不建议：公共 CA 不给 IP 签证书，只能自签，客户机又会拒绝 |
