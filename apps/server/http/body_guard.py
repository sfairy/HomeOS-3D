"""请求体的输入上限：默认字节上限、草稿字节上限、JSON 嵌套深度上限。
"""
from __future__ import annotations

from fastapi.responses import JSONResponse

from ..core.body_limits import (
    MAX_DEFAULT_BODY_BYTES,
    MAX_JSON_DEPTH,
    MAX_PANEL_DOCUMENT_BYTES,
    MAX_SCENE_DOCUMENT_BYTES,
    json_nesting_depth,
)
from .http_cache import NO_STORE

_BODYLESS_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})

#: 「路径 → 请求体字节上限」的登记表。键是 (方法, 路径) 的匹配规则：
_DRAFT_ROUTE_LIMITS = (
    ('/api/v1/projects/', '/draft', MAX_PANEL_DOCUMENT_BYTES),
    ('/api/v1/studio3d', '', MAX_SCENE_DOCUMENT_BYTES),
)

#: 「自己带流式上限」的上传端点（方法, 路径前缀）：中间件必须**原样放行**，不读也不缓冲。
_STREAMING_UPLOADS = (
    # 用户素材图片：边收边计数 + 素材总量配额（apps/server/api/assets.py）。
    ('POST', '/api/v1/assets/'),
    # 3D 导出 ZIP 归档：压缩包上限（apps/server/api/studio3d.py）。
    ('POST', '/api/v1/studio3d/exports'),
    ('PUT', '/api/v1/modules/interaction3d/scenes/'),
)


def _draft_body_limit(path: str, method: str) -> int | None:
    """该请求是不是「整份 JSON 落库」的写路由；是则给出它的字节上限。
    """
    if method.upper() != 'PUT':
        return None
    normalized = path.rstrip('/') or '/'
    for prefix, suffix, limit in _DRAFT_ROUTE_LIMITS:
        if not normalized.startswith(prefix):
            continue
        if not suffix:
            # 无后缀的规则要求整条路径相等（``/api/v1/studio3d``），
            if normalized == prefix:
                return limit
            continue
        # 前缀 + 后缀两段都要对上，且中间至少有一个字符：
        if normalized.endswith(suffix) and len(normalized) > len(prefix) + len(suffix):
            return limit
    return None


def is_streaming_upload(path: str, method: str) -> bool:
    """该请求是不是「自管请求体」的上传端点（本层必须原样放行）。"""
    normalized = path.rstrip('/') or '/'
    upper = method.upper()
    return any(
        upper == expected_method and normalized.startswith(prefix)
        for expected_method, prefix in _STREAMING_UPLOADS
    )


def body_limit(path: str, method: str) -> int | None:
    """本次请求的字节上限；``None`` 表示这一层不碰它的请求体。
    """
    if method.upper() in _BODYLESS_METHODS:
        return None
    if is_streaming_upload(path, method):
        return None
    draft = _draft_body_limit(path, method)
    if draft is not None:
        return draft
    return MAX_DEFAULT_BODY_BYTES


def _needs_depth_scan(payload: bytes) -> bool:
    """是否有必要跑深度扫描。
    """
    stripped = payload.lstrip()
    if not stripped or stripped[0] not in (0x7B, 0x5B):
        return False
    return stripped.count(b'{') + stripped.count(b'[') > MAX_JSON_DEPTH


def _declared_length(scope) -> int | None:
    """``Content-Length`` 声明的字节数；缺失或不是非负整数时返回 ``None``。"""
    for name, value in scope.get('headers') or ():
        if name != b'content-length':
            continue
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


async def _read_capped_body(receive, limit: int) -> tuple[bytes, bool]:
    """逐块读请求体，累计超过 ``limit`` 就停下。
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message.get('type') != 'http.request':
            # http.disconnect：客户端已经走了，没必要再往路由里送。
            return b'', False
        body = message.get('body') or b''
        total += len(body)
        if total > limit:
            while message.get('more_body'):
                message = await receive()
                if message.get('type') != 'http.request':
                    break
            return b'', True
        chunks.append(body)
        if not message.get('more_body'):
            return b''.join(chunks), False


def _human_size(size: int) -> str:
    """人类可读的字节数（只用来拼错误文案，值都是 2 的幂的整数倍）。"""
    if size and size % (1024 * 1024) == 0:
        return f'{size // (1024 * 1024)} MiB'
    return f'{max(1, size // 1024)} KiB'


def _too_large_detail(is_draft: bool, limit: int) -> str:
    if is_draft:
        return '草稿数据过大，无法保存。请精简后重试。'
    return f'请求体超过 {_human_size(limit)}，无法处理。'


def _too_deep_detail(is_draft: bool) -> str:
    if is_draft:
        return f'草稿的嵌套层级超过 {MAX_JSON_DEPTH} 层，无法保存。'
    return f'请求体的嵌套层级超过 {MAX_JSON_DEPTH} 层。'


async def _send_error(send, status_code: int, detail: str) -> None:
    """直接回一个 JSON 错误（走真正的 Response，保证头部与 JSON 体一致）。"""
    response = JSONResponse(
        {'detail': detail}, status_code=status_code, headers={'cache-control': NO_STORE}
    )
    await response({'type': 'http'}, None, send)


class RequestBodyGuard:
    """给全部非流式请求加「请求体字节上限」，给草稿类写路由另加「嵌套深度上限」。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get('type') != 'http':
            await self.app(scope, receive, send)
            return
        method = scope.get('method', '')
        path = scope.get('path', '')
        limit = body_limit(path, method)
        if limit is None:
            await self.app(scope, receive, send)
            return

        is_draft = _draft_body_limit(path, method) is not None
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await _send_error(send, 413, _too_large_detail(is_draft, limit))
            return

        (body, too_large) = await _read_capped_body(receive, limit)
        if too_large:
            await _send_error(send, 413, _too_large_detail(is_draft, limit))
            return
        if _needs_depth_scan(body) and json_nesting_depth(body) > MAX_JSON_DEPTH:
            await _send_error(send, 422, _too_deep_detail(is_draft))
            return

        async def replay() -> dict:
            """把已读到的请求体交给下游（可被重复调用，返回同一份内容）。"""
            return {'type': 'http.request', 'body': body, 'more_body': False}

        await self.app(scope, replay, send)
