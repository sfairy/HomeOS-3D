"""应用配置分区校验（对齐 ``backend/src/shared/app-config/validate/*``）。

校验函数按分区收集 ``AppConfigFieldError``（``section`` / ``key`` / ``message``），
最终由 :class:`AppConfigValidationError` 汇总抛出（BadRequest 语义）。

- :func:`validate_app_config_section`：按分区名分发到对应校验函数；
- :func:`validate_app_config_partial`：PUT 局部更新校验入口；
- :func:`validate_app_config_full`：import replace 全量校验入口。
"""

from __future__ import annotations

import copy
import re
from typing import Any

from ...core.errors import ConfigValidationError, bad_request
from ...core.zoned_time import normalize_home_mode_time_at
from .constants import PUBLIC_CONFIG_SECTIONS  # noqa: F401 - re-export 便利

FieldError = dict[str, str]

__all__ = [
    "AppConfigValidationError",
    "FieldError",
    "num_in",
    "require_bool",
    "is_entity_id",
    "validate_optional_entity_id",
    "validate_entity_id_list",
    "validate_voice_commands_array",
    "validate_app_config_section",
    "validate_app_config_partial",
    "validate_app_config_full",
    "validate_app_config_replace_import",
    "normalize_pricing_patch",
    "clock_ranges_overlap",
]


class AppConfigValidationError(ConfigValidationError):
    """配置字段校验异常：携带字段级错误数组，序列化为 400 响应体。

    对齐 Nest ``AppConfigValidationError extends BadRequestException``：消息为
    ``section.key: message`` 的分号拼接摘要，响应 ``error`` 为类名。
    """

    def __init__(self, field_errors: list[FieldError]) -> None:
        self.field_errors = field_errors
        summary = "; ".join(
            f"{e.get('section', '')}.{e.get('key', '')}: {e.get('message', '')}"
            for e in field_errors
        )
        super().__init__(summary)
        self.message = summary


# --------------------------------------------------------------------------- #
# 原子校验工具（primitives.util.ts）
# --------------------------------------------------------------------------- #
_ENTITY_ID_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$", re.IGNORECASE)


def num_in(
    section: str,
    key: str,
    val: Any,
    min_val: float,
    max_val: float | None,
    errors: list[FieldError],
) -> float | None:
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        errors.append({"section": section, "key": key, "message": "必须为数字"})
        return None
    value = float(val)
    if value != value or value in (float("inf"), float("-inf")):
        errors.append({"section": section, "key": key, "message": "必须为数字"})
        return None
    if value < min_val or (max_val is not None and value > max_val):
        message = f"须在 {_fmt(min_val)}–{_fmt(max_val)} 之间" if max_val is not None else f"须 ≥ {_fmt(min_val)}"
        errors.append({"section": section, "key": key, "message": message})
        return None
    return value


def _fmt(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else str(n)


def require_bool(section: str, key: str, val: Any, errors: list[FieldError]) -> bool | None:
    if not isinstance(val, bool):
        errors.append({"section": section, "key": key, "message": "必须为布尔值"})
        return None
    return val


def is_entity_id(val: Any) -> bool:
    return isinstance(val, str) and bool(_ENTITY_ID_RE.match(val.strip()))


def validate_optional_entity_id(
    section: str, key: str, val: Any, errors: list[FieldError]
) -> None:
    if val is None or val == "":
        return
    if not is_entity_id(val):
        errors.append({"section": section, "key": key, "message": "须为有效 entity_id 或留空"})


def validate_entity_id_list(
    section: str, key: str, val: Any, errors: list[FieldError]
) -> None:
    if not isinstance(val, list):
        errors.append({"section": section, "key": key, "message": "须为字符串数组"})
        return
    for item in val:
        if not isinstance(item, str) or not item.strip() or not is_entity_id(item):
            errors.append({"section": section, "key": key, "message": "每项须为有效 entity_id"})
            break


# --------------------------------------------------------------------------- #
# 分时电价窗口校验（@homeos/shared energy/tou-windows.util.ts）
# --------------------------------------------------------------------------- #
def _clock_to_minutes(raw: str) -> int | None:
    normalized = normalize_home_mode_time_at(raw)
    if not normalized:
        return None
    hour, minute = (int(x) for x in normalized.split(":"))
    return hour * 60 + minute


def _range_to_segments(start_min: int, end_min: int) -> list[tuple[int, int]]:
    if start_min == end_min:
        return []
    if end_min > start_min:
        return [(start_min, end_min)]
    return [(start_min, 1440), (0, end_min)]


def _segments_overlap(a: list[tuple[int, int]], b: list[tuple[int, int]]) -> bool:
    for a0, a1 in a:
        for b0, b1 in b:
            if a0 < b1 and b0 < a1:
                return True
    return False


def clock_ranges_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    a0 = _clock_to_minutes(a_start)
    a1 = _clock_to_minutes(a_end)
    b0 = _clock_to_minutes(b_start)
    b1 = _clock_to_minutes(b_end)
    if a0 is None or a1 is None or b0 is None or b1 is None:
        return False
    return _segments_overlap(_range_to_segments(a0, a1), _range_to_segments(b0, b1))


def validate_tou_windows(input_: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    windows = [
        (input_.get("peakStart1"), input_.get("peakEnd1"), "峰段1"),
        (input_.get("peakStart2"), input_.get("peakEnd2"), "峰段2"),
        (input_.get("valleyStart"), input_.get("valleyEnd"), "谷段"),
    ]
    parsed: list[tuple[str, str, str]] = []
    for start_raw, end_raw, label in windows:
        start_s = str(start_raw or "").strip()
        end_s = str(end_raw or "").strip()
        if not start_s and not end_s:
            continue
        ns = normalize_home_mode_time_at(start_s)
        ne = normalize_home_mode_time_at(end_s)
        if not ns or not ne:
            errors.append(f"{label}须为 HH:MM（如 08:00）")
            continue
        if ns == ne:
            errors.append(f"{label}起止不能相同")
            continue
        parsed.append((label, ns, ne))
    for i in range(len(parsed)):
        for j in range(i + 1, len(parsed)):
            if clock_ranges_overlap(parsed[i][1], parsed[i][2], parsed[j][1], parsed[j][2]):
                errors.append(f"{parsed[i][0]}与{parsed[j][0]}时段重叠")
    return errors


# --------------------------------------------------------------------------- #
# 分区校验函数
# --------------------------------------------------------------------------- #
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


def _validate_security(
    section: str, p: dict[str, Any], e: list[FieldError], context: dict[str, Any] | None
) -> None:
    if "sensorAlertCooldownSec" in p:
        num_in(section, "sensorAlertCooldownSec", p["sensorAlertCooldownSec"], 0, 86400, e)
    if "awayConfirmMin" in p:
        num_in(section, "awayConfirmMin", p["awayConfirmMin"], 1, 120, e)
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
        raw = p["frigatePersonAlarmModes"]
        if not isinstance(raw, str):
            e.append(
                {
                    "section": section,
                    "key": "frigatePersonAlarmModes",
                    "message": "须为逗号分隔的布防模式字符串",
                }
            )
        else:
            allowed = {"disarmed", "armed_home", "armed_away", "armed_night"}
            if raw.strip() == "none":
                modes: list[str] = []
            else:
                modes = [s.strip() for s in raw.split(",") if s.strip()]
            if any(m not in allowed for m in modes):
                e.append(
                    {
                        "section": section,
                        "key": "frigatePersonAlarmModes",
                        "message": "须为 disarmed / armed_home / armed_away / armed_night 的逗号组合，或 none",
                    }
                )
    if "awaySimBrightnessMin" in p:
        num_in(section, "awaySimBrightnessMin", p["awaySimBrightnessMin"], 1, 100, e)
    if "awaySimBrightnessRange" in p:
        num_in(section, "awaySimBrightnessRange", p["awaySimBrightnessRange"], 0, 100, e)
    if "presencePersons" in p:
        persons = p["presencePersons"]
        if not isinstance(persons, list):
            e.append({"section": section, "key": "presencePersons", "message": "须为数组"})
        else:
            for i, item in enumerate(persons):
                if not isinstance(item, dict):
                    e.append(
                        {"section": section, "key": "presencePersons", "message": f"第 {i + 1} 项须为对象"}
                    )
                    break
                name = item.get("name")
                if not isinstance(name, str) or not name.strip():
                    e.append(
                        {
                            "section": section,
                            "key": "presencePersons",
                            "message": f"第 {i + 1} 项 name 须为非空字符串",
                        }
                    )
                    break
                ids = item.get("entityIds")
                if (
                    not isinstance(ids, list)
                    or len(ids) == 0
                    or any(not isinstance(x, str) or not x.strip() for x in ids)
                ):
                    e.append(
                        {
                            "section": section,
                            "key": "presencePersons",
                            "message": f"第 {i + 1} 项 entityIds 须为非空字符串数组",
                        }
                    )
                    break
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
        iv = p["awaySimIntervalMinMax"]
        if not isinstance(iv, dict):
            e.append({"section": section, "key": "awaySimIntervalMinMax", "message": "必须为对象"})
        else:
            if "min" in iv:
                num_in(section, "awaySimIntervalMinMax.min", iv["min"], 1, 120, e)
            if "max" in iv:
                num_in(section, "awaySimIntervalMinMax.max", iv["max"], 1, 180, e)
            ctx_sec = context.get("security") if isinstance(context, dict) else None
            ctx_iv = ctx_sec.get("awaySimIntervalMinMax") if isinstance(ctx_sec, dict) else None
            ctx_min_max = ctx_iv if isinstance(ctx_iv, dict) else None
            min_v = iv.get("min") if "min" in iv else (ctx_min_max or {}).get("min")
            max_v = iv.get("max") if "max" in iv else (ctx_min_max or {}).get("max")
            if min_v is not None and max_v is not None:
                try:
                    min_num = float(min_v)
                    max_num = float(max_v)
                    if min_num > max_num:
                        e.append(
                            {
                                "section": section,
                                "key": "awaySimIntervalMinMax",
                                "message": "最小间隔须小于或等于最大间隔",
                            }
                        )
                except (TypeError, ValueError):
                    pass
    if "alertChannels" in p:
        channels = p["alertChannels"]
        if not isinstance(channels, list):
            e.append({"section": section, "key": "alertChannels", "message": "须为数组"})
        else:
            allowed_channels = {"in_app", "email", "webpush"}
            for item in channels:
                if not isinstance(item, str) or item not in allowed_channels:
                    e.append(
                        {
                            "section": section,
                            "key": "alertChannels",
                            "message": "每项须为 in_app / email / webpush 之一",
                        }
                    )
                    break
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


def _validate_energy(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "learningPeriodDays" in p:
        num_in(section, "learningPeriodDays", p["learningPeriodDays"], 0, 90, e)
    if "budgetAlertCooldownMin" in p:
        num_in(section, "budgetAlertCooldownMin", p["budgetAlertCooldownMin"], 30, 10080, e)
    if "anomalyCooldownMin" in p:
        num_in(section, "anomalyCooldownMin", p["anomalyCooldownMin"], 1, 1440, e)
    if "meterEntityId" in p:
        validate_optional_entity_id(section, "meterEntityId", p["meterEntityId"], e)
    if "circuitEntityIds" in p:
        validate_entity_id_list(section, "circuitEntityIds", p["circuitEntityIds"], e)


_CLOCK_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def _validate_clock_time(section: str, key: str, val: Any, e: list[FieldError]) -> None:
    if not isinstance(val, str):
        e.append({"section": section, "key": key, "message": "须为 HH:MM 时刻字符串"})
        return
    m = _CLOCK_RE.match(val.strip())
    if not m:
        e.append({"section": section, "key": key, "message": "格式须为 HH:MM（如 08:00）"})
        return
    hour = int(m.group(1))
    minute = int(m.group(2))
    if hour > 23 or minute > 59:
        e.append({"section": section, "key": key, "message": "小时须 0–23，分钟须 0–59"})


def _is_fixed_pricing_mode(p: dict[str, Any], context: dict[str, Any] | None) -> bool:
    mode = p.get("pricingMode")
    if mode is None and isinstance(context, dict):
        ctx_pricing = context.get("pricing")
        if isinstance(ctx_pricing, dict):
            mode = ctx_pricing.get("pricingMode")
    return mode == "fixed"


def _validate_pricing(
    section: str, p: dict[str, Any], e: list[FieldError], context: dict[str, Any] | None
) -> None:
    for key in ("peakStart1", "peakEnd1", "peakStart2", "peakEnd2", "valleyStart", "valleyEnd"):
        if key in p:
            _validate_clock_time(section, key, p[key], e)
    if "timeOfUseEnabled" in p and not isinstance(p["timeOfUseEnabled"], bool):
        e.append({"section": section, "key": "timeOfUseEnabled", "message": "须为布尔值"})
    if "pricingMode" in p:
        mode = p["pricingMode"]
        if mode not in ("tiered", "fixed"):
            e.append({"section": section, "key": "pricingMode", "message": "须为 tiered 或 fixed"})
    if "fixedPrice" in p:
        num_in(section, "fixedPrice", p["fixedPrice"], 0, 10, e)
    if "regionLabel" in p and p["regionLabel"] is not None and not isinstance(p["regionLabel"], str):
        e.append({"section": section, "key": "regionLabel", "message": "须为字符串"})
    fixed_mode = _is_fixed_pricing_mode(p, context)

    def merged_value(key: str) -> Any:
        if key in p:
            return p[key]
        if isinstance(context, dict):
            ctx_pricing = context.get("pricing")
            if isinstance(ctx_pricing, dict):
                return ctx_pricing.get(key)
        return None

    if fixed_mode and "fixedPrice" in p:
        try:
            if float(p["fixedPrice"]) <= 0:
                e.append({"section": section, "key": "fixedPrice", "message": "固定单价须大于 0"})
        except (TypeError, ValueError):
            pass
    if "tier1Kwh" in p:
        num_in(section, "tier1Kwh", p["tier1Kwh"], 0, 100_000, e)
    if "tier1Price" in p:
        num_in(section, "tier1Price", p["tier1Price"], 0, 10, e)
    if "tier2Price" in p:
        num_in(section, "tier2Price", p["tier2Price"], 0, 10, e)
    if "tier3Price" in p:
        num_in(section, "tier3Price", p["tier3Price"], 0, 10, e)
    for key in ("peakPrice", "valleyPrice", "flatPrice"):
        if key in p:
            num_in(section, key, p[key], 0, 10, e)
    tou_enabled = merged_value("timeOfUseEnabled") is not False
    tou_keys = (
        "peakStart1",
        "peakEnd1",
        "peakStart2",
        "peakEnd2",
        "valleyStart",
        "valleyEnd",
        "timeOfUseEnabled",
    )
    if tou_enabled and any(k in p for k in tou_keys):
        for message in validate_tou_windows(
            {
                "peakStart1": str(merged_value("peakStart1") or ""),
                "peakEnd1": str(merged_value("peakEnd1") or ""),
                "peakStart2": str(merged_value("peakStart2") or ""),
                "peakEnd2": str(merged_value("peakEnd2") or ""),
                "valleyStart": str(merged_value("valleyStart") or ""),
                "valleyEnd": str(merged_value("valleyEnd") or ""),
            }
        ):
            e.append({"section": section, "key": "peakStart1", "message": message})


def normalize_pricing_patch(partial: dict[str, Any]) -> dict[str, Any]:
    """切换为 fixed 且本次未指定分时时，默认关闭峰谷平。"""
    if (
        partial.get("pricingMode") == "fixed"
        and "pricingMode" in partial
        and "timeOfUseEnabled" not in partial
    ):
        return {**partial, "timeOfUseEnabled": False}
    return partial


def _validate_frontend(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "apiTimeoutMs" in p:
        num_in(section, "apiTimeoutMs", p["apiTimeoutMs"], 1000, 120000, e)
    if "apiRetryMax" in p:
        num_in(section, "apiRetryMax", p["apiRetryMax"], 0, 10, e)
    if "apiRetryDelayMs" in p:
        num_in(section, "apiRetryDelayMs", p["apiRetryDelayMs"], 100, 30_000, e)
    if "haDisconnectDebounceMs" in p:
        num_in(section, "haDisconnectDebounceMs", p["haDisconnectDebounceMs"], 0, 60_000, e)
    if "initialStatesWaitMs" in p:
        num_in(section, "initialStatesWaitMs", p["initialStatesWaitMs"], 1000, 300_000, e)
    if "entityCacheEnabled" in p:
        require_bool(section, "entityCacheEnabled", p["entityCacheEnabled"], e)
    if "entityCacheMaxAgeMs" in p:
        num_in(section, "entityCacheMaxAgeMs", p["entityCacheMaxAgeMs"], 60_000, 7 * 86400_000, e)
    if "entityCacheSaveDebounceMs" in p:
        num_in(
            section,
            "entityCacheSaveDebounceMs",
            p["entityCacheSaveDebounceMs"],
            1000,
            120_000,
            e,
        )
    if "rebuildChunkSize" in p:
        num_in(section, "rebuildChunkSize", p["rebuildChunkSize"], 50, 5000, e)
    if "largeEntityThreshold" in p:
        num_in(section, "largeEntityThreshold", p["largeEntityThreshold"], 100, 50000, e)
    if "workerDerivedThreshold" in p:
        num_in(section, "workerDerivedThreshold", p["workerDerivedThreshold"], 500, 100000, e)
    if "rebuildDebounceMs" in p:
        num_in(section, "rebuildDebounceMs", p["rebuildDebounceMs"], 10, 2000, e)
    if "maxListeners" in p:
        num_in(section, "maxListeners", p["maxListeners"], 10, 500, e)
    if "callDedupWindowMs" in p:
        num_in(section, "callDedupWindowMs", p["callDedupWindowMs"], 0, 10_000, e)
    if "maxRemoteNotifications" in p:
        num_in(section, "maxRemoteNotifications", p["maxRemoteNotifications"], 1, 1000, e)
    if "sessionRefreshHours" in p:
        num_in(section, "sessionRefreshHours", p["sessionRefreshHours"], 1, 168, e)
    if "optimisticTtlMs" in p:
        num_in(section, "optimisticTtlMs", p["optimisticTtlMs"], 500, 30_000, e)
    if "initStatesBatchSize" in p:
        num_in(section, "initStatesBatchSize", p["initStatesBatchSize"], 10, 5000, e)
    if p.get("widgetPollIntervals") is not None and "widgetPollIntervals" in p:
        wpi = p["widgetPollIntervals"]
        if not isinstance(wpi, dict):
            e.append({"section": section, "key": "widgetPollIntervals", "message": "必须为对象"})
        else:
            for wk, wv in wpi.items():
                num_in(section, f"widgetPollIntervals.{wk}", wv, 1000, 600000, e)


def _validate_ui(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "scaleBaseWidth" in p:
        num_in(section, "scaleBaseWidth", p["scaleBaseWidth"], 800, 7680, e)
    if "scaleBaseHeight" in p:
        num_in(section, "scaleBaseHeight", p["scaleBaseHeight"], 600, 4320, e)
    if "accentColor" in p:
        val = p["accentColor"]
        if not isinstance(val, str) or not re.match(r"^#[0-9a-fA-F]{6}$", val.strip()):
            e.append(
                {"section": section, "key": "accentColor", "message": "须为 #RRGGBB 格式十六进制颜色"}
            )


_SCREENSAVER_MODES = {"clock", "weather", "random"}


def _validate_screensaver(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "screensaverEnabled" in p:
        require_bool(section, "screensaverEnabled", p["screensaverEnabled"], e)
    if "screensaverIdleMs" in p:
        num_in(section, "screensaverIdleMs", p["screensaverIdleMs"], 10_000, 3_600_000, e)
    if "scale" in p:
        num_in(section, "scale", p["scale"], 0.5, 5, e)
    if "defaultMode" in p:
        mode = p["defaultMode"]
        if not isinstance(mode, str) or mode.strip() not in _SCREENSAVER_MODES:
            e.append({"section": section, "key": "defaultMode", "message": "须为 clock / weather / random"})
    for k in (
        "enableWeatherMode",
        "instantEnter",
        "instantLeave",
        "showBrand",
        "showSeconds",
        "showGregorianDate",
        "showLunar",
        "showWeatherIcon",
        "showWeatherDesc",
        "showWeatherStats",
        "showWeatherMeta",
    ):
        if k in p:
            require_bool(section, k, p[k], e)
    if "brightness" in p:
        num_in(section, "brightness", p["brightness"], 0.3, 1, e)
    if "timeSizeVw" in p:
        num_in(section, "timeSizeVw", p["timeSizeVw"], 4, 60, e)
    if "sepSizeVw" in p:
        num_in(section, "sepSizeVw", p["sepSizeVw"], 1, 40, e)
    if "secSizeVw" in p:
        num_in(section, "secSizeVw", p["secSizeVw"], 2, 30, e)
    if "metaSizeVw" in p:
        num_in(section, "metaSizeVw", p["metaSizeVw"], 1, 20, e)
    if "subMetaSizeVw" in p:
        num_in(section, "subMetaSizeVw", p["subMetaSizeVw"], 1, 20, e)
    if "brandSizePx" in p:
        num_in(section, "brandSizePx", p["brandSizePx"], 8, 120, e)
    if "brandTopVh" in p:
        num_in(section, "brandTopVh", p["brandTopVh"], 0, 50, e)
    if "contentShiftVh" in p:
        num_in(section, "contentShiftVh", p["contentShiftVh"], -30, 30, e)
    if "weatherTempSizeVw" in p:
        num_in(section, "weatherTempSizeVw", p["weatherTempSizeVw"], 4, 60, e)
    if "weatherIconSizeVw" in p:
        num_in(section, "weatherIconSizeVw", p["weatherIconSizeVw"], 2, 40, e)
    if "weatherStatsSizePx" in p:
        num_in(section, "weatherStatsSizePx", p["weatherStatsSizePx"], 8, 48, e)


_SCENE_FIELD_RANGES: dict[str, tuple[float, float]] = {
    "lightningMinMs": (800, 8000),
    "lightningMaxMs": (3000, 20000),
    "fogLayers": (1, 6),
    "rainRatio": (0, 1),
    "snowRatio": (0, 1),
    "puddle": (0, 1),
}
_DEFAULT_SCENE_RANGE = (0, 2)


def _scene_num(section: str, prefix: str, key: str, val: Any, e: list[FieldError]) -> None:
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        e.append({"section": section, "key": f"{prefix}.{key}", "message": "必须为数字"})
        return
    lo, hi = _SCENE_FIELD_RANGES.get(key, _DEFAULT_SCENE_RANGE)
    num_in(section, f"{prefix}.{key}", val, lo, hi, e)


def _validate_weather_effects(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    for k in ("enabled", "useEntityAttributes"):
        if k in p:
            require_bool(section, k, p[k], e)
    if "densityMultiplier" in p:
        num_in(section, "densityMultiplier", p["densityMultiplier"], 0.3, 2, e)
    if "windMultiplier" in p:
        num_in(section, "windMultiplier", p["windMultiplier"], 0, 3, e)
    if "attributeBlend" in p:
        num_in(section, "attributeBlend", p["attributeBlend"], 0, 1, e)
    if "starCount" in p:
        num_in(section, "starCount", p["starCount"], 50, 800, e)
    if "cloudLayers" in p:
        num_in(section, "cloudLayers", p["cloudLayers"], 2, 12, e)
    if "shootingStarRate" in p:
        num_in(section, "shootingStarRate", p["shootingStarRate"], 0, 0.01, e)
    if "displayRoutes" in p:
        routes = p["displayRoutes"]
        if not isinstance(routes, list):
            e.append({"section": section, "key": "displayRoutes", "message": "displayRoutes 必须为字符串数组"})
        else:
            for i, r in enumerate(routes):
                if not isinstance(r, str) or not r.strip():
                    e.append({"section": section, "key": f"displayRoutes[{i}]", "message": "路由标识不能为空"})
    scenes = p.get("scenes")
    if isinstance(scenes, dict):
        for scene_key, scene_val in scenes.items():
            if not isinstance(scene_val, dict):
                continue
            for field, val in scene_val.items():
                _scene_num(section, f"scenes.{scene_key}", field, val, e)


def validate_voice_commands_array(commands: Any, errors: list[FieldError] | None = None) -> list[FieldError]:
    errors = errors if errors is not None else []
    if not isinstance(commands, list):
        errors.append({"section": "voiceCommands", "key": "*", "message": "须为数组"})
        return errors
    domain_re = re.compile(r"^[a-z_][a-z0-9_]*$", re.IGNORECASE)
    for index, cmd in enumerate(commands):
        prefix = f"[{index}]"
        if not isinstance(cmd, dict):
            errors.append({"section": "voiceCommands", "key": prefix, "message": "须为对象"})
            continue
        phrases = cmd.get("phrases")
        if not isinstance(phrases, list):
            errors.append({"section": "voiceCommands", "key": f"{prefix}.phrases", "message": "须为字符串数组"})
        elif len(phrases) == 0:
            errors.append({"section": "voiceCommands", "key": f"{prefix}.phrases", "message": "至少一条短语"})
        else:
            for pi, phrase in enumerate(phrases):
                if not isinstance(phrase, str) or not phrase.strip():
                    errors.append(
                        {"section": "voiceCommands", "key": f"{prefix}.phrases[{pi}]", "message": "须为非空字符串"}
                    )
        domain = cmd["domain"].strip() if isinstance(cmd.get("domain"), str) else ""
        if not domain or not domain_re.match(domain):
            errors.append({"section": "voiceCommands", "key": f"{prefix}.domain", "message": "须为有效 HA domain"})
        service = cmd["service"].strip() if isinstance(cmd.get("service"), str) else ""
        if not service or not domain_re.match(service):
            errors.append({"section": "voiceCommands", "key": f"{prefix}.service", "message": "须为有效 HA service"})
        if cmd.get("entityMatch") not in (None, "") and "entityMatch" in cmd:
            if not isinstance(cmd["entityMatch"], str):
                errors.append({"section": "voiceCommands", "key": f"{prefix}.entityMatch", "message": "须为字符串"})
        if cmd.get("serviceData") is not None and "serviceData" in cmd:
            if not isinstance(cmd["serviceData"], dict):
                errors.append({"section": "voiceCommands", "key": f"{prefix}.serviceData", "message": "须为对象"})
    return errors


def _validate_voice(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "sttMode" in p and p["sttMode"] not in ("browser", "ha", "auto"):
        e.append({"section": section, "key": "sttMode", "message": "须为 browser | ha | auto"})
    if "ttsOutputMode" in p and p["ttsOutputMode"] not in ("local", "ha", "auto"):
        e.append({"section": section, "key": "ttsOutputMode", "message": "须为 local | ha | auto"})
    if "dailyAdvisorSpeakHour" in p:
        num_in(section, "dailyAdvisorSpeakHour", p["dailyAdvisorSpeakHour"], 0, 23, e)
    for k in ("ttsEnabled", "continuousConversation", "agentFallback"):
        if k in p and not isinstance(p[k], bool):
            e.append({"section": section, "key": k, "message": "须为布尔值"})
    if "sttEntityId" in p:
        validate_optional_entity_id(section, "sttEntityId", p["sttEntityId"], e)
    if "wakeWords" in p:
        ww = p["wakeWords"]
        if not isinstance(ww, list):
            e.append({"section": section, "key": "wakeWords", "message": "必须为字符串数组"})
        else:
            for i, w in enumerate(ww):
                if not isinstance(w, str) or not w.strip():
                    e.append({"section": section, "key": f"wakeWords[{i}]", "message": "唤醒词不能为空"})


def _validate_media_playlists(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    for player_id, val in p.items():
        if not is_entity_id(player_id):
            e.append({"section": section, "key": player_id, "message": "播放器键须为合法 entity_id"})
            break
        if not isinstance(val, dict):
            e.append({"section": section, "key": player_id, "message": "须为 { items, index } 对象"})
            break
        if not isinstance(val.get("items"), list):
            e.append({"section": section, "key": player_id, "message": "items 须为数组"})
            break
        if "index" in val:
            num_in(section, f"{player_id}.index", val["index"], 0, 10_000, e)


def _validate_home_mode(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "applyMaxRetries" in p:
        num_in(section, "applyMaxRetries", p["applyMaxRetries"], 0, 10, e)
    if "triggerCooldownMs" in p:
        num_in(section, "triggerCooldownMs", p["triggerCooldownMs"], 0, 600_000, e)
    if "maxTriggerLogs" in p:
        num_in(section, "maxTriggerLogs", p["maxTriggerLogs"], 1, 500, e)
    if "maxExecHistory" in p:
        num_in(section, "maxExecHistory", p["maxExecHistory"], 1, 500, e)
    for k in ("showAwayButton", "showHomeMode"):
        if k in p:
            require_bool(section, k, p[k], e)
    if "manualLockTtlMin" in p:
        num_in(section, "manualLockTtlMin", p["manualLockTtlMin"], 0, 1440, e)
    if "linkageClaimTtlMin" in p:
        num_in(section, "linkageClaimTtlMin", p["linkageClaimTtlMin"], 1, 1440, e)


def _validate_ops(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "retentionCleanupIntervalHours" in p:
        num_in(section, "retentionCleanupIntervalHours", p["retentionCleanupIntervalHours"], 1, 168, e)
    if "eventLogTierCSampleRate" in p:
        num_in(section, "eventLogTierCSampleRate", p["eventLogTierCSampleRate"], 0, 1, e)
    if "configAuditMaxEntries" in p:
        num_in(section, "configAuditMaxEntries", p["configAuditMaxEntries"], 10, 1000, e)
    if "configAuditPersistEnabled" in p:
        require_bool(section, "configAuditPersistEnabled", p["configAuditPersistEnabled"], e)
    if "sceneExecHistoryMax" in p:
        num_in(section, "sceneExecHistoryMax", p["sceneExecHistoryMax"], 1, 1000, e)
    if "scriptExecHistoryMax" in p:
        num_in(section, "scriptExecHistoryMax", p["scriptExecHistoryMax"], 1, 1000, e)
    if "eventLogTimelineMax" in p:
        num_in(section, "eventLogTimelineMax", p["eventLogTimelineMax"], 1, 5000, e)
    if "eventLogTimelineHours" in p:
        num_in(section, "eventLogTimelineHours", p["eventLogTimelineHours"], 1, 168, e)
    if "eventLogOverlayHours" in p:
        num_in(section, "eventLogOverlayHours", p["eventLogOverlayHours"], 1, 72, e)
    if "eventLogMaxBuffer" in p:
        num_in(section, "eventLogMaxBuffer", p["eventLogMaxBuffer"], 1, 5000, e)
    if "eventLogFlushIntervalMs" in p:
        num_in(section, "eventLogFlushIntervalMs", p["eventLogFlushIntervalMs"], 500, 120_000, e)
    if "retentionDeleteBatchSize" in p:
        num_in(section, "retentionDeleteBatchSize", p["retentionDeleteBatchSize"], 100, 50_000, e)
    if "retentionFirstDelaySec" in p:
        num_in(section, "retentionFirstDelaySec", p["retentionFirstDelaySec"], 0, 3600, e)
    if "eventLogMaxRequeueBuffer" in p:
        num_in(section, "eventLogMaxRequeueBuffer", p["eventLogMaxRequeueBuffer"], 1, 10_000, e)
    if "autoBackupEnabled" in p:
        require_bool(section, "autoBackupEnabled", p["autoBackupEnabled"], e)
    if "autoBackupRetainDays" in p:
        num_in(section, "autoBackupRetainDays", p["autoBackupRetainDays"], 1, 365, e)
    for k in ("eventLogTierEnabled", "eventLogSkipSensorTimeline", "eventLogRecordFilterEnabled"):
        if k in p:
            require_bool(section, k, p[k], e)
    if "eventLogRecordFilterMode" in p:
        mode = p["eventLogRecordFilterMode"]
        if mode not in ("block", "allow_domains"):
            e.append(
                {
                    "section": section,
                    "key": "eventLogRecordFilterMode",
                    "message": "须为 block 或 allow_domains",
                }
            )
    for key in ("eventLogRecordBlockDomains", "eventLogRecordAllowDomains"):
        if key not in p:
            continue
        domains = p[key]
        if not isinstance(domains, list):
            e.append({"section": section, "key": key, "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z0-9_]+$", str(d).strip()) for d in domains
        ):
            e.append({"section": section, "key": key, "message": "每项须为合法 HA domain 名称"})
    if "eventLogRecordBlockEntityIds" in p:
        ids = p["eventLogRecordBlockEntityIds"]
        if not isinstance(ids, list):
            e.append({"section": section, "key": "eventLogRecordBlockEntityIds", "message": "须为字符串数组"})
        elif any(not isinstance(i, str) or "." not in str(i).strip() for i in ids):
            e.append(
                {
                    "section": section,
                    "key": "eventLogRecordBlockEntityIds",
                    "message": "每项须为合法 entity_id（含 domain.）",
                }
            )
    if "homeTimezone" in p:
        tz = p["homeTimezone"]
        if not isinstance(tz, str) or not tz.strip():
            e.append({"section": section, "key": "homeTimezone", "message": "必须为非空 IANA 时区字符串"})
        else:
            try:
                from zoneinfo import ZoneInfo

                ZoneInfo(tz.strip())
            except Exception:  # noqa: BLE001 - 无效时区
                e.append({"section": section, "key": "homeTimezone", "message": f"无效时区: {tz}"})


def _validate_ha_connector(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    bound_checks = {
        "reconnectBaseMs": (100, 60000),
        "maxReconnectDelayMs": (1000, 300000),
        "commandQueueMax": (1, 100),
        "commandQueueTtlMs": (1000, 600_000),
        "entityRegistryCacheMs": (1000, 3_600_000),
        "entityRegistryTimeoutMs": (1000, 120_000),
        "historyCacheMaxSize": (1, 10_000),
        "ingressCoalesceWindowMs": (0, 500),
        "disconnectRestPollInitialDelayMs": (0, 300_000),
        "disconnectRestPollIntervalMs": (1_000, 600_000),
        "disconnectRestPollTimeoutMs": (5_000, 300_000),
        "wsPingIntervalMs": (5_000, 300_000),
        "wsPongTimeoutMs": (1_000, 120_000),
        "wsHeartbeatMaxMisses": (1, 10),
        "coldBatchWindowMs": (0, 500),
        "coldBatchMax": (1, 10_000),
        "leaderTtlMs": (2_000, 120_000),
        "leaderRenewMs": (500, 60_000),
    }
    for key, (lo, hi) in bound_checks.items():
        if key in p:
            num_in(section, key, p[key], lo, hi, e)
    for k in ("ingressCoalesceEnabled", "disconnectRestPollEnabled", "syncOnlyEnabledEntities"):
        if k in p:
            require_bool(section, k, p[k], e)
    if "ingressCoalesceDomains" in p:
        domains = p["ingressCoalesceDomains"]
        if not isinstance(domains, list):
            e.append({"section": section, "key": "ingressCoalesceDomains", "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z_][a-z0-9_]*$", str(d).strip(), re.IGNORECASE)
            for d in domains
        ):
            e.append({"section": section, "key": "ingressCoalesceDomains", "message": "每项须为合法 HA domain 名称"})


def _validate_state_store(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "redisWriteBatch" in p:
        num_in(section, "redisWriteBatch", p["redisWriteBatch"], 1, 10_000, e)
    if "redisIncrementalFlushMs" in p:
        num_in(section, "redisIncrementalFlushMs", p["redisIncrementalFlushMs"], 10, 60_000, e)
    if "maxRecentChanges" in p:
        num_in(section, "maxRecentChanges", p["maxRecentChanges"], 100, 50_000, e)
    if "staleThresholdMs" in p:
        num_in(section, "staleThresholdMs", p["staleThresholdMs"], 10_000, 3_600_000, e)
    if "initialStatesPriorityEnabled" in p:
        require_bool(section, "initialStatesPriorityEnabled", p["initialStatesPriorityEnabled"], e)


def _validate_command_proxy(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "idempotencyTtlMs" in p:
        num_in(section, "idempotencyTtlMs", p["idempotencyTtlMs"], 100, 60_000, e)
    if "idempotencyCleanupIntervalMs" in p:
        num_in(
            section,
            "idempotencyCleanupIntervalMs",
            p["idempotencyCleanupIntervalMs"],
            1_000,
            600_000,
            e,
        )


def _validate_ws_push(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "stateFlushIntervalMs" in p:
        num_in(section, "stateFlushIntervalMs", p["stateFlushIntervalMs"], 10, 10_000, e)
    if "sensorFlushIntervalMs" in p:
        num_in(section, "sensorFlushIntervalMs", p["sensorFlushIntervalMs"], 10, 60_000, e)
    if "criticalFlushIntervalMs" in p:
        num_in(section, "criticalFlushIntervalMs", p["criticalFlushIntervalMs"], 0, 500, e)
    if "pinnedSensorFlushIntervalMs" in p:
        num_in(section, "pinnedSensorFlushIntervalMs", p["pinnedSensorFlushIntervalMs"], 0, 1_000, e)
    if "stateBatchMax" in p:
        num_in(section, "stateBatchMax", p["stateBatchMax"], 10, 2_000, e)
    if "haSyncWaitMs" in p:
        num_in(section, "haSyncWaitMs", p["haSyncWaitMs"], 1_000, 600_000, e)
    if "replayChunkSize" in p:
        num_in(section, "replayChunkSize", p["replayChunkSize"], 10, 5_000, e)
    for k in ("coldEntityOnDemand", "roomBatchEmit"):
        if k in p:
            require_bool(section, k, p[k], e)
    if "latencyProfile" in p:
        v = p["latencyProfile"]
        if v not in ("realtime", "balanced", "bulk"):
            e.append({"section": section, "key": "latencyProfile", "message": "须为 realtime | balanced | bulk"})
    if "criticalDomains" in p:
        domains = p["criticalDomains"]
        if not isinstance(domains, list):
            e.append({"section": section, "key": "criticalDomains", "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z_][a-z0-9_]*$", str(d).strip(), re.IGNORECASE)
            for d in domains
        ):
            e.append({"section": section, "key": "criticalDomains", "message": "每项须为合法 HA domain 名称"})


def _validate_webrtc(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    for key in ("iceUrls", "iceUsername", "iceCredential"):
        if key in p and p[key] is not None and not isinstance(p[key], str):
            e.append({"section": section, "key": key, "message": "须为字符串"})


def _validate_other(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "eventlogRetentionDays" in p:
        num_in(section, "eventlogRetentionDays", p["eventlogRetentionDays"], 1, 365, e)
    if "haHistoryCacheMin" in p:
        num_in(section, "haHistoryCacheMin", p["haHistoryCacheMin"], 1, 1440, e)
    if "speakCooldownMin" in p:
        num_in(section, "speakCooldownMin", p["speakCooldownMin"], 0, 1440, e)
    if "tipCooldownHours" in p:
        num_in(section, "tipCooldownHours", p["tipCooldownHours"], 0, 72, e)
    if p.get("advisorTipActions") is not None and "advisorTipActions" in p:
        aa = p["advisorTipActions"]
        if not isinstance(aa, dict):
            e.append({"section": section, "key": "advisorTipActions", "message": "须为对象"})
        else:
            for cat, val in aa.items():
                if not str(cat).strip():
                    e.append({"section": section, "key": "advisorTipActions", "message": "分类键须为非空字符串"})
                    break
                if not isinstance(val, dict):
                    e.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」须为 {{ type, id }} 对象",
                        }
                    )
                    break
                if val.get("type") not in ("home_mode", "scene"):
                    e.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」type 须为 home_mode 或 scene",
                        }
                    )
                    break
                if not isinstance(val.get("id"), str) or not str(val["id"]).strip():
                    e.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」id 须为非空字符串",
                        }
                    )
                    break


def _validate_retention(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    from ...core.retention import RETENTION_DAYS_MAX, RETENTION_DAYS_MIN, RETENTION_TABLE_KEYS

    for key in RETENTION_TABLE_KEYS:
        if key in p:
            num_in(section, key, p[key], RETENTION_DAYS_MIN, RETENTION_DAYS_MAX, e)


def _validate_external(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "calendarSyncMin" in p:
        num_in(section, "calendarSyncMin", p["calendarSyncMin"], 1, 1440, e)
    if "calendarSyncShortMin" in p:
        num_in(section, "calendarSyncShortMin", p["calendarSyncShortMin"], 1, 60, e)
    if "calendarIncrementalEnabled" in p and not isinstance(p["calendarIncrementalEnabled"], bool):
        e.append({"section": section, "key": "calendarIncrementalEnabled", "message": "须为布尔值"})
    if p.get("weatherFallbackEntityId") not in (None, "") and "weatherFallbackEntityId" in p:
        if not re.match(r"^[a-z0-9_]+\.", str(p["weatherFallbackEntityId"]).strip(), re.IGNORECASE):
            e.append({"section": section, "key": "weatherFallbackEntityId", "message": "须为合法实体 ID 或留空"})
    if "dynamicPricingEnabled" in p and not isinstance(p["dynamicPricingEnabled"], bool):
        e.append({"section": section, "key": "dynamicPricingEnabled", "message": "须为布尔值"})
    if "dynamicPricingRefreshHours" in p:
        num_in(section, "dynamicPricingRefreshHours", p["dynamicPricingRefreshHours"], 1, 168, e)
    if p.get("dynamicPricingUrl") not in (None, "") and "dynamicPricingUrl" in p:
        if not re.match(r"^https?://.+", str(p["dynamicPricingUrl"]).strip(), re.IGNORECASE):
            e.append({"section": section, "key": "dynamicPricingUrl", "message": "须为 http(s) URL 或留空"})
    if "weatherAlertsTtlMin" in p:
        num_in(section, "weatherAlertsTtlMin", p["weatherAlertsTtlMin"], 1, 1440, e)
    if "weatherAlertRefreshMs" in p:
        num_in(section, "weatherAlertRefreshMs", p["weatherAlertRefreshMs"], 60_000, 3_600_000, e)
    if "weatherAlertEnabled" in p and not isinstance(p["weatherAlertEnabled"], bool):
        e.append({"section": section, "key": "weatherAlertEnabled", "message": "须为布尔值"})
    if "weatherAlertNotifyLevel" in p and str(p["weatherAlertNotifyLevel"]) not in ("red", "orange", "yellow"):
        e.append({"section": section, "key": "weatherAlertNotifyLevel", "message": "须为 red / orange / yellow"})
    if "weatherAlertCooldownMin" in p:
        num_in(section, "weatherAlertCooldownMin", p["weatherAlertCooldownMin"], 1, 1440, e)
    if p.get("weatherAlertSceneId") not in (None, "") and "weatherAlertSceneId" in p:
        if not isinstance(p["weatherAlertSceneId"], str):
            e.append({"section": section, "key": "weatherAlertSceneId", "message": "须为字符串或留空"})
    if p.get("weatherAlertModeId") not in (None, "") and "weatherAlertModeId" in p:
        if not isinstance(p["weatherAlertModeId"], str):
            e.append({"section": section, "key": "weatherAlertModeId", "message": "须为字符串或留空"})
    if "weatherLat" in p:
        num_in(section, "weatherLat", p["weatherLat"], -90, 90, e)
    if "weatherLon" in p:
        num_in(section, "weatherLon", p["weatherLon"], -180, 180, e)
    if p.get("openWeatherApiKey") not in (None, "") and "openWeatherApiKey" in p:
        if not isinstance(p["openWeatherApiKey"], str) or not p["openWeatherApiKey"].strip():
            e.append({"section": section, "key": "openWeatherApiKey", "message": "须为非空字符串或留空"})
    if "ttsMediaPlayerIds" in p:
        validate_entity_id_list(section, "ttsMediaPlayerIds", p["ttsMediaPlayerIds"], e)
    if p.get("calendarUrl") not in (None, "") and "calendarUrl" in p:
        if not re.match(r"^https?://.+", str(p["calendarUrl"]).strip(), re.IGNORECASE):
            e.append({"section": section, "key": "calendarUrl", "message": "须为 http(s) URL 或留空"})


def _validate_client_power(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "enabled" in p:
        require_bool(section, "enabled", p["enabled"], e)
    if "reportIntervalSec" in p:
        num_in(section, "reportIntervalSec", p["reportIntervalSec"], 5, 600, e)
    if "staleTimeoutSec" in p:
        num_in(section, "staleTimeoutSec", p["staleTimeoutSec"], 60, 3600, e)
    if "cooldownMin" in p:
        num_in(section, "cooldownMin", p["cooldownMin"], 1, 120, e)
    if "clients" in p:
        clients = p["clients"]
        if not isinstance(clients, list):
            e.append({"section": section, "key": "clients", "message": "须为数组"})
        else:
            for i, item in enumerate(clients):
                if not isinstance(item, dict):
                    e.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项须为对象"})
                    break
                if not isinstance(item.get("id"), str) or not str(item["id"]).strip():
                    e.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 id 须为非空字符串"})
                    break
                if not isinstance(item.get("label"), str) or not str(item["label"]).strip():
                    e.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 label 须为非空字符串"})
                    break
                if "enabled" in item:
                    require_bool(section, "clients", item["enabled"], e)
                if "presenceWakeEnabled" in item:
                    require_bool(section, "clients", item["presenceWakeEnabled"], e)
                validate_optional_entity_id(section, "clients", item.get("chargerSwitchEntityId"), e)
                sc = item.get("selfCharge")
                if sc is not None:
                    if not isinstance(sc, dict):
                        e.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 selfCharge 须为对象"})
                        break
                    if "enabled" in sc:
                        require_bool(section, "clients", sc["enabled"], e)
                    if "touEnabled" in sc:
                        require_bool(section, "clients", sc["touEnabled"], e)
                    low = (
                        num_in(section, "clients", sc["lowPercent"], 0, 100, e)
                        if "lowPercent" in sc
                        else None
                    )
                    high = (
                        num_in(section, "clients", sc["highPercent"], 0, 100, e)
                        if "highPercent" in sc
                        else None
                    )
                    if low is not None and high is not None and low >= high:
                        e.append(
                            {
                                "section": section,
                                "key": "clients",
                                "message": f"第 {i + 1} 项 lowPercent 须小于 highPercent",
                            }
                        )
                        break
                    critical = (
                        num_in(section, "clients", sc["criticalPercent"], 0, 100, e)
                        if "criticalPercent" in sc
                        else None
                    )
                    if critical is not None and low is not None and critical >= low:
                        e.append(
                            {
                                "section": section,
                                "key": "clients",
                                "message": f"第 {i + 1} 项 criticalPercent 须小于 lowPercent",
                            }
                        )
                        break


def _validate_env_sensor_map(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    entry_re = re.compile(r"^[a-z][a-z0-9_]*\.[a-z0-9_]+$", re.IGNORECASE)
    for room_id, entry_raw in p.items():
        if not str(room_id).strip():
            e.append({"section": section, "key": room_id, "message": "房间 ID 不能为空"})
            continue
        if not isinstance(entry_raw, dict):
            e.append({"section": section, "key": room_id, "message": "须为对象"})
            continue
        hidden = entry_raw.get("_hidden")
        if hidden is not None and not isinstance(hidden, bool):
            e.append({"section": section, "key": f"{room_id}._hidden", "message": "须为布尔值"})
        for field in ("label", "temperature", "humidity", "pm25", "co2", "tvoc"):
            val = entry_raw.get(field)
            if val is None or val == "":
                continue
            if not isinstance(val, str):
                e.append({"section": section, "key": f"{room_id}.{field}", "message": "须为字符串"})
                continue
            if field != "label" and not entry_re.match(val.strip()):
                e.append({"section": section, "key": f"{room_id}.{field}", "message": "须为合法 entity_id"})


_NEW_TERMINAL_DEFAULTS = {"activeProfile", "default"}


def _validate_profiles(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    if "activeProfileId" in p:
        if not isinstance(p["activeProfileId"], str) or not p["activeProfileId"].strip():
            e.append({"section": section, "key": "activeProfileId", "message": "须为非空字符串"})
    if "newTerminalDefault" in p:
        val = str(p["newTerminalDefault"] or "")
        if val not in _NEW_TERMINAL_DEFAULTS:
            e.append({"section": section, "key": "newTerminalDefault", "message": "须为 activeProfile 或 default"})
    if "terminalBindings" in p:
        bindings = p["terminalBindings"]
        if not isinstance(bindings, list):
            e.append({"section": section, "key": "terminalBindings", "message": "须为数组"})
            return
        for i, item in enumerate(bindings):
            if not isinstance(item, dict):
                e.append({"section": section, "key": "terminalBindings", "message": f"第 {i + 1} 项须为对象"})
                break
            if not isinstance(item.get("clientId"), str) or not str(item["clientId"]).strip():
                e.append(
                    {
                        "section": section,
                        "key": "terminalBindings",
                        "message": f"第 {i + 1} 项 clientId 须为非空字符串",
                    }
                )
                break
            if not isinstance(item.get("profileId"), str) or not str(item["profileId"]).strip():
                e.append(
                    {
                        "section": section,
                        "key": "terminalBindings",
                        "message": f"第 {i + 1} 项 profileId 须为非空字符串",
                    }
                )
                break
            if item.get("label") is not None and "label" in item and not isinstance(item["label"], str):
                e.append(
                    {"section": section, "key": "terminalBindings", "message": f"第 {i + 1} 项 label 须为字符串"}
                )
                break
            if item.get("updatedAt") is not None and "updatedAt" in item and not isinstance(item["updatedAt"], str):
                e.append(
                    {
                        "section": section,
                        "key": "terminalBindings",
                        "message": f"第 {i + 1} 项 updatedAt 须为 ISO 字符串",
                    }
                )
                break


_SECTION_VALIDATORS: dict[str, Any] = {
    "notification": _validate_notification,
    "security": _validate_security,
    "water": _validate_water,
    "iaq": _validate_iaq,
    "circadian": _validate_circadian,
    "energy": _validate_energy,
    "pricing": _validate_pricing,
    "frontend": _validate_frontend,
    "screensaver": _validate_screensaver,
    "weatherEffects": _validate_weather_effects,
    "voice": _validate_voice,
    "auth": _validate_auth,
    "ops": _validate_ops,
    "haConnector": _validate_ha_connector,
    "stateStore": _validate_state_store,
    "homeMode": _validate_home_mode,
    "other": _validate_other,
    "retention": _validate_retention,
    "external": _validate_external,
    "wsPush": _validate_ws_push,
    "commandProxy": _validate_command_proxy,
    "webrtc": _validate_webrtc,
    "clientPower": _validate_client_power,
    "envSensorMap": _validate_env_sensor_map,
    "profiles": _validate_profiles,
    "ui": _validate_ui,
    "mediaPlaylists": _validate_media_playlists,
}


def validate_app_config_section(
    section: str, partial: dict[str, Any], context: dict[str, Any] | None = None
) -> None:
    """按分区名分发校验；收集错误后抛出 :class:`AppConfigValidationError`。"""
    errors: list[FieldError] = []
    validator = _SECTION_VALIDATORS.get(section)
    if validator is not None:
        if section in ("pricing", "security"):
            validator(section, partial, errors, context)
        else:
            validator(section, partial, errors)
    if errors:
        raise AppConfigValidationError(errors)


_ARRAY_SECTIONS = {"voiceCommands"}


def validate_app_config_partial(partial: dict[str, Any], context: dict[str, Any] | None = None) -> None:
    """校验 PUT /system/config 各分区 partial。"""
    for section, val in partial.items():
        if val is None:
            continue
        if section in _ARRAY_SECTIONS:
            if not isinstance(val, list):
                raise AppConfigValidationError([{"section": section, "key": "*", "message": "分区须为数组"}])
            if section == "voiceCommands":
                errors = validate_voice_commands_array(val)
                if errors:
                    raise AppConfigValidationError(errors)
            continue
        if not isinstance(val, dict):
            raise AppConfigValidationError([{"section": section, "key": "*", "message": "分区须为对象"}])
        validate_app_config_section(section, val, context)


def validate_app_config_full(config: Any) -> None:
    """import replace 时校验完整配置结构。"""
    if not isinstance(config, dict):
        bad_request("配置须为 JSON 对象")
    validate_app_config_partial(config)


def _merge_deep(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            _merge_deep(target[key], value)
        else:
            target[key] = value


def validate_app_config_replace_import(config: Any) -> None:
    """全量替换导入：拒绝未知顶层分区，并按默认值合并后校验各分区全部字段。"""
    from .defaults import DEFAULT_APP_CONFIG

    validate_app_config_full(config)
    errors: list[FieldError] = []
    allowed = set(DEFAULT_APP_CONFIG.keys())
    for key in config:
        if key not in allowed:
            errors.append({"section": key, "key": "*", "message": "未知配置分区"})
    if errors:
        raise AppConfigValidationError(errors)

    merged = copy.deepcopy(DEFAULT_APP_CONFIG)
    _merge_deep(merged, config)

    for section in DEFAULT_APP_CONFIG:
        val = merged.get(section)
        if section in _ARRAY_SECTIONS:
            if not isinstance(val, list):
                errors.append({"section": section, "key": "*", "message": "分区须为数组"})
            elif section == "voiceCommands":
                errors.extend(validate_voice_commands_array(val))
            continue
        if not isinstance(val, dict):
            errors.append({"section": section, "key": "*", "message": "分区须为对象"})
            continue
        try:
            validate_app_config_section(section, val)
        except AppConfigValidationError as exc:
            errors.extend(exc.field_errors)
    if errors:
        raise AppConfigValidationError(errors)
