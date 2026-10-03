"""容器启动期的授权公钥同步：把授权商店写出的公钥镜像到主应用读取的 keys/。

主应用自己不生成授权密钥——私钥只在商店那边。这里按 PEM 文件字节同步，并按同步后的
实际文件算出 sha256 注入 APP_LICENSE_*_SHA256。指纹必须现算：商店首次启动会随机生成
密钥对，写死常量必然对不上，主应用自检只会报「指纹不匹配」而看不出真正原因。

本模块是仓库内唯一一份公钥同步实现，调用方：ops/container_entrypoint.py、
ops/start.py、ops/docker/start_store.py、ops/docker/start_app.py。密钥生成只在
商店侧，见 ensure_store_keys。
"""
from __future__ import annotations

import hashlib
import importlib
import os
from pathlib import Path

SIGNING_PUBLIC_KEY_FILENAME = 'license-public.pem'
TRANSPORT_PUBLIC_KEY_FILENAME = 'license-transport-public.pem'
PUBLIC_KEY_MARKER = b'-----BEGIN PUBLIC KEY-----'

DEFAULT_STORE_KEYS_DIR = Path(__file__).resolve().parents[1] / 'homeos-store' / 'keys' / 'local'
DEFAULT_CLIENT_KEYS_DIR = Path(__file__).resolve().parents[1] / 'keys'


def public_key_sha256(path: Path) -> str:
    """公钥文件字节的 sha256，与主应用 config 的校验口径一致。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def derive_key_id(path: Path) -> str:
    """由公钥文件派生 keyId（hb-<sha256 前 16 位>），口径同商店侧。"""
    return f'hb-{public_key_sha256(path)[:16]}'


def _mirror_public(sync_dir: Path, source: Path | None, name: str) -> bool:
    """按字节同步一个公钥；返回是否发生了变更。

    来源缺失时清掉残留：在同步目录里留下过期的公钥会让旧客户端被无限期放行
    （主应用侧 license_trusted_public_keys 只看文件在不在）。
    """
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
        target.chmod(0o644)
    target.write_bytes(payload)
    target.chmod(0o644)
    return True


def sync_client_keys(
    sync_dir: Path,
    sources: tuple[tuple[Path, str], ...],
) -> list[str]:
    """把商店公钥镜像到主应用目录；返回发生变更的文件名。"""
    sync_dir.mkdir(parents=True, exist_ok=True)
    sync_dir.chmod(0o755)
    changed: list[str] = []
    for source, name in sources:
        if _mirror_public(sync_dir, source, name):
            changed.append(name)
    return changed


def apply_client_key_env(environment: dict, client_keys_dir: Path) -> dict:
    """按已同步的公钥目录写入主应用的路径与指纹环境变量。"""
    signing = client_keys_dir / SIGNING_PUBLIC_KEY_FILENAME
    transport = client_keys_dir / TRANSPORT_PUBLIC_KEY_FILENAME
    environment['APP_LICENSE_PUBLIC_KEY_FILE'] = str(signing)
    environment['APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE'] = str(transport)
    environment['APP_LICENSE_PUBLIC_KEY_SHA256'] = public_key_sha256(signing)
    environment['APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256'] = public_key_sha256(transport)
    return environment


def keys_ready(directory: Path) -> bool:
    """目录里两个公钥是否都已是完整 PEM。"""
    def ok(path: Path) -> bool:
        try:
            payload = path.read_bytes()
        except OSError:
            return False
        return bool(payload) and PUBLIC_KEY_MARKER in payload

    return all(ok(directory / name) for name in (SIGNING_PUBLIC_KEY_FILENAME, TRANSPORT_PUBLIC_KEY_FILENAME))


def _licensing_keys_module():
    """取商店的密钥模块。

    本模块在**两套布局**下都会被 import：源码/开发是 ``src.licensing.keys``（源码目录就叫
    src），发行产物是 ``app.licensing.keys``（构建时把 src 映射成 app，见 Dockerfile）。
    所以按候选名逐个探测，而不是写死其中一个。
    """
    for name in ('src.licensing.keys', 'app.licensing.keys'):
        try:
            return importlib.import_module(name)
        except ImportError:
            continue
    raise ImportError('找不到商店密钥模块（src.licensing.keys / app.licensing.keys）')


def ensure_store_keys(keys_dir: Path) -> None:
    """确保商店私钥存在；这是本模块里唯一会生成密钥的地方。

    商店自身在默认目录下缺密钥时直接报错（不自动生成），所以启动器得先备好。
    """
    license_keys = _licensing_keys_module()

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
    """商店公钥来源目录：显式参数 > STORE_LICENSE_KEYS_DIR > 同机默认位置。"""
    if explicit:
        return Path(explicit).expanduser()
    configured = os.getenv('STORE_LICENSE_KEYS_DIR', '').strip()
    return Path(configured).expanduser() if configured else DEFAULT_STORE_KEYS_DIR


def client_keys_dir(explicit: str | Path | None = None) -> Path:
    """主应用读取公钥的目录：显式参数 > APP_CLIENT_KEYS_DIR > 项目内 keys/。"""
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
    """同机部署：把商店公钥同步到主应用目录，并把指纹写进环境变量。

    返回写入的覆盖项；空字典表示商店公钥还没就位——此时什么都不做，让主应用的信任锚
    自检给出精确报错，而不是在这里猜。读不到来源目录也不抛异常，避免把同一件事说两遍。
    """
    _log = log or (lambda message: print(f'授权公钥：{message}', flush=True))
    source_dir = store_keys_dir(store_dir)
    target = client_keys_dir(target_dir)

    signing = source_dir / SIGNING_PUBLIC_KEY_FILENAME
    transport = source_dir / TRANSPORT_PUBLIC_KEY_FILENAME
    if not signing.is_file() or not transport.is_file():
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
    )
    if changed:
        _log(f'已同步商店授权公钥到 {target}：{"、".join(changed)}')
    if environment is not None:
        apply_client_key_env(environment, target)
    _log(f'就绪目录 {target}（签名 keyId={derive_key_id(target / SIGNING_PUBLIC_KEY_FILENAME)}）')
    return _env_overrides(target)


def _env_overrides(target: Path) -> dict[str, str]:
    """供调用方直接注入子进程的环境变量覆盖项。"""
    return {
        'APP_LICENSE_PUBLIC_KEY_FILE': str(target / SIGNING_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE': str(target / TRANSPORT_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_PUBLIC_KEY_SHA256': public_key_sha256(target / SIGNING_PUBLIC_KEY_FILENAME),
        'APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256': public_key_sha256(target / TRANSPORT_PUBLIC_KEY_FILENAME),
    }
