"""go2rtc MSE 同源中继（``/api/v1/go2rtc/ws``）。

浏览器无法直连局域网 go2rtc 的信令端口：HTTPS 页面连 ``ws://`` 会被 mixed-content 拦下，
内网地址也不该由前端随手拼。这里让前端只上报「哪个仪表盘的哪个摄像头」，
地址由服务端从已保存的 ``ProjectDraft`` 里取，再经白名单归一后反代。

- ``normalize_go2rtc_target``：把用户填的 ``stream.html?src=…`` 归一成信令 ``ws(s)://…/api/ws?src=…``。
  试验期只接受**字面量**私有/回环/链路本地 IP，避免这个中继退化成通用 SSRF 代理。
- ``saved_camera_target``：服务端权威取址。前端只传 ``projectId``/``componentId``/``cameraId``，
  绝不接受前端传来的目标地址。Studio 的仪表盘文档与 Vue 安防页的布局方案（``ProjectConfig.layout``）
  两条来源都查，取到哪条用哪条。
- ``go2rtc_websocket``：鉴权 → 取址 → 双向泵。客户端只能发 ``{"type":"mse","value":"<编解码串>"}``
  这一种信令；长连期间按秒复检登录态与授权，摄像头从配置里被移除或改源就立刻断开。
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import urlsplit

from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.typing import Origin

from .ha import websocket_origin_allowed, websocket_viewer
from .router import NestRouter
from ..dependencies import require_viewer_project
from ..domains.license import features as feature_codes
from ..domains.proxy.go2rtc_target import normalize_go2rtc_target
from ..domains.proxy.ws_proxy import ssl_context_for
from ..platform.core.models import ProjectDraft

logger = logging.getLogger("homeos.api.go2rtc")

router = NestRouter(prefix="/go2rtc", tags=["realtime"], include_in_schema=False)

#: 关闭码（与 api/ws_proxy.py 的约定保持一致）。
CLOSE_BAD_REQUEST = 4400
CLOSE_UNAUTHORIZED = 4401
CLOSE_FORBIDDEN = 4403
#: 信令帧超过 256 KiB 视为异常（正常编解码协商只有几十字节）。
CLOSE_TOO_LARGE = 1009

#: 单条客户端信令上限。
MAX_SIGNALING_BYTES = 256 * 1024
#: 上游 go2rtc 的 MSE 分段单帧上限（8 MiB），小了下行会整帧被丢。
UPSTREAM_MAX_MESSAGE_SIZE = 8 * 1024 * 1024
#: 上游连接超时（秒）。
UPSTREAM_OPEN_TIMEOUT = 10
#: 长连期间复检登录态 / 授权的间隔（秒）。
ACCESS_RECHECK_SECONDS = 1.0

#: 客户端允许发送的 MSE 协商串（``avc1.640029,mp4a.40.2`` 之类）。
SIGNALING_CODECS_PATTERN = re.compile(r"[A-Za-z0-9.,_-]{1,512}")

#: 允许作为中继目标的组件类型。
RELAY_COMPONENT_TYPES = frozenset({"camera", "interaction3d"})


def _layout_camera_go2rtc_url(cameras: Any, camera_id: str) -> str | None:
    """在布局方案的 ``securityCameras`` 里按前端上报的 key 找回这一路的 go2rtc 地址。

    Vue 安防页绑定的 key 有两种：有 HA 实体时就是实体 ID，只有 go2rtc 地址时是
    ``go2rtc:<索引>``（与前端 ``MonitorPanel`` 生成的 key 一致）。旧数据里的裸
    ``string`` 项按实体 ID 处理。

    ``<索引>`` 必须与前端一致：前端先经 ``normalizeSecurityCameras`` 丢掉 ``null`` /
    非对象卡位**再**编号，所以这里也只给「能成为绑定项的卡位」计数，否则存了空位的
    布局会错位到别人那一路上（表现为该路永远取不到址、直接 4403）。
    """
    if not isinstance(cameras, list) or not camera_id:
        return None
    binding_index = 0
    for item in cameras:
        is_legacy_string = isinstance(item, str)
        if not is_legacy_string and not isinstance(item, dict):
            continue
        index = binding_index
        binding_index += 1
        if is_legacy_string:
            if item.strip() == camera_id:
                return ""
            continue
        entity_id = str(item.get("entityId") or "").strip()
        if (entity_id and entity_id == camera_id) or camera_id == f"go2rtc:{index}":
            return str(item.get("go2rtcUrl") or "").strip()
    return None


def _saved_layout_camera_target(
    websocket: WebSocket, project_id: str, camera_id: str
) -> str | None:
    """Vue 安防页取址：摄像头绑定存在布局方案（``ProjectConfig.layout``）里。

    与 Studio 的仪表盘文档是两条独立的轴：仪表盘看 ``/projects``，布局方案看
    ``/config/project/active``。地址同样只信服务端保存的 ``go2rtcUrl``。
    """
    service = getattr(websocket.app.state, "ui_config", None)
    if service is None:
        return None
    resolved_project_id = project_id or service.resolve_active_project_id()
    layout = (service.get_config(resolved_project_id) or {}).get("layout")
    if not isinstance(layout, dict):
        return None
    ha_config = layout.get("haConfig")
    if not isinstance(ha_config, dict):
        return None
    raw_url = _layout_camera_go2rtc_url(ha_config.get("securityCameras"), camera_id)
    if raw_url is None:
        return None
    if not raw_url:
        raise ValueError("摄像头未选择 go2rtc 来源。")
    return normalize_go2rtc_target(raw_url)


def saved_camera_target(websocket: WebSocket, viewer: Any) -> str:
    """从已保存的配置里取出该摄像头的 go2rtc 信令地址。

    先查 Studio 的仪表盘文档（``ProjectDraft.document_json``），再回落到 Vue 安防页
    的布局方案（``ProjectConfig.layout``）。前端只传 ID；地址永远以服务端保存的
    ``go2rtcUrl`` 为准并再次归一，因此前端无法借这个中继去连任意主机。
    """
    project_id = websocket.query_params.get("projectId", "")
    component_id = websocket.query_params.get("componentId", "")
    camera_id = websocket.query_params.get("cameraId", "")
    require_viewer_project(viewer, project_id)

    with websocket.app.state.database.session_factory() as database:
        draft = database.get(ProjectDraft, project_id)
        document = json.loads(draft.document_json) if draft else {}

    def walk(items: Any) -> str | None:
        for item in items:
            if item.get("id") == component_id and item.get("type") in RELAY_COMPONENT_TYPES:
                properties = item.get("properties", {})
                if item.get("type") == "interaction3d":
                    service = websocket.app.state.license_service
                    if not (
                        service.allows(feature_codes.FEATURE_EDITOR)
                        or service.allows(feature_codes.FEATURE_INTERACTION_3D)
                    ):
                        raise ValueError("3D 交互授权不可用。")
                    properties = next(
                        (
                            camera
                            for camera in properties.get("security", {}).get("cameras", [])
                            if camera.get("id") == camera_id
                        ),
                        {},
                    )
                    if properties.get("visible") is False:
                        raise ValueError("摄像头已隐藏。")
                elif camera_id:
                    # 2D 摄像头控件没有「标记 id」这一层，前端不该传 cameraId。
                    raise ValueError("摄像头目标类型不匹配。")
                if properties.get("cameraSource") != "go2rtc":
                    raise ValueError("摄像头未选择 go2rtc 来源。")
                return normalize_go2rtc_target(properties.get("go2rtcUrl", ""))
            child = walk(item.get("children", []))
            if child:
                return child
        return None

    for items in [
        document.get("sharedComponents", []),
        *(page.get("components", []) for page in document.get("pages", [])),
    ]:
        target = walk(items)
        if target:
            return target
    # 仪表盘文档里没有：Vue 安防页的绑定在布局方案里。
    layout_target = _saved_layout_camera_target(websocket, project_id, camera_id)
    if layout_target:
        return layout_target
    raise ValueError("请先保存 go2rtc 摄像头配置。")


def _resolve_camera_target(websocket: WebSocket, viewer: Any) -> str | None:
    """取址的「拒绝即 4403」包装：来源不允许时返回 ``None``，由调用方按终态关闭。

    为什么必须包一层：``saved_camera_target`` 之后（``websocket.accept()`` 之前）抛出的
    ``ValueError`` 会直接冒泡成未处理异常 —— 客户端拿到的是握手失败而不是约定的关闭码，
    前端 `{4400,4401,4403}` 的终态语义失效，会一直按退避重连打转（用户看到画面永远转圈）。
    未保存 / 未选 go2rtc / 已隐藏 / 类型不匹配 / 地址被白名单拒（外网主机名、公网 IP、
    带账号密码、非 ``/stream.html``、缺 ``src``）都走这里。

    捕获范围还包含 ``AttributeError`` / ``TypeError`` / ``KeyError``：这三个不是「拒绝」，
    而是**文档形状异常**（手改过的库、旧版本表单，例如 ``security`` 是数组、组件项是字符串）。
    对它们同样只能给终态关闭码 —— 换成未处理异常就退化成同一条无限重连的故障，只是入口不同。
    真正的后端故障（数据库、IO）不在此列，仍按 5xx 冒泡出来。
    """
    try:
        return saved_camera_target(websocket, viewer)
    except (ValueError, AttributeError, TypeError, KeyError):
        logger.debug("go2rtc 取址被拒", exc_info=True)
        return None


async def _close(websocket: WebSocket, code: int, reason: str) -> None:
    try:
        await websocket.close(code=code, reason=reason)
    except RuntimeError:
        # 已经关过了：close 会抛 RuntimeError，这里只当幂等处理。
        pass


@router.websocket("/ws")
async def go2rtc_websocket(websocket: WebSocket) -> None:
    """go2rtc MSE 信令 + 数据同源中继。"""
    if not websocket_origin_allowed(websocket):
        await _close(websocket, CLOSE_FORBIDDEN, "origin not allowed")
        return
    # websocket_viewer / license_service.allows 都是同步阻塞调用，必须挪到线程里。
    viewer = await asyncio.to_thread(websocket_viewer, websocket)
    if viewer is None:
        await _close(websocket, CLOSE_UNAUTHORIZED, "authentication required")
        return
    if not await asyncio.to_thread(
        websocket.app.state.license_service.allows, feature_codes.FEATURE_RUNTIME_WEBSOCKET
    ):
        await _close(websocket, CLOSE_FORBIDDEN, "license restricted")
        return
    target = await asyncio.to_thread(_resolve_camera_target, websocket, viewer)
    if target is None:
        await _close(websocket, CLOSE_FORBIDDEN, "camera source not allowed")
        return
    await websocket.accept()

    # go2rtc 会校验 Origin；上游是内网直连，带上与上游同源的 origin 即可。
    origin = Origin(f"{'https' if target.startswith('wss:') else 'http'}://{urlsplit(target).netloc}")
    try:
        async with connect(
            target,
            origin=origin,
            ssl=ssl_context_for(target),
            open_timeout=UPSTREAM_OPEN_TIMEOUT,
            max_size=UPSTREAM_MAX_MESSAGE_SIZE,
        ) as upstream:

            async def client_to_upstream() -> None:
                while True:
                    message = await websocket.receive_text()
                    if len(message) > MAX_SIGNALING_BYTES:
                        await _close(websocket, CLOSE_TOO_LARGE, "signaling message too large")
                        return
                    try:
                        request = json.loads(message)
                        codecs = request.get("value")
                        if (
                            request.get("type") != "mse"
                            or not isinstance(codecs, str)
                            or not SIGNALING_CODECS_PATTERN.fullmatch(codecs)
                        ):
                            raise ValueError("unsupported media request")
                    except (ValueError, AttributeError):
                        # 只放行 MSE 协商这一种信令：其余一律关闭，避免把它当中继去转发任意帧。
                        await _close(websocket, CLOSE_BAD_REQUEST, "unsupported media request")
                        return
                    await upstream.send(json.dumps({"type": "mse", "value": codecs}))

            async def upstream_to_client() -> None:
                async for message in upstream:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            async def guard_access() -> None:
                """长连复检：授权还在、登录会话没换、摄像头来源没被改掉。"""
                while True:
                    await asyncio.sleep(ACCESS_RECHECK_SECONDS)
                    current = await asyncio.to_thread(websocket_viewer, websocket)
                    allowed = await asyncio.to_thread(
                        websocket.app.state.license_service.allows,
                        feature_codes.FEATURE_RUNTIME_WEBSOCKET,
                    )
                    try:
                        current_target = (
                            await asyncio.to_thread(saved_camera_target, websocket, current)
                            if current
                            else None
                        )
                    except Exception:
                        current_target = None
                    if not allowed or current_target != target:
                        await _close(websocket, CLOSE_FORBIDDEN, "camera access revoked")
                        return

            tasks = [
                asyncio.create_task(client_to_upstream()),
                asyncio.create_task(upstream_to_client()),
                asyncio.create_task(guard_access()),
            ]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            await websocket.close()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("go2rtc 中继已关闭", exc_info=True)
        await _close(websocket, CLOSE_FORBIDDEN, "camera source not allowed")


__all__ = ["normalize_go2rtc_target", "router", "saved_camera_target"]
