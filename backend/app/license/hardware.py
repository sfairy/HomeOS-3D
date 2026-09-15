"""硬件指纹：把机器与主板标识派生成稳定的安装实例 ID。

设计要点：
1. 只取「跨重启、跨容器重建都保持不变」的标识（machine-id、主板序列号等），
   并且先归一化（压缩空白、转小写）再参与哈希。
2. 出厂占位值（INVALID_IDENTIFIERS）必须排除：这些值在同一批设备上完全相同，
   拿它们做绑定等于没有绑定。
3. 容器里优先读 /host/... —— 容器内的 /etc/machine-id 会随后端镜像重建而变，
   挂载进来的宿主机文件才是稳定来源。
4. 拼接时加版本前缀与 \x00 分隔符再哈希：既避免字段拼接的歧义碰撞，
   又让「算法前缀变更」等价于让全部旧 ID 失效（需要重新绑定时用）。
"""
from __future__ import annotations
import hashlib
import os
import platform
import re
import secrets
import subprocess
from dataclasses import dataclass
from pathlib import Path
# 各家主板 / 虚拟机固件写死的默认值或占位文案；这些值在大量机器上重复出现，
# 一旦被当成真实标识用于绑定，任意同型号设备都能顶替。条目均已小写，
# 因为 _clean 会先把原始值转成小写再比对。
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

    instance_id 用于授权服务侧的绑定与租约校验；machine_id / board_id 是两类
    标识各自的哈希，便于诊断「到底是机器变了还是主板变了」。frozen 表示
    这份身份一经创建就不应再被改动。
    """
    instance_id: str
    machine_id: str
    board_id: str


def _clean(value: str) -> str:
    """归一化原始标识：压缩内部空白、去首尾、转小写；占位值统一清成空串。"""
    # 先压缩内部空白：DMI 里常见 'To Be Filled By O.E.M.' 与多空格变体，
    # 规范化后再比对黑名单才能命中。
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
    # 挂载进来的宿主机文件才是跨升级稳定的来源。
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

    之所以用「多字段聚合」而不是只取 board_serial：不少机器上单个字段缺失，
    或者写的是占位值；聚合能显著提高「同一台机器在不同发行版/内核下得出相同结果」
    的概率，进而避免把老设备误判成新安装。
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
    # 不排序会让同一台机器得到不同 ID，从而被误判为新安装。
    return '|'.join(sorted({value for value in values if value}))


def _persistent_fallback_identity(path: Path) -> str:
    """兜底身份：所有硬件标识都拿不到时，在本地生成并持久化一个随机 ID。

    参数:
        path: 存放随机 ID 的文件路径。

    返回:
        32 字节的十六进制随机串；首次生成后写入 path，之后每次都复用它。

    异常:
        OSError: 文件系统不可写，无法创建兜底标识。
    """
    try:
        existing = _clean(path.read_text(encoding='utf-8'))
    except OSError:
        existing = ''
    if existing:
        # 已有值就直接复用 —— 这正是「持久化」的意义：
        # 重新生成会让授权绑定立刻失效，把设备变成未激活状态。
        # 384 == 0o600，顺手把权限收紧到只允许运行账号读写。
        os.chmod(path, 384)
        return existing
    # 448 == 0o700：父目录同样只给运行账号访问。
    path.parent.mkdir(parents=True, exist_ok=True, mode=448)
    # 32 字节熵：兜底 ID 要承担绑定职责，必须不可猜测。
    fallback = secrets.token_hex(32)
    # 随机后缀的临时文件：并发启动时两个进程不会踩到同一个中间文件名。
    temporary = path.with_name(f'.{path.name}.{secrets.token_hex(8)}.tmp')
    # O_EXCL 独占创建防止互相覆盖；384 == 0o600 从创建瞬间就是私有权限。
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 384)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(fallback + '\n')
        # 同目录 rename 是原子的：读取方要么看到旧内容，要么看到完整的新内容，
        # 不会读到写了一半的文件。
        os.replace(temporary, path)
        os.chmod(path, 384)
    finally:
        try:
            # 正常路径下临时文件已被 rename 走，这里只清理异常残留；
            # 「已不存在」属预期情况，直接忽略。
            temporary.unlink()
        except FileNotFoundError:
            pass
    return fallback


def hardware_identity(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> HardwareIdentity:
    """按机器与主板标识计算硬件身份。

    参数:
        machine_override: 机器标识覆盖值，非空则直接采用。
        board_override: 主板标识覆盖值，非空则直接采用。
        required: True 表示拿不到完整标识时必须报错或走兜底；False 允许退化为开发值。
        fallback_path: 兜底随机 ID 的存放路径；None 表示不允许兜底。

    返回:
        含 instance_id / machine_id / board_id 的 HardwareIdentity。

    异常:
        RuntimeError: required 为真但标识缺失，且无法创建兜底 ID。
    """
    machine = _machine_identity(machine_override)
    board = _board_identity(board_override)
    if required and (not machine or not board) and fallback_path is not None:
        try:
            fallback = _persistent_fallback_identity(fallback_path)
        except OSError as error:
            raise RuntimeError('无法读取完整硬件 ID，也无法创建持久化兜底设备标识。') from error
        # 只要缺一项就补齐：两项缺口共用同一个兜底值，保证 instance_id 至少唯一。
        if not machine:
            machine = f'fallback-machine:{fallback}'
        if not board:
            board = f'fallback-board:{fallback}'
    if required and (not machine or not board):
        # 走到这里至少缺一项：machine 有值说明缺的是主板，否则报告机器缺失。
        # 这是兜底路径不可用时的最后一道门禁 —— 宁可启动失败，
        # 也不能拿空标识去建立绑定（那会让所有设备共享同一个身份）。
        missing = '主板' if machine else '机器'
        raise RuntimeError(f'无法读取{missing} ID，不能建立硬件绑定授权。')
    # required=False（开发/测试）时用主机名兜底：保证本地跑得通，
    # 但这类值不具备绑定意义，绝不能出现在生产配置里。
    if not machine:
        machine = f'development-machine:{platform.node()}'
    if not board:
        board = f'development-board:{platform.node()}'
    # \x00 分隔 + 带版本前缀：避免字段拼接产生歧义碰撞（如 machine='a\x00board=b' 之类的组合），
    # 前缀一旦变更就等于让所有旧 ID 失效，用于需要强制重新绑定的场合。
    material = f'homeos-hardware-v1\x00machine={machine}\x00board={board}'.encode('utf-8')
    return HardwareIdentity(
        # 组合哈希：机器或主板任一变化都会改变实例 ID，从而触发重新绑定。
        instance_id=hashlib.sha256(material).hexdigest(),
        # 两类标识各自单独哈希，仅用于诊断定位，不参与门禁判定。
        machine_id=hashlib.sha256(f'homeos-machine-v1\x00{machine}'.encode('utf-8')).hexdigest(),
        board_id=hashlib.sha256(f'homeos-board-v1\x00{board}'.encode('utf-8')).hexdigest())


def hardware_instance_id(*, machine_override: str = '', board_override: str = '', required: bool = True, fallback_path: Path | None = None) -> str:
    """只需实例 ID 时的便捷封装，参数语义与 hardware_identity 完全一致。"""
    return hardware_identity(machine_override=machine_override, board_override=board_override, required=required, fallback_path=fallback_path).instance_id
