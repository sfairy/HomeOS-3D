"""UI 布局密钥脱敏与合并（对齐 ``modules/ui-config/ha.util.ts``）。

layout 里**不保存 HA 连接凭据**（地址 / 令牌单源在 ``ha_connections`` 表，经
``GET/PUT /ha/connection`` 读写）。本模块只负责：

- :func:`mask_layout`：脱敏 Agent 密钥 / 通道密钥；
- :func:`merge_layout_secrets_on_save`：保存时若密钥为占位符 / 空值，保留库中真实值。
"""

from __future__ import annotations

import copy
import json
from typing import Any

from ..app_config.constants import CONFIG_MASK_PLACEHOLDER
from ..app_config.mask import is_masked_value

_CHANNEL_SECRET_KEYS = ("corpSecret", "callbackToken", "callbackAesKey")
_AGENT_SECRET_KEYS = ("apiKey", "mcpGatewaySecret")


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


def mask_layout(layout: dict[str, Any]) -> dict[str, Any]:
    """输出给前端的 layout：脱敏 Agent / 通道密钥（防止前端回写写穿）。"""
    out = copy.deepcopy(layout)
    _mask_agent_secrets(out.get("agentConfig"))
    _mask_channel_secrets(out.get("channelConfig"))
    return out


def _scrub_unresolved_masks(container: Any, keys: tuple[str, ...]) -> None:
    """库里没有真值可回填时，绝不能让脱敏占位符落库。

    前端拿到的是 ``••••••••``，保存时会原样回传表示「沿用旧值」；若该 profile
    根本没有旧值（新建方案 / 历史数据缺字段），占位符就会被当成真实密钥存下来，
    消费方还会把它判成「已配置」。统一清成空串，语义等于「未配置」。
    """
    if not isinstance(container, dict):
        return
    for key in keys:
        if is_masked_value(container.get(key)):
            container[key] = ""


def merge_layout_secrets_on_save(incoming: Any, existing_layout: Any) -> dict[str, Any]:
    """保存时合并密钥：incoming 中为占位符 / 空值的敏感字段保留库中真实值。"""
    merged = copy.deepcopy(incoming) if isinstance(incoming, dict) else {}
    existing = _as_layout_object(existing_layout)
    if existing is None:
        existing = {}

    incoming_agent = merged.get("agentConfig")
    existing_agent = existing.get("agentConfig")
    if isinstance(incoming_agent, dict):
        if isinstance(existing_agent, dict):
            for key in _AGENT_SECRET_KEYS:
                if _is_sensitive_value_skippable(incoming_agent.get(key)) and existing_agent.get(key):
                    incoming_agent[key] = existing_agent[key]
        incoming_agent.pop("apiKeyConfigured", None)
        _scrub_unresolved_masks(incoming_agent, _AGENT_SECRET_KEYS)

    incoming_ch = merged.get("channelConfig")
    existing_ch = existing.get("channelConfig")
    ch = incoming_ch if isinstance(incoming_ch, dict) else None
    old = existing_ch if isinstance(existing_ch, dict) else {}
    if ch is not None:
        email = ch.get("email")
        if (
            isinstance(email, dict)
            and _is_sensitive_value_skippable(email.get("smtpPassword"))
            and isinstance(old.get("email"), dict)
            and old["email"].get("smtpPassword")
        ):
            email["smtpPassword"] = old["email"]["smtpPassword"]
        webpush = ch.get("webpush")
        if (
            isinstance(webpush, dict)
            and _is_sensitive_value_skippable(webpush.get("vapidPrivateKey"))
            and isinstance(old.get("webpush"), dict)
            and old["webpush"].get("vapidPrivateKey")
        ):
            webpush["vapidPrivateKey"] = old["webpush"]["vapidPrivateKey"]
        wecom = ch.get("wecom")
        if isinstance(wecom, dict):
            old_wecom = old.get("wecom") if isinstance(old.get("wecom"), dict) else {}
            for key in _CHANNEL_SECRET_KEYS:
                if _is_sensitive_value_skippable(wecom.get(key)) and old_wecom.get(key):
                    wecom[key] = old_wecom[key]
            _scrub_unresolved_masks(wecom, _CHANNEL_SECRET_KEYS)
        if isinstance(email, dict):
            _scrub_unresolved_masks(email, ("smtpPassword",))
        if isinstance(webpush, dict):
            _scrub_unresolved_masks(webpush, ("vapidPrivateKey",))
    return merged


__all__ = [
    "mask_layout",
    "merge_layout_secrets_on_save",
]
