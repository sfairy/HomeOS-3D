"""服务调用结果的后置校验。

HA 的 ``POST /api/services/<domain>/<service>`` 对「实体离线 / 被跳过」同样返回 200，
响应体只是「本次调用改变了状态的实体」列表：

- 命中 ``unavailable``：连接层已经判失败（``_response_reports_unavailable``）；
- 响应里没有该实体：可能「状态本来就没变」，也可能「被跳过」—— 无法区分，只能标未知；
- 响应里有该实体：可以把 ``state`` / 数值属性与请求的目标值直接比对。

因此这里给出三态 ``verified``：

- ``True``：响应里的状态与目标一致（``reason='state_confirmed'``）；
- ``False``：响应明确显示不一致（``reason='state_mismatch'`` / ``'entity_unavailable'``）；
- ``None``：响应不含该实体或该服务没有可推导目标（``reason`` 说明原因）。

``supported=False`` 表示该服务不属于可校验范围（``button.press``、``script.*``、
``notify`` 这类没有目标态的动作），前端不应据此提示「未确认」。
"""

from __future__ import annotations

from typing import Any

#: 「开 / 关」语义与实体 state 一一对应的域。
_ON_OFF_DOMAINS = frozenset(
    {"light", "switch", "fan", "input_boolean", "humidifier", "siren", "automation"}
)

#: 数值属性容差：注册表里的 0–255 亮度、0–100 百分比、温度、音量各有精度差异，
#: 严格相等会把正常的四舍五入判成失败。
_NUMERIC_TOLERANCE = {
    "brightness": 4.0,
    "percentage": 2.0,
    "current_position": 2.0,
    "temperature": 0.6,
    "target_temp_high": 0.6,
    "target_temp_low": 0.6,
    "volume_level": 0.02,
}


def _expected_state(domain: str, service: str) -> str | None:
    if service == "turn_on" and domain in _ON_OFF_DOMAINS:
        return "on"
    if service == "turn_off" and domain in _ON_OFF_DOMAINS:
        return "off"
    if (domain, service) == ("cover", "open_cover"):
        return "open"
    if (domain, service) == ("cover", "close_cover"):
        return "closed"
    if (domain, service) == ("valve", "open_valve"):
        return "open"
    if (domain, service) == ("valve", "close_valve"):
        return "closed"
    if (domain, service) == ("lock", "lock"):
        return "locked"
    if (domain, service) == ("lock", "unlock"):
        return "unlocked"
    return None


def _expected_attributes(
    domain: str, service: str, service_data: dict[str, Any]
) -> dict[str, float]:
    """从请求参数推导「应当写入」的数值属性。"""
    expected: dict[str, float] = {}
    if domain == "light" and service == "turn_on":
        brightness = service_data.get("brightness")
        brightness_pct = service_data.get("brightness_pct")
        if isinstance(brightness, (int, float)):
            expected["brightness"] = float(brightness)
        elif isinstance(brightness_pct, (int, float)):
            # HA 内部按 0–255 存亮度：百分比换算后再比对，避免 100% → 255 的换算误差
            expected["brightness"] = round(float(brightness_pct) / 100 * 255)
    elif (domain, service) == ("fan", "set_percentage"):
        value = service_data.get("percentage")
        if isinstance(value, (int, float)):
            expected["percentage"] = float(value)
    elif (domain, service) == ("cover", "set_cover_position"):
        value = service_data.get("position")
        if isinstance(value, (int, float)):
            expected["current_position"] = float(value)
    elif (domain, service) == ("climate", "set_temperature"):
        for key in ("temperature", "target_temp_high", "target_temp_low"):
            value = service_data.get(key)
            if isinstance(value, (int, float)):
                expected[key] = float(value)
    elif (domain, service) == ("media_player", "volume_set"):
        value = service_data.get("volume_level")
        if isinstance(value, (int, float)):
            expected["volume_level"] = float(value)

    # 显式传入的亮度 / 位置等也可以直接跟着请求走（HA 支持 brightness 覆盖）
    for key in ("brightness", "percentage", "position", "temperature", "volume_level"):
        value = service_data.get(key)
        if isinstance(value, (int, float)) and key not in expected:
            mapped = "current_position" if key == "position" else key
            expected.setdefault(mapped, float(value))
    return expected


def _iter_states(value: Any):
    """遍历响应体里的实体状态（元素可能包在 ``states`` / ``changed_states`` 里）。"""
    if isinstance(value, list):
        for item in value:
            yield from _iter_states(item)
    elif isinstance(value, dict):
        for key in ("states", "changed_states"):
            nested = value.get(key)
            if isinstance(nested, list):
                yield from _iter_states(nested)
        if "entity_id" in value or "state" in value:
            yield value


def find_response_state(response: Any, entity_id: str) -> tuple[dict[str, Any] | None, int]:
    """返回目标实体的状态与响应中携带的实体条数。"""
    matched: dict[str, Any] | None = None
    count = 0
    for state in _iter_states(response):
        if not isinstance(state, dict):
            continue
        count += 1
        if matched is None and state.get("entity_id") == entity_id:
            matched = state
    return matched, count


def describe_service_verification(
    domain: str,
    service: str,
    entity_id: str,
    service_data: dict[str, Any] | None,
    response: Any,
) -> dict[str, Any]:
    """比对「请求目标」与「HA 响应里的实际状态」，供命令通道如实上报。"""
    data = service_data if isinstance(service_data, dict) else {}
    expected_state = _expected_state(domain, service)
    expected_attrs = _expected_attributes(domain, service, data)
    if expected_state is None and not expected_attrs:
        return {
            "supported": False,
            "verified": None,
            "reason": "no_derivable_target",
            "target": None,
            "observedState": None,
            "respondedEntities": 0,
        }

    observed, responded = find_response_state(response, entity_id)
    target = {
        "state": expected_state,
        "attributes": expected_attrs,
    }
    if observed is None:
        return {
            "supported": True,
            "verified": None,
            "reason": "entity_not_in_response",
            "target": target,
            "observedState": None,
            "respondedEntities": responded,
        }

    observed_state = str(observed.get("state") or "").lower()
    if observed_state in ("unavailable", "unknown"):
        return {
            "supported": True,
            "verified": False,
            "reason": "entity_unavailable",
            "target": target,
            "observedState": observed_state,
            "respondedEntities": responded,
        }

    mismatches: list[dict[str, Any]] = []
    if expected_state is not None and observed_state != expected_state:
        mismatches.append(
            {"kind": "state", "expected": expected_state, "observed": observed_state}
        )
    observed_attrs = observed.get("attributes")
    attrs = observed_attrs if isinstance(observed_attrs, dict) else {}
    for key, expected in expected_attrs.items():
        actual = attrs.get(key)
        if not isinstance(actual, (int, float)):
            mismatches.append({"kind": "attribute", "attribute": key, "expected": expected, "observed": None})
            continue
        tolerance = _NUMERIC_TOLERANCE.get(key, 1.0)
        if abs(float(actual) - expected) > tolerance:
            mismatches.append(
                {
                    "kind": "attribute",
                    "attribute": key,
                    "expected": expected,
                    "observed": float(actual),
                }
            )

    if mismatches:
        return {
            "supported": True,
            "verified": False,
            "reason": "state_mismatch",
            "target": target,
            "observedState": observed_state,
            "respondedEntities": responded,
            "mismatches": mismatches,
        }
    return {
        "supported": True,
        "verified": True,
        "reason": "state_confirmed",
        "target": target,
        "observedState": observed_state,
        "respondedEntities": responded,
        "mismatches": [],
    }


__all__ = ["describe_service_verification", "find_response_state"]
