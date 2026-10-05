"""设备指纹稳定生成工具（对齐 ``modules/license/fingerprint.util.ts``）。

按优先级采集 /etc/machine-id、macOS IOPlatformUUID、Windows MachineGuid，
全部失败时落盘随机 ``device.id``。
"""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from .constants import LICENSE_HWID_SALT, LICENSE_HWID_SALT_MAC, LICENSE_HWID_SALT_WIN

_MAC_UUID_PATTERN = re.compile(r'"IOPlatformUUID"\s*=\s*"([^"]+)"')
_WIN_GUID_PATTERN = re.compile(r"MachineGuid\s+REG_SZ\s+(\S+)", re.IGNORECASE)


def _to_hwid_hex(material: str, salt: str) -> str:
    return hashlib.sha256((material + salt).encode("utf-8")).hexdigest()


def _default_exec_mac_uuid() -> str | None:
    if sys.platform != "darwin":
        return None
    try:
        out = subprocess.run(
            ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        ).stdout
    except Exception:  # noqa: BLE001
        return None
    match = _MAC_UUID_PATTERN.search(out or "")
    return match.group(1) if match else None


def _default_exec_win_machine_guid() -> str | None:
    if sys.platform != "win32":
        return None
    try:
        out = subprocess.run(
            ["reg", "query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        ).stdout
    except Exception:  # noqa: BLE001
        return None
    match = _WIN_GUID_PATTERN.search(out or "")
    return match.group(1).strip() if match else None


def _read_persisted_device_id(
    internal_dir: str,
    exists: Callable[[Path], bool],
    read_file: Callable[[Path], str],
) -> str | None:
    try:
        fallback_path = Path(internal_dir) / "device.id"
        if not exists(fallback_path):
            return None
        raw_id = read_file(fallback_path).strip()
        if not raw_id:
            return None
        return _to_hwid_hex(raw_id, LICENSE_HWID_SALT)
    except Exception:  # noqa: BLE001
        return None


def generate_hardware_fingerprint(
    *,
    internal_dir: str,
    bypass_fingerprint: str | None = None,
    machine_id_path: str = "/etc/machine-id",
    exists: Callable[[Path], bool] | None = None,
    read_file: Callable[[Path], str] | None = None,
    write_file: Callable[[Path, str], None] | None = None,
    mkdir: Callable[[Path], None] | None = None,
    exec_mac_uuid: Callable[[], str | None] | None = None,
    exec_win_machine_guid: Callable[[], str | None] | None = None,
) -> str:
    """生成硬件指纹：按优先级尝试各平台材料，第一个命中即返回。"""
    if bypass_fingerprint:
        return bypass_fingerprint

    exists = exists or (lambda p: Path(p).exists())
    read_file = read_file or (lambda p: Path(p).read_text(encoding="utf-8"))
    write_file = write_file or (
        lambda p, data: _write_private(Path(p), data)
    )
    mkdir = mkdir or (lambda p: Path(p).mkdir(parents=True, exist_ok=True))
    exec_mac_uuid = exec_mac_uuid or _default_exec_mac_uuid
    exec_win_machine_guid = exec_win_machine_guid or _default_exec_win_machine_guid

    try:
        mid_path = Path(machine_id_path)
        if exists(mid_path):
            machine_id = read_file(mid_path).strip()
            if machine_id:
                return _to_hwid_hex(machine_id, LICENSE_HWID_SALT)
    except Exception:  # noqa: BLE001
        pass

    mac_uuid = exec_mac_uuid()
    if mac_uuid:
        return _to_hwid_hex(mac_uuid, LICENSE_HWID_SALT_MAC)

    persisted = _read_persisted_device_id(internal_dir, exists, read_file)
    if persisted:
        return persisted

    win_guid = exec_win_machine_guid()
    if win_guid:
        return _to_hwid_hex(win_guid, LICENSE_HWID_SALT_WIN)

    try:
        internal = Path(internal_dir)
        if not exists(internal):
            mkdir(internal)
        fallback_path = internal / "device.id"
        raw_id = os.urandom(16).hex()
        write_file(fallback_path, raw_id)
        return _to_hwid_hex(raw_id, LICENSE_HWID_SALT)
    except Exception:  # noqa: BLE001
        return _to_hwid_hex("UNIDENTIFIED", LICENSE_HWID_SALT)


def _write_private(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(descriptor, data.encode("utf-8"))
    finally:
        os.close(descriptor)


__all__ = ["generate_hardware_fingerprint"]
