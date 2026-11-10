"""HA WebSocket 入口微窗口合并（对齐 ``shared/ha/state-ingress-coalesce.service.ts``）。"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Any

from .perf_windows import resolve_ingress_coalesce_window_ms
from ...app_config.defaults import DEFAULT_APP_CONFIG
from ....platform.core.entity.entity_domain import get_entity_domain
from ....platform.core.runtime.app_config import load_raw_config
from ....platform.core.runtime.observability import record_ha_sync_latency

logger = logging.getLogger("homeos.state_ingress_coalesce")

#: 配置缓存有效期（毫秒）：避免每个事件都读一次 SystemConfig。
_CONFIG_TTL_MS = 5_000

#: 默认合并域（配置缺失时回退，与 Nest 一致）。
#:
#: **不含 ``binary_sensor``**：门磁/烟感/水浸在窗口内可能「on → off」快速回弹，
#: 覆盖式合并只保留末态，真实告警边沿会被抹掉。安防边沿域一律绕过合并。
DEFAULT_COALESCE_DOMAINS: tuple[str, ...] = ("sensor",)

#: 必须保留瞬时边沿的域：即使配置显式把它们写进合并域，也不参与微窗口合并。
EDGE_SENSITIVE_DOMAINS: frozenset[str] = frozenset({"binary_sensor", "lock", "alarm_control_panel", "valve", "siren"})


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
        #: 投递链尾：保证相邻两个合并窗口的批次按 HA 事件顺序落地（见 ``_emit_now``）。
        self._chain: asyncio.Task[None] | None = None

        self.flush_count = 0
        self.merged_count = 0

    # 生命周期
    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def close(self) -> None:
        """模块卸载：清理定时器并立即刷新残留事件，保证不丢数据。"""
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        self._flush_all()
        chain = self._chain
        self._chain = None
        if chain is not None and not chain.done():
            await asyncio.gather(chain, return_exceptions=True)

    # 配置
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
        except Exception:  # 本配置节缺失/格式坏则保留默认值，继续解析其余节
            logger.debug("_cfg 忽略异常", exc_info=True)
        self._cfg_cache = {"ha": ha, "ws": ws}
        self._cfg_at = now
        return self._cfg_cache

    def invalidate_config(self) -> None:
        """配置热更新后立即失效缓存（app.config.updated 订阅）。"""
        self._cfg_cache = None
        self._cfg_at = 0.0

    # 入队
    def enqueue(self, event: dict[str, Any]) -> None:
        """状态变更入队入口（由 HA 状态监听调用，同步接口）。"""
        entity_id = str(event.get("entity_id") or "")
        if not entity_id:
            return
        # 同步过滤只影响「是否推给客户端」，不能在这里丢事件：隐藏/禁用的烟感
        # 依然必须触发告警。过滤放在广播层（bootstrap._run_state_change_effects）。
        if event.get("removed"):
            # 删除事件不参与微窗口合并：覆盖式合并只保留末态，一次「删了又出现」会在
            # 窗口内被抹成其中一种，而两者语义完全不同（前者要清缓存，后者要建缓存）。
            self._emit_now([event])
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
        if domain in EDGE_SENSITIVE_DOMAINS or domain not in coalesce_domains or domain in critical_domains:
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

    def _schedule(self) -> None:
        if self._timer is not None:
            return
        # 入口微窗只收拢「同一瞬间到达」的突发：默认 4ms（一帧的四分之一），
        # 不再让单条传感器更新白等 8ms。env > 配置 > 默认（见 perf_windows）。
        window_ms = resolve_ingress_coalesce_window_ms(
            self._cfg()["ha"].get("ingressCoalesceWindowMs")
        )
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
        now_ms = time.monotonic() * 1000
        # 合并窗口停留时长：入队 → flush。这是「为了让同一实体只发一帧」刻意加的延迟，
        # 单独成段统计，才能区分「设定的窗口」和「事件循环排不上队造成的额外停留」。
        for entry in self._pending.values():
            record_ha_sync_latency("ingress_coalesce_dwell", max(0.0, now_ms - entry["enqueued_at"]))
        batch = [entry["event"] for entry in self._pending.values()]
        self._pending.clear()
        self.flush_count += 1
        self._emit_now(batch)

    def _emit_now(self, batch: list[dict[str, Any]]) -> None:
        if not batch:
            return
        payload = {"changes": batch}
        loop = self._loop
        if loop is None or loop.is_closed():
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                logger.debug("合并队列没有可用事件循环，本批不投递")
                loop = None
        if loop is None:
            return
        # 串行链：上一批投递完再投下一批。
        #
        # 旧实现用 ``emit_soon``（每次 spawn 一个任务）—— 两个相邻窗口的批次会并发
        # dispatch：批次 A 的 handler 在 await 数据库时，批次 B 的 handler 已经开始，
        # 于是 B 的新值可能先落库、A 的旧值后落库，L1 与广播都停在旧值上。
        # 这里把「投递」串成一条链，跨批次顺序与 HA 事件顺序一致。
        self._chain = loop.create_task(self._deliver_after(self._chain, payload))

    async def _deliver_after(
        self, previous: asyncio.Task[None] | None, payload: dict[str, Any]
    ) -> None:
        if previous is not None and not previous.done():
            # 前一批失败不影响本批：吞掉异常只为保证顺序。
            await asyncio.gather(previous, return_exceptions=True)
        try:
            emit = getattr(self._bus, "emit", None) or getattr(self._bus, "publish", None)
            if not callable(emit):
                return
            result = emit("ha.state_changed.batch", payload)
            if inspect.isawaitable(result):
                await result
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("合并批量下发失败（%d 条）: %s", len(payload.get("changes") or []), exc)


    async def flush(self) -> None:
        """显式刷新（关机 / 测试用）。"""
        self._flush_all()


__all__ = ["DEFAULT_COALESCE_DOMAINS", "StateIngressCoalesceService"]
