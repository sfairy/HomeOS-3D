"""主应用启动期的授权公钥自举。

主应用自己不生成授权密钥：私钥只在商店那边，公钥必须从**目标商店**取得。为了不再
依赖人工 `scp`，容器启动时向授权服务器要一份 —— 这是唯一走明文的原因：那一刻双方还
没有共享传输公钥（X25519 请求体加密依赖它），只能直接读。

公钥不是秘密（租约真伪由 Ed25519 验签保证），所以端点可以公开；真正要防的是「被换成
别的密钥对」，因此本模块坚持：

* **一致性**：返回的 PEM 必须与它声明的 sha256 相符，且必须是 PEM 公钥。

取回结果落盘到数据卷（`APP_CLIENT_KEYS_DIR`），因此首次之后即使授权服务器暂时不可达，
主应用也能照常离线启动。
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

SIGNING_PUBLIC_KEY_FILENAME = "license-public.pem"
TRANSPORT_PUBLIC_KEY_FILENAME = "license-transport-public.pem"

PUBLIC_KEY_MARKER = b"-----BEGIN PUBLIC KEY-----"
MAX_PEM_BYTES = 4096

KEYS_PATH = "/v2/keys"
FETCH_TIMEOUT_SECONDS = 10.0
RETRY_INTERVAL_SECONDS = 3.0
FIRST_FETCH_WAIT_SECONDS = 120.0


class LicenseKeyFetchError(RuntimeError):
    """取回授权公钥失败（网络、格式、指纹或连续性校验不通过）。"""


def _key_path(directory: Path, name: str) -> Path:
    return directory / name


def _is_pem(path: Path) -> bool:
    try:
        payload = path.read_bytes()
    except OSError:
        return False
    return bool(payload) and PUBLIC_KEY_MARKER in payload


def keys_ready(directory: Path) -> bool:
    """目录里是否已有可用的两个公钥。"""
    return all(
        _is_pem(_key_path(directory, name))
        for name in (SIGNING_PUBLIC_KEY_FILENAME, TRANSPORT_PUBLIC_KEY_FILENAME)
    )


def public_key_sha256(path: Path) -> str:
    """公钥**文件字节**的 sha256；与商店侧 ``key_id_from_public`` 同一口径。"""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def derive_key_id(path: Path) -> str:
    """由公钥文件派生 keyId（``hb-<sha256 前 16 位>``），口径同商店侧。"""
    return f"hb-{public_key_sha256(path)[:16]}"


def _write_public(path: Path, payload: bytes) -> None:
    """原子写公钥（0644）：容器里跑的是 uid 1000，权限错会让下次启动读不到。"""
    temporary = path.with_name(f".{path.name}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(payload)
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)


def _decode_pem(value: object, label: str) -> bytes:
    """把响应里的 PEM 字段校验成字节；不合规直接拒绝。"""
    if not isinstance(value, str) or PUBLIC_KEY_MARKER.decode("ascii") not in value:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}不是 PEM 公钥。")
    payload = value.encode("utf-8")
    if len(payload) > MAX_PEM_BYTES:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}异常偏大（{len(payload)} 字节）。")
    return payload


def _check_fingerprint(payload: dict, field: str, actual: str, label: str) -> None:
    """响应必须自带指纹且与正文相符：挡住截断、串包与中间设备改写。"""
    declared = payload.get(field)
    if not isinstance(declared, str) or not declared.strip():
        raise LicenseKeyFetchError(f"授权服务器没有声明{label}的指纹，拒绝采用。")
    if declared.strip().lower() != actual:
        raise LicenseKeyFetchError(f"授权服务器返回的{label}与它声明的指纹不一致，拒绝采用。")


def fetch_license_keys(license_server_url: str) -> dict:
    """向授权服务器取一份公钥响应（明文 GET，见模块文档）。"""
    url = f"{license_server_url.rstrip('/')}{KEYS_PATH}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})  # noqa: S310  # 同上：URL 来自配置，非外部输入
    try:
        with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:  # noqa: S310  # URL 来自配置的授权服务器地址，非外部输入
            raw = response.read()
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            body = json.loads(error.read().decode("utf-8"))
            if isinstance(body, dict):
                detail = str(body.get("detail", "")).strip()
        except Exception:
            detail = ""
        raise LicenseKeyFetchError(
            f"授权服务器拒绝公钥请求（HTTP {error.code}）"
            + (f"：{detail}" if detail else "。")
        ) from error
    except (urllib.error.URLError, OSError) as error:
        hint = ""
        if url.startswith("https://"):
            hint = (
                " 若跨机部署用的是商店内置反代的 HTTPS 端口，它用的是自签证书，"
                "本容器默认不信任；请改用商店的 HTTP 端口（如 http://<商店IP>:8802），"
                "或在镜像外换成带可信任证书的反代。"
            )
        raise LicenseKeyFetchError(f"无法连接授权服务器取回公钥（{url}）：{error}{hint}") from error
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise LicenseKeyFetchError(f"授权服务器返回的公钥响应不是合法 JSON（{url}）。") from error
    if not isinstance(payload, dict):
        raise LicenseKeyFetchError(f"授权服务器返回的公钥响应格式无效（{url}）。")
    return payload


def apply_license_keys(directory: Path, payload: dict, *, log: Callable[[str], None]) -> bool:
    """把取回的公钥落到 ``directory``；返回是否发生了变更。

    校验不通过时抛 ``LicenseKeyFetchError``，且**不改动**任何已有文件。
    """
    signing = _decode_pem(payload.get("licensePublicKey"), "签名公钥")
    transport = _decode_pem(payload.get("licenseTransportPublicKey"), "传输公钥")
    signing_sha256 = hashlib.sha256(signing).hexdigest()
    transport_sha256 = hashlib.sha256(transport).hexdigest()
    _check_fingerprint(payload, "licensePublicKeySha256", signing_sha256, "签名公钥")
    _check_fingerprint(payload, "licenseTransportPublicKeySha256", transport_sha256, "传输公钥")

    signing_path = _key_path(directory, SIGNING_PUBLIC_KEY_FILENAME)
    transport_path = _key_path(directory, TRANSPORT_PUBLIC_KEY_FILENAME)

    changed = True
    if _is_pem(signing_path) and public_key_sha256(signing_path) == signing_sha256:
        changed = False

    directory.mkdir(parents=True, exist_ok=True)
    wanted = [(transport_path, transport)]
    if changed:
        wanted.append((signing_path, signing))
    for path, content in wanted:
        if _is_pem(path) and path.read_bytes() == content:
            continue
        _write_public(path, content)

    log(
        f"授权公钥已同步：keyId={derive_key_id(signing_path)}"
        f" 签名 sha256={signing_sha256[:16]}… 传输 sha256={transport_sha256[:16]}…"
    )
    return changed


def _fetch_enabled(environment: dict[str, str]) -> bool:
    raw = environment.get("APP_CLIENT_KEYS_FETCH", "").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def ensure_client_keys(
    directory: Path,
    *,
    license_server_url: str,
    environment: dict[str, str],
    retry_seconds: float,
    log: Callable[[str], None],
) -> bool:
    """确保 ``directory`` 里有可用的授权公钥；返回目录是否已就绪。

    只读目录（同机部署时商店写出的共享卷）一律不动：那里由商店侧维护。
    """
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    if not os.access(directory, os.W_OK):
        log(f"授权公钥目录只读，交由商店侧维护：{directory}")
        return keys_ready(directory)

    if not _fetch_enabled(environment):
        log("已按 APP_CLIENT_KEYS_FETCH 关闭公钥自动取回。")
        return keys_ready(directory)

    if not license_server_url:
        log("未配置 APP_LICENSE_SERVER_URL：无法自动取回授权公钥。")
        return keys_ready(directory)

    ready = keys_ready(directory)
    if ready:
        log(f"授权公钥已在本地：{directory}")
    deadline = time.monotonic() + retry_seconds
    last_error: LicenseKeyFetchError | None = None
    while True:
        try:
            payload = fetch_license_keys(license_server_url)
            apply_license_keys(directory, payload, log=log)
            return True
        except LicenseKeyFetchError as error:
            last_error = error
        if ready:
            log(f"警告：{last_error} 沿用本地已有的授权公钥。")
            return True
        if time.monotonic() >= deadline:
            raise SystemExit(
                f"{last_error}\n"
                f"取回授权公钥超时（{retry_seconds:.0f}s，目录 {directory}）。\n"
                f"请确认主应用能访问授权服务器 {license_server_url}"
                "（分拆部署检查网络与端口；同机部署检查商店容器是否已启动）。"
            )
        time.sleep(RETRY_INTERVAL_SECONDS)
