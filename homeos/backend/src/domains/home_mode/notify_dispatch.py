"""家庭模式通知派发（从 service 拆出，压文件规模）。"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def dispatch_home_mode_notify(
    notification: Any | None,
    level: str,
    message: str,
    source: str,
) -> Any:
    """发送通知；返回通知结果。DND/关闭/失败返回 ``None``，调用方不得当成功。"""
    if notification is None:
        logger.info("[notify:%s] %s (%s)", level, message, source)
        return {"logged": True}
    try:
        result = notification.notify(level, message, source)
        if asyncio.iscoroutine(result):
            result = await result
        return result
    except Exception as exc:
        logger.warning("家庭模式通知发送失败: %s", exc)
        return None


async def apply_security_mode_or_fail(
    security_mode_setter: Any | None,
    mode: str,
    source: str,
) -> bool:
    """安防未注入时不能假成功，否则模式会「激活」却从未布防。"""
    if security_mode_setter is None:
        logger.warning("家庭模式安防动作失败: 安防模块未注入 (mode=%s source=%s)", mode, source)
        return False
    result = security_mode_setter(mode, source)
    if asyncio.iscoroutine(result):
        result = await result
    if isinstance(result, dict):
        return bool(result.get("success", True))
    return bool(result)
