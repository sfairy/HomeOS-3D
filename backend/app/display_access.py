"""正式展示页的访问控制辅助。

只回答两个问题：项目名称如何变成展示地址，以及一个中控令牌当前是否仍然有效。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import DisplayDevice, DisplayPairingCode, Project, ProjectPathAlias
from .security import session_token_hash
from .time_utils import ensure_aware


def display_path(project_name: str) -> str:
    """正式展示地址：路径段用项目名称，特殊字符一律百分号编码。

    项目名称在创建、改名和保存草稿时都做了全局唯一校验，因此名称可以稳定
    地代表一个仪表盘；名称允许中文、空格、斜杠和百分号，所以这里必须编码
    后再拼进路径，否则浏览器会把它们当成路径分隔符或查询串。
    """
    return '/display/' + quote(project_name, safe = '')


def resolve_display_project(database: Session, project_name: str) -> tuple[Project | None, str | None]:
    """把展示地址里的路径段解析成项目；返回 ``(项目, 命中的旧名称)``。

    先按当前名称精确匹配（**现存名称永远优先**：别的项目后来取了这个名字时，地址就
    该指向它）。没有命中时再查改名留下的别名 —— 这就是 B38：改名之后，已经配对、
    手里握着旧地址的平板会永久 404，而且没有任何提示，用户只能重新配对。

    第二个返回值是「这个项目是通过哪个旧名称找到的」：调用方据此 303 跳转到当前地址，
    顺带能在日志里说清「还有设备在用旧地址」。没走别名时为 None。
    """
    project = database.scalar(select(Project).where(Project.name == project_name))
    if project is not None:
        return (project, None)
    alias = database.scalar(select(ProjectPathAlias).where(ProjectPathAlias.name == project_name))
    if alias is None:
        return (None, None)
    project = database.get(Project, alias.project_id)
    # 项目已被删除（别名会随外键级联消失，这里兜住外键未生效的库）：当作没有这个地址，
    # 而不是跳到一个不存在的展示页上（那会让平板在重定向与 404 之间来回弹）。
    if project is None:
        return (None, None)
    return (project, project_name)


def active_display_device(
    database: Session, settings, token: str, *, now: datetime | None = None
) -> DisplayDevice | None:
    """用中控令牌查找**当前仍然有效**的设备。

    有效性 = 令牌哈希匹配 + 设备未被吊销 + 配对码仍启用（若有关联）+ 令牌未过期。

    有效期判定刻意收在这里，而不是留给调用方 —— 这正是 B2：判定原本只写在 HTTP
    依赖里，展示页路由与实时连接握手各自查了一遍库却都没查有效期，于是这两条路
    完全绕过了 display_token_ttl_seconds / display_token_hard_ttl_seconds。
    ``settings`` 因此是必填参数：新调用方没有办法「忘了传」而悄悄退回旧行为，
    漏传会立刻 TypeError。

    过期设备只判「不该放行」，不删行 —— 管理员列表里还要能看到它并手动解绑。

    判定条件：令牌哈希匹配、设备未被吊销，且满足以下之一 ——
    - 设备没有关联配对码（早期版本创建的设备），
    - 其关联的配对码仍处于启用状态。
    也就是说停用某个配对码即可让这一批设备同时失效，
    而历史设备在没有配对码时依然有效，直到管理员显式吊销。
    """
    device = _display_device_by_token(database, token)
    if device is None:
        return None
    if display_token_expired(device, settings, now):
        return None
    return device


def _display_device_by_token(database: Session, token: str) -> DisplayDevice | None:
    """按令牌哈希查设备（含吊销与配对码启停判定），不判有效期。"""
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


def display_token_expires_at(device: DisplayDevice, settings) -> datetime | None:
    """算出这台设备令牌的失效时刻；不设有效期时返回 None。

    滑块有效期以 last_seen_at 为基准（每次活跃都会被推后），因此它表达的是
    「最近一次活跃之后多久失效」，而不是「配对之后多久失效」—— 后者会让
    长期在线的墙面平板也必须定期重新配对，与使用方式冲突。

    返回 None 的情形：显式把 display_token_ttl_seconds 关成 0（表示不过期）。
    """
    ttl = int(getattr(settings, 'display_token_ttl_seconds', 0) or 0)
    hard_ttl = int(getattr(settings, 'display_token_hard_ttl_seconds', 0) or 0)
    candidates = []
    if ttl > 0:
        candidates.append(ensure_aware(device.last_seen_at) + timedelta(seconds=ttl))
    if hard_ttl > 0:
        candidates.append(ensure_aware(device.created_at) + timedelta(seconds=hard_ttl))
    return min(candidates) if candidates else None


def display_token_expired(device: DisplayDevice, settings, now: datetime | None = None) -> bool:
    """这台设备的令牌是否已过期（含可选的硬上限）。"""
    expires_at = display_token_expires_at(device, settings)
    if expires_at is None:
        return False
    return expires_at <= (now or datetime.now(timezone.utc))
