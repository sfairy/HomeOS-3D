"""授权状态查询与激活接口。

本模块只做三件事：读当前授权状态、用激活码激活、用本机已有凭证重新激活。
真正的授权判定都在 ``license_service`` 里，这里只负责转发参数，
并把 ``LicenseClientError`` 按语义分流成 422（激活被拒、激活码非法）
或 409（本机无可用凭证、需要用户手动激活）。
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from ..dependencies import CurrentUser
from ..license import LicenseClientError
from ..schemas import LicenseActivateRequest

router = APIRouter(prefix='/license', tags=['license'])


@router.get('/status')
def license_status(request: Request, _user: CurrentUser) -> dict:
    """读取当前授权状态（需已登录）。

    直接回传 ``license_service.status()`` 的原始结构，字段名由授权模块与前端约定，
    这里不做加工：包含 status、到期时间、可用能力码等，前端据此决定是否跳 /license。
    """
    return request.app.state.license_service.status()


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, _user: CurrentUser) -> dict:
    """用激活码激活授权（需已登录）。

    请求体: activation_code（激活码）与 email（可选的绑定邮箱）。

    成功返回授权模块的激活结果字典；激活被服务端拒绝时抛 422，
    detail 直接使用底层返回的中文错误文案。
    """
    try:
        return await request.app.state.license_service.activate(payload.activation_code, payload.email)
    except LicenseClientError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error


@router.post('/reactivate')
async def reactivate_license(request: Request, _user: CurrentUser) -> dict:
    '''用户主动触发的「重新激活」，不需要请求体：凭证取自本机保存的激活记录。

    身份：需已登录（CurrentUser）。

    失败时返回 ``{code, message}`` 结构：``LICENSE_ACTIVATION_REQUIRED`` 表示本机
    没有可复用的激活凭证，前端应展开激活表单让用户手动输入；其余错误码只用于展示。
    '''
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        # 状态码由底层错误决定：网络/服务端故障自带 5xx，其余按下面的兜底处理。
        # 没有状态码时统一用 409 而不是 422：语义是「本机当前状态无法自动重新激活」
        # （例如没有任何可复用凭证），而不是激活码本身写错了；前端收到后应引导
        # 用户走手动激活表单，而不是反复重试同一个请求。
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error
