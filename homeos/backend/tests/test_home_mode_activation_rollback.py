"""家庭模式激活的中断兜底回归：异常 / 取消都必须回滚设备并归还联动仲裁。

为什么这条必须守住
------------------
``activate_home_mode`` 拿到仲裁 claim 之后要跑三段（预快照 / 执行 / 提交），中间任何
一步抛异常或被取消，旧实现都只会把它们当成「调用方出错」直接冒泡：
设备停在被改了一半的位置、没有快照回滚、没有失败触发日志，claim 还要占满 TTL
（15–30 分钟），期间 presence / calendar / time 的联动调用全被静默拦截。

这里用桩依赖直接驱动真实的 ``activate_home_mode``，只把 HA / DB 换成内存对象。
"""

from __future__ import annotations

import asyncio
import sys
import time
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.home_mode.actions import activate_home_mode
from src.domains.home_mode.linkage import HomeModeLinkageArbiter


class _StateStub:
    def __init__(self) -> None:
        self.active_mode_id: str | None = None

    def get_active_mode_id(self) -> str | None:
        return self.active_mode_id

    def set_active_mode_id(self, mode_id: str | None) -> None:
        self.active_mode_id = mode_id


class _DepsStub:
    """只实现 ``activate_home_mode`` 会碰到的依赖面。"""

    def __init__(self, *, fail_list_active: bool = False, fail_switch: bool = False) -> None:
        self.linkage_arbiter = HomeModeLinkageArbiter()
        self.fail_list_active = fail_list_active
        self.fail_switch = fail_switch
        self.logs: list[str] = []
        self.warns: list[str] = []
        self.trigger_logs: list[dict[str, Any]] = []
        self.records: list[Any] = []
        self.notifications: list[tuple[str, str]] = []
        self.deactivated: list[tuple[str, bool]] = []
        self.switched = 0
        self.fail_finalize = False

    # 准入
    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return {"id": mode_id, "name": "回家", "config": [], "exclusiveGroup": "default"}

    def get_home_mode_config(self) -> dict[str, Any]:
        return {}

    async def get_ha_status(self) -> dict[str, Any]:
        return {"connected": True}

    # 预快照
    async def list_active_modes(self) -> list[dict[str, Any]]:
        if self.fail_list_active:
            raise RuntimeError("DB 抖动")
        return []

    # 执行
    def get_security_config(self) -> dict[str, Any]:
        return {}

    async def get_security_mode(self) -> str | None:
        return None

    # 提交 / 中止
    async def switch_active_group(self, *_args: Any) -> None:
        self.switched += 1
        if self.fail_switch:
            raise RuntimeError("写库失败")

    async def deactivate_in_db(self, mode_id: str, keep_snapshot: bool = False) -> None:
        self.deactivated.append((mode_id, keep_snapshot))

    async def emit_home_mode_event(self, name: str, payload: dict[str, Any]) -> None:
        if self.fail_finalize:
            raise RuntimeError("广播失败")

    async def notify(self, level: str, message: str, *_args: Any) -> None:
        self.notifications.append((level, message))

    def log(self, message: str) -> None:
        self.logs.append(message)

    def warn(self, message: str) -> None:
        self.warns.append(message)

    def push_trigger_log(self, payload: dict[str, Any]) -> None:
        self.trigger_logs.append(payload)

    def record_execution(self, record: Any) -> None:
        self.records.append(record)


class ActivationInterruptionTest(unittest.TestCase):
    def test_exception_after_claim_releases_claim_and_logs_failure(self) -> None:
        deps = _DepsStub(fail_list_active=True)
        state = _StateStub()

        with self.assertRaises(RuntimeError):
            asyncio.run(activate_home_mode(state, deps, "m1", {"source": "manual"}))

        # claim 必须还回去，否则 15–30 分钟内低优先级联动全被拦
        self.assertIsNone(deps.linkage_arbiter.get_claim())
        # 失败要有痕迹：前端就靠这条触发日志解释「为什么没生效」
        self.assertEqual(len(deps.trigger_logs), 1)
        self.assertFalse(deps.trigger_logs[0]["success"])
        self.assertTrue(any("回滚" in message or "取消" in message for message in deps.warns))

    def test_commit_failure_rolls_back_devices_and_releases_claim(self) -> None:
        deps = _DepsStub(fail_switch=True)
        state = _StateStub()

        result = asyncio.run(activate_home_mode(state, deps, "m1", {"source": "manual"}))

        self.assertFalse(result["success"])
        self.assertIsNone(deps.linkage_arbiter.get_claim())
        self.assertEqual(state.get_active_mode_id(), None)
        self.assertEqual([mode_id for mode_id, _ in deps.deactivated], ["m1"])

    def test_cancelled_activation_still_rolls_back(self) -> None:
        """客户端断开导致的取消同样要回滚 + 归还 claim。"""

        class _CancelledDeps(_DepsStub):
            async def list_active_modes(self) -> list[dict[str, Any]]:
                raise asyncio.CancelledError()

        deps = _CancelledDeps()
        state = _StateStub()

        with self.assertRaises(asyncio.CancelledError):
            asyncio.run(activate_home_mode(state, deps, "m1", {"source": "manual"}))

        self.assertIsNone(deps.linkage_arbiter.get_claim())
        self.assertEqual(len(deps.trigger_logs), 1)


class ActivationCommitTest(unittest.TestCase):
    def test_ha_down_releases_claim_and_logs_failure(self) -> None:
        class _OfflineDeps(_DepsStub):
            async def get_ha_status(self) -> dict[str, Any]:
                return {"connected": False}

        deps = _OfflineDeps()
        state = _StateStub()

        result = asyncio.run(activate_home_mode(state, deps, "m1", {"source": "manual"}))

        self.assertFalse(result["success"])
        self.assertIsNone(deps.linkage_arbiter.get_claim())
        self.assertEqual(len(deps.trigger_logs), 1)
        self.assertFalse(deps.trigger_logs[0]["success"])

    def test_finalize_failure_after_commit_is_not_reported_as_error(self) -> None:
        """已经提交的激活不该因为写日志 / 广播失败变成 500。"""
        deps = _DepsStub()
        deps.fail_finalize = True
        state = _StateStub()

        result = asyncio.run(activate_home_mode(state, deps, "m1", {"source": "manual"}))

        self.assertTrue(result["success"])
        self.assertTrue(result["active"])
        self.assertEqual(state.get_active_mode_id(), "m1")
        # 提交成功保留 claim（与改动前一致），但绝不能无条件清掉别人的
        self.assertIsNotNone(deps.linkage_arbiter.get_claim())


class ArbiterTokenTest(unittest.TestCase):
    def test_release_with_stale_token_keeps_newer_claim(self) -> None:
        arbiter = HomeModeLinkageArbiter()
        # 用真实时钟：``get_claim`` 会按当前时间清理过期 claim，用假时间会被判成过期。
        now = int(time.time() * 1000)
        first = arbiter.try_acquire("presence", now=now)
        self.assertTrue(first["ok"])
        second = arbiter.try_acquire("manual", now=now)
        self.assertTrue(second["ok"])

        # 老任务迟到释放：不能把当前（更新）的 claim 抹掉
        arbiter.release(first["token"])
        claim = arbiter.get_claim()
        self.assertIsNotNone(claim)
        self.assertEqual(claim["source"], "manual")

        arbiter.release(second["token"])
        self.assertIsNone(arbiter.get_claim())

    def test_release_without_token_still_works(self) -> None:
        arbiter = HomeModeLinkageArbiter()
        arbiter.try_acquire("manual", now=int(time.time() * 1000))
        arbiter.release()
        self.assertIsNone(arbiter.get_claim())


if __name__ == "__main__":
    unittest.main()
