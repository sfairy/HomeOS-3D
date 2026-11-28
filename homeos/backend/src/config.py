"""运行期配置：常量默认值、环境变量解析与路径推导。

本模块只做「读环境变量 → 拼出不可变 Settings 对象」，不建立目录、不连数据库。

数据库为 **SQLite**（WAL）；``HOMEOS_DATABASE_URL`` 仅在测试时覆盖为内存库。
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

_logger = logging.getLogger(__name__)

#: 本包目录：源码是 ``homeos/backend/src``，镜像是 ``/app/app``
#: （构建期把源码目录 ``src`` 映射成 ``app``，见根 Dockerfile）。
_PACKAGE_ROOT = Path(__file__).resolve().parent

#: 项目根 —— 「拥有本包的那一层」：源码 ``homeos/backend``、镜像 ``/app``。
#: 两个后端都走 ``.../src → ./app`` 的同一条映射，所以下面三行在源码 / 镜像两种布局下
#: 口径一致，无需按布局分支探测 —— 这正是「产物层数统一」换来的好处。
PROJECT_ROOT = _PACKAGE_ROOT.parent
#: 仓库根：源码 ``homeos``；镜像里退化为 ``/``（镜像内没有仓库概念，相关路径均有 env 覆盖）。
REPO_ROOT = PROJECT_ROOT.parent
#: monorepo 工作区根（``homeos/`` 的上一级）。前端产物统一收敛在
#: ``<workspace>/dist/homeos/frontend``，与 homeos-store 同级，便于 ops/ 统一打包。
WORKSPACE_ROOT = REPO_ROOT.parent


DEFAULT_DATA_DIRNAME = "data"


def resolve_data_dir() -> Path:
    """运行期数据目录的**唯一**解析口径（``HOMEOS_DATA_DIR`` > 项目根下 ``data``）。

    为什么要有这个函数：同一条回退链此前在 ``load_settings`` 与可观测性（磁盘余量指标）
    里各写了一遍，而两处的兜底值**并不相同** —— 后者回落到 ``"."``（进程 cwd），于是
    「数据盘剩余空间」指标量的其实是启动目录。统一到这里之后，指标与真实数据目录一致。
    """
    configured = (os.getenv("HOMEOS_DATA_DIR") or "").strip()
    return Path(configured or PROJECT_ROOT.parent / DEFAULT_DATA_DIRNAME).expanduser().resolve()


def _environment_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "on", "yes", "true"}


def _environment_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    """读一个带上下界的整数环境变量；缺省 / 非法一律回落到 ``default``（并夹到区间内）。"""
    raw = os.getenv(name)
    try:
        value = int(str(raw).strip()) if raw is not None and str(raw).strip() else default
    except (TypeError, ValueError):  # fmt: skip
        _logger.warning("环境变量 %s 不是整数（%r），按默认值 %s 处理", name, raw, default)
        value = default
    return min(max(value, minimum), maximum)


#: 生产环境标记的**唯一真源**：``APP_ENVIRONMENT``。
#: 两个后端、容器启动器、部署脚本与门禁都读这一个函数，不再各写一份字符串比较。
PRODUCTION_ENV_VALUES = {"production", "prod"}


def environment_is_production() -> bool:
    """当前进程是否按生产口径运行（``APP_ENVIRONMENT`` ∈ production / prod）。"""
    return environment_is_production_from(os.environ)


def environment_is_production_from(source: Mapping[str, str]) -> bool:
    """``environment_is_production`` 的映射版：供持有自定义 env 映射的调用方复用同一口径。"""
    explicit = str(source.get("APP_ENVIRONMENT", "") or "").strip().lower()
    return explicit in PRODUCTION_ENV_VALUES


def _environment_path(name: str) -> Path | None:
    value = os.getenv(name, "").strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_csv(name: str) -> tuple[str, ...]:
    value = os.getenv(name, "").strip()
    if not value:
        return ()
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


def _environment_non_negative_float(name: str, default: float) -> float:
    """读一个非负浮点环境变量；缺省 / 非法 / 负数一律回落到 ``default``。"""
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


def _environment_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    """读一个带上下界的浮点环境变量；缺省 / 非法一律回落到 ``default``（并夹到区间内）。

    与 :func:`_environment_int` 同一口径：环境变量拼错时服务必须能起来并留下告警，
    而不是在导入期抛 ``ValueError``（那种报错里连变量名都不出现，现场无从排查）。
    """
    raw = os.getenv(name)
    try:
        value = float(str(raw).strip()) if raw is not None and str(raw).strip() else default
    except (TypeError, ValueError):  # fmt: skip
        _logger.warning("环境变量 %s 不是数字（%r），按默认值 %s 处理", name, raw, default)
        value = default
    return min(max(value, minimum), maximum)


def _valid_public_origin(value: str) -> bool:
    """一个「额外公开来源」是否合法（完整 ``scheme://host:port``，无路径/凭据/列表）。

    刻意与 :func:`platform.security.request_origin.parse_origin` 同口径而**不**在这里导入它：
    ``config`` 属于只许用标准库的 base 层（后端分层约定），
    导入 platform 会把配置层拖进请求层。两处必须保持同一套解析口径。
    """
    from ipaddress import ip_address
    from urllib.parse import urlsplit

    if not value or "," in value or "\\" in value:
        return False
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    if parsed.path or parsed.query or parsed.fragment:
        return False
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False
    try:
        ip_address(host)
    except ValueError:
        # 不是 IP：按域名字符集校验（IDNA 压缩后的形态）。
        _logger.debug("公开来源主机名不是 IP，按域名字符集校验：%r", host)
        return all(character in "abcdefghijklmnopqrstuvwxyz0123456789-." for character in host)
    return True


def _validated_public_origins() -> tuple[str, ...]:
    """解析并校验 ``APP_ADDITIONAL_PUBLIC_ORIGINS``（逗号分隔的完整来源列表）。

    校验放在启动期而不是首次请求：写错的来源如果在请求时才拒绝，表现是「这个入口
    偶尔 403」，而正确做法是**启动就失败**并给出中文原因。
    """
    values = _environment_csv("APP_ADDITIONAL_PUBLIC_ORIGINS")
    if not values:
        return ()
    if any(not _valid_public_origin(item) for item in values):
        raise ValueError("APP_ADDITIONAL_PUBLIC_ORIGINS 必须为完整 HTTP/HTTPS 来源，包含实际端口且不带路径。")
    return values


#: 服务器全量备份包目录名（Nest 约定：仓库根 ``backups/``）。
BACKUP_DIR_NAME = "backups"
#: 运行目录落在这些名字下时视为「在仓库内运行」，备份目录取其上一级（仓库根）。
BACKEND_DIR_NAMES = frozenset({"backend"})


# ---- 授权服务常量 ----
# 公钥指纹只作兜底：ops/license_keys.py 在容器启动期按**实际公钥文件字节**注入
# APP_LICENSE_PUBLIC_KEY_SHA256 / APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
# （商店首次启动随机生成密钥对，写死常量必然对不上，自检只会报「指纹不匹配」）。
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = "b991c5f7cca311df51edb1fd6568de53a136eac22dcc2e07a87b3f86e9738035"
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = "0a44cfca97901b69786c24c54658f30ea8228db557460ccc557a4c38183480ce"
DEFAULT_LICENSE_SERVER_URL = "http://127.0.0.1:8802"
DEFAULT_LICENSE_KEY_ID = "hb-local-2026"
DEFAULT_LICENSE_TRANSPORT_KEY_ID = "hb-local-transport-2026"
SIGNING_PUBLIC_KEY_FILENAME = "license-public.pem"
TRANSPORT_PUBLIC_KEY_FILENAME = "license-transport-public.pem"


def _derive_key_id(public_key_path: Path) -> str | None:
    """由公钥文件字节派生 keyId（``hb-<sha256 前 16 位>``），口径与商店侧一致。"""
    try:
        payload = public_key_path.read_bytes()
    except OSError:
        return None
    return f"hb-{hashlib.sha256(payload).hexdigest()[:16]}"


def _environment_batches(name: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    """``批次=url1|url2;批次2=url3`` 形式的授权服务器批次；留空返回空元组。"""
    value = os.getenv(name, "").strip()
    if not value:
        return ()
    groups: list[tuple[str, tuple[str, ...]]] = []
    for chunk in value.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        label, _, servers = chunk.partition("=")
        label = label.strip() or "direct"
        items = tuple(item.strip().rstrip("/") for item in servers.split("|") if item.strip())
        groups.append((label, items))
    return tuple(groups)


def _license_required_from_env() -> bool:
    """是否启用商业授权门禁。

    ``LICENSE_REQUIRED`` 显式取值优先；未设置时按生产环境标记默认开启
    （见 ``environment_is_production``），其它环境默认关闭（开发态不强制激活）。
    """
    raw = os.getenv("LICENSE_REQUIRED")
    if raw is not None:
        return _environment_bool("LICENSE_REQUIRED", default=False)
    return environment_is_production()


#: 实时连接（``/ws/runtime``）授权复检结果的缓存窗口（秒）。
#: 稳态下出站帧命中缓存、不再查库；真正的吊销收敛延迟 = 该窗口 + 周期复检间隔。
DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS = 30.0


@dataclass(frozen=True)
class Settings:
    """不可变运行期配置。"""

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 授权 / 联网商店
    #: 商店的**浏览器入口**地址（``APP_STORE_URL``）：登录页「忘记密码 / 商店」、注册页与
    #: 激活页的购买入口都用它。两份 compose 默认写死公网商店域名（与 ``STORE_BASE_URL``
    #: 同域），保证这些跳转一律走公网、不落到内网地址。留空 = 由 ``/public/config`` 向商店
    #: 问回它的对外地址：商店声明了 ``STORE_BASE_URL`` 时声明优先，没声明才修正浏览器解析
    #: 不了的主机名（同机部署的容器服务名 → 浏览器正在用的宿主 / 域名，见
    #: ``domains/store/discovery.py``）。
    store_url: str = ""
    # 认证
    jwt_secret: str = ""
    jwt_expires_in_seconds: int = 86400
    #: DB 会话（``sessions`` 表 / ``auth_token`` Cookie）的最长存活时间。与 JWT 通道分离：
    #: JWT 只用于短时效的一次性场景，浏览器登录会话默认 30 天并滑动续期。
    session_max_age_seconds: int = 30 * 24 * 60 * 60
    #: 数据库迁移模式：auto（默认）/ check（只检测，有待执行迁移即启动失败）/ off（仅紧急逃生）。
    schema_mode: str = "auto"
    #: 慢查询阈值（毫秒）：单条 SQL 超过它就计一次并打一条 WARNING。见
    #: ``platform/core/runtime/observability``；设为 1 等于记录所有语句耗时。
    slow_db_query_ms: int = 100
    #: 会话令牌 Cookie（homeos-3d 原生口径：``sessions`` 表的不透明令牌）。
    cookie_name: str = "auth_token"
    csrf_cookie_name: str = "csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    # 基础设施
    metrics_token: str = ""
    is_production: bool = False
    # 接入层
    allowed_origins: tuple[str, ...] = ()
    #: 「额外公开访问来源」（``APP_ADDITIONAL_PUBLIC_ORIGINS``）：一台机器同时被多个反向
    #: 代理地址访问时，除 ``APP_BASE_URL`` 之外的其余入口。必须是**完整来源**
    #: （``scheme://host:port``，带实际端口、不带路径），启动时逐项校验，写错即启动失败。
    additional_public_origins: tuple[str, ...] = ()
    #: 可信反向代理网段（``APP_TRUSTED_PROXIES``，IP 或 CIDR，逗号分隔）。
    #: **唯一消费者**是 ``platform/security/client_address.py``：只有当 TCP 对端落在这些网段内，
    #: 才采信 ``X-Forwarded-For``。留空 = 不信任任何代理 = 转发头一律忽略（安全默认）。
    #: 镜像内置反代就在同容器回环上，故发行默认 ``127.0.0.1,::1``（见 ``load_settings``）。
    trusted_proxies: tuple[str, ...] = ()
    public_body_limit_bytes: int = 1 * 1024 * 1024
    authenticated_body_limit_bytes: int = 50 * 1024 * 1024
    # HA
    ha_request_timeout_seconds: float = 10.0
    ha_websocket_max_size_bytes: int = 67108864
    ha_reconcile_interval_seconds: int = 1800
    #: 实时连接（``/ws/runtime``）出站帧复用授权复检结果的秒数。0 = 逐帧权威复检（旧行为）。
    runtime_access_cache_seconds: float = DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
    credential_key_path_override: Path | None = None
    # 部署对外基地址（反代场景）：来源校验与绝对链接拼接用。
    app_base_url: str = ""
    # 授权服务
    license_required: bool = False
    #: 租约过期后是否仍放行「设备控制 + 实时通道」（只降级编辑类能力）。
    #:
    #: 产品定位是「本机中控」：家里断网 / 商店不可达导致租约过期时，把灯控一起停掉
    #: 会让用户觉得整台设备坏了。开启后过期只禁止改配置 / 改布局 / 管理账号，
    #: 已购能力码的设备控制与实时状态继续可用；超出 ``license_expired_grace_days``
    #: 才整体停用。商业侧如需严格按月执行，把它设为 false。
    license_expired_grace: bool = True
    #: 上述宽限窗口（天）。超过它视同未授权（``LEASE_EXPIRED`` 全量拦截）。
    license_expired_grace_days: int = 90
    license_server_url: str = DEFAULT_LICENSE_SERVER_URL
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = ()
    license_request_timeout_seconds: float = 10.0
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    license_key_id_override: str = ""
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    license_transport_key_id_override: str = ""
    hardware_machine_id_override: str = ""
    hardware_board_id_override: str = ""
    license_secret_key_path_override: Path | None = None
    # 主应用读取授权公钥的目录（ops/license_keys.py 的 APP_CLIENT_KEYS_DIR）。
    client_keys_dir_override: Path | None = None
    # 静态资源
    frontend_dir_override: Path | None = None
    extra: dict[str, str] = field(default_factory=dict)

    # ---- 派生路径 ----
    def _sqlite_file_override(self) -> Path | None:
        """``HOMEOS_DATABASE_URL`` 指向 sqlite 文件时返回其路径（测试/多实例用）。"""
        override = os.getenv("HOMEOS_DATABASE_URL", "").strip()
        if not override.startswith("sqlite:///"):
            return None
        raw = override[len("sqlite:///") :]
        if not raw or raw == ":memory:":
            return None
        return Path(raw)

    @property
    def database_path(self) -> Path:
        override = self._sqlite_file_override()
        if override is not None:
            return override
        return self.data_dir / "homeos.db"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"

    @property
    def log_database_path(self) -> Path:
        """日志 / 观测量库（``homeos-logs.db``）。

        与业务库**分文件**：日志洪峰与大删除不再和业务写入抢同一把锁、同一次 checkpoint
        （见 ``platform/core/db/log_database``）。刻意不跟 ``HOMEOS_DATABASE_URL`` 走：
        那个覆盖是给「把主库放到别的盘」用的，日志库始终跟数据目录一起，备份口径也依赖
        这一点（它整体不进备份）。
        """
        return self.data_dir / "homeos-logs.db"

    @property
    def log_database_url(self) -> str:
        return f"sqlite:///{self.log_database_path}"

    @property
    def secrets_dir(self) -> Path:
        return self.data_dir / "secrets"

    @property
    def credential_key_path(self) -> Path:
        """HA access token 落库加密密钥（与数据库分离）。"""
        return self.credential_key_path_override or self.secrets_dir / "ha_credentials.key"

    @property
    def user_assets_dir(self) -> Path:
        return self.data_dir / "assets"

    @property
    def fonts_dir(self) -> Path:
        """用户上传的仪表盘字体（内置字体在 ``assets-default/fonts``，只读）。"""
        return self.data_dir / "fonts"

    @property
    def studio3d_dir(self) -> Path:
        return self.data_dir / "studio3d"

    @property
    def studio3d_draft_path(self) -> Path:
        return self.studio3d_dir / "draft.json"

    @property
    def studio3d_exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def interaction3d_modules_dir(self) -> Path:
        """3D 交互运行期数据根（``data/modules/interaction3d``）。

        与后端**代码**模块无关：这里是「按需下发 / 缓存 / 场景快照」的数据目录，
        备份口径按子目录分别登记（见 ``domains/backup/scope.py``）。
        """
        return self.data_dir / "modules" / "interaction3d"

    @property
    def studio3d_models_dir(self) -> Path:
        """用户上传的静态 GLB 装饰（「我的装饰」）。

        与 ``studio3d_dir``（草稿 JSON）分开：模型是二进制资产，体积与生命周期都不同；
        删除走墓碑（``.deleted-<id>``）而不是直接 unlink，避免「场景还引用着被删的模型」。
        """
        return self.interaction3d_modules_dir / "models"

    @property
    def display_images_cache_dir(self) -> Path:
        """按显示尺寸派生的图片缓存（``displaySize`` / ``displayCrop``）。

        位于 ``modules/interaction3d/`` 下但**不进备份**（``EXCLUDED_REL_PREFIXES``）：
        可按需重算，进包只会让备份凭空多出上百 MB。
        """
        return self.interaction3d_modules_dir / "display-images"

    @property
    def effect_variants_dir(self) -> Path:
        return self.data_dir / "cache" / "effect-variants"

    @property
    def ui_assets_dir(self) -> Path:
        """用户可写的 UI 静态资源根（背景图上传层）。

        与随包发布的默认素材树（``builtin_assets_dir`` 旁的 ``assets/backgrounds``）
        分开：上传 / 删除只作用于这一层，随包目录保持只读，
        避免「用户覆盖了默认图，升级后又被镜像内容回滚」和「删目录连带删掉默认素材」。
        """
        return self.data_dir / "ui-assets"

    @property
    def backups_dir_override(self) -> Path | None:
        """服务器全量备份包目录的显式覆盖（``HOMEOS_BACKUPS_DIR``）。

        默认走 Nest 约定（运行目录的 ``backups/``，即源码态仓库根）。容器里 ``/app`` 不是
        数据卷，重建即丢，故镜像设 ``HOMEOS_BACKUPS_DIR=/data/backups`` 落到持久卷。
        """
        return _environment_path("HOMEOS_BACKUPS_DIR")

    @property
    def backups_dir(self) -> Path:
        """服务器全量备份包目录（**唯一权威**）。

        显式覆盖优先；否则 Nest 约定：运行目录是后端子目录时取仓库根，其余取当前目录，
        再拼 ``backups/``。

        这个目录可能落在 ``data_dir`` **内部**（容器里就是 ``/data/backups``），所以收集
        待备份数据文件与恢复数据目录两侧都必须以本属性为准把它排除。否则：备份会把所有
        旧备份包连同正在写入的自己一起装进新包（体积逐次翻倍，直到磁盘最紧的时刻备份
        功能彻底失效），恢复则会把当前的备份目录整块挪走 —— 那正是它自己的工作目录。
        """
        override = self.backups_dir_override
        if override is not None:
            return Path(override)
        cwd = Path.cwd()
        base = cwd.parent if cwd.name in BACKEND_DIR_NAMES else cwd
        return base / BACKUP_DIR_NAME

    @property
    def built_in_assets_dir(self) -> Path:
        """内置素材目录（``/assets/builtin/**`` 的来源）。

        源码态是 ``backend/image``；发行产物里代码位于 ``/app/app``，镜像内该目录
        被显式指到 ``/app/image``（``HOMEOS_IMAGE_DIR``，与 homeos-3d 的挂载点一致，便于
        部署方另行挂载增删）。
        """
        override = _environment_path("HOMEOS_IMAGE_DIR")
        if override is not None:
            return override
        return self.project_root / "image"

    @property
    def public_static_manifest_path(self) -> Path:
        return self.frontend_dir / "public-static.json"

    @property
    def runtime_dir(self) -> Path:
        return self.frontend_dir / "modules" / "runtime"

    @property
    def runtime_manifest_path(self) -> Path:
        return self.runtime_dir / "manifest.json"

    # ---- 授权服务派生路径（口径对齐 homeos-3d Settings）----
    @property
    def license_secret_key_path(self) -> Path:
        """落库凭证的 Fernet 密钥（0600，与数据库分离）。"""
        return self.license_secret_key_path_override or self.secrets_dir / "license_credentials.key"

    @property
    def instance_id_path(self) -> Path:
        return self.data_dir / "instance-id"

    @property
    def hardware_fallback_id_path(self) -> Path:
        return self.data_dir / "hardware-fallback-id"

    def _keys_dir(self) -> Path:
        """授权公钥目录：显式覆盖 > APP_CLIENT_KEYS_DIR > backend/keys/client > backend/keys > 工作区根 keys/（monorepo 根）。"""
        if self.client_keys_dir_override is not None:
            return self.client_keys_dir_override
        local = self.project_root / "keys" / "client"
        if local.is_dir():
            return local
        bare = self.project_root / "keys"
        if bare.is_dir():
            return bare
        shared = WORKSPACE_ROOT / "keys"
        return shared if shared.is_dir() else local

    @property
    def license_public_key_path(self) -> Path:
        return self.license_public_key_path_override or self._keys_dir() / SIGNING_PUBLIC_KEY_FILENAME

    @property
    def license_transport_public_key_path(self) -> Path:
        return self.license_transport_public_key_path_override or self._keys_dir() / TRANSPORT_PUBLIC_KEY_FILENAME

    @property
    def license_key_id(self) -> str:
        if self.license_key_id_override:
            return self.license_key_id_override
        return _derive_key_id(self.license_public_key_path) or DEFAULT_LICENSE_KEY_ID

    @property
    def license_transport_key_id(self) -> str:
        if self.license_transport_key_id_override:
            return self.license_transport_key_id_override
        return _derive_key_id(self.license_transport_public_key_path) or DEFAULT_LICENSE_TRANSPORT_KEY_ID

    @property
    def license_trusted_public_keys(self) -> dict[str, tuple[Path, str | None]]:
        """可信签名公钥白名单：keyId → (公钥路径, 期望 sha256)。指纹为 None 时只按 keyId 选。"""
        if self.license_trusted_public_keys_override:
            return {
                key_id: (path, expected_sha256)
                for key_id, path, expected_sha256 in self.license_trusted_public_keys_override
            }
        if self.license_public_key_path_override is not None:
            return {
                self.license_key_id: (
                    self.license_public_key_path_override,
                    self.license_public_key_sha256,
                )
            }
        return {
            self.license_key_id: (
                self._keys_dir() / SIGNING_PUBLIC_KEY_FILENAME,
                self.license_public_key_sha256 or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
            )
        }

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        return self.license_server_batches or (
            (("direct", (self.license_server_url,)),) if self.license_server_url else ()
        )

    @property
    def version(self) -> str:
        # 与包级 ``load_app_version`` 对齐：镜像里没有 package.json，靠烘入的 ``_version``。
        from .version import load_app_version

        return load_app_version()

    @property
    def frontend_dir(self) -> Path:
        """前端 SPA 构建产物目录（对齐 Nest ``getFrontendDistDir`` 的解析顺序）。

        1. ``HOMEOS_FRONTEND_DIR`` 环境变量覆盖；
        2. 工作区根 ``dist/homeos/frontend``（monorepo，vite outDir）；
        3. 本包根 ``dist/frontend``（homeos 独立检出时）；
        4. 后端本级 ``dist``（独立部署）；
        5. 后端本级 ``frontend``（源码目录兜底）。
        """
        if self.frontend_dir_override is not None:
            return self.frontend_dir_override
        override = _environment_path("HOMEOS_FRONTEND_DIR")
        if override is not None:
            return override
        workspace_dist = WORKSPACE_ROOT / "dist" / "homeos" / "frontend"
        for candidate in (
            workspace_dist,
            REPO_ROOT / "dist" / "frontend",
            self.project_root / "dist",
            self.project_root / "frontend",
        ):
            if candidate.is_dir():
                return candidate
        return workspace_dist


def load_settings() -> Settings:
    """从环境变量装配 Settings。

    环境变量命名与 Nest 侧保持一致（``JWT_SECRET`` / ``METRICS_TOKEN`` /
    ``CORS_ORIGINS`` 等），使同一份 ``backend/.env`` 可被两套后端共用。
    """
    # 兜底值必须与 `.env.example` 的 `#HOMEOS_DATA_DIR=./homeos/data` 及 `ops/dev.mjs` 一致。
    # 解析口径收敛在 `resolve_data_dir`：磁盘余量指标用的是同一份，避免两处兜底值不同。
    data_dir = resolve_data_dir()
    additional_public_origins = _validated_public_origins()
    return Settings(
        data_dir=data_dir,
        store_url=os.getenv("APP_STORE_URL", "").strip().rstrip("/"),
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        jwt_expires_in_seconds=_environment_int(
            "JWT_EXPIRES_IN_SECONDS", 86400, minimum=60, maximum=365 * 24 * 3600
        ),
        session_max_age_seconds=_environment_int(
            "HOMEOS_SESSION_MAX_AGE_SECONDS", 30 * 24 * 60 * 60, minimum=60, maximum=365 * 24 * 3600
        ),
        schema_mode=os.getenv("HOMEOS_SCHEMA_MODE", "auto").strip().lower() or "auto",
        slow_db_query_ms=_environment_int("HOMEOS_SLOW_DB_QUERY_MS", 100, minimum=1, maximum=60000),
        cookie_name=os.getenv("COOKIE_NAME", "auth_token").strip() or "auth_token",
        csrf_cookie_name=os.getenv("CSRF_COOKIE_NAME", "csrf_token").strip() or "csrf_token",
        csrf_header_name=os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token").strip() or "X-CSRF-Token",
        metrics_token=os.getenv("METRICS_TOKEN", "").strip(),
        is_production=environment_is_production(),
        allowed_origins=_environment_csv("CORS_ORIGINS"),
        additional_public_origins=additional_public_origins,
        # 默认信回环（镜像内置反代就在同容器回环上）。留空字符串会显式关掉代理信任，
        # 因此这里只在**未设置**时才用默认值 —— `_environment_csv` 对空串返回 ()，故手动兜底。
        trusted_proxies=(
            _environment_csv("APP_TRUSTED_PROXIES")
            if os.getenv("APP_TRUSTED_PROXIES") is not None
            else ("127.0.0.1", "::1")
        ),
        public_body_limit_bytes=_environment_int(
            "PUBLIC_BODY_LIMIT_BYTES", 1024 * 1024, minimum=1024, maximum=1024 * 1024 * 1024
        ),
        authenticated_body_limit_bytes=_environment_int(
            "AUTHENTICATED_BODY_LIMIT_BYTES", 50 * 1024 * 1024, minimum=1024, maximum=1024 * 1024 * 1024
        ),
        ha_request_timeout_seconds=_environment_float(
            "HA_REQUEST_TIMEOUT_SECONDS", 10.0, minimum=0.5, maximum=300.0
        ),
        ha_websocket_max_size_bytes=_environment_int(
            "HA_WEBSOCKET_MAX_SIZE_BYTES", 64 * 1024 * 1024, minimum=1024 * 1024, maximum=512 * 1024 * 1024
        ),
        # 周期全量对账是兜底：实时 WS 已覆盖大部分变化，30 分钟把 700+ 实体全量拉一遍
        # 既费 HA 又写库，默认降到 6 小时；重连/手动刷新仍会立即全量同步，
        # 需要更频繁可用 HA_RECONCILE_INTERVAL_SECONDS 调回。
        ha_reconcile_interval_seconds=_environment_int(
            "HA_RECONCILE_INTERVAL_SECONDS", 21600, minimum=60, maximum=7 * 24 * 3600
        ),
        runtime_access_cache_seconds=_environment_non_negative_float(
            "APP_RUNTIME_ACCESS_CACHE_SECONDS", DEFAULT_RUNTIME_ACCESS_CACHE_SECONDS
        ),
        credential_key_path_override=_environment_path("APP_HA_CREDENTIAL_FILE"),
        app_base_url=os.getenv("APP_BASE_URL", "").strip().rstrip("/"),
        frontend_dir_override=_environment_path("HOMEOS_FRONTEND_DIR"),
        license_required=_license_required_from_env(),
        license_expired_grace=_environment_bool("LICENSE_EXPIRED_GRACE", default=True),
        license_expired_grace_days=_environment_int("LICENSE_EXPIRED_GRACE_DAYS", 90, minimum=1, maximum=3650),
        license_server_url=os.getenv("APP_LICENSE_SERVER_URL", "").strip().rstrip("/") or DEFAULT_LICENSE_SERVER_URL,
        license_server_batches=_environment_batches("APP_LICENSE_SERVER_BATCHES"),
        license_request_timeout_seconds=_environment_float(
            "APP_LICENSE_REQUEST_TIMEOUT_SECONDS", 10.0, minimum=0.5, maximum=300.0
        ),
        license_public_key_sha256=os.getenv("APP_LICENSE_PUBLIC_KEY_SHA256", "").strip()
        or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
        license_transport_public_key_sha256=os.getenv("APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256", "").strip()
        or DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        license_transport_key_id_override=os.getenv("APP_LICENSE_TRANSPORT_KEY_ID", "").strip(),
        license_public_key_path_override=_environment_path("APP_LICENSE_PUBLIC_KEY_FILE"),
        license_transport_public_key_path_override=_environment_path("APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE"),
        hardware_machine_id_override=os.getenv("APP_HARDWARE_MACHINE_ID", "").strip(),
        hardware_board_id_override=os.getenv("APP_HARDWARE_BOARD_ID", "").strip(),
        license_secret_key_path_override=_environment_path("APP_LICENSE_CREDENTIAL_FILE"),
        client_keys_dir_override=_environment_path("APP_CLIENT_KEYS_DIR"),
    )
