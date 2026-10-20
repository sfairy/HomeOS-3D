"""应用配置校验的异常与原子原语（对齐 ``shared/app-config/validate/primitives.util.ts``）。"""

from __future__ import annotations

import math
import re
from typing import Any

from ....platform.core.errors import ConfigValidationError

FieldError = dict[str, str]


class AppConfigValidationError(ConfigValidationError):
    """配置字段校验异常：携带字段级错误数组，序列化为 400 响应体。

    对齐 Nest ``AppConfigValidationError extends BadRequestException``：消息为
    ``section.key: message`` 的分号拼接摘要，响应 ``error`` 为类名。
    """

    def __init__(self, field_errors: list[FieldError]) -> None:
        self.field_errors = field_errors
        summary = "; ".join(
            f"{e.get('section', '')}.{e.get('key', '')}: {e.get('message', '')}"
            for e in field_errors
        )
        super().__init__(summary)
        self.message = summary


# 原子校验工具（primitives.util.ts）
_ENTITY_ID_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$", re.IGNORECASE)

def num_in(
    section: str,
    key: str,
    val: Any,
    min_val: float,
    max_val: float | None,
    errors: list[FieldError],
) -> float | None:
    if isinstance(val, bool) or not isinstance(val, (int, float)):
        errors.append({"section": section, "key": key, "message": "必须为数字"})
        return None
    value = float(val)
    if not math.isfinite(value):
        errors.append({"section": section, "key": key, "message": "必须为数字"})
        return None
    if value < min_val or (max_val is not None and value > max_val):
        message = f"须在 {_fmt(min_val)}–{_fmt(max_val)} 之间" if max_val is not None else f"须 ≥ {_fmt(min_val)}"
        errors.append({"section": section, "key": key, "message": message})
        return None
    return value

def _fmt(number: float) -> str:
    return str(int(number)) if float(number).is_integer() else str(number)

def require_bool(section: str, key: str, val: Any, errors: list[FieldError]) -> bool | None:
    if not isinstance(val, bool):
        errors.append({"section": section, "key": key, "message": "必须为布尔值"})
        return None
    return val

def is_entity_id(val: Any) -> bool:
    return isinstance(val, str) and bool(_ENTITY_ID_RE.match(val.strip()))

def validate_optional_entity_id(
    section: str, key: str, val: Any, errors: list[FieldError]
) -> None:
    if val is None or val == "":
        return
    if not is_entity_id(val):
        errors.append({"section": section, "key": key, "message": "须为有效 entity_id 或留空"})

def validate_entity_id_list(
    section: str, key: str, val: Any, errors: list[FieldError]
) -> None:
    if not isinstance(val, list):
        errors.append({"section": section, "key": key, "message": "须为字符串数组"})
        return
    for item in val:
        if not isinstance(item, str) or not item.strip() or not is_entity_id(item):
            errors.append({"section": section, "key": key, "message": "每项须为有效 entity_id"})
            break


# 分时电价窗口校验（@homeos/shared energy/tou-windows.util.ts）
