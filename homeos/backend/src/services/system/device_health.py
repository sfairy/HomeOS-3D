"""设备健康概览服务（对齐 ``modules/system/device/health.service.ts``）。

职责：聚合离线状态与固件更新可用情况，产出一份面向前端的「设备健康摘要」。
依赖：状态库（当前 HA 实体状态快照）。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ...core.entity_domain import get_entity_domain

#: 每类采样上限，避免响应体过大
SAMPLE_LIMIT = 8


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


class DeviceHealthService:
    """通过组合状态存储，向前端返回统一的设备健康摘要。"""

    def __init__(self, state_store: Any) -> None:
        self._state_store = state_store

    def get_summary(self) -> dict[str, Any]:
        """生成设备健康摘要。

        1. 遍历状态库全部实体，统计离线设备（state 为 unavailable/unknown）
           与可用固件更新（domain 为 update 且 state 为 on/available）；
        2. 每类采样最多 8 条。
        """
        entities = self._state_store.get_all()
        offline_count = 0
        update_available_count = 0
        offline_samples: list[dict[str, str]] = []
        update_samples: list[dict[str, str]] = []

        for entity in entities:
            entity_id = str(entity.get("entity_id") or "")
            domain = get_entity_domain(entity_id)
            attributes = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            # friendly_name 为 HA 属性 key，缺失时回退到 entity_id
            name = str(attributes.get("friendly_name") or entity_id)
            state = entity.get("state")

            # 离线判定：unavailable / unknown 均视为不可用（设备状态枚举值不翻译）
            if state in ("unavailable", "unknown"):
                offline_count += 1
                if len(offline_samples) < SAMPLE_LIMIT:
                    offline_samples.append({"entityId": entity_id, "name": name, "domain": domain})

            # 固件更新判定：update 域且 state 为 on/available 表示有可用更新
            if domain == "update":
                lowered = str(state or "").lower()
                if lowered in ("on", "available"):
                    update_available_count += 1
                    if len(update_samples) < SAMPLE_LIMIT:
                        update_samples.append(
                            {"entityId": entity_id, "name": name, "state": str(state)}
                        )

        return {
            "offline": {"count": offline_count, "samples": offline_samples},
            "firmwareUpdates": {"count": update_available_count, "samples": update_samples},
            "generatedAt": _iso_now(),
        }


__all__ = ["SAMPLE_LIMIT", "DeviceHealthService"]
