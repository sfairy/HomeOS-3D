# [补充说明] 容器启动期的授权公钥同步：把授权商店写出的公钥镜像到主应用读取的 keys/。
#
# 主应用自己不生成授权密钥——私钥只在商店那边。这里只做两件事：
#   1. 按 PEM **文件字节**把商店公钥同步到主应用目录（同机部署走共享卷）；
#   2. 按同步后的实际文件算出 sha256，注入 APP_LICENSE_*_SHA256。
#
# 为什么指纹必须现算而不能写死常量：商店首次启动是**随机生成**密钥对的，常量必然对不上，
# 主应用启动自检会直接报「公钥指纹不匹配」，而真正的原因（商店换了一代密钥）看不出来。
#
# 本模块是仓库内**唯一**一份公钥同步实现，四个调用方都复用它：
#   ops/container_entrypoint.py（容器入口，降权前同步）、ops/start.py（本地 dev）、
#   ops/docker/start_store.py（商店容器）、ops/docker/start_app.py（主应用容器）。
# 密钥**生成**仍然只在商店侧，见 ensure_store_keys。
from __future__ import annotations

import hashlib
import os
from pathlib import Path

#: 公钥文件名（与 backend/src/config.py 的 DEFAULT_LICENSE_*_FILENAME 保持一致）。
SIGNING_PUBLIC_KEY_FILENAME = 'license-public.pem'
TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
#: 上一代签名公钥：密钥轮换的重叠窗口内仍要参与验签。
PREVIOUS_SIGNING_PUBLIC_KEY_FILENAME = 'license-public.previous.pem'
#: 公钥都是 SubjectPublicKeyInfo，PEM 头一致；用来判断「文件是不是写完整了」。
PUBLIC_KEY_MARKER = b'-----BEGIN PUBLIC KEY-----'

# 本文件住在 ops/ 下：上溯一层就是工作区根（keys/ 与 homeos-store/ 都摆在那一层）。
#: 同机部署时商店写出的默认公钥目录。
DEFAULT_STORE_KEYS_DIR = Path(__file__).resolve().parents[1] / 'homeos-store' / 'keys' / 'local'
#: 主应用读取公钥的默认目录。
DEFAULT_CLIENT_KEYS_DIR = Path(__file__).resolve().parents[1] / 'keys'


def public_key_sha256(path: Path) -> str:
    # [补充说明] 公钥**文件字节**的 sha256；与主应用 config 的校验口径一致。
    return hashlib.sha256(path.read_bytes()).hexdigest()


def derive_key_id(path: Path) -> str:
    # [补充说明] 由公钥文件派生 keyId（hb-<sha256 前 16 位>），口径同商店侧。
    return f'hb-{public_key_sha256(path)[:16]}'


def _mirror_public(sync_dir: Path, source: Path | None, name: str) -> bool:
    # [补充说明] 按字节同步一个公钥；返回是否发生了变更。
    #
    # 来源缺失时清掉残留：轮换窗口结束后，上一代宽限公钥必须跟着消失，否则旧租约会被
    # 无限期放行（主应用侧 license_trusted_public_keys 只看文件在不在）。
    target = sync_dir / name
    if source is None or not source.is_file():
        if target.exists():
            target.unlink()
            return True
        return False
    payload = source.read_bytes()
    if target.is_file() and target.read_bytes() == payload:
        return False
    if target.exists():
        # 先补写位：文件可能被上一次以只读方式留下（属主仍是本进程），此时直接写会 EACCES。
        target.chmod(0o644)
    target.write_bytes(payload)
    target.chmod(0o644)
    return True


def sync_client_keys(
    sync_dir: Path,
    sources: tuple[tuple[Path, str], ...],
    *,
    previous: Path | None = None,
) -> list[str]:
    # [补充说明] 把商店公钥镜像到主应用目录；返回发生变更的文件名。
    #
    # previous 是轮换重叠窗口内仍在用的上一代签名公钥：同机部署走共享卷而不是
    # ``GET /v2/keys``，所以必须和商店端点一样把它一起带过去。
    sync_dir.mkdir(parents=True, exist_ok=True)
    sync_dir.chmod(0o755)
    changed: list[str] = []
    for source, name in sources:
        if _mirror_public(sync_dir, source, name):
            changed.append(name)
    if _mirror_public(sync_dir, previous, PREVIOUS_SIGNING_PUBLIC_KEY_FILENAME):
        changed.append(PREVIOUS_SIGNING_PUBLIC_KEY_FILENAME)
    return changed


def apply_client_key_env(environment: dict, client_keys_dir: Path) -> dict:
    # [补充说明] 按已同步的公钥目录写入主应用的路径与指纹环境变量。
    signing = client_keys_dir / SIGNING_PUBLIC_KEY_FILENAME
    transport = client_keys_dir / TRANSPORT_PUBLIC_KEY_FILENAME
    environment['APP_LICENSE_PUBLIC_KEY_FILE'] = str(signing)
    environment['APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE'] = str(transport)
    environment['APP_LICENSE_PUBLIC_KEY_SHA256'] = public_key_sha256(signing)
    environment['APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256'] = public_key_sha256(transport)
    return environment


def keys_ready(directory: Path) -> bool:
    # [补充说明] 目录里两个公钥都已是完整 PEM。
    def ok(path: Path) -> bool:
        try:
            payload = path.read_bytes()
        except OSError:
            return False
        return bool(payload) and PUBLIC_KEY_MARKER in payload

    return all(ok(directory / name) for name in (SIGNING_PUBLIC_KEY_FILENAME, TRANSPORT_PUBLIC_KEY_FILENAME))


def ensure_store_keys(keys_dir: Path) -> None:
    # [补充说明] 确保商店私钥存在；这是本模块里**唯一**会生成密钥的地方。
    #
    # 生成只发生在商店侧：主应用镜像里没有 store 包，所以延迟导入；能走到这里的只有
    # ops/start.py（本地开发）与 ops/docker/start_store.py（商店容器）。
    #
    # 为什么必须保留这一步：本地 dev 把 STORE_LICENSE_KEYS_DIR 指到商店默认目录，
    # 而商店自身在默认目录下缺密钥时是**直接报错**（不自动生成），所以启动器得先备好。
    from src.licensing import keys as license_keys

    keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)

    signing = license_keys.generate_ed25519(
        license_keys.KeyPairPaths(
            keys_dir / 'license-private.pem',
            keys_dir / SIGNING_PUBLIC_KEY_FILENAME,
        )
    )
    transport = license_keys.generate_x25519(
        license_keys.KeyPairPaths(
            keys_dir / 'license-transport-private.pem',
            keys_dir / TRANSPORT_PUBLIC_KEY_FILENAME,
        )
    )
    if signing.created:
        print(f'已生成授权签名密钥：sha256={signing.sha256}', flush=True)
    if transport.created:
        print(f'已生成授权传输密钥：sha256={transport.sha256}', flush=True)


def store_keys_dir(explicit: str | Path | None = None) -> Path:
    # [补充说明] 商店公钥来源目录：显式参数 > STORE_LICENSE_KEYS_DIR > 同机默认位置。
    if explicit:
        return Path(explicit).expanduser()
    configured = os.getenv('STORE_LICENSE_KEYS_DIR', '').strip()
    return Path(configured).expanduser() if configured else DEFAULT_STORE_KEYS_DIR


def client_keys_dir(explicit: str | Path | None = None) -> Path:
    # [补充说明] 主应用读取公钥的目录：显式参数 > APP_CLIENT_KEYS_DIR > 项目内 keys/。
    if explicit:
        return Path(explicit).expanduser()
    configured = os.getenv('APP_CLIENT_KEYS_DIR', '').strip()
    return Path(configured).expanduser() if configured else DEFAULT_CLIENT_KEYS_DIR


def sync_store_keys(
    *,
    store_dir: str | Path | None = None,
    target_dir: str | Path | None = None,
    environment: dict | None = None,
    log=None,
) -> dict[str, str]:
    # [补充说明] 同机部署：把商店公钥同步到主应用目录，并把指纹写进环境变量。
    #
    # 返回写入的覆盖项；返回空字典表示商店公钥还没就位（此时什么都不做，让主应用的
    # 信任锚自检给出精确报错，而不是在这里猜）。
    #
    # 读不到来源目录时**不抛异常**：主应用自己会在启动期校验公钥并给出可定位的错误，
    # 这里再抛一次只会把同一件事说两遍，还可能盖住更有用的原因。
    _log = log or (lambda message: print(f'授权公钥：{message}', flush=True))
    source_dir = store_keys_dir(store_dir)
    target = client_keys_dir(target_dir)

    signing = source_dir / SIGNING_PUBLIC_KEY_FILENAME
    transport = source_dir / TRANSPORT_PUBLIC_KEY_FILENAME
    if not signing.is_file() or not transport.is_file():
        # 商店还没生成密钥，或共享卷尚未就绪。若目标目录已有可用的公钥就照旧使用。
        if keys_ready(target):
            _log(f'未找到商店公钥（{source_dir}），沿用已有目录 {target}。')
            if environment is not None:
                apply_client_key_env(environment, target)
            return _env_overrides(target)
        _log(f'警告：未找到商店公钥（{source_dir}），且 {target} 也没有可用公钥。')
        return {}

    changed = sync_client_keys(
        target,
        (
            (signing, SIGNING_PUBLIC_KEY_FILENAME),
            (transport, TRANSPORT_PUBLIC_KEY_FILENAME),
        ),
        previous=source_dir / PREVIOUS_SIGNING_PUBLIC_KEY_FILENAME,
    )
    if changed:
        _log(f'已同步商店授权公钥到 {target}：{"、".join(changed)}')
    if environment is not None:
        apply_client_key_env(environment, target)
    _log(f'就绪目录 {target}（签名 keyId={derive_key_id(target / SIGNING_PUBLIC_KEY_FILENAME)}）')
    return _env_overrides(target)


def _env_overrides(target: Path) -> dict[str, str]:
    # [补充说明] 供调用方直接注入子进程的环境变量覆盖项。
    return {
        'APP_LICENSE_PUBLIC_KEY_FILE': str(target / SIGNING_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE': str(target / TRANSPORT_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_PUBLIC_KEY_SHA256': public_key_sha256(target / SIGNING_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256': public_key_sha256(target / TRANSPORT_PUBLIC_KEY_FILENAME),
    }
