"""容器启动共用的授权密钥准备逻辑。"""
from __future__ import annotations

import hashlib
from pathlib import Path


def _public_key_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _mirror_public(sync_dir: Path, source: Path | None, name: str) -> None:
    """按 PEM 文件字节同步一个公钥。

    来源缺失时清掉残留：密钥轮换窗口结束后，上一代宽限公钥必须跟着消失，否则旧租约会被
    无限期放行（主应用侧 ``config.license_trusted_public_keys`` 只看文件在不在）。
    """
    target = sync_dir / name
    if source is None or not source.is_file():
        target.unlink(missing_ok=True)
        return
    if target.exists():
        # 先补写位：文件可能被上一次以只读方式留下（属主仍是本进程），此时直接写会 EACCES。
        target.chmod(0o644)
    target.write_bytes(source.read_bytes())
    target.chmod(0o644)


def sync_client_keys(
    sync_dir: Path,
    sources: tuple[tuple[Path, str], ...],
    *,
    previous: Path | None = None,
) -> None:
    """把商店公钥镜像到主应用读取的目录（按 PEM 文件字节同步）。

    ``previous`` 是轮换重叠窗口内仍在用的上一代签名公钥；同机部署走共享卷而不是
    ``GET /v2/keys``，所以这里必须和商店端点一样把它一起带过去。
    """
    sync_dir.mkdir(parents=True, exist_ok=True)
    sync_dir.chmod(0o755)
    for source, name in sources:
        _mirror_public(sync_dir, source, name)
    _mirror_public(sync_dir, previous, "license-public.previous.pem")


def ensure_store_license_keys(
    keys_dir: Path,
    client_keys_dir: Path,
) -> tuple[str, str]:
    """确保商店私钥存在，并同步公钥到 client_keys_dir。
    """
    # 延迟导入：主应用镜像不包含 store 包，只有商店启动路径会走到这里。
    from src.licensing import keys as license_keys

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
        # 轮换期间商店会把上一代签名公钥就地保留成 ``*.previous.pem``（四件套齐全才开启
        # 重叠窗口），共享卷这条路也要把它带过去，否则同机部署的旧租约会验签失败。
        previous=license_keys.previous_path(signing.public_path),
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
