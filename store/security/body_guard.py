"""请求体的字节上限（ASGI 中间件）。

商店是**公网直连**的服务（``STORE_BASE_URL`` 就是它的公开地址），而 FastAPI 处理请求时
**先把整个请求体读进内存**，之后才轮到依赖与路由体 —— 于是 ``POST /store/v1/auth/login``、
``/store/v1/verification/*``、``/v2/activate`` 这些**鉴权之前**就要读体的入口，任何匿名请求
都能拿一个大 body 把进程内存打满。限流按**请求数**算，管不到单个请求的体积，所以这一层
必须独立存在。

两档上限：

- **默认 1 MiB**：其余全部写路由。商店的请求体本来就都极小 —— 登录、验证码、授权封套
  （几 KB 级）、支付宝表单回调、模拟收银台 —— 1 MiB 留了两个数量级的余量。
- **multipart 声明上限 16 MiB**：``POST /store-admin/v1/products/{id}/image`` 是唯一的上传
  路由，走 ``UploadFile``（Starlette 将其 spool 到磁盘，内存里只留约 1 MiB），成品上限是
  8 MB（``IMAGE_MAX_BYTES``）。这一层**不缓冲它** —— 缓冲等于把整张图拉回内存，正好废掉
  spooling 的意义；只按 ``Content-Length`` 提前拒绝明显超限的请求。

刻意不复刻主应用 ``backend/http/body_guard.py`` 的 JSON 嵌套深度扫描：那份扫描要在
``json.loads`` 之前跑一遍字节状态机，而商店这一侧除 ``store/api/license.py`` 一处
``await request.json()`` 外解析全交给 pydantic，深嵌套输入最多得到「一个被接住的 500」，
不构成内存放大。为它在这里再存一份解析器状态机不划算 —— 主应用那一份则**必须有**，
因为草稿文档会被递归遍历。

与 ``backend/security/http_security.py`` 那类判据不同，这不是「两份必须逐字一致」的规则：
两侧的额度与放行名单本就不同，各自独立维护。
"""
from __future__ import annotations

from fastapi import status
from fastapi.responses import JSONResponse

#: 大多数写路由的请求体上限。
MAX_DEFAULT_BODY_BYTES = 1024 * 1024

#: multipart 请求按 ``Content-Length`` 提前拒绝的阈值（见模块说明）。
MAX_MULTIPART_DECLARED_BYTES = 16 * 1024 * 1024

#: 不带请求体的方法：整体跳过。
_BODYLESS_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def _declared_length(scope) -> int | None:
    """``Content-Length`` 声明的字节数；缺失或不是非负整数时返回 ``None``。"""
    for name, value in scope.get("headers") or ():
        if name != b"content-length":
            continue
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed >= 0 else None
    return None


def _content_type(scope) -> str:
    """本次请求的 ``Content-Type``（小写、去参数）；缺失时返回空串。"""
    for name, value in scope.get("headers") or ():
        if name == b"content-type":
            return value.decode("latin-1").split(";")[0].strip().lower()
    return ""


async def _read_capped_body(receive, limit: int) -> tuple[bytes, bool]:
    """逐块读请求体，累计超过 ``limit`` 就停下。

    返回 ``(请求体, 是否超限)``。超限时返回值无意义（调用方直接回 413）。

    不信任 ``Content-Length``：分块传输（chunked）根本没有这个头，伪造一个小值也能让
    「先看头再读」的写法形同虚设。累计判断是唯一可靠的判据。

    超限后仍把剩余分块读完再返回：连接上残留的字节会被 h11 当成下一个请求的起始，
    直接报协议错误 —— 那会让「请求太大」表现成连接被重置。
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message.get("type") != "http.request":
            # http.disconnect：客户端已经走了，没必要再往路由里送。
            return b"", False
        body = message.get("body") or b""
        total += len(body)
        if total > limit:
            while message.get("more_body"):
                message = await receive()
                if message.get("type") != "http.request":
                    break
            return b"", True
        chunks.append(body)
        if not message.get("more_body"):
            return b"".join(chunks), False


def _human_size(size: int) -> str:
    """人类可读的字节数（只用来拼错误文案，取值都是 2 的幂的整数倍）。"""
    if size and size % (1024 * 1024) == 0:
        return f"{size // (1024 * 1024)} MiB"
    return f"{max(1, size // 1024)} KiB"


async def _send_too_large(send, limit: int) -> None:
    """直接回一个 JSON 413（走真正的 Response，保证头部与 JSON 体一致）。"""
    response = JSONResponse(
        {"detail": f"请求体超过 {_human_size(limit)}，无法处理。"},
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        headers={"Cache-Control": "no-store"},
    )
    await response({"type": "http"}, None, send)


class RequestBodyGuard:
    """给全部非流式请求加请求体字节上限（默认 1 MiB，multipart 见模块说明）。

    同时把读到的请求体**重放**给下游：FastAPI 仍按原样再读一次并自己 ``json.loads``，
    因此路由签名与 pydantic 校验行为完全不变 —— 这一层只负责在解析之前把病态输入挡掉。
    重放不额外占用内存（交给下游的就是同一个 bytes 对象），而 FastAPI 本来也会把整个
    请求体读进内存。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http" or scope.get("method", "").upper() in _BODYLESS_METHODS:
            await self.app(scope, receive, send)
            return
        if _content_type(scope) == "multipart/form-data":
            # 上传路由自己管流（spool 到磁盘 + 成品上限），这一层只做声明长度的快速拒绝。
            declared = _declared_length(scope)
            if declared is not None and declared > MAX_MULTIPART_DECLARED_BYTES:
                await _send_too_large(send, MAX_MULTIPART_DECLARED_BYTES)
                return
            await self.app(scope, receive, send)
            return

        limit = MAX_DEFAULT_BODY_BYTES
        declared = _declared_length(scope)
        if declared is not None and declared > limit:
            await _send_too_large(send, limit)
            return
        (body, too_large) = await _read_capped_body(receive, limit)
        if too_large:
            await _send_too_large(send, limit)
            return

        async def replay() -> dict:
            """把已读到的请求体交给下游（可被反复调用，返回同一份内容）。"""
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)
