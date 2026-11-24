"""StateHub（HA 写侧）与 StateStore（L1 读模型）的漂移度量。

## 为什么需要「度量」而不是立刻合并

仓库里有两个内存状态模型，这是历史事实（见 ``bootstrap/ha_state_effects`` 与
``domains/ha/integration/state_reset`` 的模块说明）。它们各自被不同路径写入：

- ``StateHub``：HA 事件直写（``update`` / ``merge`` / ``replace``），是 WS 推送的来源；
- ``StateStore``（L1）：只在「快照 / 对账」与「批量事件应用」两处被写入，是 REST
  ``/entities`` 与事件日志的来源。

因此**存在一个必然的、短暂的窗口**：HA 推来一批事件后，Hub 已经更新，而 L1 要等
``ha.state_changed.batch`` 应用完才更新。这不是 bug，是双模型的结构性代价。

但不能因此「假设它们总是最终一致」—— 代码注释里已经记录过两起真实事故：
只清 Hub 导致 WS 首推吐旧实体、隐藏实体从 L1 消失。合并两个模型是高风险改动；
在合并之前，**先让不一致变得可观测**是唯一能安全推进的一步（也是计划里
「先加双写差异计数，观察一个版本」那一条）。

## 口径

只在**快照点**采样（connect / 周期对账），不在每个事件后比较：快照是「两边都刚被
灌入同一份权威数据」的时刻，此时若仍不一致，说明是结构性漏写，而不是那个正常的
传播窗口。

三类差异分别计数（**计数是精确值，样本列表只是排查用的前 N 个 entity_id**）：

- ``missing_in_l1``：Hub 有、L1 没有 —— 典型是「只写了 Hub」的路径（事故类型一）；
- ``missing_in_hub``：L1 有、Hub 没有 —— 典型是「只清了 Hub 没清 L1」（事故类型二）；
- ``state_mismatch``：两边都有但 ``state`` 不同 —— 典型是应用顺序反了。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

#: 每类差异最多保留多少个 entity_id 样本（只用于排查，不做指标标签 —— 基数不可控）。
SAMPLE_LIMIT = 10


@dataclass
class DivergenceReport:
    """一次快照点上的两边差异。

    注意 ``missing_in_l1_count`` 与 ``missing_in_l1`` 是两件事：前者是精确条数
    （进指标），后者只是前 ``SAMPLE_LIMIT`` 个 entity_id（进日志）。
    早先写成「用列表长度当计数」会让超过 10 条的不一致被静默截断。
    """

    hub_count: int = 0
    l1_count: int = 0
    missing_in_l1_count: int = 0
    missing_in_hub_count: int = 0
    state_mismatch_count: int = 0
    missing_in_l1: list[str] = field(default_factory=list)
    missing_in_hub: list[str] = field(default_factory=list)
    state_mismatch: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.missing_in_l1_count + self.missing_in_hub_count + self.state_mismatch_count

    def as_dict(self) -> dict[str, Any]:
        return {
            "hubCount": self.hub_count,
            "l1Count": self.l1_count,
            "missingInL1": self.missing_in_l1_count,
            "missingInHub": self.missing_in_hub_count,
            "stateMismatch": self.state_mismatch_count,
            "total": self.total,
            "samples": {
                "missingInL1": self.missing_in_l1,
                "missingInHub": self.missing_in_hub,
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
    """Hub 侧遍历：找出「L1 缺失」与「state 不一致」。"""
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


def _scan_l1(report: DivergenceReport, hub_pairs: dict[str, str], l1_pairs: dict[str, str]) -> None:
    """L1 侧遍历：找出「Hub 缺失」（另一个方向遍历不出来）。"""
    for entity_id in l1_pairs:
        if entity_id not in hub_pairs:
            report.missing_in_hub_count += 1
            if len(report.missing_in_hub) < SAMPLE_LIMIT:
                report.missing_in_hub.append(entity_id)


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
    _scan_l1(report, hub_pairs, l1)
    return report


def record_divergence(report: DivergenceReport) -> DivergenceReport:
    """把差异计入 HA 计数器（``/metrics`` 的 ``homeos_ha_events_total``）。

    用计数器而不是 gauge：这里关心的是「有没有发生过、发生了多少次」，
    而不是某一刻的瞬时值 —— 后者会被下一次快照覆盖掉，反而看不出趋势。
    """
    from ..platform.core.runtime.observability import record_ha_counter

    if report.missing_in_l1_count:
        record_ha_counter("state_divergence_missing_in_l1", report.missing_in_l1_count)
    if report.missing_in_hub_count:
        record_ha_counter("state_divergence_missing_in_hub", report.missing_in_hub_count)
    if report.state_mismatch_count:
        record_ha_counter("state_divergence_state_mismatch", report.state_mismatch_count)
    return report


__all__ = ["SAMPLE_LIMIT", "DivergenceReport", "compare_state_models", "record_divergence"]
