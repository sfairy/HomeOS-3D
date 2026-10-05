"""命令代理模块 Pydantic v2 请求模型（DTO），对齐 Nest class-validator 定义。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CallServiceDto(StrictModel):
    domain: str
    service: str
    entity_id: str
    service_data: dict[str, Any] | None = None
    return_response: bool | None = None
    idempotency_key: str | None = None


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
