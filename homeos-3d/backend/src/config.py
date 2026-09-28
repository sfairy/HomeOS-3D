"""运行期配置：常量默认值、环境变量解析与路径推导。
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

def _detect_project_root() -> Path:
    """源码布局 ``homeos-3d/backend/src`` 或镜像布局 ``/app/src``。"""
    here = Path(__file__).resolve()
    candidate_src = here.parents[2]  # homeos-3d/
    candidate_docker = here.parents[1]  # /app
    if (candidate_src / 'frontend').is_dir() or (candidate_src / 'backend').is_dir():
        return candidate_src
    if (candidate_docker / 'dist').is_dir() or (candidate_docker / 'src').is_dir():
        return candidate_docker
    return candidate_src


PROJECT_ROOT = _detect_project_root()
# 单体仓库根（含共享 keys/）；独立拆库后与 PROJECT_ROOT 相同。
REPO_ROOT = PROJECT_ROOT.parent if (PROJECT_ROOT.parent / 'homeos-store').is_dir() else PROJECT_ROOT


def _read_baked_version() -> str:
    """构建期烘进镜像的版本号（Dockerfile 生成 ``src/_version.py`` 后编译成扩展）。

    源码运行时这个模块不存在，返回空串让调用方回落到 ``package.json``。
    """
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ''
    return str(baked).strip()


def _read_package_version() -> str:
    """仓库根 ``package.json`` 的 ``version`` —— 版本号的唯一权威源。"""
    for candidate in (REPO_ROOT / 'package.json', PROJECT_ROOT / 'package.json'):
        try:
            payload = json.loads(candidate.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            continue
        version = payload.get('version') if isinstance(payload, dict) else None
        if isinstance(version, str) and version.strip():
            return version.strip()
    return ''


#: 当前版本号：镜像取构建期烘入值，源码取仓库根 package.json；都拿不到才退到 '0'。
VERSION = _read_baked_version() or _read_package_version() or '0'

# 授权服务器：本项目自带的 ``backend/src/`` 应用（默认监听 8802），不依赖任何外部厂商节点。
SELF_HOSTED_LICENSE_SERVER_URL = 'http://127.0.0.1:8802'
# 单条 direct 批次：只访问自建服务器，不会散到其它节点。
DEFAULT_LICENSE_SERVER_BATCHES = (('direct', (SELF_HOSTED_LICENSE_SERVER_URL,)),)
# keyId **由公钥文件派生**（见 `_derive_key_id`），不是身份真相源。这两个常量只在公钥文件
DEFAULT_LICENSE_KEY_ID = 'hb-local-2026'
DEFAULT_LICENSE_PUBLIC_KEY_FILENAME = 'license-public.pem'
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = 'a53d869318a3d9005431b0296b9f0d1d7f7b2523e088f0ede322f88c882e0c28'
DEFAULT_LICENSE_TRANSPORT_KEY_ID = 'hb-local-transport-2026'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '1dd4a0a822b9227ebd1032fabd992342f7fb52630cdf2fedfc30db54191b2b19'
#: 上一代签名公钥镜像的文件名：存在就一并登记，让「客户端先升级、服务端后轮换」期间的
DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME = 'license-public.previous.pem'


def _derive_key_id(public_key_path: Path) -> str | None:
    '''由公钥**文件字节**派生 keyId；读不到文件时返回 None。
    '''
    try:
        payload = public_key_path.read_bytes()
    except OSError:
        return None
    return f'hb-{hashlib.sha256(payload).hexdigest()[:16]}'


def _environment_bool(name: str, default: bool = False) -> bool:
    """把环境变量解析成布尔值。
    """
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in frozenset({'1', 'on', 'yes', 'true'})


def _environment_int(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
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


def _environment_path(name: str) -> Path | None:
    """把环境变量解析成绝对路径，未设置或为空时返回 None。
    """
    value = os.getenv(name, '').strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_batches(name: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    '''解析授权服务器批次覆盖项。
    '''
    value = os.getenv(name, '').strip()
    if not value:
        return ()
    # 先声明成 list 再转 tuple：Settings 是 frozen dataclass，内部用可变类型更易拼装。
    groups: list[tuple[str, tuple[str, ...]], ...] = []
    for chunk in value.split(';'):
        chunk = chunk.strip()
        if not chunk:
            continue
        label, _, servers = chunk.partition('=')
        # 名称留空时归到 direct，保证每批都有可用标识。
        label = label.strip() or 'direct'
        # rstrip('/') 去掉尾部斜杠，拼 URL 时不会出现双斜杠。
        items = tuple(item.strip().rstrip('/') for item in servers.split('|') if item.strip())
        groups.append((label, items))
    return tuple(groups)


def _environment_trusted_keys(name: str) -> tuple[tuple[str, Path, str | None], ...]:
    '''解析额外的可信授权公钥。
    '''
    value = os.getenv(name, '').strip()
    if not value:
        return ()
    entries: list[tuple[str, Path, str | None]] = []
    for chunk in value.split('|'):
        parts = [part.strip() for part in chunk.split(':')]
        # keyId 与路径缺一不可，指纹可选，因此少于两段直接跳过。
        if len(parts) < 2 or not parts[0] or not parts[1]:
            continue
        fingerprint = parts[2] if len(parts) > 2 and parts[2] else None
        entries.append((parts[0], Path(parts[1]).expanduser().resolve(), fingerprint))
    return tuple(entries)


@dataclass(frozen=True)
class Settings:
    """一次运行期内不可变的配置快照。
    """

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 对外访问根地址：反向代理时设置，供 WebSocket 校验 Origin。
    app_base_url: str = ''
    session_max_age_seconds: int = 28800
    session_hard_max_age_seconds: int = 2592000
    cookie_secure: bool = False
    # 可信反向代理的 IP / CIDR 列表。为空表示不信任任何转发头，
    trusted_proxies: tuple[str, ...] = ()
    # 更新检查：默认关闭。开启后每 6 小时向发布端点上报本机版本与渠道，
    update_checks_enabled: bool = False
    update_channel: str = 'docker'
    # 发布端点；留空用 updates.RELEASE_ENDPOINTS 里的内置厂商端点。
    update_endpoints: tuple[str, ...] = ()
    # 更新说明页地址；留空用 updates.WIKI_URL 的内置地址。
    update_wiki_url: str = ''
    cookie_name: str = 'ha_bridge_session'
    display_cookie_name: str = 'ha_bridge_display'
    # 中控设备 Cookie 的浏览器侧有效期。服务端另有滑动有效期（见下），
    display_cookie_max_age_seconds: int = 15552000
    # 中控令牌的服务端滑动有效期（默认 180 天）：每次活跃（>= 5 分钟节流）续期。
    display_token_ttl_seconds: int = 15552000
    # 中控令牌的硬上限（默认 0 = 不设）。设成非 0 会强制平板到期重新配对，
    display_token_hard_ttl_seconds: int = 0
    ha_request_timeout_seconds: float = 10
    ha_reconcile_interval_seconds: int = 1800
    # 64 MiB：HA 在实体很多时单条状态推送会很大，默认值容易触发断连。
    ha_websocket_max_size_bytes: int = 67108864
    # 授权校验是否开启。**默认值必须与 load_settings 保持一致（都是 True）**：这个字段在 6 处
    license_required: bool = True
    license_server_url: str = SELF_HOSTED_LICENSE_SERVER_URL
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = DEFAULT_LICENSE_SERVER_BATCHES
    license_request_timeout_seconds: float = 10
    # 允许的时钟偏差，用于容忍租约生效时间比本机时间稍晚的情况。
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    #: 留空 = keyId 由公钥文件派生（见 ``license_key_id`` 属性）。显式赋值仍然生效
    license_key_id_override: str = ''
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    license_transport_key_id_override: str = ''
    # 硬件指纹覆盖项。默认留空 = 由本机机器 / 主板标识派生（见
    hardware_machine_id_override: str = ''
    hardware_board_id_override: str = ''
    # 三个密钥文件的路径覆盖项；为空时统一落在 data_dir/secrets/ 下。
    credential_key_path_override: Path | None = None
    display_pairing_key_path_override: Path | None = None
    license_secret_key_path_override: Path | None = None
    # 首次初始化的引导密钥（APP_SETUP_TOKEN）。为空时由 SetupGuard 在首次启动生成
    setup_token: str = ''

    @property
    def database_path(self) -> Path:
        """主应用 SQLite 主库文件。"""
        return self.data_dir / 'app.db'

    @property
    def database_url(self) -> str:
        """SQLAlchemy 连接串（本项目只用 SQLite）。"""
        return f'sqlite:///{self.database_path}'

    @property
    def admin_account_path(self) -> Path:
        """管理员账号文件；删除该文件并重启即可回到设置页。"""
        return self.data_dir / 'admin-account.json'

    @property
    def appearance_path(self) -> Path:
        """站点配色文件；删除该文件并重启即可回到设计系统默认配色。
        """
        return self.data_dir / 'appearance.json'

    @property
    def frontend_dir(self) -> Path:
        """前端构建产物根目录（``homeos-3d/dist``；挂载为 /static）。"""
        return self.project_root / 'dist'

    @property
    def built_in_assets_dir(self) -> Path:
        """内置素材目录，默认空；可自行增删，编辑器里也能改用用户上传图片。"""
        return self.project_root / 'image'

    @property
    def user_assets_dir(self) -> Path:
        """用户上传图片目录。"""
        return self.data_dir / 'assets'

    @property
    def studio3d_dir(self) -> Path:
        """3D 户型工作室的数据目录。"""
        return self.data_dir / 'studio3d'

    @property
    def studio3d_draft_path(self) -> Path:
        """工作室草稿文件，前端自动保存即写到这里。"""
        return self.studio3d_dir / 'draft.json'

    @property
    def studio3d_exports_dir(self) -> Path:
        """3D 导出产物目录（户型图、图层 PNG 等）。"""
        return self.data_dir / 'exports'

    @property
    def effect_variants_dir(self) -> Path:
        """灯光效果变体缓存目录，属于可再生数据，可安全清理。"""
        return self.data_dir / 'cache' / 'effect-variants'

    @property
    def secrets_dir(self) -> Path:
        """各类凭据密钥的默认存放目录（权限 0700）。"""
        return self.data_dir / 'secrets'

    @property
    def credential_key_path(self) -> Path:
        """HA 凭据加密密钥；用于加密长期访问令牌后再入库。"""
        return self.credential_key_path_override or self.secrets_dir / 'ha_credentials.key'

    @property
    def display_pairing_key_path(self) -> Path:
        """中控配对令牌的签名密钥。"""
        return self.display_pairing_key_path_override or self.secrets_dir / 'display_pairing_codes.key'

    @property
    def license_secret_key_path(self) -> Path:
        """本机授权凭据的加密密钥。"""
        return self.license_secret_key_path_override or self.secrets_dir / 'license_credentials.key'

    @property
    def instance_id_path(self) -> Path:
        """硬件指纹派生实例 ID 的缓存文件（由 LicenseService 写入）。"""
        return self.data_dir / 'instance-id'

    @property
    def hardware_fallback_id_path(self) -> Path:
        return self.data_dir / 'hardware-fallback-id'

    def _keys_dir(self) -> Path:
        """优先项目内 keys/，单体仓库则回落到仓库根 keys/。"""
        local = self.project_root / 'keys'
        shared = REPO_ROOT / 'keys'
        if local.is_dir():
            return local
        return shared if shared.is_dir() else local

    @property
    def license_public_key_path(self) -> Path:
        """签名公钥路径，默认取 keys/ 下的镜像。"""
        return self.license_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME

    @property
    def license_transport_public_key_path(self) -> Path:
        """传输层公钥路径（X25519），同样是 keys/ 下的镜像。"""
        return self.license_transport_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME

    @property
    def license_key_id(self) -> str:
        if self.license_key_id_override:
            return self.license_key_id_override
        return _derive_key_id(self.license_public_key_path) or DEFAULT_LICENSE_KEY_ID

    @property
    def license_transport_key_id(self) -> str:
        """传输 keyId：参与 HKDF 与 AAD，必须与服务端一字不差。"""
        if self.license_transport_key_id_override:
            return self.license_transport_key_id_override
        return _derive_key_id(self.license_transport_public_key_path) or DEFAULT_LICENSE_TRANSPORT_KEY_ID

    @property
    def license_trusted_public_keys(self) -> dict[str, tuple[Path, str | None]]:
        """可信公钥表 keyId -> (路径, 期望 sha256)。
        """
        if self.license_trusted_public_keys_override:
            return {key_id: (path, expected_sha256) for key_id, path, expected_sha256 in self.license_trusted_public_keys_override}
        if self.license_public_key_path_override is not None:
            trusted: dict[str, tuple[Path, str | None]] = {
                self.license_key_id: (self.license_public_key_path_override, self.license_public_key_sha256)
            }
            # 上一代签名公钥与当前公钥同目录（容器里由启动器落盘，见 ops/docker/bootstrap_keys.py）：
            # 少了它，服务端轮换密钥后的宽限窗口内旧租约会全部验签失败。
            previous = self.license_public_key_path_override.parent / DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME
            previous_key_id = _derive_key_id(previous)
            if previous_key_id and previous_key_id != self.license_key_id:
                trusted[previous_key_id] = (previous, None)
            return trusted
        keys_dir = self._keys_dir()
        trusted: dict[str, tuple[Path, str | None]] = {
            self.license_key_id: (
                keys_dir / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME,
                self.license_public_key_sha256 or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
            )
        }
        previous = keys_dir / DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME
        previous_key_id = _derive_key_id(previous)
        if previous_key_id:
            trusted[previous_key_id] = (previous, None)
        return trusted

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        """实际生效的授权服务器批次。
        """
        if self.license_server_batches:
            return self.license_server_batches
        if self.license_server_url:
            return (('esa', ()), ('eo', ()), ('direct', (self.license_server_url,)))
        return (('esa', ()), ('eo', ()), ('direct', ()))

    @property
    def version(self) -> str:
        """当前版本号（见模块级 ``VERSION``：构建期烘入值 → 仓库根 package.json → '0'）。"""
        return VERSION


def _env_default(field_name: str) -> str:
    """环境变量缺省值 = 该字段在 dataclass 上的默认值。
    """
    return str(Settings.__dataclass_fields__[field_name].default)


def load_settings() -> Settings:
    """从环境变量组装 Settings；未设置的项一律回落到内置默认值。"""
    data_dir = Path(os.getenv('APP_DATA_DIR', PROJECT_ROOT / 'data')).expanduser().resolve()
    # 三个密钥文件路径先读成字符串，为空表示「用数据目录下的默认位置」。
    ha_key_path = os.getenv('APP_HA_CREDENTIAL_FILE', '').strip()
    display_pairing_key_path = os.getenv('APP_DISPLAY_PAIRING_KEY_FILE', '').strip()
    license_key_path = os.getenv('APP_LICENSE_CREDENTIAL_FILE', '').strip()

    # 授权服务器指向：默认即项目自带的自建授权服务器（backend/src/，8802）；
    custom_license_url = os.getenv('APP_LICENSE_SERVER_URL', '').strip().rstrip('/')
    custom_license_batches = _environment_batches('APP_LICENSE_SERVER_BATCHES')
    if custom_license_batches:
        license_batches = custom_license_batches
    elif custom_license_url:
        license_batches = (('direct', (custom_license_url,)),)
    else:
        license_batches = DEFAULT_LICENSE_SERVER_BATCHES

    # 用字典展开而非逐项赋值：字段名与变量名对齐，漏一项会在构造时报错而不是静默用错值。
    trusted_proxies = tuple(
        piece.strip()
        for piece in os.getenv('APP_TRUSTED_PROXIES', '').split(',')
        if piece.strip()
    )
    # 更新检查的发布端点：留空用内置的厂商端点（见 updates.RELEASE_ENDPOINTS）。
    update_endpoints = tuple(
        piece.strip()
        for piece in os.getenv('APP_UPDATE_ENDPOINTS', '').split(',')
        if piece.strip()
    )
    return Settings(**{
        'data_dir': data_dir,
        'app_base_url': os.getenv('APP_BASE_URL', '').strip().rstrip('/'),
        # 会话时长：滑动有效期必须为正 —— 0 / 负数会让 expires_at 被写成「当前时刻」，
        'session_max_age_seconds': _environment_int(
            'APP_SESSION_MAX_AGE_SECONDS',
            int(_env_default('session_max_age_seconds')),
            minimum=1
        ),
        'session_hard_max_age_seconds': _environment_int(
            'APP_SESSION_HARD_MAX_AGE_SECONDS',
            int(_env_default('session_hard_max_age_seconds')),
            minimum=0
        ),
        'cookie_secure': _environment_bool('APP_COOKIE_SECURE'),
        'trusted_proxies': trusted_proxies,
        'display_cookie_max_age_seconds': int(os.getenv('APP_DISPLAY_COOKIE_MAX_AGE_SECONDS', _env_default('display_cookie_max_age_seconds'))),
        'display_token_ttl_seconds': int(os.getenv('APP_DISPLAY_TOKEN_TTL_SECONDS', _env_default('display_token_ttl_seconds'))),
        'display_token_hard_ttl_seconds': int(os.getenv('APP_DISPLAY_TOKEN_HARD_TTL_SECONDS', _env_default('display_token_hard_ttl_seconds'))),
        # 更新检查默认**关闭**：它要走外网、按固定周期向发布端点上报本机版本与
        'update_checks_enabled': _environment_bool('APP_UPDATE_CHECKS'),
        'update_channel': os.getenv('APP_UPDATE_CHANNEL', _env_default('update_channel')).strip().lower(),
        'update_endpoints': update_endpoints,
        'update_wiki_url': os.getenv('APP_UPDATE_WIKI_URL', '').strip(),
        'ha_request_timeout_seconds': float(os.getenv('APP_HA_REQUEST_TIMEOUT_SECONDS', _env_default('ha_request_timeout_seconds'))),
        'ha_reconcile_interval_seconds': int(os.getenv('APP_HA_RECONCILE_INTERVAL_SECONDS', _env_default('ha_reconcile_interval_seconds'))),
        'ha_websocket_max_size_bytes': int(os.getenv('APP_HA_WEBSOCKET_MAX_SIZE_BYTES', _env_default('ha_websocket_max_size_bytes'))),
        # 硬编码 True：授权校验始终开启，README 明确不能用环境变量关闭（字段默认值也是 True，
        'license_required': True,
        'license_server_url': custom_license_url or SELF_HOSTED_LICENSE_SERVER_URL,
        'license_server_batches': license_batches,
        # 硬件指纹覆盖：留空 = 本机派生（默认）。设了就钉住实例身份 —— 跨服务器
        'hardware_machine_id_override': os.getenv('APP_HARDWARE_MACHINE_ID', '').strip(),
        'hardware_board_id_override': os.getenv('APP_HARDWARE_BOARD_ID', '').strip(),
        'license_request_timeout_seconds': float(os.getenv('APP_LICENSE_REQUEST_TIMEOUT_SECONDS', _env_default('license_request_timeout_seconds'))),
        'license_public_key_path_override': _environment_path('APP_LICENSE_PUBLIC_KEY_FILE'),
        'license_public_key_sha256': os.getenv('APP_LICENSE_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
        # 留空 = keyId 由公钥文件派生（推荐）；显式设置走老路径，轮换需两边同步改。
        'license_key_id_override': os.getenv('APP_LICENSE_KEY_ID', '').strip(),
        'license_trusted_public_keys_override': _environment_trusted_keys('APP_LICENSE_TRUSTED_PUBLIC_KEYS'),
        'license_transport_public_key_path_override': _environment_path('APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE'),
        'license_transport_public_key_sha256': os.getenv('APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        'license_transport_key_id_override': os.getenv('APP_LICENSE_TRANSPORT_KEY_ID', '').strip(),
        # 容器里用环境变量指向挂载的密钥文件（/run/secrets/*）。
        'credential_key_path_override': Path(ha_key_path).expanduser().resolve() if ha_key_path else None,
        'display_pairing_key_path_override': Path(display_pairing_key_path).expanduser().resolve() if display_pairing_key_path else None,
        'license_secret_key_path_override': Path(license_key_path).expanduser().resolve() if license_key_path else None,
        # 首次初始化的引导密钥；留空则由服务端自动生成一份（见 SetupGuard）。
        'setup_token': os.getenv('APP_SETUP_TOKEN', '').strip(),
    })
