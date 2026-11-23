"""``/system/info`` 与 ``/system/health`` 的响应模型契约测试。

这两个接口是前端健康检查 / 关于页的入口，字段被直接渲染（`dbSize` / `uptime` 就是给人看的
字符串）。``response_model`` 会**静默丢弃**未声明的键，所以字段集必须与
`SystemService.get_system_info` / `get_health` 的返回逐条对齐 —— 这里钉住两侧。
"""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from homeos.backend.src.api.system.core import SystemHealthResponse, SystemInfoResponse
from homeos.backend.src.platform.core.runtime.process_memory import (
    MEMORY_HEALTH_FIELDS,
)

INFO_FIELDS = {"version", "timestamp"}
HEALTH_FIELDS = {
    "cpu",
    "memory",
    "memoryMb",
    "memoryLimitMb",
    "rssMb",
    "heapUsedMb",
    "heapTotalMb",
    "dbSize",
    "uptime",
    "version",
}

#: `get_health` 里直接取自 `get_process_memory_health()` 的键（其余在服务层组装）。
MEMORY_DERIVED_HEALTH_FIELDS = {
    "memory",
    "memoryMb",
    "memoryLimitMb",
    "rssMb",
    "heapUsedMb",
    "heapTotalMb",
}

SAMPLE_HEALTH = {
    "cpu": 7,
    "memory": 42,
    "memoryMb": 120,
    "memoryLimitMb": 512,
    "rssMb": 120,
    "heapUsedMb": 120,
    "heapTotalMb": 120,
    "dbSize": "12.3 MB",
    "uptime": "3h20m",
    "version": "0.8.8",
}


class SystemSchemaTest(unittest.TestCase):
    def test_info_fields(self) -> None:
        self.assertEqual(set(SystemInfoResponse.model_fields), INFO_FIELDS)

    def test_health_fields(self) -> None:
        self.assertEqual(set(SystemHealthResponse.model_fields), HEALTH_FIELDS)

    def test_memory_derived_fields_cover_memory_payload(self) -> None:
        """内存模块产出的键必须全部被响应模型声明，否则那几个指标会凭空消失。"""
        missing = set(MEMORY_HEALTH_FIELDS) - set(SystemHealthResponse.model_fields)
        self.assertEqual(missing, set())
        self.assertTrue(MEMORY_DERIVED_HEALTH_FIELDS <= HEALTH_FIELDS)

    def test_health_validates_and_keeps_strings_as_display_labels(self) -> None:
        model = SystemHealthResponse.model_validate(SAMPLE_HEALTH)
        # `dbSize` / `uptime` 是展示标签，不能被转成数字 —— 前端直接渲染它们。
        self.assertEqual(model.dbSize, "12.3 MB")
        self.assertEqual(model.uptime, "3h20m")
        self.assertEqual(model.cpu, 7)

    def test_undeclared_keys_are_dropped(self) -> None:
        model = SystemHealthResponse.model_validate(dict(SAMPLE_HEALTH, extraMetric=1))
        self.assertFalse(hasattr(model, "extraMetric"))

    def test_info_requires_both_fields(self) -> None:
        with self.assertRaises(ValidationError):
            SystemInfoResponse.model_validate({"version": "1.0"})


if __name__ == "__main__":
    unittest.main()
