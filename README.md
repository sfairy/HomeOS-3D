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

生产形态是**中心商店 + 多台客户机**：

```text
      ┌──────────── 厂商机（唯一）────────────┐
      │  homeos-store  :8802 / :8804       │
      └──────────────────┬────────────────────┘
   /v2/keys ⟵────────────┼────────────⟶ /v2/activate · /v2/heartbeat
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
 客户机 homeos      客户机 homeos      客户机 homeos
 :8801 / :8803      :8801 / :8803      :8801 / :8803
```

客户机上装的是同一个镜像，各自通过 `APP_LICENSE_SERVER_URL` 指向中心商店。授权公钥**无需人工
投放**：主应用启动时向商店 `GET /v2/keys` 取回并缓存到自己的数据卷，之后商店暂时不可达也能离线启动。

| 服务 | 容器名 | HTTP | 内置 HTTPS（自签） | 入口 |
| --- | --- | --- | --- | --- |
| 主应用 | `homeos` | 8801 | 8803 | `/register` 注册本机账号（首装零用户，任意地址都会跳这里） |
| 授权商店 | `homeos-store` | 8802 | 8804 | `/setup` 建运营管理员，`/admin` 运营后台 |

> 运行期的容器名 / 镜像名 / **数据卷名**里的 `homeos` 是刻意保留的：改了就等于换一套卷，
> 存量部署的数据会看起来「丢了」，而且容器 hostname 参与授权实例指纹。所以运行期身份一律不动，
> 迁移旧卷见 [ops/deploy/UPGRADE.md](ops/deploy/UPGRADE.md)。

目录（只列需要认识的）：

```text
HomeOS/
├── homeos/                    # 主应用：backend/（FastAPI，包名 src）+ frontend/（含 studio 3D 编辑器）
├── homeos-store/              # 授权商店：backend/ + frontend/
├── packages/shared/           # @homeos/shared 前端共享契约包（两个前端共用源码）
├── packages/shared-py/        # homeos_shared Python 共享包（两个后端共用，构建期各自内联进 .so）
├── ops/                       # dev.mjs 本地联调、build.py 构建、deploy/ 部署与文档、docker/ 容器构建辅助
├── dist/                      # 构建产物（不入库；镜像只消费它）
├── docker-compose.app.yml     # 主应用编排（可单独部署）
├── docker-compose.store.yml   # 商店编排
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

## 部署（生产）

生产方式走 **GHCR 镜像 + `ops/deploy/deploy.sh` 一键部署**，全部在 Docker 里跑。下面八步是完整流程，
厂商机走 1–3、5–8，每台客户机走 1–2、4–8。

### 1. 前置条件

- 部署机装好 **Docker Engine + Compose v2**（compose 文件用了 `name:` 字段，需要 ≥ 2.3.3）；
  `deploy.sh` 启动前会自检 docker、compose v2 与守护进程。
- 能拉 GHCR：包若为私有，先 `docker login ghcr.io`（PAT 需 `read:packages`）。
- **架构匹配**：后端已被 Cython 编译成 per-arch 的 `.so`，amd64 / arm64 镜像不能互搬；GHCR 两种
  架构都发布，`docker pull` 自动选。
- 所有机器**时钟同步**（租约、会话、令牌都按时间判定），并使用**同一个镜像 tag**。
- 在仓库根执行（`deploy.sh` 需要与 `docker-compose.app.yml` 同目录），或 `--dir` 指定目录。

### 2. 准备环境变量

```bash
cp .env.example .env
```

`.env` 默认全部注释掉，复制不改也能启动，生产按角色确认这几项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_LICENSE_SERVER_URL` | 空 | 客户机必填（等价于 `--license-server`，会同时钉住 `APP_STORE_URL`） |
| `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` | `false` | 要让 HTTP(8801/8802) 与 HTTPS(8803/8804) **都能登录**就保持 `false` |
| `APP_TRUSTED_PROXIES` / `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1,::1` | 内置反代在容器回环上，**保持默认**；不要填 `*` 或 docker 网段 |
| `APP_BASE_URL` / `STORE_BASE_URL` | 空 | 局域网 IP 不固定就留空（应用按请求 `Host` 判断同源） |
| `*_PUBLISH_PORT` | 8801/8803/8802/8804 | 宿主发布端口冲突时改这里 |
| `HOMEOS_VERSION` | 仓库 `package.json` 的 `version` | 镜像 tag；`deploy.sh` 会把解析结果写回 `.env` 钉住，避免漂到 `latest` |

**账号不走环境变量、也不预置**：主应用首装零用户，商店管理员在 `/setup` 建。
邮件 / 支付 / 站点文案等商店配置登录 `/admin` 后台改（免重启），全部变量见 `.env.example`。

### 3. 厂商机：起中心商店

```bash
./ops/deploy/deploy.sh --role store
```

脚本会：解析 compose 目录并在缺 `.env` 时从模板生成 → 解析版本 tag 写回 `.env` → `pull` → `up -d`
→ 轮询健康（商店最长 180s）→ 打印访问地址与客户机该执行的命令。之后到 `http://<商店IP>:8802/setup`
建运营管理员。

### 4. 客户机：起主应用

```bash
./ops/deploy/deploy.sh --role app --license-server http://<中心商店>:8802
```

`--license-server` **必填**，写进 `.env` 的 `APP_LICENSE_SERVER_URL` 与 `APP_STORE_URL`。
主应用会先准备好宿主标识符号链接（授权实例指纹读它）、拉镜像、`up -d`、等健康（最长 300s），
并顺手把授权公钥从商店取回缓存。

跨公网接入用真实证书域名，**不要**拿商店的 `https://<中心IP>:8804`（自签，客户机不信任）当授权地址，
见 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)。

两个服务都自带内网 HTTPS（Caddy 按连入地址动态签发**自签**证书，反代与应用同容器）：
主应用 `https://<IP>:8803`、商店 `https://<IP>:8804`，浏览器首次访问手动放行即可，**不需要**
额外准备反代容器或证书。HTTP 的 8801 / 8802 不经反代，可直接备用。

`deploy.sh` 的常用参数：`--role all|store|app`（形态，默认 `all`）、`--license-server URL`
（客户机必填）、`--version TAG`（钉镜像 tag）、`--dir DIR`、`--host-binds auto|force|skip`、
`--dry-run`（只打印命令）、`--yes`（非交互，`sudo` 只用 `sudo -n`）。同机 `--role all` 只用于
开发 / 自测，**不要用于客户交付**。

### 5. 首次初始化

1. **商店**：`http://<商店IP>:8802/setup` 建运营管理员 → 在 `/admin` 配邮件 SMTP、支付渠道
   （未配真实凭据时下单会 503，刻意 fail-closed）。
2. **主应用**：`http://<主机IP>:8801/register`（HTTPS 8803）注册本机唯一账号。首装零用户时任何
   地址都会跳到注册页，账号建好后该入口即关闭。
3. **激活**：注册后自动登录并检测授权，未激活跳 `/activate`，填入商店购买邮箱与激活码绑定本机
   （1 激活码 : 1 设备）。之后配 HA、在 `/3d-studio` 保存户型。

### 6. 确认健康

```bash
curl -fsS http://127.0.0.1:8801/health/ready   # 主应用
curl -fsS http://127.0.0.1:8802/healthz        # 商店
docker compose -f docker-compose.app.yml ps
docker logs homeos | head
```

### 7. 备份数据卷

**勿删 volume**（`docker compose down -v` 会连数据一起删）。卷名带 compose 项目名前缀：

| 卷 | 归属 |
| --- | --- |
| `homeos_homeos-data` | 主应用数据（含自动取回的公钥缓存） |
| `homeos_homeos-secrets` | 主应用 HA / 授权凭据签名密钥 |
| `homeos-store_homeos-store-data` | 商店库与商品资源 |
| `homeos-store_homeos-license-keys` | **授权私钥，最关键，单独备份** |
| `homeos-client-keys` | 公钥卷（仅同机 `--role all` 用） |

```bash
mkdir -p backup
docker run --rm -v homeos_homeos-data:/data -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/homeos-data.tgz .
```

授权私钥卷丢了等于所有已激活客户端失效；公钥丢了不用慌，主应用下次启动会自己取回。

### 8. 升级与回滚

升级＝拉新镜像 + `up -d`，**先中心商店、后客户机**，两头同一个 tag：

```bash
./ops/deploy/upgrade.sh --role store --version 0.7.6   # ① 厂商机
./ops/deploy/upgrade.sh --role app   --version 0.7.6   # ② 每台客户机
```

`upgrade.sh --check` 可先核对本机钉住的版本与容器实际版本。回滚＝把 `--version` 换成上一个版本重跑，
**不要删数据卷**。完整清单与客户通知模板见 [UPGRADE.md](ops/deploy/UPGRADE.md)。

### 客户机精简分发包（可选）

不想在客户机上放整份仓库时，产出只含主应用侧文件的压缩包（不含商店源码与密钥）：

```bash
./ops/deploy/pack-customer.sh     # → build/customer-pack/homeos-app-<版本>.tar.gz
```

客户机解包后 `./install.sh --license-server http://<中心商店>:8802` 即可，详见
[CUSTOMER.md](ops/deploy/CUSTOMER.md)。

### 从源码构建镜像（可选）

不走 GHCR、要自己出镜像时（需要 Bun + Python 3.12+ + Docker）：

```bash
bun install
bun run build:frontend                    # 前端 → 根 dist/
python3 ops/build.py backend              # 后端 Cython .so → 根 dist/
python3 ops/build.py image --project app  --tag homeos:local
HOMEOS_IMAGE=homeos:local ./ops/deploy/deploy.sh
```

细节（为什么产物里没有明文 `.py`、架构绑定、基础镜像钉版真源、拉不动 Docker Hub 时换镜像站）
见 [ops/deploy/BUILD.md](ops/deploy/BUILD.md)。

### 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `pull` 报 `unauthorized` / `denied` | GHCR 包是私有的：先 `docker login ghcr.io`（PAT 需 `read:packages`） |
| `manifest unknown` / `not found` | 该 tag 还没构建：到 GitHub Actions 手动 Run workflow，或改用 `--version latest` |
| `no matching manifest` | 宿主架构缺镜像层：确认宿主是 amd64 / arm64 |
| 主应用启动即退出、提示取回授权公钥超时 | 连不上 `APP_LICENSE_SERVER_URL`：确认商店已起、客户机能访问该地址与端口 |
| 客户机连不上，地址写的是 `https://…:8804` | 那是商店内置反代的自签证书：改用 `http://<商店>:8802`，或上真实证书域名 |
| 激活报「租约使用了不受信任的授权公钥」 | 数据卷是别台机器搬来的：删掉主应用数据卷里的 `client-keys` 后重启即会重新取回 |
| 已激活的客户端被判「换设备」 | `/host` 挂载或主机名变了导致实例指纹改变：商店后台解绑后重新激活，或钉住 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` |
| 只想看脚本会做什么 | `./ops/deploy/deploy.sh --dry-run`（不写文件、不调 docker） |

---

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md) | 生产最小检查清单（逐步勾选） |
| [ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md) | 中心商店 + 多客户机拓扑、授权身份与迁移 |
| [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) | 商店公网接入（域名 + 真实证书 HTTPS、支付回调） |
| [ops/deploy/CUSTOMER.md](ops/deploy/CUSTOMER.md) | 客户机安装指南（随精简发包分发） |
| [ops/deploy/UPGRADE.md](ops/deploy/UPGRADE.md) | 升级 / 回滚清单与客户通知模板 |
| [ops/deploy/BUILD.md](ops/deploy/BUILD.md) | 镜像构建细节（Cython 产物、基础镜像钉版、镜像站） |
| [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md) | 商店 / 授权服务器细节 |
| `.env.example` | 全部环境变量（按 A–G 分区注释） |

CI：`.github/workflows/checks.yml`（typecheck / eslint / ruff / 前端构建 / 基建 lint）在 `push(main)`
与全部 PR 上自动跑；镜像构建与推送（`.github/workflows/docker.yml`）保持手动 `workflow_dispatch`。
