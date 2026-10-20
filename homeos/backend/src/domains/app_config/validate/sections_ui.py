"""界面分区校验：frontend / ui / screensaver / 场景 / 语音 / 播放列表。"""

from __future__ import annotations

import re
from typing import Any

from .core import (
    FieldError,
    is_entity_id,
    num_in,
    require_bool,
    validate_optional_entity_id,
)
from ..constants import (
    REBUILD_DEBOUNCE_MS_MAX,
    REBUILD_DEBOUNCE_MS_MIN,
)

#: 语音命令里的 domain / service 词法：``^[a-z_][a-z0-9_]*$``（大小写不敏感）。
_VOICE_DOMAIN_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*$", re.IGNORECASE)


def _validate_frontend(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "apiTimeoutMs" in payload:
        num_in(section, "apiTimeoutMs", payload["apiTimeoutMs"], 1000, 120000, errors)
    if "apiRetryMax" in payload:
        num_in(section, "apiRetryMax", payload["apiRetryMax"], 0, 10, errors)
    if "apiRetryDelayMs" in payload:
        num_in(section, "apiRetryDelayMs", payload["apiRetryDelayMs"], 100, 30_000, errors)
    if "haDisconnectDebounceMs" in payload:
        num_in(section, "haDisconnectDebounceMs", payload["haDisconnectDebounceMs"], 0, 60_000, errors)
    if "initialStatesWaitMs" in payload:
        num_in(section, "initialStatesWaitMs", payload["initialStatesWaitMs"], 1000, 300_000, errors)
    if "entityCacheEnabled" in payload:
        require_bool(section, "entityCacheEnabled", payload["entityCacheEnabled"], errors)
    if "entityCacheMaxAgeMs" in payload:
        num_in(section, "entityCacheMaxAgeMs", payload["entityCacheMaxAgeMs"], 60_000, 7 * 86400_000, errors)
    if "entityCacheSaveDebounceMs" in payload:
        num_in(
            section,
            "entityCacheSaveDebounceMs",
            payload["entityCacheSaveDebounceMs"],
            1000,
            120_000,
            errors,
        )
    if "rebuildChunkSize" in payload:
        num_in(section, "rebuildChunkSize", payload["rebuildChunkSize"], 50, 5000, errors)
    if "largeEntityThreshold" in payload:
        num_in(section, "largeEntityThreshold", payload["largeEntityThreshold"], 100, 50000, errors)
    if "workerDerivedThreshold" in payload:
        num_in(section, "workerDerivedThreshold", payload["workerDerivedThreshold"], 500, 100000, errors)
    if "rebuildDebounceMs" in payload:
        num_in(
            section,
            "rebuildDebounceMs",
            payload["rebuildDebounceMs"],
            REBUILD_DEBOUNCE_MS_MIN,
            REBUILD_DEBOUNCE_MS_MAX,
            errors,
        )
    if "maxListeners" in payload:
        num_in(section, "maxListeners", payload["maxListeners"], 10, 500, errors)
    if "callDedupWindowMs" in payload:
        num_in(section, "callDedupWindowMs", payload["callDedupWindowMs"], 0, 10_000, errors)
    if "maxRemoteNotifications" in payload:
        num_in(section, "maxRemoteNotifications", payload["maxRemoteNotifications"], 1, 1000, errors)
    if "sessionRefreshHours" in payload:
        num_in(section, "sessionRefreshHours", payload["sessionRefreshHours"], 1, 168, errors)
    if "optimisticTtlMs" in payload:
        num_in(section, "optimisticTtlMs", payload["optimisticTtlMs"], 500, 30_000, errors)
    if "initStatesBatchSize" in payload:
        num_in(section, "initStatesBatchSize", payload["initStatesBatchSize"], 10, 5000, errors)
    if payload.get("widgetPollIntervals") is not None and "widgetPollIntervals" in payload:
        wpi = payload["widgetPollIntervals"]
        if not isinstance(wpi, dict):
            errors.append({"section": section, "key": "widgetPollIntervals", "message": "必须为对象"})
        else:
            for wk, wv in wpi.items():
                num_in(section, f"widgetPollIntervals.{wk}", wv, 1000, 600000, errors)

def _validate_ui(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "scaleBaseWidth" in payload:
        num_in(section, "scaleBaseWidth", payload["scaleBaseWidth"], 800, 7680, errors)
    if "scaleBaseHeight" in payload:
        num_in(section, "scaleBaseHeight", payload["scaleBaseHeight"], 600, 4320, errors)
    if "accentColor" in payload:
        val = payload["accentColor"]
        if not isinstance(val, str) or not re.match(r"^#[0-9a-fA-F]{6}$", val.strip()):
            errors.append(
                {"section": section, "key": "accentColor", "message": "须为 #RRGGBB 格式十六进制颜色"}
            )


_SCREENSAVER_MODES = {"clock", "weather", "random"}

def _validate_screensaver(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "screensaverEnabled" in payload:
        require_bool(section, "screensaverEnabled", payload["screensaverEnabled"], errors)
    if "screensaverIdleMs" in payload:
        num_in(section, "screensaverIdleMs", payload["screensaverIdleMs"], 10_000, 3_600_000, errors)
    if "scale" in payload:
        num_in(section, "scale", payload["scale"], 0.5, 5, errors)
    if "defaultMode" in payload:
        mode = payload["defaultMode"]
        if not isinstance(mode, str) or mode.strip() not in _SCREENSAVER_MODES:
            errors.append({"section": section, "key": "defaultMode", "message": "须为 clock / weather / random"})
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
        if k in payload:
            require_bool(section, k, payload[k], errors)
    if "brightness" in payload:
        num_in(section, "brightness", payload["brightness"], 0.3, 1, errors)
    if "timeSizeVw" in payload:
        num_in(section, "timeSizeVw", payload["timeSizeVw"], 4, 60, errors)
    if "sepSizeVw" in payload:
        num_in(section, "sepSizeVw", payload["sepSizeVw"], 1, 40, errors)
    if "secSizeVw" in payload:
        num_in(section, "secSizeVw", payload["secSizeVw"], 2, 30, errors)
    if "metaSizeVw" in payload:
        num_in(section, "metaSizeVw", payload["metaSizeVw"], 1, 20, errors)
    if "subMetaSizeVw" in payload:
        num_in(section, "subMetaSizeVw", payload["subMetaSizeVw"], 1, 20, errors)
    if "brandSizePx" in payload:
        num_in(section, "brandSizePx", payload["brandSizePx"], 8, 120, errors)
    if "brandTopVh" in payload:
        num_in(section, "brandTopVh", payload["brandTopVh"], 0, 50, errors)
    if "contentShiftVh" in payload:
        num_in(section, "contentShiftVh", payload["contentShiftVh"], -30, 30, errors)
    if "weatherTempSizeVw" in payload:
        num_in(section, "weatherTempSizeVw", payload["weatherTempSizeVw"], 4, 60, errors)
    if "weatherIconSizeVw" in payload:
        num_in(section, "weatherIconSizeVw", payload["weatherIconSizeVw"], 2, 40, errors)
    if "weatherStatsSizePx" in payload:
        num_in(section, "weatherStatsSizePx", payload["weatherStatsSizePx"], 8, 48, errors)


def validate_voice_commands_array(commands: Any, errors: list[FieldError] | None = None) -> list[FieldError]:
    errors = errors if errors is not None else []
    if not isinstance(commands, list):
        errors.append({"section": "voiceCommands", "key": "*", "message": "须为数组"})
        return errors
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
        if not domain or not _VOICE_DOMAIN_PATTERN.match(domain):
            errors.append({"section": "voiceCommands", "key": f"{prefix}.domain", "message": "须为有效 HA domain"})
        service = cmd["service"].strip() if isinstance(cmd.get("service"), str) else ""
        if not service or not _VOICE_DOMAIN_PATTERN.match(service):
            errors.append({"section": "voiceCommands", "key": f"{prefix}.service", "message": "须为有效 HA service"})
        if cmd.get("entityMatch") not in (None, "") and "entityMatch" in cmd:
            if not isinstance(cmd["entityMatch"], str):
                errors.append({"section": "voiceCommands", "key": f"{prefix}.entityMatch", "message": "须为字符串"})
        if cmd.get("serviceData") is not None and "serviceData" in cmd:
            if not isinstance(cmd["serviceData"], dict):
                errors.append({"section": "voiceCommands", "key": f"{prefix}.serviceData", "message": "须为对象"})
    return errors

def _validate_voice(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "sttMode" in payload and payload["sttMode"] not in ("browser", "ha", "auto"):
        errors.append({"section": section, "key": "sttMode", "message": "须为 browser | ha | auto"})
    if "ttsOutputMode" in payload and payload["ttsOutputMode"] not in ("local", "ha", "auto"):
        errors.append({"section": section, "key": "ttsOutputMode", "message": "须为 local | ha | auto"})
    if "dailyAdvisorSpeakHour" in payload:
        num_in(section, "dailyAdvisorSpeakHour", payload["dailyAdvisorSpeakHour"], 0, 23, errors)
    for k in ("ttsEnabled", "continuousConversation", "agentFallback"):
        if k in payload and not isinstance(payload[k], bool):
            errors.append({"section": section, "key": k, "message": "须为布尔值"})
    if "sttEntityId" in payload:
        validate_optional_entity_id(section, "sttEntityId", payload["sttEntityId"], errors)
    if "wakeWords" in payload:
        ww = payload["wakeWords"]
        if not isinstance(ww, list):
            errors.append({"section": section, "key": "wakeWords", "message": "必须为字符串数组"})
        else:
            for i, w in enumerate(ww):
                if not isinstance(w, str) or not w.strip():
                    errors.append({"section": section, "key": f"wakeWords[{i}]", "message": "唤醒词不能为空"})

def _validate_media_playlists(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    for player_id, val in payload.items():
        if not is_entity_id(player_id):
            errors.append({"section": section, "key": player_id, "message": "播放器键须为合法 entity_id"})
            break
        if not isinstance(val, dict):
            errors.append({"section": section, "key": player_id, "message": "须为 { items, index } 对象"})
            break
        if not isinstance(val.get("items"), list):
            errors.append({"section": section, "key": player_id, "message": "items 须为数组"})
            break
        if "index" in val:
            num_in(section, f"{player_id}.index", val["index"], 0, 10_000, errors)
