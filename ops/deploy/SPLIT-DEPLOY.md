# 部署拓扑：中心商店 + 多台客户机

**生产形态**：授权商店是**厂商侧唯一一台**（你的服务器），主应用**一个客户一台**，各自
指向中心商店。客户机不需要商店的代码或密钥。

**开发 / 自测形态**：一台机器同时跑商店与主应用（`--role all`），仅用于本地验证，**不用于
客户交付**。

| 文件 | 项目名 | 角色 | 部署到 |
| --- | --- | --- | --- |
| `docker-compose.store.yml` | `homeos-3d-store` | 授权商店（中心，唯一）：网络与公钥卷的持有者 | 厂商机 |
| `docker-compose.app.yml` | `homeos-3d` | 主应用：**可单独运行**，启动时从中心取回公钥 | 每台客户机 |
| `docker-compose.app.shared.yml` | 叠加到 `homeos-3d` | 仅同机（开发 / 自测）时用：加入商店的网络与公钥卷 | 开发机 |
| `docker-compose.store.public.yml` | 叠加到商店 | 仅跨公网时用：真实域名 + 可信证书 HTTPS | 厂商机（公网） |

```
                  ┌────────────── 厂商机（唯一）──────────────┐
                  │  homeos-3d-store   :8802 / :8804          │
                  └───────────────────┬───────────────────────┘
                      /v2/keys  ⟵─────┼─────⟶  /v2/activate /v2/heartbeat
      ┌───────────────────────────────┼───────────────────────────────┐
      ▼                               ▼                               ▼
 客户机 A  homeos-3d            客户机 B  homeos-3d            客户机 C  homeos-3d
  :8801 / :8803                  :8801 / :8803                  :8801 / :8803
```

所有机器上的操作都由 `ops/deploy/deploy.sh` 收口：

```bash
# 厂商机：中心商店（唯一一次）
ops/deploy/deploy.sh --role store
# 每台客户机（各一次）
ops/deploy/deploy.sh --role app --license-server http://<中心商店>:8802
# 开发 / 自测（同机，不用于客户交付）
ops/deploy/deploy.sh --role all
```

> **跨机直连用 `http://<中心商店>:8802`，不要用 `https://<中心商店>:8804`。** 商店内置反代用的是
> Caddy 内部 CA 的自签证书（`skip_install_trust`，不写系统信任库），主应用容器的 httpx / 取公钥
> 的 urllib 都会按系统 CA 校验而失败 —— 表现是「无法连接授权服务器」+「取回授权公钥超时」。
> 同机部署（`--role all`）走容器内网 `http://homeos-3d-store:8802`，不受此限。

**要跨公网 / 要卖授权**：别用自签，见 [PUBLIC-ACCESS.md](PUBLIC-ACCESS.md)（域名 + 真实证书
反代，支付宝 / 微信回调也要求它）。**客户机分发**见 [pack-customer.sh](pack-customer.sh) 与
[CUSTOMER.md](CUSTOMER.md)；**升级 / 回滚**见 [UPGRADE.md](UPGRADE.md)。

## 0. 所有机器共同的前提

- **同一份提交。** 两份镜像独立构建，授权协议里的 `keyId`（由公钥字节派生）、`generation`、`clientVersion` 都是运行期才校验的，版本漂移不会在构建期报错。两边都用同一个 tag（该 tag 由仓库根 `package.json` 的 `version` 决定）。
- **架构要各自匹配。** 镜像里的 Python 已被 Cython 编译成 `.so`，是 per-arch 产物，amd64 / arm64 不能互相搬镜像。
- **时钟同步。** 租约、会话、令牌全部按时间判定；两台机器时钟偏移大了会表现为「刚发的租约已过期」。
- 构建只需 `Dockerfile`（`--target app` / `--target store`）或直接用 GHCR 镜像；**不需要**在两台机器上各自跑 compose 构建。

## 1. 中心商店（厂商机）：先起商店

```bash
./ops/deploy/deploy.sh --role store              # 拉镜像 + 起容器 + 等健康 + 打印公钥 sha256
# 首次部署后打开 http://<厂商机IP>:8802/setup 创建管理员
```

- 授权私钥**只在这台机器上**：镜像不含私钥（`.dockerignore` 排除了 `homeos-store/keys/local/`），首次启动生成到卷 `homeos-3d-store_homeos-3d-license-keys`。**这个卷丢了等于所有已激活客户端失效**，单独备份。
- **商店首次启动是随机生成密钥对**（`Ed25519PrivateKey.generate()`），所以它的公钥和仓库里 `keys/` 的开发公钥**不一样**。公钥会同步到共享卷 `homeos-3d-client-keys`（同机 overlay 直接挂它）；分拆部署时由客户机启动时通过 `GET /v2/keys` 自动取回，见下一节。
- 站点配置（邮件 / 支付 / 文案）在 `/admin` 改，不走环境变量。

## 2. 客户机的公钥：全自动，无需人工投放

主应用自己**不生成**密钥，它需要**目标商店自己的**两个公钥。这件事现在是自动的：

- 主应用容器启动时（`ops/docker/start_app.py` → `ops/docker/bootstrap_keys.py`）向
  `APP_LICENSE_SERVER_URL` 的 **`GET /v2/keys`** 取一份公钥，校验指纹后落到自己的数据卷
  `/data/client-keys`，之后即使商店暂时不可达也能离线启动。
- 同机部署（`--role all`）走另一条路：`docker-compose.app.shared.yml` 把商店写出的公钥卷
  以**只读**挂到 `/shared-keys`，启动器不联网、也不写盘。

仓库里的 `keys/` 只是本地联调用的开发公钥（`ops/start.py` 用），容器部署不读它 —— 因此
不会有「误用开发公钥、激活必然失败」这个坑。

**为什么可以明文取公钥：** 公钥不是秘密（租约真伪由 Ed25519 验签保证），而首次启动时双方
还没有共享传输公钥（X25519 请求体加密依赖它），只能直接读。真正要防的是「被换成别的密钥对」，
启动器因此做了两道校验：

1. **指纹相符**：返回的 PEM 必须与它声明的 sha256 一致；
2. **连续性**：本地已固定某把签名公钥时，只有当服务器把这把列为**上一代公钥**，才允许换成
   新的（这是合法轮换的必然特征）。否则拒绝替换并保留原样。

所以：**商店轮换密钥时不需要动客户机** —— 把上一代四件套（`license-*.previous.pem`）按
商店文档放好开启重叠窗口：分拆部署时 A 下次启动就会自动跟进；同机部署（`--role all`）则由
商店启动器把上一代公钥一起镜像进共享卷（`ops/license_keys.py`），不必人工搬运。
两种情况都会把这把旧公钥一起落盘继续参与验签，窗口结束后自动清理。

想人工核对（可选）：`deploy.sh --role store` 结束前会打印两个 sha256，客户机端启动日志里也会打印
取回后的 `keyId` 与指纹，对比一下即可。

```bash
# 中心商店：看一眼当前公钥
docker exec homeos-3d-store sha256sum /data/client-keys/*.pem

# 客户机：看一眼取回结果（启动日志）
docker logs homeos-3d | grep 授权公钥
```

**要手工指定公钥**（离线盘点、或从别处恢复数据卷）时，把两个 PEM 放进
`APP_CLIENT_KEYS_DIR`（默认 `/data/client-keys`）并 `chmod 644`，再把
`APP_CLIENT_KEYS_FETCH=off` 即可，启动器就不再联网。

- 两个文件缺一不可：`license-public.pem`（Ed25519，验签租约）、`license-transport-public.pem`（X25519，加密请求体）。
- 轮换重叠窗口内再加一个 `license-public.previous.pem`（上一代签名公钥），主应用会自动认它，不必配环境变量。
- **权限是最常见的坑。** 容器里跑的是 uid 1000（`homeos`），而 `scp` / `docker cp` 常见结果是 `root:600`；公钥须 `chmod 644`。
- 该端点按来源 IP 限流（240 / 小时），响应带 `Cache-Control: no-store`。

## 3. 客户机：再起主应用

```bash
# .env 至少要有这几项（其余见 .env.example 的 A 区）：
#   APP_LICENSE_SERVER_URL=http://<中心商店IP>:8802   # 跨机就用商店 HTTP 端口（别用自签的 8804）
#   APP_COOKIE_SECURE=false                       # 要让 HTTP / HTTPS 都能登录就用 false
#   APP_TRUSTED_PROXIES=127.0.0.1,::1             # 内置反代在容器回环上，保持默认
#   UVICORN_FORWARDED_ALLOW_IPS=127.0.0.1,::1     # 保持默认，不要填 *

./ops/deploy/deploy.sh --role app --license-server http://<中心商店IP>:8802
docker logs homeos-3d | head     # 取首次设置引导密钥（容器内 /data/setup-token）
```

独立部署用的 `docker-compose.app.yml` **不再**声明 external 网络与共享卷，所以不需要先
`docker network create` / `docker volume create`；只有同机部署（`--role all`）才通过
`docker-compose.app.shared.yml` 加入商店的网络与公钥卷。

- **`APP_LICENSE_SERVER_URL` 必须显式设置**（`deploy.sh --license-server` 或 `.env`）。未设置时启动器直接退出；同机 `--role all` 由 `docker-compose.app.shared.yml` 注入内网地址。
- **`APP_BASE_URL` 可留空。** 局域网 IP 不固定时留空，应用按请求 `Host` 判断同源；只有在需要固定访问地址时才填。
- **宿主标识准备一次**（`docker-compose.app.yml` 里的两个 `/host/...` 挂载靠它生效）：

```bash
sudo mkdir -p /host/etc /host/sys/class/dmi
sudo ln -sfn /etc/machine-id /host/etc/machine-id
sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
```

  没准备不会启动失败，只是实例指纹退到 `data/` 下的兜底 ID（功能正常，但失去「宿主信号绑定」这层）。

## 4. 授权身份：跨机器最硬的一条

- 安装实例指纹由**宿主机机器标识 + 主板 DMI** 派生（`backend/src/license/hardware.py`），商店侧是 **1 授权 : 1 绑定**。
- 换服务器 = 换指纹：
  - 激活会被拒：`409 该授权已绑定其他设备，请先在账号中心解除绑定`；
  - 已经在跑的心跳会被判为**已吊销**（`403 {revoked: true}`），客户端只认结构化 `code`，会**清空本地授权**。
- **拷贝 `data/` 没用。** `data/hardware-fallback-id` 里带宿主封印，换机器时封印比对失败会主动轮换秘密，指纹必然改变——这是刻意设计的防克隆。
- 想平滑迁移，就在两台机器上**钉住同一组身份**：把 `.env` 的 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` 填成旧机器那一组值（取值方式见 `.env.example`）。做不到就按「商店后台解绑 → 在新机器上重新激活」准备，并选在维护窗口做。
  - 解绑之后**可以立即重新激活**（同机换机都行），不需要等冷却：`STORE_DEVICE_RELEASE_COOLDOWN_SECONDS` 约束的是**两次解绑之间**的间隔（默认 8 小时），用来给「反复换机」减速，不是激活的前置条件。所以维护窗口要留的时间是「后台解绑 + 新机激活」，不是「解绑 + 等 8 小时」。
- `docker-compose.app.yml` 固定了 `hostname` 并挂了 `/host/...`；改这些或换机器会改变指纹，需解绑后重新激活。

## 5. 反向代理：内网 HTTPS 已内置在镜像里

**不需要任何额外操作**：主应用与商店的镜像各自内置了 Caddy 反代，与应用同容器、同镜像 tag，
容器一启动就有 HTTPS。

| 拓扑 | 主应用 | 商店 |
| --- | --- | --- |
| 分拆（厂商机跑 store、客户机跑 app） | `https://<客户机IP>:8803` | `https://<厂商机IP>:8804` |
| 同机（`--role all`） | `https://<本机IP>:8803` | `https://<本机IP>:8804` |

> 这一节讲的是**内网自签 HTTPS**（浏览器手动放行即可）。要是客户机跨公网连中心商店，
> 自签会被客户机里的主应用拒绝，改用 [PUBLIC-ACCESS.md](PUBLIC-ACCESS.md) 的域名 + 真实
> 证书方案。

镜像内反代的原理：

- Caddy 用**内置 CA**；裸站点 + `tls internal { on_demand }`，按连入地址**动态签发自签证书**。任意局域网 IP / 主机名都能直接访问，不用准备证书（浏览器用 IP 访问时 SNI 为空也能匹配）。
- 两条站点各自只反代**同容器回环**：主应用 `:8803 → 127.0.0.1:8801`，商店 `:8804 → 127.0.0.1:8802`。反代与应用同容器，因此不要求先把应用端口发布到宿主机。
- 浏览器首次访问会提示自签证书不受信任，手动放行即可（`skip_install_trust`）。
- **HTTP 备用不经反代**：直接访问服务自己发布的 `8801` / `8802`。
- WebSocket 与媒体（`/api/v1/ws/runtime`、`/api/hls/`、`/api/camera_proxy/`）由 Caddy v2 `reverse_proxy` 默认转发。
- 自签证书落在各自的数据卷（容器内 `/data/caddy`）：容器重建不丢，`docker compose down -v` 才会丢。
- 想换成镜像外自建的 Caddy / Nginx：参考 `ops/deploy/Caddyfile.intranet.example`（那里列了反代在镜像外时必须补的信任配置）。

镜像内的配置（`ops/caddy/app.Caddyfile` / `ops/caddy/store.Caddyfile`）在构建时复制到 `/etc/caddy/Caddyfile`：

```
{
	skip_install_trust
	admin off
	auto_https disable_redirects
	log { level ERROR; format console }
	servers :8803 { protocols h1 h2 }   # 商店镜像是 :8804
}

:8803 {
	tls internal { on_demand }
	reverse_proxy 127.0.0.1:8801 {      # 商店镜像是 127.0.0.1:8802
		header_up Host {host}
		header_up X-Real-IP {remote_host}
	}
}
```

- **双协议登录**：`APP_COOKIE_SECURE` 与 `STORE_COOKIE_SECURE` 是布尔，没有 `auto`。要让 HTTPS 与 HTTP 都能登录，设为 `false`；只走 HTTPS 就设 `true`。
- **商店反代端口固定是 8804**（不再随角色变化）：分拆部署时厂商机的 8804 与客户机的 8803 本来就不冲突。
- **宿主发布端口**在 `.env` 里改：`APP_PUBLISH_PORT` / `APP_PROXY_PUBLISH_PORT` / `STORE_PUBLISH_PORT` / `STORE_PROXY_PUBLISH_PORT`；容器内监听端口固定（8801/8803、8802/8804），只有宿主机映射会变。

## 6. 可信代理与限流

- 反代在**同容器回环**上，所以两个可信代理列表都收敛到回环：`APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES=127.0.0.1,::1`（compose 的默认值，`.env` 不写就是它），`UVICORN_FORWARDED_ALLOW_IPS` 同样保持 `127.0.0.1,::1`。
- **不要**改成 `*`：那等于把来源 IP 交给客户端自己填，登录限流、配对码枚举预算与审计一起失效。
- **不要**把 `172.16.0.0/12` 之类的 docker 网段填进来：反代在容器回环上，这个值会让 uvicorn 连回环都不信，所有请求的来源退化成同一个 `127.0.0.1`，限流桶合并、审计里的 IP 失真。
- 留空**也能跑**（uvicorn 的 proxy-headers 会先把对端改写成真实客户端），但 `APP_TRUSTED_PROXIES` 为空时启动与首个带转发头的请求都会各记一条「未配置可信代理」告警，且应用层不会自己解析转发链 —— 所以别留空。
- 只有把反代放到**镜像之外**（自建 Caddy / Nginx，见 `Caddyfile.intranet.example`）时，才需要把它改成那一层代理的地址或网段。
- 限流按**解析后的来源 IP**统计：
  - `/v2/activate` 固定 60 / 小时；
  - `/v2/heartbeat`、`/v2/recover` 用 `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT`（默认 3600 / 小时）。

  多台主应用共用一个 NAT 出口，或所有流量都挤在反代后面时，这些额度是叠加的，日志里出现一片 429 就把该值调大。

## 7. 备份与升级

卷名带 compose 项目名前缀，跨机器时按机器各备各的：

| 卷 | 归属 |
| --- | --- |
| `homeos-3d_homeos-3d-data` | 客户机主应用数据（含自动取回的公钥缓存 `/data/client-keys`） |
| `homeos-3d_homeos-3d-secrets` | 客户机 HA / 配对 / 授权凭据密钥 |
| `homeos-3d-store_homeos-3d-store-data` | 中心商店数据库与商品图 |
| `homeos-3d-store_homeos-3d-license-keys` | 中心商店授权私钥（最关键，单独备） |
| `homeos-3d-client-keys` | 共享公钥卷（同机 `--role all` 用；分拆部署不依赖它） |

升级照旧是拉新镜像 + `up -d`，**先中心商店、后客户机**（完整清单、通知模板与回滚见
[UPGRADE.md](UPGRADE.md)）：

```bash
# 中心商店（厂商机）
docker compose -f docker-compose.store.yml pull && docker compose -f docker-compose.store.yml up -d
# 客户机（每台各一次）
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

> 用 `ops/deploy/upgrade.sh --role store|app --version <tag>` 更稳：它会钉住版本，
> 并在商店是公网接入（`.env` 里有 `STORE_DOMAIN`）时自动带上
> `docker-compose.store.public.yml`——上面那条裸命令漏掉叠加文件会让商店退回内网设置。

客户机端的 `start_app` 会自己向中心商店取回公钥（本地已有缓存时也能离线启动），中心商店稍慢一点启动不会导致客户机失败。
