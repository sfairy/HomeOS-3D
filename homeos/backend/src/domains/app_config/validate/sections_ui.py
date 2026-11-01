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

#: 服务端 TTS 的语速 / 音调：``+10%`` / ``-5%`` / ``10``；音调同理，单位 Hz。
_TTS_RATE_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d+)?\s*%?$")
_TTS_PITCH_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d+)?\s*(?:Hz)?$", re.IGNORECASE)


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

#: 快捷指令条数上限：面板一行三条、四行封顶，再多就不是「快捷」而是一张清单。
AGENT_QUICK_PROMPT_MAX = 12
#: 按钮短文案上限（字）：超过会把 300px 停靠栏的 chip 挤到第三行。
AGENT_QUICK_PROMPT_LABEL_MAX = 12
#: 完整指令上限（字）：与前端输入框的 500 上限留足余量，只拦明显写错的粘贴。
AGENT_QUICK_PROMPT_TEXT_MAX = 120
#: 悬浮提示上限（字）。
AGENT_QUICK_PROMPT_HINT_MAX = 60


def _validate_agent_quick_prompt_item(
    section: str, index: int, item: Any, seen: set[str], errors: list[FieldError]
) -> None:
    """校验单条快捷指令；文本统一 strip 后判空 / 判长 / 判重。"""
    key = f"agentQuickPrompts[{index}]"
    if not isinstance(item, dict):
        errors.append({"section": section, "key": key, "message": "须为 { label, prompt, hint } 对象"})
        return
    label = str(item.get("label") or "").strip()
    prompt = str(item.get("prompt") or "").strip()
    hint = str(item.get("hint") or "").strip()
    if not label:
        errors.append({"section": section, "key": f"{key}.label", "message": "按钮文案不能为空"})
    elif len(label) > AGENT_QUICK_PROMPT_LABEL_MAX:
        errors.append(
            {"section": section, "key": f"{key}.label", "message": f"最多 {AGENT_QUICK_PROMPT_LABEL_MAX} 个字"}
        )
    if not prompt:
        errors.append({"section": section, "key": f"{key}.prompt", "message": "下发的指令不能为空"})
    elif len(prompt) > AGENT_QUICK_PROMPT_TEXT_MAX:
        errors.append(
            {"section": section, "key": f"{key}.prompt", "message": f"最多 {AGENT_QUICK_PROMPT_TEXT_MAX} 个字"}
        )
    elif prompt in seen:
        errors.append({"section": section, "key": f"{key}.prompt", "message": "同一条指令重复出现"})
    if hint and len(hint) > AGENT_QUICK_PROMPT_HINT_MAX:
        errors.append(
            {"section": section, "key": f"{key}.hint", "message": f"最多 {AGENT_QUICK_PROMPT_HINT_MAX} 个字"}
        )
    seen.add(prompt)


def _validate_agent_quick_prompts(section: str, payload: Any, errors: list[FieldError]) -> None:
    """校验智能管家快捷指令数组。

    ``[]`` 是合法值，语义是「不要这排快捷入口」（用户在设置里关掉），而不是「没配置」：
    字段缺省时才回落到内置默认，两者不能混为一谈。
    """
    if not isinstance(payload, list):
        errors.append({"section": section, "key": "agentQuickPrompts", "message": "须为数组"})
        return
    if len(payload) > AGENT_QUICK_PROMPT_MAX:
        errors.append(
            {"section": section, "key": "agentQuickPrompts", "message": f"最多 {AGENT_QUICK_PROMPT_MAX} 条"}
        )
    seen: set[str] = set()
    for index, item in enumerate(payload):
        _validate_agent_quick_prompt_item(section, index, item, seen, errors)


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
    if "agentQuickPrompts" in payload:
        _validate_agent_quick_prompts(section, payload["agentQuickPrompts"], errors)


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

def _validate_voice_server_tts(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    """服务端 TTS（智能管家播报）字段校验。

    这里只拦「明显写错」的值：语速/音调允许带或不带单位（``+10%`` / ``10``），
    因为设置页滑杆和历史数据两种形态都存在；真正解析时由后端归一。
    """
    if "ttsEngine" in payload and payload["ttsEngine"] not in ("edge", "openai"):
        errors.append({"section": section, "key": "ttsEngine", "message": "须为 edge | openai"})
    if "ttsRate" in payload and not _TTS_RATE_PATTERN.match(str(payload["ttsRate"] or "").strip()):
        errors.append({"section": section, "key": "ttsRate", "message": "须形如 +10% 或 -5%"})
    if "ttsPitch" in payload and not _TTS_PITCH_PATTERN.match(str(payload["ttsPitch"] or "").strip()):
        errors.append({"section": section, "key": "ttsPitch", "message": "须形如 +2Hz 或 -2Hz"})
    if "ttsApiBase" in payload:
        base = str(payload["ttsApiBase"] or "").strip()
        if base and not base.startswith(("http://", "https://")):
            errors.append({"section": section, "key": "ttsApiBase", "message": "须为 http(s) 地址"})
    for key in ("ttsVoice", "ttsFormat", "ttsModel", "ttsApiKey"):
        if key in payload and not isinstance(payload[key], str):
            errors.append({"section": section, "key": key, "message": "须为字符串"})


def _validate_voice(section: str, payload: dict[str, Any], errors: list[FieldError]) -> None:
    if "sttMode" in payload and payload["sttMode"] not in ("browser", "ha", "auto"):
        errors.append({"section": section, "key": "sttMode", "message": "须为 browser | ha | auto"})
    if "ttsOutputMode" in payload and payload["ttsOutputMode"] not in ("local", "ha", "auto"):
        errors.append({"section": section, "key": "ttsOutputMode", "message": "须为 local | ha | auto"})
    _validate_voice_server_tts(section, payload, errors)
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
