"""go2rtc MSE 同源中继（``/api/v1/go2rtc/ws``）。

浏览器无法直连局域网 go2rtc 的信令端口：HTTPS 页面连 ``ws://`` 会被 mixed-content 拦下，
内网地址也不该由前端随手拼。这里让前端只上报「哪个仪表盘的哪个摄像头」，
地址由服务端从已保存的 ``ProjectDraft`` 里取，再经白名单归一后反代。

- ``normalize_go2rtc_target``：把用户填的 ``stream.html?src=…`` 归一成信令 ``ws(s)://…/api/ws?src=…``。
  只接受**字面量**私有/回环/链路本地 IP，避免这个中继退化成通用 SSRF 代理。
- ``validate_camera_source_addresses``：保存期校验生效中的 2D 摄像头地址（不连摄像头），
  让「地址无需失焦也能存」成立；遗留的非法草稿仍可打开继续编辑。
- ``go2rtc_connection_error`` / ``go2rtc_stream_error``：把上游异常翻译成稳定错误码 + 用户文案，
  地址类片段一律打码成 ``[视频源]``，再由 ``log_go2rtc_error`` 落到全局日志。
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
import traceback
from typing import Any
from urllib.parse import urlsplit

from fastapi import WebSocket, WebSocketDisconnect
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus
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

#: go2rtc 中转故障的稳定错误码：前端据此分类提示，日志据此检索。
GO2RTC_CONNECT_TIMEOUT = "GO2RTC_CONNECT_TIMEOUT"
GO2RTC_CONNECT_REFUSED = "GO2RTC_CONNECT_REFUSED"
GO2RTC_CONNECT_DENIED = "GO2RTC_CONNECT_DENIED"
GO2RTC_HANDSHAKE_FAILED = "GO2RTC_HANDSHAKE_FAILED"
GO2RTC_NETWORK_FAILED = "GO2RTC_NETWORK_FAILED"
GO2RTC_RELAY_FAILED = "GO2RTC_RELAY_FAILED"
GO2RTC_STREAM_FAILED = "GO2RTC_STREAM_FAILED"

#: 上游错误里出现这些地址形态时整段打码：日志与前端提示都不应回显视频源地址。
GO2RTC_SOURCE_URL_PATTERN = re.compile(r"(?i)\b(?:rtsps?|https?)://[^\s\"'<>]+")
GO2RTC_SOURCE_PARAM_PATTERN = re.compile(r"(?i)\b(?:src|url|rtsp)=[^\s\"'&<>]+")
GO2RTC_SOURCE_MASK = "[视频源]"
#: 单条用户可见原因的长度上限（全局日志单条 1000 字符，这里留足余量）。
MAX_GO2RTC_REASON_CHARS = 400

#: 摄像头组件在文档里的归属判定：``type`` 必须命中，且来源正指向 go2rtc。
CAMERA_COMPONENT_TYPE = "camera"
CAMERA_SOURCE_KEY = "cameraSource"
GO2RTC_CAMERA_SOURCE = "go2rtc"
GO2RTC_URL_KEY = "go2rtcUrl"
#: 组件名兜底：中文引号与标签都可能缺失，最后退到组件 id。
COMPONENT_LABEL_KEY = "label"

#: 打码后的兜底原因：上游没给出可用文本时也要说明「流起不来」。
GO2RTC_STREAM_FALLBACK = "go2rtc 无法输出视频，请检查视频源和 MSE 编码支持。"

#: 连接期失败（尚未进入中继）与中继期失败的区分标记。
_HTTP_DENIED_STATUS = frozenset({401, 403})

# 文案口径：其中两处自指用 **HA Bridge** 品牌名（而不是「HomeOS」）——前端同源的摄像头
# 说明文案（`home-camera-inspector.ts` / `EditorMediaInspectors.vue` 的「视频经 HA Bridge
# 中转」）也是这个词。改回「HomeOS」会让同一条视频链路在界面里出现两种叫法。


def go2rtc_connection_error(error: BaseException) -> tuple[str, str]:
    """把「连不上 go2rtc」的异常翻译成 ``(错误码, 用户可见文案)``。

    分支顺序即判定优先级：``TimeoutError`` / ``ConnectionRefusedError`` 都是
    ``OSError`` 的子类，必须排在兜底 ``OSError`` 之前。
    """
    if isinstance(error, TimeoutError):
        return (
            GO2RTC_CONNECT_TIMEOUT,
            (
                "HA Bridge 连接 go2rtc 超时，请检查 HA Bridge 所在容器"
                "能否访问 go2rtc 的 IP 和端口。"
            ),
        )
    if isinstance(error, ConnectionRefusedError):
        return (
            GO2RTC_CONNECT_REFUSED,
            "go2rtc 拒绝连接，请检查网页播放地址中的端口是否开放。",
        )
    if isinstance(error, InvalidStatus):
        status = error.response.status_code
        if status in _HTTP_DENIED_STATUS:
            return (
                GO2RTC_CONNECT_DENIED,
                (
                    f"go2rtc 拒绝中转访问（HTTP {status}），"
                    "请检查 go2rtc 的认证和访问限制。"
                ),
            )
        return (
            GO2RTC_HANDSHAKE_FAILED,
            (
                f"go2rtc WebSocket 握手失败（HTTP {status}），"
                "请检查该地址是否支持 /api/ws。"
            ),
        )
    if isinstance(error, OSError):
        return (
            GO2RTC_NETWORK_FAILED,
            "HA Bridge 无法连接 go2rtc，请检查容器网络、IP 和端口。",
        )
    return (
        GO2RTC_RELAY_FAILED,
        "go2rtc 中转连接中断，请检查 go2rtc 服务日志。",
    )


def go2rtc_stream_error(value: Any) -> str:
    """渲染上游流错误，并把地址类片段打码成 ``[视频源]``。"""
    reason = GO2RTC_SOURCE_URL_PATTERN.sub(GO2RTC_SOURCE_MASK, str(value or ""))
    reason = GO2RTC_SOURCE_PARAM_PATTERN.sub(GO2RTC_SOURCE_MASK, reason)
    reason = reason.replace("\x00", "").strip()[:MAX_GO2RTC_REASON_CHARS]
    if not reason:
        return GO2RTC_STREAM_FALLBACK
    return f"go2rtc 无法输出视频：{reason}"


def log_go2rtc_error(
    websocket: WebSocket,
    code: str,
    message: str,
    *,
    details: str | None = None,
) -> None:
    """把中转故障写进全局日志：失败必须留下可检索痕迹，但不能影响断连流程。"""
    app = getattr(websocket, "app", None)
    global_log = getattr(getattr(app, "state", None), "global_log", None)
    if global_log is None:
        return
    try:
        global_log.append(
            "error",
            "go2rtc-relay",
            "摄像头",
            message,
            context={"code": code},
            details=details,
        )
    except Exception:  # pragma: no cover - 日志故障不能反过来打断断连
        logger.debug("go2rtc 故障写入全局日志失败", exc_info=True)


def _iter_document_components(document: Any) -> Any:
    """遍历 Studio 仪表盘文档里的全部组件（共享组件 + 每页组件，递归 children）。"""
    if not isinstance(document, dict):
        return
    stack: list[Any] = []
    shared = document.get("sharedComponents")
    if isinstance(shared, list):
        stack.extend(shared)
    pages = document.get("pages")
    if isinstance(pages, list):
        for page in pages:
            components = page.get("components") if isinstance(page, dict) else None
            if isinstance(components, list):
                stack.extend(components)
    while stack:
        component = stack.pop()
        if not isinstance(component, dict):
            continue
        yield component
        children = component.get("children")
        if isinstance(children, list):
            stack.extend(children)


def validate_camera_source_addresses(document: Any) -> None:
    """校验仪表盘文档里「生效中」的 2D 摄像头地址，失败抛 ``ValueError``。

    规则：只检查 ``cameraSource`` 正指向 go2rtc 的摄像头组件——**已停用**的地址
    保留下来，用户切回 go2rtc 时不必重填。

    保存时校验、不连摄像头：只做字面量与格式判定，因此不需要真的能连通；
    遗留的非法草稿也不会被读路径拒绝，仍可打开继续编辑。
    """
    for component in _iter_document_components(document):
        properties = component.get("properties")
        if not isinstance(properties, dict):
            continue
        if component.get("type") != CAMERA_COMPONENT_TYPE:
            continue
        if properties.get(CAMERA_SOURCE_KEY) != GO2RTC_CAMERA_SOURCE:
            continue
        try:
            normalize_go2rtc_target(properties.get(GO2RTC_URL_KEY, ""))
        except ValueError as error:
            label = properties.get(COMPONENT_LABEL_KEY) or component.get("id")
            raise ValueError(f"摄像头“{label}”的{error}") from error


def _layout_camera_go2rtc_url(cameras: Any, camera_id: str) -> str | None:
    """在布局方案的 ``securityCameras`` 里按前端上报的 key 找回这一路的 go2rtc 地址。

    Vue 安防页绑定的 key 有两种：有 HA 实体时就是实体 ID，只有 go2rtc 地址时是
    ``go2rtc:<索引>``（与前端 ``MonitorPanel`` 生成的 key 一致）。

    ``<索引>`` 必须与前端一致：前端先经 ``normalizeSecurityCameras`` 丢掉 ``null`` /
    非对象卡位**再**编号，所以这里也只给「能成为绑定项的卡位」计数，否则存了空位的
    布局会错位到别人那一路上（表现为该路永远取不到址、直接 4403）。
    """
    if not isinstance(cameras, list) or not camera_id:
        return None
    binding_index = 0
    for item in cameras:
        if not isinstance(item, dict):
            continue
        index = binding_index
        binding_index += 1
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
    而是**文档形状异常**（手改过的库或错位的表单数据，例如 ``security`` 是数组）。
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


async def _pump_client_to_upstream(websocket: WebSocket, upstream: Any) -> None:
    """客户端 → 上游：只放行 MSE 协商信令，其余一律按终态关闭。"""
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


async def _pump_upstream_to_client(websocket: WebSocket, upstream: Any) -> None:
    """上游 → 客户端：二进制分片与文本消息原样透传。"""
    async for message in upstream:
        if isinstance(message, bytes):
            await websocket.send_bytes(message)
        else:
            await websocket.send_text(message)


async def _guard_go2rtc_access(websocket: WebSocket, target: str) -> None:
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


async def _relay_go2rtc_stream(websocket: WebSocket, target: str) -> None:
    """建立上游连接并三路并发中继，把连接期 / 中继期错误翻译成稳定错误码。"""
    # go2rtc 会校验 Origin；上游是内网直连，带上与上游同源的 origin 即可。
    origin = Origin(f"{'https' if target.startswith('wss:') else 'http'}://{urlsplit(target).netloc}")
    # 连接期与中继期的失败原因完全不同，用这个标记区分后再翻译错误码。
    upstream_connected = False
    try:
        async with connect(
            target,
            origin=origin,
            ssl=ssl_context_for(target),
            open_timeout=UPSTREAM_OPEN_TIMEOUT,
            max_size=UPSTREAM_MAX_MESSAGE_SIZE,
        ) as upstream:
            upstream_connected = True
            tasks = [
                asyncio.create_task(_pump_client_to_upstream(websocket, upstream)),
                asyncio.create_task(_pump_upstream_to_client(websocket, upstream)),
                asyncio.create_task(_guard_go2rtc_access(websocket, target)),
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
    except Exception as error:
        if upstream_connected:
            # 已经握上手再断，是「流起不来」而不是「连不上」，别把用户引到 IP/端口上。
            code, message = GO2RTC_STREAM_FAILED, go2rtc_stream_error(error)
        else:
            code, message = go2rtc_connection_error(error)
        logger.debug("go2rtc 中继已关闭：%s", code, exc_info=True)
        log_go2rtc_error(websocket, code, message, details=traceback.format_exc())
        await _close(websocket, CLOSE_FORBIDDEN, "camera source not allowed")


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
    await _relay_go2rtc_stream(websocket, target)


__all__ = [
    "GO2RTC_CONNECT_DENIED",
    "GO2RTC_CONNECT_REFUSED",
    "GO2RTC_CONNECT_TIMEOUT",
    "GO2RTC_HANDSHAKE_FAILED",
    "GO2RTC_NETWORK_FAILED",
    "GO2RTC_RELAY_FAILED",
    "GO2RTC_SOURCE_MASK",
    "GO2RTC_STREAM_FAILED",
    "go2rtc_connection_error",
    "go2rtc_stream_error",
    "log_go2rtc_error",
    "normalize_go2rtc_target",
    "router",
    "saved_camera_target",
    "validate_camera_source_addresses",
]
