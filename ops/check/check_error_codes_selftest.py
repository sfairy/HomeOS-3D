#!/usr/bin/env python3
"""错误码门禁的自检：把合成副本真的改坏，确认 ``check_error_codes`` 会拦。

为什么需要它
------------
这道门禁是**解析型**的：它自己解析 ``API_ERROR`` 字面量、自己剥注释、自己按整词匹配。
解析型门禁的共同失效模式是**悄悄变瞎** —— 一旦「匹配不到就跳过」，它就会永远打印「通过」，
而真正的死码照样溜过去。所以本自检不复述判定逻辑（那只会得到第三份会漂移的副本），
而是造一棵迷你工作区，逐条确认该红时确实红：

    1. 干净副本（码有真实引用 / 注释引用 + 代码引用并存）→ 必须放行；
    2. 唯一的引用被删掉 → 报「零引用」；
    3. 只剩注释里的引用 → 仍报「零引用」（注释不是失败点）；
    4. 引用被包在更长的标识符里（``MY_<CODE>_FLAG``）→ 仍报「零引用」（整词判定）；
    5. 前端引用被删掉 → 报「零引用」（跨工程语料都要扫，不能只看后端）；
    6. 前缀表指向已删的码 → 报「已不存在」；
    7. 表里出现重复键 → 报「重复键」；
    8. 真源写成解析不出的形态 → 必须报解析失败，而不是「解析不到就放行」。

用法（只用标准库，无需 venv）::

    python3 ops/check/check_error_codes_selftest.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.check import check_error_codes as gate
from ops.check._selftest_harness import Selftest

# 记账/收尾统一走公共骨架（夹具与注入手法留在本文件），调用点写法不变。
_SELFTEST = Selftest("错误码门禁自检")
failures = _SELFTEST.failures

#: 合成码名（刻意不出现在真源里）：``ALIVE`` 被两处代码引用，``COMMENT_ONLY`` 只被商店前端
#: 按码分派、后端仅在一句注释里提到它（用来验证「注释不算引用」）。
ALIVE = "SYNTH_ALPHA_FAILED"
COMMENT_ONLY = "SYNTH_BETA_REJECTED"

DICT_SOURCE = (
    "API_ERROR: dict[str, str | _F] = {\n"
    f'    "{ALIVE}": "合成码：有真实失败点",\n'
    f'    "{COMMENT_ONLY}": "合成码：只被前端分派",\n'
    "}\n"
    "\n"
    "_MANUAL_DYNAMIC_PREFIXES: list[tuple[str, str]] = [\n"
    f'    ("区域 ", "{ALIVE}"),\n'
    "]\n"
)

BACKEND_SOURCE = (
    "from platform.core.errors import api_error\n"
    "\n"
    "\n"
    "def boom():\n"
    f'    raise api_error("{ALIVE}")\n'
    "\n"
    "\n"
    f"# 旧实现还抛过 {COMMENT_ONLY}\n"
    "def legacy():\n"
    "    pass\n"
)

FRONTEND_SOURCE = (
    "import { apiErrorCode } from './error'\n"
    "\n"
    f"export const CASES = ['{ALIVE}', '{COMMENT_ONLY}'] as const\n"
)


def write_workspace(root: Path, *, dict_source: str = DICT_SOURCE) -> None:
    """按真实相对路径写一份迷你工作区（后端两文件 + 商店前端一文件）。"""
    files = {
        gate.ERRORS_PY_REL: dict_source,
        Path("homeos/backend/src/api/demo.py"): BACKEND_SOURCE,
        Path("homeos-store/frontend/src/shared/api/error.ts"): FRONTEND_SOURCE,
    }
    for rel, text in files.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")


def substitute(root: Path, rel: Path, old: str, new: str) -> None:
    path = root / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise AssertionError(f"副本里找不到待改内容 {old!r}（合成样本或门禁写法变了？）")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def case(mutate, fragment: str | None) -> None:
    """建干净副本 → 注入漂移 → 跑门禁（``ROOT`` 临时指向副本）。"""
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
        write_workspace(root)
        mutate(root)
        original = gate.ROOT
        gate.ROOT = root
        try:
            problems = gate.collect_problems()
        finally:
            gate.ROOT = original
        if fragment is None:
            if problems:
                raise AssertionError(f"干净副本本应放行，却报：{'；'.join(problems)}")
            return
        joined = "；".join(problems)
        if not problems:
            raise AssertionError(f"注入漂移后门禁仍然放行（期望命中「{fragment}」）")
        if fragment not in joined:
            raise AssertionError(f"报错未命中「{fragment}」，实际：{joined}")


def run(name: str, fn) -> None:
    """跑一项检查并打印一行；异常一律算失败，不让自检半路炸掉。"""
    _SELFTEST.case(name, fn)


def main() -> int:
    demo = Path("homeos/backend/src/api/demo.py")
    store_api = Path("homeos-store/frontend/src/shared/api/error.ts")
    # 待改内容从合成样本里抠出来，不手抄前缀文案 / 注释措辞：改写样本时自检不会悄悄测了个旧的形状。
    comment_line = next(line for line in BACKEND_SOURCE.splitlines() if COMMENT_ONLY in line)
    manual_line = next(
        line for line in DICT_SOURCE.splitlines() if ALIVE in line and line.lstrip().startswith("(")
    )
    ghost_manual_line = '(    "区域 ", "SYNTH_GHOST_CODE"),'
    boom_line = f'    raise api_error("{ALIVE}")'

    def baseline(root: Path) -> None:
        pass

    def store_only(root: Path) -> None:
        """删掉后端引用、只留注释：商店前端那份还在 → 必须放行（证明商店语料参与扫描）。"""
        substitute(root, demo, boom_line, "    return None")

    def backend_only(root: Path) -> None:
        """删掉商店前端引用：后端那份还在 → 必须放行（证明后端语料参与扫描）。"""
        substitute(root, store_api, f"'{ALIVE}', ", "")

    def comment_only(root: Path) -> None:
        """两处引用都退化成注释 → 必须报零引用（注释不是失败点）。"""
        substitute(root, demo, boom_line, "    return None")
        substitute(root, store_api, f"'{ALIVE}', ", "")

    def all_references_removed(root: Path) -> None:
        """两处引用彻底删除 → 必须报零引用。"""
        substitute(root, demo, boom_line, "    return None")
        substitute(root, store_api, f"'{ALIVE}', ", "")
        substitute(root, demo, comment_line, "")

    def nested_identifier(root: Path) -> None:
        """引用被包在更长标识符里 → 不算整词引用，必须报零引用。"""
        substitute(root, demo, f'"{ALIVE}"', f'"MY_{ALIVE}_FLAG"')
        substitute(root, store_api, f"'{ALIVE}'", f"'MY_{ALIVE}_FLAG'")

    def stale_manual_prefix(root: Path) -> None:
        """前缀表指向已删除的码 → 必须报「已不存在」。"""
        substitute(root, gate.ERRORS_PY_REL, manual_line, ghost_manual_line)

    def duplicate_key(root: Path) -> None:
        substitute(
            root,
            gate.ERRORS_PY_REL,
            old=f'    "{ALIVE}": "合成码：有真实失败点",',
            new=f'    "{ALIVE}": "合成码：有真实失败点",\n    "{ALIVE}": "重复键",',
        )

    def unparsable_dict(root: Path) -> None:
        """真源写成解析不出的形态 → 必须报解析失败，而不是「解析不到就放行」。"""
        path = root / gate.ERRORS_PY_REL
        text = path.read_text(encoding="utf-8")
        if gate._DICT_HEAD not in text:
            raise AssertionError(f"合成样本里找不到 {gate._DICT_HEAD!r}（门禁口径变了？）")
        path.write_text(text.replace(gate._DICT_HEAD, "API_ERROR_TABLE: dict", 1), encoding="utf-8")

    print("错误码门禁自检（合成副本）：")
    run("干净副本（含注释引用）：放行", lambda: case(baseline, None))
    run("只剩商店前端引用：放行（商店语料参与扫描）", lambda: case(store_only, None))
    run("只剩后端引用：放行（后端语料参与扫描）", lambda: case(backend_only, None))
    run("两处引用都退化成注释：报零引用", lambda: case(comment_only, "零引用"))
    run("引用被彻底删除：报零引用", lambda: case(all_references_removed, "零引用"))
    run("引用被更长标识符包住：报零引用", lambda: case(nested_identifier, "零引用"))
    run("前缀表指向已删码：报已不存在", lambda: case(stale_manual_prefix, "已不存在"))
    run("表内重复键：报重复键", lambda: case(duplicate_key, "重复键"))
    run("真源写成解析不出的形态：报解析失败", lambda: case(unparsable_dict, "解析失败"))

    return _SELFTEST.report()


if __name__ == "__main__":
    raise SystemExit(main())
