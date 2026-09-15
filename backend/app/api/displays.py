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
    if user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='仅管理员可以管理中控设备。')
    return None


def device_payload(device: DisplayDevice, project: Project) -> dict:
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
    return CredentialCipher(request.app.state.settings.display_pairing_key_path)


def pairing_payload(
    pairing: DisplayPairingCode,
    project: Project,
    request: Request,
    device: DisplayDevice | None = None,
) -> dict:
    try:
        code = pairing_cipher(request).decrypt(pairing.encrypted_code)
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
        'pairingUrl': f'/pair?next={quote(display_path(project.name), safe = "/")}',
        'device': device_payload(device, project) if device is not None else None,
    }


def unique_pairing_code(database: DatabaseSession, requested: str | None = None) -> str:
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
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail='暂时无法生成配对码，请重试。')


@router.get('')
def list_display_devices(database: DatabaseSession, user: LicensedUser) -> dict:
    require_admin(user)
    devices = list(
        database.scalars(
            select(DisplayDevice)
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
    require_admin(user)
    query = select(DisplayPairingCode).order_by(DisplayPairingCode.created_at.desc())
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
    devices = (
        {
            device.pairing_code_id: device
            for device in database.scalars(
                select(DisplayDevice).where(
                    DisplayDevice.pairing_code_id.in_([item.id for item in pairings]),
                    DisplayDevice.revoked_at.is_(None),
                )
            )
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
    require_admin(user)
    if not request.app.state.license_service.allows('display'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前授权不允许添加中控设备。')
    project = database.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='仪表盘不存在。')
    code = unique_pairing_code(database, payload.code)
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
    require_admin(user)
    pairing = database.get(DisplayPairingCode, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对码不存在。')
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
    ip_address = request.client.host if request.client else ''
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
    if not (pairing and pairing.is_enabled):
        limiter.record_failure(limiter_key)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='配对码无效或已停用。')
    project = database.get(Project, pairing.project_id)
    if project is None:
        limiter.record_failure(limiter_key)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='配对的仪表盘已不存在。')
    now = datetime.now(timezone.utc)
    token = new_session_token()
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
    require_admin(user)
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    pairing = database.get(DisplayPairingCode, device.pairing_code_id) if device.pairing_code_id else None
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
    require_admin(user)
    device = database.get(DisplayDevice, device_id)
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='中控设备不存在。')
    device.revoked_at = datetime.now(timezone.utc)
    database.commit()
    return None
