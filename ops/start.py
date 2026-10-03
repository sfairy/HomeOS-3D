#!/usr/bin/env python3
"""本地开发启动脚本（dev 模式）。

默认同时拉起：
  - 主应用 / 商店后端（热重载）
  - Vite HMR（8805 / 8806）

改 ``frontend/src/runtime`` 时另开：``bun run --cwd homeos-3d dev:runtime``
仅后端：``python3 ops/start.py --backend-only``
调试启动：``python3 ops/start.py --debug`` —— 热重载照旧，另开 debugpy 端口给 IDE attach
只装 Python 环境：``python3 ops/start.py --prepare``
"""
from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[1]
HOMEOS_3D = ROOT / 'homeos-3d'
HOMEOS_STORE = ROOT / 'homeos-store'
APP_BACKEND = HOMEOS_3D / 'backend'
STORE_BACKEND = HOMEOS_STORE / 'backend'
DIST_ROOT = ROOT / 'dist'
HOMEOS_3D_FRONTEND = DIST_ROOT / 'homeos-3d' / 'frontend'
HOMEOS_STORE_FRONTEND = DIST_ROOT / 'homeos-store' / 'frontend'

for _path in (str(STORE_BACKEND), str(ROOT)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from src.core.env import load_dotenv

from ops.license_keys import ensure_store_keys, sync_store_keys

IS_WINDOWS = sys.platform == 'win32'

APP_PORT = '8801'
STORE_PORT = '8802'
VITE_3D_PORT = '8805'
VITE_STORE_PORT = '8806'
BACKEND_PORTS = ((APP_PORT, '主应用 API'), (STORE_PORT, '授权商店 API'))
FRONTEND_PORTS = ((VITE_3D_PORT, '主应用 Vite'), (VITE_STORE_PORT, '授权商店 Vite'))
DEBUG_APP_PORT = '8811'
DEBUG_STORE_PORT = '8812'
DEBUG_PORTS = ((DEBUG_APP_PORT, '主应用调试器'), (DEBUG_STORE_PORT, '授权商店调试器'))
HOST = '127.0.0.1'
LAN_HOST = '0.0.0.0'
LAN_FLAG = '--lan'
BACKEND_ONLY_FLAG = '--backend-only'
DEBUG_FLAG = '--debug'
PREPARE_FLAG = '--prepare'
KNOWN_FLAGS = frozenset({LAN_FLAG, BACKEND_ONLY_FLAG, DEBUG_FLAG, PREPARE_FLAG})
LOOPBACK_BIND_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})

VENV_DIR = ROOT / '.venv-store'
VENV_PYTHON = (
    VENV_DIR / 'Scripts' / 'python.exe'
    if IS_WINDOWS
    else VENV_DIR / 'bin' / 'python'
)
APP_REQUIREMENTS = APP_BACKEND / 'src' / 'requirements.txt'
STORE_REQUIREMENTS = STORE_BACKEND / 'src' / 'requirements.txt'
APP_SOURCE = APP_BACKEND / 'src'

CLIENT_KEYS_DIR = ROOT / 'keys'


def bun_bin() -> str:
    return 'bun.exe' if IS_WINDOWS else 'bun'


def install_requirements() -> None:
    subprocess.check_call([
        str(VENV_PYTHON), '-m', 'pip', 'install',
        '-r', str(APP_REQUIREMENTS),
        '-r', str(STORE_REQUIREMENTS),
    ])


def venv_dependencies_ready() -> bool:
    """venv 目录在、依赖却可能是空的：编辑器 / ``python -m venv`` 会建出裸环境。"""
    probe = subprocess.run(
        [str(VENV_PYTHON), '-c', 'import uvicorn, watchfiles'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return probe.returncode == 0


def ensure_venv() -> str:
    """返回用于启动两个服务的 Python 解释器。"""
    if VENV_PYTHON.is_file():
        if venv_dependencies_ready():
            return str(VENV_PYTHON)
        print('共享 venv 缺少依赖，正在补装…', flush=True)
        install_requirements()
        return str(VENV_PYTHON)
    subprocess.check_call([sys.executable, '-m', 'venv', str(VENV_DIR)])
    install_requirements()
    return str(VENV_PYTHON)


def ensure_debugpy(python: str) -> None:
    """``--debug`` 用：确保共享 venv 里装了 debugpy。

    故意不写进 requirements.txt —— 它只服务本地调试：线上镜像由 uvicorn 直接起服务，
    代码里没有任何 ``import debugpy``，塞进去只是白多一个包和一份 SBOM 升级面。
    """
    probe = subprocess.run(
        [python, '-c', 'import debugpy'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if probe.returncode == 0:
        return
    print('--debug 需要 debugpy，正在装入共享 venv…', flush=True)
    subprocess.check_call([python, '-m', 'pip', 'install', 'debugpy'])


def ensure_license_keys() -> dict[str, str]:
    """确保本地授权密钥存在并镜像公钥，返回主应用需要的环境变量覆盖项。
    """
    keys_dir = HOMEOS_STORE / 'keys' / 'local'
    ensure_store_keys(keys_dir)
    return sync_store_keys(store_dir=keys_dir, target_dir=CLIENT_KEYS_DIR)


def spawn(
    command: list[str],
    environment: dict[str, str],
    cwd: Path | None = None,
) -> subprocess.Popen:
    kwargs: dict = {'cwd': str(cwd or ROOT), 'env': environment}
    if IS_WINDOWS:
        kwargs['creationflags'] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    return subprocess.Popen(command, **kwargs)


def terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if IS_WINDOWS:
        process.terminate()
        return
    process.send_signal(signal.SIGTERM)


def primary_lan_address() -> str:
    """探出本机对外的局域网 IPv4 地址；拿不到时返回空串。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('192.0.2.1', 9))
        address = probe.getsockname()[0]
    except OSError:
        return ''
    finally:
        probe.close()
    return '' if address in LOOPBACK_BIND_HOSTS else address


class RunOptions(NamedTuple):
    """三个开关各自独立：``--lan`` 管绑定地址，``--backend-only`` 管要不要 Vite，
    ``--debug`` 管后端要不要多挂一个 debugpy 监听端口。
    """

    host: str
    backend_only: bool
    debug: bool


def resolve_run_options(arguments: list[str]) -> RunOptions:
    """把命令行参数解析成「绑哪个地址」「是否只起后端」「是否挂调试器」。
    """
    unknown = [item for item in arguments if item not in KNOWN_FLAGS]
    if unknown:
        print(f'⚠ 忽略了无法识别的参数：{" ".join(unknown)}')
        print(f'  本脚本只认 {" / ".join(sorted(KNOWN_FLAGS))}。')
    return RunOptions(
        host=LAN_HOST if LAN_FLAG in arguments else HOST,
        backend_only=BACKEND_ONLY_FLAG in arguments,
        debug=DEBUG_FLAG in arguments,
    )


def is_port_listening(port: str) -> bool:
    """探测本机回环地址上 ``port`` 是否已有服务在监听。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    try:
        return probe.connect_ex(('127.0.0.1', int(port))) == 0
    finally:
        probe.close()


def ensure_ports_available(*, frontend: bool, debug: bool) -> None:
    """启动前预检服务端口；已被占用时立刻中止，不拉起任何子进程。
    """
    ports = list(BACKEND_PORTS)
    if frontend:
        ports.extend(FRONTEND_PORTS)
    if debug:
        ports.extend(DEBUG_PORTS)
    occupied = [(port, name) for port, name in ports if is_port_listening(port)]
    if not occupied:
        return
    print('⚠ 检测到服务端口已被占用，本次启动已中止（未拉起任何进程）：', flush=True)
    for port, name in occupied:
        print(f'  - {port}（{name}）已有服务在监听', flush=True)
    print('  最常见的原因是上一份 ops/start.py 还没退出，或已在另一个终端里运行 Vite。', flush=True)
    print('  请先停掉已有实例再启动：关闭它所在的终端，或执行 `pkill -f ops/start.py`。', flush=True)
    raise SystemExit(1)


def anonymous_whitelist_complete() -> bool:
    """匿名静态资源白名单是否覆盖了 frontend/public 里真实存在的种子条目。

    只看 ``assets/*.js`` 存在是不够的：一次中途失败的构建（Vite 清空 outDir 时抛
    ENOTEMPTY）会留下「构建产物在、frontend/public 的拷贝没铺」的半成品 dist。
    此时 dist/public-static.json 里图标与 manifest 会被 vite 插件按「产物不存在」
    整批筛掉，未登录页请求 favicon / webmanifest 就变成 401/403。这里按种子清单
    反查一遍：凡是在 frontend/public 里真实存在的匿名条目，都必须出现在生成的清单里。
    """
    try:
        seed = json.loads((HOMEOS_3D / 'frontend' / 'public-static.seed.json').read_text(encoding = 'utf-8'))
        manifest = json.loads((HOMEOS_3D_FRONTEND / 'public-static.json').read_text(encoding = 'utf-8'))
    except (OSError, json.JSONDecodeError):
        return False
    generated = set()
    for entry in manifest.get('files', []) or []:
        path = entry if isinstance(entry, str) else entry.get('path') if isinstance(entry, dict) else None
        if isinstance(path, str):
            generated.add(path)
    public_root = HOMEOS_3D / 'frontend' / 'public'
    for item in seed.get('files', []) or []:
        path = item if isinstance(item, str) else item.get('path') if isinstance(item, dict) else None
        if not isinstance(path, str) or not path.startswith('/static/'):
            continue
        if not (public_root / path.lstrip('/')).exists():
            continue
        if path not in generated:
            return False
    return True


def ensure_frontend_build() -> None:
    """若缺少 Vite 构建产物则跑一次 ``bun run build:vite``（开发用，不混淆）。
    """
    ready = (
        (HOMEOS_3D_FRONTEND / 'static' / 'assets').is_dir()
        and any((HOMEOS_3D_FRONTEND / 'static' / 'assets').glob('*.js'))
        and (HOMEOS_3D_FRONTEND / 'modules' / 'runtime' / 'manifest.json').is_file()
        and anonymous_whitelist_complete()
        and (HOMEOS_STORE_FRONTEND / 'static' / 'assets').is_dir()
        and any((HOMEOS_STORE_FRONTEND / 'static' / 'assets').glob('*.js'))
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


def debugpy_prefix(python: str, debug_port: str) -> list[str]:
    """把真正的启动命令包进 debugpy 的监听模式（IDE 随后 attach 到这个端口）。

    这里是「断点」与「热重载」能同时成立的关键：debugpy 的 ``--listen`` 默认就带
    ``subProcess=True``（见 debugpy.server.cli 里的 ``options.config``），它会 patch
    ``multiprocessing``；而主应用的 uvicorn ``--reload`` 与商店的 ``STORE_RELOAD`` 恰恰是用
    ``multiprocessing`` 的 spawn 去拉重载子进程（uvicorn/_subprocess.py）。子进程因此会自己
    连回同一个调试会话 —— 改完代码重载出来的进程里，断点照样命中。

    这也是**不能**把 ``--reload`` 摘掉的原因：摘掉虽然能调试，却把热重载弄丢了。

    ``-Xfrozen_modules=off`` 是 Python 3.11+ 的必需项：解释器默认用冻结的 stdlib 模块，
    debugpy 会因此漏掉断点（启动日志里那句 "It seems that frozen modules are being used"）。
    IDE 的 launch 配置会自动带这个参数，我们走命令行就得自己加。
    """
    return [python, '-Xfrozen_modules=off', '-m', 'debugpy', '--listen', debug_port]


def main() -> None:
    if PREPARE_FLAG in sys.argv[1:]:
        print(f'Python 环境就绪：{ensure_venv()}', flush=True)
        return
    options = resolve_run_options(sys.argv[1:])
    ensure_ports_available(frontend=not options.backend_only, debug=options.debug)
    python = ensure_venv()
    if options.debug:
        ensure_debugpy(python)
    ensure_frontend_build()
    license_overrides = ensure_license_keys()
    load_dotenv()
    base_environment = os.environ.copy()
    base_environment.pop('PYTHONHOME', None)
    for proxy_key in (
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'SOCKS_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy', 'socks_proxy',
        'NO_PROXY', 'no_proxy',
    ):
        base_environment.pop(proxy_key, None)

    app_environment = base_environment.copy()
    app_environment['APP_DATA_DIR'] = str(HOMEOS_3D / 'data')
    app_environment['HOMEOS_FRONTEND_DIR'] = str(HOMEOS_3D_FRONTEND)
    app_environment['PYTHONPATH'] = str(HOMEOS_3D)
    app_environment.update(license_overrides)

    store_environment = base_environment.copy()
    store_environment['STORE_DATA_DIR'] = str(HOMEOS_STORE / 'data')
    store_environment['STORE_LICENSE_KEYS_DIR'] = str(HOMEOS_STORE / 'keys' / 'local')
    store_environment['STORE_HOST'] = options.host
    store_environment['STORE_PORT'] = STORE_PORT
    store_environment['PYTHONPATH'] = str(STORE_BACKEND)
    store_environment.setdefault('STORE_RELOAD', '1')
    store_environment.setdefault('STORE_MAIL_MODE', 'log')

    store_command = [python, '-m', 'src.run']
    app_command = [
        python,
        '-m',
        'uvicorn',
        'backend.src.main:app',
        '--host',
        options.host,
        '--port',
        APP_PORT,
        '--reload',
        '--reload-dir',
        str(APP_SOURCE),
    ]
    if options.debug:
        store_command = debugpy_prefix(python, DEBUG_STORE_PORT) + store_command
        app_command = debugpy_prefix(python, DEBUG_APP_PORT) + app_command

    processes = [
        spawn(store_command, store_environment, cwd=HOMEOS_STORE),
        spawn(app_command, app_environment, cwd=HOMEOS_3D),
    ]

    if not options.backend_only:
        frontend_env = base_environment.copy()
        processes.extend([
            spawn(
                vite_dev_command('frontend/vite.config.ts', options.host),
                frontend_env,
                cwd=HOMEOS_3D,
            ),
            spawn(
                vite_dev_command('frontend/vite.config.ts', options.host),
                frontend_env,
                cwd=HOMEOS_STORE,
            ),
        ])

    def stop(_signum=None, _frame=None) -> None:
        for process in processes:
            terminate(process)

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, 'SIGTERM') and not IS_WINDOWS:
        signal.signal(signal.SIGTERM, stop)

    if options.debug:
        mode = 'debug'
    elif options.backend_only:
        mode = 'backend-only'
    else:
        mode = 'dev'
    print(f'HomeOS 本地启动（{mode}）', flush=True)
    if not options.backend_only:
        print(f'前端 HMR  主应用   http://{HOST}:{VITE_3D_PORT}/', flush=True)
        print(f'          授权商店 http://{HOST}:{VITE_STORE_PORT}/', flush=True)
    print(f'后端 API  主应用   http://{HOST}:{APP_PORT}/setup', flush=True)
    print(f'          授权商店 http://{HOST}:{STORE_PORT}/', flush=True)
    if options.debug:
        print(f'调试器    主应用   {DEBUG_APP_PORT}（IDE attach，热重载保留）', flush=True)
        print(f'          授权商店 {DEBUG_STORE_PORT}（IDE attach，热重载保留）', flush=True)
    if not options.backend_only:
        print('改页面走 HMR 地址。改 runtime 另开：bun run --cwd homeos-3d dev:runtime', flush=True)
    if options.host not in LOOPBACK_BIND_HOSTS:
        lan_address = primary_lan_address()
        print(flush=True)
        print(f'已绑定 {options.host}，同网段设备用下面的地址访问（Host 与 Origin 会随之校验，无需额外配置）：', flush=True)
        if lan_address:
            if not options.backend_only:
                print(f'局域网 HMR  主应用   http://{lan_address}:{VITE_3D_PORT}/', flush=True)
                print(f'            授权商店 http://{lan_address}:{VITE_STORE_PORT}/', flush=True)
            print(f'局域网 API  主应用   http://{lan_address}:{APP_PORT}/', flush=True)
            print(f'            授权商店 http://{lan_address}:{STORE_PORT}/', flush=True)
        else:
            print(
                f'  （没探到局域网地址，请自行查看本机 IP；'
                f'端口 {APP_PORT}/{STORE_PORT}'
                + (f'/{VITE_3D_PORT}/{VITE_STORE_PORT}' if not options.backend_only else '')
                + '）',
                flush=True,
            )
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
