"""3D 户型草稿的请求模型（路由与领域服务共用）。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Studio3DDraftUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0)
    scene: dict[str, Any]
    interactionConfirmation: str = Field(default="", max_length=64)


class StudioLightRangesUpdate(BaseModel):
    """只改柔光范围的局部更新（0.8.9）。

    绘制页在「调整柔光范围」时不该为一次范围改动重传整份草稿（几十 MB 的户型 JSON）。
    这里只提交受影响的场景，服务端把它合进当前草稿后走同一条保存链路
    （同样的 revision 乐观并发、同样的校验与清理）。
    """

    model_config = ConfigDict(extra="forbid")

    revision: int = Field(ge=0)
    #: 必填：只更新这一个场景的范围（``None`` 表示清空该场景）。
    sceneId: str = Field(min_length=1, max_length=96)
    changes: dict[str, Any] | None = None
    #: 可选的撤销记录追加（与 ``changes`` 一起提交，避免两次往返）。
    archive: list[dict[str, Any]] | None = None
