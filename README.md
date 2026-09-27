# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控，当前版本见 `VERSION`。

两个**相互独立**的项目：主应用 `homeos-3d` 与授权商店 `homeos-store`。各自含前后端源码与构建产物目录。

## 目录

```text
HomeOS/
├── homeos-3d/                 # 主应用（独立项目）
│   ├── backend/src/           # 后端（Python 包名 src）
│   ├── frontend/              # 前端源码（pages / src / public）
│   ├── dist/                  # bun run build 产物（运行时只挂这里）
│   ├── data/                  # 运行时（不入库；APP_DATA_DIR）
│   ├── db/ alembic.ini VERSION
│   └── package.json
├── homeos-store/              # 授权商店（独立项目）
│   ├── backend/src/           # 后端（Python 包名 src）
│   ├── frontend/              # 前端源码
│   ├── dist/                  # 构建产物
│   ├── data/                  # 运行时（不入库；STORE_DATA_DIR）
│   ├── keys/local/            # 授权私钥（不入库；公钥镜像到仓库根 keys/）
│   └── package.json
├── ops/                       # 本地联调 start.py、部署、Docker 辅助
├── keys/ packages/            # 联调共享（客户端公钥镜像、契约清单）
├── package.json / bunfig.toml # 单体仓库编排；前端依赖统一装到根 node_modules
└── docker-compose.*.yml Dockerfile
```

| 项目 | 端口 | 说明 |
| --- | --- | --- |
| homeos-3d | 18081 | 编辑器、展示、配对、HA、3D |
| homeos-store | 18082 | 商店前台、运营后台、授权签发 |

二者**互不 import**后端包；可同机或分机部署。商店细节见 [homeos-store/backend/src/README.md](homeos-store/backend/src/README.md)。

---

## 开发调试

需要 **Bun 1.1+** 与 **Python 3.12+**。可选：复制环境变量模板后按需改（不改也能本地启动）：

```bash
cp .env.example .env
```

### 一键联调（推荐）

```bash
bun install
bun run dev                 # = python3 ops/start.py：后端热重载 + Vite HMR
```

| 地址 | 用途 |
| --- | --- |
| http://127.0.0.1:5173/ | 主应用前端 HMR（改页面走这里） |
| http://127.0.0.1:5174/ | 商店前端 HMR |
| http://127.0.0.1:18081/setup | 主应用 API / 首次建管理员 |
| http://127.0.0.1:18082/ | 商店 API；首次走 `/setup` 建运营管理员 |

`ops/start.py`（`bun run dev`）默认行为：

- 只绑 `127.0.0.1`；后端热重载（主应用 uvicorn `--reload`，商店 `STORE_RELOAD=1`）
- 同时拉起 Vite `5173` / `5174`（页面 HMR）
- 缺前端产物时自动跑 `bun run build:vite`（**不混淆**）；`modules/runtime` 用这份 dist，不在本脚本里 watch
- 本地验证码默认 `STORE_MAIL_MODE=log`，验证码打在启动终端
- 授权密钥自动生成并镜像到仓库根 `keys/`
- 支付渠道**不会**注入模拟收银台；未配真实/沙箱凭据时下单会 503（见商店 README）

同网段设备（平板 / 墙面板）访问：

```bash
bun run dev -- --lan          # 绑 0.0.0.0，终端会打印局域网地址
python3 ops/start.py --lan    # 同上
```

只要后端（不启 Vite）：

```bash
bun run dev:backend
python3 ops/start.py --backend-only
```

改 3D runtime 模块（`homeos-3d/frontend/src/runtime`）时另开终端：

```bash
bun run --cwd homeos-3d dev:runtime
```

端口被占用时脚本会直接退出；关掉旧终端，或 `pkill -f ops/start.py` 后再启。若已单独跑着 `bun run dev:store`，先停掉再一键启动。

### 编排脚本

| 脚本 | 作用 |
| --- | --- |
| `bun run dev` | 一键 dev：后端 + Vite HMR |
| `bun run dev:backend` | 只起后端热重载 |
| `bun run build` | 构建 homeos-3d + homeos-store 前端 → 各自 `dist/`，并对业务 JS 做混淆 |
| `bun run build:3d` / `build:store` | 只构建一侧（含混淆） |
| `bun run build:vite` | 仅 Vite 构建，跳过混淆（调试用） |
| `bun run obfuscate` | 对已有 `dist/` 再跑一遍混淆 |
| `bun run typecheck` | 两边 `tsc` |
| `bun run dev:3d` / `dev:store` | 单独跑一侧 Vite HMR（需后端已在跑） |
| `bun run --cwd homeos-3d dev:runtime` | runtime 模块 watch → `dist/modules/runtime` |

### 首次联调流程

1. 主应用 `/setup` 建管理员。
2. 商店 `/setup` 建运营管理员 → 注册买家 → 在 `/admin` 配支付（沙箱见商店 README）。
3. 主应用 `/license` 用激活码激活。
4. 编辑器配 HA；3D 先在 `/3d-studio` 保存户型。

---

## 生产部署

生产用 GHCR 镜像 + `ops/deploy/deploy.sh`，**不要**用 `ops/start.py`（那是开发脚本：热重载、回环默认、邮件 log 模式）。

完整检查清单见 [ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md)；两台服务器分拆见 [ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md)。

### 准备

```bash
cp .env.example .env
# 至少按角色填写：
#   APP_BASE_URL / STORE_BASE_URL（https 公网域名）
#   APP_TRUSTED_PROXIES / STORE_TRUSTED_PROXIES
#   APP_COOKIE_SECURE=true / STORE_COOKIE_SECURE=true
#   UVICORN_FORWARDED_ALLOW_IPS=<反代地址或网段，不要填 *>
#   分拆部署主应用：APP_LICENSE_SERVER_URL=https://pay.example.com
```

管理员账号不走环境变量：容器起来后在浏览器打开各服务的 `/setup` 创建。

### 一键拉起

部署机需要 Docker + Compose v2。

```bash
# 同机：商店 + 主应用（先商店，再主应用；叠加内网授权地址）
./ops/deploy/deploy.sh

# 只部署商店（厂商机）
./ops/deploy/deploy.sh --role store

# 只部署主应用（客户机；须给公网商店 URL）
./ops/deploy/deploy.sh --role app --license-server https://pay.example.com

# 钉版本 / 预览命令
./ops/deploy/deploy.sh --version 0.6.5
./ops/deploy/deploy.sh --dry-run
```

脚本会按角色拉镜像、准备宿主标识符号链接（`--host-binds`）、等健康检查并打印访问地址。镜像也可本地用仓库根 `Dockerfile` 构建（`--target app` / `--target store`）。

### 健康检查与首次设置

```bash
curl -fsS http://127.0.0.1:18081/health/ready
curl -fsS http://127.0.0.1:18082/healthz
docker logs homeos-3d | head    # 主应用 /setup 引导密钥（桥接网络访问时需要）
```

1. 反代 TLS：参考 [ops/deploy/Caddyfile.example](ops/deploy/Caddyfile.example) 或 [ops/deploy/nginx.conf.example](ops/deploy/nginx.conf.example)。主应用须转发 WebSocket `/api/v1/ws/runtime` 与媒体 `/api/hls/`、`/api/camera_proxy/`。
2. 商店：`https://pay.example.com/admin` 配邮件、支付、站点文案。
3. 主应用：`/setup` → `/license` 用商店激活码激活。

### 备份与升级

勿删 volume。常见卷：

| 卷 | 说明 |
| --- | --- |
| `homeos-3d_homeos-3d-data` | 主应用数据 |
| `homeos-3d_homeos-3d-secrets` | HA / 配对 / 授权凭据密钥 |
| `homeos-3d-store_homeos-3d-store-data` | 商店库与资源 |
| `homeos-3d-store_homeos-3d-license-keys` | **授权私钥（最关键）** |
| `homeos-3d-client-keys` | 共享公钥（固定名） |

升级：`git pull`（若部署目录是检出）后重跑与首次相同的 `deploy.sh`；分拆部署建议先商店后主应用。跨机迁移与硬件指纹见 SPLIT-DEPLOY.md。
