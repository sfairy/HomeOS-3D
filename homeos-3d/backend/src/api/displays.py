"""中控设备（墙面屏）的配对码与设备管理接口。
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
from ..security.dependencies import DatabaseSession, LicensedUser, require_admin
from ..security.display_access import display_path, display_token_expired, display_token_expires_at
from ..security.http_security import resolve_client_ip, secure_cookies_enabled
from ..ha.crypto import CredentialCipher, CredentialCipherError
from ..core.models import DisplayDevice, DisplayPairingCode, Project
from ..core.schemas import (
    DisplayDeviceUpdateRequest,
    DisplayPairRequest,
    DisplayPairingCodeRequest,
    DisplayPairingCodeUpdateRequest,
)
from ..security.security import new_session_token, session_token_hash, set_display_cookie

router = APIRouter(prefix='/displays', tags=['displays'])

#: 「配对码已经绑了一台在用设备」的文案。两处会用到它：读到在用设备时提前拒绝，
DEVICE_ALREADY_BOUND_DETAIL = '该配对码已绑定一台在用设备。要在这台设备上重新配对，请先在管理端的显示设备列表里解绑原设备。'


def device_already_bound() -> HTTPException:
    """构造「该配对码已绑定一台在用设备」的 409。"""
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DEVICE_ALREADY_BOUND_DETAIL)


PAIRING_GLOBAL_LIMIT = (30, 60, 60)
PAIRING_GLOBAL_KEY = 'display-pair-global'
#: 同一个配对码的失败预算 (max_failures, window_seconds, block_seconds)。
PAIRING_CODE_LIMIT = (5, 900, 900)
#: 按码计数器的键上限：键是「被尝试的码」的哈希，属外部可控输入，必须封顶。
PAIRING_CODE_KEYS = 1024
PAIRING_SHARED_ADDRESS_LIMIT = (40, 300, 120)


def enforce_pair_rate_limit(request: Request, ip_address: str, per_client: bool = True) -> tuple:
    """检查 /pair 的两档限流；被拦时抛 429。
    """
    if per_client:
        ip_limiter = request.app.state.login_limiter
        ip_key = f'display-pair:{ip_address}'
    else:
        # 共享地址的键单独一档、单独一个限流器：与「按真实 IP」的预算互不影响，
        ip_limiter = request.app.state.pairing_shared_limiter
        ip_key = f'display-pair-shared:{ip_address}'
    if ip_limiter.blocked(ip_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='配对失败次数过多，请稍后再试。',
            # 剩余等待时间：block_seconds 是整段封禁时长，回它等于让客户端
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
    """
    ip_limiter.record_failure(ip_key)
    request.app.state.pairing_limiter.record_failure(PAIRING_GLOBAL_KEY)
    if code_key is not None:
        request.app.state.pairing_code_limiter.record_failure(code_key)


def device_payload(device: DisplayDevice, project: Project, settings=None) -> dict:
    """把设备行拼成前端使用的 JSON（camelCase 出）。
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
    devices = list(
        database.scalars(
            select(DisplayDevice)
            # 已吊销的设备不再列出：吊销是软删除，行仍保留在库里供审计。
            .where(DisplayDevice.revoked_at.is_(None))
            .order_by(DisplayDevice.last_seen_at.desc())
        )
    )
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
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
    """
    address = resolve_client_ip(request)
    ip_address = address.ip
    # 免登录接口的第一道护栏：按来源地址 + 跨来源两档限流。
    (ip_limiter, ip_key) = enforce_pair_rate_limit(request, ip_address, address.per_client)
    # 第三档按「被尝试的码」记账：前两档管「谁来试」，这一档管「盯着一个码磨」。
    code_key = session_token_hash(payload.code)
    if request.app.state.pairing_code_limiter.blocked(code_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='该配对码尝试次数过多，请稍后再试。',
            headers={'Retry-After': str(request.app.state.pairing_code_limiter.retry_after(code_key))},
        )
    # 能力码：页面侧（/pair 路由）已经拦过一次，API 自己也得拦 —— 授权收回 display 后
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
    live_device = database.scalar(
        select(DisplayDevice).where(
            DisplayDevice.pairing_code_id == pairing.id,
            DisplayDevice.revoked_at.is_(None),
        )
    )
    if live_device is not None:
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
            database.flush()
        except IntegrityError as error:
            database.rollback()
            if not is_unique_violation(error, 'display_devices.pairing_code_id'):
                raise
            raise device_already_bound() from error
    else:
        # 这一行是被管理员解绑过的，两个请求会同时读到它并都想复用；先读后写会让后提交者
        updated = database.execute(
            update(DisplayDevice)
            .where(DisplayDevice.id == device.id, DisplayDevice.token_hash == device.token_hash)
            .values(**fields)
            .execution_options(synchronize_session=False)
        )
        if updated.rowcount != 1:  # type: ignore[reportAttributeAccessIssue]  # SQLAlchemy CursorResult.rowcount 运行期存在，pyright 存根未声明
            database.rollback()
            raise device_already_bound()
    database.commit()
    database.refresh(device)
    if ip_limiter is not None:
        ip_limiter.reset(ip_key)
    request.app.state.pairing_limiter.reset(PAIRING_GLOBAL_KEY)
    request.app.state.pairing_code_limiter.reset(code_key)
    # Secure 按请求自动判定：配了 https 反代却忘开 APP_COOKIE_SECURE 时，
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
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
    # 能力码：与 POST /pair 同一条口径。授权收回 display 之后还能改绑/改名，
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
    assert project is not None  # 改绑分支已校验非 None；未改绑分支由设备已绑定项目保证
    return device_payload(device, project, request.app.state.settings)


@router.delete('/{device_id}', status_code=status.HTTP_204_NO_CONTENT)
def revoke_display_device(device_id: str, database: DatabaseSession, user: LicensedUser) -> None:
    """吊销一台中控设备，返回 204（软删除）。
    """
    require_admin(user, detail='仅管理员可以管理中控设备。')
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    # 软删除：依赖层只认未吊销的设备，写入时间戳即可让令牌立即失效。
    device.revoked_at = datetime.now(timezone.utc)
    database.commit()
    return None
