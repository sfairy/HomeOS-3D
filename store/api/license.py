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
from store.limiter import SlidingWindowLimiter
from store.request_security import resolve_client_ip

logger = logging.getLogger("store.license.api")

router = APIRouter(tags=["license"])

#: S22：``/v2/*`` 是**匿名可达**的，且每一步都要做 RSA/X25519 运算 —— 不限流的话
#: 既是 CPU 耗尽的放大器，也让「猜激活码」变得廉价（激活码就是授权凭据本身）。
#:
#: 两个维度，对应两种攻击：
#: * **按来源 IP**：兜住单机暴力跑
#: * **按激活码**：兜住换 IP 集中猜同一个码（IP 维度挡不住）
#:
#: 每次心跳都会走这三个端点，所以额度必须比「发信」类接口宽松得多：
#: 一台已激活的客户端按 300s 心跳间隔算，一小时也就 12 次。取 60/IP/小时
#: 与 30/激活码/小时，对正常使用绰绰有余（含重试与多台同网设备）。
#: 与其它限流器一样是进程内计数，见 ``store/limiter.py`` 的取舍说明。
_LICENSE_IP_LIMITER = SlidingWindowLimiter(limit=60, window_seconds=3600.0)
_LICENSE_CODE_LIMITER = SlidingWindowLimiter(limit=30, window_seconds=3600.0)


def _run_in_worker(
    authority, method: str, body, path: str, client_ip: str | None
) -> tuple[dict | None, LicenseServerError | None, str]:
    """在线程池里跑完「解密 → 业务 → 加密」，返回 ``(响应体, 错误, 阶段)``。

    为什么必须挪出事件循环：这三步全是**同步阻塞**的 —— 解封套与签名是 RSA/X25519
    运算，业务里还要开 SQLite 会话，而 SQLite 写锁争用时 ``busy_timeout`` 会一直阻塞
    到 5 秒。``async def`` 端点跑在事件循环上，这 5 秒内**整个服务**（包括其它端点的
    健康检查与静态资源）一起冻结。这三个端点又是匿名可达的（限流见 S22），
    天然适合用来把服务刷停。

    用 ``asyncio.to_thread`` 而不是改写成同步 ``def`` 端点：请求体是 **JSON**，
    而 FastAPI 的 ``Body(bytes)`` 只对非 JSON 的 content-type 生效（``bytes`` 类型的
    参数遇到 JSON 会被 pydantic 拒成 422），改签名就会连带改掉「非法 JSON 返回 400
    且带固定 detail」这条既有契约，客户端只认结构化字段，不能动。

    ``stage`` 让调用方复现与改动前一致的日志与状态码 —— 解密阶段与业务阶段的失败
    语义并不相同（前者一律 400「格式无效」，后者按业务状态码）。

    **S22 里的「按激活码限流」只能在这里做**：激活码在**加密载荷内部**，HTTP 层
    根本看不到它（这正是协议的设计）。所以解密之后立刻配额，超限就以
    ``LicenseServerError`` 的形式返回 —— 不在这里抛 ``HTTPException``，
    因为上面那层 ``except Exception`` 会把它吞成 500。

    **S52：先按请求里的 keyId 选代，再解密**。选中的那一代既用来解密，也用来签
    本次的租约（``generation`` 透传给业务方法）。不选代而固定用当前一代，重叠窗口
    就形同虚设：旧客户端送的是上一代 keyId，响应却由新密钥签发，它只会回
    「不受信任的授权公钥」。
    """
    stage = "decrypt"
    try:
        generation = authority.keyring.find((body or {}).get("keyId"))
        if generation is None:
            # 与 ``TransportCipher.decrypt_request`` 里那条同文案：对客户端来说
            # 「keyId 不认识」与「解不开」是同一类问题，没必要区分。
            raise LicenseServerError("授权传输 keyId 不匹配。", status_code=400)
        payload, key = generation.transport.decrypt_request(body, path)
        stage = "dispatch"
        code = str((payload or {}).get("activationCode") or "").strip().upper()
        if code and not _LICENSE_CODE_LIMITER.allow(f"code:{code}"):
            logger.warning("授权端点限流：激活码维度触顶 path=%s", path)
            return (
                None,
                LicenseServerError("请求过于频繁，请稍后再试。", status_code=429),
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

    # S22：按来源 IP 限流。放在读请求体之前，这样「连解析都不做」就能挡掉洪水。
    # IP 用 resolve_client_ip 的解析结果（只在可信代理后面才采信转发头）——
    # 与验证码回显、登录限流共用同一套来源判定，避免「限流按 A 算、其它按 B 算」
    # 这类漂移，而伪造 X-Forwarded-For 正是绕开它们的手法。
    try:
        address = resolve_client_ip(request)
    except Exception:  # noqa: BLE001 - 解析异常不该让授权端点整体不可用
        address = None
    if address is not None and address.per_client and address.ip:
        if not _LICENSE_IP_LIMITER.allow(f"ip:{address.ip}"):
            logger.warning("授权端点限流：来源 IP 触顶 path=%s ip=%s", path, address.ip)
            return JSONResponse(
                {"detail": "请求过于频繁，请稍后再试。"}, status_code=429
            )

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
