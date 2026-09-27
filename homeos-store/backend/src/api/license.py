
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from src.licensing.crypto import LicenseServerError
from src.security.limiter import SlidingWindowLimiter
from src.security.request_security import resolve_client_ip

logger = logging.getLogger("src.license.api")

router = APIRouter(tags=["license"])

_LICENSE_ACTIVATE_IP_LIMITER = SlidingWindowLimiter(limit=60, window_seconds=3600.0)
_LICENSE_CODE_LIMITER = SlidingWindowLimiter(limit=30, window_seconds=3600.0)

#: heartbeat / recover 的 IP 桶按 ``limit`` 缓存实例（见下）。
_LICENSE_SESSION_IP_LIMITERS: dict[int, SlidingWindowLimiter] = {}


def _session_ip_limiter(limit: int) -> SlidingWindowLimiter:
    """heartbeat / recover 的来源 IP 配额。
    """
    bounded = max(1, int(limit))
    cached = _LICENSE_SESSION_IP_LIMITERS.get(bounded)
    if cached is None:
        cached = SlidingWindowLimiter(limit=bounded, window_seconds=3600.0)
        _LICENSE_SESSION_IP_LIMITERS[bounded] = cached
    return cached


def _retry_after_value(seconds: float | None) -> str:
    """把剩余等待时间格式化成 ``Retry-After`` 的值（至少 1 秒）。
    """
    return str(max(1, int(seconds or 0) or 1))


def _rate_limited(retry_after: float | None) -> JSONResponse:
    return JSONResponse(
        {"detail": "请求过于频繁，请稍后再试。"},
        status_code=429,
        headers={"Retry-After": _retry_after_value(retry_after)},
    )


def _run_in_worker(
    authority, method: str, body, path: str, client_ip: str | None
) -> tuple[dict | None, LicenseServerError | None, str]:
    """在线程池里跑完「解密 → 业务 → 加密」，返回 ``(响应体, 错误, 阶段)``。
    """
    stage = "decrypt"
    try:
        generation = authority.keyring.find((body or {}).get("keyId"))
        if generation is None:
            # 与 ``TransportCipher.decrypt_request`` 里那条同文案：对客户端来说
            raise LicenseServerError("授权传输 keyId 不匹配。", status_code=400)
        payload, key = generation.transport.decrypt_request(body, path)
        stage = "dispatch"
        code = str((payload or {}).get("activationCode") or "").strip().upper()
        if code and not _LICENSE_CODE_LIMITER.allow(f"code:{code}"):
            logger.warning("授权端点限流：激活码维度触顶 path=%s", path)
            return (
                None,
                LicenseServerError(
                    "请求过于频繁，请稍后再试。",
                    status_code=429,
                    retry_after=_LICENSE_CODE_LIMITER.retry_after(f"code:{code}"),
                ),
                "dispatch",
            )
        result = getattr(authority, method)(payload, ip=client_ip, generation=generation)
    except LicenseServerError as error:
        return None, error, stage
    except Exception:  # noqa: BLE001 - 见 docstring：解密阶段的意外异常按「格式无效」处理
        if stage == "decrypt":
            return None, None, "invalid"
        raise
    return generation.transport.encrypt_response(result, path, key), None, ""


async def _dispatch(request: Request, method: str) -> Response:
    authority = request.app.state.license_authority
    path = request.url.path

    # 按来源 IP 限流，放在读请求体之前，「连解析都不做」就能挡掉洪水。桶按端点选：
    try:
        address = resolve_client_ip(request)
    except Exception:  # noqa: BLE001 - 解析异常不该让授权端点整体不可用
        address = None
    if address is not None and address.per_client and address.ip:
        if method == "activate":
            limiter = _LICENSE_ACTIVATE_IP_LIMITER
        else:
            limiter = _session_ip_limiter(
                request.app.state.settings.license_session_ip_hourly_limit
            )
        ip_key = f"ip:{address.ip}"
        if not limiter.allow(ip_key):
            logger.warning("授权端点限流：来源 IP 触顶 path=%s ip=%s", path, address.ip)
            return _rate_limited(limiter.retry_after(ip_key))

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 - 非法 JSON 一律 400
        return JSONResponse({"detail": "授权请求格式无效。"}, status_code=400)

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
        return JSONResponse(
            error.as_body(),
            status_code=error.status_code,
            headers=(
                {"Retry-After": _retry_after_value(error.retry_after)}
                if error.retry_after is not None
                else None
            ),
        )

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
