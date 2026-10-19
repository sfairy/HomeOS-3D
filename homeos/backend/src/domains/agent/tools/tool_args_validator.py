"""工具参数安全校验。"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

#: entity_id 格式正则：domain.entity，domain 与 entity 均为小写字母/数字/下划线
ENTITY_ID_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*\.[a-z0-9_]+$")

#: service_data 白名单字段：仅允许常见的 HA 服务安全参数。
#: 危险字段（如 entity_id / service / domain / token / password 等）会被过滤，
#: 防止 LLM 通过 service_data 注入覆盖目标实体或服务，或注入敏感凭证字段。
SERVICE_DATA_ALLOWED_FIELDS = frozenset(
    {
        # 温度 / 湿度
        "temperature",
        "target_temp_high",
        "target_temp_low",
        "humidity",
        # 空调模式
        "hvac_mode",
        "fan_mode",
        "swing_mode",
        "preset_mode",
        "aux_heat",
        # 灯光
        "brightness",
        "brightness_pct",
        "color_temp",
        "color_temp_kelvin",
        "rgb_color",
        "xy_color",
        "hs_color",
        "effect",
        "flash",
        "transition",
        # 窗帘 / 遮罩
        "position",
        "tilt_position",
        "current_position",
        # 媒体播放器
        "volume",
        "volume_level",
        "is_volume_muted",
        "media_content_id",
        "media_content_type",
        "media_position",
        "media_seek_position",
        # 风扇
        "percentage",
        "percentage_step",
        "direction",
        # 扫地机
        "mode",
        "fan_speed",
        # 通用
        "duration",
        "delay",
        "value",
    }
)

#: 按 domain 额外放行的 service_data 字段（`code` 只对需要口令的域生效）。
#:
#: HA 的 ``alarm_control_panel.alarm_arm_*`` / ``lock.*`` 需要 ``code`` 参数，但 ``code``
#: 属于凭证类字段，不能进全局白名单——否则 LLM 可以把它塞进任何域的调用里。
#: 这里按实体实际 domain 精确放行，跨域调用仍会被过滤掉。
DOMAIN_SERVICE_DATA_FIELDS: dict[str, frozenset[str]] = {
    "alarm_control_panel": frozenset({"code"}),
    "lock": frozenset({"code"}),
}

#: 单次 ``code`` 参数的最大长度（防止把超长文本塞进 HA 调用）
MAX_ACCESS_CODE_LENGTH = 64



def validate_entity_id(entity_id: str) -> dict[str, Any]:
    """校验 entity_id 格式是否合法（必须为 domain.entity 格式）。

    返回 ``{"valid": bool, "error"?: str}``。
    """
    ident = str(entity_id or "").strip()
    if not ident:
        return {"valid": False, "error": "entity_id 不能为空"}
    if not ENTITY_ID_PATTERN.match(ident):
        return {"valid": False, "error": f"entity_id 格式非法（应为 domain.entity）: {ident}"}
    return {"valid": True}


def extract_domain(entity_id: str) -> str:
    """从 entity_id 提取 domain（点号前的部分）。

    用于安全校验：以 entity_id 自身的 domain 为准，而非 LLM 传入的 domain 参数，
    防止 LLM 伪造 domain 绕过 is_high_risk 高危设备拦截。
    """
    ident = str(entity_id or "").strip()
    idx = ident.find(".")
    return ident[:idx] if idx > 0 else ""


def sanitize_service_data(
    data: Mapping[str, Any] | None,
    domain: str | None = None,
) -> dict[str, Any] | None:
    """对 service_data 做白名单字段过滤，仅保留已知安全字段。

    ``domain`` 用于按实体实际域放行少量专属字段（目前仅 ``alarm_control_panel`` /
    ``lock`` 的 ``code``）。跨域调用（例如把 ``code`` 塞进 ``light.turn_on``）仍会被过滤，
    避免 LLM 借 service_data 注入凭证类参数。

    无安全字段时返回 None。
    """
    if not data or not isinstance(data, Mapping):
        return None
    extra = DOMAIN_SERVICE_DATA_FIELDS.get(str(domain or "").strip().lower(), frozenset())
    result: dict[str, Any] = {}
    for key, value in data.items():
        if key in SERVICE_DATA_ALLOWED_FIELDS:
            result[key] = value
            continue
        if key in extra:
            # code 只接受短字符串 / 整数：拒绝嵌套对象与超长文本
            if isinstance(value, bool) or not isinstance(value, (str, int)):
                continue
            text = str(value).strip()
            if text:
                result[key] = text[:MAX_ACCESS_CODE_LENGTH]
    return result or None
