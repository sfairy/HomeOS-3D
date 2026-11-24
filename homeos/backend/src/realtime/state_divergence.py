"""StateHub（HA 写侧）与 StateStore（L1 读模型）的漂移度量。

## 先明确一件事：两边**本来就不该完全一致**

第一版把这个模块的前提写错了，接上真实 HA 后第一个快照点就证伪了它：报
``hubCount=232 / l1Count=781``。原因不是 bug，而是设计：

- ``L1``（``StateStore``）收**全量** —— 隐藏 / 禁用实体也要有基线，否则边沿判定
  （旧态 → 新态）会把「重启后第一次看到」误当成「刚变化」；
- ``StateHub`` 只收 ``watched`` 集合（``service_sync`` 里的
  ``state_hub.replace(raw for raw in ... if in watched)``）—— 它就是「要推给谁」的那份。

所以正确的关系是 **Hub ⊆ L1**，而不是 Hub ＝ L1。

## 修正后的口径

- ``missing_in_l1``（Hub 有、L1 无）：**真差异**。Hub 是 L1 的子集，多出来说明有实体
  只写进了 Hub 没进基线 —— 这正是代码注释里记录过的事故类型一。
- ``state_mismatch``（两边都有但 ``state`` 不同）：**真差异**。说明两边应用了不同版本的
  同一事件（顺序反了或漏了一次）。
- ``hub_subset_gap``（L1 有、Hub 无）：**预期内**，单独计数但**不计入** ``total``。
  它的用途是监控「Hub 的订阅范围是否意外缩小」—— 例如 watched 集合算错导致墙屏收不到
  实体更新时，这个数会突然变大。

``total`` 只统计前两类，因此「正常情况下恒为 0」成立，WARNING 只在真出问题时出现。

## 采样时机

只在**快照点**（``_apply_initial_snapshot`` 里 ``set_all`` 之后）比较：此刻两边刚被
灌入同一批权威数据，``state_mismatch`` 若仍非零就只能是应用顺序问题，而不是那个
正常的传播窗口（HA 事件到达后 Hub 先更新、L1 要等 batch 应用完）。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

#: 每类差异最多保留多少个 entity_id 样本（只用于排查，不做指标标签 —— 基数不可控）。
SAMPLE_LIMIT = 10


@dataclass
class DivergenceReport:
    """一次快照点上的两边对照。

    ``*_count`` 是精确条数（进指标），同名列表只是前 ``SAMPLE_LIMIT`` 个 entity_id（进日志）。
    早先写成「用列表长度当计数」会让超过 10 条的问题被静默截断。
    """

    hub_count: int = 0
    l1_count: int = 0
    missing_in_l1_count: int = 0
    hub_subset_gap_count: int = 0
    state_mismatch_count: int = 0
    missing_in_l1: list[str] = field(default_factory=list)
    hub_subset_gap: list[str] = field(default_factory=list)
    state_mismatch: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        """**真差异**条数 = Hub 有 L1 无 + state 不一致。

        刻意不含 ``hub_subset_gap``：Hub 只装 watched 实体，L1 有而 Hub 无是预期状态。
        把它算进来会让每次快照都报几百条「差异」，指标立刻变成噪音（实测 549 条）。
        """
        return self.missing_in_l1_count + self.state_mismatch_count

    def as_dict(self) -> dict[str, Any]:
        return {
            "hubCount": self.hub_count,
            "l1Count": self.l1_count,
            "missingInL1": self.missing_in_l1_count,
            "hubSubsetGap": self.hub_subset_gap_count,
            "stateMismatch": self.state_mismatch_count,
            "total": self.total,
            "samples": {
                "missingInL1": self.missing_in_l1,
                "hubSubsetGap": self.hub_subset_gap,
                "stateMismatch": self.state_mismatch,
            },
        }


def _l1_pairs(l1_entities: Iterable[dict[str, Any]]) -> dict[str, str]:
    """L1 实体列表 → ``{entity_id: state}``（缺 id 的脏行丢弃）。"""
    pairs: dict[str, str] = {}
    for entity in l1_entities:
        entity_id = str(entity.get("entity_id") or "")
        if entity_id:
            pairs[entity_id] = str(entity.get("state") or "")
    return pairs


def _scan_hub(report: DivergenceReport, hub_pairs: dict[str, str], l1_pairs: dict[str, str]) -> None:
    """Hub 侧遍历：找出「L1 缺失」（真差异）与「state 不一致」（真差异）。"""
    for entity_id, hub_state in hub_pairs.items():
        l1_state = l1_pairs.get(entity_id)
        if l1_state is None:
            report.missing_in_l1_count += 1
            if len(report.missing_in_l1) < SAMPLE_LIMIT:
                report.missing_in_l1.append(entity_id)
        elif l1_state != hub_state:
            report.state_mismatch_count += 1
            if len(report.state_mismatch) < SAMPLE_LIMIT:
                report.state_mismatch.append(entity_id)


def _scan_subset_gap(report: DivergenceReport, hub_pairs: dict[str, str], l1_pairs: dict[str, str]) -> None:
    """L1 侧遍历：统计「Hub 未订阅的实体」（预期内，只作趋势观测）。"""
    for entity_id in l1_pairs:
        if entity_id in hub_pairs:
            continue
        report.hub_subset_gap_count += 1
        if len(report.hub_subset_gap) < SAMPLE_LIMIT:
            report.hub_subset_gap.append(entity_id)


def compare_state_models(
    hub_pairs: dict[str, str],
    l1_entities: Iterable[dict[str, Any]],
) -> DivergenceReport:
    """比较两边的 ``entity_id → state``。

    参数刻意是「已经取好的最小数据」而不是两个对象：这样本函数是纯函数，
    selftest 不需要装配 Hub / Store，也不会因为读私有字段而与实现耦合。

    - ``hub_pairs``：Hub 侧的 ``{entityId: state}``；
    - ``l1_entities``：L1 侧的实体列表（``get_all()`` 的原样输出）。
    """
    l1 = _l1_pairs(l1_entities)
    report = DivergenceReport(hub_count=len(hub_pairs), l1_count=len(l1))
    _scan_hub(report, hub_pairs, l1)
    _scan_subset_gap(report, hub_pairs, l1)
    return report


def record_divergence(report: DivergenceReport) -> DivergenceReport:
    """把**真差异**计入 HA 计数器（``/metrics`` 的 ``homeos_ha_events_total``）。

    ``hub_subset_gap`` 不进指标：它是预期状态的趋势量，混进差异计数会稀释真正的告警。
    需要看它时读日志里的 ``hubSubsetGap`` 字段。

    用计数器而不是 gauge：这里关心的是「有没有发生过、发生了多少次」，
    而不是某一刻的瞬时值 —— 后者会被下一次快照覆盖掉，反而看不出趋势。
    """
    from ..platform.core.runtime.observability import record_ha_counter

    if report.missing_in_l1_count:
        record_ha_counter("state_divergence_missing_in_l1", report.missing_in_l1_count)
    if report.state_mismatch_count:
        record_ha_counter("state_divergence_state_mismatch", report.state_mismatch_count)
    return report


__all__ = ["SAMPLE_LIMIT", "DivergenceReport", "compare_state_models", "record_divergence"]
