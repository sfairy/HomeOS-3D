"""应用版本号解析（包入口与 ``config`` 共用的叶子模块）。

为什么单独一个模块：``config.py`` 在函数里需要 ``load_app_version``，而 ``src/__init__``
导入 ``env`` → ``config``。函数如果写成 ``from . import load_app_version``，静态分析会看到
``__init__ → env → config → __init__`` 的环（``reportImportCycles``）。把这三段解析逻辑
下沉到不依赖任何 ``src.*`` 兄弟模块的叶子文件即可把这个环拆掉，两处都从这里导入。

模块内不 import 任何 ``src.*`` 兄弟模块（唯一的例外是函数内、可缺失的构建期
``_version``）—— 这是它能安全被 ``config`` 依赖的前提。
"""

from __future__ import annotations

import json
import os
from pathlib import Path


def _read_baked_version() -> str:
    """构建期烘进镜像的版本号（Dockerfile 生成 ``_version.py`` 后编译成扩展）。

    源码 / CI 运行时这个模块不存在，返回空串让调用方回落到 ``package.json``。
    """
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ""
    return str(baked).strip()


def _read_package_version() -> str:
    """仓库 ``package.json`` 的 ``version`` —— 源码运行时的权威源。"""
    here = Path(__file__).resolve()
    for candidate in (
        here.parents[3] / "package.json",  # 仓库根
        here.parents[2] / "package.json",  # homeos/
        here.parents[1] / "package.json",  # backend/
    ):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        version = payload.get("version") if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ""


def load_app_version() -> str:
    """解析对外暴露的应用版本号。

    优先级：
    1. ``HOMEOS_APP_VERSION`` 环境变量（部署显式注入）；
    2. 构建期烘入的 ``_version.__version__``；
    3. 邻近 ``VERSION`` 文件；
    4. 仓库 ``package.json`` 的 ``version``；
    5. ``"0.0.0"``。
    """
    override = os.getenv("HOMEOS_APP_VERSION", "").strip()
    if override:
        return override

    baked = _read_baked_version()
    if baked and baked != "0.0.0":
        return baked

    here = Path(__file__).resolve()
    for version_file in (here.parents[1] / "VERSION", here.parents[2] / "VERSION"):
        try:
            text = version_file.read_text(encoding="utf-8").strip()
            if text:
                return text
        except OSError:
            pass

    return _read_package_version() or "0.0.0"


__version__ = _read_baked_version() or _read_package_version() or "0.0.0"

__all__ = ["__version__", "load_app_version"]
