# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控，当前版本见仓库根 `package.json` 的 `version`。

两个**相互独立**的项目：主应用 `homeos` 与授权商店 `homeos-store`。各自含前后端源码，互不 import 后端包，可同机或分机部署。两者的构建产物统一收敛到工作区根 `dist/`，与源码树彻底分开。

两个项目互不依赖、可**分别构建与部署**（`bun run build:app` / `build:store`、`python3 ops/build.py --project app|store`、Docker 的 `--target app|store` 都是单侧操作）。前端依赖只在工作区根装一份（见根 `bunfig.toml` 的 hoisted linker）：项目目录内不再有 `node_modules`，也不再有各自的 lockfile，全仓以根 `bun.lock` 为唯一依赖来源。

## 目录

```text
HomeOS/
├── homeos/                    # 主应用（独立项目）
│   ├── backend/               # 后端（import 根是 backend/，源码包名 src）
│   │   ├── src/               # FastAPI 应用（含并入的 3D Studio 数据面与授权服务）
│   │   ├── migrations/ alembic.ini   # 只在开发期用，不进构建产物
│   │   └── requirements.txt
│   ├── frontend/              # 前端源码（src / public，含 studio/ 3D 编辑器与 runtime）
│   ├── data/                  # 运行时（不入库；HOMEOS_DATA_DIR）
│   └── package.json
├── homeos-store/              # 授权商店（独立项目）
│   ├── backend/src/           # 后端（源码包名 src）
│   ├── frontend/              # 前端源码
│   ├── data/                  # 运行时（不入库；STORE_DATA_DIR）
│   ├── db/ alembic.ini        # 结构迁移（与主应用各自独立的一套；只在开发期用）
│   ├── keys/local/            # 本地联调用的授权私钥（不入库）
│   └── package.json
├── dist/                      # 构建产物（与源码彻底分开，不入库）
│   ├── homeos/
│   │   ├── frontend/          # Vite 产物（已混淆）
│   │   └── backend/linux-<arch>/   # Cython 编译后的后端（.so，无 .py 源码）
│   └── homeos-store/
│       ├── frontend/
│       └── backend/linux-<arch>/
├── ops/                       # 本地联调 dev.mjs、构建 build.py、部署、Docker 构建辅助
│   ├── build.py               # 分发级构建编排（导出加密后端、组装运行镜像）
│   ├── caddy/                 # 镜像内置反代配置（app / store 各一份）
│   ├── docker/                # 容器启动器、Cython 编译、JS 混淆
│   ├── deploy/                # deploy.sh 与部署文档
│   ├── check_schema.py        # 库结构门禁：迁移脚本 ↔ ORM 元数据一致性
│   └── dev.mjs                # 本地开发一键启动（Bun；不是部署脚本）
├── keys/                      # 仅本地联调用的开发公钥（生产商店会自生成新密钥对；容器不用）
├── packages/                  # 契约清单
├── node_modules/              # 全仓唯一的依赖安装（bunfig.toml 的 hoisted linker；
                               # 项目目录内不再有 node_modules，构建缓存落在其 .vite/ 下）
├── package.json / bun.lock    # 单体仓库编排 + 全仓唯一的依赖锁
├── bunfig.toml                # 依赖 hoist 到根 node_modules（两个项目不各自安装）
                               # package.json 的 version 也是全仓唯一的版本号来源
├── docker-compose.app.yml     # 主应用编排（可单独部署）
├── docker-compose.store.yml   # 商店编排
├── docker-compose.app.shared.yml  # 同机部署时叠加到主应用
└── Dockerfile                 # 双目标运行镜像：--target app / --target store（只消费根 dist/）
```

| 项目 | 容器名 | HTTP | 镜像内置 HTTPS | 说明 |
| --- | --- | --- | --- | --- |
| homeos | `homeos` | 8801 | 8803 | 3D 户型展示、编辑器（管理员后台进入）、HA、授权 |
| homeos-store | `homeos-store` | 8802 | 8804 | 商店前台、运营后台、授权签发 |

> **容器名 / 镜像名 / 卷名里的 `homeos` 是刻意保留的**：主应用源码目录已由 `homeos`
> 并入 `homeos`，但 compose 项目名、容器名、镜像名与数据卷名换了就等于**换了一套卷**
> （存量部署的数据会看起来「丢了」），而且容器 hostname 会参与授权实例指纹。所以运行期
> 身份一律不动，只改源码路径与构建产物路径。

商店细节见 [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md)。

---

## 开发调试

需要 **Bun 1.1+** 与 **Python 3.12+**。可选：复制环境变量模板后按需改（不改也能本地启动）：

```bash
cp .env.example .env
```

### 一键联调（推荐）

```bash
bun install
bun run dev                 # = bun ops/dev.mjs：后端热重载 + Vite HMR
```

| 地址 | 用途 |
| --- | --- |
| http://127.0.0.1:8805/ | 主应用前端 HMR（改页面走这里） |
| http://127.0.0.1:8806/ | 商店前端 HMR |
| http://127.0.0.1:8801/register | 主应用 API / 首次注册本机唯一账号（旧 `/setup` 会跳到这里） |
| http://127.0.0.1:8802/ | 商店 API；首次走 `/setup` 建运营管理员 |

`ops/dev.mjs`（`bun run dev`）默认行为：

- 只绑 `127.0.0.1`；后端热重载（主应用 uvicorn `--reload`，商店 `STORE_RELOAD=1`）
- 同时拉起 Vite `8805` / `8806`（页面 HMR）
- 缺前端产物时自动跑 `bun run build:vite`（**不混淆**）；产物落在工作区根 `dist/`，`modules/runtime` 用这份 dist，不在本脚本里 watch
- 本地验证码默认 `STORE_MAIL_MODE=log`，验证码打在启动终端
- 授权密钥自动生成并镜像到仓库根 `keys/`
- 支付渠道**不会**注入模拟收银台；未配真实/沙箱凭据时下单会 503（见商店 README）

同网段设备（平板 / 墙面板）访问：

```bash
bun run dev -- --lan          # 绑 0.0.0.0，终端会打印局域网地址
```

只要后端（不启 Vite）：

```bash
bun run dev:backend
```

改 3D runtime 模块（`homeos/frontend/src/studio/runtime`）时另开终端：

```bash
bun run dev:runtime
```

### 断点调试（保留热重载）

调试**不会**关掉后端的 `--reload` / `STORE_RELOAD`，改完代码重载出来的新进程照样能命中断点：

- **终端 + attach**：先在终端 `bun run dev -- --debug`（主应用 `8811`、商店 `8812` 挂 debugpy），再用编辑器的「附加到进程 / attach」连到对应端口。

原理：debugpy 会 patch `multiprocessing` 与 `subprocess`，而两个后端的重载子进程正是从这两处拉起来的，所以它们会自动连回同一个调试会话。

端口被占用时脚本会直接退出；关掉旧终端，或 `pkill -f ops/dev.mjs` 后再启。若已单独跑着 `bun run dev:store`，先停掉再一键启动。

### 编排脚本

| 脚本 | 作用 |
| --- | --- |
| `bun run dev` | 一键 dev：后端 + Vite HMR |
| `bun run dev:backend` | 只起后端热重载 |
| `bun run dev:prepare` | 只装 Python 环境（共享 `.venv-store`），不起服务 |
| `bun run build` | 完整构建：前端 → 根 `dist/`（含混淆）+ 后端 Cython 导出到根 `dist/` |
| `bun run build:frontend` | 只构建前端（Vite + 混淆）→ 根 `dist/<项目>/frontend/` |
| `bun run build:backend` | 只导出加密后端（Cython `.so`）→ 根 `dist/<项目>/backend/linux-<arch>/` |
| `bun run build:app` / `build:store` | 只构建一侧前端（含混淆） |
| `bun run build:vite` | 仅 Vite 构建，跳过混淆（调试用，产出到根 `dist/`） |
| `bun run obfuscate` | 对已有根 `dist/` 前端再跑一遍混淆 |
| `bun run image` / `image:app` / `image:store` | 从根 `dist/` 组装运行镜像（镜像内不再编译后端） |
| `bun run typecheck` | 两边 `tsc` + Python 静态检查（与 CI 的 `pyright` job 同口径，只硬拦必为 bug 的规则） |
| `bun run typecheck:py` | 只跑 Python 静态检查（`ops/ci/pyright_gate.py`） |
| `bun run dev:app` / `dev:store` | 单独跑一侧 Vite HMR（需后端已在跑） |
| `bun run dev:runtime` | runtime 模块 watch → 根 `dist/homeos/frontend/modules/runtime` |
| `bun run verify:scene` | 校验 `design/scene` 与两端 `public/static/**/scene` 逐字节一致 |
| `bun run verify:features` | 校验功能码真源（`ops/feature_codes.json`）与两端后端 + 前端镜像一致 |
| `bun run verify:schema` | 库结构门禁（`ops/check_schema.py`）：迁移脚本 ↔ ORM 元数据 ↔ 实际结构 ↔ 发行路径建库 |
| `bun run verify:smoke` | 商店侧冒烟：端到端判定口径（`smoke_store.py`）+ 结构漂移护栏 |
| `bun run verify:smoke:app` | 主应用侧冒烟：认证契约 + 注册→登录→激活契约 + HA 白名单 + HA 取状态容错 + 结构漂移护栏 |
| `bun run verify:smoke:frontend` | Esc 层级栈回归（`_esc_stack_smoke.ts`）：栈行为 + 全部 overlay 静态接线扫描 |

### 首次联调流程

1. 主应用 `/register` 注册本机唯一账号（账号 + 密码 + 邮箱 + 邮箱验证码；验证码由商店代发代验）。
2. 商店 `/setup` 建运营管理员 → 注册买家 → 在 `/admin` 配支付（沙箱见商店 README）。
3. 主应用登录后自动检测授权；未激活跳 `/activate`，用商店激活码完成绑定。
4. 编辑器配 HA；3D 先在 `/3d-studio` 保存户型。

不改代码就能验证这条链路（临时数据目录、进程内假商店、不碰网络）：

```bash
bun run verify:smoke:app
```

覆盖「零用户 → 发码 → 注册并登录 → 账号/邮箱两种登录 → 未登录激活 401 → 登录后激活携带
accountName → 激活失败不误判为已授权」。授权页与后台「设置 → 授权状态」面板给人工复核用。

---

## 生产部署

生产走 **GHCR 镜像 + `ops/deploy/deploy.sh` 一键部署**。**不要**用 `ops/dev.mjs`：那是开发脚本（热重载、只绑回环、验证码 log 模式）。

- 完整最小检查清单：[ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md)
- 中心商店 + 多客户机拓扑、授权身份与迁移：[ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md)
- 商店公网接入（域名 + 真实证书 HTTPS）：[ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md)
- 客户机安装指南（发给客户）：[ops/deploy/CUSTOMER.md](ops/deploy/CUSTOMER.md)
- 升级 / 回滚：[ops/deploy/UPGRADE.md](ops/deploy/UPGRADE.md)

### 部署形态

**生产形态是「中心商店 + 多台客户机」**：商店是厂商侧唯一一台，主应用一个客户一台，各自
指向中心商店。同机形态只用于开发 / 自测。

| 形态 | 命令 | 适用场景 |
| --- | --- | --- |
| 中心商店（唯一） | `./ops/deploy/deploy.sh --role store` | 厂商机，签发授权（生产第一步） |
| 客户机（多台） | `./ops/deploy/deploy.sh --role app --license-server http://<中心商店>:8802` | 每个客户各一次；**必须**显式给出商店地址 |
| 同机（仅自测） | `./ops/deploy/deploy.sh` | 一台机器同时跑商店 + 主应用；开发 / 自测，**不用于客户交付** |

分拆部署的拓扑（内网形态不需要公网域名；跨公网见 PUBLIC-ACCESS.md）：

```text
      ┌──────────── 厂商机（唯一）────────────┐
      │  homeos-store  :8802 / :8804       │
      └──────────────────┬────────────────────┘
   /v2/keys ⟵────────────┼────────────⟶ /v2/activate · /v2/heartbeat
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
客户机 homeos    客户机 homeos    客户机 homeos
  :8801 / :8803       :8801 / :8803       :8801 / :8803
客户机 → 商店：APP_LICENSE_SERVER_URL=http://<中心商店>:8802   ← 跨机直连用商店 HTTP 端口；
        商店内置反代 https://<中心商店>:8804 是自签证书，容器之间默认不互信，别拿它当授权地址
```

### 客户机精简分发包

`ops/deploy/pack-customer.sh` 产出**只含主应用侧文件**的压缩包（不含商店源码与密钥）：

```bash
./ops/deploy/pack-customer.sh     # → build/customer-pack/homeos-app-<版本>.tar.gz
```

客户机解包后一条命令安装：`./install.sh --license-server http://<中心商店>:8802`。
详见 [ops/deploy/CUSTOMER.md](ops/deploy/CUSTOMER.md)。

### 前置条件

- **部署机**：Docker Engine + Compose v2（compose 文件用了 `name:` 字段，需要 >= 2.3.3）。`deploy.sh` 会在启动前检查 docker、compose v2 与守护进程。
- **架构匹配**：镜像里的 Python 已被 Cython 编译成 per-arch 的 `.so`，amd64 / arm64 镜像不能互搬。GHCR 同时发布两种架构，`docker pull` 会自动选。
- **能拉 GHCR**：包若为私有，先 `docker login ghcr.io`（PAT 需 `read:packages`）。
- **部署目录**：`deploy.sh` 需要与 `docker-compose.app.yml` 同目录（默认取脚本所在的仓库根，可用 `--dir` 指定）。`--role app` 时不要求 `docker-compose.store.yml`（客户精简包就只有 app 侧文件）；`--role store` / `all` 才需要 store 编排。
- **中心 + 客户机**：所有机器保持时钟同步（租约、会话、令牌都按时间判定），并使用同一镜像 tag（`deploy.sh` 会写回 `.env` 钉住）。

**账号不走环境变量、也不预置**：主应用首装时**零用户**，浏览器打开会自动进 `/register` 注册
本机唯一账号（账号 / 密码 / 邮箱 / 邮箱验证码，验证码由商店代发代验）；商店运营管理员仍在
商店的 `/setup` 建。

### 一、准备环境变量

```bash
cp .env.example .env
```

`.env` 全部默认注释掉、复制不改也能启动。生产按角色至少确认：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_LICENSE_SERVER_URL` | 空 | `--role app` 必填；等价于 `--license-server`。同机 `--role all` 由叠加文件注入容器内网地址 |
| `APP_COOKIE_SECURE` / `STORE_COOKIE_SECURE` | `false` | 布尔，没有 `auto`。要让 HTTP(8801/8802) 与 HTTPS(8803/8804) **都能登录**就用 `false`；只走 HTTPS 设 `true` |
| `APP_TRUSTED_PROXIES` / `STORE_TRUSTED_PROXIES` | `127.0.0.1,::1` | 内置反代在容器回环上，**保持默认**；不要填 `*` 或 docker 网段 |
| `UVICORN_FORWARDED_ALLOW_IPS` | `127.0.0.1,::1` | 同上，**不要填 `*`** |
| `APP_BASE_URL` / `STORE_BASE_URL` | 空 | 局域网 IP 不固定时留空，应用按请求 `Host` 判断同源；需要固定地址时才填 |
| `APP_STORE_URL` | `http://127.0.0.1:8802` | 商店的**浏览器入口**，登录页「忘记密码」「商店」按它跳转。自托管填客户端能访问的商店地址（`http://<商店IP>:8802` 或反代域名）；注意它和出站用的 `APP_LICENSE_SERVER_URL` 不是一回事 |
| `APP_PUBLISH_PORT` / `APP_PROXY_PUBLISH_PORT` | `8801` / `8803` | 主应用宿主发布端口 |
| `STORE_PUBLISH_PORT` / `STORE_PROXY_PUBLISH_PORT` | `8802` / `8804` | 商店宿主发布端口 |
| `HOMEOS_VERSION` | 仓库 `package.json` 的 `version` | 镜像 tag；等价于 `--version`。优先级：`--version` > 真实环境变量 > `.env` > `package.json`。`deploy.sh` 会把解析结果写回 `.env`（连同 `HOMEOS_IMAGE` / `HOMEOS_STORE_IMAGE`）**钉住版本**，让中心与各客户机不会漂到 `latest` |

商店侧仍有邮件 / 支付 / 站点文案等配置，登录 `/admin` 在后台改（免重启），见 `.env.example` 的 C/D/E 区与商店 README。

### 二、一键部署

```bash
# ① 厂商机：起中心商店（生产第一步，唯一一次）
./ops/deploy/deploy.sh --role store

# ② 每台客户机：起主应用，并给出中心商店地址（授权公钥自动取回）
./ops/deploy/deploy.sh --role app --license-server http://192.168.1.20:8802

# ③ 开发 / 自测：同机跑商店 + 主应用（不用于客户交付）
./ops/deploy/deploy.sh

# 钉版本 / 只看将执行的命令（不写文件、不调用 docker）
./ops/deploy/deploy.sh --version 1.0.0
./ops/deploy/deploy.sh --dry-run
```

脚本会按顺序完成：

1. 解析 compose 目录，缺 `.env` 时从 `.env.example` 生成；
2. 解析镜像 tag（取仓库根 `package.json` 的 `version`），导出 `HOMEOS_IMAGE` / `HOMEOS_STORE_IMAGE`，并把版本写回 `.env` 钉住；
3. `--role app` / `all` 时准备宿主标识符号链接（`/host/etc/machine-id`、`/host/sys/class/dmi/id`，授权实例指纹读它）；
4. `docker compose pull` → `up -d`，按角色轮询健康检查（商店最长 180s，主应用最长 300s）；
5. 打印访问地址与入户页入口（主应用 `/register`、商店 `/setup`）。

**授权公钥无需人工投放**：`--role all` 时主应用只读挂载商店写出的公钥卷；`--role app` 时主应用启动即向 `APP_LICENSE_SERVER_URL` 的 `GET /v2/keys` 取回两个 PEM 并缓存到自己的数据卷（首次之后即使商店暂时不可达也能离线启动）。取回结果会与响应声明的 sha256 逐字节核对后再落盘。

支持的全部参数：

| 参数 | 说明 |
| --- | --- |
| `--role all\|store\|app` | 部署形态，默认 `all`。生产：厂商机 `store`、每台客户机 `app`；`all`（同机）仅开发 / 自测 |
| `--license-server URL` | 商店地址，写进 `.env` 的 `APP_LICENSE_SERVER_URL`；`--role app` 必填 |
| `--version TAG` | 镜像 tag。优先级：`--version` > 真实环境变量 > `.env` > `package.json` 的 `version` > `latest`；解析结果写回 `.env` 钉住 |
| `--dir DIR` | compose 与 `.env` 所在目录 |
| `--host-binds auto\|force\|skip` | 宿主标识符号链接策略，默认 `auto` |
| `--dry-run` | 只打印命令，不写文件、不调 docker |
| `--yes` / `-y` | 非交互（CI）：不提问，`sudo` 只用 `sudo -n` |

### 三、首次初始化

1. **商店**：浏览器打开 `http://<商店IP>:8802/setup`（HTTPS：`https://<商店IP>:8804/setup`）创建运营管理员。
2. **商店后台**：`/admin` 配置邮件 SMTP、支付渠道（支付宝 / 微信）、站点文案。真实收款必须填真实凭据；未配置时下单会 503（刻意 fail-closed）。
3. **主应用**：`http://<主机IP>:8801/register`（HTTPS：`https://<主机IP>:8803/register`）注册本机唯一账号（账号、密码、邮箱、邮箱验证码）。首装零用户时任何地址都会自动跳到注册页；注册入口在账号建好后即关闭。
4. **激活**：注册后自动登录并检测授权；未激活会跳 `/activate`，填入商店购买邮箱与激活码绑定本机；再到编辑器配 HA、`/3d-studio` 保存户型。

### 四、健康检查与访问地址

```bash
# 健康探针（镜像内 HEALTHCHECK 也探这两个；同时会探内置 HTTPS 入口）
curl -fsS http://127.0.0.1:8801/health/ready        # 主应用
curl -fsS http://127.0.0.1:8802/healthz             # 商店

# 查看容器与日志
docker compose -f docker-compose.store.yml ps
docker compose -f docker-compose.app.yml ps
docker logs homeos | head
```

| 服务 | HTTP 直连 | 内置 HTTPS（自签） |
| --- | --- | --- |
| 主应用 `/register`（旧 `/setup` 跳转） | `http://<IP>:8801/register` | `https://<IP>:8803/register` |
| 商店前台 | `http://<IP>:8802/` | `https://<IP>:8804/` |
| 商店后台 | `http://<IP>:8802/admin` | `https://<IP>:8804/admin` |

### 五、内网 HTTPS 与反向代理

反代（Caddy）**内置在镜像里**、与应用同容器、同 tag、同生命周期，不需要单独的反代容器，也没有宿主挂载的 Caddyfile：

- 主应用：`https://<IP>:8803` → 反代同容器 `127.0.0.1:8801`；商店：`https://<IP>:8804` → `127.0.0.1:8802`。
- 用**内置 CA + `tls internal { on_demand }`**，按连入地址**动态签发自签证书**，任意局域网 IP / 主机名都能直接访问；浏览器首次访问提示证书不受信任，手动放行即可。
- WebSocket 与媒体（`/api/v1/ws/runtime`、`/api/hls/`、`/api/camera_proxy/`）由 Caddy v2 `reverse_proxy` 默认转发。
- 自签证书落在各自的数据卷（容器内 `/data/caddy`），容器重建不丢。
- 反代在容器回环上，所以两个可信代理列表都保持默认 `127.0.0.1,::1`；真实客户端 IP 由应用层按转发链解析（限流与审计按它统计）。**不要**改成 `*` 或 docker 网段。
- 要在镜像外再套一层自建 Caddy / Nginx（例如要真实公网证书），参考 [ops/deploy/Caddyfile.intranet.example](ops/deploy/Caddyfile.intranet.example)，并相应放宽可信代理配置。
- **客户机跨公网**接入中心商店时不要用自签：用 [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) 的（`docker-compose.store.public.yml` + 域名自动签发可信证书）。

### 六、构建镜像（可选）

CI 会在默认分支推送时构建并推送 `linux/amd64` + `linux/arm64` 双架构镜像到 GHCR（`.github/workflows/docker.yml`），tag 取仓库根 `package.json` 的 `version`（与 `latest`）；非默认分支退化为 `sha-<short>`。

本地构建是**两阶段**：先把前端与加密后端产出到工作区根 `dist/`，再从 `dist/` 组装运行镜像（镜像内不再编译后端，见 `Dockerfile` 的 app / store 目标与 `ops/build.py`）：

```bash
bun install
# 1) 前端（Vite + 混淆）+ 后端（Cython .so）→ 工作区根 dist/
bun run build:frontend
python3 ops/build.py backend          # 默认跟随宿主 Docker 架构

# 2) 从根 dist/ 组装镜像（等价于 bun run image，走 Dockerfile 的 app / store 目标）
python3 ops/build.py image --project app   --tag homeos:local
python3 ops/build.py image --project store --tag homeos-store:local

# 让 deploy.sh 用本地镜像（也可写进 .env）
HOMEOS_IMAGE=homeos:local HOMEOS_STORE_IMAGE=homeos-store:local \
  ./ops/deploy/deploy.sh
```

Cython `.so` 与架构绑定：`dist/<项目>/backend/linux-<arch>/` 一份只对应一个架构；`--arch amd64|arm64` 可与宿主不同，但跨架构依赖 QEMU，会慢很多。

**产物里的包名是 `app`，不是 `src`**：源码目录按约定叫 `homeos/backend/src`，但构建阶段用 `COPY homeos/backend/src ./backend/app`（商店是 `./app`）把它映射过去再交给 Cython —— Cython 的模块名取自文件路径，映射之后 `.so` 里烤进去的就是 `backend.app.*` / `app.*`，`dist/` 里因此不存在任何名为 `src` 的目录。

产物里**没有任何明文 `.py`**：后端包之外，`migrations/`、`db/` 与 `alembic.ini` 也都不进 `dist/`（Dockerfile 的构建阶段用 `find /app \( -name '*.py' -o -name '*.pyc' \)` 兜底断言）。发行版不需要 Alembic —— 全新库由后端按 ORM 元数据直接建，再写入结构基线版本号（见 `homeos/backend/src/core/migrations.py` 的 `_create_schema` 与 `SCHEMA_REVISION`）；老库接管、备份这些行为不变。`ops/check_schema.py` 会额外验证「ORM 建库」与「迁移脚本建库」结构等价，所以少了迁移脚本也不会让新库缺表。

编译后编译脚本会自动对每个 `.so` 执行 `strip --strip-all`（见 `ops/docker/compile_python.py` 的 `_strip_extensions`）：去掉 DWARF 调试信息与 `.symtab` 静态符号，保留 `.dynsym`（动态加载靠它，删了 `import` 就失败）。这样 `strings` 里不再出现 `__pyx_pf_*` 内部函数名与原始路径。

**Python 层的异常行号不受影响**：Cython 把「文件名 + 行号」作为常量编译进了机器码（供 `__Pyx_AddTraceback` 使用），不在 DWARF 里，所以 strip 之后线上堆栈依然是 `backend/src/.../config.py, line N`；丢掉的只是 gdb 级调试信息。

**Docker Hub 拉不动时**（典型报错是 `load metadata for docker.io/library/python:3.14-slim-bookworm` → `auth.docker.io` 超时），把基础镜像切到镜像站即可，不必改 `Dockerfile`：

```bash
# 方式一：命令行
python3 ops/build.py backend --base-mirror docker.m.daocloud.io

# 方式二：写进 .env（真实环境变量优先；ops/build.py 会读），之后 bun run build 直接可用
echo 'HOMEOS_BASE_MIRROR=docker.m.daocloud.io' >> .env
bun run build
```

也可以直接把基础镜像钉到任意镜像站 / 私有仓库：`--python-image <ref>`、`--caddy-image <ref>`。

可用构建参数：`--build-arg CYTHON_VERSION=3.2.9`、`--build-arg PYTHON_IMAGE=...`、`--build-arg CADDY_IMAGE=...`。
不传 `--build-arg HOMEOS_VERSION=1.0.0` 时，构建阶段会自己从 `package.json` 读版本号（镜像内没有 VERSION 文件，版本号由构建期生成的 `src/_version.py` 携带）。

### 七、数据卷与备份

**勿删 volume。** 卷名带 compose 项目名前缀：

| 卷 | 归属 | 说明 |
| --- | --- | --- |
| `homeos_homeos-data` | 主应用 | 数据（含自动取回的授权公钥缓存 `/data/client-keys`） |
| `homeos_homeos-secrets` | 主应用 | HA / 授权凭据密钥 |
| `homeos-store_homeos-store-data` | 商店 | 库与商品资源 |
| `homeos-store_homeos-license-keys` | 商店 | **授权私钥（最关键，单独备份）** |
| `homeos-client-keys` | 共享（固定名） | 公钥卷（仅同机 `--role all` 使用；分拆部署不需要它） |
| `homeos-store_caddy-public-data` | 商店公网接入（overlay） | Caddy 证书与 ACME 账号数据（用了 `docker-compose.store.public.yml` 才有） |

```bash
# 示例：备份主应用数据卷（各卷按需重复）
mkdir -p backup
docker run --rm -v homeos_homeos-data:/data \
  -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/homeos-data.tgz .
```

授权私钥卷丢了等于所有已激活客户端失效，务必单独备份；公钥丢了不用慌 —— 主应用下次启动会自己从商店取回，详见 SPLIT-DEPLOY.md。

### 八、升级与回滚

升级＝拉新镜像 + `up -d`，**先中心商店、后客户机**，两头用同一个 tag；**不要**
`docker compose down -v`（会删卷）。用 `ops/deploy/upgrade.sh` 更省事（会显式钉版本）：

```bash
# ① 厂商机：先升中心商店
./ops/deploy/upgrade.sh --role store --version 1.0.1
# ② 每台客户机：逐个升到同一版本
./ops/deploy/upgrade.sh --role app --version 1.0.1
```

升级前可先核对各机版本：`./ops/deploy/upgrade.sh --check`。完整清单、客户通知模板与回滚
见 [ops/deploy/UPGRADE.md](ops/deploy/UPGRADE.md)。跨机迁移与硬件指纹处理见
[ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md)。

### 九、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `pull` 报 `unauthorized` / `denied` | GHCR 包是私有的：先 `docker login ghcr.io`（PAT 需 `read:packages`） |
| `manifest unknown` / `not found` | 该 tag 还没构建：到 GitHub Actions 手动 Run workflow，或改用 `--version latest` |
| `no matching manifest` | 宿主架构缺镜像层：确认宿主是 amd64 / arm64，CI 两种都已发布 |
| 主应用启动即退出、提示取回授权公钥超时 | 主应用连不上 `APP_LICENSE_SERVER_URL`：确认商店已启动、客户机能访问该地址与端口（防火墙 / 端口映射）。同机部署检查商店是否 healthy。 |
| 客户机连不上、且地址写的是 `https://…:8804` | 那是商店内置反代的自签证书，客户机不信任：改用 `http://<商店>:8802`，或按 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) 上真实证书域名 |
| 公网证书一直申请不下来 | 检查域名解析、公网 80/443 是否可达；见 [PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) |
| 激活报「租约使用了不受信任的授权公钥」 | 主应用公钥与该商店不匹配（例如数据卷是别台机器搬来的）。删掉主应用数据卷里的 `client-keys` 后重启即会重新取回；同机部署检查公钥卷是否被手工覆盖 |
| 公钥取回被拒（日志「拒绝替换」） | 商店换过密钥对，本地已固定的是旧公钥：删掉主应用数据卷里的 `client-keys` 后重启，重新取回后旧租约失效、需重新激活 |
| 已激活的客户端被判「换设备」 | `/host` 挂载或主机名变了导致实例指纹改变：先在商店后台解绑，再重新激活；或钉住 `APP_HARDWARE_MACHINE_ID` / `APP_HARDWARE_BOARD_ID` |
| 宿主端口冲突 | 改 `.env` 的 `APP_PUBLISH_PORT` / `APP_PROXY_PUBLISH_PORT` / `STORE_PUBLISH_PORT` / `STORE_PROXY_PUBLISH_PORT`，然后重跑 `deploy.sh` |
| 只想看脚本会做什么 | `./ops/deploy/deploy.sh --dry-run`（不写文件、不调 docker） |

### 参考

- [ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md) — 生产最小检查清单
- [ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md) — 中心商店 + 多客户机拓扑、授权身份与迁移
- [ops/deploy/PUBLIC-ACCESS.md](ops/deploy/PUBLIC-ACCESS.md) — 商店公网接入（域名 + 真实证书 HTTPS、支付回调）
- [ops/deploy/CUSTOMER.md](ops/deploy/CUSTOMER.md) — 客户机安装指南（随精简发包分发）
- [ops/deploy/UPGRADE.md](ops/deploy/UPGRADE.md) — 升级 / 回滚清单与客户通知模板
- [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md) — 商店 / 授权服务器细节
- `.env.example` — 全部环境变量（按 A–G 分区注释）
