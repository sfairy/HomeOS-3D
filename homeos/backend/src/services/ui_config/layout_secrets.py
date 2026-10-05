"""UI 布局密钥脱敏与合并（对齐 ``modules/ui-config/ha.util.ts``）。

- :func:`mask_layout_for_role`：按角色脱敏 HA token / Agent 密钥 / 通道密钥；
- :func:`merge_layout_secrets_on_save`：保存时若密钥为占位符 / 空值，保留库中真实值；
- :func:`extract_ha_config_fingerprint`：提取 HA 连接指纹用于判断是否需要重连。
"""

from __future__ import annotations

import copy
import json
from typing import Any

from ..app_config.constants import CONFIG_MASK_PLACEHOLDER
from ..app_config.mask import is_masked_value

_CHANNEL_SECRET_KEYS = ("corpSecret", "callbackToken", "callbackAesKey")


def _is_sensitive_value_skippable(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return is_masked_value(value)


def _as_layout_object(layout: Any) -> dict[str, Any] | None:
    if isinstance(layout, str):
        try:
            parsed = json.loads(layout)
        except (TypeError, ValueError):
            return None
        return parsed if isinstance(parsed, dict) else None
    if isinstance(layout, dict):
        return layout
    return None


def _mask_agent_secrets(agent_config: Any) -> None:
    if not isinstance(agent_config, dict):
        return
    api_key = agent_config.get("apiKey")
    had_key = api_key is not None and str(api_key) != "" and not is_masked_value(api_key)
    if api_key is not None and str(api_key) != "":
        agent_config["apiKey"] = CONFIG_MASK_PLACEHOLDER
    secret = agent_config.get("mcpGatewaySecret")
    if secret is not None and str(secret) != "":
        agent_config["mcpGatewaySecret"] = CONFIG_MASK_PLACEHOLDER
    agent_config["apiKeyConfigured"] = bool(had_key or agent_config.get("apiKeyConfigured"))


def _mask_channel_secrets(channel_config: Any) -> None:
    if not isinstance(channel_config, dict):
        return
    email = channel_config.get("email")
    if isinstance(email, dict) and email.get("smtpPassword"):
        email["smtpPassword"] = CONFIG_MASK_PLACEHOLDER
    webpush = channel_config.get("webpush")
    if isinstance(webpush, dict) and webpush.get("vapidPrivateKey"):
        webpush["vapidPrivateKey"] = CONFIG_MASK_PLACEHOLDER
    wecom = channel_config.get("wecom")
    if isinstance(wecom, dict):
        for key in _CHANNEL_SECRET_KEYS:
            if wecom.get(key):
                wecom[key] = CONFIG_MASK_PLACEHOLDER


def _mask_layout_secrets(layout: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(layout)
    ha_config = out.get("haConfig")
    if isinstance(ha_config, dict) and ha_config.get("token") is not None and str(ha_config["token"]) != "":
        ha_config["token"] = CONFIG_MASK_PLACEHOLDER
    _mask_agent_secrets(out.get("agentConfig"))
    _mask_channel_secrets(out.get("channelConfig"))
    return out


def mask_layout_for_role(layout: dict[str, Any], role: str | None = None) -> dict[str, Any]:
    """按角色决定是否脱敏 layout 中的密钥。

    admin 保留 HA token 明文以便连接配置编辑；Agent / 通道密钥一律脱敏（防止前端回写写穿）。
    """
    if role == "admin":
        out = copy.deepcopy(layout)
        _mask_agent_secrets(out.get("agentConfig"))
        _mask_channel_secrets(out.get("channelConfig"))
        return out
    return _mask_layout_secrets(layout)


def merge_layout_secrets_on_save(incoming: Any, existing_layout: Any) -> dict[str, Any]:
    """保存时合并密钥：incoming 中为占位符 / 空值的敏感字段保留库中真实值。"""
    merged = copy.deepcopy(incoming) if isinstance(incoming, dict) else {}
    existing = _as_layout_object(existing_layout)
    if existing is None:
        return merged

    incoming_ha = merged.get("haConfig")
    existing_ha = existing.get("haConfig")
    if (
        isinstance(incoming_ha, dict)
        and _is_sensitive_value_skippable(incoming_ha.get("token"))
        and isinstance(existing_ha, dict)
        and existing_ha.get("token")
    ):
        incoming_ha["token"] = existing_ha["token"]

    incoming_agent = merged.get("agentConfig")
    existing_agent = existing.get("agentConfig")
    if isinstance(incoming_agent, dict) and isinstance(existing_agent, dict):
        for key in ("apiKey", "mcpGatewaySecret"):
            if _is_sensitive_value_skippable(incoming_agent.get(key)) and existing_agent.get(key):
                incoming_agent[key] = existing_agent[key]
        incoming_agent.pop("apiKeyConfigured", None)
    elif isinstance(incoming_agent, dict):
        incoming_agent.pop("apiKeyConfigured", None)

    incoming_ch = merged.get("channelConfig")
    existing_ch = existing.get("channelConfig")
    if isinstance(incoming_ch, dict) and isinstance(existing_ch, dict):
        email = incoming_ch.get("email")
        if (
            isinstance(email, dict)
            and _is_sensitive_value_skippable(email.get("smtpPassword"))
            and isinstance(existing_ch.get("email"), dict)
            and existing_ch["email"].get("smtpPassword")
        ):
            email["smtpPassword"] = existing_ch["email"]["smtpPassword"]
        webpush = incoming_ch.get("webpush")
        if (
            isinstance(webpush, dict)
            and _is_sensitive_value_skippable(webpush.get("vapidPrivateKey"))
            and isinstance(existing_ch.get("webpush"), dict)
            and existing_ch["webpush"].get("vapidPrivateKey")
        ):
            webpush["vapidPrivateKey"] = existing_ch["webpush"]["vapidPrivateKey"]
        wecom = incoming_ch.get("wecom")
        if isinstance(wecom, dict) and isinstance(existing_ch.get("wecom"), dict):
            for key in _CHANNEL_SECRET_KEYS:
                if _is_sensitive_value_skippable(wecom.get(key)) and existing_ch["wecom"].get(key):
                    wecom[key] = existing_ch["wecom"][key]
    return merged


def extract_ha_config_fingerprint(layout: Any) -> str:
    """从 layout 提取 HA 连接指纹（``url|fallback|token``）；空 / 非法返回空串。"""
    if layout is None or layout == "":
        return ""
    parsed = _as_layout_object(layout)
    if parsed is None:
        return ""
    ha = parsed.get("haConfig")
    if not isinstance(ha, dict):
        return ""
    url = ha.get("url")
    token = ha.get("token")
    if not url or not token:
        return ""
    fallback = str(ha.get("fallbackUrl") or "").strip().rstrip("/")
    return f"{str(url).rstrip('/')}|{fallback}|{token}"


__all__ = [
    "extract_ha_config_fingerprint",
    "mask_layout_for_role",
    "merge_layout_secrets_on_save",
]
