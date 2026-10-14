#!/usr/bin/env python3
"""`@deprecated` 转发桩门禁的自检：**用合成 fixture 反证门禁会红**。

门禁最容易的假绿方式是「解析不到就跳过」：目标路径拼错、桩链识别失效、登记表读空 ——
三种情况下门禁都会打印「全部通过」。所以这里在临时目录里造一棵最小源码树，逐条注入
断链 / 桩链 / 未登记 / 过期 / 登记不一致 / 自指，断言门禁**确实报红且指名道姓**；
再用同一批 fixture 断言「修好之后会转绿」，避免把门禁写成永远红的。

每个用例都造**独立的一棵树**（上一用例留下的桩会污染下一用例的「未登记」判定，
这是本文件第一版真踩到的坑）。

用法：``python3 ops/check/check_deprecated_stubs_selftest.py``
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GATE = HERE / "check_deprecated_stubs.py"

# 公共骨架按包路径导入：本文件自己用 importlib 直接加载门禁（见 `load_gate`），
# 但记账层是个正常模块，走包导入才与其它自检一致 —— 所以先把仓库根放上 sys.path。
REPO_ROOT = HERE.parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ops.check._selftest_harness import Selftest


def load_gate():
    spec = importlib.util.spec_from_file_location("check_deprecated_stubs", GATE)
    # 断言必须在用之前：`spec_from_file_location` 的返回是 `ModuleSpec | None`，
    # 先断言再使用，下面的 `module_from_spec` / `exec_module` 才收窄得掉 None。
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GATE_MODULE = load_gate()

STUB = "/** @deprecated Prefer `./real`. */\nexport * from './real';\n"
REAL = "export const real = 1;\n"


def entry(path: str, target: str = "./real", **overrides) -> dict:
    base = {
        "path": path,
        "target": target,
        "reason": "自检 fixture",
        "since": "2026-01-01",
        "retire_by": "2099-01-01",
        "status": "active",
    }
    base.update(overrides)
    return base


def scenario(files: dict[str, str], stubs: list[dict], *extra: str) -> tuple[int, str, str]:
    """造一棵最小源码树（含 `real.ts`）、写登记表、跑门禁，返回 (退出码, stdout, stderr)。"""
    workdir = Path(tempfile.mkdtemp(prefix="deprecated-stubs-"))
    try:
        root = workdir / "src"
        root.mkdir()
        (root / "real.ts").write_text(REAL, encoding="utf-8")
        for rel, text in files.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        registry = workdir / "registry.json"
        registry.write_text(json.dumps({"stubs": stubs}, ensure_ascii=False), encoding="utf-8")
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = GATE_MODULE.main(["--root", str(root), "--registry", str(registry), *extra])
        return code, out.getvalue(), err.getvalue()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def scenario_missing_root() -> tuple[int, str, str]:
    """扫描根不存在：目录改名后门禁不得静默变绿。"""
    workdir = Path(tempfile.mkdtemp(prefix="deprecated-stubs-"))
    try:
        registry = workdir / "registry.json"
        registry.write_text(json.dumps({"stubs": []}), encoding="utf-8")
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = GATE_MODULE.main(
                ["--root", str(workdir / "nope"), "--registry", str(registry)]
            )
        return code, out.getvalue(), err.getvalue()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def scenario_missing_registry(root_files: dict[str, str]) -> tuple[int, str, str]:
    """登记表缺失。"""
    workdir = Path(tempfile.mkdtemp(prefix="deprecated-stubs-"))
    try:
        root = workdir / "src"
        root.mkdir()
        (root / "real.ts").write_text(REAL, encoding="utf-8")
        for rel, text in root_files.items():
            (root / rel).write_text(text, encoding="utf-8")
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = GATE_MODULE.main(
                ["--root", str(root), "--registry", str(workdir / "absent.json")]
            )
        return code, out.getvalue(), err.getvalue()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> int:
    # 记账/收尾统一走公共骨架（夹具与注入手法留在本文件），调用点写法不变。
    st = Selftest(
        "`@deprecated` 转发桩门禁自检",
        note="（断链 / 自指 / 桩链 / 未登记 / 死登记 / 过期 / 别名解析 / 登记表缺失）",
    )
    expect = st.expect

    # ① 干净树 + 空登记：绿。
    code, out, err = scenario({}, [])
    expect(code == 0, f"① 无桩无登记应当通过（{err.strip()}）")
    expect("0 个桩" in out, "① 应报告桩数量")

    # ② 已登记且目标可解析：绿。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts")])
    expect(code == 0, f"② 已登记的可解析桩应当通过（{err.strip()}）")

    # ③ 未登记：红，且提示去登记。
    code, _, err = scenario({"a.ts": STUB}, [])
    expect(code != 0, "③ 未登记的桩必须报红")
    expect("退役登记里没有" in err, "③ 应提示在退役登记里补条目")

    # ④ 目标断链：红。
    broken = "/** @deprecated x */\nexport * from './missing';\n"
    code, _, err = scenario({"broken.ts": broken}, [entry("broken.ts", "./missing")])
    expect(code != 0, "④ 目标不存在必须报红")
    expect("解析不到文件" in err, "④ 应指出断链")

    # ⑤ 自指：红。
    self_stub = "/** @deprecated x */\nexport * from './self';\n"
    code, _, err = scenario({"self.ts": self_stub}, [entry("self.ts", "./self")])
    expect(code != 0, "⑤ 自指桩必须报红")
    expect("自指" in err, "⑤ 应指出自指")

    # ⑥ 桩链：红。
    chain_b = "/** @deprecated x */\nexport * from './real';\n"
    chain_a = "/** @deprecated x */\nexport * from './chain-b';\n"
    code, _, err = scenario(
        {"chain-a.ts": chain_a, "chain-b.ts": chain_b},
        [entry("chain-a.ts", "./chain-b"), entry("chain-b.ts")],
    )
    expect(code != 0, "⑥ 桩链必须报红")
    expect("桩链" in err, "⑥ 应指出禁止桩链")

    # ⑦ 登记 target 与实物不一致：红。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts", "./somewhere-else")])
    expect(code != 0, "⑦ target 与实物不一致必须报红")
    expect("不一致" in err, "⑦ 应指出登记与实物不符")

    # ⑧ 死登记（登记了但磁盘没有）：红。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts"), entry("ghost.ts")])
    expect(code != 0, "⑧ 死登记必须报红")
    expect("已没有这个桩" in err, "⑧ 应提示退役后同步删登记")

    # ⑨ 临时桩过期：红（用 --today 覆盖时钟，不依赖真实日期）。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts", retire_by="2026-01-02")], "--today", "2026-10-13")
    expect(code != 0, "⑨ 过期的临时桩必须报红")
    expect("已过" in err, "⑨ 应指出退役期限已过")

    # ⑩ retained 免期限：绿。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts", retire_by=None, status="retained")])
    expect(code == 0, f"⑩ retained 桩无需退役期限（{err.strip()}）")

    # ⑪ active 缺 retire_by：红（登记自洽性）。
    code, _, err = scenario({"a.ts": STUB}, [entry("a.ts", retire_by=None)])
    expect(code != 0, "⑪ active 桩缺 retire_by 必须报红")
    expect("必须写" in err, "⑪ 应要求写退役期限")

    # ⑫ 别名解析：`@/x` 要能落到 root 下（别名表写错会让所有别名桩静默变绿）。
    alias_stub = "/** @deprecated x */\nexport * from '@/real';\n"
    code, _, err = scenario({"alias-stub.ts": alias_stub}, [entry("alias-stub.ts", "@/real")])
    expect(code == 0, f"⑫ `@/` 别名应可解析（{err.strip()}）")

    # ⑬ `--list` 模式恒为 0：它是排障入口，不是门禁。
    code, out, _ = scenario({"alias-stub.ts": alias_stub}, [entry("alias-stub.ts", "@/real")], "--list")
    expect(code == 0, "⑬ --list 应当恒成功")
    expect("alias-stub.ts" in out, "⑬ --list 应列出桩路径")

    # ⑭ 扫描根不存在：红。
    code, _, err = scenario_missing_root()
    expect(code != 0, "⑭ 扫描根不存在必须报红")
    expect("扫描根不存在" in err, "⑭ 应指出根目录不存在")

    # ⑮ 登记表缺失：红。
    code, _, err = scenario_missing_registry({"a.ts": STUB})
    expect(code != 0, "⑮ 登记表缺失必须报红")
    expect("退役登记表缺失" in err, "⑮ 应指出登记表缺失")

    return st.report()


if __name__ == "__main__":
    sys.exit(main())
