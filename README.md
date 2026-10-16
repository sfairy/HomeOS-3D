# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控：3D 户型展示与编辑、
设备触控、安防、能源管理与语音交互。版本号见仓库根 `package.json` 的 `version`。

仓库里是两个**相互独立**的项目：

| 项目 | 是什么 | 部署在哪里 |
| --- | --- | --- |
| `homeos`（主应用） | 仪表盘 / 中控，装在**客户家里** | 每个客户一台 |
| `homeos-store`（授权商店） | 商店前台 + 运营后台 + 授权签发 | **厂商侧唯一一台**（中心商店） |

两个项目互不 import 后端包，可分别构建与部署。构建产物统一收敛到工作区根 `dist/`，与源码树
彻底分开；前端依赖只在工作区根装一份（根 `bun.lock` 是唯一依赖来源，项目目录内没有 `node_modules`）。

生产形态是**商店 + 多台客户机**（商店只跑一处，可以就跑在你自己那台）：

```text
      ┌──────── 管理员 / 厂商（唯一一台商店）────────┐
       │  homeos-store  :8802 / :8804                │
       │  homeos        :8801 / :8803（同一份 compose）│
      └──────────────────┬──────────────────────────┘
   /v2/keys ⟵────────────┼────────────⟶ /v2/activate · /v2/heartbeat
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
 客户机 homeos      客户机 homeos      客户机 homeos
 :8801 / :8803      :8801 / :8803      :8801 / :8803
```

客户机上装的是同一个镜像，各自通过 `APP_LICENSE_SERVER_URL` 指向商店。授权公钥**无需人工
投放**：主应用启动时向商店 `GET /v2/keys` 取回并缓存到自己的数据卷，之后商店暂时不可达也能离线启动。

| 服务 | 容器名 | HTTP | 内置 HTTPS（自签） | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803 | `/register` 注册本机账号（首装零用户，任意地址都会跳这里） |
| 授权商店 | `homeos-store` | 8802 | 8804 | `/setup` 建运营管理员，`/admin` 运营后台 |

> 运行期的容器名 / 镜像名 / **数据卷名**里的 `homeos` 是刻意保留的：改了就等于换一套卷，
> 存量部署的数据会看起来「丢了」，而且容器 hostname 参与授权实例指纹。所以运行期身份一律不动；
> 从更早的多文件编排迁过来时商店侧卷名会从 `homeos-store_*` 变成 `homeos_*`，需要保留数据就先
> 把旧卷内容拷进新卷再启动（主应用侧卷名不变）。

目录（只列需要认识的）：

```text
HomeOS/
├── homeos/                    # 主应用：backend/（FastAPI，包名 src）+ frontend/（含 studio 3D 编辑器）
├── homeos-store/              # 授权商店：backend/ + frontend/
├── packages/shared/           # @homeos/shared 前端共享契约包（两个前端共用源码）
├── packages/shared-py/        # homeos_shared Python 共享包（两个后端共用，构建期各自内联进 .so）
├── ops/                       # dev.mjs 本地联调、build.py 构建、BUILD.md、deploy/（公网接入文档）、docker/ 容器构建辅助
├── dist/                      # 构建产物（不入库；镜像只消费它）
├── docker-compose.yml         # 管理员这台：商店 + 主应用（NAS / 单机一键）
├── docker-compose.app.yml     # 客户机：只有主应用（填一处商店地址）
├── Dockerfile                 # 双目标运行镜像：--target app / --target store
└── package.json / bun.lock    # 版本号唯一来源 + 全仓唯一的依赖锁
```

---

## 本地开发

需要 **Bun 1.1+** 与 **Python 3.12+**。

```bash
bun install
bun run dev            # 后端热重载 + Vite HMR
bun run dev -- --lan   # 同网段平板 / 墙面板访问（绑 0.0.0.0，终端会打印局域网地址）
```

| 地址 | 用途 |
| --- | --- |
| http://127.0.0.1:8805/ | 主应用前端 HMR（改页面走这里） |
| http://127.0.0.1:8806/ | 商店前端 HMR |
| http://127.0.0.1:8801/register | 主应用 API / 首次注册本机唯一账号 |
| http://127.0.0.1:8802/setup | 商店 API / 首次建运营管理员 |

`bun run dev` 只绑 `127.0.0.1`，缺前端产物时会自动跑一次不混淆的 Vite 构建，本地验证码默认
打印在启动终端（`STORE_MAIL_MODE=log`）。**它不是部署脚本**。

常用脚本：

| 脚本 | 作用 |
| --- | --- |
| `bun run dev:backend` | 只起两个后端的热重载（不起前端） |
| `bun run dev:app` / `dev:store` | 只起主应用 / 商店前端的 Vite HMR（不动后端，各开一个终端） |
| `bun run dev:prepare` | 只装 Python 环境（仓库根共享 venv `.venv-store`），不起服务 |
| `bun run dev:runtime` | watch 3D runtime 模块 → 根 `dist/homeos/frontend/modules/runtime` |
| `bun run build` | 完整构建：前端（Vite + 混淆）+ 后端（Cython `.so`）→ 根 `dist/` |
| `bun run build:app` / `build:store` | 只构建一侧前端（含混淆） |
| `bun run image:app` / `image:store` | 从根 `dist/` 组装运行镜像 |
| `bun run typecheck` | 两个前端的 `vue-tsc`。Python 侧**没有**类型检查命令（历史入口已拆），CI 只跑 `ruff`；Pylance / 手动 `basedpyright` 读仓库根 `pyrightconfig.json` |

改完后端的断点调试：`bun run dev -- --debug` 后在编辑器 attach（主应用 `8811`、商店 `8812`）；
热重载不会被关掉，重载出的新进程照样命中。端口占用时脚本直接退出，`pkill -f ops/dev.mjs` 后重试。

首次联调：主应用 `/register` 注册本机账号（验证码由商店代发代验）→ 商店 `/setup` 建管理员并在
`/admin` 配好 SMTP 与支付 → 主应用登录后未激活会跳 `/activate`，用商店激活码绑定 → 编辑器配 HA，
3D 先在 `/3d-studio` 保存户型。

---

## 部署

两份 **compose 文件**，值都写死在文件里：不需要 `.env`、不需要装 Bun/Python、不需要跑脚本，
也**不需要把整份仓库复制到目标机**（只有一份除外：公网接入时商店那台还要带上
`ops/deploy/Caddyfile.public.example`）。

| 文件 | 起什么 | 给谁 |
| --- | --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | 授权商店 + 主应用 | **开发者 / 管理员**自己这台：整个产品唯一一处商店就在这里，你的面板也一起起 |
| [`docker-compose.app.yml`](docker-compose.app.yml) | 只有主应用 | **客户**：每台一份，填一处商店地址即可 |

两份的项目名都是 `homeos`，服务名与卷名也一致 —— 客户机将来想换回管理员那份也不会换错数据。
公网接入（真实域名 + 可信证书 HTTPS）不是第三个文件，而是 `docker-compose.yml` 里一段
**取消注释即用**的配置，见 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。

### 前置条件

- 目标机装好 **Docker Engine + Compose v2**（文件用了顶层 `name:`，需要 ≥ 2.3.3）。
- 能拉 GHCR：包若是私有的，先 `docker login ghcr.io`（PAT 需 `read:packages`）。
- 所有机器**时钟同步**；建议各机器用**同一个镜像 tag**（便于排障；授权协议不校验版本）。
- 架构：后端编译成 per-arch `.so`，amd64 / arm64 镜像不通用；GHCR 两种都有，`docker pull` 自动选。

### 第 1 步：管理员这台（唯一一台，先跑）

```bash
# 把 docker-compose.yml 放到这台机器上（能 clone 仓库就直接用仓库根这份）
docker compose up -d

# 未初始化时，启动日志里有引导密钥；用它打开 /setup 建运营管理员
docker logs homeos-store | grep -A4 '引导密钥'
```

**不用改任何东西**，直接 `up -d`：商店地址已经写死成容器内网服务名 `homeos-store`（同一份
compose 里就是它）；登录页「忘记密码 / 商店」跳转用的地址由主应用自己向商店问回来 ——
商店答的是容器服务名，浏览器解析不了，于是主应用把主机名换成你正在用的那个（局域网 IP /
域名），端口沿用商店的回答。所以这台机器换 IP、换域名都不必动文件。真推导错了
（例如把商店的宿主端口改成了 `18802`），再取消注释 `APP_STORE_URL` 显式写死。
两条容易踩的：

- **先建 `/host` 符号链接**（文件头 ① 有命令），必须在第一次 `up -d` **之前** —— 否则 Docker 会把
  路径建成目录，之后再也 `ln` 不上去，授权指纹会退化成可拷贝的兜底 ID；
- 浏览器入口别写 `https://…:8804`：那是商店内置反代的自签证书。

然后浏览器 `http://<本机IP>:8802/setup`（HTTPS 备用 `https://<本机IP>:8804/setup`）。
建完管理员后**注册一个客户账号**并给它发激活码（`/admin/licenses`，页面名「激活码」）：

- 验证码默认写日志（`STORE_MAIL_MODE: log`）：`docker logs homeos-store | grep 验证码`；
  正式对外请在 `/admin` 配好 SMTP（或写 `STORE_SMTP_*` 环境变量）。
- 发码要求邮箱**已有商店账号**，否则报「该邮箱尚未注册账号」。

### 第 2 步：客户机 —— 起主应用（每台一次）

```bash
docker compose -f docker-compose.app.yml up -d
```

**跑之前只改一处**：文件里标了 `←` 的商店地址，换成第 1 步那台机器的 IP 或域名；
`/host` 符号链接同样必须先建好。商店的**浏览器入口地址不必填**：主应用会向商店问回来，
并在拿到浏览器解析不了的主机名时换成你自己访问主应用用的那个地址。

跑完浏览器 `http://<客户机IP>:8801/register` 注册本机唯一账号（验证码由商店代发，所以这台
必须能出站访问商店的 8802），登录后未激活会跳 `/activate`，填第 1 步发出去的激活码即完成绑定。

> 跨公网接入时用**真实证书域名**，不要拿商店的 `https://<厂商机IP>:8804` 当授权地址，见
> [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。

### 公网接入（商店跨公网 / 要收款）

需要一个域名指向商店公网 IP、公网放行 80/443，然后按原样把 `docker-compose.yml` 里的
「可选：公网接入」**整段取消注释**并填域名，同时把那台机器上商店的
`STORE_BASE_URL` / `STORE_COOKIE_SECURE` / 可信代理改成公网口径（文件里都标好了）：

```bash
docker compose -f docker-compose.yml up -d
```

那段会多起一个 `caddy-public` 容器，按域名自动申请并续期公共 CA 证书，再反代到商店；客户机
的 `docker-compose.app.yml` 里改那行地址为域名即可。完整前提、验证与排错见
[PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。


### 内网 HTTPS 与端口

内网 HTTPS 开箱即用：反代（Caddy）内置在镜像里、与应用同容器，按连入地址动态签发**自签**证书，
浏览器首次访问手动放行即可 —— 不需要另备反代容器或证书。HTTP 的 8801 / 8802 不经反代，可直接备用。

端口冲突就改 compose 文件里 `ports:` 的**左侧**（容器内端口不变）：
8801 / 8803 是主应用，8802 / 8804 是商店。要固定对外访问地址时，`APP_BASE_URL` /
`STORE_BASE_URL` 可以直接写在 compose 的 `environment:` 里（默认按请求推导，IP 不固定就别写）。

`APP_TRUSTED_PROXIES` / `UVICORN_FORWARDED_ALLOW_IPS` 保持回环值，**不要**填 `*` 或 docker 网段
（公网接入段是例外：那时反代在容器之外，必须放宽到 docker 网段，那段注释里已写好）。
商店的邮件 SMTP、支付渠道、站点文案登录 `/admin` 后台改（免重启），未配真实凭据时下单会返回
503（刻意 fail-closed）。

### 升级与回滚

**先商店、后客户机**，建议两头用同一个 tag。改 compose 里的镜像 tag（或就用 `:latest`）后：

```bash
# ① 管理员这台
docker compose pull && docker compose up -d

# ② 每台客户机
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

只想重启容器不会换镜像；**永远不要执行 `docker compose down -v`** —— 那会连数据一起删。
回滚＝把 tag 换成上一个版本重跑。

### 备份数据卷

卷名带 compose 项目名前缀 `homeos_`（两份文件的项目名都是 `homeos`，所以卷名一致；客户机上
只有后两个）：

| 卷 | 归属 |
| --- | --- |
| `homeos_homeos-license-keys` | **商店授权私钥，最关键，单独备份**（丢了所有已激活客户机失效） |
| `homeos_homeos-store-data` | 商店库、订单、审计、商品资源 |
| `homeos_homeos-client-keys` | 公钥镜像（商店写；丢了主应用会重新取回） |
| `homeos_homeos-data` | 主应用数据（含自动取回的公钥缓存与 backups） |
| `homeos_homeos-secrets` | 主应用 HA / 授权凭据签名密钥 |
| `homeos_caddy-public-data` | 公网接入的 TLS 证书与 ACME 账号（仅启用公网段时存在） |

```bash
mkdir -p backup
docker run --rm -v homeos_homeos-data:/data -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/homeos-data.tgz .
```

授权私钥卷丢了等于所有已激活客户端失效；公钥丢了不用慌，主应用下次启动会自己取回。

### 出问题

| 现象 | 处理 |
| --- | --- |
| `pull` 报 `unauthorized` / `denied` | GHCR 包是私有的：先 `docker login ghcr.io`（PAT 需 `read:packages`） |
| `manifest unknown` / `not found` | 该 tag 还没构建：到 GitHub Actions 手动 Run workflow，或改用 `:latest` |
| `no matching manifest` | 宿主架构缺镜像层：确认宿主是 amd64 / arm64 |
| 主应用启动即退出、提示取回授权公钥超时 | 连不上 `APP_LICENSE_SERVER_URL`：确认商店已起、客户机能访问该地址与端口 |
| 客户机连不上，地址写的是 `https://…:8804` | 那是商店内置反代的自签证书：改用 `http://<商店>:8802`，或上真实证书域名 |
| 激活报「租约使用了不受信任的授权公钥」 | 数据卷是别台机器搬来的：删掉主应用数据卷里的 `client-keys` 后重启即会重新取回 |
| 已激活的客户端被判「换设备」 | `/host` 挂载或主机名变了导致实例指纹改变：商店后台解绑后重新激活，或钉住 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` |
| 商店起来了但注册收不到验证码邮件 | 默认 `STORE_MAIL_MODE: log`：验证码在 `docker logs homeos-store \| grep 验证码`；正式对外配 SMTP |

健康检查：`curl -fsS http://127.0.0.1:8801/health/ready`（主应用）、
`curl -fsS http://127.0.0.1:8802/healthz`（商店）；容器与日志用 `docker compose ps` / `docker logs homeos`。

### 可选：自己构建镜像

不走 GHCR、要自己出镜像时：

```bash
bun install
bun run build:frontend                    # 前端 → 根 dist/
python3 ops/build.py backend              # 后端 Cython .so → 根 dist/
python3 ops/build.py image --project app   --tag homeos:local
python3 ops/build.py image --project store --tag homeos-store:local
```

然后把 compose 文件里的 `image:` 换成这两个本地 tag 即可（不需要改别的地方）。

细节（为什么产物里没有明文 `.py`、架构绑定、基础镜像钉版真源、拉不动 Docker Hub 时换镜像站）
见 [ops/BUILD.md](ops/BUILD.md)。

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docker-compose.yml](docker-compose.yml) | 管理员这台：商店 + 主应用（含公网接入段） |
| [docker-compose.app.yml](docker-compose.app.yml) | 客户机：只有主应用，填一处商店地址即可 |
| [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) | 商店公网接入（域名 + 真实证书 HTTPS、支付回调） |
| [ops/BUILD.md](ops/BUILD.md) | 镜像构建细节（Cython 产物、基础镜像钉版、镜像站） |
| [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md) | 商店 / 授权服务器细节 |
| `.env.example` | 全部环境变量（按 A–G 分区注释；compose 文件已写死常用值） |

CI：`.github/workflows/checks.yml`（typecheck / eslint / ruff / 前端构建 / 基建 lint）在 `push(main)`
与全部 PR 上自动跑；镜像构建与推送（`.github/workflows/docker.yml`）保持手动 `workflow_dispatch`。
