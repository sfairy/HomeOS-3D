"""应用配置导入规范化。

备份/导入前剥离未登记分区并修正越界值，避免脏数据阻断校验。
"""

from __future__ import annotations

import math
from typing import Any

from .constants import REBUILD_DEBOUNCE_MS_MAX, REBUILD_DEBOUNCE_MS_MIN
from .defaults import DEFAULT_APP_CONFIG

_REBUILD_DEBOUNCE_DEFAULT = DEFAULT_APP_CONFIG["frontend"]["rebuildDebounceMs"]

#: 当前 schema 允许的顶层分区。
_KNOWN_APP_CONFIG_SECTIONS = set(DEFAULT_APP_CONFIG.keys())


def _strip_unknown_sections(config: dict[str, Any], changes: list[str]) -> None:
    for key in list(config.keys()):
        if key in _KNOWN_APP_CONFIG_SECTIONS:
            continue
        config.pop(key, None)
        changes.append(f"{key}: 已忽略未知配置分区")


def _normalize_rebuild_debounce_ms(frontend: dict[str, Any], changes: list[str]) -> None:
    if "rebuildDebounceMs" not in frontend:
        return
    raw = frontend["rebuildDebounceMs"]
    if raw is None or raw == "":
        frontend["rebuildDebounceMs"] = _REBUILD_DEBOUNCE_DEFAULT
        changes.append(
            f"frontend.rebuildDebounceMs: 无效值 {raw!r} → {_REBUILD_DEBOUNCE_DEFAULT}"
        )
        return
    try:
        n = float(raw)
    except (TypeError, ValueError):
        frontend["rebuildDebounceMs"] = _REBUILD_DEBOUNCE_DEFAULT
        changes.append(
            f"frontend.rebuildDebounceMs: 无效值 {raw!r} → {_REBUILD_DEBOUNCE_DEFAULT}"
        )
        return
    if math.isnan(n):
        frontend["rebuildDebounceMs"] = _REBUILD_DEBOUNCE_DEFAULT
        changes.append(
            f"frontend.rebuildDebounceMs: 无效值 {raw!r} → {_REBUILD_DEBOUNCE_DEFAULT}"
        )
        return
    if n < REBUILD_DEBOUNCE_MS_MIN or n > REBUILD_DEBOUNCE_MS_MAX:
        clamped = int(min(REBUILD_DEBOUNCE_MS_MAX, max(REBUILD_DEBOUNCE_MS_MIN, n)))
        frontend["rebuildDebounceMs"] = clamped
        changes.append(
            f"frontend.rebuildDebounceMs: {int(n)} → {clamped}"
            f"（clamp 至 {REBUILD_DEBOUNCE_MS_MIN}–{REBUILD_DEBOUNCE_MS_MAX}）"
        )


def normalize_app_config_for_import(config: dict[str, Any]) -> dict[str, Any]:
    """备份/导入前规范化运行参数；返回 ``{"config", "changes"}``（原地修改 config）。"""
    changes: list[str] = []
    _strip_unknown_sections(config, changes)
    frontend = config.get("frontend")
    if isinstance(frontend, dict):
        _normalize_rebuild_debounce_ms(frontend, changes)
    return {"config": config, "changes": changes}


__all__ = ["normalize_app_config_for_import"]
