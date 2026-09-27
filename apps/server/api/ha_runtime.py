"""运行期 WebSocket 子系统：订阅、可见性守卫、首帧竞速与消息下发。

从 api/ha.py 拆出来：那一份只留 HTTP 路由，而这一份是**长连接**（runtime_router 挂在同一个
应用上，但没有 /ha 前缀）。长连接的状态机（谁在看、能不能看、几路任务先到）与逐请求的 HTTP
编排是两件事，拆开之后两边各自的失败模式也互不干扰。
"""
from __future__ import annotations

import asyncio
import time
import traceback
from uuid import uuid4

from anyio import create_task_group
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..security.access import admin_token_from, discard_expired_session, display_token_from, resolve_principal
from ..security.dependencies import ViewerPrincipal, viewer_entity_ids
from ..security.display_access import active_display_device
from ..security.http_security import origin_allowed
from ..observability.global_log import event_context


# 实时连接单独一个 router：不带 /ha 前缀，挂在 /api/v1/ws/runtime 下。
runtime_router = APIRouter(tags=['runtime'])
# 单条实时连接最多订阅的实体数：正常页面几十个，1000 已经远超合理范围。
MAX_RUNTIME_ENTITIES = 1000
# 中控配对状态的缓存窗口（秒）。展示页的心跳是秒级的，不缓存就等于每秒查一次库。
DISPLAY_BINDING_CACHE_SECONDS = 1
def websocket_viewer(websocket: WebSocket) -> ViewerPrincipal | None:
    """从 WebSocket 握手的 Cookie 解析访问主体。

    与 HTTP 侧共用 ``access.resolve_principal``（WebSocket 不走依赖注入，不能自己再实现一遍
    会话与配对校验）。管理员会话优先；两者都拿不到返回 None，调用方以 4401 关闭连接。
    """
    settings = websocket.app.state.settings
    with websocket.app.state.database.session_factory() as database:
        resolution = resolve_principal(
            database,
            settings,
            admin_token=admin_token_from(websocket.cookies, settings),
            display_token=display_token_from(websocket.cookies, settings),
            account_user_id=websocket.app.state.admin_account.user_id,
        )
        discard_expired_session(database, resolution.admin)
        viewer = resolution.viewer
        if not resolution.authenticated:
            return None
        # 解析完就 detach：这条连接可能挂很久，不能把数据库连接占住。
        if viewer.user is not None:
            database.expunge(viewer.user)
        else:
            database.expunge(viewer.display)
        return viewer
class DisplayBindingGuard:
    """实时连接期间复查「中控配对是否仍然有效」，结果带短缓存。

    配对可能在连接期间被解绑或改绑，因此推送循环每轮都要确认；心跳是秒级的，
    不缓存就等于每秒查一次库。缓存挂在实例上而不是闭包里，作用域清晰且可单独测。
    """

    def __init__(self, websocket: WebSocket, viewer: ViewerPrincipal) -> None:
        self._websocket = websocket
        self._viewer = viewer
        self._cached: tuple[float, bool] | None = None

    async def matches(self) -> bool:
        """配对是否仍然有效；管理员连接恒为 True（没有配对可言）。"""
        if self._viewer.display is None:
            return True
        moment = time.monotonic()
        if self._cached is not None and moment - self._cached[0] < DISPLAY_BINDING_CACHE_SECONDS:
            return self._cached[1]
        matches = await asyncio.to_thread(self._load)
        self._cached = (time.monotonic(), matches)
        return matches

    def _load(self) -> bool:
        """重新读 Cookie 解析当前配对，确认设备与项目都没被改。

        走的是与 HTTP 侧同一个 active_display_device：令牌过期在这里也是
        「不一致」，连接会按改绑处理（4401 关闭）。
        """
        settings = self._websocket.app.state.settings
        with self._websocket.app.state.database.session_factory() as database:
            current = active_display_device(
                database,
                settings,
                display_token_from(self._websocket.cookies, settings),
            )
            return bool(
                current is not None
                and current.id == self._viewer.display.id
                and current.project_id == self._viewer.display.project_id
            )
async def run_tasks_until_first_completes(*operations) -> None:
    """并行跑几路任务，任一路结束后取消其余，并把真正的异常原样抛出。

    实时连接的两路任务谁先结束都要收掉另一路；真正的异常先到的优先（后到的那路已被取消）。
    ``WebSocketDisconnect`` 原样抛出，由调用方按关闭码决定记不记警告。
    """
    failure: Exception | None = None

    async with create_task_group() as tasks:

        async def run(operation) -> None:
            nonlocal failure
            try:
                await operation()
            except Exception as error:  # noqa: BLE001 - 要按类型分流，不能直接往外抛
                # 真正的异常要保留，先到的优先（后到的那一路此刻已被取消）。
                # WebSocketDisconnect 是「客户端主动断开」的常规信号，不让它盖住真正的异常。
                if failure is None or not isinstance(error, WebSocketDisconnect):
                    failure = error
            finally:
                tasks.cancel_scope.cancel()
            return None

        for operation in operations:
            tasks.start_soon(run, operation)
    # 异常在任务组退出后再抛出：此时两路任务都已收尾，不会有并发写入。
    if failure is not None:
        raise failure
    return None
def websocket_origin_allowed(websocket: WebSocket) -> bool:
    """校验 WebSocket 握手的 Origin 是否来自本应用主机。

    与 HTTP 侧共用 :func:`http_security.origin_allowed` 同一套加固规则（含 ``app_base_url``
    与「拒绝带 userinfo / 路径 / 查询的 Origin」）。两侧各写一套时规则会漂移：原先 WS 这份
    不查 ``app_base_url``，反代部署下会把合法连接判成跨站而全部拒掉。

    与 ``same_origin_request`` 的唯一差别是**这里缺 Origin 一律拒绝**：浏览器一定会带 Origin，
    而 WebSocket 握手不受 SameSite Cookie 保护（不存在 CSRF 头那道闸），所以缺头只能理解为
    非浏览器客户端，必须挡在门外。
    """
    origin = websocket.headers.get('origin', '').strip()
    if not origin:
        return False
    return origin_allowed(websocket, origin)
@runtime_router.websocket('/ws/runtime')
async def runtime_websocket(websocket: WebSocket) -> None:
    """实时状态推送 WebSocket 的入口壳：建上下文、兜异常、还原上下文。

    连接级异常先记一条日志再抛出，保证连接被正常关闭且错误不会被吞；
    真正的握手与推送逻辑在 _runtime_websocket 里。
    """
    # 手工造一份与 HTTP 中间件同形的上下文，让 WS 相关的日志也能带上 requestId。
    context = {
        'requestId': uuid4().hex,
        'path': '/api/v1/ws/runtime',
        'method': 'WEBSOCKET',
    }
    # 绑定到当前任务：连接期间产生的所有日志都会自动带上这份上下文。
    token = event_context.set(context)
    try:
        await _runtime_websocket(websocket, context)
    except Exception as error:
        _runtime_log(
            websocket,
            'error',
            f'实时连接异常：{error}',
            context,
            details=traceback.format_exc(),
        )
        raise
    finally:
        # 协程结束必须还原 ContextVar，否则同一 worker 的后续请求会串到这份上下文。
        event_context.reset(token)
    return None
def _runtime_log(
    websocket: WebSocket,
    level: str,
    message: str,
    context: dict,
    *,
    details: str | None = None,
) -> None:
    """写一条实时连接日志；global_log 未挂载时静默跳过。

    来源按上下文推断：有 displayId 是展示设备，有 actor 是仪表盘编辑器，都没有才算系统后台。
    """
    log = getattr(websocket.app.state, 'global_log', None)
    # 不做硬依赖：测试或极简启动时可能就没有全局日志组件。
    if log is not None:
        source = (
            '展示设备'
            if context.get('displayId')
            else ('仪表盘编辑器' if context.get('actor') else '系统后台')
        )
        log.append(level, source, '实时连接', message, context=context, details=details)
    return None
async def _runtime_send_json(websocket: WebSocket, payload: dict) -> None:
    """安全地发一条 JSON；连接已关闭时转成 WebSocketDisconnect。

    Starlette 在 close 之后再 send 会抛 RuntimeError，且只能按文案区分，
    这里把已知的几种文案统一翻译成断连信号，让上层走正常的收尾流程。
    """
    try:
        await websocket.send_json(payload)
    except RuntimeError as error:
        # 这些文案是 Starlette 各版本的历史产物，匹配不上就原样抛出，不吞错。
        if str(error) in {
            'Cannot call "send" once a close message has been sent.',
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close'.",
            "Unexpected ASGI message 'websocket.send', after sending 'websocket.close' or response already completed.",
        }:
            raise WebSocketDisconnect(code=1006) from error
        raise
    return None
async def _runtime_websocket(websocket: WebSocket, context: dict) -> None:
    """实时状态连接的主流程。

    握手依次校验 Origin → 身份（管理员 Cookie 会话或中控配对）→ runtime.websocket 能力码，
    任一不过就以 44xx 关闭（4401 未认证、4403 被拒、4400 协议错误）；随后要求 30 秒内发
    subscribe（带 entityIds），再推 snapshot 与增量事件并用 ping 保活。
    """
    async def close_with_log(code: int, reason: str, *, send_reason: bool = True) -> None:
        """关闭连接前先记一条日志。

        send_reason=False 时不把内部原因回给客户端，避免泄露实现细节；
        日志里始终保留完整原因。
        """
        _runtime_log(
            websocket,
            'warning',
            f'实时连接已关闭：{reason}',
            {**context, 'code': str(code), 'phase': 'rejected'},
        )
        await websocket.close(code=code, reason=reason if send_reason else None)
        return None

    # Origin 不合法按 4403（禁止）处理，且不回传原因。
    if not websocket_origin_allowed(websocket):
        await close_with_log(4403, 'origin not allowed')
        return None
    # 同步查库放到线程里，别阻塞事件循环。
    viewer = await asyncio.to_thread(websocket_viewer, websocket)
    if viewer is None:
        # 4401 表示未认证，客户端应引导用户去登录或完成配对。
        await close_with_log(4401, 'authentication required', send_reason=False)
        return None
    # 把身份写进上下文：这条连接后续产生的日志都能标出是谁在看。
    if viewer.user is not None:
        context['actor'] = getattr(viewer.user, 'username', None)
    if viewer.display is not None:
        context.update(
            displayId=viewer.display.id,
            displayName=getattr(viewer.display, 'name', None),
            projectId=viewer.display.project_id,
        )
    # 实时推送是独立能力码：没有它时看板仍可用 HTTP 轮询，只是没有推送。
    if not await asyncio.to_thread(websocket.app.state.license_service.allows, 'runtime.websocket'):
        await close_with_log(4403, 'license restricted', send_reason=False)
        return None
    await websocket.accept()
    _runtime_log(websocket, 'info', '实时连接已建立', {**context, 'phase': 'accepted'})
    # 每条连接一个订阅队列，广播由 state_hub 统一分发。
    queue = websocket.app.state.ha_connector.state_hub.subscribe()
    entity_ids = set()
    # 标记是否已登记监听：决定收尾时要不要撤销，避免撤销未登记过的订阅。
    watching = False
    # 配对复查器：内部做短缓存，见 DisplayBindingGuard。
    binding_guard = DisplayBindingGuard(websocket, viewer)

    try:
        # 30 秒内必须订阅：否则按超时关闭，防止空连接长期占着资源。
        subscribe = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        if subscribe.get('type') != 'subscribe' or not isinstance(subscribe.get('entityIds'), list):
            await close_with_log(4400, 'subscribe message required')
            return None
        entity_ids = {str(value) for value in subscribe['entityIds'] if isinstance(value, str)}
        if viewer.project_id is not None:

            def load_allowed_entity_ids() -> set[str]:
                """中控设备可见的实体集合。"""
                with websocket.app.state.database.session_factory() as database:
                    return viewer_entity_ids(database, viewer) or set()

            allowed_entity_ids = await asyncio.to_thread(load_allowed_entity_ids)
            # 越界的订阅直接剪掉而不是报错：前端可能整页订阅，剪掉后仍能正常显示。
            entity_ids.intersection_update(allowed_entity_ids)
        # 订阅上限：一次连接关心上千个实体基本是异常用法。
        if len(entity_ids) > MAX_RUNTIME_ENTITIES:
            await close_with_log(4400, 'too many entities')
            return None
        websocket.app.state.ha_connector.state_hub.set_subscription_entities(queue, entity_ids)
        # ensure_states=False：先登记监听，状态按需补全，避免订阅瞬间发起大量回源。
        await websocket.app.state.ha_connector.add_runtime_entity_watch(entity_ids, ensure_states=False)
        watching = True

        async def send_updates() -> None:
            """推送初始快照，然后持续转发状态事件并保活。"""
            initial_snapshot = await websocket.app.state.ha_connector.state_hub.snapshot(entity_ids)
            await _runtime_send_json(websocket, {'type': 'snapshot', 'states': initial_snapshot})
            # 先推内存里的快照让界面尽快有数据，再补全状态；有变化就补推一次。
            await websocket.app.state.ha_connector.ensure_entity_states(entity_ids)
            hydrated_snapshot = await websocket.app.state.ha_connector.state_hub.snapshot(entity_ids)
            if hydrated_snapshot != initial_snapshot:
                await _runtime_send_json(websocket, {'type': 'snapshot', 'states': hydrated_snapshot})
            while True:
                # 每次循环都确认配对没变；改绑后立即断开，避免旧屏继续看到别的项目数据。
                if not await binding_guard.matches():
                    await close_with_log(4401, 'display pairing changed')
                    return None
                try:
                    # 展示设备用 5 秒心跳（要更快发现改绑），编辑器用 25 秒减少无意义唤醒。
                    event = await asyncio.wait_for(queue.get(), timeout=5 if viewer.display else 25)
                except TimeoutError:
                    if not await binding_guard.matches():
                        await close_with_log(4401, 'display pairing changed')
                        return None
                    await _runtime_send_json(websocket, {'type': 'ping'})
                    continue
                if not await binding_guard.matches():
                    await close_with_log(4401, 'display pairing changed')
                    return None
                await _runtime_send_json(websocket, event)
            return None

        async def receive_disconnect() -> None:
            """另一路任务只负责感知客户端断开。"""
            while True:
                message = await websocket.receive()
                if message['type'] == 'websocket.disconnect':
                    raise WebSocketDisconnect(code=message.get('code', 1000))

        # 两路任务谁先结束就取消另一路；真正的异常由它原样抛回，交给下面的 except 分流。
        await run_tasks_until_first_completes(receive_disconnect, send_updates)
    except WebSocketDisconnect as error:
        # 1000/1001/1005 是正常关闭码，不记警告 —— 否则刷新一次页面就刷出一条告警。
        if error.code not in {1000, 1001, 1005}:
            _runtime_log(
                websocket,
                'warning',
                '实时连接异常断开',
                {**context, 'code': str(error.code), 'phase': 'disconnected'},
            )
    except TimeoutError:
        # wait_for 的订阅超时也冒泡到这里，单独记一条便于和普通断连区分。
        _runtime_log(
            websocket,
            'warning',
            '实时连接等待订阅超时',
            {**context, 'code': 'SUBSCRIBE_TIMEOUT', 'phase': 'subscribe'},
        )
    finally:
        try:
            # 只有真正开始监听后才需要撤销登记。
            if watching:
                await websocket.app.state.ha_connector.remove_runtime_entity_watch(entity_ids)
        finally:
            # 退订必须执行，否则 state_hub 的队列会随连接数一直累积。
            websocket.app.state.ha_connector.state_hub.unsubscribe(queue)
    return None
