"""商店接口的共享助手：会话 Cookie、验证码与限流、口令确认闸门等跨组要用的东西。

从 api/store.py 拆出来：那一份只留「路由 + 逐请求编排」。这一层是与商品/订单/账号都有关的**请求侧
基础设施**（谁在调、调得太多没有、口令确认过没有），拆开之后路由文件才回得到 800 行预算内。
"""
from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from apps.store.security import password_gate
from apps.store.config import StoreSettings
from apps.store.core.models import (
    Account,
    AccountSession,
    Customer,
    EmailVerification,
)
from apps.store.security.limiter import SlidingWindowLimiter
from apps.store.security.request_security import resolve_client_ip, secure_cookies_required
from apps.store.security.security import (
    code_hash,
    new_token,
    token_hash,
    utcnow,
)


logger = logging.getLogger("apps.store.api")
#: 同一邮箱一小时内最多能索取多少次验证码（含注册与找回密码）。
MAX_VERIFICATION_SENDS_PER_HOUR = 10
#: 发信配额除「按邮箱」外另加两个维度：按来源 IP（脚本常来自同一批地址，20/小时很宽松）与按全站（兜住换 IP 的分布式来源，上限由 ``STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT`` 控制，触发会告警）。
_VERIFICATION_IP_LIMITER = SlidingWindowLimiter(limit=20, window_seconds=3600.0)
#: 全站配额按 ``limit`` 缓存实例（见下）。
_VERIFICATION_GLOBAL_LIMITERS: dict[int, SlidingWindowLimiter] = {}
def _verification_global_limiter(limit: int) -> SlidingWindowLimiter:
    """全站发信配额。上限来自配置，所以按 ``limit`` 缓存一份实例 ——
    ``SlidingWindowLimiter`` 的计数在内部持有，每次请求都新建一个等于没有限流。

    缓存不会无限增长：``limit`` 来自进程启动时解析的环境变量，一个进程里只有一个值。
    """
    cached = _VERIFICATION_GLOBAL_LIMITERS.get(limit)
    if cached is None:
        cached = SlidingWindowLimiter(limit=limit, window_seconds=3600.0)
        _VERIFICATION_GLOBAL_LIMITERS[limit] = cached
    return cached
def _enforce_verification_send_quota(
    request: Request, settings: StoreSettings, *, email: str
) -> None:
    """按来源 IP 与全站总量限制发信。超限抛 429。

    IP 取 ``resolve_client_ip`` 的解析结果（只在可信代理后面才采信转发头），
    与验证码回显、登录限流用的是同一个来源判定 —— 各写一份就会出现「限流按 A
    计算、回显按 B 计算」这类漂移，而伪造 ``X-Forwarded-For`` 正是绕过它们的手法。
    """
    address = resolve_client_ip(request)
    if address.per_client and address.ip:
        if not _VERIFICATION_IP_LIMITER.allow(f"ip:{address.ip}"):
            retry_after = max(1, int(_VERIFICATION_IP_LIMITER.retry_after(f"ip:{address.ip}")) or 1)
            logger.warning("发信配额：来源 IP 触顶 ip=%s", address.ip)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="当前网络获取验证码过于频繁，请 1 小时后再试。",
                headers={"Retry-After": str(retry_after)},
            )

    limit = max(1, int(settings.verification_global_hourly_limit or 500))
    global_limiter = _verification_global_limiter(limit)
    if not global_limiter.allow("global"):
        retry_after = max(1, int(global_limiter.retry_after("global")) or 1)
        logger.error(
            "发信配额：全站小时上限 %d 已触顶，所有用户都将暂时收不到验证码。"
            "如属正常业务量，请调高 STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT。",
            limit,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="暂时无法发送验证码，请稍后再试。",
            headers={"Retry-After": str(retry_after)},
        )
# 公共工具
def _base_url(request: Request) -> str:
    return request.app.state.settings.public_base_url
def _require_verified(account: Account) -> None:
    if account.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先验证邮箱。"
        )
def _set_session_cookies(
    request: Request, response: Response, *, token: str, hint: str
) -> None:
    settings: StoreSettings = request.app.state.settings
    # Secure 按请求自动判定（https 基址 / 可信代理转发的 https / 本连接 https），
    # 漏配 STORE_COOKIE_SECURE 时也不会把后台会话明文下发。
    secure = secure_cookies_required(request)
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    response.set_cookie(
        settings.hint_cookie_name,
        hint,
        max_age=settings.session_max_age_seconds,
        httponly=False,
        samesite="lax",
        secure=secure,
        path="/",
    )
def _clear_session_cookies(request: Request, response: Response) -> None:
    settings: StoreSettings = request.app.state.settings
    response.delete_cookie(settings.cookie_name, path="/")
    response.delete_cookie(settings.hint_cookie_name, path="/")
def _create_session(session, request: Request, account: Account) -> str:
    token = new_token(32)
    settings: StoreSettings = request.app.state.settings
    moment = utcnow()
    session.add(
        AccountSession(
            id_hash=token_hash(token),
            account_id=account.id,
            # 诊断页要靠这个字段区分「谁在用后台」。登录那一刻账号是否管理员就定了；
            # 之后被提权/降权的账号，等下次登录才会更新到新值。
            is_admin_session=bool(account.is_admin),
            expires_at=moment + timedelta(seconds=settings.session_max_age_seconds),
            last_seen_at=moment,
            ip_address=resolve_client_ip(request).ip[:64] or None,
            user_agent=(request.headers.get("user-agent") or "")[:512] or None,
        )
    )
    account.last_login_at = moment
    session.flush()
    return token
def _customer_for(session, account: Account) -> Customer:
    """取（必要时创建）账号对应的客户档案行。

    ``customers.account_id`` 有唯一索引，但「先查后插」会被并发请求撞唯一约束（直接打成 500）。
    撞约束说明另一请求刚好抢先建好了，直接读回来即可（幂等）。
    """
    customer = session.scalars(
        select(Customer).where(Customer.account_id == account.id)
    ).first()
    if customer is not None:
        return customer

    customer = Customer(account_id=account.id, email=account.email, name=account.email)
    try:
        # 用 SAVEPOINT 而非整个事务回滚：失败时只丢掉这一条 INSERT，调用方在本事务里已完成的其它写入
        # （例如 expire_stale_orders 关掉的过期单）不该被这次撞车连累；本仓 SQLite 驱动下 SAVEPOINT 语义已实测正确。
        with session.begin_nested():
            session.add(customer)
            session.flush()
    except IntegrityError as error:
        message = str(getattr(error, "orig", error))
        if "UNIQUE constraint failed" not in message or "customers.account_id" not in message:
            raise
        # 竞争对手先建好了：把自己这条脏对象从会话里摘掉，把已有的读回来。
        # 先判断再摘：SAVEPOINT 回滚时 SQLAlchemy 已经会把它从会话里清掉，
        # 此时再 expunge 会抛 ``InvalidRequestError``（实测抓到过）。
        if customer in session:
            session.expunge(customer)
        existing = session.scalars(
            select(Customer).where(Customer.account_id == account.id)
        ).first()
        if existing is None:  # 只可能是对方又把它删了，属于异常状态，不掩盖
            raise
        return existing
    return customer
# 账号
#: 需要登录态才能发码的用途。「换绑邮箱」尤其重要：不校验登录态的话，任何人都能填任意邮箱触发验证码，
#: 这个接口就成了免费的邮件群发器（发件人还是我们自己的域名，会被拉黑）。

_PURPOSES_REQUIRING_ACCOUNT = frozenset({"verify", "change_email"})
#: 视为「本机」的客户端地址（含空串与 ``testclient``）：只有这些地址才允许看到 echo 回显的验证码；比 ``apps/store/setup_guard.LOOPBACK_HOSTS`` 刻意更宽，取舍不同不要「顺手统一」。
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient", ""})
def _client_host(request: Request) -> str:
    client = getattr(request, "client", None)
    return str(getattr(client, "host", "") or "").strip().lower()
def _is_loopback_client(request: Request) -> bool:
    """请求的**真实来源**是否在本机。

    刻意用 ``resolve_client_ip`` 而非 ``request.client.host``：本机反代后面每个外部请求的对端
    都是 127.0.0.1，直接读对端会把它们全部误判成本机；只有对端是配置里的可信代理时才采信
    ``X-Forwarded-For``（没配 ``STORE_TRUSTED_PROXIES`` 时转发头一律忽略）。地址为空或
    ``per_client=False``（链路全程可信）时按本机处理，只会出现在进程内调用与 TestClient 场景。
    """
    try:
        address = resolve_client_ip(request)
    except Exception:  # noqa: BLE001 - 解析异常时按更严格的「非本机」处理
        return False
    if not getattr(address, "per_client", False):
        return _client_host(request) in _LOOPBACK_HOSTS
    return str(getattr(address, "ip", "") or "").strip().lower() in _LOOPBACK_HOSTS
def _assert_purpose_allowed(
    session, *, purpose: str, email: str, account: Account | None
) -> None:
    """按用途校验发码前置条件。

    集中在一处是有原因的：每种用途的「谁能给哪个邮箱发码」规则都不一样，
    散在接口里最容易漏 —— 漏掉 ``change_email`` 的占用校验就会出现两台账号
    的邮箱被换到同一个地址上，之后登录按邮箱查账号会随机命中其中一个。
    """
    if purpose in _PURPOSES_REQUIRING_ACCOUNT and account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录后再获取该验证码。"
        )

    existing = session.scalars(
        select(Account).where(func.lower(Account.email) == email)
    ).first()

    # register / reset 一律按正常流程发码并返回同样的 200（已注册不报 409、未注册不报 404），
    # 否则这个匿名可达且不需要验证码的端点就成了账号枚举探针；真相挪到用码那一步再说。
    if purpose in {"register", "reset"}:
        return

    if purpose == "verify":
        # 只允许验证「当前账号自己绑定的邮箱」：否则可以拿别人的邮箱刷验证码
        if account is None or (account.email or "").strip().lower() != email:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只能验证当前账号绑定的邮箱。",
            )
        if account.email_verified_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已验证，无需重复验证。"
            )
        return

    if purpose == "change_email":
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="该邮箱已被其它账号使用。"
            )
        if account is not None and (account.email or "").strip().lower() == email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="新邮箱与当前邮箱相同。"
            )
def _consume_verification(session, *, email: str, purpose: str, code: str) -> None:
    scope = f"verify:{email}"
    if password_gate.retry_after_seconds(session, scope) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="验证码错误次数过多，请稍后重新获取。",
        )
    record = session.scalars(
        select(EmailVerification)
        .where(EmailVerification.email == email)
        .where(EmailVerification.purpose == purpose)
        .where(EmailVerification.consumed_at.is_(None))
        .order_by(EmailVerification.created_at.desc())
        .limit(1)
    ).first()
    if record is None:
        #: 刻意**不**记失败：这条路径连一个验证码记录都没有，记一笔既不反映
        #: 暴力破解（攻击者连码都不用去拿），又能被用来把任意邮箱锁死 ——
        #: 免费打 8 次空请求，受害者自己 15 分钟内就无法验证邮箱/重置密码了。
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先获取邮箱验证码。")
    if record.expires_at <= utcnow():
        # 同上：过期不是「猜错」，把它算成失败次数只会让正常用户被自己拖累。
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码已过期，请重新获取。")
    if int(record.attempts or 0) >= MAX_VERIFICATION_CODE_ATTEMPTS:
        _record_verify_failure(session, scope)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="尝试次数过多，请重新获取验证码。")
    if record.code_hash != code_hash(code.strip(), record.code_salt or ""):
        # 先记账再从 ORM 改 attempts：此时本事务还只有 SELECT，没有持有 SQLite
        # 写锁，独立会话的 INSERT 不会被自己挡住。
        _record_verify_failure(session, scope)
        record.attempts = int(record.attempts or 0) + 1
        session.flush()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="验证码不正确。")
    record.consumed_at = utcnow()
    # 成功后清空该邮箱的失败计数，避免用户被自己过去的输错次数拖累。
    password_gate.clear(session, scope)
    session.flush()
#: 单封验证码最多可以被尝试几次（按验证码记录计）。
MAX_VERIFICATION_CODE_ATTEMPTS = 8
def _record_verify_failure(session, scope: str) -> None:
    """记录一次验证码失败，作为 ``verify:<email>`` 的限流依据。

    这里有个必须注意的坑：本函数之后一定会抛 HTTPException，请求事务随之回滚，
    所以**在本会话里写的记录会被一起回滚掉**。因此改用独立会话提交
    （``record_attempt_in_new_session``），失败尝试才真的算数。
    """
    record_attempt_in_new_session(session, scope)
def record_attempt_in_new_session(session, scope: str) -> None:
    """在一个独立事务里记录失败尝试，确保外层请求回滚不会把它抹掉。

    限流记录必须在失败路径也留下痕迹，共用事务会被回滚而永不触发。
    写入失败（SQLite 写锁被外层事务占着等）一律吞掉并告警：这是限流记账，
    不能因此把「验证码不正确」变成 500。
    """
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
    try:
        with factory() as probe:
            password_gate.record_attempt(probe, scope, succeeded=False)
            probe.commit()
    except SQLAlchemyError:
        logger.warning("限流记录写入失败，本次不计入 scope=%s", scope, exc_info=True)
#: 登录限流的阈值。按来源 IP 放宽（同一个出口 NAT 后面可能坐着整间办公室）。
LOGIN_IP_MAX_ATTEMPTS = 30
#: 全局维度**只告警、不拦截**，见 :func:`_note_login_failure` 的说明。
LOGIN_FLOOD_ALERT_ATTEMPTS = 120
LOGIN_GLOBAL_SCOPE = "login-global"
def _login_scopes(request: Request, email: str) -> list[str]:
    """一次登录失败要记到哪些维度上。

    「按账号」保护单个账号，「按 IP」挡住同一来源横扫多账号（只有按账号时换个邮箱就是全新计数桶）。
    按 IP 只在来源地址真的代表一个客户端时启用：反代后没配可信代理会让所有人共用代理地址，
    失败几次就锁掉所有人，此时由按账号那档继续兜底。
    """
    scopes = [f"login:{email}"]
    address = resolve_client_ip(request)
    if address.per_client and address.ip:
        scopes.append(f"login-ip:{address.ip}")
    return scopes
def _note_login_failure(session, scopes: list[str]) -> None:
    """把失败记进各维度，并在全局量异常时告警。

    必须先回滚本请求事务、再用独立会话提交：否则随后的 401 回滚会丢掉失败记录（限流永不触发），
    且请求会话此刻可能正持 SQLite 写锁，独立写入要等到 busy_timeout 才失败并被吞掉，同样丢计数。
    """
    session.rollback()
    for scope in scopes:
        record_attempt_in_new_session(session, scope)
    record_attempt_in_new_session(session, LOGIN_GLOBAL_SCOPE)
    try:
        factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False, future=True)
        with factory() as probe:
            failures = password_gate.recent_failures(probe, LOGIN_GLOBAL_SCOPE)
    except SQLAlchemyError:
        logger.warning("全局登录失败计数读取失败，跳过告警判断", exc_info=True)
        return
    if failures >= LOGIN_FLOOD_ALERT_ATTEMPTS:
        logger.warning(
            "登录失败量异常：最近 %s 分钟内全局失败 %s 次，疑似分布式撞库（全局维度不拦截，"
            "如需止血请按来源网段处理）",
            password_gate.WINDOW_MINUTES,
            failures,
        )
# --------------------------------------------------------------------------- #
# 口令确认闸门
# --------------------------------------------------------------------------- #
#: 口令确认类端点的 scope 前缀。与登录**共用同一张失败计数表**，但 scope 必须独立：
#: 登录被撞库不该把「改密码」也锁死（用户会被自己看不见的攻击拖住），改密码猜错也不该
#: 影响登录。两者唯一的共同点只是都记账、都按次数冷却。
_PASSWORD_CONFIRM_SCOPE_PREFIX = "confirm:"
def _password_confirmation_scope(account) -> str:
    """口令确认按**账号**限流，不按来源 IP。

    这些端点都要求已登录，攻击者通常握着某个会话；按 IP 限流的话换一个出口地址就重置了
    计数 —— 而他真正要猜的是这个账号的密码，账号维度才拦得住。
    """
    return f"{_PASSWORD_CONFIRM_SCOPE_PREFIX}{account.id}"
def _enforce_password_confirmation_gate(session, account) -> str:
    """校验口令之前先看冷却，返回 scope 供失败/成功记账。

    `/auth/change-password`、`/account/email`、`/account/licenses/{id}/release` 都以
    「当前密码对不对」作为判别器（403 与 200/其它码），而这条路径此前没有任何闸门 ——
    登录那条早就限流了，等于把不限次的密码猜测挪到了这三个端点。改密码成功还能把原主踢下线，
    所以这里不是「顺手补一道」：它是这三个端点唯一的速度限制。
    """
    scope = _password_confirmation_scope(account)
    remaining = password_gate.retry_after_seconds(session, scope)
    if remaining > 0:
        logger.warning("口令确认被限流 scope=%s 剩余=%s 秒", scope, remaining)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"密码错误次数过多，请 {remaining} 秒后再试。",
            headers={"Retry-After": str(remaining)},
        )
    return scope
def _note_password_confirmation_failure(session, scope: str) -> None:
    """记一次口令确认失败。

    必须**先回滚本请求事务**、再用独立会话提交（与 `_note_login_failure` 同一道理）：
    接下来要抛 403，随后的回滚会把刚写的计数一起丢掉，于是冷却永远不触发 ——
    限流看似存在、实际是 0 次。
    """
    session.rollback()
    record_attempt_in_new_session(session, scope)
