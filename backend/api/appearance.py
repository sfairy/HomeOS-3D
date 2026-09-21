"""站点配色接口：读 / 写四束光，以及把当前配色渲染成样式表。

路由前缀 /api/v1/appearance（读写），样式表在 /appearance.css（不带前缀，见 main.py
的注册处）—— 后者是给 ``<link rel="stylesheet">`` 用的，必须落在页面同级路径上。

## 为什么样式表要由后端生成，而不是前端写一个 <style>

主应用的 CSP 是 ``style-src 'self'``：内联 ``<style>`` 与 ``style=`` 属性都会被浏览器
拦掉。留 ``unsafe-inline`` 来换一条配色注入是不划算的 —— 那等于把整站的样式策略
降级给一个装饰功能。

所以走「服务端生成的样式表」：页面里一个 ``<link href="/appearance.css?v=<revision>">``，
``?v=`` 取配置文件的 mtime，改完配色 URL 就变了，浏览器必然重取。

实时预览不走这条链路：设置界面用 CSSOM 直接
``document.documentElement.style.setProperty()``，CSSOM 赋值不受 CSP 约束，
拖动色轮时不必每次都往返一趟服务端。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from ..core.appearance import AppearanceError, validate_preset, validate_tokens
from ..core.dependencies import CurrentUser

router = APIRouter(prefix = '/appearance', tags = ['appearance'])


class AppearanceUpdateRequest(BaseModel):
    """配色写入体。

    ``tokens`` 用 ``dict[str, str]`` 而不是固定的 45 个字段：令牌清单属于设计系统，
    会随四束光的增删而变，把它抄成 45 个 pydantic 字段意味着每加一枚令牌都要改三处
    （JS 模块、这里、前端界面）。白名单校验在 :func:`validate_tokens` 里，那里才是唯一真值。
    """

    model_config = ConfigDict(extra = 'forbid')

    #: 预设 id；'custom' 表示主控色被手动改过，其余三束光沿用某个预设。
    #: 空串 = 回到设计系统默认值（不覆盖任何令牌）。
    preset: str = ''
    tokens: dict[str, str] = Field(default_factory = dict)


@router.get('')
def get_appearance(request: Request, _user: CurrentUser) -> dict:
    """当前配色。未配置过时返回空的 ``tokens`` 与空 ``preset``。"""
    return request.app.state.appearance.state()


@router.put('')
def update_appearance(
    payload: AppearanceUpdateRequest,
    request: Request,
    _user: CurrentUser,
) -> dict:
    """保存配色。校验不通过一律 422，且**不做部分保留**。

    管理员是唯一调用方，但仍然把错误说清楚：配色面板是拖出来的一组值，
    「保存失败」如果只说「参数错误」，管理员无法知道是哪一束光、错成什么样。
    """
    try:
        preset = validate_preset(payload.preset)
        tokens = validate_tokens(payload.tokens)
    except AppearanceError as error:
        raise HTTPException(
            status_code = status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail = str(error),
        ) from error
    return request.app.state.appearance.save(preset = preset, tokens = tokens)
