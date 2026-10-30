"""T2 回归：WS 握手期间断连（connect / disconnect 竞态）不得留下永久死 sid。

背景：socket.io 的 connect 与 disconnect 处理函数跑在**各自的 task** 里（engineio 对
每个消息都走 start_background_task），所以已登录客户端「连上就断」（刷新页面、断网、
重连风暴）时，``_on_disconnect`` 完全可能先于 ``_on_connect`` 的登记动作执行完毕：
清理时 connected / _baseline_ready / 订阅索引 / 会话镜像里都还没有这个 sid，清理全部是
no-op；随后握手继续跑，把 sid 写进这些集合，而第一次清理不会再有第二次机会 ——
该 sid 成为永久死 sid，参与之后的每一次广播（候选集只增不减；``_session_for`` 对缺失
会话 fail-open，死 sid 还会进入 ACL 过滤），且 ``socket_clients`` 计数虚高。

这里用真实的 ``ConnectionLifecycleMixin`` / ``SubscriptionIndexMixin``，只替换
socket.io、DB 会话与授权/HA 状态等外部依赖，把「鉴权线程挂起期间断连」这个交错窗口
确定性地复现出来（把 ``asyncio.to_thread`` 包一层事件等待即可）。

第三个用例是负向对照：把墓碑集合换成「忽略 add」的 set（等价于修复前的行为）后，
同样的断言会复现泄漏 —— 保证前两个用例真的能抓到该 bug，而不是碰巧通过。
"""

from __future__ import annotations

import asyncio
import contextlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.realtime import gateway_lifecycle
from src.realtime.gateway_lifecycle import ConnectionLifecycleMixin
from src.realtime.gateway_subscriptions import SubscriptionIndexMixin
from src.realtime.state_store import StateStore
from src.realtime.ws_config import WsPushConfig

_WS_USER = {"userId": "u1", "username": "u1", "restrictions": None}


class FakeSio:
    """只实现握手路径真正会调到的 socket.io 接口（不启动引擎）。"""

    def __init__(self) -> None:
        self.sessions: dict[str, dict[str, Any]] = {}
        self.rooms: dict[str, set[str]] = {}
        self.emitted: list[tuple[str, Any, str | None]] = []
        self.eio = None

    async def save_session(self, sid: str, data: dict[str, Any]) -> None:
        self.sessions[sid] = dict(data)

    async def get_session(self, sid: str) -> dict[str, Any] | None:
        return self.sessions.get(sid)

    async def enter_room(self, sid: str, room: str) -> None:
        self.rooms.setdefault(sid, set()).add(room)

    async def emit(self, event: str, data: Any = None, to: str | None = None) -> None:
        self.emitted.append((event, data, to))


class FakeGateway(ConnectionLifecycleMixin, SubscriptionIndexMixin):
    """组合真实 mixin，把 socket.io / DB / 授权 / HA 状态换成假实现。"""

    def __init__(self, sio: FakeSio | None = None) -> None:
        self.sio = sio or FakeSio()
        self.state_store = StateStore()
        self.connected: set[str] = set()
        self._baseline_ready: set[str] = set()
        self._indexed_sids: set[str] = set()
        self._resync_pending: set[str] = set()
        self._sessions: dict[str, dict[str, Any]] = {}
        self._sub_domain_sids: dict[str, set[str]] = {}
        self._sub_wildcard_sids: set[str] = set()
        self._sub_pinned_sids: dict[str, set[str]] = {}
        self._sid_sub_domains: dict[str, set[str] | None] = {}
        self._sid_pinned: dict[str, set[str]] = {}
        self._connecting: set[str] = set()
        self._closed_sids: set[str] = set()
        self._license_listener_registered = False
        self._loop = None
        self.settings = SimpleNamespace(cookie_name="auth_token", license_required=False)
        self._ws_config_value = WsPushConfig()
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                database=SimpleNamespace(session_factory=lambda: contextlib.nullcontext(None)),
                license_service=None,
                socket_clients=0,
            )
        )

    # —— 由 RealtimeGateway 提供的窄接口 ——
    def _ha_configured(self) -> bool:
        return False

    def _ha_status_snapshot(self) -> dict[str, Any]:
        return {"connected": False, "ha_version": None}

    def _ws_config(self) -> WsPushConfig:
        return self._ws_config_value

    def _apply_state_config(self) -> None:
        return None


def _patch_handshake(gateway_lifecycle_module: Any, *, resolve_started: asyncio.Event,
                     release_resolve: asyncio.Event):
    """把鉴权线程的挂起窗口变成确定性的 await：进入即置 resolve_started，等测试放行。"""
    real_to_thread = asyncio.to_thread

    async def fake_to_thread(fn: Any, *args: Any, **kwargs: Any) -> Any:
        resolve_started.set()
        await release_resolve.wait()
        return await real_to_thread(fn, *args, **kwargs)

    return (
        patch.object(gateway_lifecycle_module.asyncio, "to_thread", fake_to_thread),
        patch.object(gateway_lifecycle_module, "extract_auth_token_from_cookie", lambda header, name: "tok"),
        patch.object(gateway_lifecycle_module, "resolve_ws_user", lambda token, session: dict(_WS_USER)),
    )


class ConnectDisconnectRaceTest(unittest.IsolatedAsyncioTestCase):
    async def _race(self, gateway: FakeGateway) -> asyncio.Task[None]:
        """启动握手 → 在鉴权线程挂起时断连 → 放行握手 → 返回已完成的握手 task。"""
        resolve_started = asyncio.Event()
        release_resolve = asyncio.Event()
        patches = _patch_handshake(
            gateway_lifecycle, resolve_started=resolve_started, release_resolve=release_resolve
        )
        with patches[0], patches[1], patches[2]:
            task = asyncio.create_task(
                gateway._on_connect("sid1", {"HTTP_COOKIE": "auth_token=tok"}, {})
            )
            await asyncio.wait_for(resolve_started.wait(), timeout=2)
            # 此刻握手停在「运行工作线程鉴权」的 await 上：真实环境里 engineio 已经可以
            # 在另一个 task 里把 disconnect 处理函数跑完。
            self.assertIn("sid1", gateway._connecting)
            self.assertNotIn("sid1", gateway.connected)
            await gateway._on_disconnect("sid1", "client disconnect")
            release_resolve.set()
            await asyncio.wait_for(task, timeout=5)
        return task

    def _assert_no_residue(self, gateway: FakeGateway) -> None:
        self.assertNotIn("sid1", gateway.connected, "死 sid 残留在 connected：会进入 disconnect_user/disconnect_all 的遍历")
        self.assertNotIn("sid1", gateway._baseline_ready, "死 sid 残留在 _baseline_ready：会参与每次广播")
        self.assertNotIn("sid1", gateway._sessions, "死 sid 残留在会话镜像：fail-open 参与 ACL 过滤")
        self.assertEqual(gateway._sub_domain_sids, {})
        self.assertEqual(gateway._sub_wildcard_sids, set())
        self.assertEqual(gateway._sub_pinned_sids, {})
        self.assertEqual(gateway._sid_sub_domains, {})
        self.assertEqual(gateway._sid_pinned, {})
        self.assertEqual(gateway.app.state.socket_clients, 0)
        self.assertEqual(gateway._connecting, set())
        self.assertEqual(gateway._closed_sids, set())

    async def test_disconnect_during_handshake_is_cleaned_up(self) -> None:
        """修复后：握手期间断连的 sid 在握手收尾时必须被完整清理。"""
        gateway = FakeGateway()
        await self._race(gateway)
        self._assert_no_residue(gateway)

    async def test_normal_connect_still_registers(self) -> None:
        """对照：没有断连时握手照常登记（守卫/墓碑不能误杀正常连接）。"""
        gateway = FakeGateway()
        resolve_started = asyncio.Event()
        release_resolve = asyncio.Event()
        release_resolve.set()  # 不制造交错窗口
        patches = _patch_handshake(gateway_lifecycle, resolve_started=resolve_started,
                                   release_resolve=release_resolve)
        with patches[0], patches[1], patches[2]:
            await asyncio.wait_for(
                gateway._on_connect("sid1", {"HTTP_COOKIE": "auth_token=tok"}, {}), timeout=5
            )
        self.assertIn("sid1", gateway.connected)
        self.assertIn("sid1", gateway._baseline_ready)
        self.assertIn("sid1", gateway._sessions)
        self.assertEqual(gateway._sub_wildcard_sids, {"sid1"})
        self.assertEqual(gateway.app.state.socket_clients, 1)
        self.assertEqual(gateway._connecting, set())
        self.assertEqual(gateway._closed_sids, set())
        events = [event for event, _data, to in gateway.sio.emitted if to == "sid1"]
        self.assertIn("initial_states", events)
        self.assertIn("ha_status", events)

    async def test_race_reproduces_without_tombstone(self) -> None:
        """负向对照：没有墓碑（≈修复前的行为）时，同一时序必然泄漏 —— 证明上面的断言有效。"""
        gateway = FakeGateway()
        gateway._closed_sids = _NoTombstoneSet()
        await self._race(gateway)
        self.assertIn("sid1", gateway.connected)
        self.assertIn("sid1", gateway._baseline_ready)
        self.assertIn("sid1", gateway._sessions)
        self.assertEqual(gateway.app.state.socket_clients, 1)


class _NoTombstoneSet(set[str]):
    """模拟修复前的行为：断连清理留不下墓碑。"""

    def add(self, element: str) -> None:
        return None


if __name__ == "__main__":
    unittest.main()
