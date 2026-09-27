# HomeOS

面向 [Home Assistant](https://www.home-assistant.io/) 的本机仪表盘与中控，当前版本见 `VERSION`。

后端 FastAPI，前端原生 HTML / CSS / JS，数据默认落本机 SQLite。授权始终开启，激活走仓库自带的授权商店（`apps/store/`），不连外部厂商节点。

## 两个服务

| 服务 | 目录 | 端口 | 作用 |
| --- | --- | --- | --- |
| 主应用 | `apps/server/` + `frontend/` | 18081 | 编辑器、展示、配对、HA、3D 工作室与交互 |
| 授权商店 | `apps/store/` | 18082 | 商店前台、运营后台、授权签发（`/v2/*`） |

二者**互不 import**，可同机或分机部署。商店细节见 [apps/store/README.md](apps/store/README.md)。

```text
HomeOS/
├── apps/server/          # 主应用 FastAPI
├── apps/store/           # 授权商店 + 授权服务器
├── frontend/             # *.html + static/ + modules/runtime/
├── db/migrations/        # Alembic（唯一基线 0001）
├── keys/                 # 客户端公钥镜像（启动时从商店同步）
├── packages/contracts/   # 同名双份对齐清单
├── ops/                  # start.py / deploy / bump_static_cache_versions.mjs
├── data/                 # 主应用运行时数据（不入库）
├── .env.example Dockerfile docker-compose.*.yml
└── alembic.ini VERSION
```

`apps/server/` 与 `apps/store/` 里同名模块（如 `static_revision`、`appearance`）是刻意双份，防漂移用 `packages/contracts/surfaces.json` 人工核对。

## 本地启动

```bash
python3 ops/start.py
```

会创建 `.venv-store`（若缺失）、读根目录 `.env`、拉起商店 **18082** 与主应用 **18081**。首次启动自动生成授权密钥并镜像到 `keys/`。

| 页面 | 地址 |
| --- | --- |
| 主应用设置 | http://127.0.0.1:18081/setup |
| 主应用编辑器 | http://127.0.0.1:18081/ |
| 商店 | http://127.0.0.1:18082/ |

手工迁移（一般不必）：

```bash
APP_DATA_DIR=./data PYTHONPATH=. alembic upgrade head
```

### 首次使用

1. `/setup` 建主应用管理员（本机 `localhost` 可直接建；远程需填启动日志里的引导密钥）。
2. 商店 `/setup` 建运营管理员 → 注册买家账号（本地验证码在 `ops/start.py` 终端）→ 配支付并小额自测。
3. 主应用 `/license` 用「激活码 + 购买邮箱」激活。
4. 编辑器里配 HA 地址与长期令牌，建仪表盘；3D 交互先在 `/3d-studio` 保存户型再挂控件。
5. 中控：编辑器生成 6 位配对码，设备打开 `/pair`。

忘记主应用密码：停进程、删 `data/admin-account.json` 再启；户型 / HA / 授权 / 配对保留。

## 功能一览

- 仪表盘编辑、全屏展示 `/display/{项目名}`、中控配对
- 3D 户型工作室与交互舞台（灯 / 窗帘 / 空调 / 净化器 / 门锁 / 通用设备等）
- HA HTTP / WebSocket 同步，摄像头与媒体代理
- 全局日志；商店账号 / 订单 / 优惠码 / 邀请；运营后台 `/admin`

## 授权（摘要）

默认连本机 `http://127.0.0.1:18082`，公钥在 `keys/`（与 `apps/store/keys/local/` **逐字节一致**）。租约 Ed25519 验签，传输 X25519 + AES-GCM，心跳续租。

分机部署时覆盖 `APP_LICENSE_SERVER_URL` 与公钥路径 / sha256（见 `.env.example`）。密钥轮换：旧四件套改名 `*.previous.pem` 再生成新钥，两端自动开重叠窗口。

能力码决定功能门禁（`api` / `editor` / `display` / `ha.*` / `module.3d_interaction` 等）。吊销只认结构化 `code=REVOKED` 或 `revoked: true`。

## Docker

```bash
./ops/deploy/deploy.sh --role app --license-server https://pay.example.com   # 客户机
./ops/deploy/deploy.sh --role store                                          # 厂商机
./ops/deploy/deploy.sh                                                       # 同机（默认）
```

镜像构建见 `.github/workflows/docker.yml`（Cython + JS 混淆，业务源码不进运行镜像）。Cython 钉死 **3.1.6**。分拆与反代见 [ops/deploy/SPLIT-DEPLOY.md](ops/deploy/SPLIT-DEPLOY.md)、[ops/deploy/PRODUCTION.md](ops/deploy/PRODUCTION.md)。

启动后先用 `docker logs` 取 `/data/setup-token`，再打开对应 `/setup`。

## 环境变量

统一写根目录 `.env`（从 `.env.example` 复制）。优先级：真实环境变量 > `.env` > 默认值。

| 区 | 内容 |
| --- | --- |
| A | 公网域名、可信反代、Cookie Secure |
| B | 主应用数据目录、会话寿命、授权公钥路径 |
| C | 商店监听、租约 TTL、巡检、限流 |
| D | `APP_SETUP_TOKEN` / `STORE_SETUP_TOKEN`（空则首次启动自动生成） |

站点名、邮件、支付凭据等在商店 `/admin`「站点配置」改（保存即生效）。完整表见 `.env.example` 与商店 README。

## 主应用路径速查

| 路径 | 说明 |
| --- | --- |
| `/` `/setup` `/login` `/license` `/pair` | 编辑器与账号流 |
| `/3d-studio` | 户型工作室 |
| `/display/{name}` | 全屏中控 |
| `/api/v1/*` | REST（项目、HA、素材、日志、授权…） |
| `/api/v1/modules/interaction3d/*` | 3D 交互资源（需授权） |
| `/api/v1/ws/runtime` | 实时状态 |
| `/health/live` `/health/ready` | 探活 |

运行时数据默认在 `data/`（`app.db`、上传图、3D 草稿、日志等）。商店数据在 `apps/store/data/`，私钥在 `apps/store/keys/local/`——均勿提交。

## 开发约定

- **换缓存戳**（改 JS/CSS/HTML 后必跑）：

  ```bash
  node ops/bump_static_cache_versions.mjs
  node ops/bump_static_cache_versions.mjs --dry-run
  ```

  戳格式 `?v=YYMMDDHHMM`。新增引用要手写 `?v=`；后端按 mtime 拼的链接不走此脚本。

- **两棵前端树不要合并**：`frontend/static/**` 走静态挂载；`frontend/modules/runtime/**` 按能力码经 `manifest.json` 下发。
- **注释**：只留功能注释（指令、JSDoc 标签、TODO、分节标题、≤60 字契约说明）；不写「为什么 / 历史 / 踩坑」长叙事。
- 商店 pytest：`pip install -r apps/store/requirements-dev.txt && pytest apps/store/tests -q`。
- CI 目前只有镜像构建工作流；行为正确性靠人工走关键路径。

## 更新日志

项目按首发版本维护。近期能力以 `VERSION` 与提交历史为准；上游对齐说明见 git 日志。
