#!/usr/bin/env python3
"""变更文件的 Python 格式门禁：只守新改的代码，不要求一次性重排 299 个存量文件。

为什么不是 `ruff format --check .`
------------------------------------
实测 homeos 299/403、store 89/95 个文件未按 ruff format 排版。一次全量重排会制造
数万行纯格式 diff，淹没真正的改动；而完全不设门禁又会让新代码继续漂移。

这里的口径是"新增文件强制格式化"：
- 取当前分支相对基线（`HOMEOS_FORMAT_BASE`，默认 `HEAD^`）**新增**的 `.py`，
  加上工作区未跟踪的 `.py`（git diff 看不到新文件，必须单独列）；
- 只对这些文件跑 `ruff format --check`；
- **修改过的存量文件不检**：它们本来就没按 ruff format 排版，一次重排会制造数万行
  纯格式 diff，应该由独立的重排提交处理（见 action-plan P2-01），不能混进功能改动；
- 基线不可用（首次提交/浅克隆）时显式 SKIP，不静默当作通过。

CI 的 static job 已把 checkout 设为 fetch-depth: 2，保证 `HEAD^` 可解析。

用法：
    node ops/lib/py.mjs ops/checks/check_python_format.py
    HOMEOS_FORMAT_BASE=origin/main node ops/lib/py.mjs ops/checks/check_python_format.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASE = "HEAD^"
#: 用绝对路径调 git，避免 S607（部分可执行路径）；找不到时退回 "git" 由 subprocess 报错。
GIT = shutil.which("git") or "git"


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


def _git_paths(args: list[str]) -> list[str]:
    result = subprocess.run(
        [GIT, *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _added_python_files(base: str) -> list[str] | None:
    probe = subprocess.run(
        [GIT, "rev-parse", "--verify", "--quiet", base],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if probe.returncode != 0:
        print(f"[format] SKIP：基线 {base} 不可解析（首次提交或浅克隆）")
        return None
    tracked = _git_paths(["diff", "--name-only", "--diff-filter=A", base, "--", "*.py"])
    untracked = _git_paths(["ls-files", "--others", "--exclude-standard", "--", "*.py"])
    files = sorted({*tracked, *untracked})
    return [path for path in files if (REPO_ROOT / path).is_file()]


def main() -> int:
    base = os.environ.get("HOMEOS_FORMAT_BASE", "").strip() or DEFAULT_BASE
    files = _added_python_files(base)
    if files is None:
        return 0
    if not files:
        print(f"[format] 相对 {base} 没有新增 Python 文件")
        return 0
    print(f"[format] 相对 {base} 检查 {len(files)} 个新增 Python 文件")
    result = subprocess.run(
        [_ruff(), "format", "--check", "--", *files],
        cwd=REPO_ROOT,
        check=False,
    )
    if result.returncode != 0:
        print(
            "[format] 上述文件未格式化。只改这些文件：ruff format -- <files>；存量文件不在本门禁范围内。",
            file=sys.stderr,
        )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
