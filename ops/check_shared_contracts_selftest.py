#!/usr/bin/env python3
"""容器启动契约门禁的自检：给 ``check_shared_contracts.py`` 注入各类漂移，确认它真的会拦。

为什么需要它
------------
``check_container_boot`` 是在源码态**推导**容器事实（Dockerfile 的 ``COPY`` 包名、启动器声明的
入口串、源码里的符号定义）再做对账。这类「解析型门禁」有个共同的失效模式：**它自己悄悄变瞎** ——
启动器换了写法、正则匹配不到时，只要选择「匹配不到就跳过」，门禁就会永远打印「通过」，
而真正的漂移照样能溜过去，且从输出上完全看不出区别。

所以本自检不复述门禁的判定逻辑（那只会得到第三份会漂移的副本），而是**真的把一份副本改坏**，
逐条确认每个分支都会报错、且报的是对的那一条：

    1. 镜像层次被改深（``./app`` → ``./backend/app``）—— 即主应用 ``to_app`` 之前的老布局；
    2. ``COPY`` 行被删 → 「未映射进镜像」（与上一条刻意区分：修法不同）；
    3. 启动器文件缺失；
    4. 启动器声明的工厂名与源码不符；
    5. 入口模块在源码里不存在；
    6. 启动器包名与镜像映射不一致；
    7. 两个后端的镜像包名不一致；
    8. 启动器换成门禁识别不了的写法 → 必须**报解析失败**，而不是静默放行。

副本只含门禁真正会读的文件，清单从黄金文件 ``containerBoot`` 推导（不手工维护，否则加一个
后端就要记得改这里）；全程在 ``tempfile`` 里操作，不碰真实工作区。

用法
----
从仓库根执行（只用标准库，无需 venv）：

    python3 ops/check_shared_contracts_selftest.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops import check_shared_contracts as gate

GOLDEN = ROOT / "ops" / "contracts" / "shared-twins.json"

failures: list[str] = []
checked = 0


def check(name: str, fn) -> None:
    """跑一项检查并打印一行 OK / FAIL；任何异常都算失败，不让脚本半路炸掉。"""
    global checked
    checked += 1
    try:
        fn()
    except AssertionError as error:
        failures.append(f"{name} —— {error}")
        print(f"  FAIL {name} —— {error}")
    except Exception as error:
        # 未预期异常同样算失败，但要看清类型：它通常意味着环境问题而非判定口径。
        failures.append(f"{name} —— {type(error).__name__}: {error}")
        print(f"  FAIL {name} —— {type(error).__name__}: {error}")
    else:
        print(f"  OK   {name}")


def _load_spec() -> dict:
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    spec = golden.get("containerBoot")
    if not spec:
        raise AssertionError("黄金文件里没有 containerBoot：门禁会直接跳过容器检查")
    return spec


def _entry(spec: dict, source: str) -> dict:
    for entry in spec["entries"]:
        if entry["source"] == source:
            return entry
    raise AssertionError(f"黄金文件 containerBoot 里没有 {source}")


def _module_file(entry: dict, module: str) -> Path:
    """镜像包名 ``pkg`` 对应源码目录 ``src/``，故 ``pkg.mod`` ↔ ``src/mod.py``。"""
    parts = module.split(".")[1:]
    rel = Path(*parts).with_suffix(".py") if parts else Path("__init__.py")
    return Path(entry["source"]) / rel


def build_replica(dest: Path, spec: dict) -> None:
    """把门禁会读到的文件按原相对路径复制进 ``dest``（清单从 spec 推导）。"""
    items = [Path(spec["dockerfile"])]
    for entry in spec["entries"]:
        launcher = Path(entry["launcher"])
        module, _ = gate.boot_binding(ROOT / launcher, entry["bind"])
        items += [launcher, _module_file(entry, module)]
    for rel in items:
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text((ROOT / rel).read_text(encoding="utf-8"), encoding="utf-8")


def substitute(path: Path, old: str, new: str) -> None:
    """在副本里做一次替换；找不到待改内容即失败 —— 说明启动器/Dockerfile 写法变了。"""
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise AssertionError(f"副本里找不到待改内容 {old!r}（门禁或启动器写法变了？）")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def expect_problem(problems: list[str], fragment: str) -> None:
    """要求门禁报错且命中指定片段。"""
    if not problems:
        raise AssertionError(f"注入漂移后门禁仍然放行（期望命中「{fragment}」）")
    joined = "；".join(problems)
    if fragment not in joined:
        raise AssertionError(f"报错未命中「{fragment}」，实际：{joined}")


def main() -> int:
    spec = _load_spec()
    app = _entry(spec, "homeos/backend/src")
    store = _entry(spec, "homeos-store/backend/src")

    # 待改内容全部从真实文件推导，避免把「包名 / 工厂名」再抄一遍。
    app_module, app_symbol = gate.boot_binding(ROOT / app["launcher"], app["bind"])
    store_module, _ = gate.boot_binding(ROOT / store["launcher"], store["bind"])
    app_pkg = app_module.split(".")[0]
    store_pkg = store_module.split(".")[0]
    app_target = f'"{app_module}:{app_symbol}"'
    app_copy = f"COPY {app['source']} ./{app_pkg}"
    store_copy = f"COPY {store['source']} ./{store_pkg}"
    store_import = f"import {store_module} as"

    def case(mutate) -> None:
        """建一份干净副本 → 注入漂移 → 跑门禁（ROOT 临时指向副本）。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_replica(dest, spec)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                mutate(dest)
                problems = gate.check_container_boot(spec)
                expect_problem(problems, mutate.fragment)
            finally:
                gate.ROOT = original_root

    def baseline() -> None:
        """真实仓库配置本应自洽：这一步同时验证副本推导没漏文件。"""
        with tempfile.TemporaryDirectory() as raw:
            dest = Path(raw)
            build_replica(dest, spec)
            original_root = gate.ROOT
            gate.ROOT = dest
            try:
                problems = gate.check_container_boot(spec)
            finally:
                gate.ROOT = original_root
            if problems:
                raise AssertionError(f"真实配置本应自洽，却报：{'；'.join(problems)}")

    def deep_nesting(dest: Path) -> None:
        # 记忆点：这正是主应用 to_app 之前的布局，漏改启动器时源码态测试全绿。
        substitute(dest / spec["dockerfile"], app_copy, f"COPY {app['source']} ./backend/{app_pkg}")

    deep_nesting.fragment = "不是单层包名"

    def copy_missing(dest: Path) -> None:
        path = dest / spec["dockerfile"]
        text = path.read_text(encoding="utf-8")
        path.write_text(
            "\n".join(line for line in text.splitlines() if line.strip() != app_copy) + "\n",
            encoding="utf-8",
        )

    copy_missing.fragment = "未映射进镜像"

    def launcher_missing(dest: Path) -> None:
        (dest / store["launcher"]).unlink()

    launcher_missing.fragment = "启动器缺失"

    def wrong_symbol(dest: Path) -> None:
        substitute(dest / app["launcher"], app_target, f'"{app_module}:{app_symbol}_typo"')

    wrong_symbol.fragment = "里没有定义"

    def missing_module(dest: Path) -> None:
        substitute(dest / app["launcher"], app_target, f'"app.ghost_module:{app_symbol}"')

    missing_module.fragment = "在源码里找不到"

    def launcher_mismatch(dest: Path) -> None:
        substitute(dest / store["launcher"], store_import, "import ghost_pkg.run as")

    launcher_mismatch.fragment = "两边不同名"

    def packages_diverge(dest: Path) -> None:
        substitute(dest / spec["dockerfile"], store_copy, f"COPY {store['source']} ./renamed")
        substitute(dest / store["launcher"], store_import, "import renamed.run as")

    packages_diverge.fragment = "包名不一致"

    def unparsable(dest: Path) -> None:
        # 改成门禁正则认不出的写法：必须报解析失败，绝不能「匹配不到就跳过」。
        substitute(dest / app["launcher"], app_target, f'"{app_module}"')

    unparsable.fragment = "解析失败"

    print("容器启动契约门禁自检：")
    check("真实配置自洽（副本推导无遗漏）", baseline)
    check("镜像层次被改深：报层次漂移", lambda: case(deep_nesting))
    check("COPY 行缺失：报未映射进镜像", lambda: case(copy_missing))
    check("启动器缺失：报启动器缺失", lambda: case(launcher_missing))
    check("工厂名与源码不符：报符号未定义", lambda: case(wrong_symbol))
    check("入口模块不存在：报源码里找不到", lambda: case(missing_module))
    check("启动器包名与镜像不符：报两边不同名", lambda: case(launcher_mismatch))
    check("两后端镜像包名不一致：报包名不一致", lambda: case(packages_diverge))
    check("启动器换写法：报解析失败而非放行", lambda: case(unparsable))

    print()
    if failures:
        print(f"容器启动契约门禁自检失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"容器启动契约门禁自检全部通过（{checked} 项）：注入的漂移均被拦下。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
