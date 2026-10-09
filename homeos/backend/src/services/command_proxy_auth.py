"""命令代理授权工具（对齐 command-proxy/authorization.util.ts）。"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from ..core.entity_domain import is_child_domain_access_denied
from ..core.errors import api_error, bad_request, forbidden
from ..realtime.access import is_entity_allowed

_MEDIA_PATTERNS = (
    re.compile(r"^/api/camera_proxy(?:_stream)?/(.+)$"),
    re.compile(r"^/api/media_player_proxy/(.+)$"),
    re.compile(r"^/api/image_proxy/(.+)$"),
)


class RegistryTargetResolver:
    """间接目标解析：注册表（area/device/label）+ 状态内存（属性谓词）。

    ``assert_command_proxy_authorized`` 需要把「区域 / 设备 / 标签」这类间接目标
    展开成实体 id 才能做白名单判定（对齐 Nest ``resolveTargets``）。HTTP 命令通道
    （``/services/call``）与 ``/ha/services/call`` 共用本解析器，避免两套实现漂移。
    """

    def __init__(self, request: Any) -> None:
        self._request = request

    async def get_registry(self) -> list[dict[str, Any]]:
        return await self._request.app.state.ha_connector.fetch_entity_registry()

    def find_entity_ids(self, predicate: Callable[[dict[str, Any]], bool]) -> list[str]:
        gateway = getattr(self._request.app.state, "realtime", None)
        store = getattr(gateway, "state_store", None)
        if store is None:
            return []
        return [
            entity["entity_id"]
            for entity in store.get_all()
            if entity.get("entity_id") and predicate(entity.get("attributes") or {})
        ]


def _to_id_array(value: Any) -> list[str]:
    if isinstance(value, str) and value:
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item]
    return []


def _add(out: set[str], value: Any) -> None:
    if isinstance(value, str):
        out.add(value)
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                out.add(item)


async def collect_target_entities(dto: dict[str, Any], resolver: Any) -> list[str]:
    out: set[str] = set()
    _add(out, dto.get("entity_id"))
    service_data = dto.get("service_data")
    if isinstance(service_data, dict):
        _add(out, service_data.get("entity_id"))
        target = service_data.get("target")
        if isinstance(target, dict):
            _add(out, target.get("entity_id"))
            area_ids = _to_id_array(target.get("area_id"))
            device_ids = _to_id_array(target.get("device_id"))
            label_ids = _to_id_array(target.get("label_id"))
            if area_ids or device_ids or label_ids:
                if resolver is None:
                    forbidden(api_error("ACCESS_ENTITY_DENIED"))
                if area_ids:
                    wanted_areas = set(area_ids)

                    def _area_match(attrs: dict[str, Any]) -> bool:
                        return attrs.get("area_id") is not None and str(attrs["area_id"]) in wanted_areas

                    for eid in resolver.find_entity_ids(_area_match):
                        out.add(eid)
                if device_ids:
                    registry = await resolver.get_registry()
                    for row in registry:
                        if row.get("device_id") and row["device_id"] in device_ids:
                            out.add(row["entity_id"])
                if label_ids:
                    wanted_labels = set(label_ids)
                    registry = await resolver.get_registry()
                    matched = 0
                    for row in registry:
                        labels = row.get("labels") or []
                        if any(label in wanted_labels for label in labels):
                            out.add(row["entity_id"])
                            matched += 1

                    def _label_match(attrs: dict[str, Any]) -> bool:
                        labels = attrs.get("labels")
                        if not isinstance(labels, list):
                            return False
                        return any(str(label) in wanted_labels for label in labels)

                    for eid in resolver.find_entity_ids(_label_match):
                        out.add(eid)
                        matched += 1
                    if matched == 0:
                        bad_request(api_error("TARGET_LABEL_UNRESOLVED", ", ".join(label_ids)))
    return list(out)


async def assert_command_proxy_authorized(
    dto: dict[str, Any], user: dict[str, Any] | None, resolver: Any = None
) -> None:
    role = (user or {}).get("role")
    if role == "guest":
        forbidden(api_error("ACCESS_GUEST_DEVICE_DENIED"))
    if is_child_domain_access_denied(role, str(dto.get("domain") or "")):
        forbidden(api_error("ACCESS_ROLE_DEVICE_DENIED"))
    restrictions = (user or {}).get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if role == "child" and not restrictions:
        forbidden(api_error("ACCESS_CHILD_NO_WHITELIST"))
    targets = await collect_target_entities(dto, resolver)
    if role != "admin" and restrictions and not _all_allowed(targets, restrictions):
        forbidden(api_error("ACCESS_ENTITY_DENIED"))


def assert_history_authorized(entity_ids: list[str], user: dict[str, Any] | None) -> None:
    if (user or {}).get("role") == "guest":
        forbidden(api_error("ACCESS_GUEST_DEVICE_DENIED"))
    restrictions = (user or {}).get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if (user or {}).get("role") == "child" and not restrictions:
        forbidden(api_error("ACCESS_CHILD_NO_WHITELIST"))
    role = (user or {}).get("role")
    if role != "admin" and restrictions and not _all_allowed(entity_ids, restrictions):
        forbidden(api_error("ACCESS_ENTITY_DENIED"))


def assert_webrtc_authorized(entity_id: str, user: dict[str, Any] | None) -> None:
    if not entity_id or not entity_id.startswith("camera."):
        forbidden("仅允许访问 camera 实体")
    role = (user or {}).get("role")
    restrictions = (user or {}).get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if role == "guest":
        if not restrictions:
            forbidden(api_error("ACCESS_GUEST_DEVICE_DENIED"))
        if not is_entity_allowed(entity_id, restrictions):
            forbidden(api_error("ACCESS_ENTITY_DENIED"))
        return
    if is_child_domain_access_denied(role, "camera"):
        forbidden(api_error("ACCESS_ROLE_DEVICE_DENIED"))
    if role == "child" and not restrictions:
        forbidden(api_error("ACCESS_CHILD_NO_WHITELIST"))
    if role != "admin" and restrictions and not is_entity_allowed(entity_id, restrictions):
        forbidden(api_error("ACCESS_ENTITY_DENIED"))


def extract_entity_id_from_media_path(path: str) -> str | None:
    clean = (path if path.startswith("/") else f"/{path}").split("?")[0]
    for pattern in _MEDIA_PATTERNS:
        match = pattern.match(clean)
        if match and match.group(1):
            try:
                from urllib.parse import unquote

                return unquote(match.group(1))
            except Exception:
                return match.group(1)
    return None


def _assert_entity_access_for_media(entity_id: str, user: dict[str, Any] | None) -> None:
    role = (user or {}).get("role")
    if role == "guest":
        forbidden(api_error("ACCESS_GUEST_DEVICE_DENIED"))
    restrictions = (user or {}).get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    if role == "child" and not restrictions:
        forbidden(api_error("ACCESS_CHILD_NO_WHITELIST"))
    if role != "admin" and restrictions and not is_entity_allowed(entity_id, restrictions):
        forbidden(api_error("ACCESS_ENTITY_DENIED"))


def assert_ha_media_path_authorized(path: str, user: dict[str, Any] | None) -> None:
    """媒体路径实体 ACL（遗留辅助）。

    当前 HTTP 摄像头/媒体代理走 ``ha_proxy`` + 许可 feature 门禁，**未**挂此函数。
    保留实现供命令代理或将来媒体旁路复用；勿在文档里写成「已强制执行」。
    """
    entity_id = extract_entity_id_from_media_path(path)
    if entity_id and entity_id.startswith("camera."):
        assert_webrtc_authorized(entity_id, user)
        return
    if entity_id:
        _assert_entity_access_for_media(entity_id, user)
        return
    if (user or {}).get("role") == "guest":
        forbidden(api_error("ACCESS_GUEST_DEVICE_DENIED"))
    if (user or {}).get("role") != "admin":
        forbidden(api_error("ACCESS_ENTITY_DENIED"))


def _all_allowed(entity_ids: list[str], restrictions: list[str]) -> bool:
    if not entity_ids:
        return False
    return all(is_entity_allowed(entity_id, restrictions) for entity_id in entity_ids)


def is_dangerous_ha_control(domain: str, service: str, entity_id: str) -> bool:
    d = str(domain or "").lower()
    s = str(service or "").lower()
    eid = str(entity_id or "").lower()
    if d == "valve":
        return True
    if d == "lock":
        return s in ("lock", "unlock", "open")
    if d == "alarm_control_panel":
        return s.startswith("alarm_")
    if d == "siren":
        return s in ("turn_on", "turn_off", "toggle")
    if d == "switch" and re.search(r"valve|gas|water_main|water_shut|gas_shut", eid):
        return True
    if d == "fan" and re.search(r"exhaust|vent|排风", eid):
        return s == "turn_on"
    return False


__all__ = [
    "RegistryTargetResolver",
    "assert_command_proxy_authorized",
    "assert_ha_media_path_authorized",
    "assert_history_authorized",
    "assert_webrtc_authorized",
    "collect_target_entities",
    "extract_entity_id_from_media_path",
    "is_dangerous_ha_control",
]


_ = Callable
