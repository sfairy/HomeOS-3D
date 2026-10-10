"""UI 布局密钥脱敏与合并（对齐 ``modules/ui-config/ha.util.ts``）。

阶段 3.3 起 layout 里**不再保存 HA 连接凭据**（地址 / 令牌单源在 ``ha_connections``
表，经 ``GET/PUT /ha/connection`` 读写）。剩下的职责只有两类：

- :func:`mask_layout_for_role`：按角色脱敏 Agent 密钥 / 通道密钥；
- :func:`merge_layout_secrets_on_save`：保存时若密钥为占位符 / 空值，保留库中真实值；
- :func:`strip_legacy_ha_connection`：清掉历史 layout 里遗留的 HA 连接字段。
"""

from __future__ import annotations

import copy
import json
from typing import Any

from ..app_config.constants import CONFIG_MASK_PLACEHOLDER
from ..app_config.mask import is_masked_value

_CHANNEL_SECRET_KEYS = ("corpSecret", "callbackToken", "callbackAesKey")

#: 旧版 layout.haConfig 中属于「连接凭据」的字段（3.3 起由 ``ha_connections`` 表持有）。
LEGACY_HA_CONNECTION_KEYS = ("url", "fallbackUrl", "token")


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


def strip_legacy_ha_connection(layout: Any) -> dict[str, Any]:
    """删除 layout.haConfig 中遗留的连接凭据字段，其余字段原样保留。

    这些键在 3.3 之前由 ``load_ha_endpoints`` 读取，现在只剩「迷惑后来者」和
    「把明文令牌继续留在库里」两个作用：读 / 写路径都过一遍这里，历史数据会在下次
    保存时自然消失（启动期另有一次性导入，见 ``services/ha_config.py``）。
    """
    out = copy.deepcopy(layout) if isinstance(layout, dict) else {}
    ha_config = out.get("haConfig")
    if isinstance(ha_config, dict):
        for key in LEGACY_HA_CONNECTION_KEYS:
            ha_config.pop(key, None)
    return out


def mask_layout_for_role(layout: dict[str, Any], role: str | None = None) -> dict[str, Any]:
    """输出给前端的 layout：清掉历史 HA 连接字段，并按角色脱敏其余密钥。

    Agent / 通道密钥一律脱敏（防止前端回写写穿）；HA 连接信息不在 layout 里，
    无需再区分角色。
    """
    out = strip_legacy_ha_connection(layout)
    _mask_agent_secrets(out.get("agentConfig"))
    _mask_channel_secrets(out.get("channelConfig"))
    return out


def merge_layout_secrets_on_save(incoming: Any, existing_layout: Any) -> dict[str, Any]:
    """保存时合并密钥：incoming 中为占位符 / 空值的敏感字段保留库中真实值。"""
    merged = strip_legacy_ha_connection(incoming)
    existing = _as_layout_object(existing_layout)
    if existing is None:
        return merged

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


__all__ = [
    "LEGACY_HA_CONNECTION_KEYS",
    "mask_layout_for_role",
    "merge_layout_secrets_on_save",
    "strip_legacy_ha_connection",
]
