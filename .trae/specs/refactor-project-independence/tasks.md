# HomeOS 双项目独立化与结构优化 - 实施计划

## Task 1: 将共享设计系统提升到仓库根级
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 使用 `git mv homeos-3d/design design` 将 `homeos-3d/design/` 整体移动到仓库根 `design/`。
  - 保留 `design/scene/` 下所有文件（scene.html、page.css、panel.css、scene.css、fonts.css、fonts/）。
  - 确认 `homeos-3d/design/` 已不存在。
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `rule` TR-1.1: `ls design/scene/scene.html` 成功；`ls homeos-3d/design` 返回非零退出码。证据：shell 命令输出。
  - `rule` TR-1.2: `git status` 显示 rename 而非 delete+add。证据：git status 输出。
- **Completion Evidence**:
  - TR-1.1: `ls design/scene/scene.html` 输出文件路径；`ls homeos-3d/design` 返回 "No such file or directory"。
  - TR-1.2: `git status --short` 显示 `R homeos-3d/design/scene/* -> design/scene/*`（rename 检测）。

## Task 2: 更新所有 design 路径引用
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 全局搜索 `homeos-3d/design` 与 `homeos-3d/design/scene` 引用。
  - 源码注释中 `design/scene/` 引用已正确（无需改，因 canonical 源已在根级）。
  - 更新 `homeos-store/frontend/vite.config.ts` 中 `../homeos-3d/design/scene/scene.html` 的回退路径。
  - Dockerfile 前端构建阶段仅 COPY 各项目目录，不依赖根级 design/（各项目 public/ 内有分发副本）。
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `rule` TR-2.1: `grep -rn 'homeos-3d/design' . --include='*.py' --include='*.ts' --include='*.mjs' --include='*.html' --include='*.css'` 返回 0 匹配。证据：grep 输出。
  - `rule` TR-2.2: `grep -rn 'homeos-3d' homeos-store/` 仅返回注释或文档，无路径依赖。证据：grep 输出。
- **Completion Evidence**:
  - TR-2.1: grep 返回 0 匹配（No matches found）。
  - TR-2.2: 仅 4 处引用，均为 monorepo 结构检测（config.py、env.py）或注释/文档（appearance.ts、release_info.py），无构建/导入路径依赖。

## Task 3: 消除 homeos-store 对 homeos-3d 的构建依赖
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 修改 `homeos-store/frontend/vite.config.ts` 的 `flattenTemplatesPlugin`，移除对 `../homeos-3d/design/scene/scene.html` 的回退。
  - 商店仅使用自身 `homeos-store/frontend/public/static/scene/scene.html`，缺失即报错。
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `rule` TR-3.1: `homeos-store/frontend/vite.config.ts` 中不出现 `homeos-3d` 字符串。证据：grep 输出为空。
  - `rule` TR-3.2: 临时删除商店 scene.html 后运行 `bun run --cwd homeos-store build` 应报错而非成功。证据：构建输出。
- **Completion Evidence**:
  - TR-3.1: `grep 'homeos-3d' homeos-store/frontend/vite.config.ts` 返回空。
  - TR-3.2: vite.config.ts 改为 `fs.existsSync` 检查后 `throw new Error(...)`；构建在缺失时明确报错。`bun run build:vite` 在 scene.html 存在时成功。

## Task 4: 统一 homeos-store 后端为相对导入
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 将 `homeos-store/backend/src/` 下所有 `from src.X import Y` 替换为相对导入（深度 0 用 `.`，深度 1 用 `..`）。
  - `from src import X` → `from . import X`；`import src.X.Y` → `from ..X import Y`。
  - 修正 schema_guard.py 中 `import src.core.models` → `from ..core import models`。
  - `ops/` 目录下脚本保持 `from src.` 绝对导入（不在 src 包内，正确）。
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `rule` TR-4.1: `grep -rn '^from src\.' homeos-store/backend/` 返回 0 匹配。证据：grep 计数为 0。
  - `rule` TR-4.2: `python -c "import sys; sys.path.insert(0,'homeos-store/backend'); import src.app"` 成功（无 ImportError）。证据：命令退出码 0。
- **Completion Evidence**:
  - TR-4.1: grep 返回 0 匹配。
  - TR-4.2: `.venv-store/bin/python -c "...import src.app"` 输出 "OK: src.app imported successfully"。同时验证 `src.run`、`src.licensing`、`ops.container_entrypoint`、`ops.docker.start_app` 均导入成功。

## Task 5: 将 homeos-store 测试移出源码包
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: Task 4
- **Description**:
  - `git mv homeos-store/backend/src/tests homeos-store/backend/tests`。
  - conftest.py: `parents[2]` → `parents[1]`（测试上移一级）。
  - 所有 `from src.tests.support` → `from support`。
  - test_payment_channels_multi.py: `parents[3]` → `parents[2]`。
  - 更新 README.md 与 requirements-dev.txt 中的测试路径。
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `rule` TR-5.1: `ls homeos-store/backend/src/tests` 返回非零；`ls homeos-store/backend/tests/conftest.py` 成功。证据：shell 输出。
  - `rule` TR-5.2: `cd homeos-store/backend && python -m pytest tests/ -q` 退出码 0。证据：pytest 输出。
- **Completion Evidence**:
  - TR-5.1: `src/tests` 不存在；`tests/conftest.py` 存在。git 显示为 rename。
  - TR-5.2: pytest 75 passed, 1 failed（预先存在的 `test_orders_table_column_count_matches_empty_row`，与改动无关，已通过 git stash 验证）。

## Task 6: 清理孤立字节码与运行时残留
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 删除 `homeos-3d`、`homeos-store`、`ops` 下所有 `__pycache__/` 目录（25 个）。
  - 删除所有 `.pyc` 文件（217 个），含孤立的 `cooldown_migration.cpython-314.pyc`。
  - 保留 `data/`、`dist/`、`keys/local/`（gitignored 运行时目录，由应用管理）。
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `rule` TR-6.1: `find homeos-3d homeos-store -name '__pycache__' -type d` 返回空。证据：find 输出为空。
  - `rule` TR-6.2: `find homeos-3d homeos-store -name '*.pyc'` 返回空。证据：find 输出为空。
- **Completion Evidence**:
  - TR-6.1: find 返回 0 个 `__pycache__` 目录。
  - TR-6.2: find 返回 0 个 `.pyc` 文件（排除 `.venv-store/` 虚拟环境）。

## Task 7: 验证构建、类型检查与导入
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- **Description**:
  - 运行 `bun run typecheck` 验证两项目 TypeScript 编译。
  - 运行 `bun run build`（含混淆）验证两项目前端构建。
  - 验证两后端及 ops 入口导入。
  - 运行商店测试。
  - 验证 Dockerfile 构建断言。
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-6, AC-7
- **Test Requirements**:
  - `rule` TR-7.1: `bun run typecheck` 退出码 0。证据：命令输出。
  - `rule` TR-7.2: `bun run build:vite` 退出码 0。证据：命令输出。
  - `rule` TR-7.3: 两个后端 import 命令退出码 0。证据：命令输出。
  - `rubric` TR-7.4: 项目结构独立性；scale 1-5；anchors 1=有跨项目依赖, 3=无硬依赖但结构不清, 5=完全自包含共享资源在根级；threshold >= 4；evidence：目录审查与 grep 结果。
- **Completion Evidence**:
  - TR-7.1: `bun run typecheck` 两项目 tsc 均无错误输出，退出码 0。
  - TR-7.2: `bun run build`（vite + 混淆）成功，混淆 249 个文件。Dockerfile 全部 6 项断言 PASS。
  - TR-7.3: homeos-3d `src.main`、homeos-store `src.app`/`src.run`/`src.licensing`、`ops.container_entrypoint`、`ops.docker.start_app` 均导入成功。
  - TR-7.4: 评分 5/5。两项目无跨项目构建/导入依赖；共享设计系统位于仓库根 `design/`；前端 `frontend/` 与后端 `backend/` 分离；`dist/`、`data/` 产物独立存放且 gitignored。
