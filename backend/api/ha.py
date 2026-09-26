"""Home Assistant 集成的主接口面：连接配置、目录查询、历史、同步与设备控制。

HA 能力码分三档（读接口只要求 api）：ha.control（调服务 / 浏览媒体）、ha.sync
（触发目录同步，会批量改库）、ha.configure（保存 / 删除连接，会改地址与 Token）。

中控设备的可见范围由 dependencies 层收窄：涉及实体的查询都经过 viewer_entity_ids。
runtime_router 提供 /ws/runtime 实时状态推送，用心跳与配对复查维持长连接。
"""
from __future__ import annotations

import asyncio
import json
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from anyio import create_task_group
from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, or_, select

from ..security.access import admin_token_from, discard_expired_session, display_token_from, resolve_principal
from ..core.database import Database
from ..security.dependencies import DatabaseSession, LicensedUser, LicensedViewer, ViewerPrincipal, require_viewer_entity, viewer_entity_ids
from ..security.display_access import active_display_device
from ..security.http_security import origin_allowed
from ..observability.global_log import event_context
from ..ha.client import HAClient, HAClientError, link_local_address
from ..ha.endpoints import HAEndpoint, endpoint_candidates
from ..ha.crypto import CredentialCipherError
from ..core.models import HAArea, HAConnection, HADevice, HAEntity, HASyncState, User
from ..panel.action_rules import TOGGLE_ENTITY_DOMAINS
from ..core.schemas import HABrowseMediaRequest, HAConnectionInput, HAServiceCallRequest, HATestRequest

router = APIRouter(prefix='/ha', tags=['home-assistant'])
# 实时连接单独一个 router：不带 /ha 前缀，挂在 /api/v1/ws/runtime 下。
runtime_router = APIRouter(tags=['runtime'])
# 单条实时连接最多订阅的实体数：正常页面几十个，1000 已经远超合理范围。
MAX_RUNTIME_ENTITIES = 1000
# 中控配对状态的缓存窗口（秒）。展示页的心跳是秒级的，不缓存就等于每秒查一次库。
DISPLAY_BINDING_CACHE_SECONDS = 1
#: `/ha/test` 的尝试预算 (max_failures, window_seconds, block_seconds)。
#: 这个端点让**服务端**按请求里给的地址与 Token 发一次出网请求（TCP + TLS + 认证握手），
#: 是内网任意地址的探测器。此前只有「管理员 + 授权允许 api」两道门禁、不限次数：
#: 拿着管理员会话就能把它当端口扫描器用，或者单纯用它把家宽出口打满。
HA_TEST_LIMIT = (20, 60, 120)
#: 键空间上限：键是账号 id，外部造不出来；仍用带键上限的计数器，与其它键来自外部的
#: 计数器保持同一套纪律。
HA_TEST_KEYS = 1024
# 服务调用白名单：键为 (domain, service)，值为允许透传的参数名（空集表示不接受参数）。
# 只有列在这里的组合才能被前端调用，多传的参数会被拒绝 —— 前端被篡改也无法把 HA 任意服务当远程执行入口。
ALLOWED_SERVICES: dict[tuple[str, str], set[str]] = {
    # 门锁：modules/interaction3d/api.py 的 lock 分支放行这三个服务（另有一道
    # lock.py 的 validate_lock_command 复核能力位与密码），参数只有 code。
    # 这三条必须在这里也登记 —— 那条分支最后同样落到本函数，漏一条门锁面板就是每次
    # 上锁 / 解锁 / 释放锁舌都 403，而前端只显示一句笼统的失败。
    ('lock', 'lock'): {'code'},
    ('lock', 'unlock'): {'code'},
    ('lock', 'open'): {'code'},
    ('homeassistant', 'toggle'): set(),
    ('button', 'press'): set(),
    # 附加实体的 input_* 变体：purifier.py 的 EXTRA_TYPES 把 input_button / input_boolean /
    # input_select 分别映射成 button / switch / select 并放行命令，通用设备与净化器的附加
    # 功能卡片也照这张表渲染。它们的域与 button / switch / select 不同，必须逐条登记，
    # 否则卡片可点、命令却卡在这里。
    ('input_button', 'press'): set(),
    ('input_boolean', 'turn_on'): set(),
    ('input_boolean', 'turn_off'): set(),
    ('input_select', 'select_option'): {'option'},
    ('script', 'turn_on'): set(),
    ('light', 'turn_on'): {'rgb_color', 'hs_color', 'brightness', 'transition', 'brightness_pct', 'color_temp_kelvin'},
    ('light', 'turn_off'): {'transition'},
    ('switch', 'turn_on'): set(),
    ('switch', 'turn_off'): set(),
    ('cover', 'open_cover'): set(),
    ('cover', 'close_cover'): set(),
    ('cover', 'stop_cover'): set(),
    ('cover', 'set_cover_position'): {'position'},
    ('cover', 'open_cover_tilt'): set(),
    ('cover', 'close_cover_tilt'): set(),
    ('cover', 'stop_cover_tilt'): set(),
    ('cover', 'set_cover_tilt_position'): {'tilt_position'},
    ('climate', 'set_temperature'): {'temperature'},
    ('climate', 'set_hvac_mode'): {'hvac_mode'},
    ('climate', 'set_fan_mode'): {'fan_mode'},
    ('climate', 'set_swing_mode'): {'swing_mode'},
    # 上下摆风与左右摆风是两条独立服务，不是同一件事的别名。2D 空调面板在实体上报
    # swing_horizontal_modes 时会渲染「水平摆风」一组（见
    # renderer/core/panel-renderer/device-controls/climate.js），参数名是
    # swing_horizontal_mode。漏这一条 → 该组每次点都是 403，面板只回显一句笼统的失败。
    ('climate', 'set_swing_horizontal_mode'): {'swing_horizontal_mode'},
    ('climate', 'set_preset_mode'): {'preset_mode'},
    # 3D 面板在「没有可恢复模式」时发它，让设备自己回到默认模式（见
    # modules/interaction3d/climate.py 的 CLIMATE_SERVICES 说明）。参数为空集。
    ('climate', 'turn_on'): set(),
    ('water_heater', 'turn_on'): set(),
    ('water_heater', 'turn_off'): set(),
    ('water_heater', 'set_temperature'): {'temperature'},
    ('water_heater', 'set_operation_mode'): {'operation_mode'},
    ('fan', 'set_percentage'): {'percentage'},
    ('fan', 'set_preset_mode'): {'preset_mode'},
    # 净化器面板的摆头与前后吹向：参数名与 purifier.py 的 validate_purifier_command 一一对应。
    ('fan', 'oscillate'): {'oscillating'},
    ('fan', 'set_direction'): {'direction'},
    ('fan', 'turn_on'): set(),
    ('fan', 'turn_off'): set(),
    ('number', 'set_value'): {'value'},
    ('input_number', 'set_value'): {'value'},
    ('media_player', 'media_play_pause'): set(),
    ('media_player', 'media_play'): set(),
    ('media_player', 'media_pause'): set(),
    ('media_player', 'media_stop'): set(),
    **{
        ('media_player', 'media_previous_track'): set(),
        ('media_player', 'media_next_track'): set(),
        ('media_player', 'volume_set'): {'volume_level'},
        ('media_player', 'volume_mute'): {'is_volume_muted'},
        ('media_player', 'select_source'): {'source'},
        ('media_player', 'select_sound_mode'): {'sound_mode'},
        ('media_player', 'play_media'): {'media_content_id', 'media_content_type'},
        ('media_player', 'turn_on'): set(),
        ('media_player', 'turn_off'): set(),
        ('vacuum', 'start'): set(),
        ('vacuum', 'pause'): set(),
        # 停止 / 定位 / 局部清扫：2D 扫地机面板按 supported_features 决定是否显示这几枚
        # 按钮（renderer/controls/vacuum-runtime.js 的 vacuumSupportedActions），参数为空集。
        # 漏掉时「开始清扫」点得动、却永远停不下来 —— 正是本项目最忌讳的静默失效。
        ('vacuum', 'stop'): set(),
        ('vacuum', 'locate'): set(),
        ('vacuum', 'clean_spot'): set(),
        ('vacuum', 'return_to_base'): set(),
        # 老固件只有 turn_on / turn_off，没有 start / stop；vacuumActionService 会把
        # start / stop 映射成这两个服务名，域仍是 vacuum（不是 homeassistant）。
        ('vacuum', 'turn_on'): set(),
        ('vacuum', 'turn_off'): set(),
        ('vacuum', 'set_fan_speed'): {'fan_speed'},
        ('select', 'select_option'): {'option'},
    },
}


def require_admin_for_ha(user: User) -> None:
    """要求当前用户是 admin，否则 403。

    改 HA 连接配置是整个集成里权限最高的一档，普通用户与中控设备都不允许。
    """
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以修改 Home Assistant 连接。')
    return None


def active_connection(database: DatabaseSession) -> HAConnection | None:
    """取当前活跃的 HA 连接；未配置返回 None。

    全库最多只有一条 is_active 连接，因此用 scalar 而不是取列表。
    """
    return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))


def load_active_connection_snapshot(database_manager: Database) -> HAConnection | None:
    """在独立会话里取活跃连接并在返回前 detach，供 async 路由用 to_thread 调用。

    async 路由不能在事件循环里做同步查库，这个函数就是 asyncio.to_thread 的入口。
    它是全仓唯一一份：同目录的 ``ha_proxy.py`` 从这里导入，不另存一份同名的副本。
    """
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is not None:
            database.expunge(connection)
        return connection


def load_translation_context(database_manager: Database) -> tuple[HAConnection | None, set[str]]:
    """取活跃连接，以及需要向其请求实体翻译的集成名集合。

    只统计「同步正常、来自 HA registry 且带 translation_key」的实体所属平台：
    只有这些平台才可能有需要翻译的枚举值，其余平台请求了也是白跑一趟。
    """
    with database_manager.session_factory() as database:
        connection = active_connection(database)
        if connection is None:
            return None, set()
        # 同平台只需要一次，因此用 SQL 的 distinct 去重后再转集合。
        integrations = set(
            database.scalars(
                select(HAEntity.platform)
                .where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.sync_status == 'active',
                    HAEntity.platform.is_not(None),
                    HAEntity.translation_key.is_not(None),
                )
                .distinct()
            )
        )
        database.expunge(connection)
        return connection, integrations


def load_authorized_entity_context(
    database_manager: Database,
    viewer: ViewerPrincipal,
    entity_id: str,
) -> tuple[HAConnection | None, bool]:
    """取活跃连接，并确认该实体在当前主体可见范围内且同步正常。

    返回 (connection, entity_exists)；403 由 require_viewer_entity 抛出，
    表示实体不属于当前中控仪表盘。
    """
    with database_manager.session_factory() as database:
        # 先做可见范围门禁：越权访问在查库之前就被拦下。
        require_viewer_entity(database, viewer, entity_id)
        connection = active_connection(database)
        if connection is None:
            return None, False
        entity_exists = (
            database.scalar(
                select(HAEntity.id).where(
                    HAEntity.connection_id == connection.id,
                    HAEntity.entity_id == entity_id,
                    HAEntity.sync_status == 'active',
                )
            )
            is not None
        )
        database.expunge(connection)
        return connection, entity_exists


def connection_payload(connection: HAConnection | None, request: Request) -> dict[str, Any]:
    """把连接配置转成前端要的结构（camelCase）。

    永不回传 Token 本体，只回 hasToken 布尔值；未配置时给一份带默认值的空壳。
    lastError 优先用连接器的运行时错误，连接正常时强制为 None，避免展示过期错误。
    activeEndpoint 优先取连接器内存里的值（权威），库里那份只是刷新页面时的兜底。
    """
    connector = request.app.state.ha_connector
    # 连接正常就不存在「运行时错误」，这里主动抹掉，防止旧错误一直挂在界面上。
    live_error = None if connector.connected else connector.runtime_error
    if connection is None:
        return {
            'configured': False,
            'hasToken': False,
            'connected': False,
            'baseUrl': '',
            'externalBaseUrl': None,
            'activeEndpoint': None,
            'activeBaseUrl': None,
            'name': 'Home Assistant',
            'verifyTls': False,
            'externalVerifyTls': True,
            'version': None,
            'lastConnectedAt': None,
            'lastError': live_error,
        }
    return {
        'configured': True,
        # 只回布尔值：Token 密文不出库这一层。
        'hasToken': bool(connection.encrypted_access_token),
        'connected': connector.connected,
        'baseUrl': connection.base_url,
        'externalBaseUrl': connection.external_base_url,
        'activeEndpoint': connector.endpoint_kind or connection.active_endpoint,
        # 当前在用端点的实际地址：界面直接展示它，不必自己按 activeEndpoint 拼一次。
        'activeBaseUrl': connector.active_base_url or connection.base_url,
        'name': connection.name,
        'verifyTls': connection.verify_tls,
        'externalVerifyTls': connection.external_verify_tls,
        'version': connection.ha_version,
        'lastConnectedAt': connection.last_connected_at,
        # 运行时错误优先于库里的历史错误。
        'lastError': None if connector.connected else (live_error or connection.last_error),
    }


@router.get('/connection')
def get_connection(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    """读取 HA 连接配置（需已登录且授权允许 api）。

    返回 connection_payload 的结构，永不回传 Token 明文。
    """
    return connection_payload(active_connection(database), request)


@router.delete('/connection', status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(request: Request, database: DatabaseSession, user: LicensedUser) -> None:
    """删除 HA 连接配置（需管理员 + 授权允许 api）。

    顺序：先停连接器 → 删库 → 清空状态缓存并广播目录变更 → 重新启动连接器。
    异常: HTTPException 404 当前没有可删除的连接。
    """
    require_admin_for_ha(user)
    connection = active_connection(database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Home Assistant 连接不存在。')
    connector = request.app.state.ha_connector
    # 先停后台任务：否则删完配置后它还会拿着旧配置继续尝试连接。
    await connector.stop()
    try:
        database.delete(connection)
        database.commit()
        # 清空并广播空目录，让所有在看的仪表盘立刻撤下旧实体，而不是等下一次快照。
        await connector.state_hub.replace([])
        await connector.state_hub.publish(
            {
                'type': 'entity_catalog_changed',
                'operation': 'cleared',
                'counts': {'entities': 0, 'devices': 0, 'areas': 0},
            }
        )
    except Exception:
        # 清库失败就回滚并直接抛出，不能留下「连接器已停、配置还在」的半吊子状态。
        database.rollback()
        raise
    finally:
        # 无论如何都要重启连接器：此时它进入未配置状态，后台任务不会空转。
        await connector.restart()
    # 删除连接属于高影响操作，用 warning 级别留痕。
    request.app.state.global_log.append('warning', 'Home Assistant', '连接', 'Home Assistant 连接配置已删除')
    return None


async def probe_endpoints(
    endpoints: tuple[HAEndpoint, ...], token: str, timeout: float
) -> list[dict[str, Any]]:
    """逐个试连端点，返回每个端点的结果（成功带版本与位置名，失败带原因）。

    与连接器的端点解析刻意不同：这里**不短路**。配置界面要同时告诉用户两路各自通不通，
    只报第一个成功的话，备用地址填错了在界面上也看不出来 —— 而备用地址恰恰是平时不用的
    那一路，等到内网断了才暴露问题就太晚了。
    """
    results: list[dict[str, Any]] = []
    for endpoint in endpoints:
        try:
            tested = await HAClient(
                endpoint.base_url,
                token,
                verify_tls=endpoint.verify_tls,
                timeout=timeout,
            ).test_connection()
        except (HAClientError, CredentialCipherError) as error:
            results.append({
                'kind': endpoint.kind,
                'label': endpoint.label,
                'baseUrl': endpoint.base_url,
                'ok': False,
                'error': str(error),
            })
            continue
        results.append({
            'kind': endpoint.kind,
            'label': endpoint.label,
            'baseUrl': endpoint.base_url,
            'ok': True,
            'version': tested.get('version'),
            'locationName': tested.get('locationName'),
        })
    return results


def failed_endpoint_summary(results: list[dict[str, Any]]) -> str:
    """把失败的端点拼成一句可读的原因，用于 422 的 detail。"""
    return '；'.join(f"{item['label']}（{item['baseUrl']}）：{item['error']}" for item in results if not item['ok'])


def addresses_label(internal_url: str, external_url: str | None) -> str:
    """两端地址的可读表示，用于审计日志。"""
    text = f'内网 {internal_url}'
    return f'{text} · 外网 {external_url}' if external_url else text


@router.post('/test')
async def test_connection(payload: HATestRequest, request: Request, user: LicensedUser) -> dict[str, Any]:
    """用请求里给的地址与 Token 试连 HA（需管理员 + 授权允许 api）。

    请求体 base_url（内网，必填）/ external_base_url（外网，选填）/ access_token / verify_tls。
    两个地址都会试一遍，成功返回 ``{'ok': True, 'endpoints': [...]}``（顶层 version /
    locationName 取自第一个成功的地址，兼容旧前端）；两路全不通时 422，detail 是中文文案。
    """
    require_admin_for_ha(user)
    # 限流键用账号 id：本端点要求管理员，而它唯一能被滥用的方式就是「同一个管理员反复点」——
    # 无论是猜内网端口还是试 Token，都记在同一个人头上。成功不重置：试连没有「成功」
    # 这一说（对方在线与否与请求是否合规无关），重置等于给出一个免费的探测额度。
    limiter = request.app.state.ha_test_limiter
    remaining = limiter.retry_after(user.id)
    if remaining > 0:
        raise HTTPException(
            status_code = status.HTTP_429_TOO_MANY_REQUESTS,
            detail = f'试连过于频繁，请 {remaining} 秒后再试。',
            headers = {'Retry-After': str(remaining)})
    limiter.record_failure(user.id)
    endpoints = endpoint_candidates(
        payload.base_url, payload.verify_tls, payload.external_base_url, payload.external_verify_tls
    )
    # 试连是用户主动点的一次诊断，用常规超时耐心等结果，而不是端点解析那种「快点判死好回落」。
    results = await probe_endpoints(
        endpoints, payload.access_token, request.app.state.settings.ha_request_timeout_seconds
    )
    reachable = [item for item in results if item['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(results))
    primary = reachable[0]
    return {
        'ok': True,
        'endpoints': results,
        'version': primary.get('version'),
        'locationName': primary.get('locationName'),
    }


@router.put('/connection')
async def save_connection(
    payload: HAConnectionInput,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict[str, Any]:
    """保存 HA 连接配置（需管理员 + 授权允许 api 与 ha.configure）。

    门禁刻意先查能力码再校验管理员身份，避免把「授权不足」与「权限不足」弄反。
    未填 access_token 时沿用已保存的 Token（首次必须填）；保存前先试连两个地址，
    **至少要有一路通**才落库 —— 两路全不通则整份配置都不写，绝不让打不通的地址沉到库里。
    """
    # ha.configure 是最高一档能力码：改 HA 地址与 Token 等于交出控制面。
    # 同步查库的门禁：async 路由里一律转线程池，别在事件循环上开连接。
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.configure'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许配置 Home Assistant。')
    require_admin_for_ha(user)
    connector = request.app.state.ha_connector
    connection = active_connection(database)
    endpoints = endpoint_candidates(
        payload.base_url, payload.verify_tls, payload.external_base_url, payload.external_verify_tls
    )
    # 链路本地地址（169.254.x.x / fe80::）只在 APIPA 场景才指向真实主机，否则多半是误填，提示一句。
    for endpoint in endpoints:
        link_local = link_local_address(endpoint.base_url)
        if link_local:
            request.app.state.global_log.append(
                'warning', 'Home Assistant', '连接',
                f'Home Assistant {endpoint.label}地址使用了链路本地地址（{link_local}），请确认这是你家里的主机。',
            )
    new_addresses = (payload.base_url, payload.external_base_url)
    previous_addresses = (
        (connection.base_url, connection.external_base_url) if connection is not None else None
    )
    try:
        if payload.access_token:
            token = payload.access_token
        elif connection is not None:
            # 换到另一个地址时必须显式确认复用旧令牌：地址可以被改（改完就会把旧令牌发给
            # 新主机试连），而长期令牌权限远大于一次试连；不确认时要求重新输入。
            # 内外网任一路变了都算「地址变更」—— 两路都会被试连，也就都会收到旧令牌。
            if new_addresses != previous_addresses and not payload.reuse_token_for_new_url:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        'code': 'HA_URL_CHANGED_TOKEN_REUSE',
                        'message': '地址已变更：复用已保存的 Home Assistant 令牌前请确认新地址可信（确认后重发 reuseTokenForNewUrl=true，或直接重新输入令牌）。',
                    },
                )
            # 用户没改 Token，就把库里存的密文解出来复用。
            token = connector.cipher.decrypt(connection.encrypted_access_token)
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail='首次连接必须输入 Home Assistant Token。',
            )
        # 保存前把两路都试一遍：内网现在不通（人在外面）也要能存下配置，那是备用地址存在的
        # 全部意义，所以只要求「至少一路通」。两路各自的结果照旧逐个报出来。
        test_results = await probe_endpoints(
            endpoints, token, request.app.state.settings.ha_request_timeout_seconds
        )
    except (HAClientError, CredentialCipherError) as error:
        # 令牌解不出来之类的前置失败：整份配置都不写库。
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    reachable = [item for item in test_results if item['ok']]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(test_results))
    tested = {'version': reachable[0].get('version'), 'locationName': reachable[0].get('locationName')}
    disconnected = [item for item in test_results if not item['ok']]
    if connection is None:
        connection = HAConnection(
            # name 的去空白与下限校验在 schema 里做完，这里不再补一次 strip。
            name=payload.name,
            base_url=payload.base_url,
            external_base_url=payload.external_base_url,
            encrypted_access_token=connector.cipher.encrypt(token),
            verify_tls=payload.verify_tls,
            external_verify_tls=payload.external_verify_tls,
            # 顺手把实测到的版本号记下来，界面展示不必依赖上一次的值。
            ha_version=tested.get('version'),
        )
        database.add(connection)
    else:
        connection.name = payload.name
        connection.base_url = payload.base_url
        connection.external_base_url = payload.external_base_url
        connection.verify_tls = payload.verify_tls
        connection.external_verify_tls = payload.external_verify_tls
        connection.ha_version = tested.get('version')
        connection.last_error = None
        # 地址可能变了，缓存里「在用哪一路」的结论随之失效：下次取端点时重新探。
        connection.active_endpoint = None
        # 只在真的传了新 Token 时才改写密文，避免用「解密再加密」的结果覆盖原值。
        if payload.access_token:
            connection.encrypted_access_token = connector.cipher.encrypt(token)
    database.commit()
    database.refresh(connection)
    # 配置变了，连接器需要按新地址与 Token 重新连一遍（同时作废端点缓存）。
    await connector.restart()
    # 地址变更单独记一条：审计要能看出「令牌被发到了哪个地址」以及是什么时候换的。
    if previous_addresses is not None and previous_addresses != new_addresses:
        previous_label = addresses_label(*previous_addresses)
        current_label = addresses_label(connection.base_url, connection.external_base_url)
        request.app.state.global_log.append(
            'warning',
            'Home Assistant',
            '连接',
            f'Home Assistant 地址已变更：{previous_label} → {current_label}（令牌已复用，请确认新地址可信）'
            if not payload.access_token
            else f'Home Assistant 地址已变更：{previous_label} → {current_label}（同时更新了令牌）',
        )
    if disconnected:
        # 有一路没通仍允许保存（可能只是暂时不在那个网络里），但必须留痕：
        # 否则等到内网断了才发现备用地址一直是错的。
        request.app.state.global_log.append(
            'warning',
            'Home Assistant',
            '连接',
            f'Home Assistant 连接已保存，但以下地址当前不通（将作为备用，不通时自动跳过）：{failed_endpoint_summary(test_results)}',
        )
    request.app.state.global_log.append(
        'success',
        'Home Assistant',
        '连接',
        f'Home Assistant 连接配置已保存（{connection.name}，版本 {connection.ha_version or "未知"}）',
    )
    return {**connection_payload(connection, request), 'test': tested, 'endpoints': test_results}


@router.get('/entities')
def list_entities(
    database: DatabaseSession,
    viewer: LicensedViewer,
    search: str | None = Query(None, max_length=128),
    domain: str | None = Query(None, max_length=64),
    area_id: str | None = Query(None, alias='areaId', max_length=255),
    sync_status: str | None = Query(None, alias='status', max_length=32),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """分页查询实体目录（需已认证 + 授权允许 api）。

    查询参数 search / domain / areaId / status / limit（默认 200，1..500）/ offset；
    中控设备只看到 viewer_entity_ids 允许的实体。返回 {items, total, limit, offset}。
    """
    connection = active_connection(database)
    if connection is None:
        # 未配置 HA 时返回空页而不是报错：「有没有配置」由 /connection 接口负责表达。
        return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
    filters = [HAEntity.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            # 没有任何可见实体就直接短路，避免生成 IN () 这种退化 SQL。
            return {'items': [], 'total': 0, 'limit': limit, 'offset': offset}
        filters.append(HAEntity.entity_id.in_(allowed_entity_ids))
    if search:
        # 两端模糊匹配：entity_id 与显示名都查，前端搜索框不必区分。
        pattern = f'%{search.strip()}%'
        filters.append(or_(HAEntity.entity_id.ilike(pattern), HAEntity.name.ilike(pattern)))
    if domain:
        filters.append(HAEntity.domain == domain)
    if area_id:
        filters.append(HAEntity.area_id == area_id)
    if sync_status:
        filters.append(HAEntity.sync_status == sync_status)
    rows = (
        database.execute(
            # 窗口函数把「过滤后的总数」和「当页数据」一次查出来，省掉一次单独的 count。
            select(HAEntity, func.count().over().label('total_count'))
            .where(*filters)
            # 按域、实体 ID 排序：固定顺序才能让分页结果稳定可复现。
            .order_by(HAEntity.domain, HAEntity.entity_id)
            .offset(offset)
            .limit(limit)
        ).all()
    )
    items = [row[0] for row in rows]
    # 当页为空（例如 offset 越界）时窗口函数无可读行，退回补一次 count 拿真实总数。
    total = int(rows[0][1]) if rows else int(database.scalar(select(func.count()).select_from(HAEntity).where(*filters)) or 0)
    return {
        'items': [
            {
                'entityId': item.entity_id,
                'domain': item.domain,
                'name': item.name,
                'icon': item.icon,
                'deviceId': item.device_id,
                'areaId': item.area_id,
                'platform': item.platform,
                'translationKey': item.translation_key,
                'hasEntityName': item.has_entity_name,
                'uniqueId': item.unique_id,
                'originalName': item.original_name,
                'disabledBy': item.disabled_by,
                'status': item.sync_status,
                'lastSeenAt': item.last_seen_at,
                'missingSince': item.missing_since,
            }
            for item in items
        ],
        'total': total,
        'limit': limit,
        'offset': offset,
    }


#: 实体翻译表的进程内缓存时长（秒）。翻译内容由 HA 的集成版本决定，进程生命周期内几乎不变，
#: 而重取一次要按集成逐个往返（实测中位 2.9 秒、最坏 23 秒）。不缓存就等于每个打开编辑器 /
#: 展示页的客户端都重付一次。
TRANSLATION_CACHE_TTL_SECONDS = 3600


class EntityTranslationCache:
    """实体翻译表的进程内缓存，按「连接 + 语言 + 集成集合」分桶。

    键里带集成集合：目录里新增平台时会自动落到新键上重取，不必等 TTL 到期。``clear`` 挂在
    HA 连接被重建 / 删除时 —— 翻译内容跟着那一台 HA 走，地址可以不变而实例已经换了一台。
    """

    def __init__(self, ttl_seconds: float = TRANSLATION_CACHE_TTL_SECONDS) -> None:
        self.ttl_seconds = ttl_seconds
        self.entries: dict[tuple[str, str, tuple[str, ...]], tuple[float, dict[str, str]]] = {}

    @staticmethod
    def key(
        connection_id: str, language: str, integrations: set[str]
    ) -> tuple[str, str, tuple[str, ...]]:
        """拼缓存键；集成集合排序后入键，集合顺序不同不该另算一份。"""
        return (connection_id, language, tuple(sorted(integrations)))

    def get(self, cache_key: tuple[str, str, tuple[str, ...]]) -> dict[str, str] | None:
        """取一份还在有效期内的翻译表；过期即丢弃并返回 None。"""
        entry = self.entries.get(cache_key)
        if entry is None:
            return None
        created_at, resources = entry
        if time.monotonic() - created_at >= self.ttl_seconds:
            self.entries.pop(cache_key, None)
            return None
        return resources

    def remember(
        self, cache_key: tuple[str, str, tuple[str, ...]], resources: dict[str, str]
    ) -> None:
        self.entries[cache_key] = (time.monotonic(), resources)

    def clear(self) -> None:
        self.entries.clear()


@router.get('/translations')
async def entity_translations(
    request: Request,
    _viewer: LicensedViewer,
) -> dict[str, Any]:
    """拉取实体枚举值的简体中文翻译（需已认证 + 授权允许 api）。

    返回 {'language': 'zh-Hans', 'resources': {...}}；未配置 HA 时 resources 为空字典，
    前端保持集成自带的英文原值即可。命中进程内缓存时直接返回，不再回源。
    异常:
        HTTPException 502: HA 不可达或凭证解密失败。
    """
    # 同步查库交给线程执行：本路由是 async，不能阻塞事件循环。
    connection, integrations = await asyncio.to_thread(load_translation_context, request.app.state.database)
    if connection is None:
        return {'language': 'zh-Hans', 'resources': {}}
    translation_cache = request.app.state.entity_translations
    cache_key = translation_cache.key(connection.id, 'zh-Hans', integrations)
    cached_resources = translation_cache.get(cache_key)
    if cached_resources is not None:
        return {'language': 'zh-Hans', 'resources': cached_resources}
    try:
        client = await request.app.state.ha_connector.client_for(connection)
        resources = await client.fetch_entity_translations(
            integrations,
            language='zh-Hans',
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    translation_cache.remember(cache_key, resources)
    return {'language': 'zh-Hans', 'resources': resources}


@router.get('/history')
async def entity_history(
    request: Request,
    viewer: LicensedViewer,
    entity_id: str = Query(alias='entityId', min_length=3, max_length=255),
    hours: int = Query(24, ge=1, le=168),
) -> dict[str, Any]:
    """读取实体的历史曲线（需已认证 + 授权允许 api）。

    查询参数 entityId（必填）、hours（默认 24，1..168）。返回 {entityId, hours, points}，
    points 为 [{timestamp, value}]。403 越权；409 未配置 HA；404 实体不存在/禁用/失联；502 HA 查询失败。
    """
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    # HA 的历史接口按绝对起始时间查询，这里换算成 UTC 的 ISO 字符串。
    start_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    try:
        history = await request.app.state.ha_connector.fetch_history(connection, entity_id, start_time, hours)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    points = []
    for item in history:
        value = history_state_value(item.get('state'))
        # 非数值状态（unavailable、unknown 等）画不出曲线，直接跳过该点。
        if value is None:
            continue
        # 优先用 last_updated；某些集成只回 last_changed，作为兜底。
        timestamp = item.get('last_updated') or item.get('last_changed')
        if not timestamp:
            continue
        points.append({'timestamp': str(timestamp), 'value': value})
    if len(points) > 480:
        # 最多 480 个点：等间隔抽稀，既保留曲线形状又不把响应体撑大。
        step = len(points) / 480
        points = [points[min(len(points) - 1, int(index * step))] for index in range(480)]
    return {'entityId': entity_id, 'hours': hours, 'points': points}


def history_state_value(raw_state: Any) -> float | str | None:
    """把 HA 的历史状态转成曲线可用的数值或字符串。

    数值直接返回；否则返回去空白的字符串，空值与空串统一返回 None（调用方跳过该点）。
    """
    try:
        return float(raw_state)
    except (TypeError, ValueError):
        # state 可能是 'unavailable'、'on' 之类的文案，转不了数字就按字符串保留。
        value = str(raw_state or '').strip()
        return value or None


@router.get('/areas')
def list_areas(database: DatabaseSession, _user: LicensedUser) -> dict[str, Any]:
    """列出 HA 区域（需已登录 + 授权允许 api）。

    返回 {items: [{areaId, name, aliases, status}]}；未配置 HA 时为空列表。
    """
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    areas = database.scalars(select(HAArea).where(HAArea.connection_id == connection.id).order_by(HAArea.name))
    return {
        'items': [
            {
                'areaId': item.area_id,
                'name': item.name,
                # 别名以 JSON 字符串入库，出参转回数组给前端。
                'aliases': json.loads(item.aliases_json),
                'status': item.sync_status,
            }
            for item in areas
        ]
    }


@router.get('/devices')
def list_devices(database: DatabaseSession, viewer: LicensedViewer) -> dict[str, Any]:
    """列出 HA 设备（需已认证 + 授权允许 api）。

    中控设备只看到「其下挂着可见实体」的设备：先用可见实体反查 device_id 再过滤，
    避免把同一 HA 里别的设备名字暴露给这块屏。返回 items（字段为 camelCase）。
    """
    connection = active_connection(database)
    if connection is None:
        return {'items': []}
    filters = [HADevice.connection_id == connection.id]
    allowed_entity_ids = viewer_entity_ids(database, viewer)
    if allowed_entity_ids is not None:
        if not allowed_entity_ids:
            # 没有可见实体就没有可见设备。
            return {'items': []}
        # 用子查询而不是把 ID 拉回 Python：条件规模不会随实体数量增长。
        allowed_device_ids = select(HAEntity.device_id).where(
            HAEntity.connection_id == connection.id,
            HAEntity.entity_id.in_(allowed_entity_ids),
            HAEntity.device_id.is_not(None),
        )
        filters.append(HADevice.device_id.in_(allowed_device_ids))
    devices = database.scalars(
        select(HADevice).where(*filters).order_by(HADevice.name_by_user, HADevice.name)
    )
    return {
        'items': [
            {
                'deviceId': item.device_id,
                # 用户改过的名字优先，其次才是集成注册的原始名。
                'name': item.name_by_user or item.name,
                'manufacturer': item.manufacturer,
                'model': item.model,
                # 元数据为空时不输出该键，前端不必额外判 null。
                **({'registryMetadata': json.loads(item.registry_metadata_json)} if item.registry_metadata_json else {}),
                'areaId': item.area_id,
                'status': item.sync_status,
            }
            for item in devices
        ]
    }


@router.get('/sync/status')
def sync_status(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    """读取目录同步状态（需已认证 + 授权允许 api）。

    返回 configured / connected / status / phase / 各次同步时间 / catalogRevision /
    counts / lastError；未配置 HA 时返回最小的 not_configured 结构。
    """
    connection = active_connection(database)
    if connection is None:
        return {'configured': False, 'status': 'not_configured', 'connected': False}
    # 同步状态行以连接 ID 为主键，直接 get 即可。
    state = database.get(HASyncState, connection.id)
    return {
        'configured': True,
        'connected': request.app.state.ha_connector.connected,
        # 还没建状态行时按 idle 处理，前端不必区分「空行」与「空闲」。
        'status': state.status if state else 'idle',
        'phase': state.phase if state else None,
        'lastFullSyncAt': state.last_full_sync_at if state else None,
        'lastIncrementalAt': state.last_incremental_at if state else None,
        'lastReconciledAt': state.last_reconciled_at if state else None,
        'catalogRevision': state.catalog_revision if state else 0,
        'counts': {
            'entities': state.entity_count if state else 0,
            'devices': state.device_count if state else 0,
            'areas': state.area_count if state else 0,
        },
        # 连接正常时一律为 None；异常时优先用连接器的实时错误，其次才是库里的历史错误。
        'lastError': None
        if request.app.state.ha_connector.connected
        else (
            request.app.state.ha_connector.runtime_error or (state.last_error if state else None)
        ),
    }


@router.post('/sync')
async def run_sync(request: Request, user: LicensedUser) -> dict[str, Any]:
    """触发一次全量同步（需管理员 + 授权允许 api 与 ha.sync）。

    ha.sync 会批量改库（新增/更新/回收实体、设备、区域），风险高于 ha.control。
    返回 {'ok': True, 'counts': {...}}；403 授权不足或非管理员；409 未配置；502 HA 侧失败。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.sync'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许同步 Home Assistant。')
    require_admin_for_ha(user)
    connection = await asyncio.to_thread(load_active_connection_snapshot, request.app.state.database)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    try:
        # reconciled=True：这次同步会顺带回收目录里已经消失的实体、设备与区域。
        counts = await request.app.state.ha_connector.sync_once(connection.id, reconciled=True)
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'counts': counts}


@router.get('/health')
def ha_health(request: Request, database: DatabaseSession, _viewer: LicensedViewer) -> dict[str, Any]:
    """HA 连接健康检查（需已认证 + 授权允许 api）。

    返回 configured / connected / lastError；lastError 优先取连接器的运行时错误，
    其次取库里记录的上次错误。
    """
    connection = active_connection(database)
    connected = request.app.state.ha_connector.connected
    return {
        'configured': connection is not None,
        'connected': connected,
        'lastError': None
        if connected
        else (
            request.app.state.ha_connector.runtime_error or (connection.last_error if connection else None)
        ),
    }


@router.post('/services/call')
async def call_service(
    payload: HAServiceCallRequest,
    request: Request,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    """调用 HA 服务控制设备（需已认证 + 授权允许 api 与 ha.control）。

    校验顺序（任一不过就不回源）：能力码 → 服务白名单 → data 字段被该服务允许 →
    homeassistant.toggle 要求实体域可开关、其它服务要求域一致 → 实体可见且同步正常。
    返回 {'ok': True, 'result': {...}}。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.control'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    # 白名单里没有这个 (domain, service) 就直接拒绝，不做任何回源尝试。
    allowed_fields = ALLOWED_SERVICES.get((payload.domain, payload.service))
    if allowed_fields is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='该 Home Assistant 服务不在允许列表中。',
        )
    # 未知参数一律拒绝：防止借 data 把任意高层字段塞给 HA 服务。
    unknown_fields = set(payload.data) - allowed_fields
    if unknown_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f'服务参数不允许：{", ".join(sorted(unknown_fields))}',
        )
    # 实体 ID 的域就是第一个点之前的部分。
    entity_domain = payload.entity_id.partition('.')[0]
    # homeassistant.toggle 是跨域服务，必须额外确认实体域本身支持开关。
    if payload.domain == 'homeassistant' and payload.service == 'toggle' and entity_domain not in TOGGLE_ENTITY_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='该实体类型不支持切换动作。',
        )
    # 非跨域服务要求域一致，避免用 light.turn_on 去操作一个 switch 实体。
    if payload.domain != 'homeassistant' and entity_domain != payload.domain:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='服务域与实体域不匹配。',
        )
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        payload.entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    try:
        client = await request.app.state.ha_connector.client_for(connection)
        result = await client.call_service(
            payload.domain,
            payload.service,
            payload.entity_id,
            payload.data,
        )
    except (HAClientError, CredentialCipherError) as error:
        # 标记诊断日志已记录，避免全局日志中间件为同一次失败再补一条。
        request.state.diagnostic_error_logged = True
        request.app.state.global_log.append(
            'error',
            # 来源按操作主体区分，便于判断是哪块屏出的问题。
            '仪表盘编辑器' if viewer.is_admin_session else '展示设备',
            '设备操作',
            f'操作失败：{payload.entity_id} · {payload.domain}.{payload.service} · {error}',
            context={
                'entityId': payload.entity_id,
                'service': f'{payload.domain}.{payload.service}',
                'status': 502,
            },
            # 失败栈也一并记下，排障时不必再复现一次。
            details=traceback.format_exc(),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    # 成功也记一条：设备操作属于审计重点，只记失败会缺一半上下文。
    request.app.state.global_log.append(
        'success',
        '仪表盘编辑器' if viewer.is_admin_session else '展示设备',
        '设备操作',
        f'操作成功：{payload.entity_id} · {payload.domain}.{payload.service}',
        context={
            'entityId': payload.entity_id,
            'service': f'{payload.domain}.{payload.service}',
        },
    )
    return {'ok': True, 'result': result}


@router.post('/media/browse')
async def browse_media(
    payload: HABrowseMediaRequest,
    request: Request,
    viewer: LicensedViewer,
) -> dict[str, Any]:
    """浏览媒体播放器的可播放内容（需已认证 + 授权允许 api 与 ha.control）。

    请求体 entity_id / media_content_id / media_content_type（可空）。
    返回 {'ok': True, 'result': HA 原始结果}；422 实体不是媒体播放器，其余同 call_service。
    """
    if not await asyncio.to_thread(request.app.state.license_service.allows, 'ha.control'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许控制 Home Assistant。')
    entity_domain = payload.entity_id.partition('.')[0]
    # 媒体浏览只对媒体播放器有意义，其它域直接拒绝，不必回源。
    if entity_domain != 'media_player':
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='媒体浏览只能用于媒体播放器实体。',
        )
    connection, entity_exists = await asyncio.to_thread(
        load_authorized_entity_context,
        request.app.state.database,
        viewer,
        payload.entity_id,
    )
    if connection is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='请先配置 Home Assistant 连接。')
    if not entity_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='实体不存在、已禁用或已失联。')
    try:
        client = await request.app.state.ha_connector.client_for(connection)
        result = await client.browse_media(
            payload.entity_id,
            payload.media_content_id,
            payload.media_content_type or None,
        )
    except (HAClientError, CredentialCipherError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error
    return {'ok': True, 'result': result}


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
