# HomeOS 主应用后端（backend/src/）

FastAPI 单体，端口 **8801**，与 `homeos-store`（8802）**独立部署、互不 import**。
发行版把本目录编译成 Cython `.so`（源码不随镜像分发），详见 [ops/BUILD.md](../../../ops/BUILD.md)。

## 包名：源码态 `src`，镜像里 `app`

同一个目录在两种形态下有两个包名，这是**刻意**的：

| 形态 | 目录 | 包名 | 入口 |
|------|------|------|------|
| 源码 / 本地开发 | `homeos/backend/src` | `src` | `python -m src.run`（[ops/dev.mjs](../../../ops/dev.mjs)） |
| 构建产物 / 镜像 | `/app/app` | `app` | `uvicorn "app.app:create_asgi_app" --factory`（[ops/docker/start_app.py](../../../ops/docker/start_app.py)） |

镜像里用 `COPY ${PROJECT}/backend/src ./app`（见根 `Dockerfile` 的 `backend-build` 阶段；
本项目的 `PROJECT=homeos`）把目录映射成 `app`，Cython 的模块名取自路径，因此 `.so` 里烤进去的
是 `app.*`，产物中不存在 `src` 目录。

> **因此源码里禁止绝对 `from src.` / `import src`** —— 烤进 `.so` 后会在 `import app.app` 时炸掉。
> 这条由 [ops/docker/compile_python.py](../../../ops/docker/compile_python.py) 的 `_precheck` 在构建期硬拦。
> 包内一律用**相对导入**（当前全仓绝对 `src.`/`app.` 导入为 0）。跨项目共享走稳定包名
> `homeos_shared`，不受这里的改名影响。

## 目录职责

| 目录 | 职责 |
|------|------|
| `api/` | 路由层（FastAPI `NestRouter`）。只做参数校验与编排，业务在 `domains/` |
| `api/system/` | `/api/v1/system/*` 的 6 个路由模块（backup/config/core/lifestyle/ops/setup）；按前缀收拢的子包，不改变注册顺序 |
| `bootstrap/` | 装配：`app.py` 的创建、中间件、异常处理、lifespan、SPA 静态、路由注册表 |
| `platform/core/` | 跨切面基础设施：数据库与建库、锁、分页、时区、日志、错误类型 |
| `platform/security/` | **传输层安全**：cookie / csrf / cors / 限流 / 会话存储 |
| `domains/` | **业务域**（见下）。按域分包，是后端的主体 |
| `domains/ha/integration/` | **Home Assistant 集成**：连接、协议、加密、控制池、状态中枢 |
| `domains/ha/config/` | **HA 域配置**：连接凭据、状态变更预过滤、入口微窗口合并 |
| `realtime/` | WebSocket 网关、订阅、缓冲、消息编码 |
| `panel/` | 面板文档与 schema（2D 面板编辑器后端） |
| `modules/` | 增量功能模块（如 `interaction3d/`），受功能码门禁约束 |

顶层模块：`app.py`（ASGI 装配）、`run.py`（启动/热重载）、`config.py`（配置与布局探测）、`env.py`、`dependencies.py`、`schemas.py`。

> 与商店共用的叶子模块 —— `logging_noise`（开发期重载提示降噪）、`file_lock`（跨进程文件锁）、
> `schema_core`（按 ORM 元数据建库与库完整性校验）、
> `client_ip`（可信代理链 → 真实客户端地址）、`rate_limit`（有界滑动窗口限流）、
> `license_transport`（授权传输的协议参数：`PROTOCOL` / HKDF info / AAD / base64url / 规范化 JSON）——
> **不在本包内**：真源是 `packages/shared-py/homeos_shared`（两个后端唯一的共享源码包）。源码态由本包的
> `src/__init__.py` 挂好 `sys.path`，镜像态由构建阶段各自 COPY 后内联编译（见该目录 README）。
> `platform/core/database.py` 与 `run.py` 判定「不共享」，理由见该 README 的「分诊台账」。

## `domains/` 下的业务域

`agent` `alerts` `app_config` `awareness` `backup` `channels` `client_power` `earthquake` `home_exec`
`home_mode` `license` `lifestyle` `logs` `notification` `proxy` `retention` `security` `setup`
`state_store` `store` `system` `ui_config` `weather`，外加两段式的 `ha/{integration,config}`。

> **命名约定**：平台能力收在 `platform/`、业务域收在 `domains/`，同名双义已消除：
> `platform/security` = 传输层，`domains/security` = 家庭安防业务域；`domains/ha/integration`（集成）与
> `domains/ha/config`（配置）分列两个子包。商店后端保持自己的 `core/` `security/` 顶层域形态。

## 依赖方向（约定）

```
api  →  domains / realtime / panel / platform
domains  →  platform / realtime / 其它 domains（同层，尽量单向）
platform  →  彼此 + 标准库（不得反向依赖 api / domains）
bootstrap  →  全部（仅装配，不含业务逻辑）
```

约束要点：

- `api/` 不得被下层 import；
- `platform/` 保持为叶子基础设施，不承载业务；
- 域之间尽量单向，避免环形依赖（历史上 `notification ↔ earthquake` 出过循环：`domains/notification/__init__.py`
  曾 eager 导入 `NotificationService`，现已改为不在包 `__init__` 里 re-export —— **新增包时请勿在
  `__init__.py` 里 eager 导入会反噬的模块**）。

上面三条（含「禁止绝对 `from src.`」）由 `ops/checks/architecture/check_backend_deps.py` 机器校验，
对应规则 `B1 platform→upper` / `B2 lower→api` / `B3 absolute-src`，
外加两条与具体约定无关的结构不变量 `B4 package-cycle` / `B5 file-cycle`：

```bash
bun run check:backend-deps     # CI 门禁（同时覆盖 homeos 与 homeos-store），有违规退出码 1
node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py              # 仅报告（两个项目）
node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --project store
node ops/lib/py.mjs ops/checks/architecture/check_backend_deps.py --json
```

**B4「包级环」为什么是白名单而不是「一律禁止」**：包与包之间互相引用，只要两个方向落在
不同文件上，文件级依然无环、运行时也安全（`a/x.py → b/y.py`、`b/z.py → a/w.py`）。
但这种互相依赖会让「谁该依赖谁」失去答案，所以现状被显式冻结成白名单（
`HOMEOS_PACKAGE_WHITELIST`，当前 5 个分量 / 13 个包），**新增一处就必须改这个常量**。注意其中
`domains.{client_power,ha,logs,proxy,security}` 是 5 元环 —— 没有任何两条互反边，
只按「互相 import」逐对检查是看不出来的。

**B5「文件级环」必须为空**：这才是真正的 import 环，环内两个模块都无法先完成初始化。


## 关键契约（改动前必读）

- **POST 默认状态码 201**：全站用 `api/router.py` 的 `NestRouter` 对齐 NestJS，前端依赖该契约做「零改动透明替换」。
- **路由注册顺序不可改**：业务路由必须在 SPA catch-all 之前，3D 数据面紧随 `/api/v1` 之后（见 `bootstrap/router_registry.py` 顶部说明）。
- **建库**：启动时由 `platform/core/schema.py` 的 `prepare_schema` 按 ORM 元数据 `create_all` 建库并校验必需表，不使用迁移脚本。
- **能力码**：真源为 `ops/check/feature_codes.json`；与 `homeos-store` 对齐靠评审，新增能力先改主应用再补商店。

## 本地启动

```bash
# 仓库根：一键起双服务（前端 + 两个后端）
bun run dev
# 只起后端
bun run dev:backend
```

## 相关检查

| 命令 | 作用 |
|------|------|
| `bun run typecheck` | 前端类型检查 |
| `ruff check .` | Python lint（CI 硬拦） |

Python 类型检查只在本机 / 编辑器侧：仓库根 `pyrightconfig.json` 同时被 Pylance 与手动
`basedpyright` 读取，CI 不跑，也没有对应的 `typecheck:py` 命令。
