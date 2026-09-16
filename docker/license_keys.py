"""容器启动共用的授权密钥准备逻辑。"""
from __future__ import annotations

import hashlib
from pathlib import Path


def _public_key_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_client_keys(sync_dir: Path, sources: tuple[tuple[Path, str], ...]) -> None:
    """把商店公钥镜像到主应用读取的目录（按 PEM 文件字节同步）。"""
    sync_dir.mkdir(parents=True, exist_ok=True)
    sync_dir.chmod(0o755)
    for source, name in sources:
        target = sync_dir / name
        if target.exists():
            target.chmod(0o644)
        target.write_bytes(source.read_bytes())
        target.chmod(0o644)


def ensure_store_license_keys(
    keys_dir: Path,
    client_keys_dir: Path,
) -> tuple[str, str]:
    """确保商店私钥存在，并同步公钥到 client_keys_dir。

    返回:
        (签名公钥 sha256, 传输公钥 sha256)
    """
    # 延迟导入：主应用镜像不包含 store 包，只有商店启动路径会走到这里。
    from store.licensing import keys as license_keys

    keys_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    client_keys_dir.mkdir(parents=True, exist_ok=True, mode=0o755)

    signing = license_keys.generate_ed25519(
        license_keys.KeyPairPaths(
            keys_dir / "license-private.pem",
            keys_dir / "license-public.pem",
        )
    )
    transport = license_keys.generate_x25519(
        license_keys.KeyPairPaths(
            keys_dir / "license-transport-private.pem",
            keys_dir / "license-transport-public.pem",
        )
    )
    if signing.created:
        print(f"已生成授权签名密钥：sha256={signing.sha256}", flush=True)
    if transport.created:
        print(f"已生成授权传输密钥：sha256={transport.sha256}", flush=True)

    sync_client_keys(
        client_keys_dir,
        (
            (signing.public_path, "license-public.pem"),
            (transport.public_path, "license-transport-public.pem"),
        ),
    )
    return (
        _public_key_sha256(client_keys_dir / "license-public.pem"),
        _public_key_sha256(client_keys_dir / "license-transport-public.pem"),
    )


def apply_client_key_env(environment: dict[str, str], client_keys_dir: Path) -> dict[str, str]:
    """根据已同步的公钥目录写入主应用指纹环境变量。"""
    public_path = client_keys_dir / "license-public.pem"
    transport_public_path = client_keys_dir / "license-transport-public.pem"
    environment["APP_LICENSE_PUBLIC_KEY_FILE"] = str(public_path)
    environment["APP_LICENSE_TRANSPORT_PUBLIC_KEY_FILE"] = str(transport_public_path)
    environment["APP_LICENSE_PUBLIC_KEY_SHA256"] = _public_key_sha256(public_path)
    environment["APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256"] = _public_key_sha256(
        transport_public_path
    )
    return environment
