from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[3]
SELF_HOSTED_LICENSE_SERVER_URL = 'http://127.0.0.1:8802'
DEFAULT_LICENSE_SERVER_BATCHES = (('direct', (SELF_HOSTED_LICENSE_SERVER_URL,)),)
DEFAULT_LICENSE_KEY_ID = 'hb-local-2026'
DEFAULT_LICENSE_PUBLIC_KEY_FILENAME = 'license-public.pem'
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = 'a53d869318a3d9005431b0296b9f0d1d7f7b2523e088f0ede322f88c882e0c28'
DEFAULT_LICENSE_TRANSPORT_KEY_ID = 'hb-local-transport-2026'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '1dd4a0a822b9227ebd1032fabd992342f7fb52630cdf2fedfc30db54191b2b19'
DEFAULT_STORE_URL = 'https://pay.homeos.cn'


def _derive_key_id(public_key_path: Path) -> str | None:
    try:
        payload = public_key_path.read_bytes()
    except OSError:
        return None
    return f'hb-{hashlib.sha256(payload).hexdigest()[:16]}'


def _read_baked_version() -> str:
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ''
    return str(baked).strip()


def _read_package_version() -> str:
    for candidate in (
        PROJECT_ROOT / 'package.json',
        REPO_ROOT / 'package.json',
    ):
        try:
            payload = json.loads(candidate.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        version = payload.get('version') if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ''


def _environment_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'on', 'yes', 'true'}


def _environment_path(name: str) -> Path | None:
    value = os.getenv(name, '').strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_batches(name: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    value = os.getenv(name, '').strip()
    if not value:
        return ()
    groups: list[tuple[str, tuple[str, ...]]] = []
    for chunk in value.split(';'):
        chunk = chunk.strip()
        if not chunk:
            continue
        label, _, servers = chunk.partition('=')
        label = label.strip() or 'direct'
        items = tuple(item.strip().rstrip('/') for item in servers.split('|') if item.strip())
        groups.append((label, items))
    return tuple(groups)


@dataclass(frozen=True)
class Settings:

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    app_base_url: str = ''
    store_url: str = DEFAULT_STORE_URL
    session_max_age_seconds: int = 28800
    cookie_secure: bool = False
    update_checks_enabled: bool = False
    update_channel: str = 'docker'
    cookie_name: str = 'homeos_session'
    display_cookie_name: str = 'homeos_display'
    display_cookie_max_age_seconds: int = 315360000
    ha_request_timeout_seconds: float = 10
    ha_reconcile_interval_seconds: int = 1800
    ha_websocket_max_size_bytes: int = 67108864
    license_required: bool = False
    license_server_url: str = SELF_HOSTED_LICENSE_SERVER_URL
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = ()
    license_request_timeout_seconds: float = 10
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    license_key_id_override: str = ''
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    license_transport_key_id_override: str = ''
    hardware_machine_id_override: str = ''
    hardware_board_id_override: str = ''
    credential_key_path_override: Path | None = None
    display_pairing_key_path_override: Path | None = None
    license_secret_key_path_override: Path | None = None

    @property
    def database_path(self) -> Path:
        return self.data_dir / 'app.db'

    @property
    def database_url(self) -> str:
        return f'sqlite:///{self.database_path}'

    @property
    def admin_account_path(self) -> Path:
        return self.data_dir / 'admin-account.json'

    @property
    def frontend_dir(self) -> Path:
        override = _environment_path('HOMEOS_FRONTEND_DIR')
        if override is not None:
            return override
        built = self.project_root / 'dist'
        if built.is_dir():
            return built
        workspace_built = REPO_ROOT / 'dist' / 'homeos-3d' / 'frontend'
        if workspace_built.is_dir():
            return workspace_built
        return self.project_root / 'frontend'

    @property
    def runtime_dir(self) -> Path:
        return self.frontend_dir / 'modules' / 'runtime'

    @property
    def runtime_manifest_path(self) -> Path:
        return self.runtime_dir / 'manifest.json'

    @property
    def public_static_manifest_path(self) -> Path:
        return self.frontend_dir / 'public-static.json'

    @property
    def built_in_assets_dir(self) -> Path:
        return self.project_root / 'image'

    @property
    def user_assets_dir(self) -> Path:
        return self.data_dir / 'assets'

    @property
    def studio3d_dir(self) -> Path:
        return self.data_dir / 'studio3d'

    @property
    def studio3d_draft_path(self) -> Path:
        return self.studio3d_dir / 'draft.json'

    @property
    def studio3d_exports_dir(self) -> Path:
        return self.data_dir / 'exports'

    @property
    def effect_variants_dir(self) -> Path:
        return self.data_dir / 'cache' / 'effect-variants'

    @property
    def secrets_dir(self) -> Path:
        return self.data_dir / 'secrets'

    @property
    def credential_key_path(self) -> Path:
        return self.credential_key_path_override or self.secrets_dir / 'ha_credentials.key'

    @property
    def display_pairing_key_path(self) -> Path:
        return self.display_pairing_key_path_override or self.secrets_dir / 'display_pairing_codes.key'

    @property
    def license_secret_key_path(self) -> Path:
        return self.license_secret_key_path_override or self.secrets_dir / 'license_credentials.key'

    @property
    def instance_id_path(self) -> Path:
        return self.data_dir / 'instance-id'

    @property
    def hardware_fallback_id_path(self) -> Path:
        return self.data_dir / 'hardware-fallback-id'

    def _keys_dir(self) -> Path:
        local = self.project_root / 'keys'
        shared = REPO_ROOT / 'keys'
        if local.is_dir():
            return local
        return shared if shared.is_dir() else local

    @property
    def license_public_key_path(self) -> Path:
        return self.license_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME

    @property
    def license_transport_public_key_path(self) -> Path:
        return self.license_transport_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME

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
        if self.license_trusted_public_keys_override:
            return {
                key_id: (path, expected_sha256)
                for key_id, path, expected_sha256 in self.license_trusted_public_keys_override
            }
        if self.license_public_key_path_override is not None:
            return {
                self.license_key_id: (self.license_public_key_path_override, self.license_public_key_sha256)
            }
        keys_dir = self._keys_dir()
        return {
            self.license_key_id: (
                keys_dir / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME,
                self.license_public_key_sha256 or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
            )
        }

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        return (
            self.license_server_batches or ((('direct', (self.license_server_url,)),)
            if self.license_server_url
            else ())
        )

    @property
    def version(self) -> str:
        return _read_baked_version() or _read_package_version() or '0.0.0'


def load_settings() -> Settings:
    data_dir = Path(os.getenv('APP_DATA_DIR', PROJECT_ROOT / 'data')).expanduser().resolve()
    ha_key_path = os.getenv('APP_HA_CREDENTIAL_FILE', '').strip()
    display_pairing_key_path = os.getenv('APP_DISPLAY_PAIRING_KEY_FILE', '').strip()
    license_key_path = os.getenv('APP_LICENSE_CREDENTIAL_FILE', '').strip()
    return Settings(**{
        'data_dir': data_dir,
        'app_base_url': os.getenv('APP_BASE_URL', '').strip().rstrip('/'),
        'store_url': os.getenv('APP_STORE_URL', '').strip().rstrip('/') or DEFAULT_STORE_URL,
        'session_max_age_seconds': int(os.getenv('APP_SESSION_MAX_AGE_SECONDS', '28800')),
        'cookie_secure': _environment_bool('APP_COOKIE_SECURE'),
        'update_checks_enabled': True,
        'update_channel': os.getenv('APP_UPDATE_CHANNEL', 'docker').strip().lower(),
        'ha_request_timeout_seconds': float(os.getenv('APP_HA_REQUEST_TIMEOUT_SECONDS', '10')),
        'ha_reconcile_interval_seconds': int(os.getenv('APP_HA_RECONCILE_INTERVAL_SECONDS', '1800')),
        'ha_websocket_max_size_bytes': int(os.getenv('APP_HA_WEBSOCKET_MAX_SIZE_BYTES', str(67108864))),
        'license_required': True,
        'hardware_machine_id_override': os.getenv('APP_HARDWARE_MACHINE_ID', '').strip(),
        'hardware_board_id_override': os.getenv('APP_HARDWARE_BOARD_ID', '').strip(),
        'license_server_url': os.getenv('APP_LICENSE_SERVER_URL', '').strip().rstrip('/') or SELF_HOSTED_LICENSE_SERVER_URL,
        'license_server_batches': _environment_batches('APP_LICENSE_SERVER_BATCHES') or DEFAULT_LICENSE_SERVER_BATCHES,
        'license_request_timeout_seconds': float(os.getenv('APP_LICENSE_REQUEST_TIMEOUT_SECONDS', '10')),
        'license_public_key_sha256': os.getenv('APP_LICENSE_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
        'license_transport_public_key_sha256': os.getenv('APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        'license_transport_key_id_override': os.getenv('APP_LICENSE_TRANSPORT_KEY_ID', '').strip(),
        'license_public_key_path_override': _environment_path('APP_LICENSE_PUBLIC_KEY_FILE'),
        'license_transport_public_key_path_override': _environment_path('APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE'),
        'credential_key_path_override': Path(ha_key_path).expanduser().resolve() if ha_key_path else None,
        'display_pairing_key_path_override': Path(display_pairing_key_path).expanduser().resolve() if display_pairing_key_path else None,
        'license_secret_key_path_override': Path(license_key_path).expanduser().resolve() if license_key_path else None,
    })
