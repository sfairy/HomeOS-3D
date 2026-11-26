"""0.8.9 新增 3D 配置键的校验（后端）。

两类都必须挡住，否则前端存进去、后端不认（或反之）：

- **`viewGesturesEnabled`**：前端 `stage.ts` 用 `=== true` 判定，收到字符串 `"true"`
  就等于手势永远不开 —— 这是「配置看着对、功能就是不生效」的典型。
- **`heatingBoilers`**：主实体必须是 `climate.*`；`underfloorHeating` 是「制热时显示
  本层盘管」的开关，必须是布尔；`heatingPanelStyle` 只能是两种面板形态（`thermostat` / `climate`）。

白名单坑（写在这里提醒后来者）：`environment` 分区有**两处**白名单 —— 分区自身的
`ENVIRONMENT_FIELDS` 与集合的 `APPLIANCE_RULES`。只加一处会表现为「校验永远失败、
但错误信息看不出原因」。
"""

from __future__ import annotations

import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()


from homeos.backend.src.modules.interaction3d.config import validate_config
from homeos.backend.src.modules.interaction3d.config_diagnostics import (
    check_configuration,
)
from homeos.backend.src.platform.core.http.errors import BusinessException

#: 最小合法基线：`lights` 分区要求 `sceneId` 是 32 位 hex，缺了整份配置都不过。
BASE = {"sceneId": "a" * 32}


def config(**overrides) -> dict:
    return {**BASE, **overrides}


#: 一条结构完整的家电记录（身份 + 位置 + 尺寸齐备）。
BOILER = {
    "id": "boiler-1",
    "floorId": "floor-1",
    "modelId": "model-1",
    "label": "壁挂炉",
    "entityId": "climate.boiler",
    "deviceId": "device-1",
    "deviceName": "壁挂炉",
    "x": 0,
    "y": 0,
    "size": 1,
}


def environment_with(**overrides) -> dict:
    return config(environment={"heatingBoilers": [dict(BOILER, **overrides)]})


def environment_findings(payload: dict) -> list[str]:
    return [finding.reason for finding in check_configuration(payload) if finding.scope == "environment"]


class ViewGesturesFlagTests(unittest.TestCase):
    def test_accepts_boolean_true(self) -> None:
        validate_config(config(viewGesturesEnabled=True))

    def test_accepts_boolean_false(self) -> None:
        validate_config(config(viewGesturesEnabled=False))

    def test_accepts_absent_key(self) -> None:
        """缺省必须是合法（旧配置不带这个键）。"""
        validate_config(config())

    def test_rejects_string_truthy(self) -> None:
        """`"true"` 会让前端 `=== true` 失效 —— 必须拒绝而不是静默放行。"""
        with self.assertRaises(BusinessException):
            validate_config(config(viewGesturesEnabled="true"))

    def test_rejects_number(self) -> None:
        with self.assertRaises(BusinessException):
            validate_config(config(viewGesturesEnabled=1))


class HeatingPanelStyleTests(unittest.TestCase):
    def test_accepts_both_styles(self) -> None:
        # 这是**顶层**默认面板形态（`config.properties.heatingPanelStyle`），
        # 与 item 级的 `heatingPanelStyle` 不是同一个键：item 级取值是
        # `thermostat` / `climate`，顶层沿用项目既有的 `thermostat` / `air-conditioner`。
        for style in ("thermostat", "air-conditioner"):
            validate_config(config(heatingPanelStyle=style))

    def test_rejects_unknown_style(self) -> None:
        with self.assertRaises(BusinessException):
            validate_config(config(heatingPanelStyle="card"))


class HeatingBoilerTests(unittest.TestCase):
    def test_minimal_boiler_is_valid(self) -> None:
        self.assertEqual(environment_findings(environment_with()), [])

    def test_underfloor_flag_bool_is_valid(self) -> None:
        self.assertEqual(environment_findings(environment_with(underfloorHeating=True)), [])
        self.assertEqual(environment_findings(environment_with(underfloorHeating=False)), [])

    def test_underfloor_flag_must_be_boolean(self) -> None:
        self.assertTrue(environment_findings(environment_with(underfloorHeating="yes")))

    def test_panel_style_enum(self) -> None:
        self.assertEqual(environment_findings(environment_with(heatingPanelStyle="climate")), [])
        self.assertTrue(environment_findings(environment_with(heatingPanelStyle="x")))
        # 迁移期旧键继续放行，避免既有文档保存 422。
        self.assertEqual(environment_findings(environment_with(panelStyle="air-conditioner")), [])

    def test_main_entity_must_be_climate(self) -> None:
        # 覆盖 / 开关 / 传感器都不行：壁挂炉在 HA 里是 climate + 水阀组合。
        for wrong in ("cover.boiler", "switch.boiler", "sensor.boiler"):
            self.assertTrue(environment_findings(environment_with(entityId=wrong)), wrong)

    def test_environment_whitelist_includes_collection(self) -> None:
        """分区白名单漏了集合时，校验会「永远失败但看不出原因」—— 这条守住它。"""
        payload = environment_with()
        # 空集合合法（用户删光了壁挂炉）。
        self.assertEqual(environment_findings(config(environment={"heatingBoilers": []})), [])
        self.assertEqual(environment_findings(payload), [])

    def test_collection_type_must_be_list(self) -> None:
        self.assertTrue(environment_findings(config(environment={"heatingBoilers": {}})))

    def test_unknown_field_is_rejected(self) -> None:
        self.assertTrue(environment_findings(environment_with(mysteryField=1)))


class DiagnosticsReportScopeTests(unittest.TestCase):
    def test_failing_boiler_reports_environment_scope(self) -> None:
        findings = check_configuration(environment_with(entityId="cover.x"))
        scopes = [finding.scope for finding in findings]
        self.assertIn("environment", scopes)


if __name__ == "__main__":
    unittest.main()
