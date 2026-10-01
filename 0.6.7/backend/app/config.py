# [补充说明] 运行期配置：常量默认值、环境变量解析与路径推导。
#
# 职责边界：本模块只做「读环境变量 → 拼出不可变的 Settings 对象」，
# 不建立目录、不连数据库、不读密钥文件内容（只给出路径）。
#
# 优先级约定：真实环境变量 > 仓库根 `.env`（由 `start.py` 预先载入）> 这里的默认值。
# 授权相关的默认值指向随包分发的生产节点与公钥指纹，可用 APP_LICENSE_SERVER_URL /
# APP_LICENSE_SERVER_BATCHES 等环境变量整体覆盖。
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# backend/app/config.py -> 上溯两层即仓库根，用来定位 frontend/、image/、VERSION。
PROJECT_ROOT = Path(__file__).resolve().parents[2]
# 生产授权服务器：直连节点（direct）与两批中继节点（esa / eo）。轮换时整组替换。
PRODUCTION_LICENSE_SERVER_URL = 'https://hbjh1.habridge.cn'
PRODUCTION_LICENSE_ESA_SERVERS = ('https://hbjheas1.onestrm.cn', 'https://hbjheas2.onestrm.cn')
PRODUCTION_LICENSE_EO_SERVERS = ('https://hbjheo1.onestrm.cn', 'https://hbjheo2.onestrm.cn')
PRODUCTION_LICENSE_DIRECT_SERVERS = (PRODUCTION_LICENSE_SERVER_URL, 'https://hbjh2.habridge.cn')
#: 批次顺序即尝试顺序：先走两个中继批次，都不可用时才直连。
PRODUCTION_LICENSE_SERVER_BATCHES = (
    ('esa', PRODUCTION_LICENSE_ESA_SERVERS),
    ('eo', PRODUCTION_LICENSE_EO_SERVERS),
    ('direct', PRODUCTION_LICENSE_DIRECT_SERVERS),
)
#: 当前一代签名密钥的 keyId 与公钥文件字节 sha256；租约里的 keyId 靠它去可信表里找验签公钥。
PRODUCTION_LICENSE_CURRENT_KEY_ID = 'hb-2026-01'
PRODUCTION_LICENSE_PUBLIC_KEY_SHA256 = '56ad5028f6a48378b2475be119bed0dc912d317c399b94726e7ba43c3c8beab7'
#: 传输层（X25519）密钥的 keyId 与指纹：参与 HKDF 与 AAD，必须与服务端一字不差。
PRODUCTION_LICENSE_TRANSPORT_KEY_ID = 'hb-transport-2026-01'
PRODUCTION_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '5b9856b097de0fecb3699a4fae7c698de1cfbe60046e7658f345c1e95c6018d8'
#: 可信签名公钥表：(keyId, 仓库 keys/ 下的文件名, 期望 sha256)。
PRODUCTION_LICENSE_TRUSTED_PUBLIC_KEYS = (
    (
        PRODUCTION_LICENSE_CURRENT_KEY_ID,
        'license-public.pem',
        PRODUCTION_LICENSE_PUBLIC_KEY_SHA256,
    ),
)


def _environment_bool(name: str, default: bool = False) -> bool:
    # [补充说明] 把环境变量解析成布尔值。
    #
    # 只有 1 / on / yes / true（大小写与首尾空白不敏感）算真，
    # 其余非空值一律为假；变量未设置时返回 default。
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'on', 'yes', 'true'}


@dataclass(frozen=True)
class Settings:
    # [补充说明] 一次运行期内不可变的配置快照。
    #
    # 字段用扁平结构而非嵌套，方便直接与 `.env` 变量一一对应；
    # 数据目录下的各式路径统一用 property 推导，避免调用方各自拼字符串。

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 对外访问根地址：反向代理时设置，供 WebSocket 校验 Origin。
    app_base_url: str = ''
    session_max_age_seconds: int = 28800
    # HTTPS 部署时置 True，否则浏览器会因非 Secure 而丢弃会话 Cookie。
    cookie_secure: bool = False
    # 更新检查：开启后按固定周期向发布端点上报本机版本与渠道（见 updates.py）。
    update_checks_enabled: bool = False
    update_channel: str = 'docker'
    # Cookie 名沿用历史前缀 ha_bridge_*：改名会让已登录用户全部掉线，故保持不变。
    cookie_name: str = 'ha_bridge_session'
    display_cookie_name: str = 'ha_bridge_display'
    # 中控设备 Cookie 的浏览器侧有效期（默认十年）：服务端按 last_seen_at 滑动判定，
    # 只要平板还在轮询，续期就会把它一直推后。
    display_cookie_max_age_seconds: int = 315360000
    ha_request_timeout_seconds: float = 10
    ha_reconcile_interval_seconds: int = 1800
    # 64 MiB：HA 在实体很多时单条状态推送会很大，默认值容易触发断连。
    ha_websocket_max_size_bytes: int = 67108864
    # 授权校验开关。字段默认 False，但 load_settings 会硬编码成 True —— 生产入口始终开启，
    # README 承诺「不能通过环境变量关闭」，也没有任何环境变量开关。
    license_required: bool = False
    license_server_url: str = PRODUCTION_LICENSE_SERVER_URL
    # 留空 = 用 PRODUCTION_LICENSE_SERVER_BATCHES（见 effective_license_server_batches）。
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = ()
    license_request_timeout_seconds: float = 10
    # 允许的时钟偏差，用于容忍租约生效时间比本机时间稍晚的情况。
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    #: 上一代签名 keyId：只覆盖了单个公钥文件路径时，用它给这条收敛记录命名。
    license_legacy_key_id: str = PRODUCTION_LICENSE_CURRENT_KEY_ID
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = PRODUCTION_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    license_transport_key_id: str = PRODUCTION_LICENSE_TRANSPORT_KEY_ID
    # 硬件指纹覆盖项：留空 = 由本机机器 / 主板标识派生。显式设置会钉住实例身份，
    # 用于容器里拿不到稳定标识、以及跨服务器迁移时沿用旧身份。改动这两项等价于换设备。
    hardware_machine_id_override: str = ''
    hardware_board_id_override: str = ''
    # 三个密钥文件的路径覆盖项；为空时统一落在 data_dir/secrets/ 下。
    credential_key_path_override: Path | None = None
    display_pairing_key_path_override: Path | None = None
    license_secret_key_path_override: Path | None = None

    @property
    def database_path(self) -> Path:
        # [补充说明] 主应用 SQLite 主库文件。
        return self.data_dir / 'app.db'

    @property
    def database_url(self) -> str:
        # [补充说明] SQLAlchemy 连接串（本项目只用 SQLite）。
        return f'sqlite:///{self.database_path}'

    @property
    def admin_account_path(self) -> Path:
        # [补充说明] 管理员账号文件；删除该文件并重启即可回到设置页。
        return self.data_dir / 'admin-account.json'

    @property
    def frontend_dir(self) -> Path:
        # [补充说明] 前端页面与静态资源根目录（挂载为 /static）。
        return self.project_root / 'frontend'

    @property
    def built_in_assets_dir(self) -> Path:
        # [补充说明] 内置素材目录，默认空；可自行增删，编辑器里也能改用用户上传图片。
        return self.project_root / 'image'

    @property
    def user_assets_dir(self) -> Path:
        # [补充说明] 用户上传图片目录。
        return self.data_dir / 'assets'

    @property
    def studio3d_dir(self) -> Path:
        # [补充说明] 3D 户型工作室的数据目录。
        return self.data_dir / 'studio3d'

    @property
    def studio3d_draft_path(self) -> Path:
        # [补充说明] 工作室草稿文件，前端自动保存即写到这里。
        return self.studio3d_dir / 'draft.json'

    @property
    def studio3d_exports_dir(self) -> Path:
        # [补充说明] 3D 导出产物目录（户型图、图层 PNG 等）。
        return self.data_dir / 'exports'

    @property
    def effect_variants_dir(self) -> Path:
        # [补充说明] 灯光效果变体缓存目录，属于可再生数据，可安全清理。
        return self.data_dir / 'cache' / 'effect-variants'

    @property
    def secrets_dir(self) -> Path:
        # [补充说明] 各类凭据密钥的默认存放目录（权限 0700）。
        return self.data_dir / 'secrets'

    @property
    def credential_key_path(self) -> Path:
        # [补充说明] HA 凭据加密密钥；用于加密长期访问令牌后再入库。
        return self.credential_key_path_override or self.secrets_dir / 'ha_credentials.key'

    @property
    def display_pairing_key_path(self) -> Path:
        # [补充说明] 中控配对令牌的签名密钥。
        return self.display_pairing_key_path_override or self.secrets_dir / 'display_pairing_codes.key'

    @property
    def license_secret_key_path(self) -> Path:
        # [补充说明] 本机授权凭据的加密密钥。
        return self.license_secret_key_path_override or self.secrets_dir / 'license_credentials.key'

    @property
    def instance_id_path(self) -> Path:
        # [补充说明] 硬件指纹派生实例 ID 的缓存文件（由 LicenseService 写入）。
        return self.data_dir / 'instance-id'

    @property
    def hardware_fallback_id_path(self) -> Path:
        # [补充说明] 硬件指纹回退标识文件：读不到真实硬件信息时用这里的随机值代替。
        return self.data_dir / 'hardware-fallback-id'

    @property
    def license_public_key_path(self) -> Path:
        # [补充说明] 签名公钥路径，默认取仓库 keys/ 下的镜像。
        return self.license_public_key_path_override or self.project_root / 'keys' / 'license-public.pem'

    @property
    def license_transport_public_key_path(self) -> Path:
        # [补充说明] 传输层公钥路径（X25519），同样是 keys/ 下的镜像。
        return self.license_transport_public_key_path_override or self.project_root / 'keys' / 'license-transport-public.pem'

    @property
    def license_trusted_public_keys(self) -> dict[str, tuple[Path, str | None]]:
        # [补充说明] 可信公钥表 keyId -> (路径, 期望 sha256)。
        #
        # 三种来源按优先级取其一：显式覆盖表（APP_LICENSE_TRUSTED_PUBLIC_KEYS）整体替换；
        # 只覆盖了单个公钥文件路径时收敛成一条以 license_legacy_key_id 为名的记录；
        # 否则用随包分发的 PRODUCTION_LICENSE_TRUSTED_PUBLIC_KEYS，按文件名映射到仓库 keys/ 下。
        return (
            {key_id: (path, expected_sha256) for key_id, path, expected_sha256 in self.license_trusted_public_keys_override}
            if self.license_trusted_public_keys_override
            else {self.license_legacy_key_id: (self.license_public_key_path_override, self.license_public_key_sha256)}
            if self.license_public_key_path_override is not None
            else {key_id: (self.project_root / 'keys' / filename, expected_sha256) for key_id, filename, expected_sha256 in PRODUCTION_LICENSE_TRUSTED_PUBLIC_KEYS}
        )

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        # [补充说明] 实际生效的授权服务器批次。
        #
        # 显式配置了批次就用它；否则退化到「esa / eo 两个禁用批次 + direct 单条地址」，
        # 保留这两个空批次是为了与历史上的批次顺序兼容，空组表示禁用。
        return (
            self.license_server_batches
            if self.license_server_batches
            else (('esa', ()), ('eo', ()), ('direct', (self.license_server_url,)))
            if self.license_server_url
            else (('esa', ()), ('eo', ()), ('direct', ()))
        )

    @property
    def version(self) -> str:
        # [补充说明] 当前版本号，直接读仓库根的 VERSION 文件。
        return (self.project_root / 'VERSION').read_text(encoding='utf-8').strip()


def load_settings() -> Settings:
    # [补充说明] 从环境变量组装 Settings；未设置的项一律回落到内置默认值。
    data_dir = Path(os.getenv('APP_DATA_DIR', PROJECT_ROOT / 'data')).expanduser().resolve()
    # 三个密钥文件路径先读成字符串，为空表示「用数据目录下的默认位置」。
    ha_key_path = os.getenv('APP_HA_CREDENTIAL_FILE', '').strip()
    display_pairing_key_path = os.getenv('APP_DISPLAY_PAIRING_KEY_FILE', '').strip()
    license_key_path = os.getenv('APP_LICENSE_CREDENTIAL_FILE', '').strip()
    # 用字典展开而非逐项赋值：字段名与变量名对齐，漏一项会在构造时报错而不是静默用错值。
    # 授权服务器与公钥指纹在这里**固定成随包分发的生产默认值**；license_required 在生产恒为
    # True —— 不提供环境变量开关，README 承诺「不能通过环境变量关闭」。
    return Settings(**{
        'data_dir': data_dir,
        'app_base_url': os.getenv('APP_BASE_URL', '').strip().rstrip('/'),
        'session_max_age_seconds': int(os.getenv('APP_SESSION_MAX_AGE_SECONDS', '28800')),
        'cookie_secure': _environment_bool('APP_COOKIE_SECURE'),
        'update_checks_enabled': True,
        'update_channel': os.getenv('APP_UPDATE_CHANNEL', 'docker').strip().lower(),
        'ha_request_timeout_seconds': float(os.getenv('APP_HA_REQUEST_TIMEOUT_SECONDS', '10')),
        'ha_reconcile_interval_seconds': int(os.getenv('APP_HA_RECONCILE_INTERVAL_SECONDS', '1800')),
        'ha_websocket_max_size_bytes': int(os.getenv('APP_HA_WEBSOCKET_MAX_SIZE_BYTES', str(67108864))),
        'license_required': True,
        'license_server_url': PRODUCTION_LICENSE_SERVER_URL,
        'license_server_batches': PRODUCTION_LICENSE_SERVER_BATCHES,
        'license_request_timeout_seconds': float(os.getenv('APP_LICENSE_REQUEST_TIMEOUT_SECONDS', '10')),
        'license_public_key_sha256': PRODUCTION_LICENSE_PUBLIC_KEY_SHA256,
        'license_legacy_key_id': PRODUCTION_LICENSE_CURRENT_KEY_ID,
        'license_transport_public_key_sha256': PRODUCTION_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        'license_transport_key_id': PRODUCTION_LICENSE_TRANSPORT_KEY_ID,
        # 容器里用环境变量指向挂载的密钥文件（/run/secrets/*）。
        'credential_key_path_override': Path(ha_key_path).expanduser().resolve() if ha_key_path else None,
        'display_pairing_key_path_override': Path(display_pairing_key_path).expanduser().resolve() if display_pairing_key_path else None,
        'license_secret_key_path_override': Path(license_key_path).expanduser().resolve() if license_key_path else None,
    })
