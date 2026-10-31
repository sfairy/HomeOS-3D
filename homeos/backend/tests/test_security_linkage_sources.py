"""安防联动的来源白名单回归：回滚来源不能再反向驱动家庭模式。

为什么这条必须守住
------------------
``HomeModeService.activate()`` 全程持有 ``_transition_lock``；激活失败时
``_abort_failed_activation`` 会用来源 ``home-mode-rollback`` 回滚安防面板，而
``SecurityPanel.arm()`` 在返回前就把 ``security.modeChanged`` 派发出去。如果联动
把这个事件当成「用户改了安防模式」，就会调用 ``home_mode.deactivate()`` —— 同一个
任务二次进入不可重入的 ``asyncio.Lock``，请求永久挂起且锁永不释放，之后所有
激活/退出（手动、存在感应、日历、定时）全部卡死到进程重启。

这里用桩对象直接喂事件，断言回滚来源不触发任何家庭模式调用。
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.security.linkage import NON_LINKAGE_SOURCES, SecurityLinkageService


class _BusStub:
    def on(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def emit(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _HomeModeStub:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def activate(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self.calls.append("activate")
        return {"success": True}

    async def deactivate(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self.calls.append("deactivate")
        return {"success": True}

    def find_all(self) -> list[dict[str, Any]]:
        return []


class _AwaySimStub:
    def get_status(self) -> dict[str, Any]:
        return {"enabled": False}

    async def enable(self) -> None:
        return None

    async def disable(self) -> None:
        return None


def _linkage(home_mode: _HomeModeStub, links: dict[str, str] | None = None) -> SecurityLinkageService:
    service = SecurityLinkageService(
        session_factory=lambda: None,
        bus=_BusStub(),
        panel=None,
        away_sim=_AwaySimStub(),
        home_mode=home_mode,
        # 默认配置就是「安防变化联动家庭模式」，这正是会踩雷的那一档
        config_reader=lambda: {"linkHomeModeOnSecurityChange": True},
    )

    async def _load_links() -> dict[str, str]:
        return dict(links or {})

    service._load_security_mode_links = _load_links  # type: ignore[method-assign]
    return service


class NonLinkageSourceTest(unittest.TestCase):
    def test_rollback_source_is_excluded(self) -> None:
        self.assertIn("home-mode-rollback", NON_LINKAGE_SOURCES)
        self.assertIn("emergency", NON_LINKAGE_SOURCES)
        self.assertIn("home-mode", NON_LINKAGE_SOURCES)

    def test_rollback_does_not_re_enter_home_mode(self) -> None:
        home_mode = _HomeModeStub()
        linkage = _linkage(home_mode)
        asyncio.run(linkage._on_security_mode_changed({"mode": "disarmed", "source": "home-mode-rollback"}))
        self.assertEqual(home_mode.calls, [])

    def test_user_initiated_change_still_links(self) -> None:
        """用户自己撤防仍然要退出家庭模式（白名单不能误伤正常联动）。"""
        home_mode = _HomeModeStub()
        linkage = _linkage(home_mode)
        asyncio.run(linkage._on_security_mode_changed({"mode": "disarmed", "source": "manual"}))
        self.assertEqual(home_mode.calls, ["deactivate"])


if __name__ == "__main__":
    unittest.main()
