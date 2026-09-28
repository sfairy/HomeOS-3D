"""硬件指纹：把机器与主板标识派生成稳定的安装实例 ID。
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

# 各家主板 / 虚拟机固件写死的默认值或占位文案；这些值在大量机器上重复出现，
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
    """安装实例身份三元组。
    """
    instance_id: str
    machine_id: str
    board_id: str


def _clean(value: str) -> str:
    """归一化原始标识：压缩内部空白、去首尾、转小写；占位值统一清成空串。"""
    # 先压缩内部空白：DMI 里常见 'To Be Filled By O.E.M.' 与多空格变体，
    normalized = ' '.join(value.strip().split()).lower()
    return '' if normalized in INVALID_IDENTIFIERS else normalized


def _read(path: str) -> str:
    """读取文本文件并归一化；读不到（权限不足、路径不存在）一律返回空串。"""
    try:
        # errors='ignore'：DMI 数据可能是非 UTF-8 字节，宁可有损也不能让整个识别流程失败。
        return _clean(Path(path).read_text(encoding='utf-8', errors='ignore'))
    except OSError:
        return ''


def _command(*command: str) -> str:
    """执行外部命令并返回 stdout；命令不存在、非零退出或超时都返回空串。"""
    try:
        # 3 秒超时：ioreg 这类命令在某些异常机器上会卡住，不能让启动流程被拖死。
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.SubprocessError):
        return ''
    return result.stdout


def _machine_identity(override: str = '') -> str:
    """取机器标识：优先显式覆盖，再按「容器内 -> 宿主机」顺序找 machine-id。"""
    # 显式覆盖（配置/环境变量）优先级最高，方便测试与特殊部署。
    if _clean(override):
        return _clean(override)
    # /host/etc/machine-id 放最前：容器内的路径会随镜像重建变化，
    for path in ('/host/etc/machine-id', '/etc/machine-id', '/var/lib/dbus/machine-id'):
        value = _read(path)
        if not value:
            continue
        return value
    # macOS 没有 machine-id，退回 ioreg 里的 IOPlatformUUID（相当于硬件 UUID）。
    if platform.system() == 'Darwin':
        ioreg = _command('/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice')
        # 在 ioreg 输出里抓引号包裹的值；值里可能含空格，因此不能简单按空白切分。
        match = re.search('"IOPlatformUUID"\\s*=\\s*"([^"\\n]+)', ioreg)
        if match:
            return _clean(match.group(1))
    return ''


def _board_identity(override: str = '') -> str:
    """取主板标识：把可用的 DMI 字段全部收集起来，排序去重后拼成一个字符串。
    """
    if _clean(override):
        return _clean(override)
    values = [
        # /host/ 版本在前、容器内版本在后：两者都在时优先用宿主机（更稳定）。
        _read('/host/sys/class/dmi/id/board_serial'),
        _read('/host/sys/class/dmi/id/product_uuid'),
        _read('/host/sys/class/dmi/id/board_name'),
        _read('/host/sys/class/dmi/id/board_vendor'),
        _read('/sys/class/dmi/id/board_serial'),
        _read('/sys/class/dmi/id/product_uuid'),
        _read('/sys/class/dmi/id/board_name'),
        _read('/sys/class/dmi/id/board_vendor')]
    # macOS：用主板 ID 与序列号等字段补进同一个聚合串。
    if platform.system() == 'Darwin':
        ioreg = _command('/usr/sbin/ioreg', '-rd1', '-c', 'IOPlatformExpertDevice')
        for key in ('board-id', 'mlb-serial-number', 'IOPlatformSerialNumber', 'serial-number'):
            match = re.search(f'"{re.escape(key)}"\\s*=\\s*(?:<)?"?([^"\\n>]+)', ioreg)
            if not match:
                continue
            values.append(_clean(match.group(1)))
    # 排序去重保证有确定顺序：DMI 的读取顺序在不同内核上并不保证一致，
    return '|'.join(sorted({value for value in values if value}))


# 虚拟/临时网卡名前缀：它们在容器重建后会变，不能进宿主封印。
_VIRTUAL_NET_PREFIXES = (
    'lo', 'docker', 'br-', 'veth', 'virbr', 'tun', 'tap', 'fw', 'awdl', 'llw', 'utun', 'bridge',
)


def _network_identity() -> str:
    """本机网卡 MAC 聚合（排除虚拟网卡）；不在 APP_DATA_DIR 内，整盘拷贝 data/ 带不走。"""
    macs: set[str] = set()
    sys_net = Path('/sys/class/net')
    if sys_net.is_dir():
        for entry in sys_net.iterdir():
            name = entry.name.lower()
            if name == 'lo' or any(name.startswith(prefix) for prefix in _VIRTUAL_NET_PREFIXES):
                continue
            # 没有 device 软链的多半是虚拟接口，跳过。
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
    """本机宿主封印：只含 data/ 之外的信号，用于校验兜底文件是否被拷到别的机器。"""
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
    """以 0600 权限原子写入文本文件。"""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(f'.{path.name}.{secrets.token_hex(8)}.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(content)
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        # 临时文件已被 os.replace 带走（或压根没建），这里再删只会 FileNotFound，属预期。
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _persistent_fallback_identity(path: Path, host_seal: str) -> str:
    """兜底熵：硬件字段不全时生成随机秘密，并用本机宿主封印绑定。
    """
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

    # 封印不匹配、格式非法或旧版无封印文件：轮换秘密。
    secret = secrets.token_hex(32)
    _write_private_text(
        path,
        json.dumps({'secret': secret, 'host_seal': host_seal}, separators=(',', ':')) + '\n',
    )
    return secret


def hardware_identity(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> HardwareIdentity:
    """按机器与主板标识计算硬件身份。
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
        # 只要缺一项就补齐：两项缺口共用同一个兜底值，保证 instance_id 至少唯一。
        if not machine:
            machine = f'fallback-machine:{fallback}'
        if not board:
            board = f'fallback-board:{fallback}'
        used_fallback = True
        # 把 data/ 外的宿主信号编进材料：即使有人手工改封印文件，只要宿主不同，ID 仍变。
        host_extra = host_seal
    if required and (not machine or not board):
        missing = '主板' if machine else '机器'
        raise RuntimeError(f'无法读取{missing} ID，不能建立硬件绑定授权。')
    # required=False（开发/测试）时用主机名兜底：保证本地跑得通，
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
        # 组合哈希：机器或主板任一变化都会改变实例 ID，从而触发重新绑定。
        instance_id=hashlib.sha256(material).hexdigest(),
        # 两类标识各自单独哈希，仅用于诊断定位，不参与门禁判定。
        machine_id=hashlib.sha256(f'homeos-machine-v1\x00{machine}'.encode()).hexdigest(),
        board_id=hashlib.sha256(f'homeos-board-v1\x00{board}'.encode()).hexdigest())


def hardware_instance_id(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> str:
    """只需实例 ID 时的便捷封装，参数语义与 hardware_identity 完全一致。"""
    return hardware_identity(machine_override=machine_override, board_override=board_override, required=required, fallback_path=fallback_path).instance_id
