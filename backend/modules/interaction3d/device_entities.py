"""通用设备（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植）的实体能力词表。

设备弹窗的前端要把「这个实体能下什么命令」渲染成按钮，后端要按同一条词表复核
命令是否被允许 —— 两侧读同一份 DOMAIN_CAPABILITIES，避免再各写一张表、各漂移一点。

能力按 **域** 而不是按实体声明：HA 里同一个域能接收的服务是固定的（switch 能
turn_on/turn_off，number 能 set_value……），而 supported_features 只用来判断
「这台设备是否真的实现了这个能力」，两件事分开看。
"""
from __future__ import annotations

# 域 -> 该域允许的控制能力。空元组表示只读域（sensor / binary_sensor），
# 出现在这里而不是被漏掉，是为了让「只读」成为一个显式结论而不是查表失败。
DOMAIN_CAPABILITIES: dict[str, tuple[str, ...]] = {
    "switch": ("toggle",),
    "input_boolean": ("toggle",),
    "light": ("toggle",),
    "select": ("select",),
    "input_select": ("select",),
    "number": ("number",),
    "input_number": ("number",),
    "button": ("press",),
    "input_button": ("press",),
    "climate": ("climate",),
    "fan": ("fan",),
    "cover": ("cover",),
    "media_player": ("media_player",),
    "sensor": (),
    "binary_sensor": (),
}


def entity_capabilities(entity_id: str, domain: str, attributes) -> dict:
    """描述一个实体能做什么，供前端决定渲染哪些控件。

    参数:
        entity_id: 实体 ID；domain 为空时从它的前缀推断。
        attributes: HA 属性表；非字典（None、缺省）按空表处理。
    """
    # 调用方可能只拿到实体 ID，域由前缀解析；显式传域时以显式值优先。
    resolved = domain or entity_id.partition(".")[0]
    attrs = attributes if isinstance(attributes, dict) else {}
    supported = attrs.get("supported_features")
    return {
        "entityId": entity_id,
        "domain": resolved,
        "capabilities": list(DOMAIN_CAPABILITIES.get(resolved, ())),
        "writable": bool(DOMAIN_CAPABILITIES.get(resolved, ())),
        "readable": True,
        # bool 是 int 的子类必须排除；上报成字符串的位掩码在这里一律按 0 处理，
        # 让「不确定」表现为「没有额外能力」而不是随机放行。
        "supportedFeatures": supported
        if isinstance(supported, int) and not isinstance(supported, bool)
        else 0,
    }


def device_entity_ids(entities, device_id: str) -> list[str]:
    """挑出归属某台设备的实体 ID，去重并排序。

    兼容两种键名（entityId / entity_id、deviceId / device_id）：HA 侧与面板侧的
    命名习惯不同，本函数是两者交汇处，因此两种都认。空 ID 直接丢弃 ——
    它代表「尚未绑定」，不是一个可用的实体。
    """
    return sorted(
        {
            entity.get("entityId") or entity.get("entity_id")
            for entity in entities
            if (entity.get("deviceId") or entity.get("device_id")) == device_id
            and (entity.get("entityId") or entity.get("entity_id"))
        }
    )
