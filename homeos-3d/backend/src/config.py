# [补充说明] 运行期配置：常量默认值、环境变量解析与路径推导。
#
# 职责边界：本模块只做「读环境变量 → 拼出不可变的 Settings 对象」，
# 不建立目录、不连数据库、不读密钥文件内容（只给出路径）。
#
# 优先级约定：真实环境变量 > 仓库根 `.env`（由 `start.py` 预先载入）> 这里的默认值。
# 授权相关默认值指向随包分发的自托管授权商店（homeos-store，默认 8802）。keyId 与公钥
# 指纹从 keys/ 下实际落盘的公钥文件派生 / 由启动器注入，不写死在常量里（商店首次启动
# 随机生成密钥对）；可用 APP_LICENSE_SERVER_URL / APP_LICENSE_SERVER_BATCHES /
# APP_LICENSE_*_SHA256 等环境变量覆盖。
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

# backend/src/config.py -> 上溯两层即仓库根，用来定位 frontend/、image/、VERSION。
PROJECT_ROOT = Path(__file__).resolve().parents[2]
# 再上溯一层是工作区根：单体仓库里 keys/ 与实际授权商店都摆在那一层。
REPO_ROOT = Path(__file__).resolve().parents[3]
# 授权服务器：随包分发的自托管授权商店（homeos-store，默认监听 8802），不依赖任何外部厂商节点。
SELF_HOSTED_LICENSE_SERVER_URL = 'http://127.0.0.1:8802'
# 单条 direct 批次：只访问自建服务器，不散到其它节点。
DEFAULT_LICENSE_SERVER_BATCHES = (('direct', (SELF_HOSTED_LICENSE_SERVER_URL,)),)
# keyId **由公钥文件字节派生**（见 `_derive_key_id`），不是身份真相源。这两个常量只在公钥
# 文件还读不到时兜底 —— 商店首次启动就是随机生成密钥对的，写死 keyId 必然与租约对不上。
DEFAULT_LICENSE_KEY_ID = 'hb-local-2026'
DEFAULT_LICENSE_PUBLIC_KEY_FILENAME = 'license-public.pem'
#: 随包指纹 = 本地商店 keys/local 同步过来的那一代（见启动器的公钥同步）。
DEFAULT_LICENSE_PUBLIC_KEY_SHA256 = 'a53d869318a3d9005431b0296b9f0d1d7f7b2523e088f0ede322f88c882e0c28'
DEFAULT_LICENSE_TRANSPORT_KEY_ID = 'hb-local-transport-2026'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256 = '1dd4a0a822b9227ebd1032fabd992342f7fb52630cdf2fedfc30db54191b2b19'
#: 上一代签名公钥镜像的文件名：存在就一并登记，让「客户端先升级、服务端后轮换」期间的
#: 旧租约仍能验签。
DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME = 'license-public.previous.pem'
# 商店（homeos-store）对外地址：登录页「忘记密码」与编辑器授权对话框「前往商店」都指向它。
# 默认值沿用厂商公网商店；自托管部署用 APP_STORE_URL 覆盖（局域网 http://<商店IP>:8802，
# 或接了真实证书的反代 https://store.example.com）。注意这是给**浏览器**点的地址，
# 不是 license_server_url —— 后者默认指向 127.0.0.1，只对服务端出站有意义。
DEFAULT_STORE_URL = 'https://pay.homeos.cn'


def _derive_key_id(public_key_path: Path) -> str | None:
    # [补充说明] 由公钥**文件字节**派生 keyId（hb-<sha256 前 16 位>）；读不到文件返回 None。
    #
    # 口径必须与商店侧 ``licensing.keys.key_id_from_public`` 一字不差：keyId 参与
    # 传输层 HKDF 的 info 与 AAD，也对应用户端可信表的条目名，差一个字符就是「全部验签失败」。
    try:
        payload = public_key_path.read_bytes()
    except OSError:
        return None
    return f'hb-{hashlib.sha256(payload).hexdigest()[:16]}'


def _read_baked_version() -> str:
    # [补充说明] 构建期烘进镜像的版本号（Dockerfile 生成 ``backend/src/_version.py``
    # 后编译成扩展）。源码运行时该模块不存在，返回空串让调用方回落到 package.json。
    try:
        from ._version import __version__ as baked  # type: ignore[import-not-found]
    except ImportError:
        return ''
    return str(baked).strip()


def _read_package_version() -> str:
    # [补充说明] 仓库根 ``package.json`` 的 ``version`` —— 源码运行时的版本权威源。
    #
    # 源码布局是 ``homeos-3d/backend/src/config.py``，所以按候选路径逐个探测；
    # 镜像里 ``__file__`` 是 ``/app/backend/src/config*.so``，这条会落空，此时用烘入值。
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
    # [补充说明] 把环境变量解析成布尔值。
    #
    # 只有 1 / on / yes / true（大小写与首尾空白不敏感）算真，
    # 其余非空值一律为假；变量未设置时返回 default。
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'on', 'yes', 'true'}


def _environment_path(name: str) -> Path | None:
    # [补充说明] 把环境变量解析成绝对路径；未设置或为空时返回 None。
    #
    # 授权公钥路径就靠它注入（APP_LICENSE_PUBLIC_KEY_FILE 等）：启动器按实际落盘位置
    # 指过来，配置文件不用改，容器里换挂载点也不必重新打包。
    value = os.getenv(name, '').strip()
    return Path(value).expanduser().resolve() if value else None


def _environment_batches(name: str) -> tuple[tuple[str, tuple[str, ...]], ...]:
    # [补充说明] 解析授权服务器批次覆盖项（APP_LICENSE_SERVER_BATCHES）。
    #
    # 格式：``标签=地址1|地址2;标签2=地址3``；标签留空归到 direct。
    # 返回空元组表示「没有覆盖」，调用方据此回落到默认批次。
    value = os.getenv(name, '').strip()
    if not value:
        return ()
    # 先声明成 list 再转 tuple：Settings 是 frozen dataclass，内部用可变类型更易拼装。
    groups: list[tuple[str, tuple[str, ...]]] = []
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
    # 商店对外地址（浏览器可访问），供前端拼「商店 / 忘记密码」入口；见 load_settings 的 APP_STORE_URL。
    store_url: str = DEFAULT_STORE_URL
    session_max_age_seconds: int = 28800
    # HTTPS 部署时置 True，否则浏览器会因非 Secure 而丢弃会话 Cookie。
    cookie_secure: bool = False
    # 更新检查：开启后按固定周期向发布端点上报本机版本与渠道（见 updates.py）。
    update_checks_enabled: bool = False
    update_channel: str = 'docker'
    # Cookie 名使用 homeos_* 前缀，与会话与展示端 Cookie 保持一致。
    cookie_name: str = 'homeos_session'
    display_cookie_name: str = 'homeos_display'
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
    license_server_url: str = SELF_HOSTED_LICENSE_SERVER_URL
    # 留空 = 用 DEFAULT_LICENSE_SERVER_BATCHES（见 effective_license_server_batches）。
    license_server_batches: tuple[tuple[str, tuple[str, ...]], ...] = ()
    license_request_timeout_seconds: float = 10
    # 允许的时钟偏差，用于容忍租约生效时间比本机时间稍晚的情况。
    license_clock_skew_seconds: int = 300
    license_public_key_path_override: Path | None = None
    license_public_key_sha256: str | None = None
    #: 签名 keyId：留空 = 由公钥文件派生（见 license_key_id 属性）。
    license_key_id_override: str = ''
    license_trusted_public_keys_override: tuple[tuple[str, Path, str | None], ...] = ()
    license_transport_public_key_path_override: Path | None = None
    license_transport_public_key_sha256: str = DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256
    #: 传输 keyId：留空 = 由公钥文件派生（见 license_transport_key_id 属性）。
    license_transport_key_id_override: str = ''
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
        #
        # 前端是 Vite 构建产物：页面 HTML 与 /static/** 都从 dist/ 提供，
        # 不直接读 frontend/ 源码目录（源码里的 .ts / 未打包 import 浏览器跑不了）。
        # HOMEOS_FRONTEND_DIR 可覆盖本项（例如本地 vite dev 时指回源码目录）。
        override = _environment_path('HOMEOS_FRONTEND_DIR')
        if override is not None:
            return override
        # 容器布局：镜像把前端产物拷进 /app/dist（见 Dockerfile 的 app 阶段）。
        built = self.project_root / 'dist'
        if built.is_dir():
            return built
        # 工作区布局：构建产物统一收敛在工作区根 dist/homeos-3d/frontend，
        # 与源码树彻底分离（见 ops/build.py 与 frontend/vite.config.ts 的 outDir）。
        workspace_built = REPO_ROOT / 'dist' / 'homeos-3d' / 'frontend'
        if workspace_built.is_dir():
            return workspace_built
        return self.project_root / 'frontend'

    @property
    def runtime_dir(self) -> Path:
        # [补充说明] 3D 交互运行时资源根目录（由 api/modules/interaction3d 按清单下发）。
        return self.frontend_dir / 'modules' / 'runtime'

    @property
    def runtime_manifest_path(self) -> Path:
        # [补充说明] 3D 交互运行时的资源清单，由 frontend/vite.runtime.config.ts 构建时生成。
        # 后端据此校验可下发的 runtime 资源，取代原先手写的白名单字典。
        return self.runtime_dir / 'manifest.json'

    @property
    def public_static_manifest_path(self) -> Path:
        # [补充说明] 匿名静态资源清单，由 frontend/vite.config.ts 构建时生成。
        # 未初始化 / 未登录 / 未激活时也必须能加载的资源都在这里。
        return self.frontend_dir / 'public-static.json'

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

    def _keys_dir(self) -> Path:
        # [补充说明] 授权公钥目录：优先项目内 keys/，单体仓库回落到工作区根 keys/。
        #
        # 项目内 keys/ 由启动器写入；只跑主应用时也可以挂工作区根 keys/（商店写出的共享镜像）。
        local = self.project_root / 'keys'
        shared = REPO_ROOT / 'keys'
        if local.is_dir():
            return local
        return shared if shared.is_dir() else local

    @property
    def license_public_key_path(self) -> Path:
        # [补充说明] 签名公钥路径，默认取 keys/ 下由商店同步来的镜像。
        return self.license_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME

    @property
    def license_transport_public_key_path(self) -> Path:
        # [补充说明] 传输层公钥路径（X25519），同样是 keys/ 下的镜像。
        return self.license_transport_public_key_path_override or self._keys_dir() / DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_FILENAME

    @property
    def license_key_id(self) -> str:
        # [补充说明] 签名 keyId：一律由公钥文件派生（口径同商店侧），读不到文件才用常量兜底。
        #
        # 租约里带的就是这个派生 keyId；它必须能在 license_trusted_public_keys 里查到公钥，
        # 否则表现是「所有租约都不可信」——启动器的路径注入恰好会走到这条分支。
        if self.license_key_id_override:
            return self.license_key_id_override
        return _derive_key_id(self.license_public_key_path) or DEFAULT_LICENSE_KEY_ID

    @property
    def license_transport_key_id(self) -> str:
        # [补充说明] 传输 keyId：默认由公钥文件派生，参与 HKDF 与 AAD，必须与服务端一字不差。
        if self.license_transport_key_id_override:
            return self.license_transport_key_id_override
        return _derive_key_id(self.license_transport_public_key_path) or DEFAULT_LICENSE_TRANSPORT_KEY_ID

    @property
    def license_trusted_public_keys(self) -> dict[str, tuple[Path, str | None]]:
        # [补充说明] 可信公钥表 keyId -> (路径, 期望 sha256)。
        #
        # 三种来源按优先级取其一：显式覆盖表（APP_LICENSE_TRUSTED_PUBLIC_KEYS）整体替换；
        # 只覆盖了单个公钥文件路径时收敛成一条派生 keyId 的记录；
        # 否则用 keys/ 下的镜像 —— 当前代按文件字节核对指纹，上一代只登记不核对。
        if self.license_trusted_public_keys_override:
            return {
                key_id: (path, expected_sha256)
                for key_id, path, expected_sha256 in self.license_trusted_public_keys_override
            }
        if self.license_public_key_path_override is not None:
            # keyId 用**派生**值：租约里带的就是它（启动器注入路径后仍要能查到）。
            trusted: dict[str, tuple[Path, str | None]] = {
                self.license_key_id: (self.license_public_key_path_override, self.license_public_key_sha256)
            }
            # 上一代签名公钥与当前公钥同目录（启动器把商店的宽限公钥一起带过来）：
            # 少了它，服务端轮换密钥后的窗口内旧租约会全部验签失败。
            previous = self.license_public_key_path_override.parent / DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME
            previous_key_id = _derive_key_id(previous)
            if previous_key_id and previous_key_id not in trusted:
                trusted[previous_key_id] = (previous, None)
            return trusted
        keys_dir = self._keys_dir()
        trusted = {
            self.license_key_id: (
                keys_dir / DEFAULT_LICENSE_PUBLIC_KEY_FILENAME,
                self.license_public_key_sha256 or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
            )
        }
        # 上一代公钥不核对指纹：它本就是被换下去的那把，路径存在即登记，由验签结果说话。
        previous = keys_dir / DEFAULT_LICENSE_PREVIOUS_PUBLIC_KEY_FILENAME
        previous_key_id = _derive_key_id(previous)
        if previous_key_id and previous_key_id not in trusted:
            trusted[previous_key_id] = (previous, None)
        return trusted

    @property
    def effective_license_server_batches(self) -> tuple[tuple[str, tuple[str, ...]], ...]:
        # [补充说明] 实际生效的授权服务器批次。
        #
        # 显式配置了批次就用它；否则退化到「direct 单条地址」，未配置地址时为空。
        # 不必再补 esa / eo 空占位：LicenseEndpointPool._normalize_batches 会为三个批次名
        # 都建好键，candidates() 的批次顺序也写死在池内，空组既不参与选路也不影响顺序。
        return (
            self.license_server_batches or ((('direct', (self.license_server_url,)),)
            if self.license_server_url
            else ())
        )

    @property
    def version(self) -> str:
        # [补充说明] 当前版本号。
        #
        # 三级回退，与商店 ``homeos-store/backend/src/__init__.py`` 的口径一致：
        # 1. 构建期烘进镜像的 ``_version.py``（Dockerfile 生成后编译成扩展）；
        # 2. 仓库根 ``package.json`` 的 ``version``（源码运行的唯一权威源）；
        # 3. 兜底 ``"0.0.0"``。
        #
        # 不能只读 ``project_root / 'VERSION'``：镜像的 app 阶段从不 COPY 该文件，
        # 导入期取版本会直接 FileNotFoundError，主应用容器起不来。
        return _read_baked_version() or _read_package_version() or '0.0.0'


def load_settings() -> Settings:
    # [补充说明] 从环境变量组装 Settings；未设置的项一律回落到内置默认值。
    data_dir = Path(os.getenv('APP_DATA_DIR', PROJECT_ROOT / 'data')).expanduser().resolve()
    # 三个密钥文件路径先读成字符串，为空表示「用数据目录下的默认位置」。
    ha_key_path = os.getenv('APP_HA_CREDENTIAL_FILE', '').strip()
    display_pairing_key_path = os.getenv('APP_DISPLAY_PAIRING_KEY_FILE', '').strip()
    license_key_path = os.getenv('APP_LICENSE_CREDENTIAL_FILE', '').strip()
    # 用字典展开而非逐项赋值：字段名与变量名对齐，漏一项会在构造时报错而不是静默用错值。
    # 授权服务器地址与公钥指纹可被环境变量覆盖（见下方各项），license_required 在生产恒为
    # True —— 不提供环境变量开关，README 承诺「不能通过环境变量关闭」。
    return Settings(**{
        'data_dir': data_dir,
        'app_base_url': os.getenv('APP_BASE_URL', '').strip().rstrip('/'),
        # 留空 / 未设置 = 厂商公网商店；尾部斜杠在这里统一去掉，前端拼路径时不会出现双斜杠。
        'store_url': os.getenv('APP_STORE_URL', '').strip().rstrip('/') or DEFAULT_STORE_URL,
        'session_max_age_seconds': int(os.getenv('APP_SESSION_MAX_AGE_SECONDS', '28800')),
        'cookie_secure': _environment_bool('APP_COOKIE_SECURE'),
        'update_checks_enabled': True,
        'update_channel': os.getenv('APP_UPDATE_CHANNEL', 'docker').strip().lower(),
        'ha_request_timeout_seconds': float(os.getenv('APP_HA_REQUEST_TIMEOUT_SECONDS', '10')),
        'ha_reconcile_interval_seconds': int(os.getenv('APP_HA_RECONCILE_INTERVAL_SECONDS', '1800')),
        'ha_websocket_max_size_bytes': int(os.getenv('APP_HA_WEBSOCKET_MAX_SIZE_BYTES', str(67108864))),
        'license_required': True,
        # 授权服务器地址与批次可被环境变量覆盖：同机部署指向本地商店，分拆部署指向远程商店。
        # 硬件指纹覆盖项：留空 = 由本机机器 / 主板标识派生（授权实例 ID 的来源）。
        # 显式设置会钉住实例身份，用于容器拿不到稳定标识、以及跨机迁移沿用旧身份。
        'hardware_machine_id_override': os.getenv('APP_HARDWARE_MACHINE_ID', '').strip(),
        'hardware_board_id_override': os.getenv('APP_HARDWARE_BOARD_ID', '').strip(),
        'license_server_url': os.getenv('APP_LICENSE_SERVER_URL', '').strip().rstrip('/') or SELF_HOSTED_LICENSE_SERVER_URL,
        'license_server_batches': _environment_batches('APP_LICENSE_SERVER_BATCHES') or DEFAULT_LICENSE_SERVER_BATCHES,
        'license_request_timeout_seconds': float(os.getenv('APP_LICENSE_REQUEST_TIMEOUT_SECONDS', '10')),
        # 指纹优先取启动器注入的值（按公钥文件实际字节算出），常量只是兜底。
        'license_public_key_sha256': os.getenv('APP_LICENSE_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_PUBLIC_KEY_SHA256,
        'license_transport_public_key_sha256': os.getenv('APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256', '').strip() or DEFAULT_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256,
        'license_transport_key_id_override': os.getenv('APP_LICENSE_TRANSPORT_KEY_ID', '').strip(),
        # 公钥路径可由启动器注入：它把商店公钥同步到目标目录后，直接指向那份文件。
        'license_public_key_path_override': _environment_path('APP_LICENSE_PUBLIC_KEY_FILE'),
        'license_transport_public_key_path_override': _environment_path('APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE'),
        # 容器里用环境变量指向挂载的密钥文件（/run/secrets/*）。
        'credential_key_path_override': Path(ha_key_path).expanduser().resolve() if ha_key_path else None,
        'display_pairing_key_path_override': Path(display_pairing_key_path).expanduser().resolve() if display_pairing_key_path else None,
        'license_secret_key_path_override': Path(license_key_path).expanduser().resolve() if license_key_path else None,
    })
