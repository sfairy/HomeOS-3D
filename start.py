#!/usr/bin/env python3
"""本地开发启动脚本。

同时拉起两个服务：

- 主应用（backend.app.main）    http://127.0.0.1:18081
- 授权商店（store）             http://127.0.0.1:18082

两者共享项目根目录下的 ``.venv-store`` 虚拟环境。
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from store.env import load_dotenv

ROOT = Path(__file__).resolve().parent

# 端口
APP_PORT = '18081'
STORE_PORT = '18082'
HOST = '127.0.0.1'

# 共享虚拟环境（缺失时自动创建并按商店依赖安装）
VENV_DIR = ROOT / '.venv-store'
VENV_PYTHON = VENV_DIR / 'bin' / 'python'
REQUIREMENTS = ROOT / 'store' / 'requirements.txt'


def ensure_venv() -> str:
    """返回用于启动两个服务的 Python 解释器。"""
    if VENV_PYTHON.is_file():
        return str(VENV_PYTHON)
    subprocess.check_call([sys.executable, '-m', 'venv', str(VENV_DIR)])
    subprocess.check_call([str(VENV_PYTHON), '-m', 'pip', 'install', '-r', str(REQUIREMENTS)])
    return str(VENV_PYTHON)


def spawn(command: list[str], environment: dict[str, str]) -> subprocess.Popen:
    return subprocess.Popen(command, cwd=ROOT, env=environment)


def main() -> None:
    python = ensure_venv()
    # .env 提供 SMTP 授权码等本地配置；已存在的真实环境变量优先
    load_dotenv()
    base_environment = os.environ.copy()

    app_environment = base_environment.copy()
    app_environment['APP_DATA_DIR'] = str(ROOT / 'data')
    app_environment['PYTHONPATH'] = str(ROOT / 'backend' / 'app')

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
            ],
            app_environment,
        ),
    ]

    def stop(_signum=None, _frame=None) -> None:
        for process in processes:
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f'主应用  http://{HOST}:{APP_PORT}/setup')
    print(f'授权商店  http://{HOST}:{STORE_PORT}/')
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.4)
    finally:
        stop()
        for process in processes:
            process.wait()


if __name__ == '__main__':
    main()
