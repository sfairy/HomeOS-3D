"""请求体的输入上限：默认字节上限、草稿字节上限、JSON 嵌套深度上限。

为什么必须放在 ASGI 中间件里，而不是路由函数或依赖里：FastAPI 处理请求时**先把整个
请求体读进内存并 ``json.loads``**，之后才轮到依赖与路由体（见 fastapi.routing.get_request_handler）。
因此依赖里做上限检查已经太晚（内存峰值在前一行就产生了），而深度检查必须在
``json.loads`` **之前** —— 几千层嵌套括号的请求体只有几 KB，字节上限拦不住，
而 ``json.loads`` 会先抛 ``RecursionError``（未捕获 → 500，堆栈还会进全局日志）。

三道闸门管三件事：

- **默认字节上限**（:data:`MAX_DEFAULT_BODY_BYTES`）：覆盖请求体本来就不大的绝大多数路由。
  它挡的是**鉴权之前**就把 body 读进内存的那批入口（``POST /api/v1/auth/login``、
  ``/api/v1/setup/admin``、``/api/v1/displays/pair``、``/api/v1/logs/public-events`` …）——
  匿名请求也能拿一个大 body 把进程内存打满，而限流是按请求数算的，管不到单请求的体积。
- **草稿字节上限**（:data:`MAX_PANEL_DOCUMENT_BYTES` / :data:`MAX_SCENE_DOCUMENT_BYTES`）：
  「整份 JSON 落库」的写路由额度更大，单独放宽（见 :data:`_DRAFT_ROUTE_LIMITS`）。
- **嵌套深度上限**：字节上限挡不住「几 KB 把解析器打爆」。

唯一不在这里判的是三个 ``async for chunk in request.stream()`` 上传端点（见
:data:`_STREAMING_UPLOADS`）：它们**自己**边收边计数、超限立刻中断，中间件先缓冲反而会把
那些分块上限作废。

数值本身与 ``json_nesting_depth`` 都在 :mod:`backend.core.body_limits`：``core/schemas.py``
的写盘路径也要用同一批上限，而 ``core`` 反向依赖 ``http`` 就是一条包级环。这里照旧转出
那几个名字，所以 ``from ..http.body_guard import MAX_SCENE_DOCUMENT_BYTES`` 的写法不受影响。
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

#: 不带请求体的方法：整体跳过，中间的判断对它们没有意义。
_BODYLESS_METHODS = frozenset({'GET', 'HEAD', 'OPTIONS'})

#: 「路径 → 请求体字节上限」的登记表。键是 (方法, 路径) 的匹配规则：
#: 项目草稿的路径带项目 id，因此用「前缀 + 后缀」匹配。
_DRAFT_ROUTE_LIMITS = (
    ('/api/v1/projects/', '/draft', MAX_PANEL_DOCUMENT_BYTES),
    ('/api/v1/studio3d', '', MAX_SCENE_DOCUMENT_BYTES),
)

#: 「自己带流式上限」的上传端点（方法, 路径前缀）：中间件必须**原样放行**，不读也不缓冲。
#:
#: 这三个端点是 ``async for chunk in request.stream()`` 消费请求体的，边收边计数、超限立刻
#: 中断（见 backend/http/streaming.py）。中间件一旦先缓冲，那些分块上限就形同虚设 —— 一个几十 MB
#: 的怪请求会在这一层被完整读进内存，正是本层要防的那件事。
#:
#: 前缀匹配会把同前缀下的其它路径一并放行，因此这里只登记「该前缀下确实没有别的写路由」的命名空间；
#: **改动这里必须同步核对那三个 ``request.stream()`` 调用点**，没有自动化闸门会替你发现漂移。
_STREAMING_UPLOADS = (
    # 用户素材图片：边收边计数 + 素材总量配额（backend/api/assets.py）。
    ('POST', '/api/v1/assets/'),
    # 3D 导出 ZIP 归档：压缩包上限（backend/api/studio3d.py）。
    ('POST', '/api/v1/studio3d/exports'),
    # 舞台页回传的灯光合图 PNG：单条缓存体积上限（backend/modules/interaction3d/api.py）。
    #
    # 这里必须是**挂载后的完整路径**：该路由的 APIRouter 自带 prefix='/modules/interaction3d'，
    # 再由 main.py 以 prefix='/api/v1' 挂上。曾经漏掉中间那段 ``/modules``，于是这条豁免
    # 对真实请求永远不命中 —— 回传的 PNG 被当成普通 JSON 端点处理：超 1 MiB 先被 413 拦，
    # 没超则被送去跑 JSON 嵌套深度扫描，而二进制里的括号字节会被数成「嵌套过深」，
    # 一张中等熵的渲染图就回 422。核对办法：前缀必须能 match 到路由装饰器上那条路径。
    ('PUT', '/api/v1/modules/interaction3d/scenes/'),
)


def _draft_body_limit(path: str, method: str) -> int | None:
    """该请求是不是「整份 JSON 落库」的写路由；是则给出它的字节上限。

    只认 PUT：这几条路由的读接口在同一路径上（GET 没有请求体），
    按方法区分可以避免把上限套到读路径上。
    """
    if method.upper() != 'PUT':
        return None
    normalized = path.rstrip('/') or '/'
    for prefix, suffix, limit in _DRAFT_ROUTE_LIMITS:
        if not normalized.startswith(prefix):
            continue
        if not suffix:
            # 无后缀的规则要求整条路径相等（``/api/v1/studio3d``），
            # 否则同前缀的子路径（``/api/v1/studio3d/exports``）会被一起套上。
            if normalized == prefix:
                return limit
            continue
        # 前缀 + 后缀两段都要对上，且中间至少有一个字符：
        # ``/api/v1/projects/x/draft`` 命中，``/api/v1/projects//draft`` 不命中。
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

    判据顺序：没有请求体的方法 → 自管 stream 的上传端点 → 草稿路由 → 默认上限。
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

    括号总数不超过上限时，嵌套深度必然不超过上限 —— 于是绝大多数请求（正常的登录、
    状态上报、控制指令都只有个位数括号）可以跳掉那个纯 Python 的逐字节循环，
    它扫 1 MiB 就是几十毫秒的 CPU，挂在每个请求上都太贵。

    开销只有两次 ``bytes.count``（C 实现）。字符串内部的括号会把计数算高，
    那只是让少数请求多跑一次扫描，不影响结论。

    **先看首字节**：深度只可能出现在以 ``{`` 或 ``[`` 开头的 JSON 里，而 PNG 之类的
    二进制体也会碰巧含大量括号字节 —— 只看括号数量会把一张渲染图数成「嵌套过深」
    而回 422。加了这道前置判断，真 JSON 与二进制各归各位，``json.loads`` 那条
    路径的防护一点没少（深到能打爆解析器的输入必然以括号开头）。
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

    返回 ``(请求体, 是否超限)``。超限时返回值无意义（调用方直接回 413）。

    不信任 ``Content-Length``：分块传输（chunked）根本没有这个头，伪造一个
    小值也能让「先看头再读」的写法形同虚设。累计判断是唯一可靠的判据。

    超限后仍把剩余分块读完再返回：连接上残留的字节会被 h11 当成下一个请求的
    起始，直接报协议错误 —— 那会让「请求太大」表现成连接被重置。
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
    """413 的文案：草稿保持历史原文（前端已按它做了提示），其余给出具体上限。"""
    if is_draft:
        return '草稿数据过大，无法保存。请精简后重试。'
    return f'请求体超过 {_human_size(limit)}，无法处理。'


def _too_deep_detail(is_draft: bool) -> str:
    """422 的文案（与 ``backend/core/schemas.py`` 里写盘那一层的同源提示）。"""
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

    同时把读到的请求体**重放**给下游：FastAPI 仍按原样再读一次并自己
    ``json.loads``，因此路由签名（``payload: ProjectDraftUpdate``）与校验
    行为完全不变 —— 这一层只负责在解析之前把病态输入挡掉。重放不额外占用内存
    （交给下游的就是同一个 bytes 对象），而 FastAPI 本来也会把整个请求体读进内存。

    对声明了超大 ``Content-Length`` 的请求直接回 413、连读都不读：那是**提前拒绝**
    的捷径，不是放行依据 —— 分块传输没有这个头，伪造成小值也照样会在累计读取里被拦下。
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
