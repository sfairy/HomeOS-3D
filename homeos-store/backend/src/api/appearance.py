"""商店站点配色接口：读 / 写四束光，以及把当前配色渲染成样式表。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from ..core.deps import AdminAccount
from ..ops.appearance import AppearanceError, validate_preset, validate_tokens

router = APIRouter(prefix="/store-admin/v1/appearance", tags=["appearance"])


class AppearanceUpdateRequest(BaseModel):
    """配色写入体。
    """

    model_config = ConfigDict(extra="forbid")

    preset: str = ""
    tokens: dict[str, str] = Field(default_factory=dict)


@router.get("")
def get_appearance(request: Request, _admin: AdminAccount) -> dict:
    """当前配色。未配置过时返回空的 ``tokens`` 与空 ``preset``。"""
    return request.app.state.appearance.state()


@router.put("")
def update_appearance(
    payload: AppearanceUpdateRequest,
    request: Request,
    _admin: AdminAccount,
) -> dict:
    """保存配色。校验不通过一律 422，且**不做部分保留**。
    """
    try:
        preset = validate_preset(payload.preset)
        tokens = validate_tokens(payload.tokens)
    except AppearanceError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error
    return request.app.state.appearance.save(preset=preset, tokens=tokens)
