"""点动开关防重发闸门的单测。

这条规则的价值全在「拒绝」上：放行错了只是门不动，拒绝错了（该放不放）会让用户
以为按钮坏了。所以两个方向都要钉死：

- 发一次、观察到 on → off，下一次可点（正常路径）；
- 发一次、什么都没观察到，下一次被拒（设备没收到）；
- 只观察到 off 不算确认（点动型收到就复位，若 off 就放行等于没防住）；
- 换 HA 后状态清零（旧连接的 pending 不能卡住新连接）。
"""

from __future__ import annotations

import unittest

from homeos.backend.src.modules.interaction3d.momentary_switch import (
    MomentarySwitchBlocked,
    MomentarySwitchGuard,
)


class MomentarySwitchGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.guard = MomentarySwitchGuard()
        self.entity_id = "switch.garage_motor"

    def test_normal_cycle_allows_next_press(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        self.assertTrue(self.guard.waiting_for_reset(self.entity_id))
        self.guard.observe(self.entity_id, "on")
        # 见到 on 就解除「等待复位」：设备已确认收到。
        self.assertFalse(self.guard.waiting_for_reset(self.entity_id))
        self.guard.observe(self.entity_id, "off")
        # 下一次照常可点。
        self.guard.press(self.entity_id)

    def test_unobserved_press_blocks_next(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        with self.assertRaises(MomentarySwitchBlocked):
            self.guard.press(self.entity_id)

    def test_rejection_sticks_until_device_reports(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        with self.assertRaises(MomentarySwitchBlocked):
            self.guard.press(self.entity_id)
        # 仍然被拒（没有新的观察）。
        with self.assertRaises(MomentarySwitchBlocked):
            self.guard.press(self.entity_id)
        # 设备终于回报 → 解除。
        self.guard.observe(self.entity_id, "on")
        self.guard.press(self.entity_id)

    def test_off_only_is_not_confirmation(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        # 只看到 off：设备复位了，但我们没确认过它闭合，不放行。
        self.guard.observe(self.entity_id, "off")
        self.assertTrue(self.guard.waiting_for_reset(self.entity_id))

    def test_any_state_change_clears_rejection(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        with self.assertRaises(MomentarySwitchBlocked):
            self.guard.press(self.entity_id)
        # 先给一个基线 off，再给 on：状态确实变了 → 设备在回报 → 解除。
        self.guard.observe(self.entity_id, "off")
        self.guard.observe(self.entity_id, "on")
        self.guard.press(self.entity_id)

    def test_dispatched_is_idempotent(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.dispatched(self.entity_id)
        self.guard.dispatched(self.entity_id)
        self.assertTrue(self.guard.waiting_for_reset(self.entity_id))

    def test_forget_and_clear(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.forget(self.entity_id)
        # 忘掉之后可以重新点（新连接 / 新配对）。
        self.guard.press(self.entity_id)
        self.guard.clear()
        self.guard.press(self.entity_id)

    def test_release_force_allows(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.release(self.entity_id)
        self.assertFalse(self.guard.waiting_for_reset(self.entity_id))
        self.guard.press(self.entity_id)

    def test_two_switches_are_independent(self) -> None:
        self.guard.press("switch.a")
        self.guard.press("switch.b")
        self.guard.observe("switch.a", "on")
        self.guard.observe("switch.a", "off")
        # b 没被观察，仍被拒。
        with self.assertRaises(MomentarySwitchBlocked):
            self.guard.press("switch.b")

    def test_case_and_whitespace_insensitive(self) -> None:
        self.guard.press(self.entity_id)
        self.guard.observe(self.entity_id, " ON ")
        self.assertFalse(self.guard.waiting_for_reset(self.entity_id))


if __name__ == "__main__":
    unittest.main()
