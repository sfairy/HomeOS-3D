"""命令代理模块 Pydantic v2 请求模型（DTO），对齐 Nest class-validator 定义。"""

from __future__ import annotations

from typing import Any

from pydantic import model_validator

from .base import StrictModel


class CallServiceDto(StrictModel):
    domain: str
    service: str
    entity_id: str
    service_data: dict[str, Any] | None = None
    return_response: bool | None = None
    idempotency_key: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _accept_data_key(cls, value: Any) -> Any:
        """把前端统一的参数键 ``data`` 归一成 ``service_data``。

        前端（实体 store / 预报拉取）按 ``/ha/services/call`` 的契约发 ``data``，
        而本 DTO 历史上叫 ``service_data``；``StrictModel`` 会拒绝未知键并回 400
        ``data: Extra inputs are not permitted``，导致一次亮灯 / 调温都下发不了。
        两个键同时出现时以显式非空的 ``service_data`` 为准，``data`` 始终被移除，
        否则仍会触发 extra_forbid。
        """
        if isinstance(value, dict) and "data" in value:
            mapped = dict(value)
            data = mapped.pop("data")
            if mapped.get("service_data") is None:
                mapped["service_data"] = data if isinstance(data, dict) else {}
            return mapped
        return value


class HaTestConnectionDto(StrictModel):
    url: str
    token: str


class WebRtcNegotiateDto(StrictModel):
    entity_id: str
    offer: str


class WebRtcCandidateDto(StrictModel):
    entity_id: str
    session_id: str
    candidate: dict[str, Any]


class WebRtcCloseDto(StrictModel):
    entity_id: str
    subscription_id: int
