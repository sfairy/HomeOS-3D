"""授权商店服务的运行配置。

约定：接入凭据、路径、端口这类「运维」配置走环境变量（本文件）；
站点名称、公告、邀请比例这类「可运营」内容走数据库 store_settings 表。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from store.env import load_dotenv

logger = logging.getLogger("store.config")

STORE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = STORE_ROOT.parent

DEFAULT_PORT = 18082
DEFAULT_HOST = "0.0.0.0"

#: 待支付订单有效期（与参考站一致：2 分钟）
DEFAULT_ORDER_TTL_SECONDS = 120
#: 解除设备绑定冷却（与参考站一致：28800 秒 = 8 小时）
DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS = 28800
#: 签发租约的有效期；客户端默认 300 秒心跳一次。
#:
#: ⚠ 这个值**同时**决定两件事，改它等于同时改这两件事：
#:
#: 1. **离线可用时长**：客户端把签名租约存进本地库，签名有效期内即使连不上商店也
#:    照常放行（状态降为 ``CONNECTION_WARNING``）；租约一过就转 ``LEASE_EXPIRED``
#:    并收回编辑器功能（见 ``backend/app/license/service.py`` 的 ``_payload``）。
#: 2. **吊销生效上界**：管理后台停用授权/解绑设备时，客户端要等**下一次成功心跳**
#:    才会知道。对一台**持续离线**的客户端，最坏情况就是撑到租约到期 —— 所以
#:    「吊销最慢多久生效」在数值上就等于这个 TTL。
#:
#: 这两个需求是反向的：TTL 越长，断网与「商店本身故障/停机」越从容，但吊销越慢。
#: 这里取 72 小时作为折中 —— 吊销最多 3 天生效，同时商店整体停摆 3 天内不会
#: 把全部已付费客户锁在门外（早先的 7 天对吊销来说太慢；而审计初稿建议的
#: 「心跳间隔 + 宽限期」（约 1 小时）会让商店故障 1 小时即锁死所有客户）。
#: 误配成很大的值时 ``load_settings`` 会打启动告警提醒吊销上界。
DEFAULT_LEASE_TTL_SECONDS = 72 * 3600
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 300
#: 邮箱验证码有效期与重发间隔
DEFAULT_VERIFICATION_TTL_SECONDS = 600
DEFAULT_VERIFICATION_COOLDOWN_SECONDS = 60
#: 会话有效期
DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600


def _env_str(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return default if value is None else value.strip()


def _read_secret_file(path: str) -> str:
    """读取密钥文件内容；读不到就返回空串（由调用方回退到内联值）。"""
    if not path:
        return ""
    try:
        return Path(path).expanduser().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in frozenset({"1", "on", "yes", "true"})


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return float(value.strip())
    except ValueError:
        return default


def _env_path(name: str, default: Path | None = None) -> Path | None:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return Path(value.strip()).expanduser().resolve()


@dataclass(frozen=True)
class StoreSettings:
    """不可变配置对象。所有字段均由 :func:`load_settings` 从环境变量装配。"""

    data_dir: Path
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    base_url: str = ""
    project_root: Path = PROJECT_ROOT
    static_dir: Path = STORE_ROOT / "static"
    templates_dir: Path = STORE_ROOT / "templates"

    # 会话
    cookie_name: str = "ha_bridge_store_session"
    hint_cookie_name: str = "homeos_store_hint"
    #: HTTPS 部署时置 True；默认 False 不代表「只有显式开启才安全」——
    #: 请求级判定会自动按 https 给 Cookie 加 Secure，见 request_security。
    cookie_secure: bool = False
    #: 可信反向代理的 IP / CIDR 列表。为空表示不信任任何转发头，
    #: 此时限流与审计按 TCP 对端地址统计（直连部署下就是真实客户端）。
    trusted_proxies: tuple[str, ...] = ()
    session_max_age_seconds: int = DEFAULT_SESSION_MAX_AGE_SECONDS

    #: 首次初始化（创建第一个管理员）的引导密钥。
    #: 为空时由 ``store/setup_guard.py`` 自动生成一份并落到 ``data_dir/setup-token``，
    #: 同时打印到启动日志（stderr）。本机直连访问无需填写。
    setup_token: str = ""

    # 邮箱验证码
    mail_mode: str = "log"
    mail_from: str = "HomeOS <no-reply@habridge.local>"
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_ssl: bool = True
    smtp_starttls: bool = False
    #: 单次 SMTP 交互的超时；重试会让总耗时乘以尝试次数，所以别设太大
    smtp_timeout_seconds: int = 15
    #: 发信失败后的重试次数。**只对瞬时故障重试**（连接被拒、超时、4xx），
    #: 认证失败/收件人被拒这类确定性错误重试没有意义，只会拖慢注册接口。
    smtp_max_attempts: int = 3
    #: 重试之间的基础退避秒数（线性递增：1s、2s、3s…）
    smtp_retry_backoff_seconds: float = 1.0
    verification_ttl_seconds: int = DEFAULT_VERIFICATION_TTL_SECONDS
    verification_cooldown_seconds: int = DEFAULT_VERIFICATION_COOLDOWN_SECONDS
    #: 仅当 mail_mode=echo 时，接口才回显验证码明文（本地联调用）
    expose_verification_code: bool = False

    # 支付
    #: 空串表示「尚未配置渠道」。**绝不能默认 mock**：模拟收银台点一下按钮就把订单
    #: 标成已支付并签发真实授权 —— 也就是「照默认配置部署 = 付费产品免费送」。
    #: 未配置时 ``resolve_provider`` 会直接报错、拒绝建单（fail-closed）。
    payment_provider: str = ""
    #: 是否允许使用模拟收银台（mock）。默认关闭，必须显式开启（STORE_ALLOW_MOCK_PAYMENTS=1），
    #: 且仅供本地联调；正式收款环境绝不能打开。
    allow_mock_payments: bool = False
    alipay_app_id: str = ""
    alipay_gateway_url: str = "https://openapi.alipay.com/gateway.do"
    alipay_app_private_key: str = ""
    alipay_public_key: str = ""
    alipay_transaction_description: str = "HomeOS 授权"
    #: 密钥推荐用文件：PEM 是多行的，塞进单行环境变量很容易出错
    alipay_app_private_key_path: str = ""
    alipay_public_key_path: str = ""
    #: 可选：核验异步通知的 seller_id，防止别的商户号往本回调地址推消息
    alipay_seller_id: str = ""
    #: 可选：覆盖回调地址。用内网穿透时它和 STORE_BASE_URL 往往不是同一个域名
    alipay_notify_url: str = ""
    alipay_return_url: str = ""
    alipay_sign_type: str = "RSA2"
    #: 是否校验收到的支付宝响应签名（关掉等于放弃对响应真实性的校验，不建议）
    alipay_verify_response_sign: bool = True

    # 授权签发
    #: 注意：仓库根的 keys/ 是客户端默认读取的公钥镜像（由 gen_keys 自动同步），私钥留在服务自己的目录
    license_keys_dir: Path = STORE_ROOT / "keys" / "local"
    license_key_id: str = "hb-local-2026"
    license_transport_key_id: str = "hb-local-transport-2026"
    lease_ttl_seconds: int = DEFAULT_LEASE_TTL_SECONDS
    heartbeat_interval_seconds: int = DEFAULT_HEARTBEAT_INTERVAL_SECONDS

    # 订单 / 设备
    order_ttl_seconds: int = DEFAULT_ORDER_TTL_SECONDS
    device_release_cooldown_seconds: int = DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS
    #: 后台支付巡检间隔（秒）。0 表示关闭巡检。
    #:
    #: 巡检负责两件前端轮询覆盖不到的事：认领「用户付完就关页面」的单，
    #: 以及关闭本地已过期、但支付宝那边仍开着（旧二维码还能付）的交易。
    payment_sweep_interval_seconds: int = 30
    #: 每轮巡检处理的订单上限，避免积压时一次性打爆渠道配额
    payment_sweep_batch: int = 25

    # 初始管理员（seed 用）
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""

    @property
    def database_path(self) -> Path:
        return self.data_dir / "store.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"

    @property
    def product_images_dir(self) -> Path:
        return self.data_dir / "product-images"

    @property
    def private_key_path(self) -> Path:
        return self.license_keys_dir / "license-private.pem"

    @property
    def public_key_path(self) -> Path:
        return self.license_keys_dir / "license-public.pem"

    @property
    def transport_private_key_path(self) -> Path:
        return self.license_keys_dir / "license-transport-private.pem"

    @property
    def transport_public_key_path(self) -> Path:
        return self.license_keys_dir / "license-transport-public.pem"

    @property
    def public_base_url(self) -> str:
        if self.base_url:
            return self.base_url.rstrip("/")
        host = "127.0.0.1" if self.host in {"0.0.0.0", "::"} else self.host
        return f"http://{host}:{self.port}"

    @property
    def mail_delivery_enabled(self) -> bool:
        return self.mail_mode == "smtp"

    @property
    def smtp_ready(self) -> bool:
        """SMTP 是否具备真正发信的条件。

        少了授权码/密码就直接判定为未就绪：否则每个验证码请求都会去连一次远端、
        等到超时（``_send_smtp`` 的 timeout=15s）才回退，注册接口白白卡十几秒。
        这里提前拦掉，让它立刻退化为日志/回显模式。
        """
        if self.mail_mode != "smtp" or not self.smtp_host:
            return False
        # 有用户名就必须有密码；部分内网 SMTP 允许匿名，所以用户名空时不强制密码
        if self.smtp_username and not self.smtp_password:
            return False
        return True

    @property
    def smtp_misconfigured(self) -> bool:
        """显式要求 smtp 但凭据不全——需要大声报警，避免又变成静默失败。"""
        return self.mail_mode == "smtp" and not self.smtp_ready

    # ------------------------------------------------------------------ #
    # 支付宝密钥：优先读文件，其次用内联值
    # ------------------------------------------------------------------ #
    @property
    def alipay_private_key_text(self) -> str:
        return _read_secret_file(self.alipay_app_private_key_path) or self.alipay_app_private_key

    @property
    def alipay_public_key_text(self) -> str:
        return _read_secret_file(self.alipay_public_key_path) or self.alipay_public_key


def load_settings(**overrides) -> StoreSettings:
    """从环境变量装配配置。``overrides`` 用于测试与 seed 脚本覆盖单字段。"""

    # 先吃 .env（真实环境变量优先），这样 SMTP 授权码等本地密钥不必写进代码或 shell
    load_dotenv()

    values = {
        "data_dir": _env_path("STORE_DATA_DIR", STORE_ROOT / "data"),
        "host": _env_str("STORE_HOST", DEFAULT_HOST) or DEFAULT_HOST,
        "port": _env_int("STORE_PORT", DEFAULT_PORT),
        "base_url": _env_str("STORE_BASE_URL"),
        "cookie_name": _env_str("STORE_COOKIE_NAME", "ha_bridge_store_session") or "ha_bridge_store_session",
        "cookie_secure": _env_bool("STORE_COOKIE_SECURE"),
        "trusted_proxies": tuple(
            piece.strip()
            for piece in _env_str("STORE_TRUSTED_PROXIES").split(",")
            if piece.strip()
        ),
        "session_max_age_seconds": _env_int("STORE_SESSION_MAX_AGE_SECONDS", DEFAULT_SESSION_MAX_AGE_SECONDS),
        "setup_token": _env_str("STORE_SETUP_TOKEN", ""),
        "mail_mode": (_env_str("STORE_MAIL_MODE", "log") or "log").lower(),
        "mail_from": _env_str("STORE_MAIL_FROM", "HomeOS <no-reply@habridge.local>") or "HomeOS <no-reply@habridge.local>",
        "smtp_host": _env_str("STORE_SMTP_HOST"),
        "smtp_port": _env_int("STORE_SMTP_PORT", 465),
        "smtp_username": _env_str("STORE_SMTP_USERNAME"),
        "smtp_password": _env_str("STORE_SMTP_PASSWORD"),
        "smtp_use_ssl": _env_bool("STORE_SMTP_USE_SSL", True),
        "smtp_starttls": _env_bool("STORE_SMTP_STARTTLS"),
        "smtp_timeout_seconds": _env_int("STORE_SMTP_TIMEOUT_SECONDS", 15),
        "smtp_max_attempts": max(1, _env_int("STORE_SMTP_MAX_ATTEMPTS", 3)),
        "smtp_retry_backoff_seconds": _env_float("STORE_SMTP_RETRY_BACKOFF_SECONDS", 1.0),
        "verification_ttl_seconds": _env_int("STORE_VERIFICATION_TTL_SECONDS", DEFAULT_VERIFICATION_TTL_SECONDS),
        "verification_cooldown_seconds": _env_int("STORE_VERIFICATION_COOLDOWN_SECONDS", DEFAULT_VERIFICATION_COOLDOWN_SECONDS),
        "expose_verification_code": _env_bool("STORE_EXPOSE_VERIFICATION_CODE"),
        "payment_provider": (_env_str("STORE_PAYMENT_PROVIDER", "") or "").lower(),
        "allow_mock_payments": _env_bool("STORE_ALLOW_MOCK_PAYMENTS"),
        "alipay_app_id": _env_str("STORE_ALIPAY_APP_ID"),
        "alipay_gateway_url": _env_str("STORE_ALIPAY_GATEWAY_URL", "https://openapi.alipay.com/gateway.do") or "https://openapi.alipay.com/gateway.do",
        "alipay_app_private_key": _env_str("STORE_ALIPAY_APP_PRIVATE_KEY"),
        "alipay_public_key": _env_str("STORE_ALIPAY_PUBLIC_KEY"),
        "alipay_transaction_description": _env_str("STORE_ALIPAY_TRANSACTION_DESCRIPTION", "HomeOS 授权") or "HomeOS 授权",
        "alipay_app_private_key_path": _env_str("STORE_ALIPAY_APP_PRIVATE_KEY_PATH"),
        "alipay_public_key_path": _env_str("STORE_ALIPAY_PUBLIC_KEY_PATH"),
        "alipay_seller_id": _env_str("STORE_ALIPAY_SELLER_ID"),
        "alipay_notify_url": _env_str("STORE_ALIPAY_NOTIFY_URL"),
        "alipay_return_url": _env_str("STORE_ALIPAY_RETURN_URL"),
        "alipay_sign_type": (_env_str("STORE_ALIPAY_SIGN_TYPE", "RSA2") or "RSA2").upper(),
        "alipay_verify_response_sign": _env_bool("STORE_ALIPAY_VERIFY_RESPONSE", True),
        "license_keys_dir": _env_path("STORE_LICENSE_KEYS_DIR", STORE_ROOT / "keys" / "local"),
        "license_key_id": _env_str("STORE_LICENSE_KEY_ID", "hb-local-2026") or "hb-local-2026",
        "license_transport_key_id": _env_str("STORE_LICENSE_TRANSPORT_KEY_ID", "hb-local-transport-2026") or "hb-local-transport-2026",
        "lease_ttl_seconds": _env_int("STORE_LEASE_TTL_SECONDS", DEFAULT_LEASE_TTL_SECONDS),
        "heartbeat_interval_seconds": _env_int("STORE_HEARTBEAT_INTERVAL_SECONDS", DEFAULT_HEARTBEAT_INTERVAL_SECONDS),
        "order_ttl_seconds": _env_int("STORE_ORDER_TTL_SECONDS", DEFAULT_ORDER_TTL_SECONDS),
        "device_release_cooldown_seconds": _env_int("STORE_DEVICE_RELEASE_COOLDOWN_SECONDS", DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS),
        "payment_sweep_interval_seconds": max(0, _env_int("STORE_PAYMENT_SWEEP_INTERVAL_SECONDS", 30)),
        "payment_sweep_batch": max(1, _env_int("STORE_PAYMENT_SWEEP_BATCH", 25)),
        "bootstrap_admin_email": _env_str("STORE_ADMIN_EMAIL"),
        "bootstrap_admin_password": _env_str("STORE_ADMIN_PASSWORD"),
    }
    values.update(overrides)
    settings = StoreSettings(**values)
    _warn_insecure_verification_exposure(settings)
    _warn_lease_revocation_bound(settings)
    return settings


#: 本机绑定地址。``0.0.0.0`` / ``::`` 是「监听所有网卡」，不算本机。
_LOOPBACK_BIND_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


def _warn_insecure_verification_exposure(settings: StoreSettings) -> None:
    """验证码回显 + 非本机绑定 → 大声告警。

    回显（``mail_mode=echo`` 或 ``STORE_EXPOSE_VERIFICATION_CODE``）是本地联调用的，
    一旦部署同时监听非本机网卡，就必须确认访问者真的到不了这个进程：请求侧只对
    能确定来自本机的来源回显（见 ``store/api/store.py:_is_loopback_client``），
    但如果前面挂了**同机反代且没配** ``STORE_TRUSTED_PROXIES``，每个外部请求的对端
    都是 127.0.0.1，请求侧就无从区分了 —— 那正是这里要提醒的场景。

    刻意只告警不抛错：docker 默认是 ``STORE_HOST=0.0.0.0``，而大量自检与工具脚本
    也都在回显开启下跑（它们用 ASGITransport，没有真实网络对端）。硬失败会把
    「本机联调」这一合法用法一起挡掉，而它恰恰是 echo 存在的理由。
    """
    exposure_on = bool(settings.expose_verification_code) or settings.mail_mode == "echo"
    bind_host = (settings.host or "").strip().lower()
    if not exposure_on or bind_host in _LOOPBACK_BIND_HOSTS:
        return
    logger.warning(
        "验证码回显已开启（mail_mode=%s, expose_verification_code=%s），但服务监听 %s"
        "（非本机网卡）。回显只对可确认来自本机的请求生效；若前置了**同机**反向代理"
        "又未配置 STORE_TRUSTED_PROXIES，外部请求的对端会被误认成本机 —— 请改为"
        " mail_mode=smtp 并关闭 STORE_EXPOSE_VERIFICATION_CODE，或把服务绑到 127.0.0.1。",
        settings.mail_mode,
        settings.expose_verification_code,
        settings.host,
    )


#: 租约 TTL 超过这个值时给启动告警：此时「吊销最慢多久生效」已经慢到不像话，
#: 但又不至于明显是笔误 —— 属于「运营可能没意识到自己配了什么」的区间。
_LEASE_TTL_WARN_SECONDS = 7 * 24 * 3600


def _warn_lease_revocation_bound(settings: StoreSettings) -> None:
    """把「吊销生效上界」在启动日志里说清楚。

    租约 TTL 在实现上同时是两个东西：离线可用时长，以及**吊销最慢多久生效**。
    这两件事只有一处配置，而常量名 ``STORE_LEASE_TTL_SECONDS`` 读起来只像前者 ——
    运营出于「让断网用户更从容」把它调到 30 天时，多半没意识到停用一张授权也要
    等 30 天才能对一台离线设备生效。所以这里把耦合关系换算成天数摆到日志里。

    刻意只告警不拦：TTL 调大是合法的可用性取舍（例如商店本身要长期停机维护），
    该由运营自己权衡；这里只保证他做选择时看得见代价。
    """
    seconds = int(settings.lease_ttl_seconds or 0)
    if seconds <= _LEASE_TTL_WARN_SECONDS:
        return
    logger.warning(
        "STORE_LEASE_TTL_SECONDS=%d（约 %.1f 天）偏大：该值同时是「离线可用时长」"
        "与「吊销生效上界」—— 对一台持续离线的客户端，停用授权/解绑设备最慢要等"
        "这么久才会真正生效。若这不是有意为之，请调小（默认 %d 秒 = 72 小时）。",
        seconds,
        seconds / 86400,
        DEFAULT_LEASE_TTL_SECONDS,
    )
