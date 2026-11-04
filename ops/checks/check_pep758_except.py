#!/usr/bin/env python3
"""PEP 758 无括号多异常捕获的守卫（只读）。

为什么需要它
------------
``ruff.toml`` 的 ``target-version = "py314"``，于是 ``ruff format`` 会把 ``except (A, B):``
**改写成** ``except A, B:``（PEP 758）。语法在 CPython 3.14+ 合法，但这个仓库的后端
源码要交给 Cython 3.3.0 编译成 ``.so``，而 Cython 还没实现 PEP 758，会把它按 Python 2 的
``except A as B:`` 解析：

- 两个异常名：**编译通过，语义悄悄变了** —— 只捕获 ``A``，并把异常绑到名为 ``B`` 的
  局部变量上。``gate:infra`` 的 ``check:cython`` 看不见这种「成功但错误」；
- 三个以上异常名：直接 ``Expected ':', found ','``，构建期失败（这正是 2026-11-04
  ``check:cython`` 报 ``studio3d/cleanup.py`` 的原因）。

所以只有一种写法是对的：``except (A, B):  # fmt: skip``。``# fmt: skip`` 不是装饰 ——
去掉它，下一次 ``ruff format`` 就会把括号删掉，而 diff 只是「少了两个括号」。

判定方式
--------
用 ``ast`` 找 ``ExceptHandler``，其 ``type`` 是 ``Tuple`` 且源码片段不以 ``(`` 开头即违规。
不猜文本、不做正则，因此 ``except (A):``、``except (A,):``、``except A, B:``、
跨行写法都能正确区分。

扫描范围
--------
与 ``ops/ci/cython_check.py`` 完全同源（``IMAGE_SOURCE_ROOTS``）：被 Cython 编译的才
有这条约束，没被编译的脚本不强求。``__pycache__`` 跳过。

用法：
    node ops/lib/py.mjs ops/checks/check_pep758_except.py          # 门禁（有违规则退出 1）
    python3 ops/checks/check_pep758_except.py --json               # 机器可读
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
# `python3 ops/checks/check_pep758_except.py` 时 sys.path[0] 是 ops/checks，下面按仓库根导入 ops.*
sys.path.insert(0, str(REPO_ROOT))

from ops.ci.image_imports import IMAGE_SOURCE_ROOTS

#: 违规时的统一改法说明。
_HINT = "except (A, B):  # fmt: skip —— 括号不能省，Cython 3.3.0 会把无括号形式解析成 `except A as B:`"


def sources(root: Path) -> list[Path]:
    """``IMAGE_SOURCE_ROOTS`` 下的全部 .py（与 check:cython 扫的是同一批文件）。"""
    found: list[Path] = []
    for relative in IMAGE_SOURCE_ROOTS:
        target = root / relative
        if target.is_file():
            found.append(target)
        elif target.is_dir():
            found.extend(sorted(target.rglob("*.py")))
    return [path for path in found if "__pycache__" not in path.parts]


def violations(path: Path, root: Path) -> list[dict]:
    """一个文件里所有「无括号多异常捕获」：``[{file, line, except}]``。"""
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except OSError, SyntaxError, ValueError:
        # 读不出来 / 语法错误由 py_compile、ruff、check:cython 各自负责，这里不重复报。
        return []
    result: list[dict] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        handler = node.type
        if not isinstance(handler, ast.Tuple) or not handler.elts:
            continue
        segment = ast.get_source_segment(source, handler) or ""
        if segment.lstrip().startswith("("):
            continue
        names = [ast.unparse(item) for item in handler.elts]
        # 夹具仓库可能不在本仓库之内（--root /tmp/fixture），此时报绝对路径。
        try:
            shown = str(path.relative_to(root))
        except ValueError:
            shown = str(path)
        result.append({"file": shown, "line": node.lineno, "except": ", ".join(names)})
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="PEP 758 无括号 except 守卫")
    parser.add_argument("--root", default=str(REPO_ROOT), help="扫描根（默认仓库根，夹具测试用）")
    parser.add_argument("--json", action="store_true", help="机器可读输出")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    targets = sources(root)
    if not targets:
        raise SystemExit("没有扫到任何源码 —— IMAGE_SOURCE_ROOTS 与 Dockerfile 的 COPY 已经错位")

    problems = [item for path in targets for item in violations(path, root)]
    if args.json:
        print(json.dumps({"scanned": len(targets), "violations": problems}, ensure_ascii=False, indent=2))
    elif problems:
        print(f"发现 {len(problems)} 处无括号多异常捕获（Cython 3.3.0 会误解析）：")
        for item in problems:
            print(f"  - {item['file']}:{item['line']}  except {item['except']}")
        print(f"改法：{_HINT}")
    else:
        print(f"PEP 758 无括号 except：OK（{len(targets)} 个模块）")
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
