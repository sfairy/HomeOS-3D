# 授权状态查询与激活接口。
#
# 本模块只做三件事：读当前授权状态、用激活码激活、重新激活/重试。
# 真正的授权判定都在 license_service 里，这里只负责转发参数，
# 并把 LicenseClientError 按语义分流成 422（激活被拒、激活码非法）
# 或 409（本机无可用凭证、需要用户手动激活）。
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from ..dependencies import CurrentUser, CurrentViewer
from ..license import LicenseClientError
from ..schemas import LicenseActivateRequest

router = APIRouter(prefix = '/license', tags = ['license'])


@router.get('/status')
def license_status(request: Request, _user: CurrentUser) -> dict:
    # [补充说明] 读取当前授权状态（需已登录）。
    #
    # 字段名由授权模块与前端约定，这里不做加工：直接查库返回。
    return request.app.state.license_service.status()


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, _user: CurrentUser) -> dict:
    # [补充说明] 用激活码激活授权（需已登录）。
    #
    # 请求体: activation_code（激活码）与 email（可选的绑定邮箱）。
    #
    # 成功返回授权模块的激活结果字典；激活被服务端拒绝时抛 422，
    # detail 直接使用底层返回的中文错误文案。
    try:
        return await request.app.state.license_service.activate(payload.activation_code, payload.email)
    except LicenseClientError as error:
        raise HTTPException(status_code = status.HTTP_422_UNPROCESSABLE_CONTENT, detail = str(error)) from error


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
