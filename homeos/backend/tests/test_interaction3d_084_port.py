"""0.8.4 后端移植的回归：窗型 / 窗扇绑定 / 预报上限 / 姿态历史 / 修复提案。

这五块都是「写坏了不会有异常，只会让界面悄悄错」的地方：

- 窗型分格：格子小到装不下五金件、窗扇 id 重复，前端渲染时才炸；
- 窗扇绑定：``motionSource='contact'`` 写成 ``'Contact'``，3D 永远等不到行程；
- 预报：有的集成一次回上千条，不截断会撑爆组件树；
- 姿态历史：换了 HA 连接后旧连接的条目串进新连接，动画按别人的行程跑；
- 修复提案：必须幂等 —— 第二次检查不能再"发现"新问题，也不能改动输入。

运行：``.venv-store/bin/python -m pytest homeos/backend/tests -q``
"""

from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import HTTPException
from src.domains.backup.business_backup import BACKUP_ROOTS
from src.domains.ha.integration.cover_memory import (
    FILE_VERSION,
    MAX_ENTRIES,
    CoverMemory,
)
from src.domains.ha.integration.state_hub import StateHub
from src.domains.ha.integration.weather_forecast import (
    FORECAST_LIMITS,
    forecast_rows,
    normalize_forecast,
    read_weather_forecast,
)
from src.domains.studio3d.cleanup import repair_binding_document
from src.domains.studio3d.windows import validate_window_design, validate_window_designs
from src.modules.interaction3d.access import module_components
from src.modules.interaction3d.config_ctx import ValidationContext
from src.modules.interaction3d.config_sections_security import validate_security_section
from src.modules.interaction3d.window import (
    validate_window_bindings,
    window_model_id,
    window_targets,
)

SCENE_ID = "a" * 32


def sash(sash_id: str, kind: str = "casement", **extra) -> dict:
    """一片窗扇；默认值对齐前端 ``leaf()``（``fixed`` 也带开合字段）。"""
    node = {
        "id": sash_id,
        "kind": kind,
        "hinge": "left",
        "swing": "out" if kind == "top-hung" else "in",
        "slide": "right",
        "count": 2,
        "angle": 30 if kind in ("top-hung", "bottom-hung") else 90,
        "defaultOpening": 0,
        "panelIds": [f"{sash_id}-1", f"{sash_id}-2"],
    }
    node.update(extra)
    return node


def design(layout: dict, *, mode: str = "custom", version: int = 1) -> dict:
    return {"version": version, "mode": mode, "interiorSide": 1, "layout": layout}


class WindowDesignTests(unittest.TestCase):
    """窗型设计树的写入边界。"""

    def test_valid_single_sash(self) -> None:
        validate_window_design(design(sash("s1")), 1.2, 1.4)

    def test_valid_split_keeps_cells_large_enough(self) -> None:
        root = {
            "id": "split",
            "axis": "x",
            "ratio": 0.5,
            "children": [sash("s1"), sash("s2", "fixed")],
        }
        validate_window_design(design(root), 1.8, 1.4)

    def test_rejects_cell_below_minimum(self) -> None:
        # 1.4 m 高的窗按 0.1 切，上格只剩 0.14 m，短边掉到 0.26 m 以下。
        root = {
            "id": "split",
            "axis": "y",
            "ratio": 0.1,
            "children": [sash("s1"), sash("s2")],
        }
        with self.assertRaises(HTTPException) as raised:
            validate_window_design(design(root), 1.8, 1.4)
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("分格过小", raised.exception.detail)

    def test_sliding_group_needs_width_for_every_panel(self) -> None:
        # 推拉组把 n 扇并排塞进一格：0.6 m 宽塞两扇正好卡在 0.52 m 下限之上，
        # 三扇就要 0.78 m，同一格里必须拒绝。
        root = sash("s1", "sliding", count=2, panelIds=["p1", "p2"])
        validate_window_design(design(root), 0.6, 1.4)
        too_narrow = sash("s2", "sliding", count=3, panelIds=["p1", "p2", "p3"])
        with self.assertRaises(HTTPException):
            validate_window_design(design(too_narrow), 0.6, 1.4)

    def test_rejects_duplicate_sash_id(self) -> None:
        root = {
            "id": "split",
            "axis": "x",
            "ratio": 0.5,
            "children": [sash("s1"), sash("s1")],
        }
        with self.assertRaises(HTTPException):
            validate_window_design(design(root), 2.0, 1.4)

    def test_rejects_panel_count_mismatch(self) -> None:
        # 推拉组的三扇身份必须和 count 对齐，少一扇会让撤销定位不到窗扇。
        node = sash("s1", "sliding", count=3, panelIds=["p1", "p2"])
        with self.assertRaises(HTTPException) as raised:
            validate_window_design(design(node), 2.0, 1.4)
        self.assertIn("窗扇参数无效", raised.exception.detail)

    def test_rejects_dimension_out_of_bounds(self) -> None:
        for width, height in ((0.29, 1.4), (20.01, 1.4), (1.2, 0.1), (True, 1.4)):
            with self.subTest(width=width, height=height), self.assertRaises(HTTPException):
                validate_window_design(design(sash("s1")), width, height)

    def test_rejects_unknown_version(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            validate_window_design(design(sash("s1"), version=2), 1.2, 1.4)
        self.assertIn("版本", raised.exception.detail)

    def test_rejects_bad_ratio(self) -> None:
        for ratio in (0, 1, 1.5, "0.5"):
            root = {
                "id": "split",
                "axis": "x",
                "ratio": ratio,
                "children": [sash("s1"), sash("s2")],
            }
            with self.subTest(ratio=ratio), self.assertRaises(HTTPException):
                validate_window_design(design(root), 2.0, 1.4)

    def test_rejects_remarks_over_limit(self) -> None:
        for remarks in ({"s1": "x" * 61}, {"k" * 81: "短"}, {f"k{index}": "短" for index in range(97)}):
            with self.subTest(count=len(remarks)), self.assertRaises(HTTPException):
                validate_window_design(design(sash("s1")) | {"sashRemarks": remarks}, 1.2, 1.4)
        validate_window_design(design(sash("s1")) | {"sashRemarks": {"s1": "主窗"}}, 1.2, 1.4)

    def test_ordinary_mode_ignores_real_dimensions(self) -> None:
        # 普通窗型是「切回自定义」前的占位树，用 20×20 校验，0.3 m 的小窗也不能误杀。
        narrow = {"id": "split", "axis": "x", "ratio": 0.5, "children": [sash("s1"), sash("s2")]}
        validate_window_design(design(narrow, mode="ordinary"), 0.3, 0.3)

    def test_scene_walk_rejects_window_outside_wall(self) -> None:
        scene = {
            "floors": [
                {
                    "id": "f1",
                    "scene": {
                        "calibration": {"pixelsPerMeter": 100},
                        "walls": [{"id": "wall1", "height": 2.8, "start": {"x": 0, "y": 0}, "end": {"x": 100, "y": 0}}],
                        "windows": [
                            {
                                "id": "w1",
                                "wallId": "wall1",
                                "width": 1.5,
                                "height": 1.4,
                                "sill": 0.9,
                                "windowDesign": design(sash("s1")),
                            }
                        ],
                    },
                }
            ]
        }
        # 1 m 长的墙放 1.5 m 宽的窗 —— 3D 里窗户会穿出墙面。
        with self.assertRaises(HTTPException) as raised:
            validate_window_designs(scene)
        detail = raised.exception.detail
        self.assertIn("超出墙体", detail)
        # 一屋十几扇窗：文案必须指名是哪一扇，并给出两侧毫米数，否则用户无从下手。
        self.assertIn("第 1 扇窗户", detail)
        self.assertIn("窗宽 1500 mm", detail)
        self.assertIn("墙长只有 1000 mm", detail)

    def test_scene_walk_uses_window_remark_as_label(self) -> None:
        scene = {
            "floors": [
                {
                    "id": "f1",
                    "scene": {
                        "calibration": {"pixelsPerMeter": 100},
                        "walls": [{"id": "wall1", "height": 2.8, "start": {"x": 0, "y": 0}, "end": {"x": 100, "y": 0}}],
                        "windows": [
                            {
                                "id": "w1",
                                "wallId": "wall1",
                                "remark": "主卧飘窗",
                                "width": 1.5,
                                "height": 1.4,
                                "sill": 0.9,
                                "windowDesign": design(sash("s1")),
                            }
                        ],
                    },
                }
            ]
        }
        with self.assertRaises(HTTPException) as raised:
            validate_window_designs(scene)
        self.assertIn("窗户「主卧飘窗」", raised.exception.detail)

    def test_scene_walk_reports_window_top_separately(self) -> None:
        # 窗宽没超、窗顶超：报错必须落在「窗顶 / 墙高」，别把用户往窗宽上引。
        scene = {
            "floors": [
                {
                    "id": "f1",
                    "scene": {
                        "calibration": {"pixelsPerMeter": 100},
                        "walls": [{"id": "wall1", "height": 2.0, "start": {"x": 0, "y": 0}, "end": {"x": 400, "y": 0}}],
                        "windows": [
                            {
                                "id": "w1",
                                "wallId": "wall1",
                                "width": 1.5,
                                "height": 1.6,
                                "sill": 0.9,
                                "windowDesign": design(sash("s1")),
                            }
                        ],
                    },
                }
            ]
        }
        with self.assertRaises(HTTPException) as raised:
            validate_window_designs(scene)
        detail = raised.exception.detail
        self.assertIn("窗顶 2500 mm", detail)
        self.assertIn("墙高只有 2000 mm", detail)
        self.assertNotIn("窗宽", detail)

    def test_scene_without_design_is_ignored(self) -> None:
        scene = {"floors": [{"id": "f1", "scene": {"windows": [{"id": "w1", "width": 0, "height": 0}]}}]}
        validate_window_designs(scene)
        # 非字典草稿（首次保存 / 空场景）直接放行。
        validate_window_designs(None)


class WindowBindingTests(unittest.TestCase):
    """开窗器绑定：字段白名单、运动来源、模型身份。"""

    @staticmethod
    def binding(**extra) -> dict:
        item = {
            "id": "opener-1",
            "floorId": "f1",
            "modelId": window_model_id("w1", "s1"),
            "openPercent": 100,
        }
        item.update(extra)
        return item

    def test_accepts_motion_fields(self) -> None:
        validate_window_bindings(
            [
                self.binding(motionSource="contact", estimateMotion=False, travelSeconds=30),
            ]
        )

    def test_defaults_are_implicit(self) -> None:
        # 三个字段都不填时按 auto / 不估计 / 引擎默认时长处理。
        validate_window_bindings([self.binding()])

    def test_rejects_unknown_motion_source(self) -> None:
        with self.assertRaises(HTTPException):
            validate_window_bindings([self.binding(motionSource="Contact")])

    def test_rejects_non_bool_estimate(self) -> None:
        with self.assertRaises(HTTPException):
            validate_window_bindings([self.binding(estimateMotion="false")])

    def test_rejects_travel_seconds_out_of_range(self) -> None:
        for seconds in (4, 181, float("nan"), "30", True):
            with self.subTest(seconds=seconds), self.assertRaises(HTTPException):
                validate_window_bindings([self.binding(travelSeconds=seconds)])

    def test_rejects_floor_all(self) -> None:
        with self.assertRaises(HTTPException):
            validate_window_bindings([self.binding(floorId="all")])

    def test_rejects_duplicate_target(self) -> None:
        with self.assertRaises(HTTPException):
            validate_window_bindings(
                [
                    self.binding(),
                    {**self.binding(), "id": "opener-2"},
                ]
            )

    def test_rejects_unknown_field(self) -> None:
        with self.assertRaises(HTTPException):
            validate_window_bindings([self.binding(sashId="s1")])

    def test_targets_only_movable_sashes(self) -> None:
        layout = {
            "id": "split",
            "axis": "x",
            "ratio": 0.5,
            "children": [sash("s1"), sash("s2", "fixed")],
        }
        payload = {
            "walls": [{"id": "wall1"}],
            "windows": [{"id": "w1", "wallId": "wall1", "windowDesign": design(layout)}],
        }
        movable = window_targets(payload)
        self.assertIn(window_model_id("w1", "s1"), movable)
        self.assertNotIn(window_model_id("w1", "s2"), movable)

    def test_sliding_group_and_legacy_panels(self) -> None:
        # 推拉组整组一起滑动：组 id 是正式身份，面板 id 只在清理旧数据时出现。
        group = sash("g1", "sliding", count=2, panelIds=["p1", "p2"])
        payload = {
            "walls": [{"id": "wall1"}],
            "windows": [{"id": "w1", "wallId": "wall1", "windowDesign": design(group)}],
        }
        self.assertEqual(window_targets(payload, include_legacy=False), {window_model_id("w1", "g1")})
        self.assertEqual(
            window_targets(payload, include_legacy=True),
            {window_model_id("w1", sash_id) for sash_id in ("g1", "p1", "p2")},
        )

    def test_window_with_deleted_wall_is_not_a_target(self) -> None:
        payload = {"walls": [], "windows": [{"id": "w1", "wallId": "gone", "windowDesign": design(sash("s1"))}]}
        self.assertEqual(window_targets(payload), set())

    def test_ordinary_window_has_no_sashes(self) -> None:
        payload = {
            "walls": [{"id": "wall1"}],
            "windows": [{"id": "w1", "wallId": "wall1", "windowDesign": design(sash("s1"), mode="ordinary")}],
        }
        self.assertEqual(window_targets(payload), set())

    def test_model_id_escapes_both_segments(self) -> None:
        model_id = window_model_id("w:1", "s 1")
        self.assertEqual(model_id, "window:w%3A1:s%201")
        validate_window_bindings([self.binding(modelId=model_id)])


class _FakeClient:
    """只实现 ``fetch_states`` / ``call_service`` 的 HA 客户端替身。"""

    def __init__(self, *, flags: int, rows: list | None = None, attributes: dict | None = None) -> None:
        self.flags = flags
        self.rows = rows or []
        self.attributes = attributes or {}
        self.calls: list[tuple] = []

    async def fetch_states(self, entity_ids):
        return [
            {
                "entity_id": "weather.home",
                "state": "sunny",
                "attributes": {"supported_features": self.flags, "friendly_name": "家", **self.attributes},
            }
        ]

    async def call_service(self, domain, service, entity_id, data, *, return_response=False):
        self.calls.append((domain, service, entity_id, data, return_response))
        # 真实 HA 的 `?return_response` 是嵌套的两层；平铺的替身会掩盖解包 bug。
        return {'changed_states': [], 'service_response': {entity_id: {'forecast': self.rows}}}


class ForecastTests(unittest.TestCase):
    """预报归一与上限。"""

    def test_limits_are_per_type(self) -> None:
        self.assertEqual(FORECAST_LIMITS, {"daily": 16, "hourly": 168, "twice_daily": 32})

    def test_normalize_truncates_each_type(self) -> None:
        rows = [{"datetime": f"2026-01-01T00:{index:02d}:00", "temperature": index} for index in range(400)]
        for kind, limit in FORECAST_LIMITS.items():
            with self.subTest(kind=kind):
                self.assertEqual(len(normalize_forecast(rows, kind)), limit)

    def test_normalize_keeps_camel_case_contract(self) -> None:
        rows = [
            {
                "datetime": "2026-01-01T00:00:00+00:00",
                "condition": "rainy",
                "temperature": 12.5,
                "templow": 3,
                "precipitation": 1.2,
                "precipitation_probability": 60,
                "wind_speed": 4,
                "is_daytime": False,
            }
        ]
        item = normalize_forecast(rows, "daily")[0]
        self.assertEqual(item["condition"], "rainy")
        self.assertEqual(item["windSpeed"], 4)
        self.assertEqual(item["precipitationProbability"], 60)
        self.assertFalse(item["isDaytime"])

    def test_normalize_falls_back_to_skycon(self) -> None:
        rows = [{"datetime": "2026-01-01T00:00:00+00:00", "skycon": "PARTLY_CLOUDY_DAY"}]
        self.assertEqual(normalize_forecast(rows, "daily")[0]["condition"], "PARTLY_CLOUDY_DAY")

    def test_unsupported_flags_report_status(self) -> None:
        payload = asyncio.run(read_weather_forecast(_FakeClient(flags=0), "weather.home", "daily"))
        self.assertEqual(payload["status"], "unsupported")
        self.assertEqual(payload["forecast"], [])

    def test_auto_picks_first_supported_type(self) -> None:
        client = _FakeClient(flags=2, rows=[{"datetime": "2026-01-01T00:00:00+00:00", "temperature": 1}])
        payload = asyncio.run(read_weather_forecast(client, "weather.home", "auto"))
        self.assertEqual(payload["type"], "hourly")
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(client.calls[0][3], {"type": "hourly"})

    def test_requested_type_must_be_supported(self) -> None:
        client = _FakeClient(flags=1, rows=[{"datetime": "2026-01-01T00:00:00+00:00", "temperature": 1}])
        payload = asyncio.run(read_weather_forecast(client, "weather.home", "hourly"))
        self.assertEqual(payload["status"], "unsupported")
        self.assertEqual(client.calls, [])

    def test_empty_forecast_is_empty_not_error(self) -> None:
        payload = asyncio.run(read_weather_forecast(_FakeClient(flags=1), "weather.home", "daily"))
        self.assertEqual(payload["status"], "empty")

    def test_proxy_envelope_is_unwrapped(self) -> None:
        """``{"data": {"service_response": ...}}``（HA 代理再套一层）也要能读出来。"""
        rows = [{"datetime": "2026-01-01T00:00:00+00:00", "temperature": 3}]
        self.assertEqual(
            forecast_rows({"data": {"service_response": {"weather.home": {"forecast": rows}}}}, "weather.home"),
            rows,
        )
        self.assertEqual(forecast_rows({"service_response": {"weather.home": {"forecast": rows}}}, "weather.home"), rows)
        self.assertIsNone(forecast_rows({"service_response": {}}, "weather.home"))


def cover_state(
    entity_id: str, position: float, *, state: str = "open", updated: str = "2026-01-01T10:00:00+00:00"
) -> dict:
    return {
        "entityId": entity_id,
        "state": state,
        "available": True,
        "updatedAt": updated,
        "attributes": {"current_position": position},
    }


class CoverMemoryTests(unittest.TestCase):
    """姿态历史：持久化、上限、作用域隔离。"""

    def setUp(self) -> None:
        self.temp = self.enterContext(__import__("tempfile").TemporaryDirectory())
        self.path = Path(self.temp) / "cover-memory" / "history.json"

    def test_observations_persist_across_reload(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        memory.observe("cover.living", cover_state("cover.living", 40), axis="rail")
        memory.flush()

        reloaded = CoverMemory(self.path, credential=lambda: "token-a")
        reloaded.activate()
        entry = reloaded.identify("cover.living", "rail")
        self.assertIsNotNone(entry)
        self.assertEqual(entry["open"], 40)

    def test_other_connection_does_not_read_history(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        memory.observe("cover.living", cover_state("cover.living", 40), axis="rail")
        memory.flush()

        other = CoverMemory(self.path, credential=lambda: "token-b")
        other.activate()
        self.assertEqual(other.entries, {})

    def test_obsolete_source_is_dropped(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        changed = memory.observe_states([cover_state("cover.living", 40)], source="stale-scope")
        self.assertEqual(changed, [])
        self.assertEqual(memory.entries, {})

    def test_observe_states_reports_changes_once(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        first = memory.observe_states([cover_state("cover.living", 40)])
        self.assertEqual(first, ["cover.living"])
        # 同一条状态再来一次不该算「变了」，否则墙屏会反复重取快照。
        self.assertEqual(memory.observe_states([cover_state("cover.living", 40)]), [])

    def test_ignores_non_cover_domains(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        state = cover_state("light.kitchen", 40)
        state["entityId"] = "light.kitchen"
        self.assertEqual(memory.observe_states([state]), [])
        self.assertEqual(memory.entries, {})

    def test_prunes_to_max_entries(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        for index in range(MAX_ENTRIES + 8):
            entity_id = f"cover.c{index}"
            memory.observe(entity_id, cover_state(entity_id, index % 100), axis="rail")
        self.assertEqual(len(memory.entries), MAX_ENTRIES)

    def test_corrupt_file_is_treated_as_empty(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{not json", encoding="utf-8")
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        self.assertEqual(memory.entries, {})

    def test_payload_version_is_fixed(self) -> None:
        memory = CoverMemory(self.path, credential=lambda: "token-a")
        memory.activate()
        memory.observe("cover.living", cover_state("cover.living", 10), axis="rail")
        memory.flush()
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(payload["version"], FILE_VERSION)


class StateHubTests(unittest.TestCase):
    """StateHub 的观察回调与事件作用域。"""

    def test_observe_callback_receives_written_states(self) -> None:
        seen: list[list] = []
        hub = StateHub(observe=lambda states: seen.append(list(states)))
        asyncio.run(hub.update({"entity_id": "cover.living", "state": "open"}))
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0][0]["entityId"], "cover.living")

    def test_observe_failure_does_not_break_dispatch(self) -> None:
        def explode(states):
            raise RuntimeError("boom")

        hub = StateHub(observe=explode)
        queue = hub.subscribe()
        asyncio.run(hub.update({"entity_id": "light.kitchen", "state": "on"}))
        self.assertEqual(queue.get_nowait()["entityId"], "light.kitchen")

    def test_cover_memory_event_is_entity_scoped(self) -> None:
        hub = StateHub()
        subscribed = hub.subscribe()
        hub.set_subscription_entities(subscribed, {"cover.living"})
        other = hub.subscribe()
        hub.set_subscription_entities(other, {"cover.bedroom"})
        asyncio.run(hub.publish({"type": "cover_memory_changed", "entityId": "cover.living"}))
        self.assertEqual(subscribed.get_nowait()["type"], "cover_memory_changed")
        self.assertTrue(other.empty())

    def test_source_key_defaults_to_empty(self) -> None:
        self.assertEqual(StateHub().source_key, "")


class _EmptyDraftDatabase:
    """``draft_repository.read_snapshot`` 的最小替身：没有草稿。"""

    class _Result:
        def mappings(self):
            return self

        def first(self):
            return None

    def execute(self, *args, **kwargs):
        return self._Result()


def _document() -> dict:
    return {
        "projectId": "p1",
        "pages": [
            {
                "id": "page-1",
                "components": [
                    {
                        "id": "c1",
                        "type": "interaction3d",
                        "properties": {
                            "sceneId": SCENE_ID,
                            "label": "客厅",
                            "lights": [
                                {"id": "light-1", "floorId": "f1", "groupId": "g1", "label": "主灯"},
                                {"id": "light-2", "floorId": "f1", "groupId": "g-deleted", "label": "已被删"},
                            ],
                            "environment": {
                                "curtains": [
                                    {"id": "curtain-1", "floorId": "f1", "label": "帘"},
                                ],
                                "curtainGroups": [
                                    {"id": "group-1", "floorId": "f1", "memberIds": ["curtain-1", "curtain-2"]},
                                ],
                            },
                        },
                    }
                ],
            }
        ],
    }


class BindingRepairTests(unittest.TestCase):
    """修复提案：只读、只动选中组件、幂等。"""

    def setUp(self) -> None:
        temp = self.enterContext(__import__("tempfile").TemporaryDirectory())
        self.data_dir = Path(temp)
        scene_dir = self.data_dir / "modules" / "interaction3d" / "scenes"
        scene_dir.mkdir(parents=True, exist_ok=True)
        scene = {
            "floors": [
                {
                    "id": "f1",
                    "scene": {
                        "items": [{"id": "m1"}],
                        "lightGroups": [{"id": "g1"}],
                        "doors": [],
                    },
                }
            ]
        }
        (scene_dir / f"{SCENE_ID}.json").write_text(json.dumps({"scene": scene}), encoding="utf-8")
        self.settings = SimpleNamespace(data_dir=self.data_dir)
        self.database = _EmptyDraftDatabase()

    def repair(self, document, component_ids):
        return repair_binding_document(document, self.settings, self.database, component_ids)

    def test_reports_and_removes_deleted_bindings(self) -> None:
        original = _document()
        repaired, issues = self.repair(original, ["c1"])
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["bindingId"], "light-2")
        self.assertEqual(issues[0]["reason"], "模型或灯组已删除")
        properties = next(iter(module_components(repaired)))[1]["properties"]
        self.assertEqual([item["id"] for item in properties["lights"]], ["light-1"])
        # 入参必须是只读的：调用方还要拿原文档继续编辑。
        original_lights = next(iter(module_components(original)))[1]["properties"]["lights"]
        self.assertEqual(len(original_lights), 2)

    def test_second_pass_is_idempotent(self) -> None:
        repaired, _ = self.repair(_document(), ["c1"])
        again, issues = self.repair(repaired, ["c1"])
        self.assertEqual(issues, [])
        self.assertEqual(again, repaired)

    def test_unselected_components_are_untouched(self) -> None:
        document = _document()
        # 追加第二个组件，id 不在选中集合里。
        document["pages"][0]["components"].append(
            {
                "id": "c2",
                "type": "interaction3d",
                "properties": {
                    "sceneId": SCENE_ID,
                    "lights": [{"id": "light-9", "floorId": "f1", "groupId": "g-deleted"}],
                },
            }
        )
        repaired, issues = self.repair(document, ["c1"])
        self.assertTrue(all(issue["componentId"] == "c1" for issue in issues))
        second = next(item for item in module_components(repaired) if item[1].get("id") == "c2")
        self.assertEqual(len(second[1]["properties"]["lights"]), 1)

    def test_missing_scene_snapshot_changes_nothing(self) -> None:
        """快照缺失 = 证明不了户型现状：宁可什么都不改，也不能凭猜删配置。"""
        document = _document()
        document["pages"][0]["components"][0]["properties"]["sceneId"] = "b" * 32
        repaired, issues = self.repair(document, ["c1"])
        self.assertEqual(issues, [])
        self.assertEqual(repaired, document)

    def test_unreadable_scene_snapshot_is_a_conflict(self) -> None:
        """快照存在但读不出来（损坏）：修复会把配置真的删掉，必须 409 而不是跳过。"""
        (self.data_dir / "modules" / "interaction3d" / "scenes" / f"{SCENE_ID}.json").write_text(
            "{broken", encoding="utf-8"
        )
        with self.assertRaises(HTTPException) as raised:
            self.repair(_document(), ["c1"])
        self.assertEqual(raised.exception.status_code, 409)

    def test_broken_curtain_group_is_repaired(self) -> None:
        repaired, _ = self.repair(_document(), ["c1"])
        environment = next(iter(module_components(repaired)))[1]["properties"]["environment"]
        # 分组引用了已不存在的 curtain-2（未列为绑定项），成员口径不变，只保留原分组。
        self.assertEqual(environment["curtainGroups"][0]["memberIds"], ["curtain-1", "curtain-2"])


class SecurityWindowSectionTests(unittest.TestCase):
    """``security.windows``（安防里的窗户类别）：0.8.4 起才进白名单。"""

    @staticmethod
    def entries(*items: dict) -> dict:
        return {"security": {"windows": list(items)}}

    @staticmethod
    def entry(**extra) -> dict:
        item = {
            "id": "window-1",
            "floorId": "f1",
            "modelId": window_model_id("w1", "s1"),
            "openPercent": 100,
            "doorEntityId": "binary_sensor.study_window",
            "batteryEntityId": "sensor.study_window_battery",
        }
        item.update(extra)
        return item

    def validate(self, properties: dict) -> None:
        validate_security_section(ValidationContext(), properties)

    def test_windows_is_an_allowed_section(self) -> None:
        # 白名单缺 ``windows`` 时整段配置会被 422，窗户类别等于无法保存。
        self.validate(self.entries(self.entry()))

    def test_empty_windows_is_allowed(self) -> None:
        self.validate(self.entries())

    def test_rejects_unknown_field(self) -> None:
        for extra in ({"sashId": "s1"}, {"kind": "window"}, {"contactEntityId": "binary_sensor.x"}):
            with self.subTest(extra=extra), self.assertRaises(HTTPException):
                self.validate(self.entries(self.entry(**extra)))

    def test_rejects_floor_all_and_bad_model(self) -> None:
        for extra in ({"floorId": "all"}, {"modelId": "plain-window"}, {"modelId": ""}):
            with self.subTest(extra=extra), self.assertRaises(HTTPException):
                self.validate(self.entries(self.entry(**extra)))

    def test_rejects_bad_entities(self) -> None:
        for extra in ({"doorEntityId": "light.x"}, {"batteryEntityId": "cover.x"}):
            with self.subTest(extra=extra), self.assertRaises(HTTPException):
                self.validate(self.entries(self.entry(**extra)))

    def test_rejects_duplicate_model(self) -> None:
        with self.assertRaises(HTTPException):
            self.validate(self.entries(self.entry(), self.entry(id="window-2")))


class BackupTests(unittest.TestCase):
    """姿态历史必须进全量备份：否则恢复后动画从零开始。"""

    def test_cover_memory_is_in_backup_roots(self) -> None:
        self.assertIn("modules/interaction3d/cover-memory", BACKUP_ROOTS)


if __name__ == "__main__":
    unittest.main()
