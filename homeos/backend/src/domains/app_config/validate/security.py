"""安全与民生分区校验：auth / notification / security / water / iaq / circadian。"""

from __future__ import annotations

from typing import Any

from .core import (
    FieldError,
    num_in,
    require_bool,
    validate_optional_entity_id,
)


def _validate_auth(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "lockoutMaxAttempts" in p:
        num_in(section, "lockoutMaxAttempts", p["lockoutMaxAttempts"], 3, 20, e)
    if "lockoutMinutes" in p:
        num_in(section, "lockoutMinutes", p["lockoutMinutes"], 1, 1440, e)
    if "sessionExpireDays" in p:
        num_in(section, "sessionExpireDays", p["sessionExpireDays"], 1, 365, e)
    if "newDeviceAlertCooldownMin" in p:
        num_in(section, "newDeviceAlertCooldownMin", p["newDeviceAlertCooldownMin"], 10, 10080, e)
    for k in ("loginAlertEnabled", "newDeviceAlertEnabled", "bruteForceAlertEnabled"):
        if k in p:
            require_bool(section, k, p[k], e)

def _validate_notification(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    for k in ("dndStart", "dndEnd"):
        if k in p:
            num_in(section, k, p[k], 0, 23, e)
    if "maxNotifications" in p:
        num_in(section, "maxNotifications", p["maxNotifications"], 1, 10000, e)
    if "offlineCooldownMin" in p:
        num_in(section, "offlineCooldownMin", p["offlineCooldownMin"], 1, 1440, e)
    if "lowBatteryCooldownMin" in p:
        num_in(section, "lowBatteryCooldownMin", p["lowBatteryCooldownMin"], 1, 1440, e)
    for k in (
        "globalNotifyEnabled",
        "importantNotifyEnabled",
        "offlineNotifyEnabled",
        "lowBatteryNotifyEnabled",
    ):
        if k in p:
            require_bool(section, k, p[k], e)

def _validate_frigate_person_alarm_modes(
    section: str, patch: dict[str, Any], errors: list[FieldError]
) -> None:
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


def _validate_presence_persons(
    section: str, patch: dict[str, Any], errors: list[FieldError]
) -> None:
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
        except (TypeError, ValueError):
            pass


def _validate_alert_channels(
    section: str, patch: dict[str, Any], errors: list[FieldError]
) -> None:
    channels = patch["alertChannels"]
    if not isinstance(channels, list):
        errors.append({"section": section, "key": "alertChannels", "message": "须为数组"})
        return
    allowed_channels = {"in_app", "email", "webpush"}
    for channel in channels:
        if not isinstance(channel, str) or channel not in allowed_channels:
            errors.append(
                {
                    "section": section,
                    "key": "alertChannels",
                    "message": "每项须为 in_app / email / webpush 之一",
                }
            )
            break


def _validate_security(
    section: str, p: dict[str, Any], e: list[FieldError], context: dict[str, Any] | None
) -> None:
    if "sensorAlertCooldownSec" in p:
        num_in(section, "sensorAlertCooldownSec", p["sensorAlertCooldownSec"], 0, 86400, e)
    if "awayConfirmMin" in p:
        num_in(section, "awayConfirmMin", p["awayConfirmMin"], 1, 120, e)
    if "homeConfirmMin" in p:
        num_in(section, "homeConfirmMin", p["homeConfirmMin"], 0, 120, e)
    if "emergencyCooldownSec" in p:
        num_in(section, "emergencyCooldownSec", p["emergencyCooldownSec"], 0, 86400, e)
    if "armExitGraceSeconds" in p:
        num_in(section, "armExitGraceSeconds", p["armExitGraceSeconds"], 0, 600, e)
    if "configCacheTtlMs" in p:
        num_in(section, "configCacheTtlMs", p["configCacheTtlMs"], 1000, 3_600_000, e)
    if "frigateMaxEvents" in p:
        num_in(section, "frigateMaxEvents", p["frigateMaxEvents"], 1, 500, e)
    if "frigateDedupMs" in p:
        num_in(section, "frigateDedupMs", p["frigateDedupMs"], 1000, 600_000, e)
    if "frigatePersonAlarmModes" in p:
        _validate_frigate_person_alarm_modes(section, p, e)
    if "awaySimBrightnessMin" in p:
        num_in(section, "awaySimBrightnessMin", p["awaySimBrightnessMin"], 1, 100, e)
    if "awaySimBrightnessRange" in p:
        num_in(section, "awaySimBrightnessRange", p["awaySimBrightnessRange"], 0, 100, e)
    if "presencePersons" in p:
        _validate_presence_persons(section, p, e)
    for k in (
        "requireConfiguredPersons",
        "mmWaveFusePresence",
        "autoArmOnEveryoneLeft",
        "autoUpgradeToAwayOnEveryoneLeft",
        "calendarArmOnAway",
        "autoDisarmOnFirstHome",
        "linkAwaySimOnArmAway",
        "linkHomeModeOnSecurityChange",
    ):
        if k in p:
            require_bool(section, k, p[k], e)
    if p.get("awaySimIntervalMinMax") is not None and "awaySimIntervalMinMax" in p:
        _validate_away_sim_interval_minmax(section, p, e, context)
    if "alertChannels" in p:
        _validate_alert_channels(section, p, e)
    if "alertBypassDnd" in p:
        require_bool(section, "alertBypassDnd", p["alertBypassDnd"], e)

def _validate_water(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "anomalyCooldownMin" in p:
        num_in(section, "anomalyCooldownMin", p["anomalyCooldownMin"], 1, 1440, e)
    if "mainValveEntityId" in p:
        validate_optional_entity_id(section, "mainValveEntityId", p["mainValveEntityId"], e)

def _validate_iaq(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "moldAlertCooldownMin" in p:
        num_in(section, "moldAlertCooldownMin", p["moldAlertCooldownMin"], 1, 1440, e)

def _validate_circadian(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "weatherEntityId" in p:
        validate_optional_entity_id(section, "weatherEntityId", p["weatherEntityId"], e)
