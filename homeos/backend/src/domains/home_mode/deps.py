"""`HomeModeService` 交给 actions / triggers 的**窄接口**（从 ``service.py`` 拆出）。

它不是第二个服务门面：域内编排只通过这里拿依赖，状态读写仍然只有服务一个真源。
拆出来的动机是 ``service.py`` 已经很大，而这个类的每一行都是「转发 +
准入判据」，与激活编排不是同一类知识。
"""

from __future__ import annotations

import logging
from typing import Any

from .actions import HomeModeSnapshotOutcome
from .linkage import HomeModeLinkageArbiter
from ...platform.core.db.db_exec import run_db

logger = logging.getLogger("homeos.home_mode")


class HomeModeDeps:
    """激活 / 触发编排所需依赖集合（对齐 actions.internals / triggers.internals 的 deps）。

    ``request_activate`` / ``request_deactivate`` 是**回调进服务**（转换锁与「同组互斥 +
    快照恢复」那套编排只在服务里）：命名刻意带 ``request_`` —— 写成 ``activate`` 时，
    调用方很容易以为这是「另一条独立的激活通路」。
    """

    def __init__(self, service: Any) -> None:
        self._service = service

    # 日志
    def log(self, message: str) -> None:
        logger.info(message)

    def warn(self, message: str) -> None:
        logger.warning(message)

    # 数据访问
    async def find_mode(self, mode_id: str) -> dict[str, Any] | None:
        return await run_db(self._service._find_mode_row, mode_id)

    async def list_active_modes(self) -> list[dict[str, Any]]:
        return await run_db(self._service._list_active_modes)

    async def persist_time_occurrences(self, day: str, keys: dict[str, int]) -> None:
        """落盘「今日已触发的时间触发器」：重启后不再重放（见 runtime 的 occurrence store）。"""
        await self._service.persist_time_occurrences(day, keys)

    async def find_first_active(self) -> dict[str, Any] | None:
        return await run_db(self._service._find_first_active)

    async def switch_active_group(
        self,
        conflicting_modes: list[dict[str, Any]],
        conflict_restore: dict[str, HomeModeSnapshotOutcome],
        mode_id: str,
        snapshot: dict[str, Any],
    ) -> None:
        await run_db(
            self._service._switch_active_group,
            conflicting_modes,
            conflict_restore,
            mode_id,
            snapshot,
        )

    async def deactivate_in_db(
        self,
        mode_id: str,
        *,
        keep_snapshot: bool = False,
        snapshot: dict[str, Any] | None = None,
    ) -> None:
        await run_db(
            self._service._deactivate_in_db,
            mode_id,
            keep_snapshot=keep_snapshot,
            snapshot=snapshot,
        )

    async def clear_group_active(self, group_ids: list[str], incomplete: bool) -> None:
        await run_db(self._service._clear_group_active, group_ids, incomplete)

    async def get_active_mode(self) -> dict[str, Any] | None:
        return await run_db(self._service.get_active)

    async def get_active_modes(self) -> list[dict[str, Any]]:
        """全部激活模式（可跨互斥组）。

        触发器优先级必须按「同组」比较：只用 ``get_active_mode()``（全局主模式）时，
        多互斥组下目标组的真实对手常被漏掉，让位逻辑会整个失效。
        """
        return await run_db(self._service.get_active_modes)

    def get_active_mode_id(self) -> str | None:
        return self._service.get_active_mode_id()

    # 执行 / 集成
    async def call_service(self, domain: str, service: str, entity_id: str, data: dict[str, Any]) -> Any:
        return await self._service._call_service(domain, service, entity_id, data)

    async def fetch_entity_state(self, entity_id: str) -> dict[str, Any] | None:
        return await self._service._fetch_entity_state(entity_id)

    async def get_ha_status(self) -> dict[str, Any]:
        return await self._service._ha_connector.get_status()

    async def notify(self, level: str, message: str, source: str) -> Any:
        return await self._service._notify(level, message, source)

    async def set_security_mode(self, mode: str, source: str) -> bool:
        return await self._service._apply_security_mode(mode, source)

    async def get_security_mode(self) -> str | None:
        return await self._service._read_security_mode()

    def is_away_simulated_entity(self, entity_id: str) -> bool:
        return self._service.is_away_simulated_entity(entity_id)

    def get_presence_context(self) -> dict[str, Any]:
        """在场上下文：``presence`` 条件靠它求值（没有它条件永远不成立）。"""
        probe = self._service._is_anyone_home
        return {"atHome": bool(probe())} if callable(probe) else {}

    def is_baseline_settling(self) -> bool:
        """HA 连接静置期内返回真；触发链据此整体跳过（见 HomeModeService 同名方法）。"""
        return self._service.is_baseline_settling()

    async def emit_home_mode_event(self, name: str, payload: dict[str, Any]) -> None:
        await self._service._emit_home_mode_event(name, payload)

    def push_trigger_log(self, entry: dict[str, Any]) -> None:
        self._service._runtime_logs.push_trigger_log(entry)

    def record_execution(self, entry: dict[str, Any]) -> None:
        self._service._runtime_logs.record_execution(entry)

    # 配置 / 触发器
    @property
    def linkage_arbiter(self) -> HomeModeLinkageArbiter:
        return self._service.linkage_arbiter

    def get_home_mode_config(self) -> dict[str, Any]:
        return self._service._home_mode_cfg

    def get_security_config(self) -> dict[str, Any]:
        return self._service._security_cfg

    def get_apply_max_retries(self) -> int:
        return int(self._service._home_mode_cfg.get("applyMaxRetries") or 0)

    def get_trigger_cooldown_ms(self) -> int:
        return int(self._service._home_mode_cfg.get("triggerCooldownMs") or 60_000)

    def get_home_timezone(self) -> str | None:
        return self._service._home_timezone

    def is_leader(self) -> bool:
        return bool(self._service._is_leader())

    async def request_activate(self, mode_id: str, meta: dict[str, Any] | None = None) -> Any:
        """触发器路径请求激活：回调进服务的 ``activate``（那里有转换锁与同组互斥编排）。"""
        return await self._service.activate(mode_id, meta)

    async def request_deactivate(self, mode_id: str | None = None) -> Any:
        """触发器路径请求停用：回调进服务的 ``deactivate``。

        ``mode_id`` 必须显式传给「只退某一个组」的调用方：不传会退回内存指针指向的
        主模式（多互斥组下常常是另一个组），把不该退的模式退掉、该退的却还留着。
        """
        return await self._service.deactivate(mode_id)


__all__ = ["HomeModeDeps"]
