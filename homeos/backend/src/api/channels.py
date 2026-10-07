"""消息通道路由（``/api/v1/channels/*``），对齐 Nest ``ChannelsController`` + ``WecomController``。

包含：
- ``GET  /channels/status``                    三通道运行状态（admin/adult）
- ``GET  /channels/webpush/vapid-public-key``  VAPID 公钥下发（admin/adult/child）
- ``GET  /channels/webpush/subscriptions``     订阅设备列表（admin/adult）
- ``POST /channels/webpush/subscribe``         注册订阅（admin/adult/child，Nest 默认 201）
- ``DELETE /channels/webpush/subscribe``       取消订阅（admin/adult/child）
- ``POST /channels/webpush/test``              测试推送（admin/adult，Nest 默认 201）
- ``GET/POST /channels/wecom/callback``        企业微信回调（@Public，无 JWT，CSRF 已豁免）
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from typing import Any

from fastapi import Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict

from ..dependencies import license_feature
from ..security.auth_context import require_roles
from ..services.channels.wecom_crypto import compute_msg_signature, decrypt_wecom
from ..services.license import features as feature_codes

logger = logging.getLogger("homeos.api.channels")

from .router import NestRouter

#: 通道状态与订阅管理路由（前缀 ``/channels``）——与通知中心同属 ``module.notifications``。
router = NestRouter(
    prefix="/channels",
    tags=["channels"],
    dependencies=[license_feature(feature_codes.FEATURE_NOTIFICATIONS)],
)
#: 企业微信回调路由（前缀 ``/channels/wecom``）：公开回调无 JWT，不加模块门禁。
wecom_router = NestRouter(prefix="/channels/wecom", tags=["channels"])


class WebPushSubscribeDto(BaseModel):
    """``POST /channels/webpush/subscribe`` 请求体。"""

    model_config = ConfigDict(extra="ignore")

    endpoint: Any = None
    keys: Any = None
    userAgent: Any = None
    label: Any = None


class WebPushTestDto(BaseModel):
    """``POST /channels/webpush/test`` 请求体（endpoint 可选）。"""

    model_config = ConfigDict(extra="ignore")

    endpoint: Any = None


class WebPushUnsubscribeDto(BaseModel):
    """``DELETE /channels/webpush/subscribe`` 请求体（endpoint 可选，query 优先）。"""

    model_config = ConfigDict(extra="ignore")

    endpoint: Any = None


def _channels(request: Request):
    return request.app.state.channels_service


def _webpush(request: Request):
    return request.app.state.web_push_service


def _wecom(request: Request):
    return request.app.state.wecom_service


# --------------------------------------------------------------------------- #
# 通道状态 / WebPush 订阅管理
# --------------------------------------------------------------------------- #
@router.get("/status")
async def status(
    request: Request,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """智能管家消息通道状态（Email / WebPush / 企业微信）。"""
    return await _channels(request).get_status()


@router.get("/webpush/vapid-public-key")
async def vapid_public_key(
    request: Request,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """下发 WebPush VAPID 公钥，供前端 Service Worker 注册推送订阅。"""
    return {"publicKey": await _webpush(request).get_public_key()}


@router.get("/webpush/subscriptions")
async def list_subscriptions(
    request: Request,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """列出已注册的 WebPush 订阅设备。"""
    return {"items": _webpush(request).list_subscriptions()}


@router.post("/webpush/subscribe")
async def subscribe(
    dto: WebPushSubscribeDto,
    request: Request,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """注册 WebPush 订阅：endpoint + keys 持久化 + 内存缓存。"""
    user_agent = dto.userAgent
    if not (isinstance(user_agent, str) and user_agent.strip()):
        user_agent = request.headers.get("user-agent")
    await _webpush(request).register_subscription(
        endpoint=str(dto.endpoint or ""),
        keys=dto.keys if isinstance(dto.keys, dict) else {},
        user_agent=user_agent if isinstance(user_agent, str) else None,
        label=dto.label if isinstance(dto.label, str) else None,
    )
    return {"ok": True}


@router.delete("/webpush/subscribe")
async def unsubscribe(
    request: Request,
    endpoint: str | None = Query(default=None),
    dto: WebPushUnsubscribeDto | None = None,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    """取消 WebPush 订阅：支持 query 或 body 传 endpoint；为空时静默返回 ok。"""
    target = endpoint or (dto.endpoint if dto and isinstance(dto.endpoint, str) else "") or ""
    if target:
        await _webpush(request).unregister_subscription(str(target))
    return {"ok": True}


@router.post("/webpush/test")
async def test_push(
    request: Request,
    dto: WebPushTestDto | None = None,
    _user: dict[str, Any] = Depends(require_roles("admin", "adult")),
):
    """发送 WebPush 测试通知；指定 endpoint 则单设备推送，否则全部订阅者。"""
    target = dto.endpoint if dto and isinstance(dto.endpoint, str) else None
    return await _webpush(request).send_test(target)


# --------------------------------------------------------------------------- #
# 企业微信回调（@Public）
# --------------------------------------------------------------------------- #
def _signature_matches(local: str | None, remote: str | None) -> bool:
    """恒定时间比较企微签名；长度不等直接判不匹配。"""
    import hmac

    if not local or not remote:
        return False
    left, right = local.encode("utf-8"), remote.encode("utf-8")
    if len(left) != len(right):
        return False
    return hmac.compare_digest(left, right)


def _text(body: str, status_code: int = 200) -> Response:
    """Express ``res.send(string)`` 等价响应（Content-Type: text/html）。"""
    return Response(content=body, status_code=status_code, media_type="text/html")


def _xml_field(raw_body: str, *names: str) -> dict[str, str]:
    """从企微回调 XML 中提取首个命名字段（缺失即不返回该键）。"""
    out: dict[str, str] = {}
    try:
        root = ET.fromstring(raw_body)
    except ET.ParseError:
        return out
    node = root if root.tag == "xml" else root
    wanted = set(names)
    for child in node:
        if child.tag in wanted and child.tag not in out and child.text is not None:
            out[child.tag] = child.text.strip()
    return out


@wecom_router.get("/callback")
async def verify_url(
    request: Request,
    msg_signature: str | None = Query(default=None),
    timestamp: str | None = Query(default=None),
    nonce: str | None = Query(default=None),
    echostr: str | None = Query(default=None),
):
    """企微 URL 验证（GET）：校验签名后用 aesKey 解密 echostr 并回显明文。"""
    security = _wecom(request).get_security_config()
    token, aes_key = security.get("token"), security.get("aesKey")
    if not token or not aes_key:
        return _text("配置缺失", 500)
    local = compute_msg_signature(
        str(token), str(timestamp or ""), str(nonce or ""), str(echostr or "")
    )
    if not _signature_matches(local, msg_signature):
        logger.warning("企微 URL 验证签名失败")
        return _text("禁止访问", 403)
    try:
        decrypted = decrypt_wecom(str(aes_key), str(echostr or ""))
        return _text(str(decrypted["msg"]))
    except Exception as exc:  # noqa: BLE001
        logger.error("解密 echostr 失败: %s", exc)
        return _text("解密失败", 500)


@wecom_router.post("/callback")
async def handle_callback(
    request: Request,
    msg_signature: str | None = Query(default=None),
    timestamp: str | None = Query(default=None),
    nonce: str | None = Query(default=None),
):
    """企微消息回调（POST）：校验签名 → AES 解密 → 解析 XML → 委托 WecomService。"""
    security = _wecom(request).get_security_config()
    token, aes_key = security.get("token"), security.get("aesKey")
    if not token or not aes_key:
        return _text("配置缺失", 500)
    try:
        raw_body = (await request.body()).decode("utf-8", errors="replace")
        if not raw_body:
            return _text("请求无效", 400)
        outer = _xml_field(raw_body, "Encrypt")
        encrypt = outer.get("Encrypt")
        if not encrypt:
            return _text("无效的 XML", 400)
        local = compute_msg_signature(str(token), str(timestamp or ""), str(nonce or ""), encrypt)
        if not _signature_matches(local, msg_signature):
            return _text("禁止访问", 403)
        decrypted_xml = str(decrypt_wecom(str(aes_key), encrypt)["msg"])
        inner = _xml_field(decrypted_xml, "FromUserName", "Content", "MsgType")
        if inner.get("MsgType") == "text" and inner.get("FromUserName") and inner.get("Content"):
            import asyncio

            task = asyncio.ensure_future(
                _wecom(request).handle_incoming_message(
                    inner["FromUserName"], inner["Content"]
                )
            )

            def _log_failure(fut: Any) -> None:
                if not fut.cancelled() and fut.exception() is not None:
                    logger.error("异步处理企微消息失败: %s", fut.exception())

            task.add_done_callback(_log_failure)
        return _text("success")
    except Exception as exc:  # noqa: BLE001
        logger.error("处理企微 POST 回调失败: %s", exc)
        return _text("内部错误", 500)


__all__ = ["router", "wecom_router"]
