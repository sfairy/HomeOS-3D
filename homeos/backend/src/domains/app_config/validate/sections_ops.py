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

#: 环境传感器映射里的实体/数值字段写法：``domain.object_id``（大小写不敏感）。
_ENV_SENSOR_ENTITY_PATTERN = re.compile(r"^[a-z][a-z0-9_]*\.[a-z0-9_]+$", re.IGNORECASE)
from .sections_ui import (
    _validate_frontend,
    _validate_media_playlists,
    _validate_screensaver,
    _validate_ui,
    _validate_voice,
)
from .security import (
    _validate_auth,
    _validate_circadian,
    _validate_iaq,
    _validate_notification,
    _validate_security,
    _validate_water,
)


def _validate_home_mode(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "applyMaxRetries" in payload:
        num_in(section, "applyMaxRetries", payload["applyMaxRetries"], 0, 10, errors)
    if "triggerCooldownMs" in payload:
        num_in(section, "triggerCooldownMs", payload["triggerCooldownMs"], 0, 600_000, errors)
    if "maxTriggerLogs" in payload:
        num_in(section, "maxTriggerLogs", payload["maxTriggerLogs"], 1, 500, errors)
    if "maxExecHistory" in payload:
        num_in(section, "maxExecHistory", payload["maxExecHistory"], 1, 500, errors)
    for k in ("showAwayButton", "showHomeMode"):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if "manualLockTtlMin" in payload:
        num_in(section, "manualLockTtlMin", payload["manualLockTtlMin"], 0, 1440, errors)
    if "linkageClaimTtlMin" in payload:
        num_in(section, "linkageClaimTtlMin", payload["linkageClaimTtlMin"], 1, 1440, errors)

def _validate_ops(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "retentionCleanupIntervalHours" in payload:
        num_in(section, "retentionCleanupIntervalHours", payload["retentionCleanupIntervalHours"], 1, 168, errors)
    if "eventLogTierCSampleRate" in payload:
        num_in(section, "eventLogTierCSampleRate", payload["eventLogTierCSampleRate"], 0, 1, errors)
    if "configAuditMaxEntries" in payload:
        num_in(section, "configAuditMaxEntries", payload["configAuditMaxEntries"], 10, 1000, errors)
    if "configAuditPersistEnabled" in payload:
        require_bool(section, "configAuditPersistEnabled", payload["configAuditPersistEnabled"], errors)
    if "sceneExecHistoryMax" in payload:
        num_in(section, "sceneExecHistoryMax", payload["sceneExecHistoryMax"], 1, 1000, errors)
    if "scriptExecHistoryMax" in payload:
        num_in(section, "scriptExecHistoryMax", payload["scriptExecHistoryMax"], 1, 1000, errors)
    if "eventLogTimelineMax" in payload:
        num_in(section, "eventLogTimelineMax", payload["eventLogTimelineMax"], 1, 5000, errors)
    if "eventLogTimelineHours" in payload:
        num_in(section, "eventLogTimelineHours", payload["eventLogTimelineHours"], 1, 168, errors)
    if "eventLogOverlayHours" in payload:
        num_in(section, "eventLogOverlayHours", payload["eventLogOverlayHours"], 1, 72, errors)
    if "eventLogMaxBuffer" in payload:
        num_in(section, "eventLogMaxBuffer", payload["eventLogMaxBuffer"], 1, 5000, errors)
    if "eventLogFlushIntervalMs" in payload:
        num_in(section, "eventLogFlushIntervalMs", payload["eventLogFlushIntervalMs"], 500, 120_000, errors)
    if "retentionDeleteBatchSize" in payload:
        num_in(section, "retentionDeleteBatchSize", payload["retentionDeleteBatchSize"], 100, 50_000, errors)
    if "retentionFirstDelaySec" in payload:
        num_in(section, "retentionFirstDelaySec", payload["retentionFirstDelaySec"], 0, 3600, errors)
    if "eventLogMaxRequeueBuffer" in payload:
        num_in(section, "eventLogMaxRequeueBuffer", payload["eventLogMaxRequeueBuffer"], 1, 10_000, errors)
    if "autoBackupEnabled" in payload:
        require_bool(section, "autoBackupEnabled", payload["autoBackupEnabled"], errors)
    if "autoBackupRetainDays" in payload:
        num_in(section, "autoBackupRetainDays", payload["autoBackupRetainDays"], 1, 365, errors)
    for k in ("eventLogTierEnabled", "eventLogSkipSensorTimeline", "eventLogRecordFilterEnabled"):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if "eventLogRecordFilterMode" in payload:
        mode = payload["eventLogRecordFilterMode"]
        if mode not in ("block", "allow_domains"):
            errors.append(
                {
                    "section": section,
                    "key": "eventLogRecordFilterMode",
                    "message": "须为 block 或 allow_domains",
                }
            )
    for key in ("eventLogRecordBlockDomains", "eventLogRecordAllowDomains"):
        if key not in payload:
            continue
        domains = payload[key]
        if not isinstance(domains, list):
            errors.append({"section": section, "key": key, "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z0-9_]+$", str(d).strip()) for d in domains
        ):
            errors.append({"section": section, "key": key, "message": "每项须为合法 HA domain 名称"})
    if "eventLogRecordBlockEntityIds" in payload:
        ids = payload["eventLogRecordBlockEntityIds"]
        if not isinstance(ids, list):
            errors.append({"section": section, "key": "eventLogRecordBlockEntityIds", "message": "须为字符串数组"})
        elif any(not isinstance(i, str) or "." not in str(i).strip() for i in ids):
            errors.append(
                {
                    "section": section,
                    "key": "eventLogRecordBlockEntityIds",
                    "message": "每项须为合法 entity_id（含 domain.）",
                }
            )
    if "homeTimezone" in payload:
        tz = payload["homeTimezone"]
        if not isinstance(tz, str) or not tz.strip():
            errors.append({"section": section, "key": "homeTimezone", "message": "必须为非空 IANA 时区字符串"})
        else:
            try:
                from zoneinfo import ZoneInfo

                ZoneInfo(tz.strip())
            except Exception:
                errors.append({"section": section, "key": "homeTimezone", "message": f"无效时区: {tz}"})

def _validate_ha_connector(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    bound_checks = {
        "reconnectBaseMs": (100, 60000),
        "maxReconnectDelayMs": (1000, 300000),
        "historyCacheMaxSize": (1, 10_000),
        "ingressCoalesceWindowMs": (0, 500),
        "wsPingIntervalMs": (5_000, 300_000),
        "wsPongTimeoutMs": (1_000, 120_000),
        "wsHeartbeatMaxMisses": (1, 10),
        "fastReconnectWindowMs": (5_000, 3_600_000),
    }
    for key, (lo, hi) in bound_checks.items():
        if key in payload:
            num_in(section, key, payload[key], lo, hi, errors)
    for k in (
        "ingressCoalesceEnabled",
        "syncOnlyEnabledEntities",
        "useSubscribeEntities",
        "subscribeEntitiesShadow",
        "fastReconnectEnabled",
    ):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if "ingressCoalesceDomains" in payload:
        domains = payload["ingressCoalesceDomains"]
        if not isinstance(domains, list):
            errors.append({"section": section, "key": "ingressCoalesceDomains", "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z_][a-z0-9_]*$", str(d).strip(), re.IGNORECASE)
            for d in domains
        ):
            errors.append({"section": section, "key": "ingressCoalesceDomains", "message": "每项须为合法 HA domain 名称"})

def _validate_state_store(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "maxRecentChanges" in payload:
        num_in(section, "maxRecentChanges", payload["maxRecentChanges"], 100, 50_000, errors)
    if "staleThresholdMs" in payload:
        num_in(section, "staleThresholdMs", payload["staleThresholdMs"], 10_000, 3_600_000, errors)
    if "initialStatesPriorityEnabled" in payload:
        require_bool(section, "initialStatesPriorityEnabled", payload["initialStatesPriorityEnabled"], errors)

def _validate_command_proxy(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "idempotencyTtlMs" in payload:
        num_in(section, "idempotencyTtlMs", payload["idempotencyTtlMs"], 100, 60_000, errors)
    if "idempotencyCleanupIntervalMs" in payload:
        num_in(
            section,
            "idempotencyCleanupIntervalMs",
            payload["idempotencyCleanupIntervalMs"],
            1_000,
            600_000,
            errors,
        )

def _validate_ws_push(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "sensorFlushIntervalMs" in payload:
        num_in(section, "sensorFlushIntervalMs", payload["sensorFlushIntervalMs"], 10, 60_000, errors)
    if "stateBatchMax" in payload:
        num_in(section, "stateBatchMax", payload["stateBatchMax"], 10, 2_000, errors)
    if "haSyncWaitMs" in payload:
        num_in(section, "haSyncWaitMs", payload["haSyncWaitMs"], 1_000, 600_000, errors)
    if "replayChunkSize" in payload:
        num_in(section, "replayChunkSize", payload["replayChunkSize"], 10, 5_000, errors)
    for k in ("coldEntityOnDemand", "roomBatchEmit"):
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if "latencyProfile" in payload:
        v = payload["latencyProfile"]
        if v not in ("realtime", "balanced", "bulk"):
            errors.append({"section": section, "key": "latencyProfile", "message": "须为 realtime | balanced | bulk"})
    if "criticalDomains" in payload:
        domains = payload["criticalDomains"]
        if not isinstance(domains, list):
            errors.append({"section": section, "key": "criticalDomains", "message": "须为字符串数组"})
        elif any(
            not isinstance(d, str) or not re.match(r"^[a-z_][a-z0-9_]*$", str(d).strip(), re.IGNORECASE)
            for d in domains
        ):
            errors.append({"section": section, "key": "criticalDomains", "message": "每项须为合法 HA domain 名称"})

def _validate_webrtc(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    for key in ("iceUrls", "iceUsername", "iceCredential"):
        if key in payload and payload[key] is not None and not isinstance(payload[key], str):
            errors.append({"section": section, "key": key, "message": "须为字符串"})

def _validate_other(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "eventlogRetentionDays" in payload:
        num_in(section, "eventlogRetentionDays", payload["eventlogRetentionDays"], 1, 365, errors)
    if "haHistoryCacheMin" in payload:
        num_in(section, "haHistoryCacheMin", payload["haHistoryCacheMin"], 1, 1440, errors)
    if "speakCooldownMin" in payload:
        num_in(section, "speakCooldownMin", payload["speakCooldownMin"], 0, 1440, errors)
    if "tipCooldownHours" in payload:
        num_in(section, "tipCooldownHours", payload["tipCooldownHours"], 0, 72, errors)
    if payload.get("advisorTipActions") is not None and "advisorTipActions" in payload:
        aa = payload["advisorTipActions"]
        if not isinstance(aa, dict):
            errors.append({"section": section, "key": "advisorTipActions", "message": "须为对象"})
        else:
            for cat, val in aa.items():
                if not str(cat).strip():
                    errors.append({"section": section, "key": "advisorTipActions", "message": "分类键须为非空字符串"})
                    break
                if not isinstance(val, dict):
                    errors.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」须为 {{ type, id }} 对象",
                        }
                    )
                    break
                if val.get("type") not in ("home_mode", "scene"):
                    errors.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」type 须为 home_mode 或 scene",
                        }
                    )
                    break
                if not isinstance(val.get("id"), str) or not str(val["id"]).strip():
                    errors.append(
                        {
                            "section": section,
                            "key": "advisorTipActions",
                            "message": f"「{cat}」id 须为非空字符串",
                        }
                    )
                    break

def _validate_retention(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    from ....platform.core.retention import RETENTION_DAYS_MAX, RETENTION_DAYS_MIN, RETENTION_TABLE_KEYS

    for key in RETENTION_TABLE_KEYS:
        if key in payload:
            num_in(section, key, payload[key], RETENTION_DAYS_MIN, RETENTION_DAYS_MAX, errors)

def _validate_external(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "calendarSyncMin" in payload:
        num_in(section, "calendarSyncMin", payload["calendarSyncMin"], 1, 1440, errors)
    if "calendarSyncShortMin" in payload:
        num_in(section, "calendarSyncShortMin", payload["calendarSyncShortMin"], 1, 60, errors)
    if "calendarIncrementalEnabled" in payload and not isinstance(payload["calendarIncrementalEnabled"], bool):
        errors.append({"section": section, "key": "calendarIncrementalEnabled", "message": "须为布尔值"})
    if payload.get("weatherFallbackEntityId") not in (None, "") and "weatherFallbackEntityId" in payload:
        if not re.match(r"^[a-z0-9_]+\.", str(payload["weatherFallbackEntityId"]).strip(), re.IGNORECASE):
            errors.append({"section": section, "key": "weatherFallbackEntityId", "message": "须为合法实体 ID 或留空"})
    if "dynamicPricingEnabled" in payload and not isinstance(payload["dynamicPricingEnabled"], bool):
        errors.append({"section": section, "key": "dynamicPricingEnabled", "message": "须为布尔值"})
    if "dynamicPricingRefreshHours" in payload:
        num_in(section, "dynamicPricingRefreshHours", payload["dynamicPricingRefreshHours"], 1, 168, errors)
    if payload.get("dynamicPricingUrl") not in (None, "") and "dynamicPricingUrl" in payload:
        if not re.match(r"^https?://.+", str(payload["dynamicPricingUrl"]).strip(), re.IGNORECASE):
            errors.append({"section": section, "key": "dynamicPricingUrl", "message": "须为 http(s) URL 或留空"})
    if "weatherAlertRefreshMs" in payload:
        num_in(section, "weatherAlertRefreshMs", payload["weatherAlertRefreshMs"], 60_000, 3_600_000, errors)
    if "weatherAlertEnabled" in payload and not isinstance(payload["weatherAlertEnabled"], bool):
        errors.append({"section": section, "key": "weatherAlertEnabled", "message": "须为布尔值"})
    if "weatherAlertNotifyLevel" in payload and str(payload["weatherAlertNotifyLevel"]) not in ("red", "orange", "yellow"):
        errors.append({"section": section, "key": "weatherAlertNotifyLevel", "message": "须为 red / orange / yellow"})
    if "weatherAlertCooldownMin" in payload:
        num_in(section, "weatherAlertCooldownMin", payload["weatherAlertCooldownMin"], 1, 1440, errors)
    if payload.get("weatherAlertSceneId") not in (None, "") and "weatherAlertSceneId" in payload:
        if not isinstance(payload["weatherAlertSceneId"], str):
            errors.append({"section": section, "key": "weatherAlertSceneId", "message": "须为字符串或留空"})
    if payload.get("weatherAlertModeId") not in (None, "") and "weatherAlertModeId" in payload:
        if not isinstance(payload["weatherAlertModeId"], str):
            errors.append({"section": section, "key": "weatherAlertModeId", "message": "须为字符串或留空"})
    if "weatherLat" in payload:
        num_in(section, "weatherLat", payload["weatherLat"], -90, 90, errors)
    if "weatherLon" in payload:
        num_in(section, "weatherLon", payload["weatherLon"], -180, 180, errors)
    if payload.get("openWeatherApiKey") not in (None, "") and "openWeatherApiKey" in payload:
        if not isinstance(payload["openWeatherApiKey"], str) or not payload["openWeatherApiKey"].strip():
            errors.append({"section": section, "key": "openWeatherApiKey", "message": "须为非空字符串或留空"})
    if "ttsMediaPlayerIds" in payload:
        validate_entity_id_list(section, "ttsMediaPlayerIds", payload["ttsMediaPlayerIds"], errors)
    if payload.get("calendarUrl") not in (None, "") and "calendarUrl" in payload:
        if not re.match(r"^https?://.+", str(payload["calendarUrl"]).strip(), re.IGNORECASE):
            errors.append({"section": section, "key": "calendarUrl", "message": "须为 http(s) URL 或留空"})

def _validate_client_power(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "enabled" in payload:
        require_bool(section, "enabled", payload["enabled"], errors)
    if "reportIntervalSec" in payload:
        num_in(section, "reportIntervalSec", payload["reportIntervalSec"], 5, 600, errors)
    if "staleTimeoutSec" in payload:
        num_in(section, "staleTimeoutSec", payload["staleTimeoutSec"], 60, 3600, errors)
    if "cooldownMin" in payload:
        num_in(section, "cooldownMin", payload["cooldownMin"], 1, 120, errors)
    if "clients" in payload:
        clients = payload["clients"]
        if not isinstance(clients, list):
            errors.append({"section": section, "key": "clients", "message": "须为数组"})
        else:
            for i, item in enumerate(clients):
                if not isinstance(item, dict):
                    errors.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项须为对象"})
                    break
                if not isinstance(item.get("id"), str) or not str(item["id"]).strip():
                    errors.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 id 须为非空字符串"})
                    break
                if not isinstance(item.get("label"), str) or not str(item["label"]).strip():
                    errors.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 label 须为非空字符串"})
                    break
                if "enabled" in item:
                    require_bool(section, "clients", item["enabled"], errors)
                if "presenceWakeEnabled" in item:
                    require_bool(section, "clients", item["presenceWakeEnabled"], errors)
                validate_optional_entity_id(section, "clients", item.get("chargerSwitchEntityId"), errors)
                sc = item.get("selfCharge")
                if sc is not None:
                    if not isinstance(sc, dict):
                        errors.append({"section": section, "key": "clients", "message": f"第 {i + 1} 项 selfCharge 须为对象"})
                        break
                    if "enabled" in sc:
                        require_bool(section, "clients", sc["enabled"], errors)
                    if "touEnabled" in sc:
                        require_bool(section, "clients", sc["touEnabled"], errors)
                    low = (
                        num_in(section, "clients", sc["lowPercent"], 0, 100, errors)
                        if "lowPercent" in sc
                        else None
                    )
                    high = (
                        num_in(section, "clients", sc["highPercent"], 0, 100, errors)
                        if "highPercent" in sc
                        else None
                    )
                    if low is not None and high is not None and low >= high:
                        errors.append(
                            {
                                "section": section,
                                "key": "clients",
                                "message": f"第 {i + 1} 项 lowPercent 须小于 highPercent",
                            }
                        )
                        break
                    critical = (
                        num_in(section, "clients", sc["criticalPercent"], 0, 100, errors)
                        if "criticalPercent" in sc
                        else None
                    )
                    if critical is not None and low is not None and critical >= low:
                        errors.append(
                            {
                                "section": section,
                                "key": "clients",
                                "message": f"第 {i + 1} 项 criticalPercent 须小于 lowPercent",
                            }
                        )
                        break

def _validate_env_sensor_map(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    for room_id, entry_raw in payload.items():
        if not str(room_id).strip():
            errors.append({"section": section, "key": room_id, "message": "房间 ID 不能为空"})
            continue
        if not isinstance(entry_raw, dict):
            errors.append({"section": section, "key": room_id, "message": "须为对象"})
            continue
        hidden = entry_raw.get("_hidden")
        if hidden is not None and not isinstance(hidden, bool):
            errors.append({"section": section, "key": f"{room_id}._hidden", "message": "须为布尔值"})
        for field in ("label", "temperature", "humidity", "pm25", "co2", "tvoc"):
            val = entry_raw.get(field)
            if val is None or val == "":
                continue
            if not isinstance(val, str):
                errors.append({"section": section, "key": f"{room_id}.{field}", "message": "须为字符串"})
                continue
            if field != "label" and not _ENV_SENSOR_ENTITY_PATTERN.match(val.strip()):
                errors.append({"section": section, "key": f"{room_id}.{field}", "message": "须为合法 entity_id"})


_NEW_TERMINAL_DEFAULTS = {"activeProfile", "default"}

def _validate_profiles(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "activeProfileId" in payload:
        if not isinstance(payload["activeProfileId"], str) or not payload["activeProfileId"].strip():
            errors.append({"section": section, "key": "activeProfileId", "message": "须为非空字符串"})
    if "newTerminalDefault" in payload:
        val = str(payload["newTerminalDefault"] or "")
        if val not in _NEW_TERMINAL_DEFAULTS:
            errors.append({"section": section, "key": "newTerminalDefault", "message": "须为 activeProfile 或 default"})
    if "terminalBindings" in payload:
        bindings = payload["terminalBindings"]
        if not isinstance(bindings, list):
            errors.append({"section": section, "key": "terminalBindings", "message": "须为数组"})
            return
        for i, item in enumerate(bindings):
            if not isinstance(item, dict):
                errors.append({"section": section, "key": "terminalBindings", "message": f"第 {i + 1} 项须为对象"})
                break
            if not isinstance(item.get("clientId"), str) or not str(item["clientId"]).strip():
                errors.append(
                    {
                        "section": section,
                        "key": "terminalBindings",
                        "message": f"第 {i + 1} 项 clientId 须为非空字符串",
                    }
                )
                break
            if not isinstance(item.get("profileId"), str) or not str(item["profileId"]).strip():
                errors.append(
                    {
                        "section": section,
                        "key": "terminalBindings",
                        "message": f"第 {i + 1} 项 profileId 须为非空字符串",
                    }
                )
                break
            if item.get("label") is not None and "label" in item and not isinstance(item["label"], str):
                errors.append(
                    {"section": section, "key": "terminalBindings", "message": f"第 {i + 1} 项 label 须为字符串"}
                )
                break
            if item.get("updatedAt") is not None and "updatedAt" in item and not isinstance(item["updatedAt"], str):
                errors.append(
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
