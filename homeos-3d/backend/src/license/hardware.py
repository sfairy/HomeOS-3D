"""硬件指纹：把机器与主板标识派生成稳定的安装实例 ID。

只取跨重启、跨容器重建都保持不变的标识（machine-id、主板序列号等），先归一化再参与
哈希，并排除出厂占位值（``INVALID_IDENTIFIERS``）。容器里优先读 ``/host/...``，因为容器
内的 ``/etc/machine-id`` 会随后端镜像重建而变。拼接时加版本前缀与 ``\\x00`` 分隔符，
避免字段拼接的歧义碰撞。

当前前缀是 ``homeos-*``：与更早的 0.6.x（``hardware-v1``）不兼容 —— 作为全新版本不做
迁移，旧机器升级后由授权服务引导重新激活。

硬件字段不全时的兜底秘密与本机「宿主封印」（网卡 MAC、主机名等 ``data/`` 之外的信号）
绑定，整盘拷贝 ``data/`` 换机时封印比对失败会主动轮换秘密 —— 这是刻意设计的防克隆。
"""
from __future__ import annotations

import hashlib
import json
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
    """安装实例身份三元组，一经创建就不应再被改动。

    ``instance_id`` 用于授权服务侧的绑定与租约校验；``machine_id`` / ``board_id`` 是
    两类标识各自的哈希，仅用于诊断「到底是机器变了还是主板变了」。
    """
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


_VIRTUAL_NET_PREFIXES = (
    'lo', 'docker', 'br-', 'veth', 'virbr', 'tun', 'tap', 'fw', 'awdl', 'llw', 'utun', 'bridge',
)


def _network_identity() -> str:
    macs: set[str] = set()
    sys_net = Path('/sys/class/net')
    if sys_net.is_dir():
        for entry in sys_net.iterdir():
            name = entry.name.lower()
            if name == 'lo' or any(name.startswith(prefix) for prefix in _VIRTUAL_NET_PREFIXES):
                continue
            if not (entry / 'device').exists():
                continue
            mac = _read(str(entry / 'address'))
            if mac and mac != '00:00:00:00:00:00':
                macs.add(mac)
    if platform.system() == 'Darwin':
        ifconfig = _command('/sbin/ifconfig', '-a')
        current_name = ''
        for line in ifconfig.splitlines():
            header = re.match(r'^([a-zA-Z0-9]+):', line)
            if header:
                current_name = header.group(1).lower()
                continue
            if not current_name or current_name == 'lo0' or any(
                current_name.startswith(prefix) for prefix in _VIRTUAL_NET_PREFIXES
            ):
                continue
            match = re.search(r'ether\s+([0-9a-f:]+)', line, re.IGNORECASE)
            if match:
                mac = _clean(match.group(1))
                if mac and mac != '00:00:00:00:00:00':
                    macs.add(mac)
    return '|'.join(sorted(macs))


def _host_binding_seal(machine: str, board: str) -> str:
    parts = [
        f'machine={machine}',
        f'board={board}',
        f'net={_network_identity()}',
        f'node={_clean(platform.node())}',
        f'system={_clean(platform.system())}',
        f'machine_type={_clean(platform.machine())}',
    ]
    return hashlib.sha256('\x00'.join(parts).encode('utf-8')).hexdigest()


def _write_private_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f'.{path.name}.{secrets.token_hex(8)}.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(content)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _persistent_fallback_identity(path: Path, host_seal: str) -> str:
    if not host_seal:
        raise RuntimeError('无法计算本机宿主封印，拒绝使用可拷贝的兜底设备标识。')

    secret = ''
    stored_seal = ''
    try:
        raw = path.read_text(encoding='utf-8').strip()
    except OSError:
        raw = ''
    if raw:
        os.chmod(path, 0o600)
        if raw.startswith('{'):
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {}
            if isinstance(payload, dict):
                secret = _clean(str(payload.get('secret') or ''))
                stored_seal = _clean(str(payload.get('host_seal') or ''))

    if (
        secret
        and stored_seal
        and len(secret) >= 32
        and len(stored_seal) == len(host_seal)
        and secrets.compare_digest(stored_seal, host_seal)
    ):
        return secret

    secret = secrets.token_hex(32)
    _write_private_text(
        path,
        json.dumps({'secret': secret, 'host_seal': host_seal}, separators=(',', ':')) + '\n',
    )
    return secret


def hardware_identity(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> HardwareIdentity:
    """按机器与主板标识计算硬件身份。

    ``required`` 为 True 时拿不到完整标识必须报错或走兜底，False 允许退化为开发值；
    ``fallback_path`` 为 None 表示不允许兜底。

    异常: RuntimeError —— required 为真但标识缺失，且无法创建兜底 ID。
    """
    machine = _machine_identity(machine_override)
    board = _board_identity(board_override)
    used_fallback = False
    host_extra = ''
    if required and (not machine or not board) and fallback_path is not None:
        host_seal = _host_binding_seal(machine, board)
        try:
            fallback = _persistent_fallback_identity(fallback_path, host_seal)
        except OSError as error:
            raise RuntimeError('无法读取完整硬件 ID，也无法创建持久化兜底设备标识。') from error
        if not machine:
            machine = f'fallback-machine:{fallback}'
        if not board:
            board = f'fallback-board:{fallback}'
        used_fallback = True
        host_extra = host_seal
    if required and (not machine or not board):
        missing = '主板' if machine else '机器'
        raise RuntimeError(f'无法读取{missing} ID，不能建立硬件绑定授权。')
    if not machine:
        machine = f'development-machine:{platform.node()}'
    if not board:
        board = f'development-board:{platform.node()}'
    if used_fallback:
        material = (
            f'homeos-hardware-v2\x00machine={machine}\x00board={board}\x00host={host_extra}'
        ).encode()
    else:
        material = f'homeos-hardware-v1\x00machine={machine}\x00board={board}'.encode()
    return HardwareIdentity(
        instance_id=hashlib.sha256(material).hexdigest(),
        machine_id=hashlib.sha256(f'homeos-machine-v1\x00{machine}'.encode()).hexdigest(),
        board_id=hashlib.sha256(f'homeos-board-v1\x00{board}'.encode()).hexdigest())


def hardware_instance_id(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> str:
    """只需实例 ID 时的便捷封装，参数语义与 ``hardware_identity`` 完全一致。"""
    return hardware_identity(machine_override=machine_override, board_override=board_override, required=required, fallback_path=fallback_path).instance_id
