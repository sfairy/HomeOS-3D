#!/usr/bin/env python3
"""WS 扇出基准：``RealtimeGateway.broadcast_state_changed_batch`` 的 CPU 与字节成本。

驱动的是**真代码**（真网关、真可见性判定、真分桶与背压逻辑），只把两个外部副作用
换成记录器：

- ``sio`` → ``RecordingSio``：不真的走 engineio，只按真实序列化器（msgpack）编码一次并记账，
  这样「一批广播序列化了几次、发出多少字节」变成可断言的确定性指标；
- 事件日志 → ``None``：本基准只测扇出本身，日志成本由 ``bench_eventlog.py`` 单独量。

连接形态刻意做出差异（这是真实安装的常态，也是分桶逻辑的意义所在）：

- 一部分连接 ``subscribedDomains`` 为 ``None``（不限域）；
- 一部分按区域订阅（``areaIds``，走 ``entity_area.resolve_scope_entities``，可见集各不相同）；
- 每个连接钉选若干**真的会变**的实体（否则 ``has_pinned`` 恒为 False，分桶永远只有一桶）。

用法：
    node ops/lib/py.mjs ops/bench/bench_fanout.py
    node ops/lib/py.mjs ops/bench/bench_fanout.py --changes 1000 --connections 20 --iterations 30
"""

from __future__ import annotations

import argparse
import asyncio
import time
from typing import Any

import msgpack
from _support import make_changes, measure, report, timing_summary

from homeos.backend.src.realtime.gateway import RealtimeGateway
from homeos.backend.src.realtime.ws_config import WsPushConfig

#: 一台“房间墙板”只看自己房间的实体；这里按实体序号取模模拟房间归属。
AREA_STRIDE = 12


class FakeEntityArea:
    """``entity_area`` 的最小替身：按 areaIds 返回该房间的实体集合。"""

    def resolve_scope_entities(self, area_ids: Any, device_ids: Any) -> set[str]:
        areas = [str(item) for item in (area_ids or ())]
        entities: set[str] = set()
        for area in areas:
            suffix = area.rsplit("_", 1)[-1]
            if not suffix.isdigit():
                continue
            offset = int(suffix) % AREA_STRIDE
            entities.update(f"light.bench_{index}" for index in range(offset, 200, AREA_STRIDE))
        return entities


class _State:
    """``app.state`` 的最小替身：扇出路径只读 ``event_log`` / ``entity_area``。"""

    event_log: Any = None

    def __init__(self) -> None:
        self.entity_area = FakeEntityArea()


class _App:
    def __init__(self) -> None:
        self.state = _State()


class RecordingSio:
    """记录每次 emit 的序列化次数与字节数（不真的发送）。

    ``eio`` 显式置 None：``_is_socket_backpressured`` 据此判「非 websocket 传输」并放行，
    正好隔离掉与本次基准无关的背压分支。
    """

    def __init__(self) -> None:
        self.eio = None
        self.emit_calls = 0
        self.serializations = 0
        self.bytes_sent = 0

    async def emit(self, event: str, data: Any = None, to: Any = None, **kwargs: Any) -> None:
        self.emit_calls += 1
        encoded = bytes(msgpack.packb({"event": event, "data": data}, use_bin_type=True))
        self.serializations += 1
        self.bytes_sent += len(encoded)

    async def enter_room(self, sid: str, room: str) -> None:
        return None

    async def leave_room(self, sid: str, room: str) -> None:
        return None

    def reset(self) -> None:
        self.emit_calls = 0
        self.serializations = 0
        self.bytes_sent = 0


def build_gateway(connections: int, *, pinned_per_connection: int) -> tuple[RealtimeGateway, RecordingSio]:
    """构造网关并预置 ``connections`` 个已就绪连接（含会话镜像与订阅索引）。"""
    gateway = RealtimeGateway(_App())
    recorder = RecordingSio()
    gateway.sio = recorder  # type: ignore[assignment]
    # 配置走内存，避免每轮广播触发一次 SQLite 读取（那属于另一条链路的成本）。
    gateway._ws_cfg_cache = WsPushConfig()
    gateway._ws_cfg_at = time.monotonic()
    gateway._state_cfg_at = time.monotonic()

    for index in range(connections):
        sid = f"s{index}"
        session: dict[str, Any] = {"user": {"userId": f"u{index % 3}"}}
        # 三档订阅形态：不限域 / 只订 light / 订阅若干域 + 区域范围。
        if index % 5 == 0:
            session["subscribedDomains"] = None
        elif index % 3 == 0:
            session["subscribedDomains"] = ["light"]
        else:
            session["subscribedDomains"] = ["light", "switch", "sensor"]
            session["areaIds"] = [f"area_{index % 4}"]
        # 钉选实体必须落在**本批会变**的集合里，否则 has_pinned 恒为 False。
        session["pinnedEntityIds"] = [
            f"light.bench_{(index * pinned_per_connection + slot) % 200}" for slot in range(pinned_per_connection)
        ]
        gateway._sessions[sid] = session
        gateway._index_subscription(sid, session["subscribedDomains"], session["pinnedEntityIds"])
        gateway._baseline_ready.add(sid)
    return gateway, recorder


def run(changes: int, connections: int, iterations: int, *, pinned_per_connection: int = 8) -> dict[str, Any]:
    gateway, recorder = build_gateway(connections, pinned_per_connection=pinned_per_connection)
    # 实体基数固定 200：可见集与钉选才有稳定含义（区域按 0..199 取模切片）。
    batch = make_changes(min(changes, 200))

    def once() -> None:
        asyncio.run(gateway.broadcast_state_changed_batch(batch))

    recorder.reset()
    once()
    first_emits = recorder.emit_calls
    first_bytes = recorder.bytes_sent
    first_serializations = recorder.serializations

    samples = measure(once, iterations)

    return {
        "changes": len(batch),
        "connections": connections,
        "emits_per_batch": first_emits,
        "serializations_per_batch": first_serializations,
        "bytes_per_batch": first_bytes,
        "latency_ms": timing_summary(samples),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WS 扇出基准")
    parser.add_argument("--changes", type=int, default=200, help="每批变更条数（上限 200，即实体基数）")
    parser.add_argument("--connections", type=int, default=5, help="已就绪连接数")
    parser.add_argument("--iterations", type=int, default=20)
    parser.add_argument("--pinned", type=int, default=8, help="每个连接的钉选实体数")
    args = parser.parse_args(argv)
    report(
        "fanout",
        run(args.changes, args.connections, args.iterations, pinned_per_connection=args.pinned),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
