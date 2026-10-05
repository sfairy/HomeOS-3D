"""进程启动期装载 ``.env``（与 Nest ``import 'dotenv/config'`` 对齐）。

查找顺序：``backend/.env`` → 仓库根 ``.env``。使用 ``override=False``，
已存在的环境变量优先，避免覆盖容器 / 编排注入的值；缺失 python-dotenv 时静默跳过。
"""

from __future__ import annotations

from pathlib import Path

#: ``backend/``（本文件位于 ``backend/src/env.py``）
BACKEND_ROOT = Path(__file__).resolve().parent.parent
#: 仓库根 ``homeos/``（``backend/`` 的上一级）
REPO_ROOT = BACKEND_ROOT.parent


def load_env_files() -> None:
    """按序加载存在的 ``.env`` 文件；不覆盖已存在的环境变量。"""
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - 仅在最小依赖环境触发
        return
    for candidate in (BACKEND_ROOT / ".env", REPO_ROOT / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)
