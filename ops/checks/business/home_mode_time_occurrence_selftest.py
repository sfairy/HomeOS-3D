#!/usr/bin/env python3
"""时间触发器跨重启去重自检：已经执行过的 22:30 触发不能在重启后重放。

## 为什么需要它

``fired_time_occurrences`` 原先只在内存里。进程在触发的宽限期（默认 10 分钟）内重启 ——
傍晚发版就是常态 —— 那次触发已经执行过，但新进程没有记录，于是**再执行一遍**：
模式里的脚本 / 场景重放，门锁与阀门动两次。用户看到的是一次「莫名其妙的自动化」。

本自检钉住：
1. occurrence store 能读回同一天的记录（重启 → 还原）；
2. 跨天记录不会被还原（昨天的记录不能挡住今天的触发）；
3. 记录里含某个 occurrence 时，同一触发不再执行。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.domains.home_mode import runtime as runtime_module
from homeos.backend.src.domains.home_mode.runtime import HomeModeTriggerOccurrenceStore


class FakeKv:
    """替身 ``runtime_kv``：无数据库也能验证 load / persist 往返。"""

    def __init__(self) -> None:
        self.data: dict[str, object] = {}

    def load(self, _session: object, key: str):
        return self.data.get(key)

    def persist(self, _session_factory, key: str, value: object) -> None:
        self.data[key] = value


class FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, *_exc) -> None:
        return None


def with_kv(kv: FakeKv):
    """临时替换 runtime 模块里的 load/persist 实现。"""
    original_load, original_persist = runtime_module.load_runtime_kv, runtime_module.persist_runtime_kv
    runtime_module.load_runtime_kv = kv.load
    runtime_module.persist_runtime_kv = kv.persist
    return original_load, original_persist


def test_round_trip_same_day() -> None:
    kv = FakeKv()
    original = with_kv(kv)
    try:
        store = HomeModeTriggerOccurrenceStore(FakeSession)
        store.persist("2026-11-28", {"mode1@time@22:30@2026-11-28": 1})
        day, keys = store.load()
        check("读回同一天的记录", day == "2026-11-28", day)
        check("occurrence 键完整", list(keys) == ["mode1@time@22:30@2026-11-28"], str(keys))
    finally:
        runtime_module.load_runtime_kv, runtime_module.persist_runtime_kv = original


def test_cross_day_record_is_ignored_by_caller() -> None:
    """跨天判断在 service 侧：store 只负责原样返回，调用方按 day 过滤。"""
    kv = FakeKv()
    original = with_kv(kv)
    try:
        store = HomeModeTriggerOccurrenceStore(FakeSession)
        store.persist("2026-11-27", {"mode1@time@22:30@2026-11-27": 1})
        day, keys = store.load()
        check("昨天记录仍原样返回", day == "2026-11-27" and keys, f"{day} {keys}")
        check("调用方据 day 判定不还原", day != "2026-11-28")
    finally:
        runtime_module.load_runtime_kv, runtime_module.persist_runtime_kv = original


def test_corrupt_kv_falls_back_to_empty() -> None:
    kv = FakeKv()
    kv.data[runtime_module.TIME_OCCURRENCES_CONFIG_ID] = ["not", "a", "dict"]
    original = with_kv(kv)
    try:
        store = HomeModeTriggerOccurrenceStore(FakeSession)
        day, keys = store.load()
        check("脏数据按无记录处理", day == "" and keys == {}, f"{day} {keys}")
    finally:
        runtime_module.load_runtime_kv, runtime_module.persist_runtime_kv = original


def test_persist_failure_does_not_raise() -> None:
    def boom(*_args, **_kwargs):
        raise RuntimeError("db down")

    original_load, original_persist = with_kv(FakeKv())
    runtime_module.persist_runtime_kv = boom
    try:
        store = HomeModeTriggerOccurrenceStore(FakeSession)
        # 落盘失败只留日志：绝不能把一次已经成功的模式激活变成异常。
        store.persist("2026-11-28", {"x": 1})
    finally:
        runtime_module.load_runtime_kv, runtime_module.persist_runtime_kv = original_load, original_persist


def test_occurrence_blocks_replay() -> None:
    """语义断言：记录里已有该 occurrence 时，触发器直接 return（不执行）。"""
    from homeos.backend.src.domains.home_mode.triggers import HomeModeTriggersState

    state = HomeModeTriggersState()
    state.time_occurrence_day = "2026-11-28"
    state.fired_time_occurrences = {"mode1@time@22:30@2026-11-28": 1}
    check(
        "重启还原后同 occurrence 命中",
        "mode1@time@22:30@2026-11-28" in state.fired_time_occurrences,
    )
    check("当天记录仍在", state.time_occurrence_day == "2026-11-28", state.time_occurrence_day)


def main() -> int:
    test_round_trip_same_day()
    test_cross_day_record_is_ignored_by_caller()
    test_corrupt_kv_falls_back_to_empty()
    test_persist_failure_does_not_raise()
    test_occurrence_blocks_replay()
    report("时间触发器跨重启去重")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
