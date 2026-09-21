"""商店站点配色接口：读 / 写四束光，以及把当前配色渲染成样式表。

路由前缀 ``/store-admin/v1/appearance``（与商店后台其余接口同一组，需要管理员会话）；
样式表在 ``/store-appearance.css``（不带前缀，见 ``store/app.py`` 的注册处）——
后者是给 ``<link rel="stylesheet">`` 用的，必须落在页面同级路径上。

与主应用 ``backend/api/appearance.py`` 同款设计：后端只做白名单 + 取值格式校验，
颜色本身由 ``design/scene/appearance.js`` 在前端算好（那是唯一一份实现）。
实时预览走 CSSOM，不受 CSP 的 ``style-src`` 约束；落盘靠这条接口。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from store.core.deps import AdminAccount
from store.ops.appearance import AppearanceError, validate_preset, validate_tokens

router = APIRouter(prefix="/store-admin/v1/appearance", tags=["appearance"])


class AppearanceUpdateRequest(BaseModel):
    """配色写入体。

    ``tokens`` 用 ``dict[str, str]`` 而不是固定字段：令牌清单属于设计系统，
    会随四束光的增删而变；把它抄成 45 个 pydantic 字段意味着每加一枚令牌要改三处
    （JS 模块、主应用后端、商店后端）。白名单校验在 ``validate_tokens`` 里，那里才是真值。
    """

    model_config = ConfigDict(extra="forbid")

    #: 预设 id；``custom`` 表示主控色被手动改过，其余三束光沿用某个预设。
    #: 空串 = 回到设计系统默认值（不覆盖任何令牌）。
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

    错误文案直接把 ``AppearanceError`` 的内容回给管理员：配色面板是拖出来的一组值，
    「保存失败」如果只说「参数错误」，管理员无法知道是哪一束光、错成什么样。
    """
    try:
        preset = validate_preset(payload.preset)
        tokens = validate_tokens(payload.tokens)
    except AppearanceError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    return request.app.state.appearance.save(preset=preset, tokens=tokens)
