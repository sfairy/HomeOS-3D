# HomeOS 主应用 —— 客户机安装指南

这是 HomeOS 主应用的**精简分发包**（只含主应用侧文件）。授权商店（中心）由厂商维护，
你这里只需要把主应用跑起来，并让它连上厂商给你的**中心商店地址**。

- 厂商给你的两样东西：**中心商店地址**（形如 `http://192.168.1.20:8802` 或
  `https://store.example.com`）和**激活码**。
- 你这里不需要商店的代码，也不需要它的密钥；授权公钥由主应用启动时自动取回。

---

## 0. 前提

| 项 | 要求 |
| --- | --- |
| 系统 | 任意能跑 Docker 的 Linux（含群晖 / 飞牛 / unRAID 等 NAS，走 SSH） |
| 软件 | Docker Engine + Compose v2（`docker compose version` ≥ 2.3.3） |
| 架构 | x86_64 或 arm64 均可；镜像按宿主架构自动选择 |
| 网络 | 本机能访问**中心商店地址与端口**（防火墙 / 端口映射放行） |
| 时钟 | 开启 NTP（租约、令牌都按时间判定，时钟偏差大会激活失败） |
| 磁盘 | 建议 ≥ 10 GB 可用空间；安装目录放在数据盘而非系统盘 |

---

## 1. 安装（一条命令）

把包上传到客户机后：

```bash
tar xzf homeos-app-<版本>.tar.gz
cd homeos-app-<版本>

# 把 http://<中心商店>:8802 换成厂商给你的地址
./install.sh --license-server http://<中心商店>:8802
```

`install.sh` 就是 `ops/deploy/deploy.sh --role app` 的封装，它会：

1. 缺 `.env` 时从 `.env.example` 生成；
2. 把中心商店地址写进 `.env` 的 `APP_LICENSE_SERVER_URL`，并钉住镜像版本
   （`HOMEOS_VERSION` / `HOMEOS_IMAGE`，避免以后升级漂到 `latest`）；
3. 尝试建宿主标识符号链接（授权实例指纹用，见第 4 节）；
4. `docker compose pull` → `up -d`，等主应用 health；
5. 打印注册地址与激活入口。

只看脚本会做什么、不动 Docker：

```bash
./install.sh --license-server http://<中心商店>:8802 --dry-run
```

私有镜像仓库需要先登录（报 `unauthorized` 时）：

```bash
docker login ghcr.io -u <你的用户名>     # 密码填有 read:packages 的 PAT
```

---

## 2. 首次初始化

```bash
# 首装是「零用户」：不需要引导密钥，也没有预置账号。
# 打开任一地址都会自动跳到注册页。
```

浏览器打开：

| 用途 | 地址 |
| --- | --- |
| 主应用注册本机账号（账号 / 密码 / 邮箱 / 邮箱验证码） | `http://<本机IP>:8801/register` |
| 主应用（HTTPS，自签证书需手动放行） | `https://<本机IP>:8803/register` |
| 激活授权 | 注册后自动检测；未激活会跳 `/activate`，填厂商发的激活码 |

> 注册需要邮箱验证码，而验证码由**厂商的中心商店**代发：确认 `APP_LICENSE_SERVER_URL`
> 指向的中心商店可达、且厂商已在商店后台配好 SMTP，否则注册会报「无法发送验证码」。
> 账号建好后注册入口即关闭；`/login` 的账号栏填用户名或注册邮箱都能登录。

> 反代（Caddy）已内置在镜像里、与应用同容器，**无需额外配置**。HTTPS 用的是内置 CA
> 自签证书，浏览器首次访问点「继续访问」即可。

---

## 3. 端口与防火墙

| 端口 | 用途 | 是否需要对外开放 |
| --- | --- | --- |
| `8801` | 主应用 HTTP（直连备用） | 只在局域网内网访问 |
| `8803` | 主应用 HTTPS（内置反代，自签） | 局域网浏览器访问用 |
| 出站到 `8802`/`443` | 访问中心商店（取公钥、激活、心跳） | **必须放行** |

也就是说：**不用**对外开放任何端口给别人；只需要本机能**主动访问中心商店**。

端口冲突时在 `.env` 里改 `APP_PUBLISH_PORT`（默认 8801）/ `APP_PROXY_PUBLISH_PORT`
（默认 8803），容器内端口不变。

---

## 4. 授权指纹（决定「换机」是否要重新激活）

授权是 **1 激活码 : 1 设备**。实例指纹由本机 `machine-id` + 主板 DMI 派生，因此：

- 换服务器、改 `hostname`、改 `/host` 挂载 → 指纹变化 → 需要厂商在后台解绑后重新激活；
- 系统盘重装 / 容器重建**不会**改变指纹（指纹读的是宿主标识，不是容器 ID）；
- 跨机迁移想免解绑，可让厂商给你旧机器的 `APP_HARDWARE_MACHINE_ID` /
  `APP_HARDWARE_BOARD_ID`，填进 `.env` 钉住身份。

安装脚本会尝试建这两个符号链接（失败只打印警告，不影响启动）：

```bash
sudo mkdir -p /host/etc /host/sys/class/dmi
sudo ln -sfn /etc/machine-id /host/etc/machine-id
sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
```

⚠️ 顺序很重要：要在**第一次启动容器之前**建好，否则 Docker 会把不存在的路径建成
**目录**，之后 `ln` 会失败、指纹退化到兜底 ID。已建成目录时：

```bash
sudo rmdir /host/etc/machine-id /host/sys/class/dmi/id
sudo ln -sfn /etc/machine-id /host/etc/machine-id
sudo ln -sfn /sys/class/dmi/id /host/sys/class/dmi/id
```

在 NAS 的 Docker 图形界面里导入 compose 时尤其注意这点——界面不会帮你建符号链接。

---

## 5. 升级

升级＝拉新镜像 + `up -d`，**不会动数据卷**。用包里的 `upgrade.sh` 最省事（它会显式钉住新
版本、并核对版本是否一致）：

```bash
# 先看现状（本机钉住的版本 vs 容器实际版本）
./ops/deploy/upgrade.sh --check

# 升到厂商通知的版本
./ops/deploy/upgrade.sh --role app --version <新版本>
```

也可以直接用安装入口（等价，参数一路透传给 `deploy.sh`）：

```bash
./install.sh --license-server http://<中心商店>:8802 --version <新版本>
```

或裸命令（`.env` 已钉版本，改 `HOMEOS_VERSION` / `HOMEOS_IMAGE` 后）：

```bash
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

> 主应用版本要与中心商店保持一致（授权协议在运行期校验版本）。厂商升级中心后，
> 会通知你升到同一个版本号。

⚠️ **永远不要执行 `docker compose down -v`**，那会连数据卷一起删。

---

## 6. 数据卷与备份

卷名以 compose 项目名开头：

| 卷 | 内容 |
| --- | --- |
| `homeos_homeos-data` | 主应用数据（含自动取回的公钥缓存 `/data/client-keys`） |
| `homeos_homeos-secrets` | HA / 授权凭据签名密钥 |

```bash
mkdir -p backup
docker run --rm -v homeos_homeos-data:/data -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/homeos-data.tgz .
```

公钥缓存丢了不用慌：下次启动会向中心商店重新取回。

---

## 7. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `pull` 报 `unauthorized` / `denied` | 私有镜像：`docker login ghcr.io`（PAT 需 `read:packages`） |
| `manifest unknown` / `not found` | 该版本还没构建：找厂商确认 tag，或先用 `latest` |
| 启动即退出、日志「取回授权公钥超时」 | 本机连不上中心商店：核对地址与端口、防火墙 / 端口映射，确认商店在跑 |
| 日志「无法连接授权服务器…自签证书」 | 用了中心商店的 HTTPS 端口但那是自签证书：换回 `http://<商店>:8802`，或用厂商提供的真实域名 |
| 激活报「该授权已绑定其他设备」 | 指纹变了（换了机器 / 主机名 / `/host` 挂载）：请厂商后台解绑后重新激活 |
| 激活报「租约使用了不受信任的授权公钥」 | 数据卷是从别处搬来的：删掉数据卷里的 `client-keys` 后重启即可重新取回 |
| 端口冲突 | 改 `.env` 的 `APP_PUBLISH_PORT` / `APP_PROXY_PUBLISH_PORT` 后重跑 install.sh |
| 只想看脚本会做什么 | `./install.sh --license-server ... --dry-run` |

---

## 8. 包内文件

```
homeos-app-<版本>/
├── install.sh                    一键安装入口（= deploy.sh --role app）
├── docker-compose.app.yml        主应用编排
├── .env.example                  环境变量模板（install.sh 会复制成 .env）
├── package.json                  版本号来源（deploy.sh 用它解析镜像 tag）
├── MANIFEST.txt                  版本 / 提交 / 各文件 sha256
└── ops/deploy/
    ├── deploy.sh                 部署脚本
    ├── upgrade.sh                升级 / 版本核对（upgrade.sh --check）
    └── CUSTOMER.md               本文件
```

厂商侧还有 `ops/deploy/SPLIT-DEPLOY.md`（中心 / 客户机完整流程）、`PUBLIC-ACCESS.md`
（公网接入）与 `UPGRADE.md`（升级），那些不需要发到客户机。
