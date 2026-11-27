"""HA 连接的保存流程：校验开关、令牌复用判定、端点探测与行构造。

## 为什么从 ``api/ha/routes.py`` 搬出来

这些函数原本住在路由文件里（1663 行、23 条路由），但它们**不是 HTTP 层的事**：
判断「地址变了能不能复用旧令牌」「探测结果取哪个端点」「新行怎么填」都是领域规则，
路由只该负责解请求、调一次、返回 DTO。审计里把这类「持久化与业务规则留在路由层」
标为中风险（改一条规则要在 1600 行的路由文件里找）。

## 依赖方向

本模块位于 ``domains/ha``，只依赖同域 ``integration`` 与 ``platform``。
请求模型 ``HAConnectionInput`` **刻意不 import**：它住在 ``src/schemas.py``（请求层），
``domains → request`` 是架构检查 B2 明令禁止的方向（第一版直接 import，门禁当场报
``B2 lower→request``）。这里把参数标注为 ``Any`` 并在注释里写明「它必须是带
``name`` / ``base_url`` / ``access_token`` / ``model_fields_set`` 的请求模型」，
用一句类型宽松换掉一条反向依赖。

## 行为完全不变

所有函数的签名、异常类型（``HTTPException`` / ``BusinessException``）与文案逐字保留：
路由层的错误契约靠评审守住（曾经有一条计数型门禁，已按「不设数字门槛」删除），搬动不能顺手改。
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status

from .client import HAClientError
from .connection_setup import addresses_label, failed_endpoint_summary, probe_endpoints
from .crypto import CredentialCipherError
from .endpoints import HAEndpoint
from .errors import connection_error_message
from ....platform.core.db.models import HAConnection
from ....platform.core.http.errors import BusinessException, ErrorCode, api_error


@dataclass(frozen=True)
class ConnectionTargets:
    """探测后确定的内网 / 外网地址与版本摘要。"""

    internal: str
    external: str | None
    tested: dict[str, Any]


def connection_verify_flags(connection_input: Any, connection: HAConnection | None) -> tuple[bool, bool]:
    """未显式提交时沿用已保存的 TLS 校验开关。"""
    verify_tls = (
        connection.verify_tls
        if connection and "verify_tls" not in connection_input.model_fields_set
        else connection_input.verify_tls
    )
    external_verify_tls = (
        connection.external_verify_tls
        if connection and "external_verify_tls" not in connection_input.model_fields_set
        else connection_input.external_verify_tls
    )
    return verify_tls, external_verify_tls


def connection_access_token(
    connection_input: Any,
    connection: HAConnection | None,
    connector: Any,
    new_addresses: tuple[str, str | None],
    previous_addresses: tuple[str, str | None] | None,
) -> str:
    """确定本次保存使用的令牌：显式提交优先，否则判断已保存令牌能否复用。"""
    if connection_input.access_token:
        return connection_input.access_token
    if connection is None:
        raise BusinessException(ErrorCode.VALIDATION_FAILED, api_error("HA_TOKEN_REQUIRED"))
    if new_addresses != previous_addresses and not connection_input.reuse_token_for_new_url:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "HA_URL_CHANGED_TOKEN_REUSE",
                "message": "地址已变更：复用已保存的 Home Assistant 令牌前请确认新地址可信（确认后重发 reuseTokenForNewUrl=true，或直接重新输入令牌）。",
            },
        )
    try:
        return connector.cipher.decrypt(connection.encrypted_access_token)
    except CredentialCipherError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


async def probe_connection_endpoints(request: Any, endpoints: Sequence[HAEndpoint], token: str) -> list[dict[str, Any]]:
    """探测候选端点；连接层异常按原样转 422。"""
    try:
        return await probe_endpoints(endpoints, token, request.app.state.settings.ha_request_timeout_seconds)
    except HAClientError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=connection_error_message(error),
        ) from error


def resolved_connection_targets(test_results: list[dict[str, Any]], connection_input: Any) -> ConnectionTargets:
    """从探测结果里取主端点、最终内网 / 外网地址与版本摘要。"""
    reachable = [probe_entry for probe_entry in test_results if probe_entry["ok"]]
    if not reachable:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=failed_endpoint_summary(test_results)
        )
    primary = reachable[0]
    resolved_internal = next(
        (probe_entry["baseUrl"] for probe_entry in test_results if probe_entry["kind"] == "internal"),
        connection_input.base_url,
    )
    resolved_external = next(
        (probe_entry["baseUrl"] for probe_entry in test_results if probe_entry["kind"] == "external"),
        None,
    )
    tested = {"version": primary.get("version"), "locationName": primary.get("locationName")}
    return ConnectionTargets(internal=resolved_internal, external=resolved_external, tested=tested)


def create_connection_row(
    connection_input: Any,
    connector: Any,
    token: str,
    verify_tls: bool,
    external_verify_tls: bool,
    targets: ConnectionTargets,
) -> HAConnection:
    """首次保存：构造 HAConnection 行。"""
    return HAConnection(
        name=connection_input.name.strip(),
        base_url=targets.internal,
        external_base_url=targets.external,
        encrypted_access_token=connector.cipher.encrypt(token),
        verify_tls=verify_tls,
        external_verify_tls=external_verify_tls,
        ha_version=targets.tested.get("version"),
    )


def update_connection_row(
    connection: HAConnection,
    connection_input: Any,
    connector: Any,
    verify_tls: bool,
    external_verify_tls: bool,
    targets: ConnectionTargets,
) -> None:
    """覆盖已保存连接的地址 / 证书开关 / 版本，并清掉上次错误状态。"""
    connection.name = connection_input.name.strip()
    connection.base_url = targets.internal
    connection.external_base_url = targets.external
    connection.verify_tls = verify_tls
    connection.external_verify_tls = external_verify_tls
    connection.ha_version = targets.tested.get("version")
    connection.last_error = None
    connection.active_endpoint = None
    if connection_input.access_token:
        connection.encrypted_access_token = connector.cipher.encrypt(connection_input.access_token)


async def log_connection_address_change(
    request: Any,
    connection_input: Any,
    previous_addresses: tuple[str, str | None] | None,
    connection: HAConnection,
) -> None:
    """地址变更时写一条 warning 日志（区分是否同时更新了令牌）。"""
    if previous_addresses is None or previous_addresses == (connection.base_url, connection.external_base_url):
        return
    previous_label = addresses_label(*previous_addresses)
    current_label = addresses_label(connection.base_url, connection.external_base_url)
    await request.app.state.global_log.append_async(
        "warning",
        "Home Assistant",
        "连接",
        f"Home Assistant 地址已变更：{previous_label} → {current_label}（令牌已复用，请确认新地址可信）"
        if not connection_input.access_token
        else f"Home Assistant 地址已变更：{previous_label} → {current_label}（同时更新了令牌）",
    )


async def log_connection_endpoint_warnings(
    request: Any, test_results: list[dict[str, Any]], connection: HAConnection
) -> None:
    """保存成功后记录不可达备用地址与整体成功日志。"""
    if [probe_entry for probe_entry in test_results if not probe_entry["ok"]]:
        await request.app.state.global_log.append_async(
            "warning",
            "Home Assistant",
            "连接",
            f"Home Assistant 连接已保存，但以下地址当前不通（将作为备用，不通时自动跳过）：{failed_endpoint_summary(test_results)}",
        )
    await request.app.state.global_log.append_async(
        "success",
        "Home Assistant",
        "连接",
        f"Home Assistant 连接配置已保存（{connection.name}，版本 {connection.ha_version or '未知'}）",
    )


__all__ = [
    "ConnectionTargets",
    "connection_access_token",
    "connection_verify_flags",
    "create_connection_row",
    "log_connection_address_change",
    "log_connection_endpoint_warnings",
    "probe_connection_endpoints",
    "resolved_connection_targets",
    "update_connection_row",
]
