"""用构建期的资源版本给「后端拼出来的 URL」补 ``?v=``。

背景：前端产物里，只有 Vite 打包出来的 chunk 自带内容哈希（``static/assets/<name>-<hash>.js``），
URL 变了内容才变，缓存天然安全。但还有一批**稳定 URL** —— 3D 舞台的 ``core/stage.css``、
各路由首屏样式表、交互运行时等 —— 它们的 URL 不随内容变化，后端每次把它们拼进 HTML 时，
浏览器都得靠 ``ETag``/``Last-Modified`` 回源协商。协商本身没错，问题是：升级之后，如果某个中间
层（Service Worker、共享缓存、代理）拿旧响应顶了回来，页面就会「新外壳 + 旧资源」混着跑。

做法：构建期写一份 ``resource-version.json``（内容哈希，16 位小写十六进制），后端在拼 URL 时
把它作为一个 ``?v=`` 参数补上。升级换 revision → URL 变了 → 旧缓存条目自然不会被命中。

与上游 ``app/frontend_resources.py`` 的差异只有一处：按 ``(路径, mtime_ns, size)`` 记忆化，
避免每个请求都读一次盘。本项目的 ``get_stage`` 是同步 ``def``（跑在线程池）且每个 3D iframe
都会请求一次，不缓存就是每个 iframe 一次磁盘读。
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

logger = logging.getLogger(__name__)

#: 构建期写出的资源版本清单（与 :mod:`vite.config.ts` 的 ``writeResourceVersion`` 互为契约）。
RESOURCE_VERSION_FILE = "resource-version.json"

#: 16 位小写十六进制。上游同一格式，不要放宽 —— 它是「构建期一定写得出来」的断言。
_REVISION_PATTERN = re.compile(r"[0-9a-f]{16}")

#: ``(绝对路径, mtime_ns, size) -> revision``。
#: 重建产物会换 mtime 与 size，键自然失效；不需要额外的失效信号。
_revision_cache: dict[tuple[str, int, int], str] = {}


def read_resource_revision(frontend_dir: Path) -> str:
    """读 ``<frontend_dir>/resource-version.json`` 里的 ``revision`` 并校验格式。

    异常取舍（照上游，不要在这里「顺手容错」）：

    - 清单不存在 → ``FileNotFoundError``，由调用方决定降级（见 :func:`frontend_resource_url`）；
    - 清单存在但内容坏了 → 让 ``JSONDecodeError`` / ``KeyError`` / ``ValueError`` 抛出去。
      静默降级成「没有 revision」会让缓存混用重新出现，而且没人会发现。
    """
    manifest_path = Path(frontend_dir) / RESOURCE_VERSION_FILE
    stat = manifest_path.stat()
    cache_key = (str(manifest_path), stat.st_mtime_ns, stat.st_size)
    cached = _revision_cache.get(cache_key)
    if cached is not None:
        return cached
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    revision = payload["revision"]
    if not isinstance(revision, str) or not _REVISION_PATTERN.fullmatch(revision):
        raise ValueError("Invalid frontend resource revision")
    _revision_cache[cache_key] = revision
    return revision


def frontend_resource_url(frontend_dir: Path, url: str) -> str:
    """给 ``url`` 补上构建期 revision，并去掉它原有的所有 ``v`` 参数。

    为什么是「去掉」而不是「覆盖」：同一条 URL 上叠着多个 ``v`` 时（上游 0.8.1 的
    ``stage.css?v=2026…-2026…`` 有 59 段），浏览器会把每一种组合当成不同 URL。把旧 tag
    链留着、再追加一个新 ``v``，等于**制造**缓存碎片。整条链丢掉、只留新 revision 才是收敛。
    """
    try:
        revision = read_resource_revision(frontend_dir)
    except FileNotFoundError as exc:
        # 没走构建的开发形态（或产物尚未就绪）：原样返回，不报错也不加参数。
        # 仍然留一条 debug：线上看到「URL 少了 ?v=」时，能一眼分辨是「没构建」而不是
        # 「构建了但读取路径不对」——后者才是真故障。
        logger.debug("未找到资源版本清单，URL 原样返回：%s", exc)
        return url
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key != "v"
    ]
    query.append(("v", revision))
    return urlunsplit(parts._replace(query=urlencode(query)))
