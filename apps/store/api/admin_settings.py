"""运营后台的站点配置资源组：站点设置读取 / 更新，以及支付宝与邮件的连通性测试。

从 api/admin.py 拆出来的第一个资源组（那个文件 4479 行、57 条路由）。拆分手法是固定的：
子路由**不带前缀**（路径本来就是 /settings 这样的绝对路径），由父路由 admin.py 用
router.include_router() 在**原来的位置**套上 /store-admin/v1 —— 位置很重要，FastAPI 按注册序
匹配路由，include 的位置错了可能在重叠路径上改变行为（有 72 条路由基线逐项比对兜底）。

为什么先拆这一组：它自带 3 个私有助手与 1 个常量（_alipay_settings_payload /
_mail_settings_payload / _settings_response / _NULL_MEANS_FOLLOW_ENV），不与别处共享，
是一个闭合区间 —— 拆出去不会把依赖搅成一团。
"""
from __future__ import annotations

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from apps.store.ops import site_settings as site_config
from apps.store.ops import mail_settings, mailer
from apps.store.core.deps import AdminAccount, DbSession, SettingsDep
from apps.store.payments import PROVIDER_NAMES, is_known_provider, normalize_provider_name
from apps.store.payments.base import PaymentError
from apps.store.payments.credentials import (
    alipay_credentials_summary,
    resolve_secret_input,
    validate_callback_url,
    validate_gateway_url,
    validate_private_key_text,
    validate_public_key_text,
)
from apps.store.core.models import (
    DEFAULT_SUPPORT_EMAIL,
    StoreSetting,
)
from apps.store.core.schemas import (
    AdminMailTestRequest,
    AdminSettingsRequest,
)
from apps.store.security.security import (
    is_valid_email,
    normalize_email,
    utcnow,
)  # noqa: F401

logger = logging.getLogger("apps.store.admin")


# 共享助手在 admin_shared.py；这里再导入一次，
# 于是本文件剩下的 57 条路由不用改任何一处调用。
from .admin_shared import (
    _admin_actor,
    _audit,
)

router = APIRouter()


# 站点配置
def _alipay_settings_payload(settings: SettingsDep, setting) -> dict:
    return alipay_credentials_summary(settings, setting)


def _mail_settings_payload(settings: SettingsDep, setting) -> dict:
    return mail_settings.mail_delivery_summary(settings, setting)


def _settings_response(setting, settings: SettingsDep) -> dict:
    """``GET/PUT /settings`` 的统一响应体。

    两个入口必须返回**同一个形状**：前端改完配置直接用 PUT 的返回值刷新页面状态，
    两边字段不一致时会出现「保存成功但界面还是旧值」——运营会再点一次保存。
    """
    return site_config.site_configuration_payload(
        setting, settings, include_credentials=True
    ) | {
        "referral": site_config.referral_settings_payload(setting),
        # 库里那一列的原始值：``None`` = 跟随环境变量（后台输入框显示为空）。
        "deviceReleaseCooldownSeconds": setting.device_release_cooldown_override,
        # 实际生效值。与原始值分开放：``None`` 时输入框是空的，运营需要看到
        # 「不填的话到底是多少」—— 见 settings.js 里那个占位符文案。
        "deviceReleaseCooldownEffectiveSeconds": site_config.resolve_device_release_cooldown(
            setting, settings
        ),
        "announcement": setting.announcement,
        #: 支付宝凭据概览（不含明文）。与 ``payment_provider`` 分开放：
        #: 前者是「渠道怎么走」，这里是「渠道的钥匙」。
        "alipay": _alipay_settings_payload(settings, setting),
        #: 注册邮箱验证码配置概览（不含 SMTP 授权码明文）。
        "mail": _mail_settings_payload(settings, setting),
    }


#: 这些列上的 NULL 是**有意义的取值**（「跟随环境变量」），不是「这个字段别动」。
#: ``update_setting`` 不区分这两种 None，所以它们必须在写入前摘出来、写完再显式置 NULL
#: （见 ``admin_update_settings``）。登记在这里而不是各写一处 ``if ... is None``：
#: 漏登记一个字段的症状是「后台清空之后保存成功、但值没变」，很难从界面上看出来。
#: 注意键是**数据库列名**（``updates`` 用的就是列名），不是前端字段名。
_NULL_MEANS_FOLLOW_ENV = frozenset(
    {
        # 验证码回显：NULL = 跟随环境变量，False = 生产上显式关掉。
        "expose_verification_code",
        # 解绑冷却：NULL = 跟随环境变量，0 = 显式不限间隔。
        "device_release_cooldown_override",
    }
)


@router.get("/settings")
def admin_get_settings(session: DbSession, _admin: AdminAccount, settings: SettingsDep) -> dict:
    setting = site_config.get_setting(session)
    return _settings_response(setting, settings)


@router.put("/settings")
def admin_update_settings(
    payload: AdminSettingsRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "site_name": "site_name",
        "site_title": "site_title",
        "description": "description",
        "announcement": "announcement",
        "support_email": "support_email",
        # logo_url 留空表示回到默认标识（见 site_settings.DEFAULT_LOGO_URL）
        "logo_url": "logo_url",
        # 留空 = 不显示部署块（与 logo_url 不同，这里**没有**可回落的默认地址）
        "deploy_base_url": "deploy_base_url",
        "maintenance_mode": "maintenance_mode",
        "maintenance_message": "maintenance_message",
        "payment_provider": "payment_provider",
        "payment_display_name": "payment_display_name",
        "payment_enabled": "payment_enabled",
        "payment_transaction_description": "payment_transaction_description",
        "referral_enabled": "referral_enabled",
        "referral_rate_percent": "referral_rate_percent",
        "referral_withdrawal_fee_percent": "referral_withdrawal_fee_percent",
        "referral_withdrawal_min_points": "referral_withdrawal_min_points",
        "device_release_cooldown_seconds": "device_release_cooldown_override",
        # ---- 注册邮箱验证码 ----
        "mail_mode": "mail_mode",
        "mail_from": "mail_from",
        "smtp_host": "smtp_host",
        "smtp_port": "smtp_port",
        "smtp_username": "smtp_username",
        "smtp_security": "smtp_security",
        "verification_ttl_seconds": "verification_ttl_seconds",
        "verification_cooldown_seconds": "verification_cooldown_seconds",
    }
    updates = {column: data[field] for field, column in mapping.items() if field in data}
    if "payment_provider" in updates:
        # 渠道名写错一个字符就会让商店静默切到模拟收银台（本地点一下就发码），
        # 因此在入口直接拒绝未知取值，而不是等到下单时才 503。
        candidate = updates["payment_provider"]
        if not is_known_provider(candidate):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"支付渠道「{candidate}」不受支持，可选值为 "
                    f"{'、'.join(PROVIDER_NAMES)}，留空表示跟随环境变量。"
                ),
            )
        updates["payment_provider"] = normalize_provider_name(candidate)
    if "logo_url" in updates:
        updates["logo_url"] = (
            str(updates["logo_url"] or "").strip() or site_config.DEFAULT_LOGO_URL
        )
    if "deploy_base_url" in updates:
        # 结尾斜杠在这里就去掉：前台按 ``<地址>/install.sh`` 拼接，留着它就是双斜杠。
        # 读路径（site_settings._deploy_base_url）同样会规范化，这里是让**写进库的值**
        # 就是干净的 —— 免得后台来回保存一次、值长得不一样。
        # 空串是有效取值（= 不显示部署块），不像 logo_url 那样回落到默认值。
        updates["deploy_base_url"] = str(updates["deploy_base_url"] or "").strip().rstrip("/")
    if "support_email" in updates:
        # 与 logo_url 同一口径：这个字段**没有「空着」这个状态**。
        # 允许写空串的话，库里是空的、页面上却总显示默认值（读路径回落），
        # 于是「清空客服邮箱」是个永远不生效的假选项 —— 不如把默认值直接落库。
        updates["support_email"] = (
            str(updates["support_email"] or "").strip() or DEFAULT_SUPPORT_EMAIL
        )
    updates |= _alipay_settings_updates(data)
    updates |= _mail_settings_updates(data, current=site_config.get_setting(session), settings=settings)
    # ``update_setting`` 把 None 当作「这个字段别动」，但有几个字段的 NULL 是**有意义的
    # 取值**（「跟随环境变量」，区别于 0 / false 的「显式关掉」），所以它们被摘出来、
    # 其余字段写完后再显式置 NULL；不能用 ``updates.pop(...) is None``，pop 会无条件摘键，
    # 把「显式传 0 / false」丢掉。
    cleared = [
        key
        for key in _NULL_MEANS_FOLLOW_ENV
        if key in updates and updates[key] is None
    ]
    for key in cleared:
        del updates[key]
    setting = site_config.update_setting(session, **updates)
    if cleared:
        for key in cleared:
            setattr(setting, key, None)
        setting.updated_at = utcnow()
        session.flush()
    audited = sorted(set(updates) | set(cleared))
    _audit(session, _admin_actor(admin), "settings.update", "1", ",".join(audited))
    return _settings_response(setting, settings)


#: 支付宝的纯文本配置项（前端字段名 == 数据库列名，故只列一次）。留空即清空、跟随环境变量。
#: 曾经写成「字段名 → 同名字段名」的字典，看着像配置表、实际只是集合，读的人得先确认两边真的相等。
_ALIPAY_TEXT_FIELDS: tuple[str, ...] = (
    "alipay_app_id",
    "alipay_seller_id",
    "alipay_gateway_url",
    "alipay_notify_url",
    "alipay_return_url",
)

#: 回调地址的字段名 → 中文标签，仅用于报错文案。
_ALIPAY_CALLBACK_LABELS = {
    "alipay_notify_url": "异步通知地址",
    "alipay_return_url": "同步跳转地址",
}


def _alipay_settings_updates(data: dict) -> dict:
    """校验并归一化后台提交的支付宝凭据字段，返回待写入的 updates。
    必须在配置接口校验而不是等第一次支付：私钥填错时 ``sign_params`` 抛的 ``PaymentError`` 会出现在
    **用户下单**的动线上，支付失败的是客户、改配置的人却看不到反馈。密钥字段的三种语义：未提交=不改动、
    空串=清空（跟随环境变量）、打码值=不改动、其它=新密钥。
    """
    updates: dict = {}
    try:
        for field in _ALIPAY_TEXT_FIELDS:
            if field in data:
                updates[field] = str(data[field] or "").strip()
        if updates.get("alipay_gateway_url"):
            validate_gateway_url(updates["alipay_gateway_url"])
        for field, label in _ALIPAY_CALLBACK_LABELS.items():
            if updates.get(field):
                validate_callback_url(updates[field], label=label)

        private_key = resolve_secret_input(data.get("alipay_app_private_key"))
        if private_key is not None:
            if private_key:
                validate_private_key_text(private_key)
            updates["alipay_app_private_key"] = private_key

        public_key = resolve_secret_input(data.get("alipay_public_key"))
        if public_key is not None:
            if public_key:
                validate_public_key_text(public_key)
            updates["alipay_public_key"] = public_key

        if "alipay_sandbox" in data:
            updates["alipay_sandbox"] = bool(data["alipay_sandbox"])
    except PaymentError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return updates


#: 邮件的纯文本配置项（前端字段名 == 数据库列名，故只列一次）。留空即清空、跟随环境变量。
_MAIL_TEXT_FIELDS: tuple[str, ...] = (
    "mail_from",
    "smtp_host",
    "smtp_username",
)


def _mail_settings_updates(data: dict, *, current: StoreSetting, settings: SettingsDep) -> dict:
    """校验并归一化后台提交的邮件 / 验证码字段，返回待写入的 updates。
    校验前移的理由同支付宝凭据：SMTP 填错时受害的是**正在注册的用户**，而改配置的运营一无所知。
    这里还要校验「有效期 / 冷却」的联动，且必须拿**合并后**的值去算 —— 有效期可能配在后台、冷却来自
    环境变量，只校验提交的那半会漏掉跨来源的死锁。
    """
    updates: dict = {}
    for field in _MAIL_TEXT_FIELDS:
        if field in data:
            updates[field] = str(data[field] or "").strip()

    if "mail_mode" in data:
        mode = str(data["mail_mode"] or "").strip().lower()
        if mode and mode not in mail_settings.MAIL_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"邮件投递方式「{mode}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.MAIL_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["mail_mode"] = mode

    if "smtp_security" in data:
        security = str(data["smtp_security"] or "").strip().lower()
        if security and security not in mail_settings.SMTP_SECURITY_MODES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"SMTP 加密方式「{security}」不受支持，可选值为 "
                    f"{'、'.join(mail_settings.SMTP_SECURITY_MODES)}，留空表示跟随环境变量。"
                ),
            )
        updates["smtp_security"] = security

    if "smtp_port" in data:
        updates["smtp_port"] = int(data["smtp_port"] or 0)

    # 授权码：空串=清空、打码值/未提交=不改动、其它=新授权码。
    # 「清除已保存的授权码」勾选框必须**压过**输入框：运营勾了它却因为输入框
    # 里还留着上一次的输入而没清掉，是这类表单最常见的挫败。
    if data.get("smtp_clear_password"):
        updates["smtp_password"] = ""
    else:
        password = resolve_secret_input(data.get("smtp_password"))
        if password is not None:
            updates["smtp_password"] = password

    for field, column in (
        ("verification_ttl_seconds", "verification_ttl_seconds"),
        ("verification_cooldown_seconds", "verification_cooldown_seconds"),
    ):
        if field in data:
            updates[column] = int(data[field] or 0)

    # 三态回显开关：字段在请求里就代表运营做了选择，显式传 null 表示清回「跟随环境变量」
    # ——列可空，NULL 与 False 是两件事（「没配过」vs「明确关掉」），所以绝不能写成
    # ``bool(None) == False``，否则运营点过这个下拉框就再回不到「跟随环境变量」。
    if "expose_verification_code" in data:
        value = data["expose_verification_code"]
        updates["expose_verification_code"] = None if value is None else bool(value)

    _validate_verification_window(updates, current=current, settings=settings)
    return updates


def _validate_verification_window(
    updates: dict, *, current: StoreSetting, settings: SettingsDep
) -> None:
    """校验「有效期 / 冷却」的联动关系。
    只在本次提交**动过**这两个字段时才校验：环境变量里的历史坏值不该把「改个站点名」这种无关操作也
    卡死，否则运营会陷入「什么都保存不了、又不知道该改哪」。校验用**合并后**的有效值，所以跨来源的
    「冷却 >= 有效期」死锁也拦得住。
    """
    touched = {
        "verification_ttl_seconds",
        "verification_cooldown_seconds",
    } & set(updates)
    if not touched:
        return
    ttl, cooldown = mail_settings.effective_verification_window(
        settings,
        current,
        ttl_override=updates.get("verification_ttl_seconds"),
        cooldown_override=updates.get("verification_cooldown_seconds"),
    )
    try:
        mail_settings.validate_verification_window(ttl, cooldown)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error


@router.post("/settings/alipay/test")
def admin_test_alipay_credentials(
    request: Request,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """测试**当前支付渠道**的凭据与回调配置，逐项给出结论。
    只看**已保存**的配置，不做「先试再存」：探活要真拿密钥签名并外呼，允许测未保存内容就多一条
    「任意字符串都能触发外呼」的路径。测「当前渠道」而非硬编码支付宝，因为这个按钮要回答的是
    「用户现在能不能付钱」—— 渠道还停在 mock 时最该看到的就是那句「模拟收银台不能用于生产收款」。
    同步端点，FastAPI 会丢进线程池，阻塞式 HTTPS/DNS 不会卡住事件循环。
    """
    setting = site_config.get_setting(session)
    try:
        provider = request.app.state.resolve_payment_provider(setting)
    except PaymentError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    diagnose = getattr(provider, "diagnose_credentials", None)
    if diagnose is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前支付渠道不支持凭据自检，请把支付渠道切换为 alipay 后再试。",
        )

    # 回调地址取**实际生效**的那一份（后台配置 / 环境变量 / 按 STORE_BASE_URL 推导），
    # 而不是把库里的原始值报出去 —— 运营要核对的是「支付宝到底会往哪推」。
    base_url = settings.public_base_url
    notify = provider.notify_url(settings, base_url) if hasattr(provider, "notify_url") else ""
    callback = provider.return_url(settings, base_url) if hasattr(provider, "return_url") else ""

    ok, message, checks = diagnose(settings, notify_url=notify, return_url=callback)
    #: 把探测结论也写进审核日志：凭据是否通过验证是排障时的关键事实，
    #: 事后复盘「谁在什么时候确认过配置可用」只能靠它。不记密钥内容。
    _audit(
        session,
        _admin_actor(admin),
        "settings.alipay_probe",
        "1",
        f"{'通过' if ok else '未通过'}：{message}"[:255],
    )
    return {
        "ok": ok,
        "message": message,
        "checks": checks,
        "provider": getattr(provider, "name", ""),
        "sandbox": bool(setting.alipay_sandbox),
    }


@router.post("/settings/mail/test")
def admin_test_mail_delivery(
    payload: AdminMailTestRequest,
    session: DbSession,
    admin: AdminAccount,
    settings: SettingsDep,
) -> dict:
    """按当前（已保存）邮件配置做一次诊断；给了收件人就再真发一封。
    与支付宝自检同一立场：只看**已保存**配置，不做「先试再存」——「填了 SMTP 但授权码过期/端口选错」
    过去唯一的暴露方式就是用户注册不了。收件人留空表示**只做连接诊断**（解析 + TCP/TLS + 登录握手，
    不发信），填了才真投递一封：SMTP 故障在握手阶段就能定位，而发信失败往往只回笼统 5xx。``ok`` 必须
    如实反映结果，``mail_mode=log/echo`` 时一定是 ``false`` 并要提示「测试不会真的发出去」。
    """
    email = normalize_email(payload.email or "")
    if email and not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="请输入有效的邮箱地址。"
        )

    setting = site_config.get_setting(session)
    #: 必须用合并后的配置：直接拿 ``app.state.settings`` 只会读到环境变量，
    #: 于是「后台刚填的授权码」永远测不出来 —— 而那正是运营点这个按钮的原因。
    merged = mail_settings.merge_mail_settings(settings, setting)
    diagnosed, checks = mailer.diagnose_mail(merged)

    if not email:
        failures = [item for item in checks if item["level"] == "fail"]
        if diagnosed:
            message = "连接诊断全部通过（未发送邮件）。填写收件邮箱可以再验证一次真实投递。"
        elif failures:
            message = "连接诊断未通过：" + "；".join(
                f"{item['label']} —— {item['detail']}" for item in failures
            )
        else:
            message = (
                f"未做真实投递：当前投递方式是 {merged.mail_mode}"
                "（验证码不会离开服务器），因此只报告了配置层面的结论。"
            )
        _audit(
            session,
            _admin_actor(admin),
            "settings.mail_probe",
            "1",
            f"仅连接诊断：{'通过' if diagnosed else '未通过'}"[:255],
        )
        return {
            "ok": diagnosed,
            "email": "",
            "mode": merged.mail_mode,
            "attempts": 0,
            "message": message,
            "checks": checks,
        }

    result = mailer.send_test_email(settings, setting, email=email)

    if result.delivered:
        message = f"测试邮件已通过 SMTP 投递到 {email}（第 {result.attempts} 次尝试成功）。"
    elif merged.smtp_misconfigured:
        message = (
            f"未真正发信：投递方式选了 smtp，但凭据不全（缺服务器地址或授权码），"
            f"本次已退化为 {result.mode} 模式。请补全后重试。"
        )
    elif merged.mail_mode != "smtp":
        message = (
            f"未真正发信：当前投递方式是 {merged.mail_mode}（只写日志"
            f"{'并回显' if merged.mail_mode == 'echo' else ''}），验证码不会离开服务器。"
            "要真正发信请把投递方式改为 smtp。"
        )
    else:
        message = f"发信失败（已尝试 {result.attempts} 次）：{result.error or '未返回具体原因'}"

    #: 结论写进审核日志：和支付宝探活同理，「谁在什么时候确认过邮件链路可用」
    #: 是事后复盘的关键事实。不记授权码。
    _audit(
        session,
        _admin_actor(admin),
        "settings.mail_probe",
        "1",
        f"{email}：{'已投递' if result.delivered else '未投递'}（{result.mode}）"[:255],
    )
    return {
        #: 带收件人时以**真实投递结果**为准：此时它才是「这条路通不通」的直接证据，
        #: 而诊断里的 warn（例如匿名投递）不该把一次成功的投递说成失败。
        #: 各项结论仍原样放在 checks 里供人细看。
        "ok": result.delivered,
        "email": email,
        "mode": result.mode,
        "attempts": result.attempts,
        "message": message,
        "checks": checks,
    }


# 账号
