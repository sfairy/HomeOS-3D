"""授权服务器端点：``/v2/activate``、``/v2/heartbeat``、``/v2/recover``。

这三个端点与 `/store/v1` 的协议完全不同：请求与响应都是加密封套，
且错误响应是**明文** ``{"detail": "..."}``（客户端在 4xx 时直接读 detail，不解密）。
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from store.licensing.crypto import LicenseServerError
from store.request_security import resolve_client_ip

logger = logging.getLogger("store.license.api")

router = APIRouter(tags=["license"])


async def _dispatch(request: Request, method: str) -> Response:
    authority = request.app.state.license_authority
    path = request.url.path

    try:
        body = await request.json()
        payload, key = authority.transport.decrypt_request(body, path)
    except LicenseServerError as error:
        logger.warning("授权请求解密失败 path=%s detail=%s", path, error.detail)
        return JSONResponse(error.as_body(), status_code=error.status_code)
    except Exception:  # noqa: BLE001 - 非法 JSON 一律 400
        return JSONResponse({"detail": "授权请求格式无效。"}, status_code=400)

    # 走统一解析：配了可信反向代理就取真实客户端地址，否则用 TCP 对端地址。
    # 授权记录里的 IP 是「这台机器在哪」的证据，代理后面取错等于全部记成同一个地址。
    client_ip = resolve_client_ip(request).ip or None
    try:
        result = getattr(authority, method)(payload, ip=client_ip)
    except LicenseServerError as error:
        logger.info("授权请求被拒绝 path=%s status=%s detail=%s", path, error.status_code, error.detail)
        return JSONResponse(error.as_body(), status_code=error.status_code)
    except Exception:  # noqa: BLE001 - 服务端异常按 500 返回，客户端会切换端点重试
        logger.exception("授权端点内部错误 path=%s", path)
        return JSONResponse({"detail": "授权服务内部错误，请稍后重试。"}, status_code=500)

    return JSONResponse(authority.transport.encrypt_response(result, path, key))


@router.post("/v2/activate")
async def activate(request: Request) -> Response:
    return await _dispatch(request, "activate")


@router.post("/v2/heartbeat")
async def heartbeat(request: Request) -> Response:
    return await _dispatch(request, "heartbeat")


@router.post("/v2/recover")
async def recover(request: Request) -> Response:
    return await _dispatch(request, "recover")
