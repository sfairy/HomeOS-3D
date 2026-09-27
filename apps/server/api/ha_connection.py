"""商店接口的 connection 资源组（从 api/store.py 拆出）。

路由在原文件里是分散的（2 段：GET/DELETE 一处、PUT 一处），因此本模块有两个子路由 router 与
router_extra，父路由在各自原来的位置分别 include，以此保持注册顺序（FastAPI 按注册序匹配）。
只留「读 / 删 / 存」连接三条路由；连接快照与载荷拼装（connection_payload、active_connection）
在 ha_shared.py，测试连接的探测原语也在那里。
"""
from __future__ import annotations

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from ..security.dependencies import DatabaseSession, LicensedUser
from ..ha.client import HAClientError, link_local_address
from ..ha.endpoints import endpoint_candidates
from ..ha.crypto import CredentialCipherError
from ..core.models import HAConnection
from ..core.schemas import HAConnectionInput



from .ha_shared import (
    active_connection,
    addresses_label,
    connection_payload,
    failed_endpoint_summary,
    probe_endpoints,
    require_admin_for_ha,
)


router = APIRouter()

router_extra = APIRouter()


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


@router_extra.put('/connection')
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
