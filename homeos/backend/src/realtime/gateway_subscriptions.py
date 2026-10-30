"""订阅索引 + 会话镜像 —— 从 ``RealtimeGateway`` 拆出的协作者之一。

负责三件事：
1. sid → 会话的内存镜像（广播是热路径，不能每条都对每个候选 sid 走引擎存储）；
2. 域 / 钉选实体的倒排索引（``domain → sids``、``entity_id → sids``），广播时先收窄候选；
3. 客户端事件 ``update_subscription`` 的落库与索引刷新。

拆出来的原因：``gateway.py`` 里连接生命周期、订阅索引、载荷构造三类状态互相耦合，
一次改广播分桶（P1-P2）要跨 300 行读同一组 dict。索引口径集中在这里后，
``RealtimeGateway`` 只剩「组合 + 广播编排」。
"""
# 这些实例字段由组合方 ``RealtimeGateway.__init__`` 初始化；mixin 只提供方法，
# 不重复声明默认值（那会在类上留下共享可变对象）。
# pyright: reportUninitializedInstanceVariable=false

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .ws_payloads import as_set

if TYPE_CHECKING:
    import socketio


class SubscriptionIndexMixin:
    """会话镜像 + 订阅倒排索引。由 ``RealtimeGateway`` 组合使用。"""

    sio: socketio.AsyncServer
    #: 已收到全量基线的 sid（未就绪前不参与增量广播）。
    _baseline_ready: set[str]
    #: 已完成订阅索引的 sid（用于区分「无订阅」与「索引尚未建立」）。
    _indexed_sids: set[str]
    #: 域 → sids（不含「不限域」的订阅者）。
    _sub_domain_sids: dict[str, set[str]]
    #: 订阅时不限域（收到全部实体变更）的 sids。
    _sub_wildcard_sids: set[str]
    #: 钉选实体 → sids。
    _sub_pinned_sids: dict[str, set[str]]
    #: sid → 订阅的域集合（``None`` = 不限域）。
    _sid_sub_domains: dict[str, set[str] | None]
    #: sid → 钉选实体集合。
    _sid_pinned: dict[str, set[str]]
    #: sid → 会话镜像（connect / update_subscription 写入，disconnect 清除）。
    _sessions: dict[str, dict[str, Any]]

    def _session_for(self, sid: str) -> dict[str, Any]:
        """取 sid 的会话（内存镜像优先）。镜像未命中时返回空 dict（fail-open：
        视为无订阅限制，与 ``get_session`` 返回 None 时的既有行为一致）。"""
        return self._sessions.get(sid) or {}

    async def _load_session(self, sid: str) -> dict[str, Any]:
        """会话读取（镜像未命中时回落到引擎存储，供连接恢复等边角场景）。"""
        cached = self._sessions.get(sid)
        if cached is not None:
            return cached
        session = dict(await self.sio.get_session(sid) or {})
        if session:
            self._sessions[sid] = session
        return session

    def _unindex_subscription(self, sid: str) -> None:
        self._indexed_sids.discard(sid)
        domains = self._sid_sub_domains.pop(sid, None)
        self._sub_wildcard_sids.discard(sid)
        if domains:
            for domain in domains:
                bucket = self._sub_domain_sids.get(domain)
                if not bucket:
                    continue
                bucket.discard(sid)
                if not bucket:
                    self._sub_domain_sids.pop(domain, None)
        for entity_id in self._sid_pinned.pop(sid, ()):
            bucket = self._sub_pinned_sids.get(entity_id)
            if not bucket:
                continue
            bucket.discard(sid)
            if not bucket:
                self._sub_pinned_sids.pop(entity_id, None)

    def _index_subscription(self, sid: str, domains_raw: Any, pinned_raw: Any) -> None:
        self._unindex_subscription(sid)
        domains = as_set(domains_raw)
        pinned = as_set(pinned_raw, require_dot=True) or set()
        self._sid_sub_domains[sid] = domains
        self._sid_pinned[sid] = pinned
        self._indexed_sids.add(sid)
        if domains is None:
            self._sub_wildcard_sids.add(sid)
        else:
            for domain in domains:
                self._sub_domain_sids.setdefault(domain, set()).add(sid)
        for entity_id in pinned:
            self._sub_pinned_sids.setdefault(entity_id, set()).add(sid)

    def _candidate_sids_for_changes(
        self, changes: list[dict[str, Any]], critical_domains: set[str]
    ) -> set[str]:
        """按域/钉选收窄广播候选；含 critical 域时退回全量 baseline（语义不变）。"""
        from ..platform.core.entity_domain import get_entity_domain

        if not self._baseline_ready:
            return set()
        change_domains = {get_entity_domain(str(change.get("entity_id") or "")) for change in changes}
        change_domains.discard("")
        if change_domains & critical_domains:
            return set(self._baseline_ready)
        candidates = set(self._sub_wildcard_sids)
        for domain in change_domains:
            bucket = self._sub_domain_sids.get(domain)
            if bucket:
                candidates |= bucket
        for change in changes:
            entity_id = str(change.get("entity_id") or "")
            if not entity_id:
                continue
            bucket = self._sub_pinned_sids.get(entity_id)
            if bucket:
                candidates |= bucket
        if not candidates:
            # 只回退「基线就绪但还没建索引」的连接；已索引的连接确实没有匹配订阅，
            # 再全量广播只会放大每条变更的序列化与发送成本。
            return set(self._baseline_ready) - self._indexed_sids
        return candidates & self._baseline_ready

    async def _on_update_subscription(self, sid: str, message: Any = None) -> dict[str, Any]:
        message = message if isinstance(message, dict) else {}
        session = dict(await self._load_session(sid))
        session["subscribedDomains"] = message.get("subscribeDomains")
        session["pinnedEntityIds"] = message.get("pinnedEntityIds")
        await self.sio.save_session(sid, session)
        self._sessions[sid] = session
        self._index_subscription(
            sid, session.get("subscribedDomains"), session.get("pinnedEntityIds")
        )
        return {"ok": True}
