"""中控设备（墙面屏）的配对码与设备管理接口。

路由前缀 /api/v1/displays。管理类接口一律要求管理员，而设备侧的 /pair
必须免登录可用，因此门禁写在各个路由里（require_admin_for_displays），不挂在依赖上。
库里只存配对码哈希用于校验，另存一份可解密的密文供管理员回看原码。
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..core.conflicts import is_unique_violation
from ..security.dependencies import DatabaseSession, LicensedUser
from ..security.display_access import display_path, display_token_expired, display_token_expires_at
from ..security.http_security import resolve_client_ip, secure_cookies_enabled
from ..ha.crypto import CredentialCipher, CredentialCipherError
from ..core.models import DisplayDevice, DisplayPairingCode, Project, User
from ..core.schemas import (
    DisplayDeviceUpdateRequest,
    DisplayPairRequest,
    DisplayPairingCodeRequest,
    DisplayPairingCodeUpdateRequest,
)
from ..security.security import new_session_token, session_token_hash, set_display_cookie

router = APIRouter(prefix='/displays', tags=['displays'])

#: 「配对码已经绑了一台在用设备」的文案。两处会用到它：读到在用设备时提前拒绝，
#: 以及并发下唯一约束/条件更新失败时兜底 —— 同一件事不能有两种说法。
DEVICE_ALREADY_BOUND_DETAIL = '该配对码已绑定一台在用设备。要在这台设备上重新配对，请先在管理端的显示设备列表里解绑原设备。'


def device_already_bound() -> HTTPException:
    """构造「该配对码已绑定一台在用设备」的 409。"""
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DEVICE_ALREADY_BOUND_DETAIL)


#: /pair 的**跨来源**失败预算 (max_failures, window_seconds, block_seconds)。
#: 除了按 IP 限流还需要这一档：6 位数字只有 100 万种，按 IP 挡换 IP 就摊薄；这一档是全进程共享总预算，
#: 按 30 次/分钟算枚举完要 23 天以上，封禁窗口故意只 60 秒——共享预算会被攻击者填满制造拥堵，
#: 短窗口把 DoS 代价压到「刷新几次就好」。
PAIRING_GLOBAL_LIMIT = (30, 60, 60)
PAIRING_GLOBAL_KEY = 'display-pair-global'
#: 同一个配对码的失败预算 (max_failures, window_seconds, block_seconds)。
#: 前两档管「谁来试」（按 IP 挡单点爆破、跨来源挡换 IP），但都管不住「盯着一个码磨」—— 共享预算
#: 是大家平摊的，拿到码但拿不准的人可以在预算内一直对同一个码试。这一档按**码**记账：同一码 15 分钟
#: 错 5 次就锁该码 15 分钟，把「磨一个码」与「扫全空间」分开计价；它不替代另两档。
PAIRING_CODE_LIMIT = (5, 900, 900)
#: 按码计数器的键上限：键是「被尝试的码」的哈希，属外部可控输入，必须封顶。
PAIRING_CODE_KEYS = 1024
#: 只能拿到共享地址（可信代理没传转发头）时的兜底桶 (max_failures, window_seconds, block_seconds)。
#: 按 IP 那一档在这种情形下必须让位（所有人共用一个桶，正常人手滑几次就把配对页锁掉），但**整个跳过**
#: 也不对：剩下只有跨来源那一档，攻击者几分钟就能烧光共享预算、把所有人一起挡在外面。所以给共享地址
#: 单独一档：配额比按真实 IP 宽得多，但足以让「一直是同一个来源在失败」被记账，封禁时间也刻意短。
PAIRING_SHARED_ADDRESS_LIMIT = (40, 300, 120)


def require_admin_for_displays(user: User) -> None:
    """确认当前用户是管理员，否则 403「仅管理员可以管理中控设备。」。

    不放进依赖层，是因为本 router 里的 /pair 必须对未登录设备开放。
    """
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以管理中控设备。')
    return None


def enforce_pair_rate_limit(request: Request, ip_address: str, per_client: bool = True) -> tuple:
    """检查 /pair 的两档限流；被拦时抛 429。
    返回 (按来源地址的限流器, 它的 key)，调用方记失败时要用同一对。拿不到能代表一个客户端的来源
    地址时（per_client=False）不启用按真实 IP 那一档，否则等于让任何一个人失败几次就锁掉所有人的
    配对页；但这时改成记**共享地址**的宽配额，不能整个跳过。注意 ``block_seconds`` 是 int 属性而不是
    方法（当函数调用会 500 而不是 429），回带 ``Retry-After`` 用的是 ``retry_after(key)``。
    """
    if per_client:
        ip_limiter = request.app.state.login_limiter
        ip_key = f'display-pair:{ip_address}'
    else:
        # 共享地址的键单独一档、单独一个限流器：与「按真实 IP」的预算互不影响，
        # 否则代理用户会先把普通用户的登录预算吃掉一部分。
        ip_limiter = request.app.state.pairing_shared_limiter
        ip_key = f'display-pair-shared:{ip_address}'
    if ip_limiter.blocked(ip_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='配对失败次数过多，请稍后再试。',
            # 剩余等待时间：block_seconds 是整段封禁时长，回它等于让客户端
            # 把已经等过的那一段再等一遍。
            headers={'Retry-After': str(ip_limiter.retry_after(ip_key))},
        )
    global_limiter = request.app.state.pairing_limiter
    if global_limiter.blocked(PAIRING_GLOBAL_KEY):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='配对尝试过于频繁，请稍后再试。',
            headers={'Retry-After': str(global_limiter.retry_after(PAIRING_GLOBAL_KEY))},
        )
    return (ip_limiter, ip_key)


def note_pair_failure(request: Request, ip_limiter, ip_key: str, code_key: str | None = None) -> None:
    """把一次配对失败同时记进三档限流：按来源地址的、跨来源的、按码的。

    参数:
        code_key: 被尝试的配对码哈希；None 表示这次失败与码无关（例如码有效但项目已删）。
    """
    ip_limiter.record_failure(ip_key)
    request.app.state.pairing_limiter.record_failure(PAIRING_GLOBAL_KEY)
    if code_key is not None:
        request.app.state.pairing_code_limiter.record_failure(code_key)


def device_payload(device: DisplayDevice, project: Project, settings=None) -> dict:
    """把设备行拼成前端使用的 JSON（camelCase 出）。

    项目名由调用方一并传入，避免在列表循环里逐条查项目（N+1）。
    传入 settings 时附带 expiresAt（令牌失效时刻）：管理端列表靠它显示
    「这台平板还能用到什么时候」，否则一个长期不活跃的设备会悄无声息地过期。
    """
    return {
        'id': device.id,
        'name': device.name,
        'pairingCodeId': device.pairing_code_id,
        'projectId': device.project_id,
        'projectName': project.name,
        'createdAt': device.created_at,
        'lastSeenAt': device.last_seen_at,
        'revokedAt': device.revoked_at,
        'expiresAt': display_token_expires_at(device, settings) if settings is not None else None,
        'expired': display_token_expired(device, settings) if settings is not None else False,
    }

def pairing_cipher(request: Request) -> CredentialCipher:
    """构造配对码密文的加解密器，密钥路径取自配置（display_pairing_key_path）。"""
    return CredentialCipher(request.app.state.settings.display_pairing_key_path)


def pairing_payload(
    pairing: DisplayPairingCode,
    project: Project,
    request: Request,
    device: DisplayDevice | None = None,
) -> dict:
    """把配对码行拼成前端使用的 JSON，附带明文配对码与配对链接。

    明文码来自库里的密文字段：解密失败（例如换过密钥）时 code 置 None，
    其余字段照常返回，避免整个列表接口因为一条脏数据而报错。
    """
    try:
        code = pairing_cipher(request).decrypt(pairing.encrypted_code)
    # 解密失败就当作「不可回看」处理，不让异常冒到路由层。
    except CredentialCipherError:
        code = None
    return {
        'id': pairing.id,
        'code': code,
        'name': pairing.name,
        'projectId': pairing.project_id,
        'projectName': project.name,
        'enabled': pairing.is_enabled,
        'createdAt': pairing.created_at,
        'updatedAt': pairing.updated_at,
        # 配对链接把项目名编码进 next，扫码后直接落到这台设备该看的展示路径。
        'pairingUrl': f'/pair?next={quote(display_path(project.name), safe = "/")}',
        'device': device_payload(device, project, request.app.state.settings) if device is not None else None,
    }


def unique_pairing_code(database: DatabaseSession, requested: str | None = None) -> str:
    """给出一个当前未被占用的 6 位数字配对码。

    参数:
        requested: 管理员自定义的码；为 None 时随机生成。
    会抛的错误：409「这个配对码已被使用，请换一个数字。」、
    503「暂时无法生成配对码，请重试。」。
    """
    # 自定义码只做查重后原样使用，是否好记由管理员自己负责。
    if requested is not None:
        if (
            database.scalar(
                select(DisplayPairingCode.id).where(
                    DisplayPairingCode.code_hash == session_token_hash(requested)
                )
            )
            is not None
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='这个配对码已被使用，请换一个数字。')
        return requested
    # 6 位数字只有一百万种，撞上已用码的概率不低，因此循环重试 20 次。
    for _attempt in range(20):
        candidate = f'{secrets.randbelow(1000000):06d}'
        if (
            database.scalar(
                select(DisplayPairingCode.id).where(
                    DisplayPairingCode.code_hash == session_token_hash(candidate)
                )
            )
            is None
        ):
            return candidate
    # 连续 20 次都撞车属于异常情况：报 503 让调用方稍后重试，而不是返回一个重复的码。
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='暂时无法生成配对码，请重试。')


@router.get('')
def list_display_devices(request: Request, database: DatabaseSession, user: LicensedUser) -> dict:
    """列出所有在用（未吊销）的中控设备。

    仅管理员可调用，否则 403「仅管理员可以管理中控设备。」。
    返回 {items: [...]}，按最后活跃时间倒序，项目名一并带上；
    每条附 expiresAt / expired，便于发现「快过期或已过期」的平板。
    """
    require_admin_for_displays(user)
    devices = list(
        database.scalars(
            select(DisplayDevice)
            # 已吊销的设备不再列出：吊销是软删除，行仍保留在库里供审计。
            .where(DisplayDevice.revoked_at.is_(None))
            .order_by(DisplayDevice.last_seen_at.desc())
        )
    )
    # 一次查出全部相关项目再按 id 索引，避免逐台设备查一次项目名（N+1）。
    projects = (
        {
            project.id: project
            for project in database.scalars(
                select(Project).where(
                    Project.id.in_([item.project_id for item in devices])
                )
            )
        }
        if devices
        else {}
    )
    return {
        'items': [
            device_payload(item, projects[item.project_id], request.app.state.settings)
            for item in devices
            if item.project_id in projects
        ]
    }


@router.get('/pairing-codes')
def list_pairing_codes(
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
    project_id: str | None = Query(None, alias='projectId'),
) -> dict:
    """列出中控配对码（可按仪表盘过滤），并带上各自已配对出的设备。

    仅管理员可调用。查询参数 projectId 为可选过滤条件（前端 camelCase 别名）。
    返回 {items: [...]}，每条含明文配对码（解密失败为 null）与 pairingUrl。
    """
    require_admin_for_displays(user)
    query = select(DisplayPairingCode).order_by(DisplayPairingCode.created_at.desc())
    # projectId 只是可选过滤条件：不传就返回全部配对码。
    if project_id is not None:
        query = query.where(DisplayPairingCode.project_id == project_id)
    pairings = list(database.scalars(query))
    projects = (
        {
            project.id: project
            for project in database.scalars(
                select(Project).where(
                    Project.id.in_([item.project_id for item in pairings])
                )
            )
        }
        if pairings
        else {}
    )
    # 一并查出每个配对码对应的在用设备，前端可以在同一行显示配对状态。
    devices = (
        {
            device.pairing_code_id: device
            for device in database.scalars(
                select(DisplayDevice).where(
                    DisplayDevice.pairing_code_id.in_([item.id for item in pairings]),
                    DisplayDevice.revoked_at.is_(None),
                )
            )
            # 没有关联配对码的设备不进字典：None 不能当键。
            if device.pairing_code_id
        }
        if pairings
        else {}
    )
    return {
        'items': [
            pairing_payload(item, projects[item.project_id], request, devices.get(item.id))
            for item in pairings
            if item.project_id in projects
        ]
    }


@router.post('/pairing-code', status_code=status.HTTP_201_CREATED)
def create_pairing_code(
    payload: DisplayPairingCodeRequest,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict:
    """为指定仪表盘创建一个中控配对码。

    身份与能力码：LicensedUser + admin 角色 + 授权允许 display，
    否则 403「当前授权不允许添加中控设备。」。
    请求字段：project_id、name（为空时默认「<仪表盘名> 中控」）、code（可选自定义）。
    返回：配对码 JSON。仪表盘不存在抛 404「仪表盘不存在。」。
    """
    require_admin_for_displays(user)
    # 能力码之上再加一层：api 只说明能调接口，新增中控设备还需要 display 能力。
    if not request.app.state.license_service.allows('display'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许添加中控设备。')
    project = database.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='仪表盘不存在。')
    # 自定义码要查重、随机码要避开已用值，两种输入统一走 unique_pairing_code。
    code = unique_pairing_code(database, payload.code)
    # 明文码只存在于内存与响应里：库里存哈希用于校验、存密文供管理员回看。
    pairing = DisplayPairingCode(
        id=str(uuid4()),
        code_hash=session_token_hash(code),
        encrypted_code=pairing_cipher(request).encrypt(code),
        name=payload.name or f'{project.name} 中控',
        project_id=project.id,
        created_by=user.id,
        is_enabled=True,
    )
    database.add(pairing)
    database.commit()
    database.refresh(pairing)
    request.app.state.global_log.append('success', '仪表盘编辑器', '中控设备', f'已创建中控配对：{pairing.name}')
    return pairing_payload(pairing, project, request)


@router.patch('/pairing-codes/{pairing_id}')
def update_pairing_code(
    pairing_id: str,
    payload: DisplayPairingCodeUpdateRequest,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict:
    """修改配对码的名称、启用状态或改绑到另一个仪表盘。

    仅管理员可调用。请求三个字段都是可选的，只更新传了的那些。
    返回：更新后的配对码 JSON（含解析出的明文码）。
    配对码不存在抛 404「配对码不存在。」；目标仪表盘不存在抛 404「仪表盘不存在。」。
    """
    require_admin_for_displays(user)
    pairing = database.get(DisplayPairingCode, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对码不存在。')
    # 允许改绑仪表盘；未指定时沿用原绑定，仍要确认那个项目还在。
    project = database.get(Project, payload.project_id or pairing.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='仪表盘不存在。')
    if payload.name is not None:
        pairing.name = payload.name
    if payload.project_id is not None:
        pairing.project_id = project.id
    if payload.enabled is not None:
        pairing.is_enabled = payload.enabled
    pairing.updated_at = datetime.now(timezone.utc)
    # 该配对码若已经配对出设备，改名/改绑要一并同步，否则墙上的屏还指着旧项目。
    device = database.scalar(
        select(DisplayDevice).where(
            DisplayDevice.pairing_code_id == pairing.id,
            DisplayDevice.revoked_at.is_(None),
        )
    )
    if device is not None:
        device.project_id = pairing.project_id
        device.name = pairing.name
    database.commit()
    database.refresh(pairing)
    return pairing_payload(pairing, project, request, device)


@router.delete('/pairing-codes/{pairing_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_pairing_code(pairing_id: str, database: DatabaseSession, user: LicensedUser) -> None:
    """删除一个配对码，返回 204。

    仅管理员可调用；配对码不存在抛 404「配对码不存在。」。
    只删配对码本身，已配对出来的设备令牌独立存在，不受影响。
    """
    require_admin_for_displays(user)
    pairing = database.get(DisplayPairingCode, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对码不存在。')
    database.delete(pairing)
    database.commit()
    return None


@router.post('/pair', status_code=status.HTTP_201_CREATED)
def pair_display_device(
    payload: DisplayPairRequest,
    request: Request,
    response: Response,
    database: DatabaseSession,
) -> dict:
    """设备侧配对：用配对码换一台中控设备的长期令牌。
    刻意不需要登录，门禁全靠限流与「同一配对码不重复发放令牌」两条。请求字段：code、device_name
    （可选）。返回 {device, targetUrl} 并下发中控设备 Cookie；429（尝试过多）、403「当前授权不允许
    添加中控设备。」、409「该配对码已绑定一台在用设备…」、422「配对码无效或已停用。」、404「配对的
    仪表盘已不存在。」。在用设备存在时必须拒绝 —— 否则谁拿到码都能顶掉原设备，等于控制权易主。
    """
    # 来源地址走统一解析：配了可信反向代理时取真实客户端，否则用 TCP 对端地址。
    # per_client 为 False（只能拿到共享代理地址）时按共享地址记一档宽配额，
    # 而不是整个跳过 —— 跳过等于把所有人的配对页交给「谁先烧完共享预算」。
    address = resolve_client_ip(request)
    ip_address = address.ip
    # 免登录接口的第一道护栏：按来源地址 + 跨来源两档限流。
    (ip_limiter, ip_key) = enforce_pair_rate_limit(request, ip_address, address.per_client)
    # 第三档按「被尝试的码」记账：前两档管「谁来试」，这一档管「盯着一个码磨」。
    # 用与会话令牌同一套哈希（也是 code_hash 那一列用的），键里不留明文码。
    code_key = session_token_hash(payload.code)
    if request.app.state.pairing_code_limiter.blocked(code_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='该配对码尝试次数过多，请稍后再试。',
            headers={'Retry-After': str(request.app.state.pairing_code_limiter.retry_after(code_key))},
        )
    # 能力码：页面侧（/pair 路由）已经拦过一次，API 自己也得拦 —— 授权收回 display 后
    # 不能还能凭一个旧配对码换出新令牌。
    if not request.app.state.license_service.allows('display'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许添加中控设备。')
    pairing = database.scalar(
        select(DisplayPairingCode).where(
            DisplayPairingCode.code_hash == session_token_hash(payload.code)
        )
    )
    # 无效与已停用合并成同一条文案：不向外暴露「这个码存在但被停用了」。
    if not (pairing and pairing.is_enabled):
        note_pair_failure(request, ip_limiter, ip_key, code_key)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='配对码无效或已停用。')
    project = database.get(Project, pairing.project_id)
    if project is None:
        note_pair_failure(request, ip_limiter, ip_key, code_key)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对的仪表盘已不存在。')
    # 同一配对码下已有在用设备：拒绝，避免后来者把原来那台顶掉。
    live_device = database.scalar(
        select(DisplayDevice).where(
            DisplayDevice.pairing_code_id == pairing.id,
            DisplayDevice.revoked_at.is_(None),
        )
    )
    if live_device is not None:
        # 这不是猜码失败（码是对的），所以不计入限流；但要留审计线索。
        request.app.state.global_log.append(
            'warning', '展示设备', '中控设备', f'配对码「{pairing.name}」已绑定在用设备，拒绝了重复配对请求'
        )
        raise device_already_bound()
    now = datetime.now(timezone.utc)
    token = new_session_token()
    token_hash = session_token_hash(token)
    # 复用已被管理员解绑的那一行（pairing_code_id 上有唯一约束，不能再插一行）。
    device = database.scalar(
        select(DisplayDevice).where(DisplayDevice.pairing_code_id == pairing.id)
    )
    # 要写进去的新值先攒成一份：插入与条件更新两条路径共用同一组字段，
    # 免得改了一处忘了另一处（这个函数过去正是「先读后写」被并发钻空子的地方）。
    fields = {
        'token_hash': token_hash,
        'project_id': project.id,
        'name': payload.device_name if payload.device_name is not None else pairing.name,
        'ip_address': ip_address[:64],
        'user_agent': request.headers.get('user-agent', '')[:512],
        'last_seen_at': now,
        # 管理员解绑过（revoked_at 有值）才会走到这里：清除吊销时间等于「重新配对成功」。
        'revoked_at': None,
    }
    if payload.device_name is not None:
        pairing.name = payload.device_name
    pairing.updated_at = now
    if device is None:
        device = DisplayDevice(id=str(uuid4()), pairing_code_id=pairing.id, **fields)
        database.add(device)
        try:
            # 在这里 flush 而不是等最后的 commit：唯一约束要在「还没下发 Cookie」之前裁决。
            # 两个平板同时扫同一个码时都读到「没有设备」并都去插，输的那个会撞上
            # display_devices.pairing_code_id 唯一约束，必须回 409（码没错，只是被抢先绑定）而不是 500。
            database.flush()
        except IntegrityError as error:
            database.rollback()
            if not is_unique_violation(error, 'display_devices.pairing_code_id'):
                raise
            raise device_already_bound() from error
    else:
        # 这一行是被管理员解绑过的，两个请求会同时读到它并都想复用；先读后写会让后提交者
        # 静默顶掉先配对成功的设备，先拿到的 Cookie 立刻失效。所以用读到的 token_hash 做条件更新（CAS），
        # 只有第一个请求能换成自己的令牌，另一个 rowcount 为 0，按「已被占用」拒绝。
        updated = database.execute(
            update(DisplayDevice)
            .where(DisplayDevice.id == device.id, DisplayDevice.token_hash == device.token_hash)
            .values(**fields)
            .execution_options(synchronize_session=False)
        )
        if updated.rowcount != 1:
            database.rollback()
            raise device_already_bound()
    database.commit()
    database.refresh(device)
    if ip_limiter is not None:
        ip_limiter.reset(ip_key)
    request.app.state.pairing_limiter.reset(PAIRING_GLOBAL_KEY)
    # 三档一起清：配对成功说明这个码确实是持有者本人在用，不该把它上一轮的失败带进下一轮。
    request.app.state.pairing_code_limiter.reset(code_key)
    # Secure 按请求自动判定：配了 https 反代却忘开 APP_COOKIE_SECURE 时，
    # 十年期的中控令牌也不至于明文下发。
    set_display_cookie(
        response,
        request.app.state.settings,
        token,
        secure=secure_cookies_enabled(request),
    )
    request.app.state.global_log.append('success', '展示设备', '中控设备', f'中控设备已完成配对：{device.name}')
    return {
        'device': device_payload(device, project, request.app.state.settings),
        'targetUrl': display_path(project.name),
    }


@router.patch('/{device_id}')
def update_display_device(
    device_id: str,
    payload: DisplayDeviceUpdateRequest,
    request: Request,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict:
    """修改中控设备的名称或改绑到另一个仪表盘。
    仅管理员可调用。两个字段可选，只更新传了的那些，同时把改动同步回它的配对码，保持两处一致。
    设备不存在或已吊销抛 404「中控设备不存在。」；目标仪表盘不存在抛 404「仪表盘不存在。」；
    授权已收回 ``display`` 时抛 403。
    """
    require_admin_for_displays(user)
    # 能力码：与 POST /pair 同一条口径。授权收回 display 之后还能改绑/改名，
    # 等于留着一条「继续把设备往仪表盘上挂」的通道 —— 虽然改的是已有设备，
    # 但它同样是在运营一条授权之外的中控链路。
    if not request.app.state.license_service.allows('display'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许管理展示设备。')
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    # 设备与配对码在两个页面上都会展示，名称与绑定项目必须保持一致。
    pairing = database.get(DisplayPairingCode, device.pairing_code_id) if device.pairing_code_id else None
    # 改绑仪表盘是单字段更新，不需要重新走配对流程。
    if payload.project_id is not None:
        project = database.get(Project, payload.project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='仪表盘不存在。')
        device.project_id = project.id
        if pairing is not None:
            pairing.project_id = project.id
            pairing.updated_at = datetime.now(timezone.utc)
    else:
        project = database.get(Project, device.project_id)
    if payload.name is not None:
        device.name = payload.name
        if pairing is not None:
            pairing.name = payload.name
            pairing.updated_at = datetime.now(timezone.utc)
    database.commit()
    database.refresh(device)
    return device_payload(device, project, request.app.state.settings)


@router.delete('/{device_id}', status_code=status.HTTP_204_NO_CONTENT)
def revoke_display_device(device_id: str, database: DatabaseSession, user: LicensedUser) -> None:
    """吊销一台中控设备，返回 204（软删除）。

    仅管理员可调用；设备不存在或已吊销抛 404「中控设备不存在。」。
    只写 revoked_at 时间戳：行保留供审计，令牌随即失效。
    """
    require_admin_for_displays(user)
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    # 软删除：依赖层只认未吊销的设备，写入时间戳即可让令牌立即失效。
    device.revoked_at = datetime.now(timezone.utc)
    database.commit()
    return None
