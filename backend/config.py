"""运行期配置：常量默认值、环境变量解析与路径推导。

职责边界：本模块只做「读环境变量 → 拼出不可变的 Settings 对象」，
不建立目录、不连数据库、不读密钥文件内容（只给出路径）。

优先级约定：真实环境变量 > 仓库根 `.env`（由 `start.py` 预先载入）> 这里的默认值。
授权相关默认值刻意写成「零配置即指向自建授权服务器」，因此不设任何环境变量
也能在 /license 完成激活。
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

# backend/config.py -> 上溯两层即仓库根，用来定位 frontend/、keys/、VERSION。
PROJECT_ROOT = Path(__file__).resolve().parents[1]
# 授权服务器：本项目自带的 ``store/`` 应用（默认监听 18082），不依赖任何外部厂商节点。
# 体系为「服务端签发 Ed25519 签名租约 → 客户端离线验签 → 定期心跳续租」；信任锚是仓库根
# ``keys/`` 下的公钥镜像，真相源为 ``store/keys/local/``（由 ``start.py`` / 容器生成）。
SELF_HOSTED_LICENSE_SERVER_URL = 'http://127.0.0.1:18082'
# 单条 direct 批次：只访问自建服务器，不会散到其它节点。
DEFAULT_LICENSE_SERVER_BATCHES = (('direct', (SELF_HOSTED_LICENSE_SERVER_URL,)),)
# keyId **由公钥文件派生**（见 `_derive_key_id`），不是身份真相源。这两个常量只在公钥文件
# 读不到时兜底 —— 那时真正的失败在加载密钥那一步，这里只是「不编造一个谁也对不上的名字」。
DEFAULT_LICENSE_KEY_ID = 'hb-local-2026'
DEFAULT_LICENSE_PUBLIC_KEY_FILENAME = 'license-public.pem'
# 签名公钥的文件字节 sha256；必须与 ``store/keys/local/`` 下的私钥配对，不匹配时验签会失败。
# 该常量仅在没有环境变量覆盖时兜底（本地开发与容器部署都会按实际公钥文件字节显式设置），
# 故只有轮换随包分发的 ``keys/`` 公钥时才需与镜像一起改 —— 只手抄一个会让离线验签全数失败。
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = 'a53d869318a3d9005431b0296b9f0d1d7f7b2523e088f0ede322f88c882e0c28'
DEFAULT_LICENSE_TRANSPORT_KEY_ID = 'hb-local-transport-2026'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '1dd4a0a822b9227ebd1032fabd992342f7fb52630cdf2fedfc30db54191b2b19'
#: 上一代签名公钥镜像的文件名：存在就一并登记，让「客户端先升级、服务端后轮换」期间的
#: 租约仍验得过（服务端侧重叠窗口见 ``build_key_registry``）。
#: 公钥表不在此写死 —— ``Settings.license_trusted_public_keys`` 的 keyId 由公钥文件
#: 派生，写死会在轮换后指向旧指纹。
DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME = 'license-public.previous.pem'


def _derive_key_id(public_key_path: Path) -> str | None:
    '''由公钥**文件字节**派生 keyId；读不到文件时返回 None。

    必须与 ``store/licensing/keys.key_id_from_public`` 逐字符一致：两边各读自己
    那份镜像（仓库根 ``keys/`` ↔ ``store/keys/local/``），只要两份字节相同就能
    派生出同一个 id。它们是同一个仓库里的两份代码、没有共享模块可用，改动时
    必须保证两个实现逐字符一致。

    为什么是文件字节而不是公钥本身：客户端校验指纹用的就是文件字节的 sha256，
    复用同一份素材可以少一种「两边算法一致但输入不同」的失败模式。
    '''
    try:
        payload = public_key_path.read_bytes()
    except OSError:
        return None
    return f'hb-{hashlib.sha256(payload).hexdigest()[:16]}'


def _environment_bool(name: str, default: bool = False) -> bool:
    """把环境变量解析成布尔值。

    只有 1 / on / yes / true（大小写与首尾空白不敏感）算真，
    其余非空值一律为假；变量未设置时返回 default。
    """
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in frozenset({'1', 'on', 'yes', 'true'})


def _environment_path(name: str) -> Path | None:
    """把环境变量解析成绝对路径，未设置或为空时返回 None。

    expanduser 支持 `~` 写法，resolve 统一成绝对路径，避免受工作目录影响。
    """
    value = os.getenv(name, '').strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_batches(name: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    '''解析授权服务器批次覆盖项。

    格式：``名称=地址1|地址2;名称2=地址3``，地址可留空（例如 ``esa=``）。
    未设置时返回空元组，表示沿用内置的自建服务器默认批次。
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

    格式：``keyId:公钥文件路径:sha256|keyId2:路径:sha256``，sha256 可省略。
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

    字段用扁平结构而非嵌套，方便直接与 `.env` 变量一一对应；
    数据目录下的各式路径统一用 property 推导，避免调用方各自拼字符串。
    """

    data_dir: Path
    project_root: Path = PROJECT_ROOT
    # 对外访问根地址：反向代理时设置，供 WebSocket 校验 Origin。
    app_base_url: str = ''
    session_max_age_seconds: int = 28800
    # 会话绝对寿命：滑动续期也不能突破它，避免一枚被盗 Cookie 被无限续下去。
    session_hard_max_age_seconds: int = 2592000
    # HTTPS 部署时置 True，否则浏览器会因非 Secure 而丢弃会话 Cookie。
    # 默认 False 不代表「只有显式开启才安全」：请求级判定会自动按 https 加 Secure，
    # 见 http_security.secure_cookies_enabled（这个开关只用于强制开启）。
    cookie_secure: bool = False
    # 可信反向代理的 IP / CIDR 列表。为空表示不信任任何转发头，
    # 此时限流按 TCP 对端地址统计（直连部署下就是真实客户端）。
    trusted_proxies: tuple[str, ...] = ()
    # 更新检查：默认关闭。开启后每 6 小时向发布端点上报本机版本与渠道，
    # 属于可选的发布发现，见 updates.py。
    update_checks_enabled: bool = False
    update_channel: str = 'docker'
    # 发布端点；留空用 updates.RELEASE_ENDPOINTS 里的内置厂商端点。
    update_endpoints: tuple[str, ...] = ()
    # 更新说明页地址；留空用 updates.WIKI_URL 的内置地址。
    update_wiki_url: str = ''
    # Cookie 名沿用历史前缀 ha_bridge_*：改名会让已登录用户全部掉线，故保持不变。
    cookie_name: str = 'ha_bridge_session'
    display_cookie_name: str = 'ha_bridge_display'
    # 中控设备 Cookie 的浏览器侧有效期。服务端另有滑动有效期（见下），
    # 因此这里不需要留十年：只要平板还在轮询，续期就会把它一直推后。
    display_cookie_max_age_seconds: int = 15552000
    # 中控令牌的服务端滑动有效期（默认 180 天）：每次活跃（>= 5 分钟节流）续期。
    # 作用是「长期不用 / 只在攻击者手里的令牌会自己死掉」，而不是定期强迫平板重配。
    display_token_ttl_seconds: int = 15552000
    # 中控令牌的硬上限（默认 0 = 不设）。设成非 0 会强制平板到期重新配对，
    # 安全性更高但会打断「装好就不管」的墙面使用方式，因此留给运维决定。
    display_token_hard_ttl_seconds: int = 0
    ha_request_timeout_seconds: float = 10
    ha_reconcile_interval_seconds: int = 1800
    # 64 MiB：HA 在实体很多时单条状态推送会很大，默认值容易触发断连。
    ha_websocket_max_size_bytes: int = 67108864
    # 授权校验是否开启。**默认值必须与 load_settings 保持一致（都是 True）**：这个字段在 6 处
    # 被读（启动校验、心跳、状态接口、3D 交互授权判定等），不一致会让直接构造 Settings 的入口
    # 拿到「另一种产品」。README 承诺「不能通过环境变量关闭」，故 load_settings 不读相关变量。
    license_required: bool = True
    license_server_url: str = SELF_HOSTED_LICENSE_SERVER_URL
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = DEFAULT_LICENSE_SERVER_BATCHES
    license_request_timeout_seconds: float = 10
    # 允许的时钟偏差，用于容忍租约生效时间比本机时间稍晚的情况。
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    #: 留空 = keyId 由公钥文件派生（见 ``license_key_id`` 属性）。显式赋值仍然生效
    #: （联调脚本与老部署这么用），但那种配置下服务端轮换必须两边同步改名。
    license_key_id_override: str = ''
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    license_transport_key_id_override: str = ''
    # 硬件指纹覆盖项：容器里拿不到真实机器信息时用于人工指定。
    hardware_machine_id_override: str = ''
    hardware_board_id_override: str = ''
    # 三个密钥文件的路径覆盖项；为空时统一落在 data_dir/secrets/ 下。
    credential_key_path_override: Path | None = None
    display_pairing_key_path_override: Path | None = None
    license_secret_key_path_override: Path | None = None
    # 首次初始化的引导密钥（APP_SETUP_TOKEN）。为空时由 SetupGuard 在首次启动生成
    # 一份，落盘到 data_dir/setup-token 并打印到启动日志（容器部署靠它取用）。
    # 它只为「尚未初始化的实例」服务，初始化成功后即作废。
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
    def frontend_dir(self) -> Path:
        """前端页面与静态资源根目录（挂载为 /static）。"""
        return self.project_root / 'frontend'

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
        """硬件指纹回退标识文件：读不到真实硬件信息时用这里的随机值代替。"""
        return self.data_dir / 'hardware-fallback-id'

    @property
    def license_public_key_path(self) -> Path:
        """签名公钥路径，默认取仓库 keys/ 下的镜像。"""
        return self.license_public_key_path_override or self.project_root / 'keys' / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME

    @property
    def license_transport_public_key_path(self) -> Path:
        """传输层公钥路径（X25519），同样是 keys/ 下的镜像。"""
        return self.license_transport_public_key_path_override or self.project_root / 'keys' / DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME

    @property
    def license_key_id(self) -> str:
        """签名 keyId：显式配置优先，否则由公钥文件派生。

        租约里的 ``keyId`` 靠它去可信表里找验签公钥，所以这个值必须与服务端写进
        租约的那个一致 —— 两边都是从**同一份公钥字节**派生的，不需要人工同步字符串。
        文件读不到时退回老常量：那时的失败原因（读不到公钥）比「keyId 对不上」
        更靠前也更清楚。
        """
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

        三种来源按优先级取其一：显式覆盖表（APP_LICENSE_TRUSTED_PUBLIC_KEYS）整体替换；
        只覆盖了单个公钥文件路径时收敛成一条以 license_key_id 为名的记录；否则用仓库 keys/ 下的
        内置镜像。默认表也尊重 ``APP_LICENSE_PUBLIC_KEY_SHA256`` —— 本地 ``start.py`` 只覆盖
        指纹、不改路径，用来对准 ``store/keys/local`` 的开发密钥。

        第 3 种会把 ``license-public.previous.pem`` 一并登记（存在才登记）：这就是客户端侧的
        轮换重叠窗口 —— 服务端还在用上一代密钥签发时，客户端照样验得过。keyId 一律由文件派生，
        所以两张表条目之间不会撞名。
        """
        if self.license_trusted_public_keys_override:
            return {key_id: (path, expected_sha256) for key_id, path, expected_sha256 in self.license_trusted_public_keys_override}
        if self.license_public_key_path_override is not None:
            return {self.license_key_id: (self.license_public_key_path_override, self.license_public_key_sha256)}
        trusted: dict[str, tuple[Path, str | None]] = {
            self.license_key_id: (
                self.project_root / 'keys' / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME,
                self.license_public_key_sha256 or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
            )
        }
        previous = self.project_root / 'keys' / DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME
        previous_key_id = _derive_key_id(previous)
        if previous_key_id:
            trusted[previous_key_id] = (previous, None)
        return trusted

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        """实际生效的授权服务器批次。

        显式配置了批次就用它；否则退化到「esa / eo 两个禁用批次 + direct 单条地址」，
        保留这两个空批次是为了与历史上的批次顺序兼容，空组表示禁用。
        """
        if self.license_server_batches:
            return self.license_server_batches
        if self.license_server_url:
            return (('esa', ()), ('eo', ()), ('direct', (self.license_server_url,)))
        return (('esa', ()), ('eo', ()), ('direct', ()))

    @property
    def version(self) -> str:
        """当前版本号，直接读仓库根的 VERSION 文件。"""
        return (self.project_root / 'VERSION').read_text(encoding='utf-8').strip()


def load_settings() -> Settings:
    """从环境变量组装 Settings；未设置的项一律回落到内置默认值。"""
    data_dir = Path(os.getenv('APP_DATA_DIR', PROJECT_ROOT / 'data')).expanduser().resolve()
    # 三个密钥文件路径先读成字符串，为空表示「用数据目录下的默认位置」。
    ha_key_path = os.getenv('APP_HA_CREDENTIAL_FILE', '').strip()
    display_pairing_key_path = os.getenv('APP_DISPLAY_PAIRING_KEY_FILE', '').strip()
    license_key_path = os.getenv('APP_LICENSE_CREDENTIAL_FILE', '').strip()

    # 授权服务器指向：默认即项目自带的自建授权服务器（store/，18082）；
    # 只给 URL 时自动收敛成单条 direct 批次，避免把请求散到其它批次节点。
    custom_license_url = os.getenv('APP_LICENSE_SERVER_URL', '').strip().rstrip('/')
    custom_license_batches = _environment_batches('APP_LICENSE_SERVER_BATCHES')
    if custom_license_batches:
        license_batches = custom_license_batches
    elif custom_license_url:
        license_batches = (('direct', (custom_license_url,)),)
    else:
        license_batches = DEFAULT_LICENSE_SERVER_BATCHES

    # 用字典展开而非逐项赋值：字段名与变量名对齐，漏改一处也不会静默用错默认值。
    trusted_proxies = tuple(
        piece.strip()
        for piece in os.getenv('APP_TRUSTED_PROXIES', '').split(',')
        if piece.strip()
    )
    # 更新检查的发布端点：留空用内置的厂商端点（见 updates.RELEASE_ENDPOINTS）。
    # 自托管部署想自己掌控这条外发请求时，指向自建节点即可。
    update_endpoints = tuple(
        piece.strip()
        for piece in os.getenv('APP_UPDATE_ENDPOINTS', '').split(',')
        if piece.strip()
    )
    return Settings(**{
        'data_dir': data_dir,
        'app_base_url': os.getenv('APP_BASE_URL', '').strip().rstrip('/'),
        'session_max_age_seconds': int(os.getenv('APP_SESSION_MAX_AGE_SECONDS', '28800')),
        'session_hard_max_age_seconds': int(os.getenv('APP_SESSION_HARD_MAX_AGE_SECONDS', '2592000')),
        'cookie_secure': _environment_bool('APP_COOKIE_SECURE'),
        'trusted_proxies': trusted_proxies,
        'display_cookie_max_age_seconds': int(os.getenv('APP_DISPLAY_COOKIE_MAX_AGE_SECONDS', '15552000')),
        'display_token_ttl_seconds': int(os.getenv('APP_DISPLAY_TOKEN_TTL_SECONDS', '15552000')),
        'display_token_hard_ttl_seconds': int(os.getenv('APP_DISPLAY_TOKEN_HARD_TTL_SECONDS', '0')),
        # 更新检查默认**关闭**：它要走外网、按固定周期向发布端点上报本机版本与
        # 渠道，属于「可选的发布发现」，不该在自托管部署里默认发生。想开就显式设
        # APP_UPDATE_CHECKS=1；端点也能换成自建（APP_UPDATE_ENDPOINTS）。
        'update_checks_enabled': _environment_bool('APP_UPDATE_CHECKS'),
        'update_channel': os.getenv('APP_UPDATE_CHANNEL', 'docker').strip().lower(),
        'update_endpoints': update_endpoints,
        'update_wiki_url': os.getenv('APP_UPDATE_WIKI_URL', '').strip(),
        'ha_request_timeout_seconds': float(os.getenv('APP_HA_REQUEST_TIMEOUT_SECONDS', '10')),
        'ha_reconcile_interval_seconds': int(os.getenv('APP_HA_RECONCILE_INTERVAL_SECONDS', '1800')),
        'ha_websocket_max_size_bytes': int(os.getenv('APP_HA_WEBSOCKET_MAX_SIZE_BYTES', str(67108864))),
        # 硬编码 True：授权校验始终开启，README 明确不能用环境变量关闭（字段默认值也是 True，
        # 两处一致，字段不会撒谎）。内部工具可以显式传 False。
        'license_required': True,
        'license_server_url': custom_license_url or SELF_HOSTED_LICENSE_SERVER_URL,
        'license_server_batches': license_batches,
        'license_request_timeout_seconds': float(os.getenv('APP_LICENSE_REQUEST_TIMEOUT_SECONDS', '10')),
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
