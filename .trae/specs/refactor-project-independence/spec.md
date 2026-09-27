# HomeOS 双项目独立化与结构优化 - 产品需求文档

## Overview
- **Summary**: 对工作区内两个独立项目 `homeos-3d`（主应用）与 `homeos-store`（授权商店）进行结构审查与重构，消除跨项目构建依赖，将共享设计系统从单项目内移出到仓库根级，统一后端导入风格，清理运行时残留与孤立文件，确保两项目相互独立、前后端分离、构建产物单独存放。
- **Purpose**: 当前 `homeos-store` 的前端构建直接引用 `homeos-3d/design/scene/` 下的文件，共享设计系统被错误地放在 `homeos-3d/` 目录内，违反了"两项目相互独立"的原则；同时存在导入风格不一致、测试混入源码包、孤立字节码文件等代码质量问题。
- **Target Users**: 仓库维护者、构建与部署流程。

## Goals
- 消除 `homeos-store` 对 `homeos-3d` 内部路径的构建时依赖。
- 将共享设计系统 `design/scene/` 提升到仓库根级，作为 monorepo 共享资源，不再归属任一项目。
- 统一两个后端的 Python 导入风格为相对导入，避免 `src` 包名冲突。
- 将 `homeos-store` 的测试移出 `src/` 包，不进入生产镜像编译。
- 清理孤立的 `.pyc` 字节码与运行时残留目录。
- 保持两项目各自的 `dist/`、`data/` 产物独立存放且不入库。

## Non-Goals
- 不重写业务逻辑、不改变 API 行为。
- 不新增测试用例（仅调整测试目录位置与导入路径）。
- 不修改前端页面视觉效果或交互逻辑。
- 不调整 Docker 镜像结构（仅因源码路径变更做最小适配）。

## Background & Context
- 仓库为 monorepo，根 `package.json` 使用 bun workspaces 编排 `homeos-3d` 与 `homeos-store`。
- `homeos-3d/design/scene/` 是场景设计系统的 canonical 源，同样内容被复制到：
  - `homeos-3d/frontend/public/static/auth/scene/`（主应用入口页）
  - `homeos-store/frontend/public/static/scene/`（商店页面）
- `homeos-store/frontend/vite.config.ts:75` 在商店自身副本缺失时回退到 `../homeos-3d/design/scene/scene.html`，构成跨项目构建依赖。
- `homeos-3d/backend` 使用相对导入（`from .api.auth import`）；`homeos-store/backend` 使用 `from src.` 绝对导入（399 处），两者包名均为 `src`。
- `homeos-store/backend/src/tests/` 位于源码包内，Docker 构建时会被 Cython 编译进生产镜像。
- `homeos-store/backend/src/ops/__pycache__/cooldown_migration.cpython-314.pyc` 无对应 `.py` 源文件，属孤立残留。
- `data/`、`dist/`、`__pycache__/`、`keys/local/` 均已在 `.gitignore` 中忽略，但本地磁盘存在运行时生成的残留。

## Functional Requirements
- **FR-1**: `homeos-store` 前端构建不再引用 `homeos-3d/` 下的任何路径。
- **FR-2**: 共享设计系统位于仓库根 `design/scene/`，两项目各自保留分发给 `public/` 的副本。
- **FR-3**: 两项目后端均使用相对导入，不再出现 `from src.` 形式的导入。
- **FR-4**: `homeos-store` 测试目录位于 `backend/tests/`（`src/` 包外），不进入 Docker 编译范围。
- **FR-5**: 孤立的 `cooldown_migration.pyc` 及所有 `__pycache__/` 从工作区磁盘清除。
- **FR-6**: 所有源码注释、错误提示中对 `homeos-3d/design/scene/` 的路径引用更新为 `design/scene/`。

## Non-Functional Requirements
- **NFR-1**: `bun run build`（含混淆）对两项目均成功，产物结构不变。
- **NFR-2**: `bun run typecheck` 两项目均通过。
- **NFR-3**: Docker 多阶段构建（`app` / `store` target）可正常完成。
- **NFR-4**: 两项目后端可独立启动（`ops/start.py` 与单独容器）。
- **NFR-5**: 不引入新的跨项目文件系统依赖。

## Constraints
- **Technical**: Bun 1.4.2、Python 3.12、Vite 8、Cython 编译要求 `src/` 下无 `.py` 残留。
- **Business**: 生产镜像不得包含测试代码；授权私钥不得入库。
- **Dependencies**: `ops/start.py`、Dockerfile、docker-compose 仅做路径适配，不改变运行行为。

## Assumptions
- `design/scene/` 下文件为两项目共享的设计系统 canonical 源，提升到根级后由维护者手动同步到各项目 `public/`。
- `homeos-store` 相对导入改造不会改变运行时模块解析（`PYTHONPATH=/app` 下 `src` 包仍可被 import）。
- 测试移出 `src/` 后，`pytest` 仍能通过 `conftest.py` 与 `sys.path` 调整正常发现并运行。

## Acceptance Criteria

### AC-1: 消除跨项目构建依赖
- **Type**: `rule`
- **Given**: `homeos-store` 前端构建配置存在
- **When**: 搜索 `homeos-store/` 下所有源码与配置
- **Then**: 不存在任何对 `homeos-3d/` 路径的引用（包括 vite 配置、import、注释外的代码路径）
- **Pass Condition**: `grep -rn 'homeos-3d' homeos-store/` 仅返回注释或文档说明，无实际路径依赖
- **Evidence**: grep 命令输出为空或仅含注释行

### AC-2: 设计系统提升到仓库根级
- **Type**: `rule`
- **Given**: 共享设计系统文件
- **When**: 检查仓库目录
- **Then**: `design/scene/` 存在于仓库根，且 `homeos-3d/design/` 不再存在
- **Pass Condition**: `ls design/scene/scene.html` 成功且 `ls homeos-3d/design` 失败
- **Evidence**: 目录列表与 git 历史

### AC-3: 后端导入风格统一为相对导入
- **Type**: `rule`
- **Given**: 两个项目的后端源码
- **When**: 搜索所有 `.py` 文件
- **Then**: 不存在 `from src.` 形式的导入语句
- **Pass Condition**: `grep -rn '^from src\.' homeos-3d/backend homeos-store/backend` 返回 0 匹配
- **Evidence**: grep 计数为 0

### AC-4: 商店测试移出源码包
- **Type**: `rule`
- **Given**: homeos-store 测试代码
- **When**: 检查测试目录位置
- **Then**: 测试位于 `homeos-store/backend/tests/`，`homeos-store/backend/src/` 下无 `tests/` 子目录
- **Pass Condition**: `ls homeos-store/backend/tests/conftest.py` 成功且 `ls homeos-store/backend/src/tests` 失败
- **Evidence**: 目录列表

### AC-5: 清理孤立字节码与运行时残留
- **Type**: `rule`
- **Given**: 工作区磁盘
- **When**: 查找孤立 pyc 与 __pycache__
- **Then**: 不存在无对应 `.py` 的 `.pyc` 文件，且工作区无 `__pycache__/` 目录
- **Pass Condition**: `find . -name '__pycache__' -type d` 返回空，且无孤立 pyc
- **Evidence**: find 命令输出为空

### AC-6: 构建与类型检查通过
- **Type**: `rule`
- **Given**: 重构完成的工作区
- **When**: 运行 `bun run typecheck` 与 `bun run build:vite`
- **Then**: 两条命令均以 0 退出
- **Pass Condition**: 退出码均为 0
- **Evidence**: 命令输出与退出码

### AC-7: 两项目结构独立性
- **Type**: `rubric`
- **Dimension**: 项目间耦合度与目录清晰度
- **Scale**: 1-5
- **Anchors**: 1 = 存在跨项目构建/导入依赖，共享资源错放；3 = 无硬依赖但结构不清晰；5 = 两项目完全自包含，共享资源明确位于仓库根级
- **Pass Threshold**: >= 4
- **Evidence**: 目录结构审查与跨项目引用搜索结果

## Open Questions
- [ ] `homeos-store` 相对导入改造是否需要同步调整 `ops/start.py` 中 `sys.path` 的插入顺序？（预计不需要，因为相对导入不依赖 `src` 包名）
- [ ] 测试移出 `src/` 后，`pytest` 的 rootdir 与 `conftest.py` 是否需要显式配置 `pythonpath`？（预计需要在 `tests/conftest.py` 或 `pyproject.toml` 中添加 `backend/src` 到 sys.path）
