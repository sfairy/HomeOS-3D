#!/usr/bin/env python3
"""公开配置自检：免鉴权的 ``/api/v1/system/config/public`` 不得下发任何凭据。

背景：``PUBLIC_CONFIG_SECTIONS`` 把 ``voice`` 当成「可公开」分区，而 ``get_public()``
直接 ``deepcopy`` 了整段配置 —— ``voice.ttsApiKey``（供应商凭据，可被直接计费）与
``voice.ttsApiBase``（内网地址）因此对任何能连到端口的人可见。管理员 GET 走的
``get_all()`` 有脱敏，公开接口绕过了它。

本自检钉住三件事：

- 公开载荷里不再出现 ``ttsApiKey`` / ``ttsApiBase``，且原文不出现在序列化结果里；
- 只暴露 ``ttsConfigured`` 布尔值（配置有没有配好），不暴露值本身；
- 兜底脱敏生效：将来分区的任意 password/token/secret/apiKey/webhook 一类键都会被遮蔽。

用法：
    node ops/lib/py.mjs ops/checks/public_config_selftest.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.app_config.constants import CONFIG_MASK_PLACEHOLDER
from homeos.backend.src.domains.app_config.service import AppConfigService

CHECKS: list[str] = []

SENSITIVE_FIELD_RE = re.compile(r"password|token|secret|apikey|webhook|key$", re.IGNORECASE)

SECRET_KEY = "sk-live-should-never-leak-9f2a"
SECRET_BASE = "http://10.9.8.7:8080/v1"
SECRET_WEBHOOK = "https://hooks.example.invalid/T000/B000/abcdef"


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败：{detail}")
    CHECKS.append(name)


def _service_with(voice_patch: dict, voice_commands: list | None = None) -> AppConfigService:
    """只构造内存态服务：``get_public`` 不碰 DB。"""
    service = AppConfigService(session_factory=lambda: None)
    voice = service._config.setdefault("voice", {})
    voice.update(voice_patch)
    if voice_commands is not None:
        service._config["voiceCommands"] = voice_commands
    return service


def test_voice_secrets_not_public() -> None:
    service = _service_with(
        {"ttsApiKey": SECRET_KEY, "ttsApiBase": SECRET_BASE, "ttsEngine": "openai", "ttsVoice": "alloy"},
        voice_commands=[{"label": "开灯", "webhook": SECRET_WEBHOOK}],
    )
    payload = service.get_public()
    voice = payload.get("voice") or {}
    serialized = json.dumps(payload, ensure_ascii=False)

    check("公开配置: 不含 ttsApiKey 键", "ttsApiKey" not in voice)
    check("公开配置: 不含 ttsApiBase 键", "ttsApiBase" not in voice)
    check("公开配置: 原文不出现", SECRET_KEY not in serialized and SECRET_BASE not in serialized)
    check("公开配置: webhook 原文不出现", SECRET_WEBHOOK not in serialized)
    check("公开配置: ttsConfigured 为 True", voice.get("ttsConfigured") is True)
    # 公开分区里仍有前端需要的字段（避免为了脱敏把功能删掉）
    check("公开配置: 保留 ttsEngine", voice.get("ttsEngine") == "openai")
    check("公开配置: 保留 ttsVoice", voice.get("ttsVoice") == "alloy")


def test_empty_key_reports_not_configured() -> None:
    service = _service_with({"ttsApiKey": "", "ttsApiBase": ""})
    voice = service.get_public().get("voice") or {}
    check("公开配置: 空密钥时 ttsConfigured 为 False", voice.get("ttsConfigured") is False)


def test_mask_fallback_covers_future_keys() -> None:
    service = _service_with({"ttsApiKey": SECRET_KEY})
    # 模拟将来有人在公开分区里加了新的凭据字段
    service._config["frontend"]["futureAccessToken"] = "tok_abc123"
    service._config["ui"]["webhookUrl"] = SECRET_WEBHOOK
    payload = service.get_public()
    frontend = payload.get("frontend") or {}
    ui = payload.get("ui") or {}
    check("兜底脱敏: token 类键被遮蔽", frontend.get("futureAccessToken") == CONFIG_MASK_PLACEHOLDER)
    check("兜底脱敏: webhook 类键被遮蔽", ui.get("webhookUrl") == CONFIG_MASK_PLACEHOLDER)
    check("兜底脱敏: 原文不出现", "tok_abc123" not in json.dumps(payload, ensure_ascii=False))


def test_no_sensitive_value_survives_anywhere() -> None:
    service = _service_with(
        {"ttsApiKey": SECRET_KEY, "ttsApiBase": SECRET_BASE},
        voice_commands=[{"label": "播报", "secret": "s3cr3t", "apiKey": "k-123"}],
    )
    payload = service.get_public()

    def walk(node, path="") -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                key_text = str(key)
                if (
                    SENSITIVE_FIELD_RE.search(key_text)
                    and isinstance(value, str)
                    and value
                    and value != CONFIG_MASK_PLACEHOLDER
                ):
                    raise AssertionError(f"敏感键未被脱敏：{path}.{key_text}={value!r}")
                walk(value, f"{path}.{key_text}")
        elif isinstance(node, list):
            for index, item in enumerate(node):
                walk(item, f"{path}[{index}]")

    walk(payload)
    CHECKS.append("公开配置: 递归扫描无未脱敏敏感值")


def main() -> int:
    test_voice_secrets_not_public()
    test_empty_key_reports_not_configured()
    test_mask_fallback_covers_future_keys()
    test_no_sensitive_value_survives_anywhere()
    print(f"公开配置自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
