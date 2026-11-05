"""预压缩静态产物直出（构建期 sidecar）。

前端构建后会在同一目录生成 <name>.br / <name>.gz（见 ops/scripts/precompress-static.mjs）。
本模块让静态挂载点按请求的 Accept-Encoding 直接回对应 sidecar，避免 Starlette
GZipMiddleware 在每个请求上现压大 chunk —— 实测 869KB 的 shared chunk 动态 gzip 每次
多耗约 33–42ms CPU，且压缩发生在事件循环/线程池里，是静态资源首屏的主要长尾。

约定：
- sidecar 与原文件同目录、同 basename，仅多 .br / .gz 后缀；
- 只处理 GET/HEAD 且不带 Range 的请求（Range 语义按原文件走，避免多编码区间错位）；
- 命中 sidecar 时沿用原文件的 media type，并补 Content-Encoding / Vary；
- 没有 sidecar 或客户端不接受时完全退回 StaticFiles 原行为。
"""

from __future__ import annotations

import logging
import mimetypes
from collections.abc import Iterable
from pathlib import Path

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

logger = logging.getLogger(__name__)

#: 顺序即优先级：brotli 体积更小，其次 gzip。
_SIDECARS: tuple[tuple[str, str], ...] = (("br", ".br"), ("gzip", ".gz"))


def _accepts_encoding(header: str, encoding: str) -> bool:
    """解析 Accept-Encoding（支持 q=0 拒绝与 *）。"""
    if not header:
        return False
    wildcard = None
    for part in header.split(","):
        token, _, params = part.strip().partition(";")
        token = token.strip().lower()
        quality = 1.0
        for param in params.split(";"):
            key, _, value = param.strip().partition("=")
            if key.strip().lower() == "q":
                try:
                    quality = float(value)
                except ValueError:
                    logger.debug("Accept-Encoding 的 q 值无法解析：%r", value)
                    quality = 0.0
        if token == encoding:
            return quality > 0
        if token == "*":
            wildcard = quality > 0
    return bool(wildcard)


class PrecompressedStaticFiles(StaticFiles):
    """StaticFiles 的预压缩 sidecar 直出扩展。"""

    async def get_response(self, path: str, scope: Scope):
        selected = self._select_sidecar(scope)
        if selected is None:
            return await super().get_response(path, scope)
        response = self._sidecar_response(path, selected)
        if response is None:
            return await super().get_response(path, scope)
        return response

    def _select_sidecar(self, scope: Scope) -> tuple[str, str] | None:
        """按方法 / Range / Accept-Encoding 选出 sidecar；不适合直出时返回 None。"""
        if scope.get("method", "GET").upper() not in ("GET", "HEAD"):
            return None
        headers = Headers(scope=scope)
        if headers.get("range"):
            # Range 请求交给原文件：sidecar 的字节区间与 identity 表示不通用。
            return None
        accept = headers.get("accept-encoding", "")
        if not accept:
            return None
        for encoding, suffix in _SIDECARS:
            if _accepts_encoding(accept, encoding):
                return encoding, suffix
        return None

    def _sidecar_response(self, path: str, selected: tuple[str, str]) -> FileResponse | None:
        try:
            full_path, _ = self.lookup_path(path)
        except HTTPException:
            logger.debug("预压缩 sidecar 查找失败：path=%s", path, exc_info=True)
            return None
        if not full_path:
            return None
        original = Path(full_path)
        sidecar = original.with_name(original.name + selected[1])
        try:
            stat_result = sidecar.stat()
        except OSError:
            logger.debug("预压缩 sidecar 不存在：%s", sidecar, exc_info=True)
            return None
        if not sidecar.is_file() or stat_result.st_size <= 0:
            return None
        media_type = mimetypes.guess_type(str(original))[0] or "application/octet-stream"
        response = FileResponse(str(sidecar), media_type=media_type, stat_result=stat_result)
        response.headers["Content-Encoding"] = selected[0]
        response.headers["Vary"] = "Accept-Encoding"
        return response


def sidecar_paths(path: Path) -> Iterable[tuple[str, Path]]:
    """测试/工具用：返回某个原文件可能存在的 sidecar 列表。"""
    for encoding, suffix in _SIDECARS:
        yield encoding, path.with_name(path.name + suffix)


__all__ = ["PrecompressedStaticFiles", "sidecar_paths"]
