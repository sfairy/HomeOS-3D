"""HomeOS 授权商店与授权服务器（独立服务，默认端口 8802）。

与主应用共用的两个叶子模块（``logging_noise`` / ``core.file_lock``）**不在本包内**：它们在
``packages/shared-py/homeos_shared``，由本包导入时挂好 ``sys.path``（见下）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

__all__ = ["__version__"]


def _register_shared_python_root() -> Path | None:
    """源码态把 ``packages/shared-py`` 挂上 ``sys.path``，让 ``import homeos_shared`` 可用。

    镜像态**不做也不该做**：构建阶段已把 ``homeos_shared`` 内联进 ``/app``（见 Dockerfile 的
    ``COPY packages/shared-py/homeos_shared ./homeos_shared``），``PYTHONPATH=/app`` 已经让它
    可解析。判据是「上溯祖先目录里有没有 ``packages/shared-py/homeos_shared/__init__.py``」——
    镜像里 ``__file__`` 是 ``/app/app/__init__*.so``，一路查到 ``/`` 都落空，自然无害跳过。

    为什么放在包入口而不是各启动脚本里：仓库里有二十来处脚本 / 迁移入口 / 门禁各自往
    ``sys.path`` 插后端目录（``ops/{check_schema,check_database,license_keys}.py``、
    两个 ``migrations/env.py``、``*/scripts/*_smoke.py`` …），逐个补一行必然漏；而它们**都**要
    ``import src.*``，所以包入口这一次注册就全覆盖了，将来新增脚本也不必再记得这件事。

    与主应用 ``src/__init__.py`` 里的同名函数是刻意重复的引导代码：它必须在
    ``homeos_shared`` 可导入**之前**就存在，所以没法反过来从共享包里取。
    """
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "shared-py"
        if (candidate / "homeos_shared" / "__init__.py").is_file():
            if str(candidate) not in sys.path:
                sys.path.append(str(candidate))
            return candidate
    return None


_register_shared_python_root()


def _read_baked_version() -> str:
    """构建期烘进镜像的版本号（Dockerfile 生成 ``app/_version.py`` 后编译成扩展）。

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
    镜像里 ``__file__`` 是 ``/app/app/__init__*.so``，这两条都落空，此时用烘入值。
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
