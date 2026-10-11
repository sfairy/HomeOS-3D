#!/usr/bin/env python3
"""独立部署护栏的自检：给 ``check_deploy_independence.py`` 注入漂移，确认它真的会拦。

为什么需要它
------------
护栏读的是「源码里的可执行文本」与「Dockerfile 的 COPY 图」，两者都是**解析型**判据 ——
这类门禁最典型的死法是**自己悄悄变瞎**：正则改窄到匹配不上、目录改名后遍历为空、
`find` 拿不到东西。只要那时选择「匹配不到就跳过」，门禁就永远打印通过，而真正的越界照样溜过去，
从输出上完全看不出区别。

所以本自检不复述门禁的判定逻辑（那只会得到第二份会漂移的副本），而是真的把一份**副本**改坏，
逐条确认每个分支都会报错、且报的是对的那一条。**同时**逐条确认「说明文案 / 注释 / 注释里的
路径」不会误报 —— 假阳性会把门禁变成噪声，最后被人绕过。

副本用真实 ``Dockerfile`` 与两个 ``package.json``（保证判据对着真实拓扑跑），源码只造最小的
占位文件 —— 但 ``packages/shared-py`` 会整目录拷进去：第 5 组检查在目录不存在时会走「N/A」
分支，那样用例看着通过、其实什么都没验。全程在 ``tempfile`` 里操作，不碰真实工作区。

用法::

    python3 ops/check_deploy_independence_selftest.py
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops import check_deploy_independence as gate

failures: list[str] = []
checked = 0


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name}: {error}")
        print(f"[FAIL] {name}")
    except Exception as error:  # 自检要如实报出任何异常，不做类型收窄
        failures.append(f"{name}: 意外异常 {type(error).__name__}: {error}")
        print(f"[FAIL] {name}（意外异常）")
    else:
        print(f"[  OK] {name}")


def build_base(dest: Path) -> None:
    """造一份最小副本：真实 Dockerfile + 真实 package.json + 占位源码。"""
    (dest / "homeos" / "backend" / "src").mkdir(parents=True)
    (dest / "homeos-store" / "backend" / "src").mkdir(parents=True)
    (dest / "homeos" / "frontend" / "src").mkdir(parents=True)
    (dest / "homeos-store" / "frontend" / "src").mkdir(parents=True)
    (dest / "homeos" / "backend" / "src" / "__init__.py").write_text("", encoding="utf-8")
    (dest / "homeos-store" / "backend" / "src" / "__init__.py").write_text("", encoding="utf-8")
    (dest / "homeos" / "frontend" / "src" / "placeholder.ts").write_text("export {}\n", encoding="utf-8")
    (dest / "homeos-store" / "frontend" / "src" / "placeholder.ts").write_text(
        "export {}\n", encoding="utf-8"
    )
    shutil.copy2(ROOT / "Dockerfile", dest / "Dockerfile")
    # 项目派发表（ops/build.py）：第 4 组检查要拿它与 Dockerfile 的 case 对账，副本里缺了
    # 它就只会报「脚本不存在」—— 那样后面所有关于 PROJECT 的用例都失去意义。
    (dest / "ops").mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / gate.BUILD_SCRIPT, dest / gate.BUILD_SCRIPT)
    for project in (gate.APP_PROJECT, gate.STORE_PROJECT):
        shutil.copy2(ROOT / project / "package.json", dest / project / "package.json")
    # 共享 Python 包（P3c 已落地）：副本必须带上它，否则第 5 组用例会落到「目录不存在 →
    # N/A」分支上，看着通过、其实什么都没验。用例因此改成「撤回真实接线」而不是「凭空补上」。
    shutil.copytree(ROOT / gate.SHARED_PY_SRC, dest / gate.SHARED_PY_SRC)
    # 共享 TS 包（`@homeos/shared`，P3b/P3c）：第 6 组检查要有真源才不是空转。这里**不整目录拷贝**
    # （真实 `packages/shared` 带 `dist/` 与 `node_modules/`，会把副本撑大且拖慢每个用例），
    # 改为造最小形态：一个占位模块 + 一份真实 `package.json`（清单检查要拿真表来注入）。
    (dest / gate.SHARED_TS_SRC / "src").mkdir(parents=True)
    (dest / gate.SHARED_TS_SRC / "src" / "index.ts").write_text("export {}\n", encoding="utf-8")
    shutil.copy2(ROOT / gate.SHARED_TS_SRC / "package.json", dest / gate.SHARED_TS_SRC / "package.json")


def replica(dest: Path) -> None:
    build_base(dest)


def run_gate(root: Path) -> list[str]:
    problems, _notes = gate.run(root)
    return problems


def expect(problems: list[str], fragment: str, name: str) -> None:
    assert any(fragment in message for message in problems), (
        f"{name}：期望报出包含 {fragment!r} 的问题，实际 {problems!r}"
    )


def expect_clean(problems: list[str], name: str) -> None:
    assert not problems, f"{name}：期望不报问题（假阳性），实际 {problems!r}"


def with_replica(fn) -> None:
    """在一次性副本上跑 ``fn(root)``。"""
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "repo"
        replica(root)
        fn(root)


def append(path: Path, text: str) -> None:
    path.write_text(path.read_text(encoding="utf-8") + text, encoding="utf-8")


def substitute(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert old in text, f"副本里找不到待替换文本：{old!r}"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def substitute_all(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert old in text, f"副本里找不到待替换文本：{old!r}"
    path.write_text(text.replace(old, new), encoding="utf-8")


def main() -> int:
    # ── 基线：干净副本必须通过（否则后面所有断言都失去意义）────────────────
    def baseline(root: Path) -> None:
        expect_clean(run_gate(root), "基线")

    check("0. 干净副本 → 通过（基线）", lambda: with_replica(baseline))

    # ── 1. 后端源码隔离 ────────────────────────────────────────────────
    def backend_path_reference(root: Path) -> None:
        append(
            root / "homeos" / "backend" / "src" / "__init__.py",
            'SHARED_SRC = "homeos-store/backend/src"\n',
        )
        expect(run_gate(root), "homeos-store/backend/src", "后端路径引用")

    check("1a. 主应用源码写死商店源码路径 → 拦住", lambda: with_replica(backend_path_reference))

    def backend_import(root: Path) -> None:
        append(
            root / "homeos" / "backend" / "src" / "__init__.py",
            "import homeos_store.config\n",
        )
        expect(run_gate(root), "import：", "后端 import 兄弟包")

    check("1b. 主应用 import 商店的包 → 拦住", lambda: with_replica(backend_import))

    def store_relative_backend(root: Path) -> None:
        append(
            root / "homeos-store" / "backend" / "src" / "__init__.py",
            'APP_SRC = "../../homeos/backend/src/core"\n',
        )
        expect(run_gate(root), "homeos/backend", "商店引用主应用源码")

    check("1c. 商店源码相对路径指向主应用后端 → 拦住", lambda: with_replica(store_relative_backend))

    def backend_prose_is_fine(root: Path) -> None:
        append(
            root / "homeos" / "backend" / "src" / "__init__.py",
            'HINT = "请把 homeos-store/keys/local 下的同名公钥同步过来即可（含中文标点，不是路径）"\n',
        )
        expect_clean(run_gate(root), "后端说明文案")

    check("1d. 说明文案里提到商店路径 → 不误报（假阳性护栏）", lambda: with_replica(backend_prose_is_fine))

    def backend_docstring_is_fine(root: Path) -> None:
        (root / "homeos" / "backend" / "src" / "twin.py").write_text(
            '"""与 homeos-store/backend/src/core/file_lock.py 是同一实现的两个副本。"""\n',
            encoding="utf-8",
        )
        expect_clean(run_gate(root), "后端 docstring")

    check("1e. docstring 里说明与商店文件的孪生关系 → 不误报", lambda: with_replica(backend_docstring_is_fine))

    def backend_missing_dir(root: Path) -> None:
        shutil.rmtree(root / "homeos-store" / "backend" / "src")
        expect(run_gate(root), "不存在", "后端目录缺失")

    check("1f. 后端源码目录被删（遍历为空）→ 报错，而非静默通过", lambda: with_replica(backend_missing_dir))

    # ── 2. 前端源码隔离 ────────────────────────────────────────────────
    def frontend_relative_escape(root: Path) -> None:
        (root / "homeos" / "frontend" / "src" / "bad.ts").write_text(
            'import { x } from "../../../homeos-store/frontend/src/placeholder";\n',
            encoding="utf-8",
        )
        expect(run_gate(root), "相对导入直达兄弟项目源码", "前端相对逃逸")

    check("2a. 主应用前端相对导入商店前端源码 → 拦住", lambda: with_replica(frontend_relative_escape))

    def frontend_alias_scope(root: Path) -> None:
        (root / "homeos-store" / "frontend" / "src" / "bad.ts").write_text(
            'import { x } from "@homeos/store";\n',
            encoding="utf-8",
        )
        expect(run_gate(root), "非共享的 @homeos 作用域", "前端非共享作用域")

    check("2b. 商店引用非共享的 @homeos 作用域 → 拦住", lambda: with_replica(frontend_alias_scope))

    def frontend_config_path(root: Path) -> None:
        (root / "homeos" / "frontend" / "vite.config.ts").write_text(
            "const SIBLING = '../../homeos-store/frontend/src';\nexport default SIBLING;\n",
            encoding="utf-8",
        )
        expect(run_gate(root), "字符串里出现兄弟项目路径", "前端配置字符串")

    check("2c. 构建配置里写死兄弟项目路径字符串 → 拦住", lambda: with_replica(frontend_config_path))

    def frontend_comment_is_fine(root: Path) -> None:
        (root / "homeos" / "frontend" / "vite.config.ts").write_text(
            "// 授权商店在 homeos-store/frontend/vite.config.ts 里同样显式指定了 root。\n"
            "export default { root: __dirname };\n",
            encoding="utf-8",
        )
        expect_clean(run_gate(root), "前端注释提及")

    check("2d. 注释里提到商店配置路径 → 不误报（假阳性护栏）", lambda: with_replica(frontend_comment_is_fine))

    def frontend_shared_is_fine(root: Path) -> None:
        (root / "homeos-store" / "frontend" / "src" / "ok.ts").write_text(
            'import { SceneStage } from "@homeos/shared/components/SceneStage.vue";\n',
            encoding="utf-8",
        )
        expect_clean(run_gate(root), "共享包")

    check("2e. 走 @homeos/shared 的跨界导入 → 不误报", lambda: with_replica(frontend_shared_is_fine))

    # ── 3. 包依赖隔离 ──────────────────────────────────────────────────
    def package_dependency(root: Path) -> None:
        manifest = root / "homeos" / "package.json"
        import json

        data = json.loads(manifest.read_text(encoding="utf-8"))
        data.setdefault("dependencies", {})["homeos-store"] = "workspace:*"
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        expect(run_gate(root), "依赖了兄弟项目", "包依赖")

    check("3a. package.json 依赖兄弟项目 → 拦住", lambda: with_replica(package_dependency))

    def package_missing(root: Path) -> None:
        (root / "homeos-store" / "package.json").unlink()
        expect(run_gate(root), "package.json 不存在", "包清单缺失")

    check("3b. package.json 缺失 → 报错，而非静默通过", lambda: with_replica(package_missing))

    # ── 4. 镜像阶段隔离（P5 起：单构建阶段 + ARG PROJECT 选源）──────────────
    #
    # 合并阶段后，「app 镜像里只有 app 源码」这条保证从**结构**（两个同名阶段各装各的）
    # 挪到了**取值**（同一个阶段 + `--build-arg PROJECT`）。镜像层面无法自证取值对不对，
    # 所以这一组用例重点压两件事：源码不许写死项目名、PROJECT 的取值来源（ops/build.py
    # 的 PROJECTS）必须与 Dockerfile 的 case 逐条对得上。
    def docker_literal_source(root: Path) -> None:
        substitute(
            root / "Dockerfile",
            f"COPY {gate.BUILD_SOURCE_COPY} ./app",
            "COPY homeos-store/backend/src ./app",
        )
        expect(run_gate(root), "字面量", "构建阶段写死源码目录")

    check("4a. 源码 COPY 写死成某个项目（ARG 形同虚设）→ 拦住", lambda: with_replica(docker_literal_source))

    def docker_missing_build_copy(root: Path) -> None:
        substitute(root / "Dockerfile", f"COPY {gate.BUILD_SOURCE_COPY} ./app\n", "")
        expect(run_gate(root), "未 COPY", "构建阶段缺源")

    check("4b. 源码 COPY 整行被删 → 拦住", lambda: with_replica(docker_missing_build_copy))

    def docker_project_arg_default(root: Path) -> None:
        substitute(root / "Dockerfile", "ARG PROJECT\n", "ARG PROJECT=homeos\n")
        expect(run_gate(root), "带了默认值", "ARG PROJECT 有默认值")

    check("4c. ARG PROJECT 给了默认值（漏传不再失败）→ 拦住", lambda: with_replica(docker_project_arg_default))

    def docker_project_arg_removed(root: Path) -> None:
        substitute(root / "Dockerfile", "ARG PROJECT\n", "")
        expect(run_gate(root), "没有 `ARG PROJECT`", "ARG PROJECT 缺失")

    check("4d. ARG PROJECT 整行被删 → 拦住", lambda: with_replica(docker_project_arg_removed))

    def docker_case_branch_drift(root: Path) -> None:
        substitute(
            root / "Dockerfile",
            "homeos-store) start=store; banned=db ;;",
            "homeos2) start=store; banned=db ;;",
        )
        problems = run_gate(root)
        expect(problems, "与已知项目目录", "case 分支漂移")
        expect(problems, "不在", "case 分支漂移（表侧）")

    check("4e. case 里的项目名写错（两侧对不上）→ 拦住", lambda: with_replica(docker_case_branch_drift))

    def docker_case_branch_gutted(root: Path) -> None:
        substitute(root / "Dockerfile", "homeos) start=app; banned=migrations ;;", "homeos) ;;")
        expect(run_gate(root), "空体", "分支空体")

    check("4f. case 分支被挖空（只剩分支名）→ 拦住", lambda: with_replica(docker_case_branch_gutted))

    def docker_case_removed(root: Path) -> None:
        substitute(root / "Dockerfile", 'RUN case "$PROJECT" in \\\n', "RUN true \\\n")
        expect(run_gate(root), "出现 0 次", "case 块缺失")

    check("4g. case 整块被删 → 拦住（抠不到分支不得静默通过）", lambda: with_replica(docker_case_removed))

    def docker_build_script_swap(root: Path) -> None:
        substitute(
            root / gate.BUILD_SCRIPT,
            "'store': Project('store', 'homeos-store', 'homeos-store'",
            "'store': Project('store', 'homeos-store', 'homeos'",
        )
        expect(run_gate(root), "编出另一个项目的后端", "PROJECT 取值错位")

    check("4h. ops/build.py 把商店的 PROJECT 指到主应用目录 → 拦住", lambda: with_replica(docker_build_script_swap))

    def docker_build_script_missing_row(root: Path) -> None:
        substitute(
            root / gate.BUILD_SCRIPT,
            "    'store': Project('store', 'homeos-store', 'homeos-store', 'backend-export', 'store'),\n",
            "",
        )
        expect(run_gate(root), "没有项目 'store'", "项目表缺项")

    check("4i. ops/build.py 少了商店条目 → 拦住", lambda: with_replica(docker_build_script_missing_row))

    def docker_build_script_readable(root: Path) -> None:
        (root / gate.BUILD_SCRIPT).write_text("# 表被搬走了\n", encoding="utf-8")
        expect(run_gate(root), "读不到", "项目表解析失败")

    check("4j. 项目表改成非字面量 / 被搬走 → 报错，而非静默通过", lambda: with_replica(docker_build_script_readable))

    def docker_runtime_cross_from(root: Path) -> None:
        substitute(
            root / "Dockerfile",
            "RUN mkdir -p /app/image && chown homeos:homeos /app/image",
            "COPY --from=backend-build /app/ /app\n"
            "RUN mkdir -p /app/image && chown homeos:homeos /app/image",
        )
        expect(run_gate(root), "不得跨用构建阶段", "运行阶段跨用构建阶段")

    check("4k. app 运行阶段 COPY --from=backend-build → 拦住", lambda: with_replica(docker_runtime_cross_from))

    def docker_runtime_sibling_dist(root: Path) -> None:
        substitute(
            root / "Dockerfile",
            "COPY --chown=homeos:homeos dist/homeos/backend/${BACKEND_PLATFORM} /app",
            "COPY --chown=homeos:homeos dist/homeos-store/backend/${BACKEND_PLATFORM} /app",
        )
        expect(run_gate(root), "COPY 了兄弟项目的产物", "运行阶段串产物")

    check("4l. app 运行阶段装商店产物 → 拦住", lambda: with_replica(docker_runtime_sibling_dist))

    def docker_export_not_scratch(root: Path) -> None:
        substitute(root / "Dockerfile", "FROM scratch AS backend-export", "FROM base AS backend-export")
        expect(run_gate(root), "基础镜像不是 scratch", "导出阶段非 scratch")

    check("4m. 导出阶段改成 FROM base → 拦住（会把 rootfs 导出）", lambda: with_replica(docker_export_not_scratch))

    def docker_export_extra_copy(root: Path) -> None:
        substitute(
            root / "Dockerfile",
            "COPY --from=backend-build /app/ /\n",
            "COPY --from=backend-build /app/ /\nCOPY ops/caddy /etc/caddy\n",
        )
        expect(run_gate(root), "只允许", "导出阶段多拷一层")

    check("4n. 导出阶段多拷一层（不再是纯 /app）→ 拦住", lambda: with_replica(docker_export_extra_copy))

    def docker_stage_renamed(root: Path) -> None:
        substitute(root / "Dockerfile", "FROM base AS backend-build", "FROM base AS web-build")
        expect(run_gate(root), "找不到构建阶段", "阶段改名")

    check("4o. 构建阶段被改名（阶段表对不上）→ 拦住", lambda: with_replica(docker_stage_renamed))

    def docker_missing_file(root: Path) -> None:
        (root / "Dockerfile").unlink()
        expect(run_gate(root), "Dockerfile 不存在", "Dockerfile 缺失")

    check("4p. Dockerfile 缺失 → 报错，而非静默通过", lambda: with_replica(docker_missing_file))

    # ── 5. 共享 Python 包内联（P5 合并阶段后的形态）──────────────────────
    #
    # 这一组在 P3c 之前是「造出 packages/shared-py 再补上接线」；真源落地后那样写就成了
    # 空转（真实 Dockerfile 本来已接线，补/不补都一样）。故改为**撤回真实接线**：
    #   - 5a 拆掉构建阶段的共享包 COPY → 该报未内联；
    #   - 5b 副本照原样 → 必须干净（同时验证副本推导没漏文件）；
    #   - 5c 留着 COPY、把 find 断言里的 /app/homeos_shared 抹掉 → 该报产物断言未覆盖。
    # 合并阶段后只剩一个构建阶段，故 5a/5c 的期望条数从 2 收到 1 —— 这不是放宽判据：
    # 那一个阶段同时供两个镜像用（见门禁里 `for stage in (BUILD_STAGE,)` 的说明）。
    def shared_py_without_copy(root: Path) -> None:
        path = root / "Dockerfile"
        lines = path.read_text(encoding="utf-8").splitlines()
        kept = [
            line
            for line in lines
            if not (line.strip().startswith("COPY") and gate.SHARED_PY_SRC in line)
        ]
        assert len(kept) == len(lines) - 1, (
            f"期望副本里有 1 行共享包 COPY 可撤，实际撤掉 {len(lines) - len(kept)} 行"
        )
        path.write_text("\n".join(kept) + "\n", encoding="utf-8")
        problems = run_gate(root)
        expect(problems, "未 COPY packages/shared-py", "共享包未内联（构建阶段）")
        assert sum("未 COPY packages/shared-py" in m for m in problems) == 1, (
            f"构建阶段该报未内联，实际 {problems!r}"
        )

    check("5a. 撤掉构建阶段的共享包 COPY → 拦住", lambda: with_replica(shared_py_without_copy))

    def shared_py_wired(root: Path) -> None:
        expect_clean(run_gate(root), "共享包已内联")

    check("5b. 真实接线（COPY + find 断言齐全）→ 通过", lambda: with_replica(shared_py_wired))

    def shared_py_assertion_missing(root: Path) -> None:
        substitute_all(
            root / "Dockerfile",
            f" /app/{gate.SHARED_PY_PACKAGE} -type f",
            " -type f",
        )
        problems = run_gate(root)
        expect(problems, "断言未覆盖", "共享包产物断言")
        assert sum("断言未覆盖" in m for m in problems) == 1, (
            f"构建阶段的产物断言该报未覆盖，实际 {problems!r}"
        )

    check("5c. 内联了但 find 断言漏掉共享包 → 拦住", lambda: with_replica(shared_py_assertion_missing))

    # ── 6. 共享包边界：`packages/shared` 不得反向引用任一应用 ──────────────────
    #
    # 这一组补的是**依赖方向的另一半**：第 2 组只看两个应用的 frontend，从不看共享包自身。
    # 所以「共享包 import 应用的东西」此前没有任何门禁。
    def shared_boundary_clean(root: Path) -> None:
        expect_clean(run_gate(root), "共享包边界干净")

    check("6a. 干净的共享包（只自足）→ 不误报", lambda: with_replica(shared_boundary_clean))

    def shared_boundary_app_alias(root: Path) -> None:
        (root / gate.SHARED_TS_SRC / "src" / "bad.ts").write_text(
            "import { x } from '@/shared/utils/core/logger'\nexport const y = x\n",
            encoding="utf-8",
        )
        expect(run_gate(root), "应用内部别名", "共享包 import 应用别名")

    check("6b. 共享包 import 应用内部别名（`@/…`）→ 拦住", lambda: with_replica(shared_boundary_app_alias))

    def shared_boundary_relative_escape(root: Path) -> None:
        (root / gate.SHARED_TS_SRC / "src" / "bad.ts").write_text(
            "import { x } from '../../../homeos/frontend/src/thing'\nexport const y = x\n",
            encoding="utf-8",
        )
        expect(run_gate(root), "直达应用源码", "共享包相对逃逸到应用")

    check("6c. 共享包相对导入逃逸进应用 src → 拦住", lambda: with_replica(shared_boundary_relative_escape))

    def shared_boundary_manifest(root: Path) -> None:
        manifest = root / gate.SHARED_TS_SRC / "package.json"
        data = json.loads(manifest.read_text(encoding="utf-8"))
        data.setdefault("dependencies", {})[gate.APP_PROJECT] = "1.0.0"
        manifest.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        expect(run_gate(root), "依赖了应用", "共享包清单依赖应用")

    check("6d. 共享包 package.json 依赖应用 → 拦住", lambda: with_replica(shared_boundary_manifest))

    def shared_boundary_missing(root: Path) -> None:
        shutil.rmtree(root / gate.SHARED_TS_SRC / "src")
        expect(run_gate(root), "目录改名后本项会静默通过", "共享包 src 缺失")

    check("6e. 共享包 src 目录缺失 → 自身报错（而非静默通过）", lambda: with_replica(shared_boundary_missing))

    print()
    if failures:
        print(f"独立部署护栏自检未通过（{len(failures)}/{checked}）：")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"独立部署护栏自检全部通过（{checked} 项断言）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
