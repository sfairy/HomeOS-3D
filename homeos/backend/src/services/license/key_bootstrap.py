"""启动期向授权商店取回授权公钥（对齐 ``modules/license/key-bootstrap.ts``）。

取回 Ed25519 验签公钥 + X25519 传输公钥并落盘；指纹口径与商店侧 ``key_id_from_public`` 一致。
公钥不是秘密（租约真伪由 Ed25519 验签保证），此端点是商店唯一的明文授权端点。
"""

from __future__ import annotations

import hashlib
import os
from collections.abc import Callable, Mapping
from pathlib import Path

import httpx

from .crypto import LicenseCryptoError, derive_key_id, public_key_sha256

SIGNING_PUBLIC_KEY_FILENAME = "license-public.pem"
TRANSPORT_PUBLIC_KEY_FILENAME = "license-transport-public.pem"

PUBLIC_KEY_MARKER = "-----BEGIN PUBLIC KEY-----"
MAX_PEM_BYTES = 4096
KEYS_PATH = "/v2/keys"
FETCH_TIMEOUT_SECONDS = 10.0


class LicenseKeyFetchError(Exception):
    """取回授权公钥失败（网络、格式、指纹或一致性校验不通过）。"""


def _is_pem(path: Path) -> bool:
    try:
        payload = path.read_bytes()
    except OSError:
        return False
    return len(payload) > 0 and PUBLIC_KEY_MARKER.encode("ascii") in payload


def keys_ready(directory: str | os.PathLike[str]) -> bool:
    """目录里是否已有可用的两个公钥。"""
    base = Path(directory)
    return _is_pem(base / SIGNING_PUBLIC_KEY_FILENAME) and _is_pem(
        base / TRANSPORT_PUBLIC_KEY_FILENAME
    )


def _write_public(path: Path, payload: bytes) -> None:
    """原子写公钥（0644）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / f".{path.name}.tmp"
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        os.write(descriptor, payload)
    finally:
        os.close(descriptor)
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def _decode_pem(value: object, label: str) -> bytes:
    if not isinstance(value, str) or PUBLIC_KEY_MARKER not in value:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}不是 PEM 公钥。")
    payload = value.encode("utf-8")
    if len(payload) > MAX_PEM_BYTES:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}异常偏大（{len(payload)} 字节）。")
    return payload


def _check_fingerprint(payload: dict, field: str, actual: str, label: str) -> None:
    declared = payload.get(field)
    if not isinstance(declared, str) or not declared.strip():
        raise LicenseKeyFetchError(f"授权服务器没有声明{label}的指纹，拒绝采用。")
    if declared.strip().lower() != actual:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}与它声明的指纹不一致，拒绝采用。")


async def fetch_license_keys(license_server_url: str) -> dict:
    """向授权服务器取一份公钥响应（明文 GET）。"""
    url = f"{license_server_url.rstrip('/')}{KEYS_PATH}"
    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers={"Accept": "application/json"})
    except Exception as exc:  # noqa: BLE001
        hint = (
            " 若跨机部署用的是商店内置反代的 HTTPS 端口，它用的是自签证书，本进程默认不信任；"
            "请改用商店的 HTTP 端口（如 http://<商店IP>:8802）。"
            if url.startswith("https://")
            else ""
        )
        raise LicenseKeyFetchError(f"无法连接授权服务器取回公钥（{url}）：{exc}{hint}") from exc
    if response.status_code >= 400:
        detail = ""
        try:
            body = response.json()
            if isinstance(body, dict) and isinstance(body.get("detail"), str):
                detail = body["detail"].strip()
        except Exception:  # noqa: BLE001
            detail = ""
        raise LicenseKeyFetchError(
            f"授权服务器拒绝公钥请求（HTTP {response.status_code}）{f'：{detail}' if detail else '。'}"
        )
    try:
        parsed = response.json()
    except Exception as exc:  # noqa: BLE001
        raise LicenseKeyFetchError(f"授权服务器返回的公钥响应不是合法 JSON（{url}）。") from exc
    if not isinstance(parsed, dict):
        raise LicenseKeyFetchError(f"授权服务器返回的公钥响应格式无效（{url}）。")
    return parsed


def apply_license_keys(
    directory: str | os.PathLike[str], payload: dict, log: Callable[[str], None]
) -> bool:
    """校验并把取回的公钥落到目录；校验不通过时绝不改动任何已有文件。"""
    signing = _decode_pem(payload.get("licensePublicKey"), "签名公钥")
    transport = _decode_pem(payload.get("licenseTransportPublicKey"), "传输公钥")
    signing_sha256 = hashlib.sha256(signing).hexdigest()
    transport_sha256 = hashlib.sha256(transport).hexdigest()
    _check_fingerprint(payload, "licensePublicKeySha256", signing_sha256, "签名公钥")
    _check_fingerprint(payload, "licenseTransportPublicKeySha256", transport_sha256, "传输公钥")

    base = Path(directory)
    signing_path = base / SIGNING_PUBLIC_KEY_FILENAME
    transport_path = base / TRANSPORT_PUBLIC_KEY_FILENAME

    try:
        signing_unchanged = _is_pem(signing_path) and public_key_sha256(signing_path) == signing_sha256
    except LicenseCryptoError:
        signing_unchanged = False
    signing_changed = not signing_unchanged

    base.mkdir(parents=True, exist_ok=True)
    wanted: list[tuple[Path, bytes]] = [(transport_path, transport)]
    if signing_changed:
        wanted.append((signing_path, signing))
    for path, content in wanted:
        if _is_pem(path):
            try:
                if path.read_bytes() == content:
                    continue
            except OSError:
                pass
        _write_public(path, content)
    log(
        f"授权公钥已同步：keyId={derive_key_id(signing_path)}"
        f" 签名 sha256={signing_sha256[:16]}… 传输 sha256={transport_sha256[:16]}…"
    )
    return signing_changed


def _fetch_enabled(env: Mapping[str, str]) -> bool:
    raw = str(env.get("APP_CLIENT_KEYS_FETCH") or "").strip().lower()
    return raw not in ("0", "false", "no", "off")


async def ensure_client_keys(
    directory: str | os.PathLike[str],
    *,
    license_server_url: str,
    env: Mapping[str, str] | None = None,
    log: Callable[[str], None],
) -> bool:
    """确保目录里有可用的授权公钥。

    只读目录（同机部署时商店写出的共享卷）一律不动；本地已有公钥时取回失败也能离线放行。
    """
    source: Mapping[str, str] = env if env is not None else os.environ
    try:
        Path(directory).mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    ready = keys_ready(directory)
    if not _fetch_enabled(source):
        log("已按 APP_CLIENT_KEYS_FETCH 关闭公钥自动取回。")
        return ready
    if not license_server_url:
        log("未配置 APP_LICENSE_SERVER_URL：无法自动取回授权公钥。")
        return ready
    if ready:
        log(f"授权公钥已在本地：{directory}")
    try:
        payload = await fetch_license_keys(license_server_url)
        apply_license_keys(directory, payload, log)
        return True
    except Exception as exc:  # noqa: BLE001
        if ready:
            log(f"警告：{exc} 沿用本地已有的授权公钥。")
            return True
        raise


__all__ = [
    "SIGNING_PUBLIC_KEY_FILENAME",
    "TRANSPORT_PUBLIC_KEY_FILENAME",
    "LicenseKeyFetchError",
    "apply_license_keys",
    "ensure_client_keys",
    "keys_ready",
]
