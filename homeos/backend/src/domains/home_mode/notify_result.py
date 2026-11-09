"""家庭模式通知动作的结果拼装（从 actions 拆出，压文件规模）。"""

from __future__ import annotations

from typing import Any


def build_notify_action_result(sent: Any) -> dict[str, Any]:
    """``deps.notify`` 返回值：非 ``None`` 视为已发送。"""
    ok = sent is not None
    return {
        "entity_id": "notify:app",
        "service": "notify.send_message",
        "success": ok,
        "error": None if ok else "通知未发送（勿扰或已关闭）",
    }


def build_security_action_result(ref: str, ok: bool) -> dict[str, Any]:
    return {
        "entity_id": f"security:{ref}",
        "service": "security.set_mode",
        "success": bool(ok),
        "error": None if ok else "安防模式切换失败（需安防模块授权）",
    }
