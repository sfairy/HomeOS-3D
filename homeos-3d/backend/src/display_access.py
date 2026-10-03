from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DisplayDevice, DisplayPairingCode
from .security import session_token_hash


def active_display_device(database: Session, token: str) -> DisplayDevice | None:
    """Resolve a display token bound to an enabled persistent pairing code."""
    if not token:
        return None
    return database.scalar(
        select(DisplayDevice)
        .join(DisplayPairingCode, DisplayPairingCode.id == DisplayDevice.pairing_code_id)
        .where(
            DisplayDevice.token_hash == session_token_hash(token),
            DisplayDevice.revoked_at.is_(None),
            DisplayPairingCode.is_enabled.is_(True),
        )
    )
