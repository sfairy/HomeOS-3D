#!/usr/bin/env python3
"""本地开发启动脚本。

同时拉起两个服务：

- 主应用（backend.app.main）    http://127.0.0.1:18081
- 授权商店（store）             http://127.0.0.1:18082

两者共享项目根目录下的 ``.venv-store`` 虚拟环境。
可在 macOS / Linux / Windows 上直接运行：``python start.py``。
"""
from __future__ import annotations

import hashlib
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from store.env import load_dotenv

ROOT = Path(__file__).resolve().parent
IS_WINDOWS = sys.platform == 'win32'

# 端口
APP_PORT = '18081'
STORE_PORT = '18082'
HOST = '127.0.0.1'

# 共享虚拟环境（缺失时自动创建并按商店依赖安装）
VENV_DIR = ROOT / '.venv-store'
# Unix: .venv-store/bin/python ；Windows: .venv-store/Scripts/python.exe
VENV_PYTHON = (
    VENV_DIR / 'Scripts' / 'python.exe'
    if IS_WINDOWS
    else VENV_DIR / 'bin' / 'python'
)
REQUIREMENTS = ROOT / 'store' / 'requirements.txt'

# 客户端默认读取的公钥镜像目录；gen_keys 会把 store/keys/local/ 的公钥同步到这里。
CLIENT_KEYS_DIR = ROOT / 'keys'
LICENSE_PUBLIC_KEY = CLIENT_KEYS_DIR / 'license-public.pem'
LICENSE_TRANSPORT_PUBLIC_KEY = CLIENT_KEYS_DIR / 'license-transport-public.pem'


def ensure_venv() -> str:
    """返回用于启动两个服务的 Python 解释器。"""
    if VENV_PYTHON.is_file():
        return str(VENV_PYTHON)
    subprocess.check_call([sys.executable, '-m', 'venv', str(VENV_DIR)])
    subprocess.check_call([str(VENV_PYTHON), '-m', 'pip', 'install', '-r', str(REQUIREMENTS)])
    return str(VENV_PYTHON)


def ensure_license_keys(python: str) -> dict[str, str]:
    """生成并镜像本地授权密钥，返回主应用需要的环境变量覆盖项。

    config.py 里钉死的公钥指纹是正式发布版本的，本地开发生成的密钥指纹不同；
    这里用环境变量把主应用的指纹校验对准本地密钥，避免改动发布版常量。
    gen_keys 幂等：已存在则复用、缺失则生成，同时把公钥镜像到 keys/。
    """
    source = ROOT / 'store' / 'keys' / 'local' / 'license-transport-public.pem'
    need_generate = not source.is_file()
    # 镜像缺失或与真相源不一致时重新同步：避免占位公钥让指纹校验失败。
    need_mirror = not LICENSE_TRANSPORT_PUBLIC_KEY.is_file() or (
        source.is_file()
        and LICENSE_TRANSPORT_PUBLIC_KEY.read_bytes() != source.read_bytes()
    )
    if need_generate or need_mirror:
        # 抑制 gen_keys 的常规输出（仅首次生成时有用）；失败时 check_call 会抛错。
        subprocess.check_call(
            [python, '-m', 'store.tools.gen_keys'],
            stdout=subprocess.DEVNULL,
        )
    overrides = {}
    for env_name, key_path in (
        ('APP_LICENSE_PUBLIC_KEY_SHA256', LICENSE_PUBLIC_KEY),
        ('APP_LICENSE_TRANSPORT_PUBLIC_KEY_SHA256', LICENSE_TRANSPORT_PUBLIC_KEY),
    ):
        overrides[env_name] = hashlib.sha256(key_path.read_bytes()).hexdigest()
    return overrides


def spawn(command: list[str], environment: dict[str, str]) -> subprocess.Popen:
    kwargs: dict = {'cwd': str(ROOT), 'env': environment}
    if IS_WINDOWS:
        # 独立进程组，便于父进程接管 Ctrl+C 后干净终止子进程。
        kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(command, **kwargs)


def terminate(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if IS_WINDOWS:
        # Windows 上 SIGTERM 不可靠；terminate() 映射为 TerminateProcess。
        process.terminate()
        return
    process.send_signal(signal.SIGTERM)


def main() -> None:
    python = ensure_venv()
    # 本地密钥指纹覆盖：把主应用的指纹校验对准本地生成的密钥，
    # 而不是 config.py 里钉死的正式发布版指纹。
    license_overrides = ensure_license_keys(python)
    # .env 提供 SMTP 授权码等本地配置；已存在的真实环境变量优先
    load_dotenv()
    base_environment = os.environ.copy()
    # PYTHONHOME 会覆盖 venv 的 site-packages 搜索路径，导致子进程去系统
    # Python 目录找包而非 venv。start.py 用的是 venv 的 python，必须清掉它。
    base_environment.pop('PYTHONHOME', None)
    # httpx / requests / urllib 会自动读 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY /
    # SOCKS_PROXY / NO_PROXY 等环境变量；开发机如果挂了代理，主应用连商店就会
    # 走代理（甚至被 SOCKS 代理拖崩），两者本应是 localhost 直连。
    for proxy_key in (
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'SOCKS_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy', 'socks_proxy',
    ):
        base_environment.pop(proxy_key, None)

    app_environment = base_environment.copy()
    app_environment['APP_DATA_DIR'] = str(ROOT / 'data')
    app_environment['PYTHONPATH'] = str(ROOT / 'backend' / 'app')
    app_environment.update(license_overrides)

    store_environment = base_environment.copy()
    store_environment['STORE_DATA_DIR'] = str(ROOT / 'store' / 'data')
    store_environment['STORE_HOST'] = HOST
    store_environment['STORE_PORT'] = STORE_PORT
    store_environment['PYTHONPATH'] = str(ROOT)
    # 本地联调打开热重载：主应用用 --reload，商店也要跟着重载，否则改了 store/ 下的
    # 授权协议/密钥相关代码后商店仍跑旧模块，客户端会出现「授权请求无法解密」。
    store_environment.setdefault('STORE_RELOAD', '1')
    # 本地联调：验证码回显到接口响应（并同步写入日志），否则默认 log 模式会让注册流程
    # 卡在「收不到验证码」。.env 里写了 STORE_MAIL_MODE=smtp 就会走真实发信。
    store_environment.setdefault('STORE_MAIL_MODE', 'echo')
    # 本地联调：模拟收银台（点一下就发码）需要**两个**变量同时显式打开 ——
    # 光选渠道不够，服务端还必须允许 mock。这个「双开关」是刻意的：默认配置下
    # 未配置渠道或配成 mock 都无法建单，避免照文档部署就等于白送授权。
    # 生产部署绝不要设置这两个变量（该用 STORE_PAYMENT_PROVIDER=alipay）。
    store_environment.setdefault('STORE_PAYMENT_PROVIDER', 'mock')
    store_environment.setdefault('STORE_ALLOW_MOCK_PAYMENTS', '1')

    # 主应用的重载范围必须收窄到 backend/：不给 --reload-dir 时 uvicorn 会监听整个
    # 仓库根目录，前端 JS / 样式与 store/ 只要落盘就会重启主应用；重启窗口里在途请求
    # 要么被拒要么排队，前端 5 秒硬超时的 /api/v1/modules/interaction3d/access 会
    # 直接报「暂时无法验证授权」，渲染缓存请求也会被连带中断。
    # 这些静态文件本来就是按请求现读的（FileResponse / StaticFiles），不需要重启进程；
    # 后端也没有任何从 backend/ 之外动态加载 Python 的逻辑，收窄不会漏掉真正的热更。
    processes = [
        spawn([python, '-m', 'store.run'], store_environment),
        spawn(
            [
                python,
                '-m',
                'uvicorn',
                'backend.app.main:app',
                '--host',
                HOST,
                '--port',
                APP_PORT,
                '--reload',
                '--reload-dir',
                str(ROOT / 'backend'),
            ],
            app_environment,
        ),
    ]

    def stop(_signum=None, _frame=None) -> None:
        for process in processes:
            terminate(process)

    signal.signal(signal.SIGINT, stop)
    # SIGTERM 在 Windows 上通常不可用 / 无意义，仅在 POSIX 注册。
    if hasattr(signal, 'SIGTERM') and not IS_WINDOWS:
        signal.signal(signal.SIGTERM, stop)

    print(f'主应用  http://{HOST}:{APP_PORT}/setup')
    print(f'授权商店  http://{HOST}:{STORE_PORT}/')
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
