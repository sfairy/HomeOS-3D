"""访问主体的唯一解析实现：一次请求（或一条连接）到底是谁。

管理员会话 Cookie 与中控设备 Cookie 的校验原先在三处各写一遍（HTTP 依赖
``dependencies._admin_session``、页面与静态资源 ``main.signed_in`` /
``main.active_display``、实时连接握手 ``api.ha.websocket_viewer``），三处口径并不相同：

- 只有 HTTP 依赖查会话的**绝对寿命**（``session_hard_max_age_seconds``），页面路由与
  ``/static/*``、``/assets/builtin/*`` 因此照旧放行；
- 只有 HTTP 依赖查中控令牌的**有效期**，展示页与实时连接完全绕过
  ``display_token_ttl_seconds`` / ``display_token_hard_ttl_seconds``。

修法不是给另外两处补上判断 —— 那样下次再添入口，同样的洞会以第三种写法再来一次；
而是把「凭据 → 主体」收敛成本模块的唯一实现。调用方只保留各自需要的副作用：
HTTP 侧重发续期 Cookie、页面侧跳登录、实时连接侧 detach。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Mapping

from sqlalchemy import select
from sqlalchemy.orm import Session

from .display_access import active_display_device
from ..core.models import DisplayDevice, LoginSession, User
from .security import session_token_hash
from ..core.time_utils import ensure_aware

#: 会话滑动续期的写库节流窗口（秒）。展示页与编辑器的轮询是秒级的，
#: 不做节流的话每个请求都会变成一次写事务，因此最多每 300 秒回写一次。
SESSION_REFRESH_INTERVAL_SECONDS = 300


@dataclass(frozen=True)
class ViewerPrincipal:
    """一次请求的访问主体：管理员账号，或一台已配对的中控设备。

    两个字段互斥（管理员登录优先），因此判断「是谁在看」时
    一律用 is_admin_session / project_id 这两个属性，不要直接看字段。
    """

    user: User | None = None
    display: DisplayDevice | None = None

    @property
    def project_id(self) -> str | None:
        """该主体被限定到的项目 ID；None 表示不受限（管理员会话）。"""
        return self.display.project_id if self.display is not None else None

    @property
    def is_admin_session(self) -> bool:
        """是否为管理员会话（中控设备为 False）。"""
        return self.user is not None


@dataclass(frozen=True)
class AdminSessionCheck:
    """管理员会话 Cookie 的校验结果；不含任何写操作。

    把「判断」与「副作用」分开，是因为三处调用方要的副作用各不相同：HTTP 依赖要
    滑动续期并重发 Cookie，页面路由只想要一个布尔值，实时连接既不发 Cookie 也不
    续期。共享的是判断口径，不是副作用。
    """

    #: 校验通过时的用户；未通过一律为 None。
    user: User | None = None
    #: 命中的会话行（无论是否有效），供调用方清理。
    record: LoginSession | None = None
    #: 会话行存在但已失效（滑动过期或超过绝对寿命），调用方应当把它删掉。
    expired: bool = False
    #: 本次调用是否已经把滑动有效期往后推（调用方要据此重发 Cookie）。
    renewed: bool = False

    @property
    def ok(self) -> bool:
        return self.user is not None


@dataclass(frozen=True)
class PrincipalResolution:
    """一次凭据解析的完整结果。"""

    viewer: ViewerPrincipal
    admin: AdminSessionCheck

    @property
    def authenticated(self) -> bool:
        """是否解析出了主体（两种身份都没有时为 False）。"""
        return self.viewer.user is not None or self.viewer.display is not None


def admin_token_from(cookies: Mapping[str, str], settings) -> str:
    """从 Cookie 里取出管理员会话令牌原文（没有则空串）。"""
    return (cookies.get(settings.cookie_name, '') or '').strip()


def display_token_from(cookies: Mapping[str, str], settings) -> str:
    """从 Cookie 里取出中控令牌原文（没有则空串）。"""
    return (cookies.get(settings.display_cookie_name, '') or '').strip()


def _positive_seconds(value) -> int:
    """把配置里的秒数读成正整数；缺失或非正值一律当 0（表示不设限）。"""
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return 0
    return seconds if seconds > 0 else 0


def check_admin_session(
    database: Session,
    settings,
    token: str,
    *,
    account_user_id: str | None,
    refresh: bool = False,
    now: datetime | None = None,
) -> AdminSessionCheck:
    """校验管理员会话 Cookie，返回「是谁」以及要不要续期 / 清理。

    判定顺序：账号已初始化 → Cookie 存在 → 会话行存在 → 滑动有效期未过 → 绝对寿命未到 →
    归属当前管理员 → 用户仍启用。任一步不通过都返回 user=None，由调用方决定是 401、
    跳登录页还是回落到中控身份。

    绝对寿命（session_hard_max_age_seconds）是这条链上最容易漏的一环：少了它，一枚被盗
    Cookie 只要还在被使用就会被滑动续期一直续下去。因此它写在这里，而不是留给某个入口自己补。

    refresh=True 时跨过续期窗口会把 last_seen_at / expires_at 推到当前时间（写库并置
    renewed=True，调用方据此重发 Cookie）；默认纯读、不产生写操作。
    """
    if account_user_id is None or not token:
        return AdminSessionCheck()
    moment = now or datetime.now(timezone.utc)
    record = database.scalar(
        select(LoginSession).where(LoginSession.id_hash == session_token_hash(token))
    )
    if record is None:
        return AdminSessionCheck()
    if ensure_aware(record.expires_at) <= moment:
        # 滑动有效期已过：记录还在（管理员列表里还能看到并手动退出），但不再放行。
        return AdminSessionCheck(record=record, expired=True)
    hard_max_age = _positive_seconds(getattr(settings, 'session_hard_max_age_seconds', 0))
    if hard_max_age and moment >= ensure_aware(record.created_at) + timedelta(seconds=hard_max_age):
        # 绝对寿命先到：滑动续期不能突破它。
        return AdminSessionCheck(record=record, expired=True)
    if record.user_id != account_user_id:
        # 不是当前管理员的会话：不动它（它可能仍然有效，只是不该走这条入口）。
        return AdminSessionCheck(record=record)
    user = database.get(User, record.user_id)
    if user is None or not user.is_active:
        return AdminSessionCheck(record=record)
    renewed = False
    if refresh:
        max_age = _positive_seconds(getattr(settings, 'session_max_age_seconds', 0))
        interval = min(SESSION_REFRESH_INTERVAL_SECONDS, max(1, max_age // 2))
        if moment - ensure_aware(record.last_seen_at) >= timedelta(seconds=interval):
            record.last_seen_at = moment
            record.expires_at = moment + timedelta(seconds=max_age)
            database.commit()
            renewed = True
    return AdminSessionCheck(user=user, record=record, renewed=renewed)


def discard_expired_session(database: Session, session: AdminSessionCheck) -> None:
    """删掉已失效的会话行（只有真的存在且已失效时才写库）。

    过期行不清会随使用时间一直攒着，而这里没有定时清理任务，只能靠每次路过时
    顺手清一行 —— 这也是它必须留在共享实现里的原因：三个入口各自实现时，
    两个入口都忘了清，过期行只会越来越多。
    """
    if session.expired and session.record is not None:
        database.delete(session.record)
        database.commit()


def resolve_principal(
    database: Session,
    settings,
    *,
    admin_token: str = '',
    display_token: str = '',
    account_user_id: str | None = None,
    refresh_admin_session: bool = False,
    now: datetime | None = None,
) -> PrincipalResolution:
    """凭据解析的唯一入口：管理员会话优先，其次中控配对。

    优先级固定不变：管理员在已配对的平板上打开页面时应当看到完整权限，
    而不是被降级成单项目视角。

    两种身份都没解析出来时返回的 viewer 两个字段都是 None，由调用方决定
    是 401、跳登录页还是以 4401 关闭实时连接。中控令牌的有效期判定在
    active_display_device 内部完成（调用方无法绕过）。
    """
    admin = check_admin_session(
        database,
        settings,
        admin_token,
        account_user_id=account_user_id,
        refresh=refresh_admin_session,
        now=now,
    )
    if admin.ok:
        return PrincipalResolution(viewer=ViewerPrincipal(user=admin.user), admin=admin)
    display = (
        active_display_device(database, settings, display_token, now=now)
        if display_token
        else None
    )
    return PrincipalResolution(viewer=ViewerPrincipal(display=display), admin=admin)
