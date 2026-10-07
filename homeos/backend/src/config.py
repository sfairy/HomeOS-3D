"""运行期配置：常量默认值、环境变量解析与路径推导。

对齐 Nest 侧 ``backend/src/config`` / ``app.module.ts`` 的 env 装配口径，以及仓库
既有 Python 后端（homeos-3d）的冻结 dataclass 约定。本模块只做
「读环境变量 → 拼出不可变 Settings 对象」，不建立目录、不连数据库。

数据库已按迁移决策改为 **SQLite**（WAL），因此不再有 ``DATABASE_URL`` 的 PostgreSQL
语义；``HOMEOS_DATABASE_URL`` 仅在测试时覆盖为内存库。
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]
#: monorepo 工作区根（``homeos/`` 的上一级）。前端产物统一收敛在
#: ``<workspace>/dist/homeos/frontend``，与 homeos-store 同级，便于 ops/ 统一打包。
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]


def _environment_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "on", "yes", "true"}


def _environment_path(name: str) -> Path | None:
    value = os.getenv(name, "").strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_csv(name: str) -> tuple[str, ...]:
    value = os.getenv(name, "").strip()
    if not value:
        return ()
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


# ---- 授权服务常量（并入 homeos-3d 授权服务）----
# 公钥指纹只作兜底：ops/license_keys.py 在容器启动期按**实际公钥文件字节**注入
# APP_LICENSE_PUBLIC_KEY_SHA256 / APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
# （商店首次启动随机生成密钥对，写死常量必然对不上，自检只会报「指纹不匹配」）。
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = "b991c5f7cca311df51edb1fd6568de53a136eac22dcc2e07a87b3f86e9738035"
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = (
    "0a44cfca97901b69786c24c54658f30ea8228db557460ccc557a4c38183480ce"
)
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


def _environment_endpoints(name: str) -> tuple[str, ...]:
    """逗号分隔的端点列表（按序回退）；留空返回空元组。"""
    value = os.getenv(name, "").strip()
    if not value:
        return ()
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


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


def _read_package_version() -> str:
    """从 PROJECT_ROOT / REPO_ROOT 的 package.json 读版本号（授权状态里对外暴露）。"""
    for candidate in (PROJECT_ROOT / "package.json", REPO_ROOT / "package.json"):
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        version = payload.get("version") if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ""


def _license_required_from_env() -> bool:
    """是否启用商业授权门禁（与迁移前口径一致）。

    ``LICENSE_REQUIRED`` 显式取值优先；未设置时 ``NODE_ENV=production`` 默认开启，
    其它环境默认关闭（开发态不强制激活）。
    """
    raw = os.getenv("LICENSE_REQUIRED")
    if raw is not None:
        return _environment_bool("LICENSE_REQUIRED", default=False)
    return os.getenv("NODE_ENV", "").strip().lower() == "production"


@dataclass(frozen=True)
class Settings:
    """不可变运行期配置。"""

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 授权 / 联网商店
    store_url: str = ""
    # 版本更新发现（并入 homeos-3d ``/api/v1/updates``）：可选的发布发现，与授权/编辑器隔离。
    update_checks_enabled: bool = True
    update_channel: str = "docker"
    #: 更新检查端点（逗号分隔，可多个按序回退）。留空则用 ``store_url`` 拼出商店端点。
    update_endpoints: tuple[str, ...] = ()
    # 认证
    jwt_secret: str = ""
    jwt_expires_in_seconds: int = 28800
    #: 会话令牌 Cookie（homeos-3d 原生口径：``sessions`` 表的不透明令牌）。
    cookie_name: str = "auth_token"
    csrf_cookie_name: str = "csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    cookie_secure: bool = False
    # 基础设施
    redis_url: str = ""
    metrics_token: str = ""
    is_production: bool = False
    # 接入层
    allowed_origins: tuple[str, ...] = ()
    trust_proxy: bool = False
    public_body_limit_bytes: int = 1 * 1024 * 1024
    authenticated_body_limit_bytes: int = 50 * 1024 * 1024
    # HA
    ha_request_timeout_seconds: float = 10.0
    ha_websocket_max_size_bytes: int = 67108864
    ha_reconcile_interval_seconds: int = 1800
    credential_key_path_override: Path | None = None
    # 部署对外基地址（反代场景）：来源校验与绝对链接拼接用。
    app_base_url: str = ""
    # 授权服务（并入 homeos-3d 授权服务；字段语义与 homeos-3d Settings 对齐）
    license_required: bool = False
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
    def secrets_dir(self) -> Path:
        return self.data_dir / "secrets"

    @property
    def credential_key_path(self) -> Path:
        """HA access token 落库加密密钥（与数据库分离）。"""
        return self.credential_key_path_override or self.secrets_dir / "ha_credentials.key"

    @property
    def session_max_age_seconds(self) -> int:
        """DB 会话最长存活时间（沿用 JWT 过期配置，保证两条通道口径一致）。"""
        return self.jwt_expires_in_seconds

    @property
    def user_assets_dir(self) -> Path:
        return self.data_dir / "assets"

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
    def effect_variants_dir(self) -> Path:
        return self.data_dir / "cache" / "effect-variants"

    @property
    def built_in_assets_dir(self) -> Path:
        """内置素材目录（``/assets/builtin/**`` 的来源）。

        源码态是 ``backend/image``；发行产物里代码位于 ``/app/backend/app``，镜像内该目录
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

    @property
    def redis_configured(self) -> bool:
        return bool(self.redis_url)

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
        """授权公钥目录：显式覆盖 > APP_CLIENT_KEYS_DIR > backend/keys/client > 仓库根 keys/。"""
        if self.client_keys_dir_override is not None:
            return self.client_keys_dir_override
        local = self.project_root / "keys" / "client"
        if local.is_dir():
            return local
        bare = self.project_root / "keys"
        if bare.is_dir():
            return bare
        shared = REPO_ROOT / "keys"
        return shared if shared.is_dir() else local

    @property
    def license_public_key_path(self) -> Path:
        return (
            self.license_public_key_path_override
            or self._keys_dir() / SIGNING_PUBLIC_KEY_FILENAME
        )

    @property
    def license_transport_public_key_path(self) -> Path:
        return (
            self.license_transport_public_key_path_override
            or self._keys_dir() / TRANSPORT_PUBLIC_KEY_FILENAME
        )

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
        return _read_package_version() or "0.0.0"

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

    环境变量命名与 Nest 侧保持一致（``JWT_SECRET`` / ``REDIS_URL`` / ``METRICS_TOKEN`` /
    ``NODE_ENV`` / ``CORS_ORIGINS`` 等），使同一份 ``backend/.env`` 可被两套后端共用。
    """
    # 数据目录：HOMEOS_DATA_DIR（源码/dev）→ APP_DATA_DIR（镜像/compose 沿用 3D 时代变量名）
    # → 兜底 <repo>/homeos/data。
    # 兜底值必须与 `.env.example` 的 `#HOMEOS_DATA_DIR=./homeos/data` 及 `ops/dev.mjs` 一致：
    # 早先兜底到 backend/data，那目录是 Nest/2D 时代遗留，schema 与现役库已分叉，裸跑会静默
    # 用上过期库。
    data_dir = Path(
        os.getenv("HOMEOS_DATA_DIR") or os.getenv("APP_DATA_DIR") or PROJECT_ROOT.parent / "data"
    ).expanduser().resolve()
    return Settings(
        data_dir=data_dir,
        store_url=os.getenv("APP_STORE_URL", "").strip().rstrip("/"),
        update_checks_enabled=True,
        update_channel=os.getenv("APP_UPDATE_CHANNEL", "docker").strip().lower() or "docker",
        update_endpoints=_environment_csv("APP_UPDATE_ENDPOINTS"),
        jwt_secret=os.getenv("JWT_SECRET", "").strip(),
        jwt_expires_in_seconds=int(os.getenv("JWT_EXPIRES_IN_SECONDS", "28800")),
        cookie_name=os.getenv("COOKIE_NAME", "auth_token").strip() or "auth_token",
        csrf_cookie_name=os.getenv("CSRF_COOKIE_NAME", "csrf_token").strip() or "csrf_token",
        csrf_header_name=os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token").strip() or "X-CSRF-Token",
        cookie_secure=_environment_bool("COOKIE_SECURE"),
        redis_url=os.getenv("REDIS_URL", "").strip(),
        metrics_token=os.getenv("METRICS_TOKEN", "").strip(),
        is_production=os.getenv("NODE_ENV", "").strip().lower() == "production",
        allowed_origins=_environment_csv("CORS_ORIGINS"),
        trust_proxy=_environment_bool("TRUST_PROXY"),
        public_body_limit_bytes=int(os.getenv("PUBLIC_BODY_LIMIT_BYTES", str(1 * 1024 * 1024))),
        authenticated_body_limit_bytes=int(
            os.getenv("AUTHENTICATED_BODY_LIMIT_BYTES", str(50 * 1024 * 1024))
        ),
        ha_request_timeout_seconds=float(os.getenv("HA_REQUEST_TIMEOUT_SECONDS", "10")),
        ha_websocket_max_size_bytes=int(
            os.getenv("HA_WEBSOCKET_MAX_SIZE_BYTES", str(67108864))
        ),
        ha_reconcile_interval_seconds=int(os.getenv("HA_RECONCILE_INTERVAL_SECONDS", "1800")),
        credential_key_path_override=_environment_path("APP_HA_CREDENTIAL_FILE"),
        app_base_url=os.getenv("APP_BASE_URL", "").strip().rstrip("/"),
        frontend_dir_override=_environment_path("HOMEOS_FRONTEND_DIR"),
        license_required=_license_required_from_env(),
        license_server_url=os.getenv("APP_LICENSE_SERVER_URL", "").strip().rstrip("/")
        or DEFAULT_LICENSE_SERVER_URL,
        license_server_batches=_environment_batches("APP_LICENSE_SERVER_BATCHES"),
        license_request_timeout_seconds=float(os.getenv("APP_LICENSE_REQUEST_TIMEOUT_SECONDS", "10")),
        license_public_key_sha256=os.getenv("APP_LICENSE_PUBLIC_KEY_SHA256", "").strip()
        or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
        license_transport_public_key_sha256=os.getenv(
            "APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256", ""
        ).strip()
        or DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        license_transport_key_id_override=os.getenv("APP_LICENSE_TRANSPORT_KEY_ID", "").strip(),
        license_public_key_path_override=_environment_path("APP_LICENSE_PUBLIC_KEY_FILE"),
        license_transport_public_key_path_override=_environment_path(
            "APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE"
        ),
        hardware_machine_id_override=os.getenv("APP_HARDWARE_MACHINE_ID", "").strip(),
        hardware_board_id_override=os.getenv("APP_HARDWARE_BOARD_ID", "").strip(),
        license_secret_key_path_override=_environment_path("APP_LICENSE_CREDENTIAL_FILE"),
        client_keys_dir_override=_environment_path("APP_CLIENT_KEYS_DIR"),
    )
