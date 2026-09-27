"""静态文件的缓存戳：把文件的 mtime（纳秒）当作 ``?v=`` 的值。
"""
from __future__ import annotations

from pathlib import Path


def file_revision(path: Path) -> str:
    """取文件的版本号字符串；文件不存在或读不到时回 ``'0'``（不抛异常）。
    """
    try:
        return str(path.stat().st_mtime_ns)
    except OSError:
        return '0'
