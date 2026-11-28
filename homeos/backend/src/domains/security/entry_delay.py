"""安防「进入延时」：布防后开门进屋先进 pending，给用户 N 秒撤防窗口。

## 为什么单独一层

报警派发路径（``SecurityAlarmHelper.handle_sensor_trigger``）本来就长；把「起定时器、
撤防取消、到点复核」三件事塞进去会同时抬高圈复杂度与文件规模。这里只依赖
``config_reader`` / ``get_current_mode`` / ``bus`` 与一个「真正派发」的回调，可以独立
演进与自检（见 ``ops/checks/business/security_entry_delay_selftest.py``）。

## 与「撤离宽限」的区别

``armExitGraceSeconds`` 管的是**布防后出门**（开门离开不算入侵）；进入延时管的是
**布防后进门**（开门进屋先给撤防窗口）。两者方向相反，窗口互不重叠，不能合并成
一个计时器 —— 合并会让「出门」与「进门」共用一个倒计时，语义立刻错乱。

## 三件对外协议（前端倒计时依赖它们，缺一条 UI 就会卡住或没有提示）

1. 起步 / 合并时发 ``security.entryPending``（带截止时刻与剩余秒数）；
2. 撤防取消、或到点派发后发 ``security.entryResolved``（``reason`` 区分
   ``cancelled`` / ``expired``）—— 没有这一条，前端倒计时永远清不掉；
3. ``status()`` 同步暴露同一份状态，页面刷新/重进时能恢复倒计时。
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

#: 待触发事件（前端据此显示倒计时与「立即撤防」）。
EVENT_ENTRY_PENDING = "security.entryPending"
#: 待触发结束（撤防取消 / 到点派发）。没有它前端倒计时会永久停留。
EVENT_ENTRY_RESOLVED = "security.entryResolved"


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
        """启动进入延时；返回 ``True`` 表示本次告警被挂起。

        窗口内再来一次进门触发**不是**新窗口：合并实体与防区后继续用原截止时刻，
        否则「前门先进、后窗再被砸开」会因为早先那次触发而丢掉后窗对应的防区，
        到点只按第一个实体告警。只有同一个实体重复上报才什么都不改。
        """
        seconds = self.delay_seconds()
        if seconds <= 0:
            return False
        if not self.is_entry_trigger(entity_id, new_state_obj, new_state):
            return False
        pending = self._pending
        if pending is not None:
            if self._merge_pending(pending, entity_id, new_state_obj, zones, cooldown_sec):
                self._emit_pending(pending, updated=True)
            return True
        started_at = time.time()
        deadline = started_at + seconds
        friendly_name = (new_state_obj.get("attributes") or {}).get("friendly_name") or entity_id
        self._pending = {
            "entityId": entity_id,
            "entityIds": [entity_id],
            "friendlyName": friendly_name,
            "friendlyNames": [str(friendly_name)],
            #: 合并时按 ``id`` 去重；派发前只投影成 dict 列表。
            "zones": [dict(zone) for zone in zones],
            "zoneIds": [str(zone.get("id")) for zone in zones if zone.get("id")],
            "cooldownSec": cooldown_sec,
            "startedAt": started_at,
            "deadline": deadline,
        }
        loop = asyncio.get_running_loop()
        self._timer = loop.call_later(seconds, self._on_deadline)
        logger.info("安防进入延时：%s 触发，%s 秒内可撤防", entity_id, seconds)
        self._emit_pending(self._pending, updated=False)
        return True

    def _merge_pending(
        self,
        pending: dict[str, Any],
        entity_id: str,
        new_state_obj: dict[str, Any],
        zones: list[dict[str, Any]],
        cooldown_sec: int,
    ) -> bool:
        """把窗口内后续触发合并进 pending；返回是否真的有变化。"""
        changed = False
        if entity_id not in pending["entityIds"]:
            pending["entityIds"].append(entity_id)
            friendly_name = (new_state_obj.get("attributes") or {}).get("friendly_name") or entity_id
            pending["friendlyNames"].append(str(friendly_name))
            logger.info("安防进入延时：窗口内追加触发 %s", entity_id)
            changed = True
        merged = {str(zone.get("id")): zone for zone in pending["zones"] if zone.get("id")}
        extras = [zone for zone in pending["zones"] if not zone.get("id")]
        for zone in zones:
            zone_id = str(zone.get("id") or "")
            if zone_id:
                if zone_id not in merged:
                    merged[zone_id] = dict(zone)
                    changed = True
            elif zone not in extras:
                extras.append(dict(zone))
                changed = True
        if changed:
            pending["zones"] = list(merged.values()) + extras
            pending["zoneIds"] = list(merged)
        # 冷却取窗口内最大值：同一配置下相同，配置热更新时不给后用更短的值。
        pending["cooldownSec"] = max(int(pending.get("cooldownSec") or 0), int(cooldown_sec or 0))
        return changed

    def is_pending(self) -> bool:
        return self._pending is not None

    def absorb(
        self,
        entity_id: str,
        new_state_obj: dict[str, Any],
        zones: list[dict[str, Any]],
        cooldown_sec: int,
    ) -> bool:
        """把窗口内的**任意**已布防触发并入同一 pending；没有 pending 时返回 ``False``。

        为什么不能只延迟「进门类」实体：标准布撤防语义里进入延时属于**整个分区**。
        用户刚开门（pending），走廊人体或内门接着触发；旧实现 ``begin`` 对非进门类返回
        ``False``，调用方立刻拉响警笛 —— 撤防窗口等于不存在，30 秒后门磁到点还会再响
        一次（重复告警 + 重复通知）。这里把后续触发一并挂起到同一截止时刻。
        """
        pending = self._pending
        if pending is None:
            return False
        if self._merge_pending(pending, entity_id, new_state_obj, zones, cooldown_sec):
            self._emit_pending(pending, updated=True)
        return True

    def cancel(self, reason: str = "") -> bool:
        """撤防 / 解除时取消待触发的告警；返回是否确实取消了。"""
        if self._pending is None:
            return False
        pending = self._pending
        if self._timer is not None:
            self._timer.cancel()
        self._timer = None
        self._pending = None
        logger.info("安防进入延时已取消%s", f"（{reason}）" if reason else "")
        self._emit_resolved(pending, reason="cancelled", alarmed=False)
        return True

    def status(self) -> dict[str, Any]:
        pending = self._pending
        if pending is None:
            return {"pending": False}
        deadline = float(pending["deadline"])
        return {
            "pending": True,
            "entityId": pending["entityId"],
            "entityIds": list(pending["entityIds"]),
            "friendlyName": pending["friendlyName"],
            "friendlyNames": list(pending["friendlyNames"]),
            "zoneIds": list(pending["zoneIds"]),
            "zoneNames": [str(zone.get("name") or zone.get("id") or "") for zone in pending["zones"]],
            "delaySeconds": max(0, round(deadline - time.time())),
            "startedAt": int(float(pending["startedAt"]) * 1000),
            "deadlineAt": int(deadline * 1000),
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
            self._emit_resolved(pending, reason="expired", alarmed=False)
            return
        # 先发 resolved 再派发：告警联动可能耗时数十秒，倒计时要立刻收起；
        # ``alarmed`` 让前端知道这次窗口是以告警收尾的。
        self._emit_resolved(pending, reason="expired", alarmed=True)
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

    # ---- 广播 ----
    def _emit_pending(self, pending: dict[str, Any], *, updated: bool) -> None:
        if self._bus is None:
            return
        deadline = float(pending["deadline"])
        self._bus.emit_soon(
            EVENT_ENTRY_PENDING,
            {
                "pending": True,
                "entityId": pending["entityId"],
                "entityIds": list(pending["entityIds"]),
                "friendlyName": pending["friendlyName"],
                "friendlyNames": list(pending["friendlyNames"]),
                "zoneIds": list(pending["zoneIds"]),
                "zoneNames": [str(zone.get("name") or zone.get("id") or "") for zone in pending["zones"]],
                # 合并事件是「当前还剩多少秒」，不是新窗口的时长。
                "delaySeconds": max(0, round(deadline - time.time())),
                "startedAt": int(float(pending["startedAt"]) * 1000),
                "deadlineAt": int(deadline * 1000),
                "merged": updated,
                "timestamp": int(time.time() * 1000),
            },
        )

    def _emit_resolved(self, pending: dict[str, Any], *, reason: str, alarmed: bool) -> None:
        if self._bus is None:
            return
        self._bus.emit_soon(
            EVENT_ENTRY_RESOLVED,
            {
                "pending": False,
                "entityId": pending["entityId"],
                "entityIds": list(pending["entityIds"]),
                "friendlyName": pending["friendlyName"],
                "friendlyNames": list(pending["friendlyNames"]),
                "zoneIds": list(pending["zoneIds"]),
                "reason": reason,
                "alarmed": alarmed,
                "timestamp": int(time.time() * 1000),
            },
        )


__all__ = ["EVENT_ENTRY_PENDING", "EVENT_ENTRY_RESOLVED", "EntryDelayController"]
