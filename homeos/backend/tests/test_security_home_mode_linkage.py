"""安防 ↔ 家庭模式联动回归。

覆盖四类容易「看着正常、实际错位」的路径：

1. 用户在安防面板上的手动操作要以「用户驱动」身份进入家庭模式仲裁，
   否则会被家庭模式自己的 manual lock 挡住；
2. 撤防要退出「与安防绑定」的家庭模式，而不是内存指针指向的那个
   （多互斥组下会退错组）；
3. ``securityModeLinks`` 里的绑定 id 失效后要回退到名称匹配，
   而不是把整条链路永久静默关掉；
4. 保存区域配置派生 ``armed`` 时，zoneType 变了必须重新推导。
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

from src.domains.security.linkage import (
    NON_LINKAGE_SOURCES,
    SecurityLinkageService,
)
from src.domains.security.zones import (
    resolve_home_mode_link_for_security_change,
    resolve_zone_armed_on_save,
)


class _BusStub:
    def on(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def emit(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _PanelStub:
    def __init__(
        self,
        mode: str = "armed_away",
        *,
        locked: bool = False,
        lock_until: float = 0.0,
    ) -> None:
        self._mode = mode
        self._locked = locked
        self._lock_until = lock_until
        self.arms: list[tuple[str, dict[str, Any]]] = []

    def get_mode(self) -> str:
        return self._mode

    def is_auto_action_locked(self) -> bool:
        return self._locked

    def get_manual_lock_until(self) -> float:
        return self._lock_until

    async def arm(self, mode: str, _zone_ids: Any = None, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        self.arms.append((mode, dict(opts or {})))
        self._mode = mode
        return {"success": True, "failedItems": []}


class _AwaySimStub:
    def get_status(self) -> dict[str, Any]:
        return {"enabled": False}

    async def enable(self) -> None:
        return None

    async def disable(self) -> None:
        return None


class _HomeModeStub:
    def __init__(
        self,
        modes: list[dict[str, Any]] | None = None,
        active: list[dict[str, Any]] | None = None,
    ) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.activations: list[tuple[str, dict[str, Any]]] = []
        self._modes = list(modes or [])
        self._active = list(active or [])

    async def activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append(("activate", mode_id))
        self.activations.append((mode_id, dict(meta or {})))
        return {"success": True}

    async def deactivate(self, mode_id: str | None = None) -> dict[str, Any]:
        self.calls.append(("deactivate", mode_id))
        return {"success": True}

    def find_all(self) -> list[dict[str, Any]]:
        return list(self._modes)

    def get_active_modes(self) -> list[dict[str, Any]]:
        return list(self._active)


def _linkage(
    home_mode: _HomeModeStub,
    links: dict[str, str] | None = None,
    *,
    panel: _PanelStub | None = None,
    config: dict[str, Any] | None = None,
) -> SecurityLinkageService:
    service = SecurityLinkageService(
        session_factory=lambda: None,
        bus=_BusStub(),
        panel=panel or _PanelStub(),
        away_sim=_AwaySimStub(),
        home_mode=home_mode,
        config_reader=lambda: {
            "linkHomeModeOnSecurityChange": True,
            "autoDisarmOnFirstHome": True,
            "homeConfirmMin": 0,
            **(config or {}),
        },
    )

    async def _load_links() -> dict[str, str]:
        return dict(links or {})

    service._load_security_mode_links = _load_links  # type: ignore[method-assign]
    return service


class LinkageSourceTest(unittest.TestCase):
    def test_zones_source_is_excluded(self) -> None:
        """保存区域配置只同步前端，不应该重新激活家庭模式。"""
        self.assertIn("zones", NON_LINKAGE_SOURCES)
        home_mode = _HomeModeStub(modes=[{"id": "m1", "name": "离家模式"}])
        linkage = _linkage(home_mode, links={"armed_away": "m1"})
        asyncio.run(linkage._on_security_mode_changed({"mode": "armed_away", "source": "zones"}))
        self.assertEqual(home_mode.calls, [])


class ManualSourceTest(unittest.TestCase):
    def test_manual_panel_change_enters_arbiter_as_user(self) -> None:
        home_mode = _HomeModeStub(modes=[{"id": "m1", "name": "离家模式"}])
        linkage = _linkage(home_mode, links={"armed_away": "m1"})
        asyncio.run(linkage._on_security_mode_changed({"mode": "armed_away", "source": "manual"}))
        self.assertEqual(len(home_mode.activations), 1)
        mode_id, meta = home_mode.activations[0]
        self.assertEqual(mode_id, "m1")
        # source 保持 security（决定动作去重与日志），仲裁维度必须是 manual。
        self.assertEqual(meta["source"], "security")
        self.assertEqual(meta["arbiterSource"], "manual")
        self.assertEqual(linkage._security_linked_mode_id, "m1")

    def test_automatic_source_keeps_arbiter_source_unset(self) -> None:
        home_mode = _HomeModeStub(modes=[{"id": "m1", "name": "离家模式"}])
        linkage = _linkage(home_mode, links={"armed_away": "m1"})
        asyncio.run(linkage._on_security_mode_changed({"mode": "armed_away", "source": "presence"}))
        _mode_id, meta = home_mode.activations[0]
        self.assertNotIn("arbiterSource", meta)


class DisarmTargetTest(unittest.TestCase):
    def test_disarm_exits_security_linked_mode_not_primary(self) -> None:
        """default 组「离家」+ comfort 组「睡眠」同时激活时，撤防要退离家。"""
        home_mode = _HomeModeStub(active=[{"id": "m_away", "exclusiveGroup": "default"}, {"id": "m_sleep"}])
        linkage = _linkage(home_mode, links={"armed_away": "m_away"})
        asyncio.run(linkage._on_security_mode_changed({"mode": "disarmed", "source": "manual"}))
        self.assertEqual(home_mode.calls, [("deactivate", "m_away")])

    def test_disarm_prefers_last_linked_mode_from_this_process(self) -> None:
        home_mode = _HomeModeStub(
            active=[{"id": "m_away"}, {"id": "m_guest"}],
        )
        linkage = _linkage(home_mode, links={})
        linkage._security_linked_mode_id = "m_guest"
        asyncio.run(linkage._on_security_mode_changed({"mode": "disarmed", "source": "manual"}))
        self.assertEqual(home_mode.calls, [("deactivate", "m_guest")])

    def test_disarm_with_no_known_target_keeps_legacy_behaviour(self) -> None:
        home_mode = _HomeModeStub(active=[])
        linkage = _linkage(home_mode, links={"armed_away": "m_away"})
        asyncio.run(linkage._on_security_mode_changed({"mode": "disarmed", "source": "manual"}))
        self.assertEqual(home_mode.calls, [("deactivate", None)])


class StaleLinkTest(unittest.TestCase):
    def test_stale_link_falls_back_to_name_match(self) -> None:
        decision = resolve_home_mode_link_for_security_change(
            mode="armed_away",
            linked_id="deleted-mode",
            modes=[{"id": "m2", "name": "离家模式"}],
            allow_name_fallback=True,
        )
        self.assertEqual(decision, {"action": "activate", "modeId": "m2"})

    def test_stale_link_without_name_fallback_is_none(self) -> None:
        decision = resolve_home_mode_link_for_security_change(
            mode="armed_away",
            linked_id="deleted-mode",
            modes=[{"id": "m2", "name": "离家模式"}],
            allow_name_fallback=False,
        )
        self.assertEqual(decision, {"action": "none"})

    def test_stale_link_on_disarm_still_deactivates(self) -> None:
        decision = resolve_home_mode_link_for_security_change(
            mode="disarmed",
            linked_id="deleted-mode",
            modes=[],
            allow_name_fallback=True,
        )
        self.assertEqual(decision, {"action": "deactivate"})


class ZoneArmedOnSaveTest(unittest.TestCase):
    def test_type_change_recomputes_armed(self) -> None:
        """室内区改成外围区后，居家布防下必须参与告警。"""
        self.assertTrue(resolve_zone_armed_on_save("armed_home", "perimeter", {"zoneType": "interior", "armed": False}))

    def test_same_type_preserves_user_selection(self) -> None:
        self.assertTrue(resolve_zone_armed_on_save("armed_home", "interior", {"zoneType": "interior", "armed": True}))
        self.assertFalse(resolve_zone_armed_on_save("armed_home", "interior", {"zoneType": "interior", "armed": False}))

    def test_new_zone_derives_from_mode(self) -> None:
        self.assertFalse(resolve_zone_armed_on_save("armed_home", "interior", None))
        self.assertTrue(resolve_zone_armed_on_save("armed_away", "interior", None))
        self.assertFalse(resolve_zone_armed_on_save("disarmed", "perimeter", None))


class ManualLockDwellTest(unittest.TestCase):
    def test_blocked_dwell_reschedules_after_lock(self) -> None:
        """人工锁挡住本次降级后，必须在锁过期时重新判定，而不是静默丢弃。"""
        panel = _PanelStub(
            mode="armed_away",
            locked=True,
            lock_until=time.time() * 1000 + 5_000,
        )
        home_mode = _HomeModeStub()
        linkage = _linkage(home_mode, panel=panel)

        async def _scenario() -> None:
            await linkage._on_presence_changed({"memberId": "m1", "atHome": True})
            task = linkage._home_dwell_task
            self.assertIsNotNone(task, "人工锁期间应当重新调度 dwell 检查")
            assert task is not None
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            linkage._home_dwell_task = None

        asyncio.run(_scenario())
        self.assertEqual(panel.arms, [])
        self.assertEqual(home_mode.calls, [])


if __name__ == "__main__":
    unittest.main()
