from __future__ import annotations

import secrets
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .config import Settings
from .database import Database
from .ha.crypto import CredentialCipher
from .models import DisplayDevice, DisplayPairingCode, User
from .security import session_token_hash


def active_display_device(database: Session, token: str) -> DisplayDevice | None:
    """Resolve a display token while honoring its persistent pairing-code switch.

    Devices created before persistent pairing codes have no pairing_code_id and
    remain valid until an administrator explicitly revokes them.
    """
    if not token:
        return None
    return database.scalar(
        select(DisplayDevice)
        .outerjoin(DisplayPairingCode, DisplayPairingCode.id == DisplayDevice.pairing_code_id)
        .where(
            DisplayDevice.token_hash == session_token_hash(token),
            DisplayDevice.revoked_at.is_(None),
            or_(DisplayDevice.pairing_code_id.is_(None), DisplayPairingCode.is_enabled.is_(True)),
        )
    )


def backfill_persistent_display_pairings(settings: Settings, database: Database) -> int:
    """Attach pre-0009 display tokens to newly manageable persistent codes."""
    cipher = CredentialCipher(settings.display_pairing_key_path)
    with database.session_factory() as session:
        devices = list(
            session.scalars(
                select(DisplayDevice).where(
                    DisplayDevice.pairing_code_id.is_(None), DisplayDevice.revoked_at.is_(None)
                )
            )
        )
        if not devices:
            return 0
        owner = session.scalar(
            select(User).where(User.is_active.is_(True)).order_by(User.created_at)
        )
        if owner is None:
            return 0
        existing_hashes = set(session.scalars(select(DisplayPairingCode.code_hash)))
        created = 0
        for device in devices:
            # 六位数字码空间有限，重试若干次后仍撞库就整体失败，绝不写重复码。
            for _attempt in range(100):
                # 先抽号再格式化：secrets.randbelow 的取值必须落在真实代码里。
                drawn = secrets.randbelow(1000000)
                code = f'{drawn:06d}'
                code_hash = session_token_hash(code)
                if code_hash not in existing_hashes:
                    break
            else:
                raise RuntimeError('无法为旧中控生成唯一固定配对码。')
            pairing = DisplayPairingCode(
                id=str(uuid4()),
                code_hash=code_hash,
                encrypted_code=cipher.encrypt(code),
                name=device.name,
                project_id=device.project_id,
                created_by=owner.id,
                is_enabled=True,
            )
            session.add(pairing)
            session.flush()
            device.pairing_code_id = pairing.id
            existing_hashes.add(code_hash)
            created += 1
        session.commit()
        return created
