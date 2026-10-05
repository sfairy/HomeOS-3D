"""高危设备拦截规则。

职责：定义语音控制场景下严禁直接操作的设备域 / 服务 / 实体特征，
 供 HomeToolsService 在 control_device / control_room 前做安全校验。
设计原则：门锁、安防撤防、燃气阀、车库门/大门等不应被一句话直接控制，
 需引导用户在手机 App 上二次确认。
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class HighRiskRule:
    """按域 + 服务匹配的高危规则；services 为空表示该域下所有服务都禁。"""

    domain: str
    services: tuple[str, ...] = ()
    reason: str = ""


#: 按域 + 服务匹配的高危规则；services 为空表示该域下所有服务都禁
HIGH_RISK_RULES: tuple[HighRiskRule, ...] = (
    HighRiskRule(domain="lock", services=(), reason="门锁操作"),
    HighRiskRule(
        domain="alarm_control_panel",
        services=("alarm_disarm", "alarm_trigger"),
        reason="安防撤防 / 紧急触发",
    ),
    # scene / script / automation 内部动作无法静态审计（可能包含撤防、开阀、开门等危险联动），
    # 语音 / LLM 链路一律拦截，引导用户在 App 二次确认。
    #
    # 注意：这三条必须用「空 services」按**整个域**拦截，不能只列 turn_on / activate / run。
    # 否则同域的其它服务会绕过闸门：例如 script.toggle（脚本关闭时 toggle 即执行）、
    # script.turn_off、script.reload、scene.apply，实测全部返回 blocked=false，
    # 等于把「默认全禁」的白名单策略打穿。
    HighRiskRule(domain="scene", services=(), reason="场景触发（可能含任意联动动作）"),
    HighRiskRule(domain="script", services=(), reason="脚本执行（可能含任意联动动作）"),
    HighRiskRule(domain="automation", services=(), reason="自动化触发（可能含任意联动动作）"),
    HighRiskRule(domain="siren", services=(), reason="警笛控制"),
)

#: 实体 ID 含这些关键词时视为高危（燃气阀、总闸等）
HIGH_RISK_ENTITY_HINTS: tuple[str, ...] = ("gas", "valve", "燃气", "阀门", "总闸")

#: 会被白名单闸门接管的域：automation 不在其中，保持永久拦截
SCENE_VOICE_DOMAINS = frozenset({"scene", "script"})

#: cover 域下疑似车库门 / 大门的关键词（中英文 + 拼音）
GARAGE_GATE_HINTS: tuple[str, ...] = (
    "garage",
    "che_ku",
    "车库",
    "gate",
    "da_men",
    "大门",
    "yuan_men",
    "院门",
    "men_kai",
)

#: cover 域下会被判定为“开门”的服务名
COVER_OPEN_SERVICES: tuple[str, ...] = ("open_cover", "open")

#: control_room 空 domain（“打开全屋设备”）时允许批量控制的“安全”域白名单
SAFE_BULK_CONTROL_DOMAINS = frozenset(
    {
        "light",
        "fan",
        "climate",
        "media_player",
        "vacuum",
        "humidifier",
        "air_purifier",
        "dehumidifier",
        "fan_fresh_air",
    }
)


@dataclass
class SceneVoiceControlGate:
    """场景 / 脚本的语音控制白名单闸门。

    由 AgentConfigService.get_scene_voice_control() 读取（layout.agentConfig.sceneVoiceControl），
    默认为「未启用 + 空清单」，即 fail-closed。
    """

    #: 是否启用场景语音控制总开关
    enabled: bool = False
    #: 允许语音触发的实体 ID 白名单（已统一小写，便于比对）
    allow: frozenset[str] = field(default_factory=frozenset)


def is_scene_voice_allowed(
    domain: str,
    entity_id: str,
    gate: SceneVoiceControlGate | None = None,
) -> bool:
    """判断某个场景 / 脚本是否被用户显式授权语音触发。

    仅当域为 scene / script、总开关已启用、且实体 ID 命中白名单时才放行。
    """
    if domain not in SCENE_VOICE_DOMAINS:
        return False
    if not gate or not gate.enabled:
        return False
    ident = str(entity_id or "").strip().lower()
    return bool(ident) and ident in gate.allow


def is_high_risk(
    domain: str,
    service: str,
    entity_id: str,
    service_data: Mapping[str, Any] | None = None,
    scene_voice: SceneVoiceControlGate | None = None,
) -> dict[str, Any]:
    """判定一次控制是否命中高危规则。

    返回 ``{"blocked": bool, "reason"?: str}``。
    """
    ident = str(entity_id or "").lower()
    # 1) 命中域 + 服务规则（如 lock 全禁、alarm_control_panel.alarm_disarm/alarm_trigger）
    for rule in HIGH_RISK_RULES:
        if rule.domain == domain and (not rule.services or service in rule.services):
            # scene / script：仅在用户白名单内放行；automation 一律拦截
            if is_scene_voice_allowed(domain, entity_id, scene_voice):
                continue
            return {"blocked": True, "reason": rule.reason}
    # 2) cover 域开门/开到位服务 + 实体名疑似车库门/大门
    #    set_cover_position 的 position≈100 等效开门，也须拦截
    try:
        position = float((service_data or {}).get("position"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        position = float("nan")
    cover_opens_fully = service in COVER_OPEN_SERVICES or (
        service == "set_cover_position" and position >= 95
    )
    if domain == "cover" and cover_opens_fully:
        if any(hint.lower() in ident for hint in GARAGE_GATE_HINTS):
            return {"blocked": True, "reason": "车库门/大门开启"}
    # 3) 实体 ID 含燃气/阀门/总闸等高危关键词
    if any(hint.lower() in ident for hint in HIGH_RISK_ENTITY_HINTS):
        return {"blocked": True, "reason": "疑似燃气阀/总闸等高危设备"}
    return {"blocked": False}
