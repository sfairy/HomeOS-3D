"""授权状态查询与激活接口。

本模块只做三件事：读当前授权状态、用激活码激活、用本机已有凭证重新激活。
真正的授权判定都在 ``license_service`` 里，这里只负责转发参数，
并把 ``LicenseClientError`` 按语义分流成 422（激活被拒、激活码非法）
或 409（本机无可用凭证、需要用户手动激活）。
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request, status

from ..core.dependencies import CurrentUser, CurrentViewer
from ..license import LicenseClientError
from ..security.http_security import same_origin_request
from ..core.schemas import LicenseActivateRequest

router = APIRouter(prefix='/license', tags=['license'])

# 「再点重试也不会变好」的错误码：目前只有「要求人工重新激活」。
# 其余错误码一律按可重试处理 —— 网络抖动、5xx 都属于「等一会儿再来」。
#
# 这里曾经还列着 'LICENSE_RETRY_THROTTLED'，但那个码从来没有被产生过：节流窗口内
# retry_now() 是「直接返回当前状态」，不抛异常（见 service.MANUAL_RETRY_THROTTLE_SECONDS）。
RETRY_TERMINAL_CODES = frozenset({'LICENSE_REAUTH_REQUIRED'})

#: 激活尝试的失败预算 (max_failures, window_seconds, block_seconds)。
#: 没有它时 `/license/activate` 是一个**无限次**的激活码猜测端点：每次尝试都会打到授权
#: 服务器上（用户可控的激活码就是被猜的密文），既不设防也把上游当成了免费的尝试放大器。
LICENSE_ACTIVATION_LIMIT = (10, 900, 900)
#: 键空间上限：键是账号 id（库内自生成、外部造不出来），但仍按带键上限的计数器记账，
#: 与配对的 6 位码同一套理由 —— 将来若有别的键来源，不至于变成内存放大路径。
LICENSE_ACTIVATION_KEYS = 1024


@router.get('/status')
async def license_status(request: Request, _user: CurrentUser) -> dict:
    """读取当前授权状态（需已登录）。

    先节流联网确认绑定：商店解绑后，前端轮询到这里会尽快变成 REVOKED，
    再跳转 /license；字段名由授权模块与前端约定，这里不做加工。

    节流窗口在发起联网前就被占住，因此多个标签页 / 多个页面同时轮询时只有一个
    真的发请求；读状态本身是同步查库，同样转线程池。
    """
    await request.app.state.license_service.confirm_binding(force=False)
    return await asyncio.to_thread(request.app.state.license_service.status)


@router.post('/activate')
async def activate_license(payload: LicenseActivateRequest, request: Request, user: CurrentUser) -> dict:
    """用激活码激活授权（需已登录）。

    请求体: activation_code（激活码）与 email（可选的绑定邮箱）。

    成功返回授权模块的激活结果字典；激活被服务端拒绝时抛 422，
    detail 直接使用底层返回的中文错误文案。

    按**账号**限流（不按来源 IP）：本接口要求已登录，攻击者通常握着一个会话，换出口地址
    就能把按 IP 的计数重置；而被他反复消耗的额度属于同一个账号。失败与走不通的网络错误
    都计数 —— 后者顺带挡住「上游故障时用重试按钮把它打成雪崩」，代价是故障期间连点
    十次会被自己锁 15 分钟。
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

    身份：需已登录（CurrentUser）。

    失败时返回 ``{code, message}`` 结构：``LICENSE_ACTIVATION_REQUIRED`` 表示本机
    没有可复用的激活凭证，前端应展开激活表单让用户手动输入；其余错误码只用于展示。
    '''
    try:
        return await request.app.state.license_service.reactivate()
    except LicenseClientError as error:
        # 状态码由底层错误决定：网络/服务端故障自带 5xx。
        # 没有状态码时统一用 409 而非 422：语义是「本机当前状态无法自动重新激活」（例如没有任何可复用凭证），
        # 而不是激活码写错了 —— 前端应引导走手动激活表单，而不是反复重试同一个请求。
        raise HTTPException(
            status_code = error.status_code or status.HTTP_409_CONFLICT,
            detail = {
                'code': error.code or 'LICENSE_REACTIVATE_FAILED',
                'message': str(error)}) from error


@router.post('/retry')
async def retry_license(request: Request, viewer: CurrentViewer) -> dict:
    """立刻重试一次授权恢复（需已登录或已配对的中控设备）。

    与 ``/status`` 的差别就是本接口存在的全部理由：``/status`` 只读状态、重试交给后台心跳，
    因此「点了重试但要等下一个心跳周期」；本接口当场发起一轮恢复，并清掉端点黑名单，
    使手动点击不会被上一轮失败留下的冷却直接挡回。

    身份：CurrentViewer —— 中控设备与管理员都可重试，这正是展示端卡在受限页时的自救出口。

    返回: 管理员会话拿完整状态；中控设备只拿 ``availability()`` 的摘要 ——
    展示端既不需要、也不该看到授权标识与凭证字段。
    """
    # 本接口有真实副作用（触发联网重试），属于写操作，必须自己挡跨站请求：
    # 只接受同源发起，作为 SameSite Cookie 之外的兜底。
    #
    # 判据必须复用 same_origin_request，不能拿 str(request.base_url) 裸比较 —— 反代改写
    # Host 之后 base_url 是内网地址，合法的同源重试会被判成跨站而 403（用户点了「重试」
    # 却永远失败）。而且裸比较认不出 `http://evil@本机地址/` 这类构造，反而比公共判据更松。
    # sec-fetch-site 是额外的第二道闸，保留。
    if not same_origin_request(request) or request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='不允许跨站重试授权。')
    try:
        result = await request.app.state.license_service.retry_now()
    except LicenseClientError as error:
        # 分流成两种信号：可重试 → 503（稍后再来），需人工介入 → 409（再点也没用）。
        # 前端据此决定是否继续显示重试按钮，所以必须由后端给结论，而不是让前端猜错误码含义。
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

    恢复页与展示端恰恰是在「授权不可用」时才打开它：前者由 /pair 与 /display/* 就地渲染
    （授权不可用时不再落 403），此时可能既登不上、也没配对成功，所以本接口不能要求身份。
    代价是返回体必须脱敏：只给状态与「能否重试」，不给授权标识、租约、密钥或原始错误文案
    （脱敏口径统一在 ``service.availability()`` 里）。
    """
    # 与 /status 同理：组摘要要查库并核对硬件指纹，同步跑在事件循环上会拖住所有请求。
    return await asyncio.to_thread(request.app.state.license_service.availability)
