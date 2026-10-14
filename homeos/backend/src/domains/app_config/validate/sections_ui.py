"""界面分区校验：frontend / ui / screensaver / 场景 / 天气特效 / 语音 / 播放列表。"""

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
        num_in(
            section,
            "rebuildDebounceMs",
            p["rebuildDebounceMs"],
            REBUILD_DEBOUNCE_MS_MIN,
            REBUILD_DEBOUNCE_MS_MAX,
            e,
        )
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
