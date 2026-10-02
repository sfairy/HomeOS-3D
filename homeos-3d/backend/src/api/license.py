# 授权状态查询与激活接口。
#
# 本模块只做三件事：读当前授权状态、用激活码激活、重新激活/重试。
# 真正的授权判定都在 license_service 里，这里只负责转发参数，
# 并把 LicenseClientError 按语义分流成 422（激活被拒、激活码非法）
# 或 409（本机无可用凭证、需要用户手动激活）。
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, status

from ..dependencies import CurrentUser, CurrentViewer
from ..license import LicenseClientError
from ..schemas import LicenseActivateRequest

router = APIRouter(prefix = '/license', tags = ['license'])

# 激活尝试的失败预算 (max_failures, window_seconds, block_seconds)：
# 15 分钟内错 10 次就锁 15 分钟。激活码是可以被猜的固定格式字符串，没有这一层，
# 一个已登录会话就能不限速地枚举 —— 每次猜测都会真的打到授权后台。
LICENSE_ACTIVATION_LIMIT = (10, 900, 900)


@router.get('/status')
async def license_status(request: Request, _user: CurrentUser) -> dict:
    # [补充说明] 读取当前授权状态（需已登录）。
    #
    # 字段名由授权模块与前端约定，这里不做加工：直接查库返回。
    # 状态查询是前端进入授权页后的第一件事，顺带联网确认一次绑定：商店解绑 / 停用
    # 会在这里被立刻反映成 REVOKED，用户不必等下一轮心跳。confirm_binding 自带
    # 60 秒节流与「未激活不联网」的短路，轮询打不出额外请求。
    await request.app.state.license_service.confirm_binding(force = False)
    return await asyncio.to_thread(request.app.state.license_service.status)


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, user: CurrentUser) -> dict:
    # [补充说明] 用激活码激活授权（需已登录）。
    #
    # 请求体: activation_code（激活码）与 email（可选的绑定邮箱）。
    #
    # 成功返回授权模块的激活结果字典；激活被服务端拒绝时抛 422，
    # detail 直接使用底层返回的中文错误文案。
    #
    # 本接口带失败预算：激活码是可枚举的固定格式串，且每次尝试都会真的请求授权后台，
    # 不限速就成一个已登录会话就能无限试的猜码口子。
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
        # 409「该授权已绑定其他设备」说明激活码与邮箱**都是对的**，只是设备还没解绑 ——
        # 它不是一次猜码尝试。计入失败预算会让用户在照着提示去解绑前多点几下就被锁 15 分钟，
        # 而失败预算本来就是为「猜码枚举」设的（见文件头的说明）。
        if error.status_code != status.HTTP_409_CONFLICT:
            limiter.record_failure(key)
        raise HTTPException(status_code = status.HTTP_422_UNPROCESSABLE_CONTENT, detail = str(error)) from error
    # 成功即清账：换到一个有效激活码之后再想试别的，不该背着之前猜错的次数。
    limiter.reset(key)
    return result


@router.post('/reactivate')
async def reactivate_license(request: Request, _user: CurrentUser) -> dict:
    # [补充说明] 用户主动触发的「重新激活」，不需要请求体。
    #
    # 凭证取自本机保存的激活记录：加密后的完整激活码 + 绑定邮箱。三条降级路径
    # （先续租 → 再用本地激活码重放激活 → 都没有就请用户重新输入）都在 service 里，
    # 这里只负责把错误码透传给前端，让它决定「静默成功」「自动重激活失败」还是
    # 「弹回激活码输入框」。
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        # 状态码由底层错误决定：网络 / 服务端故障自带 5xx，缺凭证是 409。
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error


@router.post('/retry')
async def retry_license(request: Request, viewer: CurrentViewer) -> dict:
    """Explicitly retry the current instance's authorization recovery."""
    # [补充说明] 立刻重试一次授权恢复（需已登录或已配对的中控设备）。
    #
    # 身份：CurrentViewer —— 中控设备与管理员都可重试，这正是展示端卡在受限页时的自救出口。
    #
    # 返回: 管理员会话拿完整状态；中控设备只拿 availability() 的摘要 ——
    # 展示端既不需要、也不该看到授权标识与凭证字段。
    # 本接口有真实副作用（触发联网重试），属于写操作，必须自己挡跨站请求：
    # Origin 与请求的 base_url 不同源即拒；sec-fetch-site 是额外的第二道闸。
    origin = request.headers.get('origin')
    if (origin and origin.rstrip('/') != str(request.base_url).rstrip('/')) or request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(status_code = 403, detail = '不允许跨站重试授权。')
    try:
        result = await request.app.state.license_service.retry_now()
    except LicenseClientError as error:
        # 分流成两种信号：可重试 → 503（稍后再来），需人工介入 → 409（再点也没用）。
        # 前端据此决定是否继续显示重试按钮，所以必须由后端给结论，而不是让前端猜错误码含义。
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
    # [补充说明] 匿名可读的授权可用性摘要（无需登录、无需配对）。
    #
    # 恢复页与展示端恰恰是在「授权不可用」时才打开它：前者由 /pair 与 /display/* 就地渲染
    # （授权不可用时不再落 403），此时可能既登不上、也没配对成功，所以本接口不能要求身份。
    # 代价是返回体必须脱敏：只给状态与「能否重试」，不给授权标识、租约、密钥或原始错误文案
    # （脱敏口径统一在 service.availability() 里）。
    return request.app.state.license_service.availability()
