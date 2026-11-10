"""Nest 结构错误响应与 FastAPI 异常处理器注册。

对外契约：``{ statusCode, errorCode, apiErrorCode?, error, message, timestamp, path, detail?, traceId? }``。
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import ClientDisconnect

from ..config import Settings
from ..platform.core.http.errors import (
    BusinessException,
    ErrorCode,
    flatten_http_exception_message,
    localize_http_exception_message,
    resolve_api_error_code,
)
from ..platform.core.runtime.observability import get_trace_id

_SENSITIVE_5XX_MESSAGE = "服务器内部错误"

#: 客户端已断开（nginx 约定的 ``499 Client Closed Request``）
CLIENT_CLOSED_REQUEST_STATUS = 499
#: 客户端断开时的响应文案（对端多半收不到，仅用于访问日志与排障）
CLIENT_CLOSED_REQUEST_MESSAGE = "客户端已断开连接。"

logger = logging.getLogger("homeos.app")


def iso_timestamp() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def full_path(request: Request) -> str:
    """等价 Express ``request.url``（路径 + 查询串，不含 scheme/host）。"""
    query = request.url.query
    return f"{request.url.path}?{query}" if query else request.url.path


def reason_phrase(status: int) -> str:
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return "Error"


def nest_error_payload(
    *,
    status: int,
    error_code: str,
    message: str,
    error: str,
    request: Request,
    trace_id: str | None,
    detail: object | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "statusCode": status,
        "errorCode": error_code,
        "error": error,
        "message": message,
        "timestamp": iso_timestamp(),
        "path": full_path(request),
    }
    api_error_code = resolve_api_error_code(message)
    if api_error_code:
        # 保持与 Nest 一致的字段顺序：apiErrorCode 紧跟在 errorCode 之后。
        payload = {
            "statusCode": status,
            "errorCode": error_code,
            "apiErrorCode": api_error_code,
            "error": error,
            "message": message,
            "timestamp": payload["timestamp"],
            "path": payload["path"],
        }
    if detail is not None:
        # 追加 homeos-3d 兼容字段：3D 前端（setup.ts / login.ts）从 ``payload.detail``
        # 取错误文案（字符串），或从 ``payload.detail[0].msg`` 取校验错误文案。
        # 纯追加字段，homeos 既有消费方仍读 ``message``，行为不变。
        payload["detail"] = detail
    if trace_id:
        payload["traceId"] = trace_id
    return payload


def _response_headers(exc: Exception) -> dict[str, str] | None:
    """把异常自带的响应头规整成 ``JSONResponse`` 能接受的 ``dict[str, str]``。

    Starlette 的 ``HTTPException`` 允许 ``headers`` 里放 ``bytes`` 键值（ASGI 原生形态），
    直接 ``dict(...)`` 交给 ``JSONResponse`` 会在类型上不成立、运行时也只能靠运气恰好是 str。
    """
    raw = getattr(exc, "headers", None)
    if not raw:
        return None
    normalized: dict[str, str] = {}
    for key, value in dict(raw).items():
        text_key = key.decode("latin-1") if isinstance(key, bytes) else str(key)
        text_value = value.decode("latin-1") if isinstance(value, bytes) else str(value)
        normalized[text_key] = text_value
    return normalized or None


def business_exception_json(
    request: Request,
    exc: BusinessException,
    *,
    is_production: bool,
) -> JSONResponse:
    status = exc.status_code
    message = exc.message
    error_code = str(exc.error_code)
    # ``error`` 是给客户端做二次判定的「分类名」，不是给用户看的文案。以前这里对所有
    # 状态码都填 ``服务器内部错误``，于是 401/403/404 的响应里也写着「服务器内部错误」——
    # 排查时会被这行字带到完全错误的方向。口径与 StarletteHTTPException 分支对齐：
    # 业务异常没有专属 error_name，就用状态码的 reason phrase（Unauthorized / Forbidden）。
    error = getattr(exc, "error_name", None) or reason_phrase(status)
    message = localize_http_exception_message(message, status, error)
    display = _SENSITIVE_5XX_MESSAGE if status >= 500 and is_production else message
    trace_id = get_trace_id() or request.headers.get("x-trace-id")
    return JSONResponse(
        status_code=status,
        content=nest_error_payload(
            status=status,
            error_code=error_code,
            message=display,
            error=error,
            request=request,
            trace_id=trace_id,
        ),
        headers=_response_headers(exc),
    )


def client_disconnect_json(request: Request) -> JSONResponse:
    """把 ``ClientDisconnect`` 规整成 499，而不是 500。

    断连不是服务端故障：3D 舞台 / 墙屏刷新、进 bfcache、切走标签页时，正在上传的
    请求体（渲染缓存瓦片、项目草稿）会在 ``request.stream()`` / FastAPI 解析请求体
    途中抛 ``ClientDisconnect``。此前它会落到 ``Exception`` 处理器，于是每次断连都
    写一条 ERROR「未处理异常」+ 一条 uvicorn「Exception in ASGI application」，
    Prometheus 的 5xx 也跟着涨 —— 真正要排查的 500 被这些噪音淹没。

    ``499`` 语义是「客户端已走、响应无人接收」：uvicorn 的 ``send`` 在断连后直接
    返回，这里写响应不会二次报错；访问日志与指标按 4xx 归因。
    """
    return JSONResponse(
        status_code=CLIENT_CLOSED_REQUEST_STATUS,
        content=nest_error_payload(
            status=CLIENT_CLOSED_REQUEST_STATUS,
            error_code=str(ErrorCode.UNKNOWN),
            message=CLIENT_CLOSED_REQUEST_MESSAGE,
            error=reason_phrase(CLIENT_CLOSED_REQUEST_STATUS),
            request=request,
            trace_id=get_trace_id() or request.headers.get("x-trace-id"),
        ),
    )


def register_exception_handlers(app: FastAPI, settings: Settings) -> None:
    """注册统一 Nest 结构异常处理器（须在路由装配前调用）。"""

    @app.exception_handler(BusinessException)
    async def _business_exception(request: Request, exc: BusinessException):
        return business_exception_json(request, exc, is_production=settings.is_production)

    @app.exception_handler(ClientDisconnect)
    async def _client_disconnect(request: Request, exc: ClientDisconnect):
        # 断连属客户端行为：DEBUG 留一行线索即可，不打 5xx、不写堆栈。
        logger.debug("客户端在请求途中断开 %s %s: %s", request.method, request.url.path, exc)
        return client_disconnect_json(request)

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(request: Request, exc: StarletteHTTPException):
        status = exc.status_code
        raw_detail = exc.detail
        if isinstance(raw_detail, (list, tuple)):
            message = flatten_http_exception_message(list(raw_detail), reason_phrase(status))
        elif isinstance(raw_detail, str):
            message = raw_detail
        else:
            message = str(raw_detail) if raw_detail is not None else reason_phrase(status)
        error = getattr(exc, "error_name", None) or reason_phrase(status)
        # 异常可自带稳定错误码（``RequestRejected``）；没带就沿用 UNKNOWN（复刻 Nest 行为，
        # 例如 ``ConfigValidationError`` 必须是 UNKNOWN）。
        error_code = str(getattr(exc, "error_code", None) or ErrorCode.UNKNOWN)
        message = localize_http_exception_message(message, status, error)
        display = _SENSITIVE_5XX_MESSAGE if status >= 500 and settings.is_production else message
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        return JSONResponse(
            status_code=status,
            content=nest_error_payload(
                status=status,
                error_code=error_code,
                message=display,
                error=error,
                request=request,
                trace_id=trace_id,
                detail=raw_detail,
            ),
            # 异常自带的响应头必须透传：限流 429 的 ``Retry-After``、401 的
            # ``WWW-Authenticate`` 都只从这里出去。此前统一信封丢掉了它们，
            # 客户端只能盲目重试（登录限流分支已经写好了 Retry-After 却发不出去）。
            headers=_response_headers(exc),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        # 复刻 Nest ValidationPipe：400 + 展平后的 message 数组。
        status = 400
        parts: list[str] = []
        for item in exc.errors():
            loc = ".".join(str(part) for part in item.get("loc", []) if part != "body")
            msg = str(item.get("msg", "")).replace("Value error, ", "")
            parts.append(f"{loc}: {msg}" if loc else msg)
        message = "；".join(dict.fromkeys(parts)) or "请求无效"
        message = localize_http_exception_message(message, status, "Bad Request")
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        # 追加 homeos-3d 形状的 ``detail``（pydantic 原始条目，保留 ``Value error, `` 前缀）：
        # 3D 前端 setup.ts 读 ``detail[0].msg``，与 3D 后端原生 422 响应逐字一致。
        detail = [
            {
                "type": str(item.get("type", "")),
                "loc": [str(part) for part in item.get("loc", [])],
                "msg": str(item.get("msg", "")),
            }
            for item in exc.errors()
        ]
        return JSONResponse(
            status_code=status,
            content=nest_error_payload(
                status=status,
                error_code=str(ErrorCode.UNKNOWN),
                message=message,
                error="Bad Request",
                request=request,
                trace_id=trace_id,
                detail=detail,
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, _exc: Exception):
        # 外层中间件（授权门禁 / 外壳 / 请求体门禁）没有 ExceptionMiddleware 兜底，
        # 那里冒出来的断连会直接落到这里：仍按 499 处理，别记成服务端故障。
        if isinstance(_exc, ClientDisconnect):
            logger.debug("客户端在请求途中断开 %s %s: %s", request.method, request.url.path, _exc)
            return client_disconnect_json(request)
        status = 500
        trace_id = get_trace_id() or request.headers.get("x-trace-id")
        # 开发期把未捕获异常打到日志，便于定位媒体代理等 500。
        logger.exception(
            "未处理异常 %s %s trace=%s: %s",
            request.method,
            request.url.path,
            trace_id,
            _exc,
        )
        return JSONResponse(
            status_code=status,
            content=nest_error_payload(
                status=status,
                error_code=str(ErrorCode.UNKNOWN),
                message=_SENSITIVE_5XX_MESSAGE if settings.is_production else f"{type(_exc).__name__}: {_exc}",
                error=_SENSITIVE_5XX_MESSAGE,
                request=request,
                trace_id=trace_id,
            ),
        )
