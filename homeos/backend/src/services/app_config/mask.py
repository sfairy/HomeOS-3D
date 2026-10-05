"""应用配置脱敏与角色裁剪（对齐 ``shared/app-config/config-mask.util.ts``）。"""

from __future__ import annotations

import copy
import re
from typing import Any

from .constants import CONFIG_MASK_PLACEHOLDER, PUBLIC_CONFIG_SECTIONS

#: 敏感字段 key 正则（password/token/secret 等）。
SENSITIVE_FIELD_RE = re.compile(r"password|token|secret|apikey|webhook|key$", re.IGNORECASE)

_ADULT_SECURITY_READ_KEYS = (
    "sensorAlertCooldownSec",
    "requireConfiguredPersons",
    "autoArmOnEveryoneLeft",
    "autoUpgradeToAwayOnEveryoneLeft",
    "autoDisarmOnFirstHome",
    "presencePersons",
    "linkAwaySimOnArmAway",
    "linkHomeModeOnSecurityChange",
    "frigatePersonAlarmModes",
    "frigateMaxEvents",
    "frigateDedupMs",
)

_ADULT_ENERGY_READ_KEYS = (
    "meterEntityId",
    "circuitEntityIds",
    "learningPeriodDays",
    "learningStartedAt",
)


def is_masked_value(val: Any) -> bool:
    return val == CONFIG_MASK_PLACEHOLDER or val == "********"


def mask_sensitive_fields_by_key(
    obj: Any, placeholder: str = CONFIG_MASK_PLACEHOLDER, depth: int = 0, max_depth: int = 4
) -> None:
    """按 key 正则递归脱敏对象中的敏感字段（原地修改）。"""
    if not isinstance(obj, dict) or depth > max_depth:
        return
    for key in list(obj.keys()):
        val = obj[key]
        if isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    mask_sensitive_fields_by_key(item, placeholder, depth + 1, max_depth)
        elif isinstance(val, dict):
            mask_sensitive_fields_by_key(val, placeholder, depth + 1, max_depth)
        elif SENSITIVE_FIELD_RE.search(str(key)) and val is not None and len(str(val)) > 0:
            obj[key] = placeholder


def restore_client_power_report_tokens(next_cfg: Any, prev_cfg: Any) -> None:
    """保存 clients 数组时按 id 回填已有 reportToken（原地修改 ``next_cfg``）。"""
    clients = (next_cfg or {}).get("clients") if isinstance(next_cfg, dict) else None
    if not isinstance(clients, list) or not clients:
        return
    prev_by_id: dict[str, str] = {}
    prev_clients = (prev_cfg or {}).get("clients") if isinstance(prev_cfg, dict) else None
    for client in prev_clients or []:
        if not isinstance(client, dict):
            continue
        cid = str(client.get("id") or "").strip()
        if cid:
            prev_by_id[cid] = str(client.get("reportToken") or "").strip()
    for client in clients:
        if not isinstance(client, dict):
            continue
        cid = str(client.get("id") or "").strip()
        if not cid:
            continue
        current = str(client.get("reportToken") or "").strip()
        if current and not is_masked_value(current):
            continue
        kept = prev_by_id.get(cid)
        if kept:
            client["reportToken"] = kept
        elif is_masked_value(client.get("reportToken")):
            client["reportToken"] = ""


def apply_import_replace_preserving_secrets(imported: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """全量 replace 导入：保留当前配置中对应脱敏字段的真实值。"""
    out = copy.deepcopy(imported)

    def restore(target: dict[str, Any], src_imp: dict[str, Any], src_cur: dict[str, Any]) -> None:
        for key, imp_val in src_imp.items():
            cur_val = src_cur.get(key)
            if isinstance(imp_val, dict):
                if not isinstance(target.get(key), dict):
                    target[key] = {}
                cur_child = cur_val if isinstance(cur_val, dict) else {}
                restore(target[key], imp_val, cur_child)
            elif is_masked_value(imp_val) and cur_val is not None:
                target[key] = cur_val

    restore(out, imported, current)
    return out


def _should_strip_secret_value(key: str, val: Any) -> bool:
    if is_masked_value(val):
        return True
    if not SENSITIVE_FIELD_RE.search(str(key)):
        return False
    return val is None or val == ""


def _walk_strip_masked(target: Any, source: Any) -> None:
    if not isinstance(source, (dict, list)):
        return
    if isinstance(source, list):
        if not isinstance(target, list):
            return
        for i, src_item in enumerate(source):
            if isinstance(src_item, (dict, list)) and i < len(target):
                _walk_strip_masked(target[i], src_item)
        return
    for key, val in source.items():
        if isinstance(val, (dict, list)):
            if not isinstance(target.get(key), type(val)):
                target[key] = [] if isinstance(val, list) else {}
            _walk_strip_masked(target[key], val)
        elif _should_strip_secret_value(key, val):
            target.pop(key, None)
        else:
            target[key] = val


def strip_masked_placeholders(partial: dict[str, Any]) -> dict[str, Any]:
    """PUT 时剔除脱敏占位符与空敏感字段，避免覆盖真实密钥。"""
    out = copy.deepcopy(partial)
    _walk_strip_masked(out, partial)
    return out


def _pick_partial_section(source: Any, keys: tuple[str, ...]) -> dict[str, Any] | None:
    if not isinstance(source, dict):
        return None
    out: dict[str, Any] = {}
    for key in keys:
        if key in source:
            out[key] = source[key]
    return out or None


def pick_config_for_role(config: dict[str, Any], role: str | None) -> dict[str, Any]:
    """按角色（admin/adult/访客/儿童）裁剪 GET /system/config 下发内容。"""
    if role == "admin":
        return config

    public: dict[str, Any] = {}
    for section in PUBLIC_CONFIG_SECTIONS:
        if section in config:
            public[section] = copy.deepcopy(config[section])

    if role == "adult":
        out = public
        if config.get("envSensorMap"):
            out["envSensorMap"] = copy.deepcopy(config["envSensorMap"])
        energy = _pick_partial_section(config.get("energy"), _ADULT_ENERGY_READ_KEYS)
        if energy:
            out["energy"] = energy
        security = _pick_partial_section(config.get("security"), _ADULT_SECURITY_READ_KEYS)
        if security:
            out["security"] = security
        return copy.deepcopy(out)

    return copy.deepcopy(public)


__all__ = [
    "SENSITIVE_FIELD_RE",
    "is_masked_value",
    "mask_sensitive_fields_by_key",
    "restore_client_power_report_tokens",
    "apply_import_replace_preserving_secrets",
    "strip_masked_placeholders",
    "pick_config_for_role",
]
