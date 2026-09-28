"""HomeOS 授权商店与授权服务器（独立服务，默认端口 8802）。"""

from __future__ import annotations

import json
from pathlib import Path

__all__ = ["__version__"]


def _read_baked_version() -> str:
    """构建期烘进镜像的版本号（Dockerfile 生成 ``src/_version.py`` 后编译成扩展）。

    源码运行时这个模块不存在，返回空串让调用方回落到 ``package.json``。
    """
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ""
    return str(baked).strip()


def _read_package_version() -> str:
    """仓库根 ``package.json`` 的 ``version`` —— 版本号的唯一权威源。

    源码布局是 ``homeos-store/backend/src/__init__.py``，所以按候选路径逐个探测；
    镜像里 ``__file__`` 是 ``/app/src/__init__*.so``，这两条都落空，此时用烘入值。
    """
    here = Path(__file__).resolve()
    for candidate in (here.parents[3] / "package.json", here.parents[2] / "package.json"):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        version = payload.get("version") if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ""


__version__ = _read_baked_version() or _read_package_version() or "0.0.0"
