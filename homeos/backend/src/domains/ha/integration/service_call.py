"""HA 服务调用（``/ha/services/call``）的**唯一执行出口**（原先整段住在 ``api/ha.py``）。

为什么下沉到域内：``api/ha.py`` 与 3D 增量模块（``modules/interaction3d/api.py``）都要下发
HA 服务调用。原先 3D 模块直接 ``from ...api.ha import call_service`` 复用路由处理函数 ——
``modules → api`` 是反向依赖（路由层是入口，不是库），而且复用的是一个**带 FastAPI 依赖注入
签名**的处理函数，等于把 HTTP 层当成业务库用。

这里的切法：**校验 + 下发**进本模块，HTTP 语义留在 api 层。

- 校验失败用 ``ServiceCallRejected``（携带 ``status_code`` + ``detail``）表达 ——
  域内不 import FastAPI，但保留原有的**状态码与文案**，由 api 侧一行转成 ``HTTPException``，
  响应体字节级不变（前端与冒烟脚本依赖这些文案，不能顺手换错误码体系）。
- 实体级 ACL 是占位钩子（``dependencies.require_viewer_entity``，当前恒放行），
  故以 ``access_check`` 回调注入，避免域内 import ``dependencies``。
"""

from __future__ import annotations

import asyncio
import math
import re
import traceback
from collections.abc import Callable
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from .client import HAClientError
from .connection_query import active_connection
from .crypto import CredentialCipherError
from ...license import features as feature_codes
from ...proxy.command_proxy import build_service_call_dto, dispatch_service_call
from ...proxy.command_proxy_auth import RegistryTargetResolver, assert_command_proxy_authorized
from ....platform.core.database import Database
from ....platform.core.errors import BusinessException
from ....platform.core.ha_service_catalog import ALLOWED_SERVICES, TOGGLE_ENTITY_DOMAINS
from ....platform.core.models import HAConnection, HAEntity


class ServiceCallPayload(Protocol):
    """服务调用入参的**结构**契约（不 import ``schemas``：域层不认识 HTTP 契约模块）。

    ``api`` 侧传进来的就是 ``schemas.HAServiceCallRequest`` —— 它天然满足这个协议；
    这里只声明本模块真正读的四个字段，于是「域层不用为了一个类型注解去 import 上层」。
    """

    domain: str
    service: str
    entity_id: str
    data: dict[str, Any]
    #: 同一手势的幂等键（可选）。只有带键的调用才会被 ``CommandProxyService`` 去重，
    #: 这样「连按两次」仍会执行两次，而「同一请求被重发」只执行一次。
    idempotency_key: str | None


#: 域内表达 HTTP 结果用的状态码（与 FastAPI ``status`` 同值，但不 import 它）。
_FORBIDDEN = 403
_UNPROCESSABLE = 422
_CONFLICT = 409
_NOT_FOUND = 404
_BAD_GATEWAY = 502

#: TTS / 播放组里出现的"设备"必须是媒体实体。
MEDIA_PLAYER_PATTERN = re.compile(r'media_player\.[a-z0-9_]+')


class ServiceCallRejected(Exception):
    """服务调用被拒：``status_code`` + ``detail`` 由 api 层原样转成 ``HTTPException``。"""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def ha_entity_conditions(
    connection_id: str,
    entity_id: str,
    *,
    domain: str | None = None,
    enabled_only: bool = True,
) -> list[ColumnElement[bool]]:
    """HA 实体「本连接下存在且可用」的**唯一判定口径**。

    三处旧实现（本模块的 ``load_ha_entity_context``、``api/ha.py`` 的
    ``load_authorized_entity_context``、``modules/interaction3d/api.py`` 的
    ``_read_connection_and_entity``）条件一致但各写一遍：漏一个条件就是
    「已禁用 / 已失联的实体仍被当成可用」，线上排查时极难发现。
    这里只留一份，参数化差异点：

    - ``domain``：3D 控制路径按域校验（``light.living_room`` 不能冒充 ``cover``）。
    - ``enabled_only``：配置校验（保存模式 / 绑定面板）必须允许**已禁用**实体——否则
      用户连「把这台设备删掉」都做不到；运行时控制路径才要求未禁用。
    """
    conditions: list[ColumnElement[bool]] = [
        HAEntity.connection_id == connection_id,
        HAEntity.entity_id == entity_id,
        HAEntity.sync_status == 'active',
    ]
    if domain is not None:
        conditions.append(HAEntity.domain == domain)
    if enabled_only:
        conditions.append(HAEntity.disabled_by.is_(None))
    return conditions


def load_ha_entity_context(
    database_manager: Database,
    entity_id: str,
    access_check: Callable[[Session, str], None] | None = None,
    *,
    enabled_only: bool = True,
    domain: str | None = None,
) -> tuple[HAConnection | None, bool]:
    """连接 + 「实体是否可用」一次读完（同会话，避免两次开库）。

    ``access_check`` 是实体级 ACL 的注入点：api 层传入 ``require_viewer_entity``
    （占位实现，恒放行），域内因此不需要认识查看者类型。
    """
    with database_manager.session_factory() as database:
        if access_check is not None:
            access_check(database, entity_id)
        connection = active_connection(database)
        if connection is None:
            return None, False
        entity_exists = (
            database.scalar(
                select(HAEntity.id).where(
                    *ha_entity_conditions(
                        connection.id, entity_id, domain=domain, enabled_only=enabled_only
                    )
                )
            )
            is not None
        )
        database.expunge(connection)
        return connection, entity_exists


def _validate_service_call(payload: ServiceCallPayload) -> None:
    """白名单 + 参数字段 + 灯光参数 + 域匹配（全部为原先 ``call_service`` 的顺序与文案）。"""
    allowed_fields = ALLOWED_SERVICES.get((payload.domain, payload.service))
    if allowed_fields is None:
        raise ServiceCallRejected(_FORBIDDEN, '该 Home Assistant 服务不在允许列表中。')
    unknown_fields = set(payload.data) - allowed_fields
    if unknown_fields:
        unknown = ', '.join(sorted(unknown_fields))
        raise ServiceCallRejected(_UNPROCESSABLE, f'服务参数不允许：{unknown}')
    if payload.domain == 'light' and payload.service == 'turn_on':
        color_fields = {'white', 'hs_color', 'rgb_color', 'rgbw_color', 'rgbww_color', 'xy_color', 'color_temp_kelvin'} & set(payload.data)
        if len(color_fields) > 1:
            raise ServiceCallRejected(_UNPROCESSABLE, '一次灯光指令只能指定一种颜色或色温。')
        if 'white' in payload.data:
            white = payload.data['white']
            if not (isinstance(white, bool) or (isinstance(white, int) and 0 <= white <= 255)):
                raise ServiceCallRejected(_UNPROCESSABLE, '白光亮度参数无效。')
        for field, bounds in (
            ('hs_color', (360, 100)),
            ('rgb_color', (255, 255, 255)),
            ('rgbw_color', (255, 255, 255, 255)),
            ('rgbww_color', (255, 255, 255, 255, 255)),
            ('xy_color', (1, 1)),
        ):
            if field not in payload.data:
                continue
            values = payload.data[field]
            if (
                not isinstance(values, list)
                or len(values) != len(bounds)
                or any(
                    isinstance(v, bool)
                    or not isinstance(v, (int, float))
                    or not math.isfinite(v)
                    or not (0 <= v <= bound)
                    for v, bound in zip(values, bounds, strict=True)
                )
            ):
                raise ServiceCallRejected(_UNPROCESSABLE, f'灯光颜色参数无效：{field}')
    # 播放组：``group_members`` 只能是媒体实体，且不能把自身加进去（HA 会静默忽略，
    # 前端却会显示"已加入"，所以在这里直接拒）。
    if 'group_members' in payload.data:
        members = payload.data['group_members']
        if (
            not isinstance(members, list)
            or any(not isinstance(member, str) or not MEDIA_PLAYER_PATTERN.fullmatch(member) for member in members)
        ):
            raise ServiceCallRejected(_UNPROCESSABLE, '播放组成员必须是媒体实体。')
        if payload.entity_id in members:
            raise ServiceCallRejected(_UNPROCESSABLE, '不能把当前设备加入它自己的播放组。')
    # TTS 的播放设备必须是媒体实体（否则 HA 端会报"找不到实体"）。
    if 'media_player_entity_id' in payload.data:
        speaker = payload.data['media_player_entity_id']
        if not isinstance(speaker, str) or not MEDIA_PLAYER_PATTERN.fullmatch(speaker):
            raise ServiceCallRejected(_UNPROCESSABLE, '请选择播放设备。')
    # AI 任务附件：只校验形状，不下载（下载在 client 的 ``generate_image`` 链路里）。
    if 'attachments' in payload.data:
        attachments = payload.data['attachments']
        if not isinstance(attachments, list) or any(
            not isinstance(item, dict)
            or set(item) - {'media_content_id', 'media_content_type'}
            or not isinstance(item.get('media_content_id'), str)
            or not item['media_content_id']
            for item in attachments
        ):
            raise ServiceCallRejected(_UNPROCESSABLE, '附件参数无效。')
    entity_domain = payload.entity_id.partition('.')[0]
    if payload.domain == 'homeassistant' and payload.service == 'toggle' and entity_domain not in TOGGLE_ENTITY_DOMAINS:
        raise ServiceCallRejected(_UNPROCESSABLE, '该实体类型不支持切换动作。')
    if payload.domain != 'homeassistant' and entity_domain != payload.domain:
        raise ServiceCallRejected(_UNPROCESSABLE, '服务域与实体域不匹配。')


async def execute_service_call(
    request: Any,
    payload: ServiceCallPayload,
    *,
    access_check: Callable[[Session, str], None] | None = None,
) -> dict[str, Any]:
    """校验并发下发一次 HA 服务调用；被拒时抛 ``ServiceCallRejected``。

    ``request`` 是 Starlette ``Request``（只读 ``app.state`` / 写 ``state``），
    故不引 FastAPI 类型 —— 但保持与原先相同的诊断日志与状态码语义。
    """
    if not await asyncio.to_thread(
        request.app.state.license_service.allows, feature_codes.FEATURE_HA_CONTROL
    ):
        raise ServiceCallRejected(_FORBIDDEN, '当前授权不允许控制 Home Assistant。')
    _validate_service_call(payload)
    connection, entity_exists = await asyncio.to_thread(
        load_ha_entity_context,
        request.app.state.database,
        payload.entity_id,
        access_check,
    )
    if connection is None:
        raise ServiceCallRejected(_CONFLICT, '请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise ServiceCallRejected(_NOT_FOUND, '实体不存在、已禁用或已失联。')
    # 与 ``/services/call`` 共用实体级白名单（当前恒为空 → 恒放行）。
    await assert_command_proxy_authorized(
        {
            'domain': payload.domain,
            'service': payload.service,
            'entity_id': payload.entity_id,
            'service_data': payload.data,
        },
        None,
        RegistryTargetResolver(request),
    )
    try:
        # 唯一执行出口：CommandProxyService（幂等去重 → 高风险拦截 → HA 下发）。
        envelope = await dispatch_service_call(
            request.app.state.command_proxy,
            build_service_call_dto(
                domain=payload.domain,
                service=payload.service,
                entity_id=payload.entity_id,
                service_data=payload.data,
                idempotency_key=payload.idempotency_key,
            ),
        )
        result = envelope.get('data') if isinstance(envelope, dict) else envelope
    except (BusinessException, HAClientError, CredentialCipherError) as error:
        request.state.diagnostic_error_logged = True
        request.app.state.global_log.append(
            'error',
            '仪表盘编辑器',
            '设备操作',
            f'操作失败：{payload.entity_id} · {payload.domain}.{payload.service} · {error}',
            context={
                'entityId': payload.entity_id,
                'service': f'{payload.domain}.{payload.service}',
                'status': _BAD_GATEWAY,
            },
            details=traceback.format_exc(),
        )
        raise ServiceCallRejected(_BAD_GATEWAY, str(error)) from error
    request.app.state.global_log.append(
        'success',
        '仪表盘编辑器',
        '设备操作',
        f'操作成功：{payload.entity_id} · {payload.domain}.{payload.service}',
        context={
            'entityId': payload.entity_id,
            'service': f'{payload.domain}.{payload.service}',
        },
    )
    return {'ok': True, 'result': result}


__all__ = ["ServiceCallPayload", "ServiceCallRejected", "execute_service_call", "load_ha_entity_context"]
