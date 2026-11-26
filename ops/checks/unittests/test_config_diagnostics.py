"""3D 配置结构化诊断（0.8.9）。

锁三件事：

1. 诊断**永不抛错**（只读检查不该因为配置坏掉就 500）；
2. 失败项带 ``scope``，且原因是人能看懂的中文；
3. 保存路径与诊断路径用**同一张分区表**（否则「检查通过、保存被拒」这种自相矛盾会出现）。
"""

from __future__ import annotations

import unittest

from _support import ensure_repo_on_path

ensure_repo_on_path()

from homeos.backend.src.modules.interaction3d.config import (
    validate_config,
    validate_config_sections,
)
from homeos.backend.src.modules.interaction3d.config_diagnostics import (
    CONFIG_SECTIONS,
    check_configuration,
    configured_validate_config,
    diagnostic_payload,
)
from homeos.backend.src.platform.core.http.errors import BusinessException


class DiagnosticPayloadTests(unittest.TestCase):
    def test_non_object_properties_is_a_finding_not_an_exception(self) -> None:
        payload = diagnostic_payload("not-an-object")
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["findings"][0]["scope"], "config")

    def test_empty_properties_reports_findings(self) -> None:
        payload = diagnostic_payload({})
        self.assertFalse(payload["valid"])
        self.assertTrue(payload["findings"])

    def test_every_finding_has_scope_and_chinese_reason(self) -> None:
        for finding in check_configuration({}):
            self.assertIn("scope", finding.as_payload())
            self.assertTrue(finding.reason)
            self.assertRegex(finding.reason, r"[\u4e00-\u9fff]")

    def test_findings_are_capped(self) -> None:
        # 分区数有限，finding 不会超过分区数；这条守的是「别把分区循环写成嵌套爆炸」。
        self.assertLessEqual(len(check_configuration({})), len(CONFIG_SECTIONS))


class SavePathTests(unittest.TestCase):
    def test_save_path_raises_business_exception_with_stable_code(self) -> None:
        with self.assertRaises(BusinessException) as caught:
            configured_validate_config({})
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(caught.exception.headers.get("x-homeos-config-scope"), "lights")

    def test_validate_config_delegates_to_diagnostics(self) -> None:
        with self.assertRaises(BusinessException):
            validate_config({})

    def test_raw_section_validator_keeps_original_http_exception(self) -> None:
        from fastapi import HTTPException

        with self.assertRaises(HTTPException):
            validate_config_sections({})

    def test_section_table_covers_expected_scopes(self) -> None:
        scopes = [scope for scope, _validator in CONFIG_SECTIONS]
        for expected in ("core", "navigation", "security", "appearance", "lights", "environment", "devices"):
            self.assertIn(expected, scopes)


if __name__ == "__main__":
    unittest.main()
