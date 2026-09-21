"""静态文件的缓存戳：把文件的 mtime（纳秒）当作 ``?v=`` 的值。

适用面是**服务端渲染时拼出来的**链接（`backend/http/page_shell.py` 的配色表、
interaction3d 的舞台样式表）。这些 URL 之间没有「必须同值」的要求 —— 同值的约束来自
前端 ESM：同一个模块被两处按不同 ``?v=`` 引用会被当成两个模块、各留一份模块级状态。
那类资源由 ``tools/bump_static_cache_versions.mjs`` 写进源码字面量（全站一个戳）。

服务端这条路径改用 mtime 之后，Python 源码里不再出现 ``?v=YYMMDDHHMM`` 字面量，
「改完静态资源忘了跑 bump」这个静默失效点也就少了一类：文件一变，URL 跟着变。

用 mtime 而不是自增计数：多进程 / 重启后计数会从头开始，而 mtime 单调，
浏览器不会把一份旧响应当成新的。
"""
from __future__ import annotations

from pathlib import Path


def file_revision(path: Path) -> str:
    """取文件的版本号字符串；文件不存在或读不到时回 ``'0'``（不抛异常）。

    调用点都在渲染响应的主路径上：这里读不到文件（部署期换目录、权限问题）不该
    把页面整个打成 500，让浏览器照常取资源即可，因此失败只退化成固定值。
    """
    try:
        return str(path.stat().st_mtime_ns)
    except OSError:
        return '0'
