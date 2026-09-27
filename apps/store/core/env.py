"""极简 ``.env`` 加载器（仅标准库，不引入 python-dotenv）。
"""

from __future__ import annotations

import os
from pathlib import Path

#: apps/store/core/ 的上三级即项目根目录
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"

_loaded = False


def _parse(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, separator, value = line.partition("=")
        if not separator:
            continue
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        # 去掉成对的引号，保留引号内的空格
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        else:
            # 行尾注释只在未加引号时生效
            value = value.split(" #", 1)[0].strip()
        values[key] = value
    return values


def load_dotenv(path: Path | None = None, *, override: bool = False) -> dict[str, str]:
    """加载 ``.env``，返回实际注入的键值对。
    """
    global _loaded
    target = path or ENV_FILE
    if not override and path is None and _loaded:
        return {}
    if not target.is_file():
        return {}
    try:
        values = _parse(target.read_text(encoding="utf-8"))
    except OSError:
        return {}

    applied: dict[str, str] = {}
    for key, value in values.items():
        if not override and key in os.environ:
            continue
        os.environ[key] = value
        applied[key] = value
    if path is None:
        _loaded = True
    return applied
