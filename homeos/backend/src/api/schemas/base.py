"""共享 Pydantic 基类。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    """等价 Nest ``ValidationPipe({ whitelist, forbidNonWhitelisted })``：拒绝未知字段。"""

    model_config = ConfigDict(extra="forbid")
