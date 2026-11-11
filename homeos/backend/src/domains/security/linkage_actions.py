"""安防联动动作的「可逆性」判据（从 ``panel_helpers.py`` 拆出）。

两件事共用同一张表：

- **补偿**：布防失败要撤销已执行的动作，靠成对服务反向调用；
- **重放**：HA 重连后按持久化模式补一次联动，只能重放可逆项 —— 否则脚本 / 通知 /
  ``shell_command`` 会在每次重连时被再执行一遍。

拆出来的动机：``panel_helpers.py`` 已被文件规模棘轮锁住，而这张表是纯数据 + 纯函数。
"""

from __future__ import annotations

from typing import Any

from ...platform.core.entity.entity_domain import get_entity_domain

#: 联动动作的幂等逆操作。只收「不需要知道原状态就能安全撤销」的成对服务：
#: 布防时关了水阀就开回来、开了摄像头就关掉、锁了门就解锁。
INVERSE_SERVICES: dict[str, str] = {
    "turn_on": "turn_off",
    "turn_off": "turn_on",
    "open_cover": "close_cover",
    "close_cover": "open_cover",
    "open_valve": "close_valve",
    "close_valve": "open_valve",
    "lock": "unlock",
    "unlock": "lock",
}

#: 没有逆操作的域：scene/script/automation 的 turn_on 是「执行」而不是「打开状态」，
#: button/notify/tts 更没有反方向。它们一旦执行就无法撤销，只能如实列进 irreversibleItems。
IRREVERSIBLE_DOMAINS = frozenset(
    {"scene", "script", "automation", "button", "input_button", "notify", "tts", "shell_command"}
)


def build_inverse_action(domain: str, service: str, entity_id: str) -> dict[str, Any] | None:
    """构造一条联动动作的逆操作；不可逆时返回 ``None``。"""
    if domain in IRREVERSIBLE_DOMAINS:
        return None
    inverse = INVERSE_SERVICES.get(service)
    if inverse is None:
        return None
    return {"domain": domain, "service": inverse, "entity_id": entity_id, "data": {}}


def is_replayable_action(action: dict[str, Any]) -> bool:
    """该联动动作是否可以在「HA 重连」时安全重放。

    判据与「能不能撤销」一致：只有成对的**状态型**服务（开/关、锁/解锁、开阀/关阀）
    重放是幂等的。``scene`` / ``script`` / ``notify`` / ``tts`` / ``shell_command``
    重放会再执行一次副作用（再跑脚本、再发通知），所以只在进程启动时执行一次。
    """
    entity_id = str(action.get("entity_id") or "")
    domain = str(action.get("domain") or get_entity_domain(entity_id)).strip().lower()
    if domain in IRREVERSIBLE_DOMAINS:
        return False
    return str(action.get("service") or "") in INVERSE_SERVICES


__all__ = ["build_inverse_action", "is_replayable_action"]
