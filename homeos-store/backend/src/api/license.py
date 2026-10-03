
from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from ..licensing.crypto import LicenseServerError
from ..security.limiter import SlidingWindowLimiter
from ..security.request_security import resolve_client_ip

logger = logging.getLogger("src.license.api")

router = APIRouter(tags=["license"])

_LICENSE_ACTIVATE_IP_LIMITER = SlidingWindowLimiter(limit=60, window_seconds=3600.0)
_LICENSE_CODE_LIMITER = SlidingWindowLimiter(limit=30, window_seconds=3600.0)
#: 公钥分发只是读文件，配额给得宽一些，够挡住脚本刷。
_LICENSE_KEYS_IP_LIMITER = SlidingWindowLimiter(limit=240, window_seconds=3600.0)

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
        # 桶键带上来源 IP：只按激活码计数的话，知道某个用户激活码的人可以把它刷满，
        # 让该用户在 1 小时内无法激活（合法用户被 DoS）。
        code_key = f"code:{code}:{client_ip or '-'}" if code else ""
        if code_key and not _LICENSE_CODE_LIMITER.allow(code_key):
            logger.warning("授权端点限流：激活码维度触顶 path=%s", path)
            return (
                None,
                LicenseServerError(
                    "请求过于频繁，请稍后再试。",
                    status_code=429,
                    retry_after=_LICENSE_CODE_LIMITER.retry_after(code_key),
                ),
                "dispatch",
            )
        result = getattr(authority, method)(payload, ip=client_ip, generation=generation)
    except LicenseServerError as error:
        return None, error, stage
    except Exception:
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
    except Exception:
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
    except Exception:
        return JSONResponse({"detail": "授权请求格式无效。"}, status_code=400)

    # 复用上面已解析的地址，不再二次调用 resolve_client_ip（那次没包 try/except，
    # 解析异常会直接冒成 500，与上面的容错写法不一致）。
    client_ip = address.ip if address is not None and address.ip else None
    try:
        response_body, error, stage = await asyncio.to_thread(
            _run_in_worker, authority, method, body, path, client_ip
        )
    except Exception:
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


def _read_public_pem(path: Path) -> tuple[str, str] | None:
    """读 PEM 公钥，返回 ``(文本, 文件字节的 sha256)``；缺失或不是 PEM 时返回 ``None``。

    指纹按**文件字节**算，与 ``keyId`` 的派生口径（``licensing.keys.key_id_from_public``）
    一致；主应用拿它做首次固定的信任锚。
    """
    try:
        payload = path.read_bytes()
    except OSError:
        return None
    if b"-----BEGIN PUBLIC KEY-----" not in payload:
        return None
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return text, hashlib.sha256(payload).hexdigest()


@router.get("/v2/keys")
def public_keys(request: Request) -> Response:
    """分发授权公钥（Ed25519 验签 + X25519 传输），供主应用自举信任锚。

    这是**唯一**的明文授权端点：主应用首次启动时还没有传输公钥，无法加解密，
    只能直接读。公钥不是秘密 —— 租约真伪由 Ed25519 验签保证，泄露公钥不构成风险；
    响应里只有 PEM 与指纹，绝不涉及私钥。
    """
    settings = request.app.state.settings
    try:
        address = resolve_client_ip(request)
    except Exception:
        address = None
    if address is not None and address.per_client and address.ip:
        ip_key = f"ip:{address.ip}"
        if not _LICENSE_KEYS_IP_LIMITER.allow(ip_key):
            logger.warning("公钥分发限流：来源 IP 触顶 ip=%s", address.ip)
            return _rate_limited(_LICENSE_KEYS_IP_LIMITER.retry_after(ip_key))

    signing = _read_public_pem(settings.public_key_path)
    transport = _read_public_pem(settings.transport_public_key_path)
    if signing is None or transport is None:
        # 密钥还没准备好：回 503 让主应用按网络故障重试，而不是缓存一份残缺结果。
        logger.warning("公钥分发失败：密钥文件缺失或不是 PEM %s", settings.license_keys_dir)
        return JSONResponse(
            {"detail": "授权公钥尚未就绪，请稍后重试。"},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    signing_text, signing_sha256 = signing
    transport_text, transport_sha256 = transport
    return JSONResponse(
        {
            "product": "homeos",
            "keyId": settings.license_key_id,
            "transportKeyId": settings.license_transport_key_id,
            "licensePublicKey": signing_text,
            "licenseTransportPublicKey": transport_text,
            "licensePublicKeySha256": signing_sha256,
            "licenseTransportPublicKeySha256": transport_sha256,
        },
        headers={"Cache-Control": "no-store"},
    )
