"""状态模型漂移度量的单元测试（stdlib unittest，自动被 ``unittest discover`` 发现）。

覆盖四件事：

1. 三类差异能分别识别；
2. **``hub_subset_gap`` 不计入 ``total``** —— Hub 只装 watched 实体，L1 收全量，
   「L1 有而 Hub 无」是设计而非缺陷。第一版把它算进 total，接上真实 HA 后每次快照
   都报 549 条「差异」，指标直接变成噪音；
3. **计数是精确值**，不会被样本上限截断（第一版的另一个 bug：用列表长度当计数，
   超过 10 条会被静默当成 10 条）；
4. 一致时 ``total == 0`` —— 「新增的观测不要自己制造噪音」的守卫。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from homeos.backend.src.realtime.state_divergence import (
    SAMPLE_LIMIT,
    compare_state_models,
)


def _l1(*pairs: tuple[str, str]) -> list[dict[str, object]]:
    return [{"entity_id": entity_id, "state": state} for entity_id, state in pairs]


class CompareStateModelsTest(unittest.TestCase):
    def test_identical_models_report_no_divergence(self) -> None:
        hub = {"light.a": "on", "sensor.b": "12"}
        report = compare_state_models(hub, _l1(("light.a", "on"), ("sensor.b", "12")))
        self.assertEqual(report.total, 0)
        self.assertEqual(report.hub_count, 2)
        self.assertEqual(report.l1_count, 2)

    def test_missing_in_l1(self) -> None:
        report = compare_state_models({"light.a": "on", "light.b": "off"}, _l1(("light.a", "on")))
        self.assertEqual(report.missing_in_l1_count, 1)
        self.assertEqual(report.missing_in_l1, ["light.b"])
        self.assertEqual(report.hub_subset_gap_count, 0)
        self.assertEqual(report.state_mismatch_count, 0)

    def test_subset_gap_is_expected_and_not_a_divergence(self) -> None:
        """L1 有而 Hub 无 = Hub 未订阅该实体，属预期；不计入 total，但仍要计数。"""
        report = compare_state_models({"light.a": "on"}, _l1(("light.a", "on"), ("light.hidden", "off")))
        self.assertEqual(report.hub_subset_gap_count, 1)
        self.assertEqual(report.hub_subset_gap, ["light.hidden"])
        self.assertEqual(report.total, 0)

    def test_state_mismatch(self) -> None:
        report = compare_state_models({"light.a": "on"}, _l1(("light.a", "off")))
        self.assertEqual(report.state_mismatch_count, 1)
        self.assertEqual(report.state_mismatch, ["light.a"])
        self.assertEqual(report.total, 1)

    def test_counts_are_exact_beyond_sample_limit(self) -> None:
        """超过 SAMPLE_LIMIT 的差异仍按真实条数计数，样本列表才截断。"""
        hub = {f"light.{index}": "on" for index in range(SAMPLE_LIMIT + 15)}
        report = compare_state_models(hub, [])
        self.assertEqual(report.missing_in_l1_count, SAMPLE_LIMIT + 15)
        self.assertEqual(len(report.missing_in_l1), SAMPLE_LIMIT)
        self.assertEqual(report.total, SAMPLE_LIMIT + 15)

    def test_ignores_entities_without_id(self) -> None:
        """L1 里缺 entity_id 的脏行不应被当成「Hub 缺失」。"""
        report = compare_state_models({"light.a": "on"}, [{"state": "on"}, {"entity_id": "light.a", "state": "on"}])
        self.assertEqual(report.l1_count, 1)
        self.assertEqual(report.total, 0)

    def test_missing_state_field_treated_as_empty(self) -> None:
        """L1 行的 state 缺失时归一成空串，与 Hub 的 ``unknown`` 必然不等 —— 应计为差异。"""
        report = compare_state_models({"light.a": "unknown"}, [{"entity_id": "light.a"}])
        self.assertEqual(report.state_mismatch_count, 1)

    def test_as_dict_is_json_ready(self) -> None:
        report = compare_state_models({"light.a": "on"}, _l1(("light.b", "off")))
        payload = report.as_dict()
        self.assertEqual(payload["missingInL1"], 1)
        self.assertEqual(payload["hubSubsetGap"], 1)
        # total 只含真差异：hub 多出来的 1 条，不含 L1 多出来的 1 条。
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["samples"]["missingInL1"], ["light.a"])


if __name__ == "__main__":
    unittest.main()
