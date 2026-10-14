"""ops 及运维相关分区校验：连接器 / 推送 / 外部通道 / 套餐档案等。"""

from __future__ import annotations

import re
from typing import Any

from .core import (
    FieldError,
    num_in,
    require_bool,
    validate_entity_id_list,
    validate_optional_entity_id,
)
from .energy import (
    _validate_energy,
    _validate_pricing,
)
from .sections_ui import (
    _validate_frontend,
    _validate_media_playlists,
    _validate_screensaver,
    _validate_ui,
    _validate_voice,
    _validate_weather_effects,
)
from .security import (
    _validate_auth,
    _validate_circadian,
    _validate_iaq,
    _validate_notification,
    _validate_security,
    _validate_water,
)


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
            except Exception:
                e.append({"section": section, "key": "homeTimezone", "message": f"无效时区: {tz}"})

def _validate_ha_connector(section: str, p: dict[str, Any], e: list[FieldError]) -> None:
    bound_checks = {
        "reconnectBaseMs": (100, 60000),
        "maxReconnectDelayMs": (1000, 300000),
        "historyCacheMaxSize": (1, 10_000),
        "ingressCoalesceWindowMs": (0, 500),
        "wsPingIntervalMs": (5_000, 300_000),
        "wsPongTimeoutMs": (1_000, 120_000),
        "wsHeartbeatMaxMisses": (1, 10),
    }
    for key, (lo, hi) in bound_checks.items():
        if key in p:
            num_in(section, key, p[key], lo, hi, e)
    for k in ("ingressCoalesceEnabled", "syncOnlyEnabledEntities"):
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
    if "sensorFlushIntervalMs" in p:
        num_in(section, "sensorFlushIntervalMs", p["sensorFlushIntervalMs"], 10, 60_000, e)
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
    from ....platform.core.retention import RETENTION_DAYS_MAX, RETENTION_DAYS_MIN, RETENTION_TABLE_KEYS

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
