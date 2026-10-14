#!/usr/bin/env python3
"""后端分层门禁的自检：**用合成源码树反证门禁会红**。

分层门禁最容易的假绿方式有三种，本文件逐个压住：

1. **解析不到就跳过**（相对导入的向上层数算错 → 解析出的模块名不在层表里 → 静默放行）；
2. **只看顶层包名**（``from ...domains.notification.stats import x`` 被当成包内 import）；
3. **注释也算依赖边**（注释里写一句 ``from ..api.ha import y`` 就报红 → 门禁变噪音，
   然后被人加进忽略清单）。

所以这里在临时目录里造最小源码树，逐条注入越界边，断言门禁**确实报红且指名道姓**；
再用同一批 fixture 断言「修好之后会转绿」。每个用例独立一棵树。

用法：``python3 ops/check/check_layers_selftest.py``
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GATE = HERE / "check_layers.py"


def load_gate():
    spec = importlib.util.spec_from_file_location("check_layers", GATE)
    # 断言必须在用之前：`spec_from_file_location` 的返回是 `ModuleSpec | None`，
    # 先断言再使用，下面的 `module_from_spec` / `exec_module` 才收窄得掉 None。
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GATE_MODULE = load_gate()

#: 一棵「全部合法」的最小树：每层只 import 它白名单里的层。
CLEAN_TREE: dict[str, str] = {
    "platform/core/models.py": "import json\n",
    "platform/core/deps.py": "from ...config import Settings\n",
    "realtime/gateway.py": "from ..platform.core.models import Thing\n",
    "panel/schema.py": "from ..platform.core.models import Thing\n",
    "domains/ha/service.py": "from ...platform.core.models import Thing\nfrom ...config import Settings\n",
    "modules/interaction3d/api.py": "from ...domains.ha.service import run\n",
    "api/ha.py": "from ..domains.ha.service import run\nfrom ..platform.core.models import Thing\n",
    "bootstrap/router_registry.py": "from ..api.ha import router\nfrom ..domains.ha.service import run\n",
}


def scenario(files: dict[str, str], *extra: str) -> tuple[int, str, str]:
    """造一棵最小源码树并跑门禁，返回 ``(退出码, stdout, stderr)``。"""
    workdir = Path(tempfile.mkdtemp(prefix="layers-"))
    try:
        root = workdir / "src"
        root.mkdir()
        for rel, text in files.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = GATE_MODULE.main(["--root", str(root), *extra])
        return code, out.getvalue(), err.getvalue()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def scenario_missing_root() -> tuple[int, str, str]:
    """源码根不存在：目录改名后门禁不得静默变绿。"""
    workdir = Path(tempfile.mkdtemp(prefix="layers-"))
    try:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = GATE_MODULE.main(["--root", str(workdir / "nope")])
        return code, out.getvalue(), err.getvalue()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main() -> int:
    failures: list[str] = []
    checks = 0

    def expect(condition: bool, label: str) -> None:
        nonlocal checks
        checks += 1
        if not condition:
            failures.append(label)

    def case(label: str, files: dict[str, str], *, needle: str, must_fail: bool = True) -> None:
        """在干净树上叠一条边，断言红/绿与提示文案。"""
        merged = {**CLEAN_TREE, **files}
        code, out, err = scenario(merged)
        if must_fail:
            expect(code != 0, f"{label}：必须报红（{out.strip()}{err.strip()}）")
            expect(needle in err, f"{label}：应在 stderr 里指名 `{needle}`（实际：{err.strip()}）")
        else:
            expect(code == 0, f"{label}：应当通过（{err.strip()}）")

    # ① 干净树：绿（否则说明白名单口径写歪了，后面全是噪音）。
    code, out, err = scenario(CLEAN_TREE)
    expect(code == 0, f"① 合法依赖方向应当通过（{err.strip()}）")
    expect("7 层" in out, "① 应报告层数")

    # ② 域层反向依赖入口层：红（本轮修掉的那类边）。
    case("② domains → api", {"domains/bad.py": "from ..api.ha import call_service\n"}, needle="domains → api")
    # ③ 模块层复用 api 路由：红（`modules/interaction3d/*` 就是两层深，故 `...api`）。
    case(
        "③ modules → api",
        {"modules/interaction3d/bad.py": "from ...api.ha import call_service\n"},
        needle="modules → api",
    )
    # ④ 域层依赖实时层：红。
    case("④ domains → realtime", {"domains/bad.py": "from ..realtime.gateway import x\n"}, needle="domains → realtime")
    # ⑤ 域层依赖编辑器层：红。
    case("⑤ domains → panel", {"domains/bad.py": "from ..panel.schema import x\n"}, needle="domains → panel")
    # ⑥ 平台叶子反向依赖域层：红。
    case("⑥ platform → domains", {"platform/bad.py": "from ..domains.ha.service import run\n"}, needle="platform → domains")
    # ⑦ 入口层依赖组装根：红（组装根只许向上接线，不许被 import）。
    case("⑦ api → bootstrap", {"api/bad.py": "from ..bootstrap.lifespan import x\n"}, needle="api → bootstrap")
    # ⑧ 实时层依赖域层：红（本轮 realtime→domains.notification.stats 就是这条）。
    case("⑧ realtime → domains", {"realtime/bad.py": "from ..domains.notification.stats import x\n"}, needle="realtime → domains")

    # ⑨ 深层相对导入必须解析到首段（`from ....api` 从 domains/a/b/c.py 出发 = 顶层 api）。
    case(
        "⑨ 深层向上解析",
        {"domains/a/b/c.py": "from ....api.ha import x\n"},
        needle="domains → api",
    )
    # ⑨b 点号数超过包深度（越出 backend/src）：红，不得静默跳过。
    case(
        "⑨b 点号数越界",
        {"domains/bad.py": "from ...api.ha import x\n"},
        needle="越出 backend/src",
    )
    # ⑩ 根模块 `dependencies` 不给域层用（HTTP 依赖注入不得渗进业务层）。
    case(
        "⑩ domains → dependencies",
        {"domains/bad.py": "from ..dependencies import DatabaseSession\n"},
        needle="根模块 `dependencies`",
    )
    # ⑪ 平台叶子同样不许 import `dependencies`。
    case(
        "⑪ platform → dependencies",
        {"platform/bad.py": "from ..dependencies import DatabaseSession\n"},
        needle="根模块 `dependencies`",
    )
    # ⑫ 未登记顶层包：红（新增一层必须是显式结构决策）。
    case("⑫ 未登记顶层包", {"newlayer/x.py": "import json\n"}, needle="未登记顶层包")

    # ⑬ 注释里的 import 不算依赖边（否则门禁会因散文而红，最终被人绕过）。
    case(
        "⑬ 注释不算依赖边",
        {"domains/ok.py": "# 曾经：from ..api.ha import call_service\nimport json\n"},
        needle="",
        must_fail=False,
    )
    # ⑭ 同层内互相 import：绿（`api.ha` import `api.go2rtc` 是正常组织，不是跨层）。
    case(
        "⑭ 同层 import",
        {"api/other.py": "from .ha import router\n"},
        needle="",
        must_fail=False,
    )
    # ⑮ 模块层 import 域层与平台层：绿（这是它应有的能力；模块比域层深一层，故 3 个点）。
    case(
        "⑮ modules → domains/platform",
        {
            "modules/inner/ok.py": (
                "from ...domains.ha.service import run\nfrom ...platform.core.models import Thing\n"
            )
        },
        needle="",
        must_fail=False,
    )

    # ⑯ `--list` 模式恒为 0：排障入口，不是门禁。
    workdir = Path(tempfile.mkdtemp(prefix="layers-"))
    try:
        root = workdir / "src"
        root.mkdir()
        (root / "domains").mkdir()
        (root / "domains" / "bad.py").write_text("from ..api.ha import x\n", encoding="utf-8")
        list_out, list_err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(list_out), contextlib.redirect_stderr(list_err):
            code = GATE_MODULE.main(["--root", str(root), "--list"])
        expect(code == 0, f"⑯ --list 应当恒成功（{list_err.getvalue().strip()}）")
        expect("domains" in list_out.getvalue(), "⑯ --list 应列出跨层边")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    # ⑰ 源码根不存在：红。
    code, _, err = scenario_missing_root()
    expect(code != 0, "⑰ 源码根不存在必须报红")
    expect("源码根不存在" in err, "⑰ 应指出根目录不存在")

    if failures:
        print("✗ 后端分层门禁自检失败：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(
        f"✓ 后端分层门禁自检通过：{checks} 项断言"
        "（反向依赖 / 根模块越权 / 未登记层 / 深度解析 / 注释误报 / 同层放行）"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
