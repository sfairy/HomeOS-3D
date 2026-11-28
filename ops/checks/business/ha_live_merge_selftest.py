#!/usr/bin/env python3
"""HA 实时合并队列自检：同实体的「变化 + 删除」不能丢掉删除标记。

## 为什么需要它

``LiveStateEventQueue`` 把同一批窗内同一实体的多条事件合并成一条（留首包
``old_state``、取末包 ``new_state``）。HA 在删实体时会先发状态变化、再发
``new_state=None`` 的删除事件；旧实现只覆盖 ``new_state``，``removed_entity_id``
留在首包（通常是 ``None``）—— 下游据此不删实体，``/api/v1/entities`` 与墙屏会一直
显示一个已经不存在的设备，直到下一轮全量对账（默认数小时）。

反向顺序（先删后加）同样要清掉删除标记，否则刚重建的实体会被当成删除。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.ha.integration.live_events import LiveStateEventQueue

ENTITY = "sensor.elec_today"


def build() -> LiveStateEventQueue:
    return LiveStateEventQueue(lambda *args, **kwargs: None)


def state_change(state: str) -> dict:
    return {
        "entity_id": None,
        "old_state": None,
        "new_state": {"entity_id": ENTITY, "state": state},
        "time_fired": "2026-11-28T10:00:00Z",
        "removed_entity_id": None,
    }


def removal() -> dict:
    return {
        "entity_id": None,
        "old_state": {"entity_id": ENTITY, "state": "on"},
        "new_state": None,
        "time_fired": "2026-11-28T10:00:01Z",
        "removed_entity_id": ENTITY,
    }


def test_change_then_removal_keeps_marker() -> None:
    queue = build()
    queue.enqueue(state_change("on"), entity_id=ENTITY)
    queue.enqueue(removal(), entity_id=ENTITY)
    merged = queue._pending[ENTITY]
    check("合并后仍标记删除", merged["removed_entity_id"] == ENTITY, str(merged))
    check("合并后 new_state 为空", merged["new_state"] is None, str(merged))


def test_removal_then_readd_clears_marker() -> None:
    queue = build()
    queue.enqueue(removal(), entity_id=ENTITY)
    queue.enqueue(state_change("on"), entity_id=ENTITY)
    merged = queue._pending[ENTITY]
    check("重新出现后清除删除标记", merged["removed_entity_id"] is None, str(merged))
    check("重新出现后带有新状态", merged["new_state"] is not None, str(merged))


def main() -> int:
    test_change_then_removal_keeps_marker()
    test_removal_then_readd_clears_marker()
    report("HA 实时合并队列")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
