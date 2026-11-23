"""设备画像接口的响应模型契约测试。

``response_model`` 是双刃剑：它给 OpenAPI / 前端生成类型提供稳定契约，但它会**静默丢弃**
未声明的键。服务端 dict 多加一个字段而模型没跟上时，前端只会「读不到」，没有任何报错。
所以这里钉两件事：

1. 声明字段集 = 与 ``service.list`` / ``service.audit`` 对齐的固定列表（改了一目了然）；
2. 多余键确实被丢弃（把这个危险行为写成断言，而不是留给下一个人踩）。
"""

from __future__ import annotations

import unittest

from homeos.backend.src.api.device_profile import (
    DeviceProfileAuditItem,
    DeviceProfileAuditResponse,
    DeviceProfileItem,
    DeviceProfileListResponse,
)

LIST_FIELDS = {
    "entityId",
    "domain",
    "kind",
    "confidence",
    "confirmed",
    "source",
    "aliases",
    "evidence",
    "available",
    "usable",
    "state",
    "name",
    "areaId",
    "areaName",
    "lastSeenAt",
    "lastClassifiedAt",
}

AUDIT_FIELDS = {"id", "entityId", "action", "fromKind", "toKind", "aliases", "actor", "createdAt"}

SAMPLE_LIST_ITEM = {
    "entityId": "climate.living_room",
    "domain": "climate",
    "kind": "ac_split",
    "confidence": 0.55,
    "confirmed": False,
    "source": "RULE",
    "aliases": ["客厅空调"],
    "evidence": ["mode:cool"],
    "available": True,
    "usable": False,
    "state": "cool",
    "name": "客厅空调",
    "areaId": "living_room",
    "areaName": "客厅",
    "lastSeenAt": "2026-05-01T00:00:00+00:00",
    "lastClassifiedAt": "2026-05-01T00:00:00+00:00",
}


class DeviceProfileSchemaTest(unittest.TestCase):
    def test_list_fields_match_service_payload(self) -> None:
        self.assertEqual(set(DeviceProfileItem.model_fields), LIST_FIELDS)

    def test_audit_fields_match_service_payload(self) -> None:
        self.assertEqual(set(DeviceProfileAuditItem.model_fields), AUDIT_FIELDS)

    def test_list_envelope_accepts_full_item(self) -> None:
        payload = DeviceProfileListResponse.model_validate({"items": [SAMPLE_LIST_ITEM]})
        self.assertEqual(payload.items[0].entityId, "climate.living_room")
        self.assertFalse(payload.items[0].usable)

    def test_optional_timestamps(self) -> None:
        item = dict(SAMPLE_LIST_ITEM, lastSeenAt=None, lastClassifiedAt=None)
        self.assertIsNone(DeviceProfileItem.model_validate(item).lastSeenAt)

    def test_undeclared_keys_are_dropped(self) -> None:
        """已知风险：服务端多给的字段会被静默丢掉 —— 靠上面的字段集断言提前发现。"""
        item = DeviceProfileItem.model_validate(dict(SAMPLE_LIST_ITEM, brandNewField="x"))
        self.assertFalse(hasattr(item, "brandNewField"))

    def test_audit_envelope(self) -> None:
        payload = DeviceProfileAuditResponse.model_validate(
            {
                "items": [
                    {
                        "id": "a1",
                        "entityId": "climate.a",
                        "action": "confirm",
                        "fromKind": "unknown",
                        "toKind": "bath_heater",
                        "aliases": [],
                        "actor": "admin",
                        "createdAt": None,
                    }
                ]
            }
        )
        self.assertEqual(payload.items[0].toKind, "bath_heater")


if __name__ == "__main__":
    unittest.main()
