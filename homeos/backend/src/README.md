# HomeOS 主应用后端（backend/src/）

FastAPI 单体，端口 **8801**，与 `homeos-store`（8802）**独立部署、互不 import**。
发行版把本目录编译成 Cython `.so`（源码不随镜像分发），详见根 [README.md](../../../README.md)。

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
| `bootstrap/` | 装配：`app.py` 的创建、中间件、异常处理、lifespan、SPA 静态、路由注册表 |
| `platform/core/` | 跨切面基础设施：数据库、迁移、锁、分页、时区、日志、错误类型 |
| `platform/security/` | **传输层安全**：cookie / csrf / cors / 限流 / 会话存储 |
| `domains/` | **业务域**（见下）。按域分包，是后端的主体 |
| `domains/ha/integration/` | **Home Assistant 集成**：连接、协议、加密、控制池、状态中枢 |
| `domains/ha/config/` | **HA 域配置**：连接凭据、状态变更预过滤、入口微窗口合并 |
| `realtime/` | WebSocket 网关、订阅、缓冲、消息编码 |
| `panel/` | 面板文档与 schema（2D 面板编辑器后端） |
| `modules/` | 增量功能模块（如 `interaction3d/`），受功能码门禁约束 |

顶层模块：`app.py`（ASGI 装配）、`run.py`（启动/热重载）、`config.py`（配置与布局探测）、`env.py`、`dependencies.py`、`schemas.py`。

> 与商店共用的叶子模块 —— `logging_noise`（开发期重载提示降噪）、`file_lock`（跨进程文件锁）、
> `migrations_core`（读写 `alembic_version` / 迁移前快照 / 升级后核对等**与库结构和 ORM 无关**的迁移叶子逻辑）、
> `client_ip`（可信代理链 → 真实客户端地址）、`rate_limit`（有界滑动窗口限流）、
> `license_transport`（授权传输的协议参数：`PROTOCOL` / HKDF info / AAD / base64url / 规范化 JSON）——
> **不在本包内**：真源是 `packages/shared-py/homeos_shared`（两个后端唯一的共享源码包）。源码态由本包的
> `src/__init__.py` 挂好 `sys.path`，镜像态由构建阶段各自 COPY 后内联编译（见该目录 README）。
> 原先两端「各存一份 + 孪生比对」的形态已收拢为唯一真源。
> `platform/core/migrations.py` 的**编排**（退役列清理、数据兼容地板、脚本目录布局、报错文案）两边确有差异，
> 留在各自包内；同批复核过的 `platform/core/database.py` 与 `run.py` 也已判定「不共享」，理由见该 README 的「分诊台账」。

## `domains/` 下的业务域

`agent` `alerts` `app_config` `awareness` `backup` `channels` `client_power` `earthquake` `home_exec`
`home_mode` `license` `lifestyle` `logs` `notification` `proxy` `retention` `security` `setup`
`state_store` `store` `system` `ui_config` `weather`，外加两段式的 `ha/{integration,config}`。

> **命名收敛（已完成，2026-10 批次 F）**：曾有一组同名双义的坑 —— 顶层的 `ha/`（HA 连接与协议）与 `services/ha/`
> （HA 域配置）同名不同义，`security/`（传输层）与 `services/security/`（家庭安防业务域）同样如此。
> 现在两个「平台」目录收进 `platform/`、业务域收进 `domains/`，冲突面消失：
> `platform/security` = 传输层，`domains/security` = 家庭安防业务域；`domains/ha/integration`（集成）与
> `domains/ha/config`（配置）分列两个子包。引用时不再需要靠前缀猜含义。
> 商店后端**保持原命名**（`core/` `security/` 顶层域形态），本轮只做主应用侧的指令对齐。

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

## 关键契约（改动前必读）

- **POST 默认状态码 201**：全站用 `api/router.py` 的 `NestRouter` 对齐 NestJS，前端依赖该契约做「零改动透明替换」。
- **路由注册顺序不可改**：业务路由必须在 SPA catch-all 之前，3D 数据面紧随 `/api/v1` 之后（见 `bootstrap/router_registry.py` 顶部说明）。
- **迁移不进产物**：发行版没有 Alembic，新库由 `app.migrations` 按 ORM 元数据直接建；`migrations/` 与 `alembic.ini` 不 COPY 进镜像。
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
| `bun run typecheck:py` | 本机 basedpyright（可选） |
| `ruff check .` | Python lint（CI 硬拦） |
