"""``home_tools`` 工具集的模块级原语：属性脱敏、JS 语义小工具与查询正则。"""

from __future__ import annotations

import json
import logging
import math
import re
from typing import Any

from ....platform.core.http.errors import BusinessException

logger = logging.getLogger("homeos.agent.home_tools")

#: 实体属性中含凭证/密钥特征的字段：返回给 LLM 前剔除，避免敏感信息外泄。
#: HA 部分集成（媒体播放器 / 摄像头等）会在 attributes 暴露 access_token 等字段。
SENSITIVE_ATTRIBUTE_KEYS = frozenset(
    {
        "access_token",
        "refresh_token",
        "auth_token",
        "api_token",
        "api_key",
        "apikey",
        "token",
        "secret",
        "password",
        "passwd",
        "private_key",
        "certificate",
        "credentials",
    }
)

#: 单个属性值序列化后允许的最大长度：超出截断，防止大列表属性撑爆 LLM 上下文
MAX_ATTRIBUTE_VALUE_LENGTH = 500

#: control_room 的“全屋”语义判定
WHOLE_HOME_QUERY = re.compile(
    r"全屋|整屋|全家|所有房间|全部房间|整个家|全部区域|所有区域|"
    r"whole house|whole home|all rooms|everywhere|entire house|entire home",
    re.IGNORECASE,
)

#: 场景 / 脚本名称解析：剥离动作词与类别后缀
SCENE_QUERY_ACTION_PREFIX = re.compile(
    r"^(执行|激活|启动|运行|开启|打开|触发|触发一下|run|activate|start|execute|turn on)\s*"
)
SCENE_QUERY_CATEGORY_SUFFIX = re.compile(r"(场景|模式|脚本|scene|script|mode)\s*$")

#: media_control 的 action → HA 服务映射
MEDIA_ACTION_SERVICES: dict[str, str] = {
    "play": "media_play",
    "pause": "media_pause",
    "stop": "media_stop",
    "next": "media_next_track",
    "previous": "media_previous_track",
    "volume": "volume_set",
}


def _s(value: Any) -> str:
    """对齐 JS ``String(value ?? '')``：None → 空串，其余转字符串。"""
    return "" if value is None else str(value)


def _or(value: Any, default: Any) -> Any:
    """对齐 JS ``value ?? default``：仅 None / 缺失时回退。"""
    return default if value is None else value


def _math_round(value: float) -> int:
    """对齐 JS ``Math.round``（.5 向 +∞ 取整，非 Python 的银行家舍入）。"""

    return math.floor(value + 0.5)


def _js_stringify(value: Any) -> str | None:
    """对齐 JS ``JSON.stringify``（序列化失败返回 None，等价 undefined）。"""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        return None


def _error_message(exc: BaseException, fallback: str = "") -> str:
    """对齐 Nest ``getErrorMessage``：取异常 message，空则用兜底文案。"""
    text = str(exc or "").strip()
    if not text and isinstance(exc, BusinessException):
        text = str(exc.message or "").strip()
    return text or fallback


def sanitize_entity_attributes(
    attrs: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """清理实体属性：剔除凭证字段，截断超长值。"""
    if attrs is None:
        return attrs
    out: dict[str, Any] = {}
    for key, value in attrs.items():
        if key in SENSITIVE_ATTRIBUTE_KEYS:
            continue
        serialized = _js_stringify(value)
        if serialized and len(serialized) > MAX_ATTRIBUTE_VALUE_LENGTH:
            out[key] = f"{serialized[:MAX_ATTRIBUTE_VALUE_LENGTH]}…(截断)"
        else:
            out[key] = value
    return out
