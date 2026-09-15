from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from ..dependencies import CurrentUser
from ..license import LicenseClientError
from ..schemas import LicenseActivateRequest

router = APIRouter(prefix='/license', tags=['license'])


@router.get('/status')
def license_status(request: Request, _user: CurrentUser) -> dict:
    return request.app.state.license_service.status()


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, _user: CurrentUser) -> dict:
    try:
        return await request.app.state.license_service.activate(payload.activation_code, payload.email)
    except LicenseClientError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error


@router.post('/reactivate')
async def reactivate_license(request: Request, _user: CurrentUser) -> dict:
    '''用户主动触发的「重新激活」，不需要请求体：凭证取自本机保存的激活记录。

    失败时返回 ``{code, message}`` 结构：``LICENSE_ACTIVATION_REQUIRED`` 表示本机
    没有可复用的激活凭证，前端应展开激活表单让用户手动输入；其余错误码只用于展示。
    '''
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error
