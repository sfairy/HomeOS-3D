"""中控设备（墙面屏）的配对码与设备管理接口。

路由前缀 /api/v1/displays。管理类接口一律要求管理员，而设备侧的 /pair
必须免登录可用，因此门禁写在各个路由里（require_admin），不挂在依赖上。
库里只存配对码哈希用于校验，另存一份可解密的密文供管理员回看原码。
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from ..dependencies import DatabaseSession, LicensedUser
from ..display_access import display_path
from ..ha.crypto import CredentialCipher, CredentialCipherError
from ..models import DisplayDevice, DisplayPairingCode, Project, User
from ..schemas import (
    DisplayDeviceUpdateRequest,
    DisplayPairRequest,
    DisplayPairingCodeRequest,
    DisplayPairingCodeUpdateRequest,
)
from ..security import new_session_token, session_token_hash, set_display_cookie

router = APIRouter(prefix='/displays', tags=['displays'])


def require_admin(user: User) -> None:
    """确认当前用户是管理员，否则 403「仅管理员可以管理中控设备。」。

    不放进依赖层，是因为本 router 里的 /pair 必须对未登录设备开放。
    """
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以管理中控设备。')
    return None


def device_payload(device: DisplayDevice, project: Project) -> dict:
    """把设备行拼成前端使用的 JSON（camelCase 出）。

    项目名由调用方一并传入，避免在列表循环里逐条查项目（N+1）。
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
        'device': device_payload(device, project) if device is not None else None,
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
def list_display_devices(database: DatabaseSession, user: LicensedUser) -> dict:
    """列出所有在用（未吊销）的中控设备。

    仅管理员可调用，否则 403「仅管理员可以管理中控设备。」。
    返回 {items: [...]}，按最后活跃时间倒序，项目名一并带上。
    """
    require_admin(user)
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
            device_payload(item, projects[item.project_id])
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
    require_admin(user)
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
    require_admin(user)
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
    require_admin(user)
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
    require_admin(user)
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

    刻意不需要登录，因此只能靠 IP 限流挡枚举配对码的尝试。
    请求字段：code、device_name（可选，覆盖配对码上的名字）。
    返回 {device: {...}, targetUrl: ...}，并下发中控设备 Cookie。
    会抛的错误：429「配对失败次数过多，请稍后再试。」、
    422「配对码无效或已停用。」、404「配对的仪表盘已不存在。」。
    """
    ip_address = request.client.host if request.client else ''
    # 免登录接口唯一的护栏：按 IP 限制单位时间内的失败次数。
    limiter_key = f'display-pair:{ip_address}'
    limiter = request.app.state.login_limiter
    if limiter.blocked(limiter_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail='配对失败次数过多，请稍后再试。',
            headers={'Retry-After': str(limiter.block_seconds(limiter_key))},
        )
    pairing = database.scalar(
        select(DisplayPairingCode).where(
            DisplayPairingCode.code_hash == session_token_hash(payload.code)
        )
    )
    # 无效与已停用合并成同一条文案：不向外暴露「这个码存在但被停用了」。
    if not (pairing and pairing.is_enabled):
        limiter.record_failure(limiter_key)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='配对码无效或已停用。')
    project = database.get(Project, pairing.project_id)
    if project is None:
        limiter.record_failure(limiter_key)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对的仪表盘已不存在。')
    now = datetime.now(timezone.utc)
    token = new_session_token()
    # 同一个配对码重复配对时复用原设备行，避免设备列表里堆出一串一次性记录。
    device = database.scalar(
        select(DisplayDevice).where(DisplayDevice.pairing_code_id == pairing.id)
    )
    if device is None:
        device = DisplayDevice(id=str(uuid4()), pairing_code_id=pairing.id)
        database.add(device)
    device.token_hash = session_token_hash(token)
    device.project_id = project.id
    if payload.device_name is not None:
        pairing.name = payload.device_name
    device.name = pairing.name
    device.ip_address = ip_address[:64]
    device.user_agent = request.headers.get('user-agent', '')[:512]
    device.last_seen_at = now
    # 重新配对等于复活：清掉吊销时间，旧令牌会被新令牌顶掉。
    device.revoked_at = None
    pairing.updated_at = now
    database.commit()
    database.refresh(device)
    limiter.reset(limiter_key)
    set_display_cookie(response, request.app.state.settings, token)
    request.app.state.global_log.append('success', '展示设备', '中控设备', f'中控设备已完成配对：{device.name}')
    return {
        'device': device_payload(device, project),
        'targetUrl': display_path(project.name),
    }


@router.patch('/{device_id}')
def update_display_device(
    device_id: str,
    payload: DisplayDeviceUpdateRequest,
    database: DatabaseSession,
    user: LicensedUser,
) -> dict:
    """修改中控设备的名称或改绑到另一个仪表盘。

    仅管理员可调用。两个字段可选，只更新传了的那些；
    同时把改动同步回它的配对码，保持两处一致。
    返回更新后的设备 JSON。设备不存在或已吊销抛 404「中控设备不存在。」；
    目标仪表盘不存在抛 404「仪表盘不存在。」。
    """
    require_admin(user)
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
    return device_payload(device, project)


@router.delete('/{device_id}', status_code=status.HTTP_204_NO_CONTENT)
def revoke_display_device(device_id: str, database: DatabaseSession, user: LicensedUser) -> None:
    """吊销一台中控设备，返回 204（软删除）。

    仅管理员可调用；设备不存在或已吊销抛 404「中控设备不存在。」。
    只写 revoked_at 时间戳：行保留供审计，令牌随即失效。
    """
    require_admin(user)
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    # 软删除：依赖层只认未吊销的设备，写入时间戳即可让令牌立即失效。
    device.revoked_at = datetime.now(timezone.utc)
    database.commit()
    return None
