"""安全与民生分区校验：auth / notification / security / water / iaq / circadian。"""

from __future__ import annotations

from typing import Any

from .core import (
    FieldError,
    num_in,
    require_bool,
    validate_optional_entity_id,
)


def _validate_notification(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    for k in ("dndStart", "dndEnd"):
        if k in payload:
            num_in(section, k, payload[k], 0, 23, errors)
    if "maxNotifications" in payload:
        num_in(section, "maxNotifications", payload["maxNotifications"], 1, 10000, errors)
    if "offlineCooldownMin" in payload:
        num_in(section, "offlineCooldownMin", payload["offlineCooldownMin"], 1, 1440, errors)
    if "lowBatteryCooldownMin" in payload:
        num_in(section, "lowBatteryCooldownMin", payload["lowBatteryCooldownMin"], 1, 1440, errors)
    for k in (
        "globalNotifyEnabled",
        "importantNotifyEnabled",
        "offlineNotifyEnabled",
        "lowBatteryNotifyEnabled",
    ):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    _validate_notification_mute(section, payload, errors)


def _validate_notification_mute(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    """按来源静音与免打扰星期（各自独立的分支，抽出来避免抬高 _validate_notification 圈复杂度）。"""
    if "mutedSources" in payload:
        raw = payload["mutedSources"]
        if not isinstance(raw, list) or any(not isinstance(item, str) for item in raw):
            errors.append({"section": section, "key": "mutedSources", "message": "须为字符串数组"})
    if "dndWeekdays" not in payload:
        return
    raw_days = payload["dndWeekdays"]
    bad = not isinstance(raw_days, list) or any(
        not isinstance(item, int) or isinstance(item, bool) or not 0 <= item <= 6 for item in raw_days
    )
    if bad:
        errors.append({"section": section, "key": "dndWeekdays", "message": "须为 0–6 的整数数组（0=周日）"})


def _validate_frigate_person_alarm_modes(section: str, patch: dict[str, Any], errors: list[FieldError]) -> None:
    raw = patch["frigatePersonAlarmModes"]
    if not isinstance(raw, str):
        errors.append(
            {
                "section": section,
                "key": "frigatePersonAlarmModes",
                "message": "须为逗号分隔的布防模式字符串",
            }
        )
        return
    allowed = {"disarmed", "armed_home", "armed_away", "armed_night"}
    if raw.strip() == "none":
        modes: list[str] = []
    else:
        modes = [mode.strip() for mode in raw.split(",") if mode.strip()]
    if any(mode not in allowed for mode in modes):
        errors.append(
            {
                "section": section,
                "key": "frigatePersonAlarmModes",
                "message": "须为 disarmed / armed_home / armed_away / armed_night 的逗号组合，或 none",
            }
        )


def _validate_presence_persons(section: str, patch: dict[str, Any], errors: list[FieldError]) -> None:
    persons = patch["presencePersons"]
    if not isinstance(persons, list):
        errors.append({"section": section, "key": "presencePersons", "message": "须为数组"})
        return
    for index, person_entry in enumerate(persons):
        if not isinstance(person_entry, dict):
            errors.append(
                {
                    "section": section,
                    "key": "presencePersons",
                    "message": f"第 {index + 1} 项须为对象",
                }
            )
            break
        person_name = person_entry.get("name")
        if not isinstance(person_name, str) or not person_name.strip():
            errors.append(
                {
                    "section": section,
                    "key": "presencePersons",
                    "message": f"第 {index + 1} 项 name 须为非空字符串",
                }
            )
            break
        entity_ids = person_entry.get("entityIds")
        if (
            not isinstance(entity_ids, list)
            or len(entity_ids) == 0
            or any(not isinstance(entity_id, str) or not entity_id.strip() for entity_id in entity_ids)
        ):
            errors.append(
                {
                    "section": section,
                    "key": "presencePersons",
                    "message": f"第 {index + 1} 项 entityIds 须为非空字符串数组",
                }
            )
            break


def _validate_away_sim_interval_minmax(
    section: str,
    patch: dict[str, Any],
    errors: list[FieldError],
    context: dict[str, Any] | None,
) -> None:
    interval = patch["awaySimIntervalMinMax"]
    if not isinstance(interval, dict):
        errors.append({"section": section, "key": "awaySimIntervalMinMax", "message": "必须为对象"})
        return
    if "min" in interval:
        num_in(section, "awaySimIntervalMinMax.min", interval["min"], 1, 120, errors)
    if "max" in interval:
        num_in(section, "awaySimIntervalMinMax.max", interval["max"], 1, 180, errors)
    ctx_sec = context.get("security") if isinstance(context, dict) else None
    ctx_interval = ctx_sec.get("awaySimIntervalMinMax") if isinstance(ctx_sec, dict) else None
    ctx_min_max = ctx_interval if isinstance(ctx_interval, dict) else None
    min_bound = interval.get("min") if "min" in interval else (ctx_min_max or {}).get("min")
    max_bound = interval.get("max") if "max" in interval else (ctx_min_max or {}).get("max")
    if min_bound is not None and max_bound is not None:
        try:
            min_num = float(min_bound)
            max_num = float(max_bound)
            if min_num > max_num:
                errors.append(
                    {
                        "section": section,
                        "key": "awaySimIntervalMinMax",
                        "message": "最小间隔须小于或等于最大间隔",
                    }
                )
        except (TypeError, ValueError):  # fmt: skip
            pass


def _validate_alert_channels(section: str, patch: dict[str, Any], errors: list[FieldError]) -> None:
    channels = patch["alertChannels"]
    if not isinstance(channels, list):
        errors.append({"section": section, "key": "alertChannels", "message": "须为数组"})
        return
    #: 与通知投递层的外部通道子集对齐（``socket`` 由 ``in_app`` 派生，不需要单独配置）。
    #: 曾漏掉 ``wecom``：校验层会直接 422 拒绝，导致安防告警无法走企业微信。
    allowed_channels = {"in_app", "email", "webpush", "wecom"}
    for channel in channels:
        if not isinstance(channel, str) or channel not in allowed_channels:
            errors.append(
                {
                    "section": section,
                    "key": "alertChannels",
                    "message": "每项须为 in_app / email / webpush / wecom 之一",
                }
            )
            break


def _validate_security(
    section: str, payload: dict[str, Any], errors: list[FieldError], context: dict[str, Any] | None
) -> None:
    if "sensorAlertCooldownSec" in payload:
        num_in(section, "sensorAlertCooldownSec", payload["sensorAlertCooldownSec"], 0, 86400, errors)
    if "awayConfirmMin" in payload:
        num_in(section, "awayConfirmMin", payload["awayConfirmMin"], 1, 120, errors)
    if "homeConfirmMin" in payload:
        num_in(section, "homeConfirmMin", payload["homeConfirmMin"], 0, 120, errors)
    if "emergencyCooldownSec" in payload:
        num_in(section, "emergencyCooldownSec", payload["emergencyCooldownSec"], 0, 86400, errors)
    _validate_grace_seconds(section, payload, errors)
    if "hazardAutoActions" in payload:
        require_bool(section, "hazardAutoActions", payload["hazardAutoActions"], errors)
    if "configCacheTtlMs" in payload:
        num_in(section, "configCacheTtlMs", payload["configCacheTtlMs"], 1000, 3_600_000, errors)
    if "frigateMaxEvents" in payload:
        num_in(section, "frigateMaxEvents", payload["frigateMaxEvents"], 1, 500, errors)
    if "frigateDedupMs" in payload:
        num_in(section, "frigateDedupMs", payload["frigateDedupMs"], 1000, 600_000, errors)
    if "frigatePersonAlarmModes" in payload:
        _validate_frigate_person_alarm_modes(section, payload, errors)
    if "awaySimBrightnessMin" in payload:
        num_in(section, "awaySimBrightnessMin", payload["awaySimBrightnessMin"], 1, 100, errors)
    if "awaySimBrightnessRange" in payload:
        num_in(section, "awaySimBrightnessRange", payload["awaySimBrightnessRange"], 0, 100, errors)
    if "presencePersons" in payload:
        _validate_presence_persons(section, payload, errors)
    for k in (
        "requireConfiguredPersons",
        "mmWaveFusePresence",
        "autoArmOnEveryoneLeft",
        "autoUpgradeToAwayOnEveryoneLeft",
        "calendarArmOnAway",
        "calendarUpgradeToAway",
        "presenceRequireAllAway",
        "autoDisarmOnFirstHome",
        "linkAwaySimOnArmAway",
        "linkHomeModeOnSecurityChange",
    ):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if payload.get("awaySimIntervalMinMax") is not None and "awaySimIntervalMinMax" in payload:
        _validate_away_sim_interval_minmax(section, payload, errors, context)
    if "alertChannels" in payload:
        _validate_alert_channels(section, payload, errors)
    if "alertBypassDnd" in payload:
        require_bool(section, "alertBypassDnd", payload["alertBypassDnd"], errors)


def _validate_grace_seconds(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    """撤离宽限与进入延时：都是 0–600 秒，抽出来避免给 ``_validate_security`` 再添分支。"""
    for key in ("armExitGraceSeconds", "entryDelaySeconds"):
        if key in payload:
            num_in(section, key, payload[key], 0, 600, errors)


def _validate_water(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "anomalyCooldownMin" in payload:
        num_in(section, "anomalyCooldownMin", payload["anomalyCooldownMin"], 1, 1440, errors)
    for key in ("mainValveEntityId", "meterEntityId", "flowEntityId"):
        if key in payload:
            validate_optional_entity_id(section, key, payload[key], errors)
    if "longFlowMinutes" in payload:
        num_in(section, "longFlowMinutes", payload["longFlowMinutes"], 1, 720, errors)
    if "longFlowRateLpm" in payload:
        num_in(section, "longFlowRateLpm", payload["longFlowRateLpm"], 0.05, 100, errors)
    if "dailyAnomalyRatio" in payload:
        num_in(section, "dailyAnomalyRatio", payload["dailyAnomalyRatio"], 1.2, 20, errors)
    if "usageLearningDays" in payload:
        num_in(section, "usageLearningDays", payload["usageLearningDays"], 3, 30, errors)


def _validate_iaq(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "moldAlertCooldownMin" in payload:
        num_in(section, "moldAlertCooldownMin", payload["moldAlertCooldownMin"], 1, 1440, errors)
    if "moldHumidityThreshold" in payload:
        num_in(section, "moldHumidityThreshold", payload["moldHumidityThreshold"], 30, 95, errors)
    if "moldHoldMinutes" in payload:
        num_in(section, "moldHoldMinutes", payload["moldHoldMinutes"], 5, 1440, errors)
    if "pm25Threshold" in payload:
        num_in(section, "pm25Threshold", payload["pm25Threshold"], 1, 1000, errors)
    if "co2Threshold" in payload:
        num_in(section, "co2Threshold", payload["co2Threshold"], 400, 10000, errors)


def _validate_circadian(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "weatherEntityId" in payload:
        validate_optional_entity_id(section, "weatherEntityId", payload["weatherEntityId"], errors)
    if "enabled" in payload:
        require_bool(section, "enabled", payload["enabled"], errors)
    if "applyBrightness" in payload:
        require_bool(section, "applyBrightness", payload["applyBrightness"], errors)
    if "lightEntityIds" in payload:
        from .core import validate_entity_id_list

        validate_entity_id_list(section, "lightEntityIds", payload["lightEntityIds"], errors)
    if "dayKelvin" in payload:
        num_in(section, "dayKelvin", payload["dayKelvin"], 2000, 10000, errors)
    if "nightKelvin" in payload:
        num_in(section, "nightKelvin", payload["nightKelvin"], 1800, 6500, errors)
    if "nightBrightnessPct" in payload:
        num_in(section, "nightBrightnessPct", payload["nightBrightnessPct"], 1, 100, errors)
