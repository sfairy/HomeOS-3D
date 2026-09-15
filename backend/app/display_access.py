from __future__ import annotations

from urllib.parse import quote

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import DisplayDevice, DisplayPairingCode
from .security import session_token_hash


def display_path(project_name: str) -> str:
    """正式展示地址：路径段用项目名称，特殊字符一律百分号编码。

    项目名称在创建、改名和保存草稿时都做了全局唯一校验，因此名称可以稳定
    地代表一个仪表盘；名称允许中文、空格、斜杠和百分号，所以这里必须编码
    后再拼进路径，否则浏览器会把它们当成路径分隔符或查询串。
    """
    return '/display/' + quote(project_name, safe = '')


def active_display_device(database: Session, token: str) -> DisplayDevice | None:
    """Resolve a display token while honoring its persistent pairing-code switch.

    Devices created before persistent pairing codes have no pairing_code_id and
    remain valid until an administrator explicitly revokes them.
    """
    if not token:
        return None
    return database.scalar(
        select(DisplayDevice)
        .outerjoin(
            DisplayPairingCode,
            DisplayPairingCode.id == DisplayDevice.pairing_code_id,
        )
        .where(
            DisplayDevice.token_hash == session_token_hash(token),
            DisplayDevice.revoked_at.is_(None),
            or_(
                DisplayDevice.pairing_code_id.is_(None),
                DisplayPairingCode.is_enabled.is_(True),
            ),
        )
    )
