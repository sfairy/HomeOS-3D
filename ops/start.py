#!/usr/bin/env python3
"""本地开发启动脚本（dev 模式）。

默认同时拉起：
  - 主应用 / 商店后端（热重载）
  - Vite HMR（8805 / 8806）

改 ``frontend/src/runtime`` 时另开：``bun run --cwd homeos-3d dev:runtime``
仅后端：``python3 ops/start.py --backend-only``
"""
from __future__ import annotations

import hashlib
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

# 本脚本住在 ops/ 下，脚本目录不再是仓库根：直接 python ops/start.py 时 sys.path[0]
ROOT = Path(__file__).resolve().parents[1]
HOMEOS_3D = ROOT / 'homeos-3d'
HOMEOS_STORE = ROOT / 'homeos-store'
APP_BACKEND = HOMEOS_3D / 'backend'
STORE_BACKEND = HOMEOS_STORE / 'backend'

# 商店后端优先入 path，供 load_dotenv / 密钥工具 import
for _path in (str(STORE_BACKEND), str(ROOT)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from src.core.env import load_dotenv

from ops.docker.license_keys import ensure_store_license_keys

IS_WINDOWS = sys.platform == 'win32'

# 端口
APP_PORT = '8801'
STORE_PORT = '8802'
VITE_3D_PORT = '8805'
VITE_STORE_PORT = '8806'
#: 本脚本要拉起的两个服务端口及其中文名：预检报错与启动提示共用同一份，
BACKEND_PORTS = ((APP_PORT, '主应用 API'), (STORE_PORT, '授权商店 API'))
FRONTEND_PORTS = ((VITE_3D_PORT, '主应用 Vite'), (VITE_STORE_PORT, '授权商店 Vite'))
#: 默认只绑回环。这是**本地开发**脚本，而它默认打开的两个联调后门（见下方 LOOPBACK 说明）
HOST = '127.0.0.1'
#: ``--lan`` 时绑到所有网卡，让同网段的平板 / 墙面板 / 另一台机器都能访问。
LAN_HOST = '0.0.0.0'
#: 命令行开关。
LAN_FLAG = '--lan'
BACKEND_ONLY_FLAG = '--backend-only'
KNOWN_FLAGS = frozenset({LAN_FLAG, BACKEND_ONLY_FLAG})
#: 绑定到这些地址时才算「只有本机能访问」。
LOOPBACK_BIND_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})

# 共享虚拟环境（缺失时自动创建；两边 requirements 一并安装）
VENV_DIR = ROOT / '.venv-store'
VENV_PYTHON = (
    VENV_DIR / 'Scripts' / 'python.exe'
    if IS_WINDOWS
    else VENV_DIR / 'bin' / 'python'
)
APP_REQUIREMENTS = APP_BACKEND / 'src' / 'requirements.txt'
STORE_REQUIREMENTS = STORE_BACKEND / 'src' / 'requirements.txt'
APP_SRC = APP_BACKEND / 'src'

CLIENT_KEYS_DIR = ROOT / 'keys'
LICENSE_PUBLIC_KEY = CLIENT_KEYS_DIR / 'license-public.pem'
LICENSE_TRANSPORT_PUBLIC_KEY = CLIENT_KEYS_DIR / 'license-transport-public.pem'


def bun_bin() -> str:
    return 'bun.exe' if IS_WINDOWS else 'bun'


def ensure_venv() -> str:
    """返回用于启动两个服务的 Python 解释器。"""
    if VENV_PYTHON.is_file():
        return str(VENV_PYTHON)
    subprocess.check_call([sys.executable, '-m', 'venv', str(VENV_DIR)])
    # 主应用与商店各自声明依赖；共享 venv 时两边都装，避免隐式只跟商店走。
    subprocess.check_call([
        str(VENV_PYTHON), '-m', 'pip', 'install',
        '-r', str(APP_REQUIREMENTS),
        '-r', str(STORE_REQUIREMENTS),
    ])
    return str(VENV_PYTHON)


def ensure_license_keys() -> dict[str, str]:
    """确保本地授权密钥存在并镜像公钥，返回主应用需要的环境变量覆盖项。
    """
    keys_dir = HOMEOS_STORE / 'keys' / 'local'
    source = keys_dir / 'license-transport-public.pem'
    need_mirror = not LICENSE_TRANSPORT_PUBLIC_KEY.is_file() or (
        source.is_file()
        and LICENSE_TRANSPORT_PUBLIC_KEY.read_bytes() != source.read_bytes()
    )
    if not source.is_file() or need_mirror:
        ensure_store_license_keys(keys_dir, CLIENT_KEYS_DIR)
    overrides = {}
    for env_name, key_path in (
        ('APP_LICENSE_PUBLIC_KEY_SHA256', LICENSE_PUBLIC_KEY),
        ('APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256', LICENSE_TRANSPORT_PUBLIC_KEY),
    ):
        overrides[env_name] = hashlib.sha256(key_path.read_bytes()).hexdigest()
    return overrides


def spawn(
    command: list[str],
    environment: dict[str, str],
    cwd: Path | None = None,
) -> subprocess.Popen:
    kwargs: dict = {'cwd': str(cwd or ROOT), 'env': environment}
    if IS_WINDOWS:
        # 独立进程组，便于父进程接管 Ctrl+C 后干净终止子进程。
        # CREATE_NEW_PROCESS_GROUP 是 Windows 专属常量，POSIX 上不存在；
        # 这里只在 IS_WINDOWS 分支取，用 getattr 做可移植兜底给静态检查。
        kwargs['creationflags'] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    return subprocess.Popen(command, **kwargs)


def terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if IS_WINDOWS:
        # Windows 上 SIGTERM 不可靠；terminate() 映射为 TerminateProcess。
        process.terminate()
        return
    process.send_signal(signal.SIGTERM)


def primary_lan_address() -> str:
    """探出本机对外的局域网 IPv4 地址；拿不到时返回空串。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # TEST-NET-1（192.0.2.0/24，RFC 5737）保留给文档示例，不会指向真实主机；
        probe.connect(('192.0.2.1', 9))
        address = probe.getsockname()[0]
    except OSError:
        return ''
    finally:
        probe.close()
    return '' if address in LOOPBACK_BIND_HOSTS else address


def resolve_run_options(arguments: list[str]) -> tuple[str, bool]:
    """把命令行参数解析成「绑哪个地址」与是否只起后端。
    """
    unknown = [item for item in arguments if item not in KNOWN_FLAGS]
    if unknown:
        # 必须喊出来：把 ``--lan`` 打成 ``--Lang`` 会被静默忽略，结果退回只绑回环，
        print(f'⚠ 忽略了无法识别的参数：{" ".join(unknown)}')
        print(f'  本脚本只认 {" / ".join(sorted(KNOWN_FLAGS))}。')
    host = LAN_HOST if LAN_FLAG in arguments else HOST
    backend_only = BACKEND_ONLY_FLAG in arguments
    return host, backend_only


def is_port_listening(port: str) -> bool:
    """探测本机回环地址上 ``port`` 是否已有服务在监听。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    try:
        # connect_ex 返回 0 表示对端接受了连接（即该端口有人在监听），非 0 表示没有服务。
        return probe.connect_ex(('127.0.0.1', int(port))) == 0
    finally:
        probe.close()


def ensure_ports_available(*, frontend: bool) -> None:
    """启动前预检服务端口；已被占用时立刻中止，不拉起任何子进程。
    """
    ports = list(BACKEND_PORTS)
    if frontend:
        ports.extend(FRONTEND_PORTS)
    occupied = [(port, name) for port, name in ports if is_port_listening(port)]
    if not occupied:
        return
    print('⚠ 检测到服务端口已被占用，本次启动已中止（未拉起任何进程）：', flush=True)
    for port, name in occupied:
        print(f'  - {port}（{name}）已有服务在监听', flush=True)
    print('  最常见的原因是上一份 ops/start.py 还没退出，或已在另一个终端里运行 Vite。', flush=True)
    print('  请先停掉已有实例再启动：关闭它所在的终端，或执行 `pkill -f ops/start.py`。', flush=True)
    # 非零退出码：让调用方（shell 脚本 / CI）也能区分「拒绝启动」与正常结束。
    raise SystemExit(1)


def ensure_frontend_build() -> None:
    """若缺少 Vite 构建产物则跑一次 ``bun run build:vite``（开发用，不混淆）。
    """
    # assets 只证明 app/store 主包在；runtime manifest 另算 —— 缺它时 3D 模块会 500。
    ready = (
        (HOMEOS_3D / 'dist' / 'static' / 'assets').is_dir()
        and any((HOMEOS_3D / 'dist' / 'static' / 'assets').glob('*.js'))
        and (HOMEOS_3D / 'dist' / 'modules' / 'runtime' / 'manifest.json').is_file()
        and (HOMEOS_STORE / 'dist' / 'static' / 'assets').is_dir()
        and any((HOMEOS_STORE / 'dist' / 'static' / 'assets').glob('*.js'))
    )
    if ready:
        return
    bun = bun_bin()
    print('未检测到前端构建产物，正在执行 bun run build:vite（开发构建，跳过混淆）…', flush=True)
    subprocess.check_call([bun, 'install'], cwd=str(ROOT))
    subprocess.check_call([bun, 'run', 'build:vite'], cwd=str(ROOT))


def vite_dev_command(config_rel: str, host: str) -> list[str]:
    command = [bun_bin(), 'vite', '--config', config_rel]
    if host not in LOOPBACK_BIND_HOSTS:
        command.extend(['--host', host])
    return command


def main() -> None:
    host, backend_only = resolve_run_options(sys.argv[1:])
    # 预检必须在拉起任何子进程之前（见 ensure_ports_available 的说明）。
    ensure_ports_available(frontend=not backend_only)
    python = ensure_venv()
    ensure_frontend_build()
    # 本地密钥指纹覆盖：把主应用的指纹校验对准本地生成的密钥，
    license_overrides = ensure_license_keys()
    # .env 提供 SMTP 授权码等本地配置；已存在的真实环境变量优先
    load_dotenv()
    base_environment = os.environ.copy()
    # PYTHONHOME 会覆盖 venv 的 site-packages 搜索路径，导致子进程去系统
    base_environment.pop('PYTHONHOME', None)
    for proxy_key in (
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'SOCKS_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy', 'socks_proxy',
        # NO_PROXY / no_proxy 必须一起清掉：httpx 在**构造 Client 时**就会把
        'NO_PROXY', 'no_proxy',
    ):
        base_environment.pop(proxy_key, None)

    app_environment = base_environment.copy()
    app_environment['APP_DATA_DIR'] = str(HOMEOS_3D / 'data')
    # 后端包在 homeos-3d/backend（src）；cwd 用项目根以便读 dist/
    app_environment['PYTHONPATH'] = str(APP_BACKEND)
    app_environment.update(license_overrides)

    store_environment = base_environment.copy()
    store_environment['STORE_DATA_DIR'] = str(HOMEOS_STORE / 'data')
    store_environment['STORE_LICENSE_KEYS_DIR'] = str(HOMEOS_STORE / 'keys' / 'local')
    store_environment['STORE_HOST'] = host
    store_environment['STORE_PORT'] = STORE_PORT
    store_environment['PYTHONPATH'] = str(STORE_BACKEND)
    store_environment.setdefault('STORE_RELOAD', '1')
    # 本地默认走「只写日志」：验证码会打印在这个终端里。echo / 回显通道已删除 ——
    # 它依赖「请求来自本机」这道判定，部署形态一变就可能失效。
    store_environment.setdefault('STORE_MAIL_MODE', 'log')
    # 这里**不再**注入任何支付渠道：模拟收银台已删除，本地联调需要真实的支付宝沙箱凭据
    # （后台「站点配置 → 支付渠道」填沙箱 APPID / 密钥，或写进 .env）。
    # 未配置渠道时下单会 503 —— 这是刻意的：宁可下不了单，也不要「点一下就发码」。

    # 主应用的重载范围必须收窄到 backend/src/
    processes = [
        spawn(
            [python, '-m', 'src.run'],
            store_environment,
            cwd=HOMEOS_STORE,
        ),
        spawn(
            [
                python,
                '-m',
                'uvicorn',
                'src.main:app',
                '--host',
                host,
                '--port',
                APP_PORT,
                '--reload',
                '--reload-dir',
                str(APP_SRC),
            ],
            app_environment,
            cwd=HOMEOS_3D,
        ),
    ]

    if not backend_only:
        frontend_env = base_environment.copy()
        # 只起页面 HMR。runtime 走 dist（首次缺产物时 build:vite 已生成）；
        # 不要在这里挂 vite build --watch，否则终端会被 chunk 列表刷屏。
        processes.extend([
            spawn(
                vite_dev_command('frontend/vite.config.ts', host),
                frontend_env,
                cwd=HOMEOS_3D,
            ),
            spawn(
                vite_dev_command('frontend/vite.config.ts', host),
                frontend_env,
                cwd=HOMEOS_STORE,
            ),
        ])

    def stop(_signum=None, _frame=None) -> None:
        for process in processes:
            terminate(process)

    signal.signal(signal.SIGINT, stop)
    # SIGTERM 在 Windows 上通常不可用 / 无意义，仅在 POSIX 注册。
    if hasattr(signal, 'SIGTERM') and not IS_WINDOWS:
        signal.signal(signal.SIGTERM, stop)

    # 全部 flush=True：这几行是「复制哪个地址去别的设备」的唯一出处，而后台运行时 stdout 是
    mode = 'backend-only' if backend_only else 'dev'
    print(f'HomeOS 本地启动（{mode}）', flush=True)
    if not backend_only:
        print(f'前端 HMR  主应用   http://{HOST}:{VITE_3D_PORT}/', flush=True)
        print(f'          授权商店 http://{HOST}:{VITE_STORE_PORT}/', flush=True)
    print(f'后端 API  主应用   http://{HOST}:{APP_PORT}/setup', flush=True)
    print(f'          授权商店 http://{HOST}:{STORE_PORT}/', flush=True)
    if not backend_only:
        print('改页面走 HMR 地址。改 runtime 另开：bun run --cwd homeos-3d dev:runtime', flush=True)
    if host not in LOOPBACK_BIND_HOSTS:
        # 不要在这条分支里再重复打印回环地址：--lan 下运维要复制给对方设备的是局域网地址，
        lan_address = primary_lan_address()
        print(flush=True)
        print(f'已绑定 {host}，同网段设备用下面的地址访问（Host 与 Origin 会随之校验，无需额外配置）：', flush=True)
        if lan_address:
            if not backend_only:
                print(f'局域网 HMR  主应用   http://{lan_address}:{VITE_3D_PORT}/', flush=True)
                print(f'            授权商店 http://{lan_address}:{VITE_STORE_PORT}/', flush=True)
            print(f'局域网 API  主应用   http://{lan_address}:{APP_PORT}/', flush=True)
            print(f'            授权商店 http://{lan_address}:{STORE_PORT}/', flush=True)
        else:
            print(
                f'  （没探到局域网地址，请自行查看本机 IP；'
                f'端口 {APP_PORT}/{STORE_PORT}'
                + (f'/{VITE_3D_PORT}/{VITE_STORE_PORT}' if not backend_only else '')
                + '）',
                flush=True,
            )
        # 这里曾经提醒「模拟支付已开启：同网段任何设备都能直接拿到真实授权」。
        # 那条通道（模拟收银台）已经删除，商店只支持支付宝 —— 下单要能成功就必须
        # 配置真实的沙箱/生产凭据，所以不再需要这条警告。
        print('  支付渠道需要真实凭据（支付宝沙箱见 homeos-store/backend/src/README.md）；未配置时下单会 503。', flush=True)
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.4)
    finally:
        stop()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    main()
