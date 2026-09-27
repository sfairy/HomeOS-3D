"""授权商店服务的运行配置。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from src.core.env import load_dotenv
from src.licensing import keys as license_keys

logger = logging.getLogger("src.config")

STORE_ROOT = Path(__file__).resolve().parent


def _detect_project_root() -> Path:
    """源码布局 ``homeos-store/backend/src`` 或镜像布局 ``/app/src``。"""
    candidate_src = STORE_ROOT.parents[1]  # homeos-store/
    candidate_docker = STORE_ROOT.parent  # /app
    if (candidate_src / 'frontend').is_dir() or (candidate_src / 'backend').is_dir():
        return candidate_src
    if (candidate_docker / 'dist').is_dir() or (candidate_docker / 'src').is_dir():
        return candidate_docker
    return candidate_src


PROJECT_ROOT = _detect_project_root()
# 单体仓库根（含共享 keys/）；独立拆库后与 PROJECT_ROOT 相同。
REPO_ROOT = (
    PROJECT_ROOT.parent
    if (PROJECT_ROOT.parent / "homeos-3d").is_dir()
    else PROJECT_ROOT
)

DEFAULT_PORT = 18082
DEFAULT_HOST = "0.0.0.0"

#: 待支付订单有效期（秒）。
#:
#: **不是 120 秒。** 那个值来自「参考站一致」，但它只在模拟收银台上说得通：真实支付宝的
#: 二维码在渠道侧能活约 2 小时，本地订单 2 分钟就过期的话，顾客扫码稍慢就会变成
#: 「订单过期后才到账」的复活单 —— 每一笔都要人工核对库存与优惠码，而这本该是极少见的
#: 例外。默认取 900（15 分钟）：够顾客从容付款，又不会让库存被长期占着。
DEFAULT_ORDER_TTL_SECONDS = 900
#: 解除设备绑定冷却（与参考站一致：28800 秒 = 8 小时）
DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS = 28800
#: 签发租约的有效期；客户端默认 300 秒心跳一次。
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


#: ``_env_bool`` 接受的写法。**不再用「不在真值集合里就当假」**：部署时把
_ENV_TRUE = frozenset({"1", "true", "yes", "on", "y", "t"})
_ENV_FALSE = frozenset({"0", "false", "no", "off", "n", "f"})


def _read_secret_file(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    text = raw.strip().lower()
    if text in _ENV_TRUE:
        return True
    if text in _ENV_FALSE:
        return False
    raise ValueError(f"环境变量 {name} 需要布尔值（true/false/1/0/yes/no/on/off），实际是 {raw!r}")


def _env_int(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    """读一个整数环境变量。
    """
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    text = raw.strip()
    try:
        value = int(text)
    except ValueError as exc:
        raise ValueError(f"环境变量 {name} 需要整数，实际是 {raw!r}") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"环境变量 {name} 不能小于 {minimum}，实际是 {value}")
    if maximum is not None and value > maximum:
        raise ValueError(f"环境变量 {name} 不能大于 {maximum}，实际是 {value}")
    return value


def _env_float(
    name: str,
    default: float,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> float:
    """读一个浮点环境变量；错误处置与 :func:`_env_int` 一致。"""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    text = raw.strip()
    try:
        value = float(text)
    except ValueError as exc:
        raise ValueError(f"环境变量 {name} 需要数字，实际是 {raw!r}") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"环境变量 {name} 不能小于 {minimum}，实际是 {value}")
    if maximum is not None and value > maximum:
        raise ValueError(f"环境变量 {name} 不能大于 {maximum}，实际是 {value}")
    return value


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
    repo_root: Path = REPO_ROOT
    static_dir: Path = PROJECT_ROOT / "dist" / "static"
    templates_dir: Path = PROJECT_ROOT / "dist" / "templates"

    # 会话
    cookie_name: str = "ha_bridge_store_session"
    hint_cookie_name: str = "homeos_store_hint"
    #: HTTPS 部署时置 True；默认 False 不代表「只有显式开启才安全」——
    cookie_secure: bool = False
    #: 可信反向代理的 IP / CIDR 列表。为空表示不信任任何转发头，
    trusted_proxies: tuple[str, ...] = ()
    session_max_age_seconds: int = DEFAULT_SESSION_MAX_AGE_SECONDS

    #: 首次初始化（创建第一个管理员）的引导密钥。
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
    smtp_timeout_seconds: int = 15
    #: 发信失败后的重试次数。**只对瞬时故障重试**（连接被拒、超时、4xx），
    smtp_max_attempts: int = 3
    #: 重试之间的基础退避秒数（线性递增：1s、2s、3s…）
    smtp_retry_backoff_seconds: float = 1.0
    verification_ttl_seconds: int = DEFAULT_VERIFICATION_TTL_SECONDS
    verification_cooldown_seconds: int = DEFAULT_VERIFICATION_COOLDOWN_SECONDS
    #: 全站每小时的发信上限，兜住换 IP 的分布式滥用（按 IP 的那条是常量，
    verification_global_hourly_limit: int = 500

    # 支付
    payment_provider: str = ""
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

    # 微信支付（Native 扫码）
    wechat_mch_id: str = ""
    wechat_app_id: str = ""
    #: APIv3 密钥：**恰好 32 个字符**，用来解密回调资源（AES-256-GCM）。
    #: 它不是 API 证书、也不是商户号，而是在商户平台「API 安全」里自己设的那串。
    wechat_api_v3_key: str = ""
    #: 商户 API 私钥（apiclient_key.pem 的内容）：签名每个请求都用它。
    wechat_merchant_private_key: str = ""
    wechat_merchant_private_key_path: str = ""
    #: 商户 API 证书序列号：必须放进 Authorization 头。可从 apiclient_cert.pem 算出。
    wechat_merchant_serial_no: str = ""
    #: 微信支付公钥（或平台证书）：验回调签名用。
    wechat_platform_public_key: str = ""
    wechat_platform_public_key_path: str = ""
    #: 公钥 ID（用「微信支付公钥」模式时微信会回这个头，留空则不校验）。
    wechat_platform_public_key_id: str = ""
    #: 网关。一般不要改。
    wechat_gateway_url: str = "https://api.mch.weixin.qq.com"
    wechat_transaction_description: str = "HomeOS 授权"
    #: 可选：覆盖回调地址（内网穿透时它和 STORE_BASE_URL 往往不是同一个域名）。
    wechat_notify_url: str = ""

    # 授权签发（项目根 keys/local，与 data/ 对称；不放进 backend/src）
    license_keys_dir: Path = PROJECT_ROOT / "keys" / "local"
    #: 留空 = 按公钥文件派生 keyId（推荐，见 ``license_key_id`` 属性）；显式赋值时
    license_key_id_override: str = ""
    license_transport_key_id_override: str = ""
    lease_ttl_seconds: int = DEFAULT_LEASE_TTL_SECONDS
    heartbeat_interval_seconds: int = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    license_session_ip_hourly_limit: int = 3600

    # 订单 / 设备
    order_ttl_seconds: int = DEFAULT_ORDER_TTL_SECONDS
    device_release_cooldown_seconds: int = DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS
    #: 后台支付巡检间隔（秒），0 = 关闭。巡检补前端轮询覆盖不到的两件事：
    payment_sweep_interval_seconds: int = 30
    payment_sweep_batch: int = 25

    @property
    def database_path(self) -> Path:
        return self.data_dir / "store.db"

    @property
    def appearance_path(self) -> Path:
        """站点配色文件；删除该文件并重启即可回到设计系统默认配色。
        """
        return self.data_dir / "appearance.json"

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
    def previous_private_key_path(self) -> Path:
        """上一代签名私钥；存在即开启轮换重叠窗口。"""
        return license_keys.previous_path(self.private_key_path)

    @property
    def previous_public_key_path(self) -> Path:
        return license_keys.previous_path(self.public_key_path)

    @property
    def previous_transport_private_key_path(self) -> Path:
        return license_keys.previous_path(self.transport_private_key_path)

    @property
    def previous_transport_public_key_path(self) -> Path:
        return license_keys.previous_path(self.transport_public_key_path)

    @property
    def license_key_id(self) -> str:
        if self.license_key_id_override:
            return self.license_key_id_override
        return license_keys.key_id_from_public(self.public_key_path) if self.public_key_path.is_file() else ""

    @property
    def license_transport_key_id(self) -> str:
        if self.license_transport_key_id_override:
            return self.license_transport_key_id_override
        if not self.transport_public_key_path.is_file():
            return ""
        return license_keys.key_id_from_public(self.transport_public_key_path)

    @property
    def previous_key_paths(self) -> tuple[Path, Path, Path, Path] | None:
        """上一代四件套（签名/传输 × 公/私）；只要有一件缺失就返回 ``None``。
        """
        paths = (
            self.previous_private_key_path,
            self.previous_public_key_path,
            self.previous_transport_private_key_path,
            self.previous_transport_public_key_path,
        )
        if not all(path.is_file() for path in paths):
            return None
        return paths  # type: ignore[return-value]

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
        """
        if self.mail_mode != "smtp" or not self.smtp_host:
            return False
        if self.smtp_username and not self.smtp_password:
            return False
        return True

    @property
    def smtp_misconfigured(self) -> bool:
        return self.mail_mode == "smtp" and not self.smtp_ready

        # 支付宝密钥：优先读文件，其次用内联值
    @property
    def alipay_private_key_text(self) -> str:
        return _read_secret_file(self.alipay_app_private_key_path) or self.alipay_app_private_key

    @property
    def wechat_merchant_private_key_text(self) -> str:
        """商户 API 私钥：文件优先于内联值（PEM 是多行的，文件更不容易错）。"""
        return (
            _read_secret_file(self.wechat_merchant_private_key_path)
            or self.wechat_merchant_private_key
        )

    @property
    def wechat_platform_public_key_text(self) -> str:
        """微信支付公钥（或平台证书）：同样是文件优先。"""
        return (
            _read_secret_file(self.wechat_platform_public_key_path)
            or self.wechat_platform_public_key
        )

    @property
    def alipay_public_key_text(self) -> str:
        return _read_secret_file(self.alipay_public_key_path) or self.alipay_public_key


def load_settings(**overrides) -> StoreSettings:
    """从环境变量装配配置。``overrides`` 用于测试与 seed 脚本覆盖单字段。"""

    # 先吃 .env（真实环境变量优先），这样 SMTP 授权码等本地密钥不必写进代码或 shell
    load_dotenv()

    values = {
        "data_dir": _env_path("STORE_DATA_DIR", PROJECT_ROOT / "data"),
        "host": _env_str("STORE_HOST", DEFAULT_HOST) or DEFAULT_HOST,
        "port": _env_int("STORE_PORT", DEFAULT_PORT, minimum=1, maximum=65535),
        "base_url": _env_str("STORE_BASE_URL"),
        "cookie_name": _env_str("STORE_COOKIE_NAME", "ha_bridge_store_session") or "ha_bridge_store_session",
        "cookie_secure": _env_bool("STORE_COOKIE_SECURE"),
        "trusted_proxies": tuple(
            piece.strip()
            for piece in _env_str("STORE_TRUSTED_PROXIES").split(",")
            if piece.strip()
        ),
        "session_max_age_seconds": _env_int(
            "STORE_SESSION_MAX_AGE_SECONDS",
            DEFAULT_SESSION_MAX_AGE_SECONDS,
            minimum=60,
            maximum=365 * 24 * 3600,
        ),
        "setup_token": _env_str("STORE_SETUP_TOKEN", ""),
        "mail_mode": (_env_str("STORE_MAIL_MODE", "log") or "log").lower(),
        "mail_from": _env_str("STORE_MAIL_FROM", "HomeOS <no-reply@habridge.local>") or "HomeOS <no-reply@habridge.local>",
        "smtp_host": _env_str("STORE_SMTP_HOST"),
        "smtp_port": _env_int("STORE_SMTP_PORT", 465, minimum=1, maximum=65535),
        "smtp_username": _env_str("STORE_SMTP_USERNAME"),
        "smtp_password": _env_str("STORE_SMTP_PASSWORD"),
        "smtp_use_ssl": _env_bool("STORE_SMTP_USE_SSL", True),
        "smtp_starttls": _env_bool("STORE_SMTP_STARTTLS"),
        "smtp_timeout_seconds": _env_int("STORE_SMTP_TIMEOUT_SECONDS", 15, minimum=1, maximum=300),
        "smtp_max_attempts": _env_int("STORE_SMTP_MAX_ATTEMPTS", 3, minimum=1, maximum=10),
        "smtp_retry_backoff_seconds": _env_float(
            "STORE_SMTP_RETRY_BACKOFF_SECONDS", 1.0, minimum=0.0, maximum=60.0
        ),
        "verification_ttl_seconds": _env_int(
            "STORE_VERIFICATION_TTL_SECONDS",
            DEFAULT_VERIFICATION_TTL_SECONDS,
            minimum=60,
            maximum=24 * 3600,
        ),
        "verification_cooldown_seconds": _env_int(
            "STORE_VERIFICATION_COOLDOWN_SECONDS",
            DEFAULT_VERIFICATION_COOLDOWN_SECONDS,
            minimum=0,
            maximum=3600,
        ),
        "verification_global_hourly_limit": _env_int(
            "STORE_VERIFICATION_GLOBAL_HOURLY_LIMIT", 500, minimum=1, maximum=100_000
        ),

        "payment_provider": (_env_str("STORE_PAYMENT_PROVIDER", "") or "").lower(),
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
        "license_keys_dir": _env_path("STORE_LICENSE_KEYS_DIR", PROJECT_ROOT / "keys" / "local"),
        #: 留空 = 由公钥文件派生 keyId（见 ``license_key_id`` 属性）。
        "license_key_id_override": _env_str("STORE_LICENSE_KEY_ID"),
        "license_transport_key_id_override": _env_str("STORE_LICENSE_TRANSPORT_KEY_ID"),
        "lease_ttl_seconds": _env_int(
            "STORE_LEASE_TTL_SECONDS", DEFAULT_LEASE_TTL_SECONDS, minimum=60
        ),
        "heartbeat_interval_seconds": _env_int(
            "STORE_HEARTBEAT_INTERVAL_SECONDS",
            DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
            minimum=5,
            maximum=24 * 3600,
        ),
        "license_session_ip_hourly_limit": _env_int(
            "STORE_LICENSE_SESSION_IP_HOURLY_LIMIT",
            3600,
            minimum=60,
            maximum=100_000,
        ),
        "order_ttl_seconds": _env_int(
            "STORE_ORDER_TTL_SECONDS", DEFAULT_ORDER_TTL_SECONDS, minimum=30, maximum=24 * 3600
        ),
        "device_release_cooldown_seconds": _env_int(
            "STORE_DEVICE_RELEASE_COOLDOWN_SECONDS",
            DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS,
            minimum=0,
            maximum=30 * 24 * 3600,
        ),
        "payment_sweep_interval_seconds": _env_int(
            # 环境变量**不允许**把它设成 0：巡检是「通知丢了、钱却收了」那条链路唯一
            # 的兜底，关掉它的表现是服务一切正常、只是永远不再对账。代码内显式覆盖
            # （测试用）仍可传 0，见 _RANGED_FIELDS。
            "STORE_PAYMENT_SWEEP_INTERVAL_SECONDS", 30, minimum=5, maximum=3600
        ),
        "payment_sweep_batch": _env_int("STORE_PAYMENT_SWEEP_BATCH", 25, minimum=1, maximum=500),
    }
    values.update(overrides)
    settings = StoreSettings(**values)
    _validate_settings(settings)
    _warn_lease_revocation_bound(settings)
    _warn_order_ttl_against_qr(settings)
    return settings


#: 本机绑定地址。``0.0.0.0`` / ``::`` 是「监听所有网卡」，不算本机。
_LOOPBACK_BIND_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

#: ``(字段, 最小值, 最大值)``：环境变量那侧已经带了范围，这里再对**最终对象**做一遍，
_RANGED_FIELDS: tuple[tuple[str, float | None, float | None], ...] = (
    ("port", 1, 65535),
    ("smtp_port", 1, 65535),
    ("smtp_timeout_seconds", 1, 300),
    ("smtp_max_attempts", 1, 10),
    ("smtp_retry_backoff_seconds", 0, 60),
    ("session_max_age_seconds", 60, 365 * 24 * 3600),
    ("verification_ttl_seconds", 60, 24 * 3600),
    ("verification_cooldown_seconds", 0, 3600),
    ("verification_global_hourly_limit", 1, 100_000),
    ("lease_ttl_seconds", 60, None),
    ("heartbeat_interval_seconds", 5, 24 * 3600),
    ("license_session_ip_hourly_limit", 60, 100_000),
    ("order_ttl_seconds", 30, 24 * 3600),
    ("device_release_cooldown_seconds", 0, 30 * 24 * 3600),
    ("payment_sweep_interval_seconds", 0, 3600),
    ("payment_sweep_batch", 1, 500),
)


def _validate_settings(settings: StoreSettings) -> None:
    """启动即校验，配错就抛 —— 不静默纠正、不带着坏值继续跑。
    """
    for field, minimum, maximum in _RANGED_FIELDS:
        value = getattr(settings, field)
        if minimum is not None and value < minimum:
            raise ValueError(f"配置项 {field}={value!r} 小于允许的最小值 {minimum}")
        if maximum is not None and value > maximum:
            raise ValueError(f"配置项 {field}={value!r} 大于允许的最大值 {maximum}")

    floor = 2 * int(settings.heartbeat_interval_seconds)
    if int(settings.lease_ttl_seconds) < floor:
        raise ValueError(
            f"lease_ttl_seconds={settings.lease_ttl_seconds} 应至少是"
            f" heartbeat_interval_seconds={settings.heartbeat_interval_seconds} 的 2 倍"
            f"（≥{floor} 秒）：否则租约会在下一次心跳之前过期，客户端会反复进入"
            "「租约已过期」，看起来像网络正常但功能时有时无。"
        )
    _validate_verification_window_config(settings)
    _validate_rotation(settings)


def _validate_verification_window_config(settings: StoreSettings) -> None:
    """交叉校验验证码「有效期 / 重发冷却」。
    """
    ttl = int(settings.verification_ttl_seconds or 0)
    cooldown = int(settings.verification_cooldown_seconds or 0)
    if cooldown >= ttl:
        raise ValueError(
            f"verification_cooldown_seconds={cooldown} 必须小于"
            f" verification_ttl_seconds={ttl}：否则验证码过期后用户仍被冷却挡住，"
            "永远拿不到新码，注册与找回密码会被**永久**卡死（两个配置项单独看都合法）。"
        )


def _validate_rotation(settings: StoreSettings) -> None:
    """检查轮换重叠窗口的配置自洽性。
    """
    previous_paths = settings.previous_key_paths
    if previous_paths is None:
        return
    previous_public, previous_transport_public = previous_paths[1], previous_paths[3]
    active_transport_id = settings.license_transport_key_id
    previous_transport_id = license_keys.key_id_from_public(previous_transport_public)
    if active_transport_id and previous_transport_id == active_transport_id:
        raise ValueError(
            "轮换重叠窗口里的上一代传输公钥与当前公钥相同"
            f"（派生 keyId 都是 {previous_transport_id}）：这通常是直接把当前密钥"
            "复制成了 *.previous.pem。请删掉上一代四件套，或改用真正的前一代密钥 ——"
            "同 id 的两代密钥在密钥环里会直接冲突。"
        )
    logger.warning(
        "检测到上一代授权密钥（重叠窗口开启）：旧客户端仍可用 keyId=%s 验签，"
        "上一代签名 keyId=%s。要结束窗口请删除 store 密钥目录下的 *.previous.pem "
        "四件套 —— 删掉后旧客户端会立刻失效。",
        previous_transport_id,
        license_keys.key_id_from_public(previous_public),
    )



#: 支付宝二维码的渠道侧有效期是 2 小时（见 README「接入支付宝」）。本地订单 TTL
#: 远短于它时，用户完全可能「订单已过期才扫码付款」，于是每笔正常支付都要走一遍
#: 「复活单 → needs_review」的人工核对流程。低于这个值就在启动日志里点名。
ALIPAY_ORDER_TTL_FLOOR_SECONDS = 300


def _warn_order_ttl_against_qr(settings: StoreSettings) -> None:
    """支付宝收款下，订单 TTL 太短会给每一笔支付制造人工复核。
    """
    if (settings.payment_provider or "").strip().lower() != "alipay":
        return
    ttl = int(settings.order_ttl_seconds or 0)
    if ttl >= ALIPAY_ORDER_TTL_FLOOR_SECONDS:
        return
    logger.warning(
        "STORE_PAYMENT_PROVIDER=alipay 但 STORE_ORDER_TTL_SECONDS=%d（%d 秒）："
        "支付宝二维码在渠道侧可存活约 2 小时，而本地订单 %d 秒就过期 —— "
        "用户扫码稍慢就会变成「订单已过期后才到账」的复活单，"
        "每笔都要人工核对。建议设成 600~900 秒。",
        ttl,
        ttl,
        ttl,
    )


#: 租约 TTL 超过这个值时给启动告警：此时「吊销最慢多久生效」已经慢到不像话，
_LEASE_TTL_WARN_SECONDS = 7 * 24 * 3600


def _warn_lease_revocation_bound(settings: StoreSettings) -> None:
    """把「吊销生效上界」在启动日志里说清楚。
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
