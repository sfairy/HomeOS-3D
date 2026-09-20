"""极简 ``.env`` 加载器（仅标准库，不引入 python-dotenv）。

把项目根目录下 ``.env`` 里的键值对注入 ``os.environ``，用于存放 SMTP 授权码、
支付宝私钥这类**不该进版本库**的本地配置。

优先级刻意保持"真实环境变量 > .env"：已存在的环境变量不会被覆盖，
所以 ``start.py`` 注入的本地默认值不会被 ``.env`` 抢掉。
"""

from __future__ import annotations

import os
from pathlib import Path

#: store/core/ 的上两级即项目根目录
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

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

    ``override=False``（默认）表示已有环境变量优先——这是部署时的正确行为，
    容器/CI 里的真实变量应该压过本地文件。
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
