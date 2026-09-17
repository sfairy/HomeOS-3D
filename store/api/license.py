"""授权服务器端点：``/v2/activate``、``/v2/heartbeat``、``/v2/recover``。

这三个端点与 `/store/v1` 的协议完全不同：请求与响应都是加密封套，
且错误响应是**明文** ``{"detail": "..."}``；确认吊销时额外带
``"revoked": true, "code": "REVOKED"``（客户端只认结构化字段）。
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from store.licensing.crypto import LicenseServerError
from store.request_security import resolve_client_ip

logger = logging.getLogger("store.license.api")

router = APIRouter(tags=["license"])


def _run_in_worker(
    authority, method: str, body, path: str, client_ip: str | None
) -> tuple[dict | None, LicenseServerError | None, str]:
    """在线程池里跑完「解密 → 业务 → 加密」，返回 ``(响应体, 错误, 阶段)``。

    为什么必须挪出事件循环：这三步全是**同步阻塞**的 —— 解封套与签名是 RSA/X25519
    运算，业务里还要开 SQLite 会话，而 SQLite 写锁争用时 ``busy_timeout`` 会一直阻塞
    到 5 秒。``async def`` 端点跑在事件循环上，这 5 秒内**整个服务**（包括其它端点的
    健康检查与静态资源）一起冻结。这三个端点又是匿名可达的，且当前没有限流（S22），
    天然适合用来把服务刷停。

    用 ``asyncio.to_thread`` 而不是改写成同步 ``def`` 端点：请求体是 **JSON**，
    而 FastAPI 的 ``Body(bytes)`` 只对非 JSON 的 content-type 生效（``bytes`` 类型的
    参数遇到 JSON 会被 pydantic 拒成 422），改签名就会连带改掉「非法 JSON 返回 400
    且带固定 detail」这条既有契约，客户端只认结构化字段，不能动。

    ``stage`` 让调用方复现与改动前一致的日志与状态码 —— 解密阶段与业务阶段的失败
    语义并不相同（前者一律 400「格式无效」，后者按业务状态码）。
    """
    stage = "decrypt"
    try:
        payload, key = authority.transport.decrypt_request(body, path)
        stage = "dispatch"
        result = getattr(authority, method)(payload, ip=client_ip)
    except LicenseServerError as error:
        return None, error, stage
    except Exception:  # noqa: BLE001 - 见 docstring：解密阶段的意外异常按「格式无效」处理
        if stage == "decrypt":
            return None, None, "invalid"
        raise
    return authority.transport.encrypt_response(result, path, key), None, ""


async def _dispatch(request: Request, method: str) -> Response:
    authority = request.app.state.license_authority
    path = request.url.path

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - 非法 JSON 一律 400
        return JSONResponse({"detail": "授权请求格式无效。"}, status_code=400)

    # 走统一解析：配了可信反向代理就取真实客户端地址，否则用 TCP 对端地址。
    # 授权记录里的 IP 是「这台机器在哪」的证据，代理后面取错等于全部记成同一个地址。
    client_ip = resolve_client_ip(request).ip or None
    try:
        response_body, error, stage = await asyncio.to_thread(
            _run_in_worker, authority, method, body, path, client_ip
        )
    except Exception:  # noqa: BLE001 - 服务端异常按 500 返回，客户端会切换端点重试
        logger.exception("授权端点内部错误 path=%s", path)
        return JSONResponse({"detail": "授权服务内部错误，请稍后重试。"}, status_code=500)

    if stage == "invalid":
        return JSONResponse({"detail": "授权请求格式无效。"}, status_code=400)
    if error is not None:
        if stage == "decrypt":
            logger.warning("授权请求解密失败 path=%s detail=%s", path, error.detail)
        else:
            logger.info(
                "授权请求被拒绝 path=%s status=%s detail=%s",
                path,
                error.status_code,
                error.detail,
            )
        return JSONResponse(error.as_body(), status_code=error.status_code)

    return JSONResponse(response_body)


@router.post("/v2/activate")
async def activate(request: Request) -> Response:
    return await _dispatch(request, "activate")


@router.post("/v2/heartbeat")
async def heartbeat(request: Request) -> Response:
    return await _dispatch(request, "heartbeat")


@router.post("/v2/recover")
async def recover(request: Request) -> Response:
    return await _dispatch(request, "recover")
