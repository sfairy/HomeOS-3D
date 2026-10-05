"""跨端最小能源配置契约（对齐 ``@homeos/shared/setup/energy-config.util``）。

convention / entity / multi 三模式；用于判断能源账户类别是否已配置。
"""

from __future__ import annotations

from typing import Any

MODE_CONVENTION = "convention"
MODE_ENTITY = "entity"
MODE_MULTI = "multi"


def create_default_energy_source() -> dict[str, Any]:
    return {"mode": MODE_CONVENTION, "account": "", "entityId": "", "entityMap": {}}


def get_first_account(raw: Any) -> str:
    """从户号字符串（可能逗号拼接多个）中取第一个非空户号。"""
    if not raw:
        return ""
    return str(raw).split(",")[0].strip()


def _first_configured_account_number(cfg: dict[str, Any]) -> str:
    entries = cfg.get("accountEntries")
    if isinstance(entries, list):
        for entry in entries:
            number = str((entry or {}).get("number") or "").strip() if isinstance(entry, dict) else ""
            if number:
                return number
    return get_first_account(cfg.get("account"))


def normalize_energy_source(
    stats_sensors: dict[str, Any] | None, cat: str
) -> dict[str, Any]:
    """从 ``statsSensors.energySources`` 解析类别配置（setup 最小契约）。"""
    stats = stats_sensors or {}
    sources = stats.get("energySources")
    raw = sources.get(cat) if isinstance(sources, dict) else None
    base: dict[str, Any] = {**create_default_energy_source(), **(raw if isinstance(raw, dict) else {})}
    if base.get("mode") == MODE_CONVENTION:
        base = {**base, "account": str(base.get("account") or "").strip()}
    return base


def has_energy_config(cat: str, stats_sensors: dict[str, Any] | None) -> bool:
    """类别是否已配置（convention / entity / multi 三模式）。"""
    cfg = normalize_energy_source(stats_sensors, cat)
    mode = cfg.get("mode")
    if mode == MODE_CONVENTION:
        return bool(_first_configured_account_number(cfg))
    if mode == MODE_ENTITY:
        rows = cfg.get("accountEntities")
        if isinstance(rows, list) and any(
            str((r or {}).get("entityId") or "").strip() for r in rows if isinstance(r, dict)
        ):
            return True
        return bool(str(cfg.get("entityId") or "").strip())
    if mode == MODE_MULTI:
        rows = cfg.get("multiAccounts")
        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if str(row.get("entityId") or "").strip():
                    return True
                entity_map = row.get("entityMap")
                if isinstance(entity_map, dict) and any(
                    str(v or "").strip() for v in entity_map.values()
                ):
                    return True
        entity_map = cfg.get("entityMap")
        return isinstance(entity_map, dict) and any(
            str(v or "").strip() for v in entity_map.values()
        )
    return False


__all__ = [
    "MODE_CONVENTION",
    "MODE_ENTITY",
    "MODE_MULTI",
    "create_default_energy_source",
    "get_first_account",
    "has_energy_config",
    "normalize_energy_source",
]
