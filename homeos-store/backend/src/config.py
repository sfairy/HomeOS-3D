"""授权商店服务的运行配置。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .core.env import load_dotenv
from .licensing import keys as license_keys

logger = logging.getLogger("src.config")

STORE_ROOT = Path(__file__).resolve().parent


def _detect_project_root() -> Path:
    """源码布局 ``homeos-store/backend/src`` 或镜像布局 ``/app/app``。"""
    candidate_src = STORE_ROOT.parents[1]
    candidate_docker = STORE_ROOT.parent
    if (candidate_src / 'frontend').is_dir() or (candidate_src / 'backend').is_dir():
        return candidate_src
    if (candidate_docker / 'dist').is_dir() or (candidate_docker / 'app').is_dir():
        return candidate_docker
    return candidate_src


PROJECT_ROOT = _detect_project_root()
REPO_ROOT = (
    PROJECT_ROOT.parent
    if (PROJECT_ROOT.parent / "homeos-3d").is_dir()
    else PROJECT_ROOT
)


def _detect_frontend_root() -> Path:
    """前端构建产物根目录（内含 ``static/`` 与 ``templates/``）。

    容器布局：Dockerfile 把 ``dist/homeos-store/frontend`` 拷进 ``/app/dist``。
    工作区布局：构建产物统一收敛在工作区根 ``dist/homeos-store/frontend``，
    与源码树彻底分离（见 ops/build.py 与 frontend/vite.config.ts 的 outDir）。
    """
    docker_dist = PROJECT_ROOT / "dist"
    if docker_dist.is_dir():
        return docker_dist
    workspace_built = REPO_ROOT / "dist" / "homeos-store" / "frontend"
    if workspace_built.is_dir():
        return workspace_built
    return docker_dist


FRONTEND_ROOT = _detect_frontend_root()

DEFAULT_PORT = 8802
DEFAULT_HOST = "0.0.0.0"

DEFAULT_ORDER_TTL_SECONDS = 900
DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS = 28800
DEFAULT_LEASE_TTL_SECONDS = 72 * 3600
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 300
DEFAULT_VERIFICATION_TTL_SECONDS = 600
DEFAULT_VERIFICATION_COOLDOWN_SECONDS = 60
DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600


def _env_str(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return default if value is None else value.strip()


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
    static_dir: Path = FRONTEND_ROOT / "static"
    templates_dir: Path = FRONTEND_ROOT / "templates"

    cookie_name: str = "homeos_store_session"
    hint_cookie_name: str = "homeos_store_hint"
    cookie_secure: bool = False
    trusted_proxies: tuple[str, ...] = ()
    session_max_age_seconds: int = DEFAULT_SESSION_MAX_AGE_SECONDS

    setup_token: str = ""

    mail_mode: str = "log"
    mail_from: str = "HomeOS <no-reply@homeos.local>"
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_ssl: bool = True
    smtp_starttls: bool = False
    smtp_timeout_seconds: int = 15
    smtp_max_attempts: int = 3
    smtp_retry_backoff_seconds: float = 1.0
    verification_ttl_seconds: int = DEFAULT_VERIFICATION_TTL_SECONDS
    verification_cooldown_seconds: int = DEFAULT_VERIFICATION_COOLDOWN_SECONDS
    verification_global_hourly_limit: int = 500

    payment_provider: str = ""
    alipay_app_id: str = ""
    alipay_gateway_url: str = "https://openapi.alipay.com/gateway.do"
    alipay_app_private_key: str = ""
    alipay_public_key: str = ""
    alipay_transaction_description: str = "HomeOS 授权"
    alipay_app_private_key_path: str = ""
    alipay_public_key_path: str = ""
    alipay_seller_id: str = ""
    alipay_notify_url: str = ""
    alipay_return_url: str = ""
    alipay_sign_type: str = "RSA2"
    alipay_verify_response_sign: bool = True

    wechat_mch_id: str = ""
    wechat_app_id: str = ""
    wechat_api_v3_key: str = ""
    wechat_merchant_private_key: str = ""
    wechat_merchant_private_key_path: str = ""
    wechat_merchant_serial_no: str = ""
    wechat_platform_public_key: str = ""
    wechat_platform_public_key_path: str = ""
    wechat_platform_public_key_id: str = ""
    wechat_gateway_url: str = "https://api.mch.weixin.qq.com"
    wechat_transaction_description: str = "HomeOS 授权"
    wechat_notify_url: str = ""

    license_keys_dir: Path = PROJECT_ROOT / "keys" / "local"
    license_key_id_override: str = ""
    license_transport_key_id_override: str = ""
    lease_ttl_seconds: int = DEFAULT_LEASE_TTL_SECONDS
    heartbeat_interval_seconds: int = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    license_session_ip_hourly_limit: int = 3600

    order_ttl_seconds: int = DEFAULT_ORDER_TTL_SECONDS
    device_release_cooldown_seconds: int = DEFAULT_DEVICE_RELEASE_COOLDOWN_SECONDS
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
        return not (self.smtp_username and not self.smtp_password)

    @property
    def smtp_misconfigured(self) -> bool:
        return self.mail_mode == "smtp" and not self.smtp_ready

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

    load_dotenv()

    values: dict[str, Any] = {
        "data_dir": _env_path("STORE_DATA_DIR", PROJECT_ROOT / "data"),
        "host": _env_str("STORE_HOST", DEFAULT_HOST) or DEFAULT_HOST,
        "port": _env_int("STORE_PORT", DEFAULT_PORT, minimum=1, maximum=65535),
        "base_url": _env_str("STORE_BASE_URL"),
        "cookie_name": _env_str("STORE_COOKIE_NAME", "homeos_store_session") or "homeos_store_session",
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
        "mail_from": _env_str("STORE_MAIL_FROM", "HomeOS <no-reply@homeos.local>") or "HomeOS <no-reply@homeos.local>",
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


_LOOPBACK_BIND_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

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
