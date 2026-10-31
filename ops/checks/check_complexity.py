#!/usr/bin/env python3
"""复杂度棘轮：允许存量热点，但不允许新增或继续变复杂。

背景
----
`ruff.toml` 在 2026-10 的降噪里关闭了 C901 / PLR0912 / PLR0915，于是
`lint:py` 全绿并不代表没有复杂度问题：实测 homeos 231 条、homeos-store 23 条。
直接全量开启会让门禁长期红着，最后被无视；这里改成年轮：把当前每一条
(文件, 函数, 规则) 的最大实测值写进基线，之后只能持平或更低。

口径
----
- 只扫两个后端的运行期源码（`homeos/backend/src`、`homeos-store/backend/src`）；
- ruff 用与 `lint:py` 相同的版本（仓库根 `.venv-store` 或 PATH）；
- 新违规 = 基线里没有的 key；恶化 = 值比基线大。两者都失败；
- 减少不失败，用 `--write` 收紧基线。

用法：
    node ops/lib/py.mjs ops/checks/check_complexity.py --check
    node ops/lib/py.mjs ops/checks/check_complexity.py --write
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASELINE = Path(__file__).with_name("complexity-baseline.json")
TARGETS = (
    REPO_ROOT / "homeos" / "backend" / "src",
    REPO_ROOT / "homeos-store" / "backend" / "src",
)
RULES = "C901,PLR0912,PLR0915"
METRIC_RE = re.compile(r"\((\d+) >")


def _ruff() -> str:
    override = os.environ.get("RUFF", "").strip()
    if override:
        return override
    found = shutil.which("ruff")
    if found:
        return found
    venv = REPO_ROOT / ".venv-store" / "bin" / "ruff"
    if venv.is_file():
        return str(venv)
    raise SystemExit("找不到 ruff。装到 .venv-store，或用 RUFF=/path/to/ruff 指定。")


def _run_ruff() -> list[dict[str, object]]:
    command = [
        _ruff(),
        "check",
        *[str(target) for target in TARGETS],
        "--select",
        RULES,
        "--output-format=json",
        "--no-cache",
    ]
    result = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    if result.returncode not in (0, 1):
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    return json.loads(result.stdout or "[]")


def _function_span(path: Path, row: int) -> str:
    """返回包含 row 的最内层函数名；静态文件解析失败时用 `<module>`。"""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except OSError, SyntaxError:
        return "<module>"
    best: tuple[int, str] | None = None
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        end = node.end_lineno or node.lineno
        if node.lineno <= row <= end:
            span = end - node.lineno
            if best is None or span < best[0]:
                best = (span, node.name)
    return best[1] if best else "<module>"


def _metric(message: str) -> int:
    match = METRIC_RE.search(message)
    return int(match.group(1)) if match else 0


@dataclass(frozen=True)
class ComplexityFinding:
    file: str
    function: str
    rule: str
    value: int

    def key(self) -> str:
        return f"{self.file}:{self.function}:{self.rule}"


def collect() -> list[ComplexityFinding]:
    findings: list[ComplexityFinding] = []
    for item in _run_ruff():
        filename = Path(str(item["filename"])).resolve()
        row = int(item["location"]["row"])  # type: ignore[index]
        relative = filename.relative_to(REPO_ROOT).as_posix()
        findings.append(
            ComplexityFinding(
                file=relative,
                function=_function_span(filename, row),
                rule=str(item["code"]),
                value=_metric(str(item["message"])),
            )
        )
    return sorted(findings, key=lambda finding: finding.key())


def _load(path: Path) -> dict[str, int]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {str(key): int(value) for key, value in payload.get("violations", {}).items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="用当前结果收紧基线")
    mode.add_argument("--check", action="store_true", help="与基线比对（默认）")
    args = parser.parse_args()

    findings = collect()
    current: dict[str, int] = {}
    for finding in findings:
        key = finding.key()
        current[key] = max(current.get(key, 0), finding.value)
    print(f"complexity violations={len(findings)} keys={len(current)}")

    if args.write:
        payload = {
            "description": "两个后端的 C901/PLR0912/PLR0915 存量棘轮；只能持平或下降",
            "rules": RULES,
            "violations": dict(sorted(current.items())),
        }
        args.baseline.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"baseline written: {args.baseline}")
        return 0

    baseline = _load(args.baseline)
    new = sorted(set(current) - set(baseline))
    worse = sorted(key for key in set(current) & set(baseline) if current[key] > baseline[key])
    improved = sorted(key for key in set(baseline) & set(current) if current[key] < baseline[key])
    print(f"new={len(new)} worse={len(worse)} improved={len(improved)}")
    for key in new:
        print(f"NEW    {key} = {current[key]}", file=sys.stderr)
    for key in worse:
        print(f"WORSE  {key} = {current[key]} (baseline {baseline[key]})", file=sys.stderr)
    if new or worse:
        print("复杂度新增/恶化：拆函数或显式 --write 说明原因。", file=sys.stderr)
        return 1
    print("complexity ratchet ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
