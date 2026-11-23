#!/usr/bin/env python3
"""命令出口自检：离线待下发队列（不需要 pytest）。

背景（审计 P25）
----------------
HA 重启 / 断网通常只有几十秒，而旧实现里「HA 未连接 + 非高风险命令」会直接尝试下发
并失败：用户点灯看到报错，以为面板坏了；连点几次就产生一串失败请求。现在幂等控制命令
（灯 / 开关 / 风扇 / 窗帘 / 空调 / 媒体）先入待下发队列，重连后按序补发。

本自检钉住四条边界：

1. 可重放的幂等命令在断连时**入队**并返回 ``queued/pending``（不是直接失败）；
2. 同一实体反复操作只保留**最后一条意图**（队列长度与设备数同阶）；
3. 高风险命令（lock/unlock）与不可重放服务（toggle / play_media）**不入队**；
4. 重连补发会真的下发，并在 HA 再次断连时**停止**（剩余条目留给下一次）。

用法：
    node ops/lib/py.mjs ops/checks/command_proxy_selftest.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.domains.proxy.command_proxy import CommandProxyService
from homeos.backend.src.platform.core.http.errors import BusinessException

CHECKS: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


class FakeConnector:
    """可控的连接器：``connected`` 切换即可模拟断连 / 重连。"""

    def __init__(self) -> None:
        self.connected = False
        self.calls: list[tuple[str, str, str]] = []
        self.fail_next = 0

    async def get_status(self) -> dict[str, Any]:
        return {"connected": self.connected}

    async def call_service(
        self,
        domain: str,
        service: str,
        entity_id: str,
        service_data: dict[str, Any],
        return_response: bool,
        idempotency_key: str | None,
    ) -> dict[str, Any]:
        if self.fail_next > 0:
            self.fail_next -= 1
            raise RuntimeError("HA not connected")
        self.calls.append((domain, service, entity_id))
        return {"ok": True, "entity_id": entity_id}


def build(connected: bool = False) -> tuple[CommandProxyService, FakeConnector]:
    connector = FakeConnector()
    connector.connected = connected
    service = CommandProxyService(session_factory=lambda: None, connector=connector)
    return service, connector


def dto(domain: str, service_name: str, entity: str, **extra: Any) -> dict[str, Any]:
    return {"domain": domain, "service": service_name, "entity_id": entity, "service_data": dict(extra)}


def test_offline_enqueue() -> None:
    proxy, connector = build(connected=False)
    result = asyncio.run(proxy.call_service(dto("light", "turn_on", "light.a")))
    check("断连时入队而非失败", result["queued"] is True and result["pending"] is True, str(result))
    check("待下发计数为 1", proxy.offline_pending_count() == 1, str(proxy.offline_pending_count()))
    check("断连期间没有真的下发", connector.calls == [], str(connector.calls))


def test_last_intent_wins() -> None:
    proxy, _connector = build(connected=False)

    async def run() -> None:
        await proxy.call_service(dto("light", "turn_on", "light.a"))
        await proxy.call_service(dto("switch", "turn_on", "switch.b"))
        await proxy.call_service(dto("light", "turn_off", "light.a"))
        await proxy.call_service(dto("light", "turn_on", "light.a"))

    asyncio.run(run())
    check("同一实体只留一条意图", proxy.offline_pending_count() == 2, str(proxy.offline_pending_count()))
    queued = proxy._offline_queue["light.a"][1]
    check("留下的是最后一次意图", queued["service"] == "turn_on", str(queued["service"]))


def test_not_replayable() -> None:
    proxy, _connector = build(connected=False)

    async def run_dangerous() -> None:
        try:
            await proxy.call_service(dto("lock", "unlock", "lock.front_door"))
        except BusinessException:
            return
        raise AssertionError("高风险命令应当在断连时被拒绝")

    asyncio.run(run_dangerous())
    check("高风险命令不入队", proxy.offline_pending_count() == 0, str(proxy.offline_pending_count()))

    async def run_toggle() -> None:
        # 非幂等 service 不进队列（会走到「直接下发」，断连时抛业务异常）
        try:
            await proxy.call_service(dto("light", "toggle", "light.a"))
        except BusinessException:
            return
        raise AssertionError("toggle 在断连时应当失败而不是排队")

    asyncio.run(run_toggle())
    check("toggle 不入队", proxy.offline_pending_count() == 0, str(proxy.offline_pending_count()))


def test_replay() -> None:
    proxy, connector = build(connected=False)

    async def run() -> int:
        await proxy.call_service(dto("light", "turn_on", "light.a"))
        await proxy.call_service(dto("cover", "open_cover", "cover.b"))
        connector.connected = True
        return await proxy.replay_offline()

    replayed = asyncio.run(run())
    check("补发返回成功条数 2", replayed == 2, str(replayed))
    check(
        "重连后两条都补发",
        connector.calls == [("light", "turn_on", "light.a"), ("cover", "open_cover", "cover.b")],
        str(connector.calls),
    )
    check("队列已清空", proxy.offline_pending_count() == 0, str(proxy.offline_pending_count()))


def test_replay_stops_when_disconnected_again() -> None:
    proxy, connector = build(connected=False)

    async def run() -> None:
        await proxy.call_service(dto("light", "turn_on", "light.a"))
        await proxy.call_service(dto("light", "turn_on", "light.b"))
        connector.connected = True
        connector.fail_next = 1  # 第一条补发时 HA 又断了
        await proxy.replay_offline()

    asyncio.run(run())
    check("再次断连时停止补发并保留剩余条目", proxy.offline_pending_count() == 2, str(proxy.offline_pending_count()))


def test_online_path_unchanged() -> None:
    proxy, connector = build(connected=True)

    async def run() -> dict[str, Any]:
        return await proxy.call_service(dto("light", "turn_on", "light.a"))

    result = asyncio.run(run())
    check("在线时直接下发", connector.calls == [("light", "turn_on", "light.a")], str(connector.calls))
    check("在线时不标记为排队", bool(result.get("queued")) is False, str(result.get("queued")))
    check("在线时队列为空", proxy.offline_pending_count() == 0)


def main() -> int:
    test_offline_enqueue()
    test_last_intent_wins()
    test_not_replayable()
    test_replay()
    test_replay_stops_when_disconnected_again()
    test_online_path_unchanged()
    print(f"命令出口自检通过：{len(CHECKS)} 项")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
