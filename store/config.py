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
from store.licensing import keys as license_keys

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


#: ``_env_bool`` 接受的写法。**不再用「不在真值集合里就当假」**：部署时把
#: ``STORE_COOKIE_SECURE`` 敲成 ``ture`` 会让 Cookie 静默丢掉 ``Secure``，
#: ``STORE_ALLOW_MOCK_PAYMENTS`` 敲错则可能把模拟收银台留在线上 —— 这类拼错的
#: 唯一正确处置是启动即失败，而不是替运维猜。
_ENV_TRUE = frozenset({"1", "true", "yes", "on", "y", "t"})
_ENV_FALSE = frozenset({"0", "false", "no", "off", "n", "f"})


def _read_secret_file(path: str) -> str:
    """读取密钥文件内容；读不到就返回空串（由调用方回退到内联值）。"""
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

    解析失败**抛错，不回退默认值**。环境变量是部署时的输入，写错一个字符
    （``STORE_ORDER_TTL_SECONDS=12o``）过去会静默变成「按默认值跑」—— 那正是
    「改了配置但行为没变」这类事故的来源，而且日志里一个字都不会提。只有
    「未设置」与「空串」才用默认值。

    范围校验同理由这里做：调用方各自 ``max(1, ...)`` 兜底会把「配错了」变成
    「悄悄按别的值跑」，例如 ``STORE_ORDER_TTL_SECONDS=-1`` 生成的是
    「创建即过期」的订单 —— 用户看到的是下单就失败，运维看到的是一切正常。
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
    #: S14：全站每小时的发信上限，兜住换 IP 的分布式滥用（按 IP 的那条是常量，
    #: 见 ``store/api/store.py`` 的 ``_VERIFICATION_IP_LIMITER``）。做成可配置是因为
    #: 合理值随站点规模变化；触发时会打 error 级日志提示运营调高。
    verification_global_hourly_limit: int = 500
    #: 仅当 mail_mode=echo 时，接口才回显验证码明文（本地联调用）
    expose_verification_code: bool = False
    #: 是否公开 ``/store-api-docs``（S26）。默认**关闭**：那两个页面会把全部商店与
    #: 后台端点、参数结构、鉴权方式一次性列给任何人 —— 等于给攻击者一份现成的目录。
    #: 本地联调时用 STORE_EXPOSE_API_DOCS=1 打开。
    expose_api_docs: bool = False

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
    #: 注意：仓库根的 keys/ 是客户端默认读取的公钥镜像（由 start.py / 容器启动自动同步），私钥留在服务自己的目录
    license_keys_dir: Path = STORE_ROOT / "keys" / "local"
    #: 留空 = 按公钥文件派生 keyId（推荐，见 ``license_key_id`` 属性）；显式赋值
    #: 仍然生效，但那时轮换要服务端与客户端同步改名 —— 静态名字不会随密钥变，
    #: 重新生成密钥后客户端只会看到「指纹不匹配」（见 ``keys.key_id_from_public``）。
    #: 字段名带 ``_override`` 是为了让下面那个同名属性成为唯一入口：读到
    #: ``settings.license_key_id`` 的人拿到的永远是**实际生效**的 id。
    license_key_id_override: str = ""
    license_transport_key_id_override: str = ""
    lease_ttl_seconds: int = DEFAULT_LEASE_TTL_SECONDS
    heartbeat_interval_seconds: int = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    #: ``/v2/heartbeat`` 与 ``/v2/recover`` 的**来源 IP** 小时配额（见 ``store/api/license.py``）。
    #:
    #: 比 ``/v2/activate`` 那个固定的 60/小时宽得多，理由是这类流量「不可枚举但很常态」：
    #: 收的是高熵会话 / 恢复令牌（猜不出来），却同时来自后台心跳与「授权页开着时的状态
    #: 轮询」。而且额度是**按出口地址**算的，真实部署里多台设备共用同一个 NAT 出口时
    #: 会叠加 —— 出问题时症状是「授权页卡住、日志里一片 429」，调大它即可，不必改代码。
    license_session_ip_hourly_limit: int = 3600

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
        """实际写进租约的签名 keyId：显式配置优先，否则由公钥文件派生。

        派生而不是给个默认字符串，是为了让「换密钥」在协议上可见：同名的静态
        id 配上客户端那张指纹表，轮换后新密钥会被报成「指纹不匹配」。
        公钥文件缺失时退回显式值/空串，把失败留给真正加载密钥的那一步报，
        而不是在这里编一个谁也对不上的 id。
        """
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

        四件必须齐全：只留了公钥没有私钥，服务端既解不开旧客户端的请求、也签不出
        旧客户端认的租约，留着只会让人误以为窗口开着。
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
        "expose_verification_code": _env_bool("STORE_EXPOSE_VERIFICATION_CODE"),
        "expose_api_docs": _env_bool("STORE_EXPOSE_API_DOCS"),
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
        #: 留空 = 由公钥文件派生 keyId（见 ``license_key_id`` 属性）。
        #: 不再给静态默认值：静态名字在轮换后不变，客户端会把新公钥报成指纹不匹配。
        "license_key_id_override": _env_str("STORE_LICENSE_KEY_ID"),
        "license_transport_key_id_override": _env_str("STORE_LICENSE_TRANSPORT_KEY_ID"),
        #: 没有上界：调大是**合法的可用性取舍**（见 ``_warn_lease_revocation_bound``），
        #: 只在启动时把「吊销生效上界」的代价打进日志。下界与心跳频率的交叉校验见
        #: ``_validate_settings``。
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
            "STORE_PAYMENT_SWEEP_INTERVAL_SECONDS", 30, minimum=0, maximum=3600
        ),
        "payment_sweep_batch": _env_int("STORE_PAYMENT_SWEEP_BATCH", 25, minimum=1, maximum=500),
    }
    values.update(overrides)
    settings = StoreSettings(**values)
    _validate_settings(settings)
    _warn_insecure_verification_exposure(settings)
    _warn_lease_revocation_bound(settings)
    return settings


#: 本机绑定地址。``0.0.0.0`` / ``::`` 是「监听所有网卡」，不算本机。
_LOOPBACK_BIND_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

#: ``(字段, 最小值, 最大值)``：环境变量那侧已经带了范围，这里再对**最终对象**做一遍，
#: 因为 ``load_settings(**overrides)`` 是绕过 ``_env_int`` 的（程序化构造走这条路），
#: 而「负数 TTL」这种配置的后果与来源无关。
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

    两类问题：

    1. **单字段越界**（``_RANGED_FIELDS``）。典型是 ``order_ttl_seconds`` 为负或 0：
       订单 ``expires_at`` 就等于创建时间，用户看到的是「一下单就过期」，而下单
       接口本身返回 200，日志里没有一处异常 —— 只能靠人对着配置猜。
    2. **跨字段矛盾**：租约 TTL 必须明显大于心跳间隔。否则一个心跳稍有延迟的健康
       客户端，会在两次心跳之间就把租约耗到 ``LEASE_EXPIRED``、收回编辑器功能 ——
       表现为「网络看着好好的，功能却一阵阵消失」，而两个配置项单独看都合法。
       取 2 倍心跳作为下界：至少要能容忍**漏掉一次**心跳。
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
    _validate_rotation(settings)


def _validate_rotation(settings: StoreSettings) -> None:
    """检查轮换重叠窗口的配置自洽性（S52）。

    上一代密钥四件套齐全时窗口就是开着的，这里只拦「开了但没用」的组合：

    * 显式 keyId 且上一代派生出**同一个** id —— 比如把当前密钥直接复制成
      ``*.previous.pem``，或者（更常见）两边都用静态 ``STORE_LICENSE_KEY_ID``。
      此时 ``KeyRegistry`` 会因 id 重复直接拒绝启动，与其等到构建密钥环时才炸，
      不如在这里说清楚原因。
    * 上一代存在但显式配置只改了其中一个 id：不影响启动，但会在日志里点明
      「旧客户端仍按上一代 id 验签」，省得运维以为换了 id 就等于吊销了旧客户端。
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


def _warn_insecure_verification_exposure(settings: StoreSettings) -> None:
    """验证码回显 + 非本机绑定 → 大声告警。

    回显（``mail_mode=echo`` 或 ``STORE_EXPOSE_VERIFICATION_CODE``）是本地联调用的，
    一旦部署同时监听非本机网卡，就必须确认访问者真的到不了这个进程：请求侧只对
    能确定来自本机的来源回显（见 ``store/api/store.py:_is_loopback_client``），
    但如果前面挂了**同机反代且没配** ``STORE_TRUSTED_PROXIES``，每个外部请求的对端
    都是 127.0.0.1，请求侧就无从区分了 —— 那正是这里要提醒的场景。

    刻意只告警不抛错：docker 默认是 ``STORE_HOST=0.0.0.0``，而本地联调（含进程内调用，
    没有真实网络对端）本来就要靠 echo。硬失败会把「本机联调」这一合法用法一起挡掉，
    而它恰恰是 echo 存在的理由。
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
