# HomeOS 双项目独立化与结构优化 - 独立审查报告

**审查日期**: 2025-01-29
**审查范围**: AC-1 至 AC-7 全部验收标准
**审查结论**: ✅ 全部通过

---

## AC-1: 消除跨项目构建依赖 — ✅ PASS

**验证命令**: `grep -rn 'homeos-3d' homeos-store/`（排除注释/文档外的路径依赖）

**结果**: 共 4 处引用，均非构建/导入依赖：
| 文件 | 行 | 性质 |
|------|----|------|
| `homeos-store/frontend/src/scene/appearance.ts` | 1 | 注释：指向 3d 侧 appearance.ts 的文档说明 |
| `homeos-store/backend/src/config.py` | 34 | monorepo 结构检测：`if (PROJECT_ROOT.parent / "homeos-3d").is_dir()` |
| `homeos-store/backend/src/core/env.py` | 14 | monorepo 根目录检测 |
| `homeos-store/backend/src/ops/release_info.py` | 33 | 字符串中的 Docker volume 名称 |

`homeos-store/frontend/vite.config.ts` 中 `homeos-3d` 匹配数为 **0**。

**结论**: 不存在跨项目构建时文件系统依赖。商店构建仅使用自身 `public/static/scene/scene.html`，缺失即报错。

---

## AC-2: 设计系统提升到仓库根级 — ✅ PASS

**验证**:
- `ls design/scene/scene.html` → 成功（文件存在）
- `ls homeos-3d/design` → `No such file or directory`
- git 检测为 rename（`R homeos-3d/design/scene/* -> design/scene/*`）

**结论**: 共享设计系统 canonical 源位于 `design/scene/`，不再归属任一项目。

---

## AC-3: 后端导入风格统一为相对导入 — ✅ PASS

**验证命令**: `grep -rnE '^from src\.|^import src\.' homeos-3d/backend/src homeos-store/backend/src`

**结果**: **0 匹配**

homeos-store 后端 64 个文件的 `from src.X` 已全部转换为相对导入（深度 0 用 `.`，深度 1 用 `..`）。homeos-3d 后端原本就使用相对导入。

**导入链验证**:
- `homeos-3d`: `import src.main` ✅
- `homeos-store`: `import src.app`、`import src.run`、`import src.licensing` ✅
- `ops.container_entrypoint`、`ops.docker.start_app` ✅

`ops/` 目录下脚本保持 `from src.` 绝对导入（不在 src 包内，正确）。

---

## AC-4: 商店测试移出源码包 — ✅ PASS

**验证**:
- `ls homeos-store/backend/tests/conftest.py` → 成功
- `ls homeos-store/backend/src/tests` → `No such file or directory`
- git 检测为 rename（`R homeos-store/backend/src/tests/* -> homeos-store/backend/tests/*`）

**测试结果**: `pytest tests/ -q` → **75 passed, 1 failed**
- 失败用例 `test_orders_table_column_count_matches_empty_row` 为**预先存在**的失败（通过 git stash 验证与本次改动无关）。

**生产镜像安全**: Dockerfile 仅 `COPY homeos-store/backend/src ./src`，`tests/` 不在编译范围内。

---

## AC-5: 清理孤立字节码与运行时残留 — ✅ PASS

**验证**（排除 `.venv-store/` 虚拟环境）:
- `__pycache__` 目录数: **0**
- `.pyc` 文件数: **0**
- `cooldown_migration*` 残留: **无**
- git 跟踪的 `.pyc`/`__pycache__`: **0**

清理前：25 个 `__pycache__`、217 个 `.pyc`（含孤立的 `cooldown_migration.cpython-314.pyc`）。
清理后：全部清除。`data/`、`dist/`、`keys/local/` 保留（gitignored 运行时目录，由应用管理）。

---

## AC-6: 构建与类型检查通过 — ✅ PASS

| 命令 | 退出码 | 结果 |
|------|--------|------|
| `bun run typecheck` | 0 | 两项目 tsc 无错误 |
| `bun run build:vite` | 0 | 两项目 vite 构建成功 |
| `bun run build`（含混淆） | 0 | 混淆 249 个文件成功 |

**Dockerfile 构建断言**（6/6 PASS）:
- ✅ homeos-3d client-log 混淆（含 `_0x`）
- ✅ three vendor 存在
- ✅ store auth-bootstrap 混淆
- ✅ jquery 存在
- ✅ homeos-3d index.html
- ✅ store templates/store.html

---

## AC-7: 两项目结构独立性（Rubric） — ✅ PASS (Score: 5/5)

| 维度 | 评价 |
|------|------|
| 跨项目构建依赖 | 无。商店不再回退到 3d 侧 design |
| 共享资源位置 | `design/scene/` 明确位于仓库根级 |
| 前后端分离 | 两项目均有独立 `frontend/` 与 `backend/` |
| 构建产物隔离 | `dist/`、`data/`、`keys/local/` 均 gitignored，0 个被 git 跟踪 |
| 导入隔离 | 两后端包名虽均为 `src`，但均用相对导入，无 `from src.` 冲突 |
| 测试隔离 | 商店测试在 `src/` 包外，不进生产镜像 |

**评分**: 5/5（threshold ≥ 4）— 两项目完全自包含，共享资源明确位于仓库根级，构建产物独立存放且不入库。

---

## 总结

| AC | 类型 | 结果 |
|----|------|------|
| AC-1 | rule | ✅ |
| AC-2 | rule | ✅ |
| AC-3 | rule | ✅ |
| AC-4 | rule | ✅ |
| AC-5 | rule | ✅ |
| AC-6 | rule | ✅ |
| AC-7 | rubric (5/5) | ✅ |

**全部验收标准通过。** 重构未引入新的跨项目依赖，构建与测试均正常，生产镜像不包含测试代码。
