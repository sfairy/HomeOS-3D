"""棘轮脚本的公共骨架：按文件计数、基线比对、`--update` / `--json` / `--verbose`。

为什么抽出这一层
----------------
`check_error_contract.py`、`check_background_tasks.py` 这类「按文件计数、只许下降」的
门禁有 40 行左右完全相同的骨架：读基线、逐文件比、总数兜底、两种输出格式、更新基线。
每加一条新棘轮就抄一遍，结果是**门禁代码自己成了重复代码**（jscpd 会如实报出来）。

口径约定
--------
- 基线结构固定为 ``{description, rules, total, files: {路径: 计数}}``；
- 判定只看「变多」：逐文件超基线 → 失败；总数超基线 → 失败；减少不失败（但应跑
  ``--update`` 把基线压低，否则后来的人可以「先加三处、再删三处」把新增洗白）。

用法
----
    from ops.lib.ratchet import run_file_count_ratchet

    if __name__ == "__main__":
        raise SystemExit(
            run_file_count_ratchet(
                name="check_xxx",
                description="...",
                rules="...",
                baseline_path=BASELINE_PATH,
                scan=scan,          # -> (per_file: dict[str, list[int]], total: int)
                hint="新增时请改用 ...",
            )
        )
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

ScanResult = tuple[dict[str, list[int]], int]


def resolve_ruff(repo_root: Path) -> str:
    """定位 ruff：`RUFF` 环境变量 → PATH → 共享 venv。

    为什么放在共享库：`check_python_format` 与 `check_guards` 都需要它，两处各抄一份
    10 行只会在 `check:duplicates` 里变成克隆。优先级顺序也是仓内约定（先尊重显式覆盖，
    再让 CI 用 PATH 里的，最后才回落到本机 venv）。
    """
    override = os.environ.get("RUFF", "").strip()
    if override:
        return override
    found = shutil.which("ruff")
    if found:
        return found
    venv = repo_root / ".venv-store" / "bin" / "ruff"
    if venv.is_file():
        return str(venv)
    raise SystemExit("找不到 ruff。装到 .venv-store，或用 RUFF=/path/to/ruff 指定。")


#: 扫描时跳过的目录：产物 / 缓存 / 虚拟环境。与 `check_silent_except` 等既有脚本口径一致。
SKIP_DIRS = frozenset({"__pycache__", "node_modules", ".venv-store", "dist", "backups"})

#: 进程级 AST / 文本缓存。
#:
#: 为什么放在模块级而不是让每个脚本各带一个：批量入口（`run_backend_checks.py`）会在同一个
#: 解释器里依次跑十几条检查，它们扫的是**同一批 694 个 .py**。此前每条都把整棵树
#: `ast.parse` 一遍，单条 1.3–3.9s 全花在重复解析上；共享缓存后第二批起直接命中。
#:
#: 键是规范化后的绝对路径。一次门禁运行内源文件不会变化，因此不需要 mtime 失效。
_TREE_CACHE: dict[str, ast.AST] = {}
_TEXT_CACHE: dict[str, str] = {}


def read_text(path: Path | str) -> str:
    """读 UTF-8 文本（进程内缓存）。"""
    key = str(Path(path).resolve())
    cached = _TEXT_CACHE.get(key)
    if cached is not None:
        return cached
    value = Path(path).read_text(encoding="utf-8")
    _TEXT_CACHE[key] = value
    return value


def parse_tree(path: Path | str) -> ast.AST:
    """`ast.parse` 的进程级缓存版本。

    注意：`filename` 仍取真实路径，语法错误信息不受影响；调用方不应修改返回的树
    （多个检查共用同一份 AST，改写会让后一条检查看到被污染的节点）。
    """
    resolved = Path(path).resolve()
    key = str(resolved)
    cached = _TREE_CACHE.get(key)
    if cached is not None:
        return cached
    tree = ast.parse(read_text(resolved), filename=key)
    _TREE_CACHE[key] = tree
    return tree


def clear_parse_cache() -> None:
    """清空缓存：只在需要「改文件后再检查」的进程里使用（例如突变测试）。"""
    _TREE_CACHE.clear()
    _TEXT_CACHE.clear()


def iter_python_files(roots: list[Path], *, skip_dirs: frozenset[str] = SKIP_DIRS):
    """按路径顺序产出待扫描的 ``*.py``（跳过产物目录）。

    两个棘轮（错误契约 / 后台任务）此前各写了一遍同样的 rglob + 目录过滤，
    jscpd 把它算成跨文件的重复块 —— 门禁代码自己重复是最没说服力的形态。
    """
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.py")):
            if any(part in skip_dirs for part in path.parts):
                continue
            yield path


def run_file_count_ratchet(
    *,
    name: str,
    description: str,
    rules: str,
    baseline_path: Path,
    scan: Callable[[], ScanResult],
    hint: str = "",
    unit: str = "处",
    argv: list[str] | None = None,
) -> int:
    """跑一次棘轮判定。

    ``argv`` 显式传入是为了**可测**：默认读 ``sys.argv`` 会让单元测试里的 ``-v`` 被
    ``argparse`` 当成未知参数并以 ``SystemExit(2)`` 退出 —— 库函数不该读全局状态。
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--update", action="store_true", help="重写基线（只该在数字下降时跑）")
    parser.add_argument("--verbose", action="store_true", help="打印超基线位置")
    parser.add_argument("--json", action="store_true", help="机器可读")
    args = parser.parse_args(argv)

    per_file, total = scan()

    if args.update:
        baseline_path.write_text(
            json.dumps(
                {
                    "description": description,
                    "rules": rules,
                    "total": total,
                    "files": {path: len(lines) for path, lines in sorted(per_file.items())},
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"{name}: 基线已更新（total={total}，files={len(per_file)}）")
        return 0

    baseline_files: dict[str, int] = {}
    baseline_total = 0
    if baseline_path.is_file():
        payload = json.loads(baseline_path.read_text(encoding="utf-8"))
        baseline_files = {key: int(value) for key, value in (payload.get("files") or {}).items()}
        baseline_total = int(payload.get("total") or 0)

    problems: list[str] = []
    for path, lines in sorted(per_file.items()):
        allowed = baseline_files.get(path, 0)
        if len(lines) > allowed:
            where = f" 行 {lines}" if args.verbose else ""
            problems.append(f"{path}: {len(lines)} {unit}（基线 {allowed}）{where}")
    if total > baseline_total:
        problems.append(f"总数 {total} {unit} > 基线 {baseline_total}")

    if args.json:
        print(
            json.dumps(
                {"total": total, "baselineTotal": baseline_total, "files": len(per_file), "violations": problems},
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"{name}: {total} {unit}（基线 {baseline_total}），涉及 {len(per_file)} 个文件")
        for problem in problems:
            print(f"  ✗ {problem}")

    if problems:
        print(f"{name}: {hint or '新增了受管项，请改为受管写法。'}", file=sys.stderr)
        return 1
    print(f"{name}: 0 violation(s)")
    return 0
