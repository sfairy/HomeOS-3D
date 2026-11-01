"""控制类动作的判定口径与工具结果契约的回归。

锁住三件在重构里最容易悄悄退化的事：

1. **控制类名单只有一份**：审计覆盖面曾经只列 3 个工具，``set_light_brightness`` /
   ``set_cover_position`` / ``media_control`` / ``activate_home_mode`` 既不写审计、
   也不参与「一轮 ≥2 个控制调用先确认」，而这四个同样真实改变设备状态；
2. **结论是四态**：``verified is None``（HA 收下请求却没回实体状态）既不是成功
   也不是失败，必须单独记「已下发未确认」，否则审计会把「没执行」写成「已执行」；
3. **工具结果契约**：``success`` / ``ok`` / ``error`` 三种标记归一成 ``ok``，
   失败必有 ``error``，且不覆盖既有字段、不改原对象。

运行：node ops/lib/py.mjs -m unittest homeos/backend/tests/test_agent_control_audit.py -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.agent.runtime.agent_actor import AGENT_CONTROL_TOOLS
from src.domains.agent.runtime.audit import (
    CONTROL_TOOL_NAMES,
    OUTCOME_BLOCKED,
    OUTCOME_FAILED,
    OUTCOME_SUCCESS,
    OUTCOME_UNVERIFIED,
    audit_target,
    control_outcome,
    control_succeeded,
    describe_plan,
    is_blocked,
    is_unverified,
)
from src.domains.agent.runtime.tool_result import is_failed, normalize_tool_result


def _verified(value: bool | None, *, supported: bool = True) -> dict:
    """``CommandProxy`` 的控制结果形状（只保留判定用到的字段）。"""
    return {
        "success": True,
        "verified": value,
        "verification": {"supported": supported, "verified": value, "reason": "state_confirmed"},
    }


class ControlToolSetTest(unittest.TestCase):
    def test_audit_list_is_the_acl_list(self) -> None:
        """审计名单与「无执行身份一律拒绝」必须是同一份，各改一半就会露设备。"""
        self.assertIs(CONTROL_TOOL_NAMES, AGENT_CONTROL_TOOLS)

    def test_fine_grained_tools_are_audited(self) -> None:
        for name in ("set_light_brightness", "set_cover_position", "media_control", "activate_home_mode"):
            self.assertIn(name, CONTROL_TOOL_NAMES)


class ControlOutcomeTest(unittest.TestCase):
    def test_verified_true_is_success(self) -> None:
        self.assertEqual(control_outcome("control_device", _verified(True)), OUTCOME_SUCCESS)

    def test_verified_false_is_failed(self) -> None:
        result = _verified(False)
        result["verification"]["reason"] = "state_mismatch"
        self.assertEqual(control_outcome("control_device", result), OUTCOME_FAILED)

    def test_verified_none_is_unverified_not_success(self) -> None:
        """HA 回了 200 但响应里没有该实体：下发 ≠ 生效，不能记成功。"""
        result = _verified(None)
        self.assertEqual(control_outcome("control_device", result), OUTCOME_UNVERIFIED)

    def test_unsupported_verification_is_not_unverified(self) -> None:
        """``button.press`` 这类本来就没有目标态，不该被标成「未确认」。"""
        result = _verified(None, supported=False)
        self.assertFalse(is_unverified(result))
        self.assertEqual(control_outcome("control_device", result), OUTCOME_SUCCESS)

    def test_blocked_wins_over_failed(self) -> None:
        """拦截与失败对用户含义不同：先判拦截，别把「被拦下」写成「执行失败」。"""
        result = {"success": False, "blocked": True, "message": "出于安全考虑不支持语音控制"}
        self.assertEqual(control_outcome("control_device", result), OUTCOME_BLOCKED)

    def test_error_result_is_failed(self) -> None:
        self.assertEqual(control_outcome("set_light_brightness", {"error": "entity_id 须为 light.*"}), OUTCOME_FAILED)

    def test_empty_or_missing_result_is_failed(self) -> None:
        self.assertEqual(control_outcome("control_device", {}), OUTCOME_FAILED)
        self.assertEqual(control_outcome("control_device", None), OUTCOME_FAILED)

    def test_room_counts_as_success_only_when_all_affected(self) -> None:
        self.assertTrue(control_succeeded("control_room", {"total": 3, "affected": 3}))
        self.assertFalse(control_succeeded("control_room", {"total": 3, "affected": 2}))
        self.assertFalse(control_succeeded("control_room", {"total": 0, "affected": 0}))

    def test_scene_blocked_is_not_success(self) -> None:
        self.assertFalse(control_succeeded("activate_scene", {"success": True, "blocked": True}))
        self.assertTrue(control_succeeded("activate_scene", {"success": True}))

    def test_batch_results_block_is_detected(self) -> None:
        self.assertTrue(is_blocked({"results": [{"ok": True}, {"blocked": True}]}))
        self.assertFalse(is_blocked({"results": [{"ok": True}]}))


class AuditTargetTest(unittest.TestCase):
    def test_entity_tools_report_entity_id(self) -> None:
        for name in ("control_device", "set_light_brightness", "set_cover_position", "media_control"):
            self.assertEqual(audit_target(name, {"entity_id": "light.ke_ting"}), "light.ke_ting")

    def test_room_scene_and_home_mode(self) -> None:
        self.assertEqual(audit_target("control_room", {"room": "客厅", "domain": "light"}), "客厅 light")
        self.assertEqual(audit_target("activate_scene", {"scene": "回家"}), "回家")
        self.assertEqual(audit_target("activate_home_mode", {"name": "离家"}), "离家")

    def test_missing_args_degrade_to_empty(self) -> None:
        self.assertEqual(audit_target("control_device", {}), "")


class DescribePlanTest(unittest.TestCase):
    def test_fine_grained_calls_are_readable(self) -> None:
        text = describe_plan(
            [
                ("set_light_brightness", {"entity_id": "light.ke_ting", "brightness": 40}),
                ("set_cover_position", {"entity_id": "cover.ke_ting", "position": 60}),
                ("activate_home_mode", {"name": "离家"}),
            ]
        )
        self.assertIn("light.ke_ting 亮度 40%", text)
        self.assertIn("cover.ke_ting 开合 60%", text)
        self.assertIn("家庭模式 离家", text)

    def test_long_plan_is_summarized(self) -> None:
        calls = [("control_device", {"entity_id": f"light.l{i}"}) for i in range(8)]
        self.assertTrue(describe_plan(calls).endswith("等 8 项"))


class ToolResultContractTest(unittest.TestCase):
    def test_error_only_result_gains_ok_false(self) -> None:
        """``{"error": ...}`` 既无 success 也无 ok，老口径会读成成功。"""
        result = normalize_tool_result({"error": "entity_id 须为 light.*"})
        self.assertIs(result["ok"], False)
        self.assertEqual(result["error"], "entity_id 须为 light.*")

    def test_success_flag_result_gains_ok_true(self) -> None:
        result = normalize_tool_result({"success": True, "entity_id": "light.a"})
        self.assertIs(result["ok"], True)
        self.assertNotIn("error", result)

    def test_ok_style_result_is_unchanged(self) -> None:
        result = normalize_tool_result({"ok": True, "task": {"id": 1}})
        self.assertEqual(result, {"ok": True, "task": {"id": 1}})

    def test_failure_gets_error_from_message(self) -> None:
        result = normalize_tool_result({"success": False, "message": "家庭模式未找到"})
        self.assertIs(result["ok"], False)
        self.assertEqual(result["error"], "家庭模式未找到")

    def test_blocked_does_not_become_error(self) -> None:
        """拦截是策略结论，补 ``error`` 会让模型误以为该重试。"""
        result = normalize_tool_result({"success": False, "blocked": True, "message": "不支持语音控制"})
        self.assertIs(result["ok"], False)
        self.assertNotIn("error", result)

    def test_existing_fields_are_preserved(self) -> None:
        result = normalize_tool_result({"success": True, "verified": None, "data": [1, 2]})
        self.assertIs(result["success"], True)
        self.assertIsNone(result["verified"])
        self.assertEqual(result["data"], [1, 2])

    def test_original_dict_is_not_mutated(self) -> None:
        original = {"error": "boom"}
        normalize_tool_result(original)
        self.assertNotIn("ok", original)

    def test_non_dict_results_pass_through(self) -> None:
        self.assertEqual(normalize_tool_result("纯文本摘要"), "纯文本摘要")
        self.assertEqual(normalize_tool_result([1, 2]), [1, 2])
        self.assertFalse(is_failed("纯文本摘要"))


if __name__ == "__main__":
    unittest.main()
