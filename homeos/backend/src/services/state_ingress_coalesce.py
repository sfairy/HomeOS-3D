"""HA WebSocket 入口微窗口合并（对齐 ``shared/ha/state-ingress-coalesce.service.ts``）。

职责：对 sensor / binary_sensor 等同 entity 连续变更做短窗口（默认 8ms）合并，
关键控制域（light / switch / lock 等）直接 bypass，避免合并带来的控制延迟；
合并时保留「首包 old_state + 末包 new_state」，供电表差分等消费方不错计增量。

合并后的事件以 ``ha.state_changed.batch`` 批量事件发出，降低 Hot Path / Redis 桥接 /
WS 扇出频率。功能未启用 / 非合并域 / 关键域 / 不可同步实体一律立即下发或丢弃。
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Any

from .app_config.defaults import DEFAULT_APP_CONFIG
from ..core.app_config import load_raw_config
from ..core.entity_domain import get_entity_domain

logger = logging.getLogger("homeos.state_ingress_coalesce")

#: 配置缓存有效期（毫秒）：避免每个事件都读一次 SystemConfig。
_CONFIG_TTL_MS = 5_000

#: 默认合并域（配置缺失时回退，与 Nest 一致）。
DEFAULT_COALESCE_DOMAINS: tuple[str, ...] = ("sensor", "binary_sensor")


class StateIngressCoalesceService:
    """HA 入口微窗口合并器（同 entity 覆盖式合并 + 定时批量 flush）。"""

    def __init__(
        self,
        session_factory: Any,
        event_bus: Any,
        sync_filter: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._bus = event_bus
        self._sync_filter = sync_filter
        #: entity_id → {"event": 合并后事件, "enqueued_at": 首次入队时刻(ms)}
        self._pending: dict[str, dict[str, Any]] = {}
        self._timer: asyncio.TimerHandle | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._cfg_cache: dict[str, Any] | None = None
        self._cfg_at = 0.0
        self.flush_count = 0
        self.merged_count = 0

    # ------------------------------------------------------------------ #
    # 生命周期
    # ------------------------------------------------------------------ #
    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def close(self) -> None:
        """模块卸载：清理定时器并立即刷新残留事件，保证不丢数据。"""
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        self._flush_all()

    # ------------------------------------------------------------------ #
    # 配置
    # ------------------------------------------------------------------ #
    def _cfg(self) -> dict[str, Any]:
        now = time.monotonic() * 1000
        if self._cfg_cache is not None and now - self._cfg_at < _CONFIG_TTL_MS:
            return self._cfg_cache
        ha = dict(DEFAULT_APP_CONFIG.get("haConnector") or {})
        ws = dict(DEFAULT_APP_CONFIG.get("wsPush") or {})
        try:
            with self._session_factory() as session:
                raw = load_raw_config(session)
            section = raw.get("haConnector")
            if isinstance(section, dict):
                ha.update(section)
            section = raw.get("wsPush")
            if isinstance(section, dict):
                ws.update(section)
        except Exception:
            pass
        self._cfg_cache = {"ha": ha, "ws": ws}
        self._cfg_at = now
        return self._cfg_cache

    def invalidate_config(self) -> None:
        """配置热更新后立即失效缓存（app.config.updated 订阅）。"""
        self._cfg_cache = None
        self._cfg_at = 0.0

    # ------------------------------------------------------------------ #
    # 入队
    # ------------------------------------------------------------------ #
    def enqueue(self, event: dict[str, Any]) -> None:
        """状态变更入队入口（由 HA 状态监听调用，同步接口）。"""
        entity_id = str(event.get("entity_id") or "")
        if not entity_id:
            return
        new_state = event.get("new_state")
        if (
            new_state is not None
            and self._sync_filter is not None
            and not self._sync_filter.is_entity_syncable(entity_id)
        ):
            return

        cfg = self._cfg()
        ha_cfg = cfg["ha"]
        domains = ha_cfg.get("ingressCoalesceDomains")
        if isinstance(domains, list) and domains:
            coalesce_domains = [str(x) for x in domains]
        else:
            coalesce_domains = list(DEFAULT_COALESCE_DOMAINS)
        critical = cfg["ws"].get("criticalDomains")
        critical_domains = [str(x) for x in critical] if isinstance(critical, list) else []
        domain = get_entity_domain(entity_id)

        if not ha_cfg.get("ingressCoalesceEnabled", True):
            self._emit_now([event])
            return
        if domain not in coalesce_domains or domain in critical_domains:
            self._emit_now([event])
            return

        prev = self._pending.get(entity_id)
        if prev is not None:
            # 保留首包 old_state（电表差分依赖），末包 new_state 覆盖
            previous_event = prev["event"]
            merged = dict(event)
            if previous_event.get("old_state") is not None:
                merged["old_state"] = previous_event["old_state"]
            self._pending[entity_id] = {"event": merged, "enqueued_at": prev["enqueued_at"]}
            self.merged_count += 1
        else:
            self._pending[entity_id] = {
                "event": event,
                "enqueued_at": time.monotonic() * 1000,
            }
        self._schedule()

    # ------------------------------------------------------------------ #
    # 刷新
    # ------------------------------------------------------------------ #
    def _schedule(self) -> None:
        if self._timer is not None:
            return
        window_ms = self._cfg()["ha"].get("ingressCoalesceWindowMs", 8)
        try:
            window_ms = float(window_ms)
        except (TypeError, ValueError):
            window_ms = 8.0
        loop = self._loop
        if loop is None or loop.is_closed():
            # 无运行中事件循环：立即刷新，避免事件滞留丢失
            self._flush_all()
            return
        if window_ms <= 0:
            loop.call_soon(self._flush_all)
            return
        self._timer = loop.call_later(window_ms / 1000, self._flush_all)

    def _flush_all(self) -> None:
        self._timer = None
        if not self._pending:
            return
        batch = [entry["event"] for entry in self._pending.values()]
        self._pending.clear()
        self.flush_count += 1
        self._emit_now(batch)

    def _emit_now(self, batch: list[dict[str, Any]]) -> None:
        if not batch:
            return
        payload = {"changes": batch}
        emit_soon = getattr(self._bus, "emit_soon", None)
        if callable(emit_soon):
            try:
                emit_soon("ha.state_changed.batch", payload)
                return
            except Exception as exc:
                logger.debug("合并批量下发失败: %s", exc)
        emit = getattr(self._bus, "emit", None) or getattr(self._bus, "publish", None)
        if not callable(emit):
            return
        result = emit("ha.state_changed.batch", payload)
        if inspect.isawaitable(result):
            try:
                asyncio.get_running_loop().create_task(result)
            except RuntimeError:
                pass

    async def flush(self) -> None:
        """显式刷新（关机 / 测试用）。"""
        self._flush_all()


__all__ = ["DEFAULT_COALESCE_DOMAINS", "StateIngressCoalesceService"]
