"""运行期配置：常量默认值、环境变量解析与路径推导。

对齐 Nest 侧 ``backend/src/config`` / ``app.module.ts`` 的 env 装配口径，以及仓库
既有 Python 后端（homeos-3d）的冻结 dataclass 约定。本模块只做
「读环境变量 → 拼出不可变 Settings 对象」，不建立目录、不连数据库。

数据库已按迁移决策改为 **SQLite**（WAL），因此不再有 ``DATABASE_URL`` 的 PostgreSQL
语义；``HOMEOS_DATABASE_URL`` 仅在测试时覆盖为内存库。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]


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


@dataclass(frozen=True)
class Settings:
    """不可变运行期配置。"""

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 授权 / 联网商店
    store_url: str = ""
    # 认证
    jwt_secret: str = ""
    jwt_expires_in_seconds: int = 28800
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
    def redis_configured(self) -> bool:
        return bool(self.redis_url)

    @property
    def frontend_dir(self) -> Path:
        """前端 SPA 构建产物目录（对齐 Nest ``getFrontendDistDir`` 的解析顺序）。

        1. ``HOMEOS_FRONTEND_DIR`` 环境变量覆盖；
        2. 仓库根 ``dist/frontend``（monorepo 开发态，vite outDir）；
        3. 后端本级 ``dist``（独立部署）；
        4. 后端本级 ``frontend``（源码目录兜底）。
        """
        if self.frontend_dir_override is not None:
            return self.frontend_dir_override
        override = _environment_path("HOMEOS_FRONTEND_DIR")
        if override is not None:
            return override
        for candidate in (
            REPO_ROOT / "dist" / "frontend",
            self.project_root / "dist",
            self.project_root / "frontend",
        ):
            if candidate.is_dir():
                return candidate
        return REPO_ROOT / "dist" / "frontend"


def load_settings() -> Settings:
    """从环境变量装配 Settings。

    环境变量命名与 Nest 侧保持一致（``JWT_SECRET`` / ``REDIS_URL`` / ``METRICS_TOKEN`` /
    ``NODE_ENV`` / ``CORS_ORIGINS`` 等），使同一份 ``backend/.env`` 可被两套后端共用。
    """
    data_dir = Path(os.getenv("HOMEOS_DATA_DIR", PROJECT_ROOT / "data")).expanduser().resolve()
    return Settings(
        data_dir=data_dir,
        store_url=os.getenv("APP_STORE_URL", "").strip().rstrip("/"),
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
        frontend_dir_override=_environment_path("HOMEOS_FRONTEND_DIR"),
    )
