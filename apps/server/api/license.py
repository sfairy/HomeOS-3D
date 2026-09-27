"""授权状态查询与激活接口。
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, status

from ..security.dependencies import CurrentUser, CurrentViewer
from ..license import LicenseClientError
from ..security.http_security import same_origin_request
from ..core.schemas import LicenseActivateRequest

router = APIRouter(prefix='/license', tags=['license'])

# 「再点重试也不会变好」的错误码：目前只有「要求人工重新激活」。
RETRY_TERMINAL_CODES = frozenset({'LICENSE_REAUTH_REQUIRED'})

#: 激活尝试的失败预算 (max_failures, window_seconds, block_seconds)。
LICENSE_ACTIVATION_LIMIT = (10, 900, 900)
#: 键空间上限：键是账号 id（库内自生成、外部造不出来），但仍按带键上限的计数器记账，
LICENSE_ACTIVATION_KEYS = 1024


@router.get('/status')
async def license_status(request: Request, _user: CurrentUser) -> dict:
    """读取当前授权状态（需已登录）。
    """
    await request.app.state.license_service.confirm_binding(force=False)
    return await asyncio.to_thread(request.app.state.license_service.status)


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, user: CurrentUser) -> dict:
    """用激活码激活授权（需已登录）。
    """
    limiter = request.app.state.license_activation_limiter
    key = user.id
    remaining = limiter.retry_after(key)
    if remaining > 0:
        raise HTTPException(
            status_code = status.HTTP_429_TOO_MANY_REQUESTS,
            detail = f'激活尝试过于频繁，请 {remaining} 秒后再试。',
            headers = {'Retry-After': str(remaining)})
    try:
        result = await request.app.state.license_service.activate(payload.activation_code, payload.email)
    except LicenseClientError as error:
        limiter.record_failure(key)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    # 成功即清账：换到一个有效激活码之后再想试别的，不该背着之前猜错的次数。
    limiter.reset(key)
    return result


@router.post('/reactivate')
async def reactivate_license(request: Request, _user: CurrentUser) -> dict:
    '''用户主动触发的「重新激活」，不需要请求体：凭证取自本机保存的激活记录。
    '''
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        # 状态码由底层错误决定：网络/服务端故障自带 5xx。
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error


@router.post('/retry')
async def retry_license(request: Request, viewer: CurrentViewer) -> dict:
    """立刻重试一次授权恢复（需已登录或已配对的中控设备）。
    """
    # 本接口有真实副作用（触发联网重试），属于写操作，必须自己挡跨站请求：
    if not same_origin_request(request) or request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='不允许跨站重试授权。')
    try:
        result = await request.app.state.license_service.retry_now()
    except LicenseClientError as error:
        # 分流成两种信号：可重试 → 503（稍后再来），需人工介入 → 409（再点也没用）。
        retryable = error.code not in RETRY_TERMINAL_CODES and not error.is_confirmed_revocation
        raise HTTPException(
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE if retryable else status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or ('LICENSE_RETRYABLE' if retryable else 'LICENSE_REAUTH_REQUIRED'),
                'message': str(error),
                'retryable': retryable}) from error
    return result if viewer.is_admin_session else await asyncio.to_thread(request.app.state.license_service.availability)


@router.get('/availability')
async def license_availability(request: Request) -> dict:
    """匿名可读的授权可用性摘要（无需登录、无需配对）。
    """
    # 与 /status 同理：组摘要要查库并核对硬件指纹，同步跑在事件循环上会拖住所有请求。
    return await asyncio.to_thread(request.app.state.license_service.availability)
