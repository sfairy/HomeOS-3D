"""HA 路由与代理共用的取数助手：连接快照、实体上下文、连接载荷与端点探测。

从 api/ha.py 拆出来：**被 ha_proxy / media_proxy_support / interaction3d 一起引用**的那几个函数。
它们不碰路由，只回答「当前是哪条连接、这个实体归谁、地址该怎么显示」，放在这里让依赖保持单向。
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from sqlalchemy import select

from ..core.database import Database
from ..security.dependencies import DatabaseSession, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClient, HAClientError
from ..ha.endpoints import HAEndpoint
from ..ha.crypto import CredentialCipherError
from ..core.models import HAConnection, HAEntity, User




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
