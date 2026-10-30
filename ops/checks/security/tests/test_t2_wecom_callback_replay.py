"""T2 回归：企微回调必须拒绝过期报文并忽略重复 MsgId。

背景（审计发现 T2-002）：`POST /api/v1/channels/wecom/callback` 验签通过后直接
解密并派发，没有 timestamp 新鲜度校验，也没有 MsgId 去重。攻击者拿到一份历史
合法回调（例如从代理日志/抓包获得）即可无限重放，反复触发 `handle_incoming_message`。

修复后语义：
- timestamp 缺失、非整数或偏离当前时间超过 300 秒：403，不读 body / 不解密；
- 同一 MsgId（缺失时回退到签名元组）在 TTL 内重复到达：回 `success`，但不再派发；
- 不同 MsgId / 超过 TTL 的同一 MsgId：正常派发。
"""

from __future__ import annotations

import asyncio
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

BACKEND_ROOT = Path(__file__).resolve().parents[4] / "homeos" / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from src.api import channels
from src.domains.channels.wecom_crypto import compute_msg_signature

TOKEN = "test-token"
NONCE = "test-nonce"
ENCRYPT = "cipher-text"
BODY = b"<xml><Encrypt>cipher-text</Encrypt></xml>"


class FakeWecomService:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def get_security_config(self) -> dict[str, str]:
        return {"token": TOKEN, "aesKey": "unused"}

    async def handle_incoming_message(self, user: str, content: str) -> None:
        self.calls.append((user, content))


def make_request(service: FakeWecomService) -> SimpleNamespace:
    app = SimpleNamespace(state=SimpleNamespace(wecom_service=service))

    async def body() -> bytes:
        return BODY

    return SimpleNamespace(app=app, body=body)


def plain_xml(msg_id: str | None, content: str = "开灯") -> str:
    msg_id_xml = f"<MsgId>{msg_id}</MsgId>" if msg_id is not None else ""
    return (
        "<xml><ToUserName>corp</ToUserName><FromUserName>user-1</FromUserName>"
        f"<CreateTime>0</CreateTime><MsgType>text</MsgType>"
        f"<Content>{content}</Content>{msg_id_xml}</xml>"
    )


class WecomCallbackReplayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        channels._wecom_replay_seen.clear()

    def tearDown(self) -> None:
        channels._wecom_replay_seen.clear()

    async def invoke(
        self,
        service: FakeWecomService,
        timestamp: int | str,
        signature: str,
    ):
        return await channels.handle_callback(
            make_request(service),
            msg_signature=signature,
            timestamp=str(timestamp),
            nonce=NONCE,
        )

    def signature(self, timestamp: int | str) -> str:
        return compute_msg_signature(TOKEN, str(timestamp), NONCE, ENCRYPT)

    async def test_duplicate_msg_id_dispatches_once(self) -> None:
        now = int(time.time())
        service = FakeWecomService()
        with mock.patch.object(channels, "decrypt_wecom", return_value={"msg": plain_xml("1001")}):
            first = await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
            second = await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(service.calls, [("user-1", "开灯")])

    async def test_missing_msg_id_falls_back_to_signature_tuple(self) -> None:
        now = int(time.time())
        service = FakeWecomService()
        with mock.patch.object(channels, "decrypt_wecom", return_value={"msg": plain_xml(None)}):
            await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
            await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
        self.assertEqual(len(service.calls), 1)

    async def test_stale_timestamp_is_rejected_before_decrypt(self) -> None:
        stale = int(time.time()) - channels._WECOM_CALLBACK_TTL_SECONDS - 5
        service = FakeWecomService()
        with mock.patch.object(channels, "decrypt_wecom") as decrypt:
            response = await self.invoke(service, stale, self.signature(stale))
        self.assertEqual(response.status_code, 403)
        decrypt.assert_not_called()
        self.assertEqual(service.calls, [])

    async def test_malformed_timestamp_is_rejected(self) -> None:
        service = FakeWecomService()
        response = await self.invoke(service, "not-a-number", self.signature("not-a-number"))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(service.calls, [])

    async def test_distinct_msg_ids_are_both_dispatched(self) -> None:
        now = int(time.time())
        service = FakeWecomService()
        with mock.patch.object(
            channels,
            "decrypt_wecom",
            side_effect=[{"msg": plain_xml("2001")}, {"msg": plain_xml("2002")}],
        ):
            await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
            await self.invoke(service, now, self.signature(now))
            await asyncio.sleep(0)
        self.assertEqual(len(service.calls), 2)


if __name__ == "__main__":
    unittest.main()
