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

#: 含密钥的 layout 子对象路径 → 其中需要占位符回填的字段。
#: 顺序有意义：先父段后子段，父段整段沿用后子段仍会各自做回填 / 清洗。
_SECRET_PATHS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("agentConfig",), _AGENT_SECRET_KEYS),
    (("channelConfig", "email"), ("smtpPassword",)),
    (("channelConfig", "webpush"), ("vapidPrivateKey",)),
    (("channelConfig", "wecom"), _CHANNEL_SECRET_KEYS),
)


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


def _sub_object(container: Any, key: str) -> dict[str, Any] | None:
    """取子对象；不是对象（含缺失）返回 ``None``。"""
    if not isinstance(container, dict):
        return None
    value = container.get(key)
    return value if isinstance(value, dict) else None


def _ensure_object(container: dict[str, Any], key: str) -> dict[str, Any]:
    """取可写子对象；缺失或类型不对时建一个空对象（旧值非对象说明调用方要换掉它）。"""
    existing = _sub_object(container, key)
    if existing is not None:
        return existing
    created: dict[str, Any] = {}
    container[key] = created
    return created


def _walk_path(
    root: dict[str, Any], path: tuple[str, ...], *, create: bool
) -> dict[str, Any] | None:
    """沿 ``path`` 下钻；``create=False`` 时任一环缺失即返回 ``None``。"""
    node = root
    for key in path:
        child = _sub_object(node, key)
        if child is None:
            if not create:
                return None
            child = _ensure_object(node, key)
        node = child
    return node


def _carry_over_missing_secrets(
    merged: dict[str, Any], existing: dict[str, Any]
) -> None:
    """incoming 没提到的密钥子对象，整段沿用库中旧值。

    保存是**整份覆盖**（``save_config`` 直接 ``json.dumps`` 落库），所以 incoming 里
    缺失的段就等于「删掉这一段」。旧实现只在 incoming **已有**该对象时回填密钥，
    于是「只提交 pages 的局部 payload」会把 ``agentConfig`` / ``channelConfig``
    整段抹掉 —— Agent Key、MCP 网关密钥、SMTP / VAPID / 企微凭据一次性丢失，
    且没有版本历史可回滚。这里把「未提及」按「沿用旧值」处理；

    真的要清空某段，必须显式传该段（传 ``{}`` 或把密钥置空串）。
    """
    for path, _keys in _SECRET_PATHS:
        if _walk_path(merged, path, create=False) is not None:
            continue
        saved = _walk_path(existing, path, create=False)
        if saved is None:
            continue
        parent = _walk_path(merged, path[:-1], create=True)
        if parent is None:  # pragma: no cover - path[:-1] 为 () 时不会发生
            continue
        parent[path[-1]] = copy.deepcopy(saved)


def _merge_secret_keys(
    target: dict[str, Any], saved: dict[str, Any] | None, keys: tuple[str, ...]
) -> None:
    """占位符 / 空值回填库中真值，仍无真值的占位符清成空串。"""
    if saved is not None:
        for key in keys:
            if _is_sensitive_value_skippable(target.get(key)) and saved.get(key):
                target[key] = saved[key]
    _scrub_unresolved_masks(target, keys)


def _drop_display_only_flags(merged: dict[str, Any]) -> None:
    """``apiKeyConfigured`` 只是脱敏后的展示态，由读路径按真值重新推导，不入库。"""
    agent = _sub_object(merged, "agentConfig")
    if agent is not None:
        agent.pop("apiKeyConfigured", None)


def merge_layout_secrets_on_save(incoming: Any, existing_layout: Any) -> dict[str, Any]:
    """保存时合并密钥：incoming 中为占位符 / 空值的敏感字段保留库中真实值。

    同时保证 incoming **未提及**的密钥段沿用库中旧值（见
    :func:`_carry_over_missing_secrets`）：整份覆盖语义下，「没提到」不能等于「删掉」。
    """
    merged = copy.deepcopy(incoming) if isinstance(incoming, dict) else {}
    existing = _as_layout_object(existing_layout) or {}
    _carry_over_missing_secrets(merged, existing)
    for path, keys in _SECRET_PATHS:
        target = _walk_path(merged, path, create=False)
        if target is None:
            continue
        _merge_secret_keys(target, _walk_path(existing, path, create=False), keys)
    _drop_display_only_flags(merged)
    return merged


__all__ = [
    "mask_layout",
    "merge_layout_secrets_on_save",
]
