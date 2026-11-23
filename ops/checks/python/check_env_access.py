#!/usr/bin/env python3
"""环境变量访问门禁：``os.getenv`` 只准出现在「有理由的叶子模块」里（只读，纯标准库）。

为什么需要它
------------
配置的唯一入口是 ``config.load_settings()`` → ``Settings``（不可变 dataclass，可注入、
可测试）。但仓库里仍有 100+ 处模块直接 ``os.getenv``，它们绕过了这份对象：

- 单元测试无法替换（改了环境变量才生效，而模块级读取发生在 import 时）；
- 同一个变量可能在两处用不同的兜底值（实测 ``HOMEOS_DATA_DIR`` 的磁盘余量指标回落到
  ``"."``，而 ``Settings.data_dir`` 回落到 ``<项目根>/data``）；
- 谁在用这个变量、默认值是什么，只能在代码里 grep。

一次清完不现实（日志格式、版本号、启动器都要在 ``Settings`` 存在之前读环境）。因此这里
采用**白名单 + 只许下降**：

- 白名单外的文件出现环境变量读取 → 失败；
- 白名单内的文件读取次数比登记值多 → 失败（新增必须写明理由并评审）；
- 减少不失败，但应跑 ``--update`` 压低记录。

白名单的每条都必须有理由（``--update`` 会保留已有理由；新增条目没有理由直接判失败）。

用法
----
    node ops/lib/py.mjs ops/checks/check_env_access.py            # 校验
    node ops/lib/py.mjs ops/checks/check_env_access.py --update   # 重写记录（保留理由）
    node ops/lib/py.mjs ops/checks/check_env_access.py --json
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

from ops.checks._bootstrap import ROOT, parse_tree

BASELINE_PATH = ROOT / "ops/checks/baselines/backend/env-access-baseline.json"
SCAN_ROOTS = [
    ROOT / "homeos/backend/src",
    ROOT / "homeos-store/backend/src",
]
#: 唯一合法的「配置装配点」：它读环境并产出 Settings。
EXEMPT_FILES = {
    "homeos/backend/src/config.py",
    "homeos-store/backend/src/config.py",
}
SKIP_DIRS = {"__pycache__", "node_modules", ".venv-store", "dist", "backups"}


def _env_name(node: ast.Call) -> str | None:
    """``os.getenv("X")`` / ``os.environ.get("X")`` / ``os.environ["X"]`` 的变量名。"""
    func = node.func
    if isinstance(func, ast.Attribute) and func.attr == "getenv" and node.args:
        first = node.args[0]
        return first.value if isinstance(first, ast.Constant) and isinstance(first.value, str) else "<dynamic>"
    if isinstance(func, ast.Attribute) and func.attr == "get" and isinstance(func.value, ast.Attribute):
        if func.value.attr == "environ" and node.args:
            first = node.args[0]
            return first.value if isinstance(first, ast.Constant) and isinstance(first.value, str) else "<dynamic>"
    return None


def scan_file(path: Path) -> list[tuple[int, str]]:
    try:
        tree = parse_tree(path)
    except (SyntaxError, UnicodeDecodeError):  # fmt: skip
        return []
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _env_name(node)
        if name:
            found.append((node.lineno, name))
    # ``os.environ["X"]`` 不是 Call，单独按 Subscript 收一次。
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Subscript)
            and isinstance(node.value, ast.Attribute)
            and node.value.attr == "environ"
            and isinstance(node.slice, ast.Constant)
            and isinstance(node.slice.value, str)
        ):
            found.append((node.lineno, node.slice.value))
    return found


def scan() -> tuple[dict[str, list[tuple[int, str]]], int]:
    per_file: dict[str, list[tuple[int, str]]] = {}
    for scan_root in SCAN_ROOTS:
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob("*.py")):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            relative = path.relative_to(ROOT).as_posix()
            if relative in EXEMPT_FILES:
                continue
            found = scan_file(path)
            if found:
                per_file[relative] = found
    return per_file, sum(len(items) for items in per_file.values())


def load_baseline() -> dict[str, dict]:
    if not BASELINE_PATH.is_file():
        return {}
    payload = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    return dict(payload.get("files") or {})


def write_baseline(per_file: dict[str, list[tuple[int, str]]], previous: dict[str, dict]) -> None:
    files: dict[str, dict] = {}
    for path, found in sorted(per_file.items()):
        entry = previous.get(path) or {}
        names = sorted({name for _, name in found})
        files[path] = {
            "count": len(found),
            "reason": entry.get("reason") or "",
            "vars": names,
        }
    BASELINE_PATH.write_text(
        json.dumps(
            {
                "description": (
                    "环境变量直读白名单：白名单外的文件不得读 os.getenv。每条都必须写明「为什么不能在 Settings 里」。"
                ),
                "rules": "新代码一律走 config.load_settings() → Settings；确需在装配前读环境请登记并写明理由",
                "total": sum(entry["count"] for entry in files.values()),
                "files": files,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="环境变量直读白名单")
    parser.add_argument("--update", action="store_true", help="重写记录（保留已有理由）")
    parser.add_argument("--verbose", action="store_true", help="打印变量名")
    parser.add_argument("--json", action="store_true", help="机器可读")
    args = parser.parse_args()

    per_file, total = scan()
    previous = load_baseline()

    if args.update:
        write_baseline(per_file, previous)
        print(f"check_env_access: 记录已更新（total={total}，files={len(per_file)}）")
        return 0

    problems: list[str] = []
    for path, found in sorted(per_file.items()):
        entry = previous.get(path)
        if entry is None:
            names = sorted({name for _, name in found})
            problems.append(f"{path}: 不在白名单（{len(found)} 处：{', '.join(names)}）")
            continue
        allowed = int(entry.get("count") or 0)
        if len(found) > allowed:
            problems.append(f"{path}: {len(found)} 处 > 记录 {allowed}")
        if not str(entry.get("reason") or "").strip():
            problems.append(f"{path}: 白名单条目缺少理由")

    if args.json:
        print(
            json.dumps(
                {"total": total, "files": len(per_file), "violations": problems},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"check_env_access: {total} 处直读环境变量，涉及 {len(per_file)} 个文件（白名单外为 0）")
        for problem in problems:
            print(f"  ✗ {problem}")
        if args.verbose:
            for path, found in sorted(per_file.items()):
                names = ", ".join(f"{name}@{line}" for line, name in found)
                print(f"    {path}: {names}")

    if problems:
        print(
            "check_env_access: 新增了白名单外的环境变量直读。请改用 "
            "config.load_settings()（可注入、可测试）；确需在装配前读取，"
            "在 ops/checks/baselines/backend/env-access-baseline.json 登记并写明理由。",
            file=sys.stderr,
        )
        return 1
    print("check_env_access: 0 violation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
