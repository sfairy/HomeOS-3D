"""点动开关（momentary switch）的「防重发」闸门（0.9.0 `_MomentarySwitchPress`）。

## 为什么需要它

点动型的门机（车库门、卷帘门常见）只有「按一下」这一个动作：发一次脉冲，开关自动复位。
它没有「开」和「关」两个独立指令 —— 再按一次就是反向。

于是「连点两次」会变成「开了又关」，门抖一下就停在半开。更糟的是：**如果设备没收到**，
前端只知道「发了」，用户以为没反应又点一次，第二次才生效 —— 但此时门已经在反向运动。

本闸门的判据是 **观察**，不是计时：

- 发出脉冲后记为 ``pending``；
- 只有**真的看到开关状态变化**才认为设备是活的（``saw_on`` 记录是否见到闭合那一下）；
- 下一次触发前，如果「上一次发了但一直没观察到任何变化」，直接拒绝。

不用超时判断的原因：HA 的状态回报延迟在网络差时可能十几秒，用固定超时会把「慢但成功」
误判成「失败」，用户被迫重试 —— 那正是要避免的行为。

## 与前端的关系

前端在 ``waitingForReset`` 期间禁用按钮；本闸门是**第二道**保险：前端按钮可能因为
状态还没推下来而仍可点。两道都在，才挡住「连点」。
"""

from __future__ import annotations

from typing import Any


class MomentarySwitchBlocked(Exception):
    """点在「上一次触发还没被观察到」期间。

    与普通 ``HTTPException`` 分开：上层要把它翻译成 409 + 特定文案，
    而不是笼统的「操作失败」。
    """

    def __init__(self, entity_id: str) -> None:
        super().__init__(entity_id)
        self.entity_id = entity_id


class MomentarySwitchPress:
    """单个开关的脉冲状态。"""

    __slots__ = ("last_observed", "pending", "rejected", "saw_on", "sending")

    def __init__(self) -> None:
        #: 已发出脉冲、等待设备回报。
        self.pending = False
        #: 最近一次触发是否被拒（供面板显示「等待开关复位」）。
        self.rejected = False
        #: 发出脉冲之后是否观察到开关闭合（``on``）。
        self.saw_on = False
        #: 正在发送（同一 tick 内并发保护的窗口）。
        self.sending = False
        #: 上次观察到的原始状态；用来判断「设备是否还在回报」。
        self.last_observed: str | None = None

    def reset(self) -> None:
        self.pending = False
        self.rejected = False
        self.saw_on = False
        self.sending = False

    @property
    def waiting_for_reset(self) -> bool:
        """面板用：仍在等设备确认。"""
        return self.pending and not self.saw_on


class MomentarySwitchGuard:
    """按实体 id 维护脉冲状态的闸门。

    刻意**不做超时清理**：超时后自动放行等于把「设备失联」当成「已复位」，
    连点会被放过去。释放时机只有两个 —— 观察到完整复位（on → off），或显式 ``release``。
    """

    def __init__(self) -> None:
        self._presses: dict[str, MomentarySwitchPress] = {}

    def _press_of(self, entity_id: str) -> MomentarySwitchPress:
        press = self._presses.get(entity_id)
        if press is None:
            press = MomentarySwitchPress()
            self._presses[entity_id] = press
        return press

    def press(self, entity_id: str) -> MomentarySwitchPress:
        """登记一次脉冲。已在上一次未确认期间则抛 :class:`MomentarySwitchBlocked`。"""
        press = self._press_of(entity_id)
        if press.rejected:
            # 之前被拒过、状态还没任何变化：继续拒。
            raise MomentarySwitchBlocked(entity_id)
        if press.pending and not press.saw_on:
            press.rejected = True
            raise MomentarySwitchBlocked(entity_id)
        press.reset()
        press.pending = True
        press.sending = True
        return press

    def dispatched(self, entity_id: str) -> None:
        """脉冲已经交给 HA（发送窗口关闭）。"""
        press = self._presses.get(entity_id)
        if press is not None:
            press.sending = False

    def observe(self, entity_id: str, state: Any) -> None:
        """观察到该开关的状态。

        两类观察分开处理：

        - 见到 ``on``：设备收到了脉冲 → ``saw_on``，并解除「被拒」；
        - 见到**任何与上次不同的状态**：设备在回报 → 解除「被拒」（哪怕没见过 on）。
          否则设备只在 off↔off 抖动时会永久卡死。

        见到 ``off`` **不**释放闸门：点动型收到脉冲后会立刻复位，若在 off 就放行，
        下一拍就能再点一次 —— 那正是要挡的连点。
        """
        press = self._press_of(entity_id)
        normalized = str(state).strip().lower()
        changed = press.last_observed is not None and press.last_observed != normalized
        if changed:
            press.rejected = False
        if normalized == "on" and press.pending:
            press.saw_on = True
            press.rejected = False
        if normalized == "off" and press.pending and press.saw_on:
            # 完整走完 on → off：这次触发被确认，可以接受下一次。
            press.reset()
        press.last_observed = normalized

    def release(self, entity_id: str) -> None:
        """显式放行（换 HA / 用户手动清理时用）。"""
        self._presses.get(entity_id, MomentarySwitchPress()).reset()

    def waiting_for_reset(self, entity_id: str) -> bool:
        press = self._presses.get(entity_id)
        return press is not None and press.waiting_for_reset

    def forget(self, entity_id: str) -> None:
        """换 HA / 断开连接时清掉该实体的状态（避免旧连接的 pending 卡住新连接）。"""
        self._presses.pop(entity_id, None)

    def clear(self) -> None:
        self._presses.clear()
