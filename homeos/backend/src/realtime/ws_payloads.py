"""WS 广播载荷的公共构造：**服务端事件类型优先**，与跨模块复用的字段口径。

原先这些 helper 全是 ``realtime/gateway.py`` 的模块私有函数，广播拆到
``gateway_broadcasts.py`` 后两边都要用，所以集中在这里（单一实现）。

其中 ``ws_event`` 修的是一个真实的越权/覆盖问题：旧写法一律 ``{"type": X, **event}``，
``event`` 里的 ``type`` 会**覆盖**服务端指定的事件名 —— 上游只要把载荷塞进
``{"type": "security_alarm"}`` 就能让前端把一条普通通知当成安防告警处理
（前端按 ``type`` 分派 store）。改成「先摊平载荷、最后写 type」，服务端类型恒定生效。
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, Required, TypedDict

#: 重连只发增量回放的上限：超过这个条数全量快照更省带宽（且分片可控）。
REPLAY_ONLY_MAX_CHANGES = 500


class ResyncSuggestedPayload(TypedDict):
    """``resync_suggested``：建议客户端软重拉（不弹错误，只重建状态）。"""

    type: str
    reason: str
    timestamp: str


class HaStatusSnapshot(TypedDict, total=False):
    """``ha_status`` 载荷的字段快照（``None`` 字段省略，对齐 JS ``undefined``）。"""

    connected: bool
    ha_version: str | None
    attempt: int | None
    delay: float | None
    timestamp: str


class NotificationBroadcastEvent(TypedDict, total=False):
    """站内通知广播载荷（``id`` 必备：送达回写要靠它定位行）。"""

    id: Required[str]
    title: str
    body: str
    level: str
    entityId: str | None
    channels: list[str]
    createdAt: str
    deliveredAt: str | None
    deliveryChannels: list[str]


class DomainBroadcastEvent(TypedDict, total=False):
    """领域事件 fan-out 载荷：字段随事件种类不同，未列出的键由 ``Any`` 兜底。"""

    modeId: str
    modeName: str
    exclusiveGroup: str | None
    remainingActiveModeIds: list[str]
    skippedDomains: list[str]
    restored: int
    id: str
    name: str
    success: bool
    action: str
    message: str
    ts: float
    timestamp: str
    alertKind: str
    reason: str


def iso_now() -> str:
    """当前 UTC 时间（毫秒精度 ISO8601，带 ``Z``）。"""
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def ms_to_iso(milliseconds: float) -> str:
    """epoch 毫秒 → ISO8601（毫秒精度）。"""
    return datetime.fromtimestamp(milliseconds / 1000, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(milliseconds) % 1000:03d}Z"


def ws_event(
    event_name: str, payload: Mapping[str, Any] | None = None, **extra: Any
) -> dict[str, Any]:
    """组装 WS 载荷：先摊平调用方载荷，再由服务端决定 ``type`` 与补充字段。

    ``payload`` 里的 ``type`` **不会**生效（这是刻意设计：事件名只能由服务端代码指定）。
    """
    message: dict[str, Any] = dict(payload or {})
    message.update(extra)
    message["type"] = event_name
    return message


def resync_suggested_payload(reason: str = "backpressure") -> ResyncSuggestedPayload:
    """``resync_suggested`` 载荷（背压 / 回放不可用时提示客户端软重拉）。"""
    return {"type": "resync_suggested", "reason": reason, "timestamp": iso_now()}


def ha_status_payload(status: str, snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """构造 ha_status 负载：值为 ``None`` 的字段省略（对齐 JS ``undefined`` 不带键）。"""
    message: dict[str, Any] = {"type": "ha_status", "status": status}
    ha_version = snapshot.get("ha_version")
    if ha_version is not None:
        message["ha_version"] = ha_version
    attempt = snapshot.get("attempt")
    if attempt is not None:
        message["attempt"] = attempt
    delay = snapshot.get("delay")
    if delay is not None:
        message["delay"] = delay
    message["timestamp"] = snapshot.get("timestamp") or iso_now()
    return message


def as_set(raw: Any, require_dot: bool = False) -> set[str] | None:
    """把 ``"a.b,c.d"`` / ``["a.b"]`` 归一成集合；空输入返回 ``None``（= 不限）。"""
    if raw is None or raw == "":
        return None
    items = raw if isinstance(raw, list) else str(raw).split(",")
    result = {str(item).strip() for item in items if str(item).strip()}
    if require_dot:
        result = {item for item in result if "." in item}
    return result or None


def entity_visible(user: dict[str, Any], entity_id: str) -> bool:
    """该用户是否可见此实体（实体级 ACL）。"""
    from ..platform.security.entity_access import is_entity_allowed

    return is_entity_allowed(entity_id, user)


def visibility_cache_for(
    cache: dict[Any, dict[str, bool]], user: dict[str, Any]
) -> dict[str, bool]:
    """取（或建）某个用户的可见性缓存分桶。

    同一账号常有多个连接（多端 / 多标签 / 断线重连并存）；``is_entity_allowed``
    每次都要重新解析用户的 restrictions 列表，按批次复用可省掉重复解析与正则式前缀比较。
    分桶键用限制列表的不可变指纹：无限制 / 无可见实体 / 具体前缀集合。
    """
    from ..platform.security.entity_access import resolve_entity_restrictions

    restrictions = resolve_entity_restrictions(user)
    key: Any = None if restrictions is None else (() if not restrictions else tuple(restrictions))
    bucket = cache.get(key)
    if bucket is None:
        bucket = {}
        cache[key] = bucket
    return bucket
