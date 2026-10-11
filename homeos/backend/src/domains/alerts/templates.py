"""告警规则消息模板格式化（对齐 ``common/alert-support/alert-message-template.util.ts``）。

支持插值变量：``{{state}}`` / ``{{value}}`` / ``{{val}}`` / ``{{name}}`` /
``{{friendly_name}}`` / ``{{entity}}`` / ``{{entity_id}}`` / ``{{rule}}`` / ``{{unit}}``。
"""

from __future__ import annotations

import re
from typing import Any

#: 默认告警规则消息模板。
DEFAULT_ALERT_RULE_MESSAGE = "[规则] {{name}}: {{entity}} = {{state}}"

_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def apply_alert_template(
    template: str,
    variables: dict[str, Any],
) -> str:
    """替换模板变量 ``{{key}}``；值为 None 时替换为空串。"""

    def _replace(match: re.Match[str]) -> str:
        value = variables.get(match.group(1))
        return "" if value is None else str(value)

    return _PLACEHOLDER_RE.sub(_replace, str(template)).strip()


def _coalesce(*values: Any) -> Any:
    """复刻 JS ``??``：返回第一个非 None 值，全为 None 时返回 None。"""
    for value in values:
        if value is not None:
            return value
    return None


def format_alert_rule_message(template: str | None, variables: dict[str, Any]) -> str:
    """根据模板与变量生成告警规则消息（空模板回退默认模板）。"""
    merged = {
        "entity": _coalesce(variables.get("entity"), variables.get("entity_id"), ""),
        "entity_id": _coalesce(variables.get("entity_id"), variables.get("entity"), ""),
        "state": _coalesce(variables.get("state"), ""),
        "name": _coalesce(
            variables.get("name"),
            variables.get("friendly_name"),
            variables.get("entity_id"),
            "",
        ),
        "friendly_name": _coalesce(variables.get("friendly_name"), variables.get("name"), ""),
        "value": _coalesce(variables.get("value"), variables.get("state"), ""),
        "rule": _coalesce(variables.get("rule"), ""),
        "val": _coalesce(variables.get("value"), variables.get("state"), ""),
        "unit": _coalesce(variables.get("unit"), ""),
    }
    raw = str(template or "").strip() or DEFAULT_ALERT_RULE_MESSAGE
    return apply_alert_template(raw, merged)


__all__ = ["DEFAULT_ALERT_RULE_MESSAGE", "apply_alert_template", "format_alert_rule_message"]
