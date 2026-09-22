# 主应用与授权商店分两台服务器部署

本仓库把两个容器拆成了两个独立的 compose 项目：

| 文件 | 项目名 | 服务 |
| --- | --- | --- |
| `docker-compose.store.yml` | `homeos-3d-store` | 授权商店 18082（**先起**，它创建共享网络与公钥卷） |
| `docker-compose.app.yml` | `homeos-3d` | 主应用 18081（加入同一网络、只读挂载公钥卷） |

同机部署按各自文件里的注释依次 `up -d` 即可；**跨服务器**时下面这些前提不会自动满足，需要人工处理。

```
[服务器 A]  homeos-3d        :18081  ←  反代 https://homeos.example.com
[服务器 B]  homeos-3d-store  :18082  ←  反代 https://pay.example.com
A → B：APP_LICENSE_SERVER_URL（HTTPS，走公网）
```

## 0. 两台机器共同的前提

- **同一份提交。** 两份镜像独立构建，授权协议里的 `keyId`（由公钥字节派生）、`generation`、`clientVersion` 都是运行期才校验的，版本漂移不会在构建期报错。两边都用同一个 tag，并核对镜像里的 `VERSION`。
- **架构要各自匹配。** 镜像里的 Python 已被 Cython 编译成 `.so`，是 per-arch 产物，amd64 / arm64 不能互相搬镜像。
- **时钟同步。** 租约、会话、令牌全部按时间判定；两台机器时钟偏移大了会表现为「刚发的租约已过期」。
- 构建只需 `Dockerfile`（`--target app` / `--target store`）或直接用 GHCR 镜像；**不需要**在两台机器上各自跑 compose 构建。

## 1. 服务器 B：先起商店

```bash
docker compose -f docker-compose.store.yml up -d
# 首次部署后打开 http://<B>:18082/setup 创建管理员
```

- 授权私钥**只在这台机器上**：镜像不含私钥（`.dockerignore` 排除了 `store/keys/local/`），首次启动生成到卷 `homeos-3d-store_homeos-3d-license-keys`。**这个卷丢了等于所有已激活客户端失效**，单独备份。
- 公钥会被同步到共享卷 `homeos-3d-client-keys`，等着被搬到服务器 A（下一步）。
- 站点配置（邮件 / 支付 / 文案）在 `/admin` 改，不走环境变量。

## 2. 把两个公钥搬到服务器 A

共享卷不出机器，这一步必须手工做：

```bash
# —— 服务器 B：打包
docker run --rm -v homeos-3d-client-keys:/keys -v "$PWD":/out alpine \
  tar -C /keys -czf /out/client-keys.tgz .

# —— 服务器 A：先建出同名卷，再灌进去
docker volume create homeos-3d-client-keys
docker run --rm -v homeos-3d-client-keys:/keys -v "$PWD":/in alpine \
  sh -c 'tar -C /keys -xzf /in/client-keys.tgz && chmod 755 /keys && chmod 644 /keys/*.pem'
docker run --rm -v homeos-3d-client-keys:/keys alpine ls -l /keys
```

- 两个文件缺一不可：`license-public.pem`（Ed25519，验签租约）、`license-transport-public.pem`（X25519，加密请求体）。
- **权限是最常见的坑。** 容器里跑的是 uid 1000（`homeos`），而 `scp` / `docker cp` 常见结果是 `root:600`。旧版启动器只检查「存在且非空」，会让你等满 120 秒再报一条指错方向的超时；现在会直接退出并说明原因。
- **密钥轮换**：商店侧的 `license-*.previous.pem` 是旧客户端的宽限窗口，轮换期间要一起搬，漏搬会让旧客户端验签失败。

## 3. 服务器 A：再起主应用

```bash
docker network create homeos-3d-net   # 文件里是 external: true，不会自动创建
docker volume create homeos-3d-client-keys

# .env 至少要有这几项（其余见 .env.example 的 A 区）：
#   APP_LICENSE_SERVER_URL=https://pay.example.com
#   APP_BASE_URL=https://homeos.example.com
#   APP_COOKIE_SECURE=true
#   APP_TRUSTED_PROXIES=<反代地址或网段>
#   UVICORN_FORWARDED_ALLOW_IPS=<反代地址或网段>   # 不要填 *

docker compose -f docker-compose.app.yml up -d
docker logs homeos-3d | head     # 取首次设置引导密钥（容器内 /data/setup-token）
```

- **`APP_LICENSE_SERVER_URL` 不设是静默故障。** 镜像 ENV 默认写死了 `http://homeos-3d-store:18082`，跨机器解析不了；因为离线租约默认 72h，表现是「启动只有一条 CONNECTION_WARNING，三天后才拦截」。
- **宿主标识准备一次**（`docker-compose.app.yml` 里的两个 `/host/...` 挂载靠它生效）：

```bash
sudo mkdir -p /host/etc /host/sys/class/dmi
sudo ln -sfn /etc/machine-id /host/etc/machine-id
sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
```

  没准备不会启动失败，只是实例指纹退到 `data/` 下的兜底 ID（功能正常，但失去「宿主信号绑定」这层）。

## 4. 授权身份：跨机器最硬的一条

- 安装实例指纹由**宿主机机器标识 + 主板 DMI** 派生（`backend/license/hardware.py`），商店侧是 **1 授权 : 1 绑定**。
- 换服务器 = 换指纹：
  - 激活会被拒：`409 该授权已绑定其他设备，请先在账号中心解除绑定`（解绑还有冷却）；
  - 已经在跑的心跳会被判为**已吊销**（`403 {revoked: true}`），客户端只认结构化 `code`，会**清空本地授权**。
- **拷贝 `data/` 没用。** `data/hardware-fallback-id` 里带宿主封印，换机器时封印比对失败会主动轮换秘密，指纹必然改变——这是刻意设计的防克隆。
- 想平滑迁移，就在两台机器上**钉住同一组身份**：把 `.env` 的 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` 填成旧机器那一组值（取值方式见 `.env.example`）。做不到就按「商店后台解绑 → 等冷却 → 重新激活」准备，并选在维护窗口做。
- 反向注意：`docker-compose.app.yml` 固定了 `hostname` 并挂了 `/host/...`，**已在运行的旧部署**升级到这份文件时指纹可能变一次，同样需要重新激活。

## 5. 反向代理：两台各一份

原来的 `Caddyfile.example` / `nginx.conf.example` 是**同机**拓扑（两个域名、upstream 都是 `127.0.0.1`），跨机器要拆开。

### 服务器 B（商店，nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name pay.example.com;

    ssl_certificate     /etc/ssl/certs/pay.example.com.fullchain.pem;
    ssl_certificate_key /etc/ssl/private/pay.example.com.key;

    client_max_body_size 16m;

    location / {
        proxy_pass http://127.0.0.1:18082;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 服务器 A（主应用，nginx）

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name homeos.example.com;

    ssl_certificate     /etc/ssl/certs/homeos.example.com.fullchain.pem;
    ssl_certificate_key /etc/ssl/private/homeos.example.com.key;

    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        # 运行态 WebSocket 与 HLS / 摄像头转发的长连接
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
}
```

### 服务器 B（商店，Caddy）

```
pay.example.com {
	encode gzip
	reverse_proxy 127.0.0.1:18082 {
		header_up Host {host}
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-For {remote_host}
	}
}
```

### 服务器 A（主应用，Caddy）

```
homeos.example.com {
	encode gzip
	reverse_proxy 127.0.0.1:18081 {
		header_up Host {host}
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-For {remote_host}
		transport http {
			read_buffer 64kb
		}
	}
}
```

主应用侧要转发的路径：WebSocket `/api/v1/ws/runtime`，媒体 `/api/hls/`、`/api/camera_proxy/`（上面用 `location /` 一并覆盖）。

## 6. 可信代理与限流

- 两台机器各自配自己的反代网段：主应用 `APP_TRUSTED_PROXIES` + `UVICORN_FORWARDED_ALLOW_IPS`，商店 `STORE_TRUSTED_PROXIES`。**都不要填 `*`**：那等于把来源 IP 交给客户端自己填，登录限流、配对码枚举预算与审计一起失效。
- 商店侧不配 `STORE_TRUSTED_PROXIES` 的后果更隐蔽：`resolve_client_ip` 会忽略 `X-Forwarded-For`，所有请求的来源被算成反代自己的地址，限流桶合并、审计里的 IP 失真。
- 限流按**解析后的来源 IP**统计：
  - `/v2/activate` 固定 60 / 小时；
  - `/v2/heartbeat`、`/v2/recover` 用 `STORE_LICENSE_SESSION_IP_HOURLY_LIMIT`（默认 3600 / 小时）。

  多台主应用共用一个 NAT 出口，或所有流量都挤在反代后面时，这些额度是叠加的，日志里出现一片 429 就把该值调大。

## 7. 备份与升级

卷名带 compose 项目名前缀，跨机器时按机器各备各的：

| 卷 | 归属 |
| --- | --- |
| `homeos-3d_homeos-3d-data` | 服务器 A 主应用数据（含 `data/`） |
| `homeos-3d_homeos-3d-secrets` | 服务器 A HA / 配对 / 授权凭据密钥 |
| `homeos-3d-store_homeos-3d-store-data` | 服务器 B 商店数据库与商品图 |
| `homeos-3d-store_homeos-3d-license-keys` | 服务器 B 授权私钥（最关键，单独备） |
| `homeos-3d-client-keys` | 共享公钥（固定名） |

升级照旧是拉新镜像 + `up -d`，**先 B 后 A**：

```bash
# B
docker compose -f docker-compose.store.yml pull && docker compose -f docker-compose.store.yml up -d
# A
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

A 端的 `start_app` 会等公钥就绪，B 稍慢一点启动不会导致 A 失败。
