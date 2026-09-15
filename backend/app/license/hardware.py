from __future__ import annotations
import hashlib
import os
import platform
import re
import secrets
import subprocess
from dataclasses import dataclass
from pathlib import Path
INVALID_IDENTIFIERS = {
    '',
    'none',
    'unknown',
    'not specified',
    'default string',
    'system serial number',
    'to be filled by o.e.m.'}


@dataclass(frozen=True)
class HardwareIdentity:
    instance_id: str
    machine_id: str
    board_id: str


def _clean(value: str) -> str:
    normalized = ' '.join(value.strip().split()).lower()
    return '' if normalized in INVALID_IDENTIFIERS else normalized


def _read(path: str) -> str:
    try:
        return _clean(Path(path).read_text(encoding='utf-8', errors='ignore'))
    except OSError:
        return ''


def _command(*command: str) -> str:
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        return ''
    return result.stdout


def _machine_identity(override: str = '') -> str:
    if _clean(override):
        return _clean(override)
    for path in ('/host/etc/machine-id', '/etc/machine-id', '/var/lib/dbus/machine-id'):
        value = _read(path)
        if not value:
            continue
        return value
    if platform.system() == 'Darwin':
        ioreg = _command('/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice')
        match = re.search('"IOPlatformUUID"\\s*=\\s*"([^"\\n]+)', ioreg)
        if match:
            return _clean(match.group(1))
    return ''


def _board_identity(override: str = '') -> str:
    if _clean(override):
        return _clean(override)
    values = [
        _read('/host/sys/class/dmi/id/board_serial'),
        _read('/host/sys/class/dmi/id/product_uuid'),
        _read('/host/sys/class/dmi/id/board_name'),
        _read('/host/sys/class/dmi/id/board_vendor'),
        _read('/sys/class/dmi/id/board_serial'),
        _read('/sys/class/dmi/id/product_uuid'),
        _read('/sys/class/dmi/id/board_name'),
        _read('/sys/class/dmi/id/board_vendor')]
    if platform.system() == 'Darwin':
        ioreg = _command('/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice')
        for key in ('board-id', 'mlb-serial-number', 'IOPlatformSerialNumber', 'serial-number'):
            match = re.search(f'"{re.escape(key)}"\\s*=\\s*(?:<)?"?([^"\\n>]+)', ioreg)
            if not match:
                continue
            values.append(_clean(match.group(1)))
    return '|'.join(sorted({value for value in values if value}))


def _persistent_fallback_identity(path: Path) -> str:
    try:
        existing = _clean(path.read_text(encoding='utf-8'))
    except OSError:
        existing = ''
    if existing:
        os.chmod(path, 384)
        return existing
    path.parent.mkdir(parents=True, exist_ok=True, mode=448)
    fallback = secrets.token_hex(32)
    temporary = path.with_name(f'.{path.name}.{secrets.token_hex(8)}.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 384)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(fallback + '\n')
        os.replace(temporary, path)
        os.chmod(path, 384)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
    return fallback


def hardware_identity(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> HardwareIdentity:
    machine = _machine_identity(machine_override)
    board = _board_identity(board_override)
    if required and (not machine or not board) and fallback_path is not None:
        try:
            fallback = _persistent_fallback_identity(fallback_path)
        except OSError as error:
            raise RuntimeError('无法读取完整硬件 ID，也无法创建持久化兜底设备标识。') from error
        if not machine:
            machine = f'fallback-machine:{fallback}'
        if not board:
            board = f'fallback-board:{fallback}'
    if required and (not machine or not board):
        missing = '主板' if machine else '机器'
        raise RuntimeError(f'无法读取{missing} ID，不能建立硬件绑定授权。')
    if not machine:
        machine = f'development-machine:{platform.node()}'
    if not board:
        board = f'development-board:{platform.node()}'
    material = f'homeos-hardware-v1\x00machine={machine}\x00board={board}'.encode('utf-8')
    return HardwareIdentity(
        instance_id=hashlib.sha256(material).hexdigest(),
        machine_id=hashlib.sha256(f'homeos-machine-v1\x00{machine}'.encode('utf-8')).hexdigest(),
        board_id=hashlib.sha256(f'homeos-board-v1\x00{board}'.encode('utf-8')).hexdigest())


def hardware_instance_id(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> str:
    return hardware_identity(machine_override=machine_override, board_override=board_override, required=required, fallback_path=fallback_path).instance_id
