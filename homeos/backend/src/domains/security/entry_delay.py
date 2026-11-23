"""安防「进入延时」：布防后开门进屋先进 pending，给用户 N 秒撤防窗口。

## 为什么单独一层

报警派发路径（``SecurityAlarmHelper.handle_sensor_trigger``）本来就长；把「起定时器、
撤防取消、到点复核」三件事塞进去会同时抬高圈复杂度与文件规模。这里只依赖
``config_reader`` / ``get_current_mode`` / ``bus`` 与一个「真正派发」的回调，可以独立
演进与自检（见 ``ops/checks/security_entry_delay_selftest.py``）。

## 与「撤离宽限」的区别

``armExitGraceSeconds`` 管的是**布防后出门**（开门离开不算入侵）；进入延时管的是
**布防后进门**（开门进屋先给撤防窗口）。两者方向相反，窗口互不重叠，不能合并成
一个计时器 —— 合并会让「出门」与「进门」共用一个倒计时，语义立刻错乱。
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger("homeos.security.entry_delay")

#: 属于「有人进门」的 ``device_class``（门窗类）。
_ENTRY_DEVICE_CLASSES = frozenset({"door", "garage_door", "opening", "window"})


class EntryDelayController:
    """进入延时的状态机（每个安防面板一份）。"""

    def __init__(
        self,
        *,
        config_reader: Callable[[], dict[str, Any]],
        get_current_mode: Callable[[], str],
        dispatch: Callable[[str, dict[str, Any], list[dict[str, Any]], int], Awaitable[None]],
        event_bus: Any = None,
    ) -> None:
        self._config_reader = config_reader
        self._get_current_mode = get_current_mode
        self._dispatch = dispatch
        self._bus = event_bus
        self._pending: dict[str, Any] | None = None
        self._timer: Any = None
        self._tasks: set[Any] = set()

    # ---- 判定 ----
    def delay_seconds(self) -> int:
        try:
            return max(0, int(self._config_reader().get("entryDelaySeconds") or 0))
        except (TypeError, ValueError):  # fmt: skip
            logger.debug("entryDelaySeconds 非法，按不启用处理: %r", self._config_reader().get("entryDelaySeconds"))
            return 0

    @staticmethod
    def is_entry_trigger(entity_id: str, new_state_obj: dict[str, Any], new_state: Any) -> bool:
        """是否属于「有人进门」类触发（门窗磁 / 车库门 / 门锁解锁）。"""
        if entity_id.startswith("lock."):
            return new_state == "unlocked"
        if not entity_id.startswith("binary_sensor."):
            return False
        attrs = new_state_obj.get("attributes") or {}
        device_class = str(attrs.get("device_class") or "").strip().lower()
        return device_class in _ENTRY_DEVICE_CLASSES

    # ---- 生命周期 ----
    def begin(
        self,
        entity_id: str,
        new_state_obj: dict[str, Any],
        new_state: Any,
        zones: list[dict[str, Any]],
        cooldown_sec: int,
    ) -> bool:
        """启动进入延时；返回 ``True`` 表示本次告警被挂起。"""
        seconds = self.delay_seconds()
        if seconds <= 0 or self._pending is not None:
            return False
        if not self.is_entry_trigger(entity_id, new_state_obj, new_state):
            return False
        deadline = time.time() + seconds
        friendly_name = (new_state_obj.get("attributes") or {}).get("friendly_name") or entity_id
        self._pending = {
            "entityId": entity_id,
            "friendlyName": friendly_name,
            "zones": zones,
            "cooldownSec": cooldown_sec,
            "deadline": deadline,
        }
        loop = asyncio.get_running_loop()
        self._timer = loop.call_later(seconds, self._on_deadline)
        logger.info("安防进入延时：%s 触发，%s 秒内可撤防", entity_id, seconds)
        if self._bus is not None:
            self._bus.emit_soon(
                "security.entryPending",
                {
                    "entityId": entity_id,
                    "friendlyName": friendly_name,
                    "delaySeconds": seconds,
                    "deadlineAt": int(deadline * 1000),
                },
            )
        return True

    def cancel(self, reason: str = "") -> bool:
        """撤防 / 解除时取消待触发的告警；返回是否确实取消了。"""
        if self._pending is None:
            return False
        if self._timer is not None:
            self._timer.cancel()
        self._timer = None
        self._pending = None
        logger.info("安防进入延时已取消%s", f"（{reason}）" if reason else "")
        return True

    def status(self) -> dict[str, Any]:
        pending = self._pending
        if pending is None:
            return {"pending": False}
        return {
            "pending": True,
            "entityId": pending["entityId"],
            "friendlyName": pending["friendlyName"],
            "deadlineAt": int(float(pending["deadline"]) * 1000),
        }

    # ---- 到点 ----
    def _on_deadline(self) -> None:
        """到点：仍在布防态才真的告警（期间撤防已被 :meth:`cancel` 清掉）。"""
        pending = self._pending
        self._pending = None
        self._timer = None
        if pending is None:
            return
        if self._get_current_mode() == "disarmed":
            logger.info("安防进入延时到点，但已撤防，不告警")
            return
        task = asyncio.ensure_future(
            self._dispatch(
                str(pending["entityId"]),
                {"attributes": {"friendly_name": pending["friendlyName"]}},
                list(pending["zones"]),
                int(pending["cooldownSec"]),
            )
        )
        # 强引用：到点任务被 GC 回收会让这次告警凭空消失。
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)


__all__ = ["EntryDelayController"]
