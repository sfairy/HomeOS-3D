"""HA 路由与代理共用的取数助手：连接快照、实体上下文、连接载荷与端点探测。
"""
from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy import select

from ..core.database import Database
from ..security.dependencies import DatabaseSession, ViewerPrincipal, require_viewer_entity
from ..ha.client import HAClient, HAClientError
from ..ha.endpoints import HAEndpoint
from ..ha.crypto import CredentialCipherError
from ..core.models import HAConnection, HAEntity


def active_connection(database: DatabaseSession) -> HAConnection | None:
    """取当前活跃的 HA 连接；未配置返回 None。
    """
    return database.scalar(select(HAConnection).where(HAConnection.is_active.is_(True)))
def load_active_connection_snapshot(database_manager: Database) -> HAConnection | None:
    """在独立会话里取活跃连接并在返回前 detach，供 async 路由用 to_thread 调用。
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
        'lastError': None if connector.connected else (live_error or connection.last_error),
    }
async def probe_endpoints(
    endpoints: tuple[HAEndpoint, ...], token: str, timeout: float
) -> list[dict[str, Any]]:
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
    return '；'.join(f"{item['label']}（{item['baseUrl']}）：{item['error']}" for item in results if not item['ok'])
def addresses_label(internal_url: str, external_url: str | None) -> str:
    """两端地址的可读表示，用于审计日志。"""
    text = f'内网 {internal_url}'
    return f'{text} · 外网 {external_url}' if external_url else text
def history_state_value(raw_state: Any) -> float | str | None:
    try:
        return float(raw_state)
    except (TypeError, ValueError):
        # state 可能是 'unavailable'、'on' 之类的文案，转不了数字就按字符串保留。
        value = str(raw_state or '').strip()
        return value or None
