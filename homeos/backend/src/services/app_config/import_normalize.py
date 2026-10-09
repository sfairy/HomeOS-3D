"""应用配置导入规范化（对齐 ``shared/app-config/import-normalize.util.ts``）。

备份/导入前修正越界值、剥离遗留键与下线字段，避免阻断校验。
"""

from __future__ import annotations

from typing import Any

from .constants import REBUILD_DEBOUNCE_MS_MAX, REBUILD_DEBOUNCE_MS_MIN
from .defaults import DEFAULT_APP_CONFIG

_REBUILD_DEBOUNCE_DEFAULT = DEFAULT_APP_CONFIG["frontend"]["rebuildDebounceMs"]

#: 历史上误写入 AppConfig.frontend 的布局字段（应在 ProjectConfig.layout）。
_FRONTEND_LAYOUT_ONLY_KEYS = ("glassEffect", "floorplanRenderer", "performanceMode")

#: 当前 schema 允许的顶层分区。
_KNOWN_APP_CONFIG_SECTIONS = set(DEFAULT_APP_CONFIG.keys())

#: 曾挂在 ui 分区的屏保开关/空闲，现迁入 screensaver。
_UI_SCREENSAVER_LEGACY_KEYS = ("screensaverEnabled", "screensaverIdleMs")


#: schema v17 下线的字段 → 从持久化/备份中剥离。
_REMOVED_CONFIG_KEYS: dict[str, tuple[str, ...]] = {
    "security": (
        "bathroomLongStayHighMin",
        "bathroomLongStayMediumMin",
        "bedroomInactiveHours",
        "deepNightStart",
        "deepNightEnd",
        "nightStart",
        "nightEnd",
        "wholeHouseInactiveDayHours",
        "wholeHouseInactiveNightHours",
        "kitchenStayWarnMin",
        "anomalyCooldownMin",
        "anomalyPeriodicIntervalMin",
    ),
    "circadian": (
        "luxFeedbackEnabled",
        "forecastPreAdjust",
        "perRoomEnabled",
        "overrideLearningEnabled",
        "luxTargetDay",
    ),
    "water": (
        "linkageWaterEnabled",
        "linkageWaterAnomalySceneId",
        "linkageWaterAnomalyModeId",
        "linkageWaterAnomalyCooldownMin",
        "continuousFlowCount",
        "dailyLimitM3",
    ),
    "iaq": (
        "iaqTargetTemp",
        "iaqTargetHumidity",
        "iaqWeightPm25",
        "iaqWeightCo2",
        "iaqWeightTvoc",
        "iaqWeightTemp",
        "iaqWeightHumidity",
        "iaqAlertThreshold",
        "linkageIaqSceneId",
        "linkageMoldSceneId",
        "linkageIaqFanEntityId",
        "linkageDehumidifierEntityId",
    ),
    "energy": (
        "linkageEnabled",
        "linkageBudgetModeId",
        "linkageAnomalySceneId",
        "linkageClimateApply",
        "linkageWaterHeaterEco",
        "meterAnchorKwh",
        "meterAnchorMonth",
        "meterAnchorEntityId",
        "meterAnchorUpdatedAt",
        "storageDispatchEnabled",
        "storageDispatchBatteryEntityId",
        "storageDispatchChargeEntities",
        "storageDispatchDischargeEntities",
        "storageDispatchChargeSocTarget",
        "storageDispatchDischargeSocThreshold",
        "storageDispatchDischargeSocMin",
        "storageDispatchCooldownMin",
        "baselineSize",
        "sustainedMs",
        "standbyThresholdW",
        "spikeRatio",
        "linkageWaterHeaterEntityId",
    ),
    "pricing": ("tier2Kwh",),
    "frontend": ("defaultWidgetPollMs",),
    "ops": ("orchestratorImportMaxRetry", "sceneOverlayUndoTtlMin"),
}


def _strip_removed_config_keys(config: dict[str, Any], changes: list[str]) -> None:
    for section, keys in _REMOVED_CONFIG_KEYS.items():
        sec = config.get(section)
        if not isinstance(sec, dict):
            continue
        for key in keys:
            if key in sec:
                sec.pop(key, None)
                changes.append(f"{section}.{key}: 已移除（字段下线）")


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
    if n != n:
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


def _strip_frontend_layout_only_keys(frontend: dict[str, Any], changes: list[str]) -> None:
    for key in _FRONTEND_LAYOUT_ONLY_KEYS:
        if key in frontend:
            frontend.pop(key, None)
            changes.append(f"frontend.{key}: 已移除（属于显示方案 layout，非运行参数）")


def _strip_unknown_sections(config: dict[str, Any], changes: list[str]) -> None:
    for key in list(config.keys()):
        if key in _KNOWN_APP_CONFIG_SECTIONS:
            continue
        config.pop(key, None)
        changes.append(f"{key}: 已忽略未知配置分区")


def _migrate_ui_screensaver_keys(config: dict[str, Any], changes: list[str]) -> None:
    """将 ui.screensaverEnabled / ui.screensaverIdleMs 迁入 screensaver 分区。"""
    ui = config.get("ui")
    if not isinstance(ui, dict):
        return
    ss = config.get("screensaver")
    if not isinstance(ss, dict):
        ss = {}
        config["screensaver"] = ss
    for key in _UI_SCREENSAVER_LEGACY_KEYS:
        if key not in ui:
            continue
        if key not in ss:
            ss[key] = ui[key]
            changes.append(f"ui.{key} → screensaver.{key}")
        else:
            changes.append(f"ui.{key}: 已移除（screensaver 分区已有同名字段）")
        ui.pop(key, None)


def normalize_app_config_for_import(config: dict[str, Any]) -> dict[str, Any]:
    """备份/导入前规范化运行参数；返回 ``{"config", "changes"}``（原地修改 config）。"""
    changes: list[str] = []
    _strip_unknown_sections(config, changes)
    _strip_removed_config_keys(config, changes)
    _migrate_ui_screensaver_keys(config, changes)
    frontend = config.get("frontend")
    if isinstance(frontend, dict):
        _normalize_rebuild_debounce_ms(frontend, changes)
        _strip_frontend_layout_only_keys(frontend, changes)
    return {"config": config, "changes": changes}


__all__ = ["normalize_app_config_for_import"]
