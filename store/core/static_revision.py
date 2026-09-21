"""静态文件的缓存戳：把文件的 mtime（纳秒）当作 ``?v=`` 的值。

主应用有一份同名实现（``backend/core/static_revision.py``），这里**刻意不复用**：
商店与主应用是两个独立部署的项目、各自只 `import` 自己的包（主 README 的
「商店与授权服务器」一节写明两者不互相 import）。

适用面是**服务端渲染时拼出来的**链接（模拟收银台、支付宝回跳页里的
``/store-static/scene/*.css``）。商店模板（``store.html`` / ``admin.html`` / ``setup.html``）
里那些 ``?v=`` 字面量由 ``tools/bump_static_cache_versions.mjs`` 统一改写，全站同值；
而 Python 里拼出来的 URL 之间没有「必须同值」的要求，用文件 mtime 就不必再让任何人
记得同步这行字面量 —— 静态资源一改，URL 跟着变。
"""
from __future__ import annotations

from pathlib import Path


def file_revision(path: Path) -> str:
    """取文件的版本号字符串；文件不存在或读不到时回 ``'0'``（不抛异常）。

    调用点都在渲染响应的主路径上：这里读不到文件不该把整个页面打成 500，
    让浏览器照常取资源即可，因此失败只退化成固定值。
    """
    try:
        return str(path.stat().st_mtime_ns)
    except OSError:
        return '0'
