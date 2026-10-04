"""授权状态查询与激活接口。 本模块只做三件事：读当前授权状态、用激活码激活、重新激活/重试。"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, status

from ..auth_limiter import retry_after_headers
from ..dependencies import CurrentUser, CurrentViewer
from ..license import LicenseClientError
from ..request_origin import require_same_origin_write
from ..schemas import LicenseActivateRequest

router = APIRouter(prefix = '/license', tags = ['license'])

LICENSE_ACTIVATION_LIMIT = (10, 900, 900)


@router.get('/status')
async def license_status(request: Request, _user: CurrentUser) -> dict:
    await request.app.state.license_service.confirm_binding(force = False)
    return await asyncio.to_thread(request.app.state.license_service.status)


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, user: CurrentUser) -> dict:
    limiter = request.app.state.license_activation_limiter
    key = user.id
    remaining = limiter.retry_after(key)
    if remaining > 0:
        raise HTTPException(
            status_code = status.HTTP_429_TOO_MANY_REQUESTS,
            detail = f'激活尝试过于频繁，请 {remaining} 秒后再试。',
            headers = retry_after_headers(remaining))
    try:
        result = await request.app.state.license_service.activate(payload.activation_code, payload.email)
    except LicenseClientError as error:
        if error.status_code != status.HTTP_409_CONFLICT:
            limiter.record_failure(key)
        raise HTTPException(status_code = status.HTTP_422_UNPROCESSABLE_CONTENT, detail = str(error)) from error
    limiter.reset(key)
    return result


@router.post('/reactivate')
async def reactivate_license(request: Request, _user: CurrentUser) -> dict:
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error


@router.post('/retry')
async def retry_license(request: Request, viewer: CurrentViewer) -> dict:
    """显式重试当前实例的授权恢复。"""
    require_same_origin_write(request)
    try:
        result = await request.app.state.license_service.retry_now()
    except LicenseClientError as error:
        retryable = error.code not in {'LICENSE_REAUTH_REQUIRED', 'LICENSE_RETRY_THROTTLED'} and not error.is_confirmed_revocation
        code = error.code or ('LICENSE_RETRYABLE' if retryable else 'LICENSE_REAUTH_REQUIRED')
        raise HTTPException(
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE if retryable else status.HTTP_409_CONFLICT,
            detail = {
                'code': code,
                'message': str(error),
                'retryable': retryable }) from error
    return result if viewer.is_admin_session else request.app.state.license_service.availability()


@router.get('/availability')
def license_availability(request: Request) -> dict:
    return request.app.state.license_service.availability()
