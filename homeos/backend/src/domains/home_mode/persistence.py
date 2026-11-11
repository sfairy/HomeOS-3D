"""家庭模式的读写映射（从 ``service.py`` 拆出）。

三件事都属「数据整形」，与激活状态机无关：

- ``mode_to_dict``：ORM 行 → 对外视图（含 JSON 字段的容错解析）；
- ``build_mode_row``：请求字段 → ORM 构造参数；
- ``apply_mode_fields``：部分更新时把字段写进既有 ORM 行。

**表驱动**而不是逐个 ``if``：字段集合是纯数据，逐分支堆在函数里会同时抬高圈复杂度与
分支数，加一个字段就要再动一次判定逻辑。写时校验（动作白名单）也在这里统一做，
于是「新增一条写入路径」不会绕过它。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .activation import normalize_execution_mode
from .policy import assert_mode_actions_allowed
from .runtime import normalize_home_mode_json_array
from ...platform.core.http.errors import bad_request

logger = logging.getLogger("homeos.home_mode.persistence")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def _parse_json(raw: Any, fallback: Any) -> Any:
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.debug("JSON 字段解析失败，按兜底值处理: %r", str(raw)[:80])
        return fallback


def _parse_json_loud(raw: Any, fallback: Any, *, field: str, mode_id: str) -> Any:
    """与 ``_parse_json`` 同口径，但解析失败**留日志**，不再静默返回兜底值。

    ``config`` 解析失败 = 这个模式的动作全丢了（激活后什么都不会发生）；
    ``triggers`` / ``conditions`` 解析失败 = 自动化静默失效。界面上它们看起来都正常，
    所以必须留下可查的线索。
    """
    if raw is None or raw == "":
        return fallback
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError) as error:
        logger.error(
            "家庭模式 %s 的 %s 字段不是合法 JSON（%s），已按兜底值处理",
            mode_id or "<unknown>",
            field,
            error,
        )
        return fallback


def coerce_int_field(raw: Any, key: str, default: int) -> int:
    """可选整数字段：非法值给 400 而不是让 ``int()`` 炸成 500。"""
    if raw is None or raw == "":
        return default
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        bad_request(f"{key} 须为整数")
    try:
        return int(str(raw).strip()) if isinstance(raw, str) else int(raw)
    except (TypeError, ValueError):  # fmt: skip
        logger.warning("%s 不是整数，已拒绝写入: %r", key, raw)
        bad_request(f"{key} 须为整数")
    return default


def mode_to_dict(mode: Any) -> dict[str, Any]:
    """ORM 行 → 对外视图。"""
    mode_id = str(mode.id)
    return {
        "id": mode.id,
        "name": mode.name,
        "icon": mode.icon,
        "config": _parse_json_loud(mode.config, [], field="config", mode_id=mode_id),
        "triggers": _parse_json_loud(mode.triggers, None, field="triggers", mode_id=mode_id),
        "isActive": bool(mode.is_active),
        "deviceSnapshot": _parse_json(mode.device_snapshot, None),
        "sortOrder": mode.sort_order,
        "exclusiveGroup": mode.exclusive_group,
        "priority": mode.priority,
        # 条件组：None 表示无条件（旧行为）。
        "conditions": _parse_json_loud(mode.conditions, None, field="conditions", mode_id=mode_id),
        "executionMode": mode.execution_mode or "queued",
        "createdAt": _iso(mode.created_at),
        "updatedAt": _iso(mode.updated_at),
    }


def normalize_mode_fields(data: dict[str, Any]) -> dict[str, Any]:
    """写入前的字段归一（JSON 数组 + 动作白名单校验）。

    校验放在这里而不是 API 层：实体解绑后重写 ``config`` 走的是同一条路径，
    只在 API 层校验会漏掉它。
    """
    fields = dict(data)
    if "config" in fields:
        fields["config"] = normalize_home_mode_json_array(fields["config"], "config", True)
        assert_mode_actions_allowed(fields["config"])
    if "triggers" in fields:
        fields["triggers"] = normalize_home_mode_json_array(fields["triggers"], "triggers", False)
    if "conditions" in fields:
        fields["conditions"] = normalize_home_mode_json_array(fields["conditions"], "conditions", False)
    return fields


def build_mode_row(fields: dict[str, Any]) -> dict[str, Any]:
    """请求字段 → ``HomeMode(...)`` 的关键字参数。"""
    return {
        "name": str(fields.get("name") or ""),
        "icon": fields.get("icon") or "home",
        "config": json.dumps(fields.get("config") or [], ensure_ascii=False),
        "triggers": (
            json.dumps(fields["triggers"], ensure_ascii=False) if fields.get("triggers") is not None else None
        ),
        "sort_order": coerce_int_field(fields.get("sortOrder"), "sortOrder", 0),
        "exclusive_group": fields.get("exclusiveGroup") or "default",
        "priority": coerce_int_field(fields.get("priority"), "priority", 50),
        "conditions": json.dumps(fields["conditions"], ensure_ascii=False) if fields.get("conditions") else None,
        "execution_mode": normalize_execution_mode(fields.get("executionMode")),
    }


def _json_or_none(value: Any) -> str | None:
    return json.dumps(value, ensure_ascii=False) if value is not None else None


#: 部分更新：字段名 → 写入 ORM 行的函数（``fields`` 已归一）。
_MODE_FIELD_APPLIERS: dict[str, Any] = {
    "name": lambda row, value: setattr(row, "name", str(value)),
    "icon": lambda row, value: setattr(row, "icon", value),
    "config": lambda row, value: setattr(row, "config", json.dumps(value or [], ensure_ascii=False)),
    "triggers": lambda row, value: setattr(row, "triggers", _json_or_none(value)),
    "sortOrder": lambda row, value: setattr(row, "sort_order", coerce_int_field(value, "sortOrder", 0)),
    "exclusiveGroup": lambda row, value: setattr(row, "exclusive_group", value or "default"),
    "priority": lambda row, value: setattr(row, "priority", coerce_int_field(value, "priority", 50)),
    "conditions": lambda row, value: setattr(row, "conditions", _json_or_none(value or None)),
    "executionMode": lambda row, value: setattr(row, "execution_mode", normalize_execution_mode(value)),
}


def apply_mode_fields(row: Any, fields: dict[str, Any]) -> None:
    """把已归一的部分更新字段写进 ORM 行。"""
    for field, apply_field in _MODE_FIELD_APPLIERS.items():
        if field in fields:
            apply_field(row, fields[field])


__all__ = [
    "apply_mode_fields",
    "build_mode_row",
    "coerce_int_field",
    "mode_to_dict",
    "normalize_mode_fields",
]
