"""后端发起播报的决策链：总开关 / 冷却 / 输出方式。

这条链路绕开了前端，所以「关闭语音播报后音箱还会说话」「local 模式照样走 HA」
这类问题只能在这里拦。测试逐条钉住决策顺序：开关 → 冷却 → 输出方式。

运行：node ops/lib/py.mjs -m unittest discover -s homeos/backend/tests -t homeos/backend -v
"""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.domains.awareness.tts_speak import TtsSpeakService
from src.realtime.gateway_broadcasts import BroadcastMixin


class _Config:
    """最小 ``app_config`` 替身：只实现 ``get(section)``。"""

    def __init__(self, sections: dict[str, dict]) -> None:
        self._sections = sections

    def get(self, name: str) -> dict:
        return dict(self._sections.get(name) or {})


def _speak_service(**sections: Any) -> TtsSpeakService:
    return TtsSpeakService(_Config(sections), ha_connector=object())


class _FakeSio:
    def __init__(self) -> None:
        self.emitted: list[tuple[str, dict]] = []

    async def emit(self, event: str, payload: dict) -> None:
        self.emitted.append((event, payload))


class _Gateway(BroadcastMixin):
    """只装广播所需的最小状态，不启动 socketio。"""

    def __init__(self, connected: int = 0) -> None:
        self.sio = _FakeSio()
        self.connected = {f"sid-{i}" for i in range(connected)}
        self.app = object()

    @property
    def last_payload(self) -> dict:
        for event, payload in reversed(self.sio.emitted):
            if event == "tts_speak":
                return payload
        raise AssertionError("没有广播 tts_speak")


class _FakeTtsSpeak:
    """可编程的 ``TtsSpeakService`` 替身：记录是否真的下发到音箱。"""

    def __init__(
        self,
        *,
        enabled: bool = True,
        mode: str = "ha",
        allow: bool = True,
        speak_ok: bool = True,
    ) -> None:
        self._enabled = enabled
        self._mode = mode
        self._allow = allow
        self._speak_ok = speak_ok
        self.spoken: list[str] = []
        self.released: list[str] = []

    def enabled(self) -> bool:
        return self._enabled

    def output_mode(self) -> str:
        return self._mode

    def should_announce(self, text: str) -> tuple[bool, str]:
        return (self._allow, "" if self._allow else "cooldown")

    def release_announce(self, text: str) -> None:
        self.released.append(text)

    async def speak(self, message: str, opts: dict | None = None) -> dict:
        self.spoken.append(message)
        if self._speak_ok:
            return {"success": True, "message": "已播报"}
        return {"success": False, "message": "音箱无响应"}


def _broadcast(gateway: _Gateway, tts: _FakeTtsSpeak, message: str = "该关窗了") -> dict:
    asyncio.run(gateway.broadcast_tts_speak({"message": message}, tts))
    return gateway.last_payload


class TtsSpeakSwitchTest(unittest.TestCase):
    def test_default_enabled(self) -> None:
        self.assertTrue(_speak_service().enabled())

    def test_master_switch_off(self) -> None:
        service = _speak_service(voice={"ttsEnabled": False})
        self.assertFalse(service.enabled())

    def test_output_mode_normalized(self) -> None:
        self.assertEqual(_speak_service(voice={"ttsOutputMode": "local"}).output_mode(), "local")
        # 非法值回落 ha，避免脏配置把自动播报整个关掉
        self.assertEqual(_speak_service(voice={"ttsOutputMode": "bogus"}).output_mode(), "ha")
        self.assertEqual(_speak_service().output_mode(), "ha")


class TtsAnnounceCooldownTest(unittest.TestCase):
    def test_zero_cooldown_never_dedups(self) -> None:
        service = _speak_service(other={"speakCooldownMin": 0})
        self.assertEqual(service.should_announce("该关窗了"), (True, ""))
        self.assertEqual(service.should_announce("该关窗了"), (True, ""))

    def test_repeat_within_window_skipped(self) -> None:
        service = _speak_service(other={"speakCooldownMin": 10})
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1000.0):
            self.assertEqual(service.should_announce("该关窗了"), (True, ""))
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1060.0):
            allowed, reason = service.should_announce("该关窗了")
        self.assertFalse(allowed)
        self.assertEqual(reason, "cooldown")

    def test_window_expiry_allows_again(self) -> None:
        service = _speak_service(other={"speakCooldownMin": 10})
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1000.0):
            service.should_announce("该关窗了")
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1000.0 + 601):
            self.assertTrue(service.should_announce("该关窗了")[0])

    def test_punctuation_and_space_ignored(self) -> None:
        service = _speak_service(other={"speakCooldownMin": 10})
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1000.0):
            self.assertTrue(service.should_announce("该关窗了。")[0])
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1001.0):
            # 同一句话换个标点不该再播一遍
            self.assertFalse(service.should_announce("该 关窗 了！")[0])

    def test_release_frees_the_slot(self) -> None:
        service = _speak_service(other={"speakCooldownMin": 10})
        with patch("src.domains.awareness.tts_speak.time.monotonic", return_value=1000.0):
            service.should_announce("该关窗了")
            self.assertFalse(service.should_announce("该关窗了")[0])
            service.release_announce("该关窗了")
            # 失败一次不该把整个窗口的机会吃掉
            self.assertTrue(service.should_announce("该关窗了")[0])


class BroadcastDeliveryTest(unittest.TestCase):
    def test_disabled_switch_skips_without_speaking(self) -> None:
        gateway = _Gateway()
        tts = _FakeTtsSpeak(enabled=False)
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "skipped")
        self.assertEqual(payload["reason"], "tts-disabled")
        self.assertIsNone(payload["success"])
        self.assertEqual(tts.spoken, [])

    def test_cooldown_skip_does_not_speak(self) -> None:
        gateway = _Gateway()
        tts = _FakeTtsSpeak(allow=False)
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "skipped")
        self.assertEqual(payload["reason"], "cooldown")
        self.assertEqual(tts.spoken, [])

    def test_local_mode_delivers_to_client(self) -> None:
        gateway = _Gateway(connected=1)
        tts = _FakeTtsSpeak(mode="local")
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "client")
        # local 模式仍要广播给所有终端，由前端本机发声
        self.assertEqual(payload["message"], "该关窗了")
        self.assertEqual(tts.spoken, [])

    def test_auto_mode_prefers_client_when_terminal_online(self) -> None:
        gateway = _Gateway(connected=1)
        tts = _FakeTtsSpeak(mode="auto")
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "client")
        self.assertEqual(tts.spoken, [])

    def test_auto_mode_without_terminal_falls_back_to_ha(self) -> None:
        gateway = _Gateway(connected=0)
        tts = _FakeTtsSpeak(mode="auto")
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "ha")
        self.assertTrue(payload["success"])
        self.assertEqual(tts.spoken, ["该关窗了"])

    def test_ha_failure_releases_cooldown(self) -> None:
        gateway = _Gateway()
        tts = _FakeTtsSpeak(mode="ha", speak_ok=False)
        payload = _broadcast(gateway, tts)
        self.assertEqual(payload["delivery"], "ha")
        self.assertFalse(payload["success"])
        self.assertEqual(tts.released, ["该关窗了"])

    def test_empty_message_skipped(self) -> None:
        gateway = _Gateway()
        tts = _FakeTtsSpeak()
        payload = _broadcast(gateway, tts, message="   ")
        self.assertEqual(payload["delivery"], "skipped")
        self.assertEqual(payload["reason"], "empty-message")
        self.assertEqual(tts.spoken, [])


if __name__ == "__main__":
    unittest.main()
