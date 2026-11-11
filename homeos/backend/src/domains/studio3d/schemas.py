"""3D 户型草稿的请求模型（路由与领域服务共用）。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Studio3DDraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0)
    scene: dict[str, Any]
    interactionConfirmation: str = Field(default="", max_length=64)
