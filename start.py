#!/usr/bin/env python3
"""本地开发启动脚本。

同时拉起两个服务：

- 主应用（backend.main）    http://127.0.0.1:18081
- 授权商店（store）             http://127.0.0.1:18082

两者共享项目根目录下的 ``.venv-store`` 虚拟环境。
可在 macOS / Linux / Windows 上直接运行：``python start.py``。
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

from docker.license_keys import ensure_store_license_keys
from store.core.env import load_dotenv

ROOT = Path(__file__).resolve().parent
IS_WINDOWS = sys.platform == 'win32'

# 端口
APP_PORT = '18081'
STORE_PORT = '18082'
#: 本脚本要拉起的两个服务端口及其中文名：预检报错与启动提示共用同一份，
#: 将来多一个服务时只改这里，不会出现「预检漏查一个端口」。
SERVICE_PORTS = ((APP_PORT, '主应用'), (STORE_PORT, '授权商店'))
#: 默认只绑回环。这是**本地开发**脚本，而它默认打开的两个联调后门（见下方 LOOPBACK 说明）
#: 一旦连同网卡一起暴露，就等于把「点一下直接签发真实授权」交给同网段的每台设备。
#: 要用局域网访问请显式加 ``--lan``。
HOST = '127.0.0.1'
#: ``--lan`` 时绑到所有网卡，让同网段的平板 / 墙面板 / 另一台机器都能访问。
LAN_HOST = '0.0.0.0'
#: 命令行开关。
LAN_FLAG = '--lan'
#: ``--lan`` 下仍要保留模拟收银台的**危险**开关：默认拒绝，必须显式写出来。
ALLOW_MOCK_ON_LAN_FLAG = '--allow-mock-payments'
#: 绑定到这些地址时才算「只有本机能访问」，联调后门才会默认打开。
#: 与 ``store/config.py`` 的 ``_LOOPBACK_BIND_HOSTS`` 同一套口径。
LOOPBACK_BIND_HOSTS = frozenset({'127.0.0.1', '::1', 'localhost'})

# 共享虚拟环境（缺失时自动创建并按商店依赖安装）
VENV_DIR = ROOT / '.venv-store'
# Unix: .venv-store/bin/python ；Windows: .venv-store/Scripts/python.exe
VENV_PYTHON = (
    VENV_DIR / 'Scripts' / 'python.exe'
    if IS_WINDOWS
    else VENV_DIR / 'bin' / 'python'
)
REQUIREMENTS = ROOT / 'store' / 'requirements.txt'

# 客户端默认读取的公钥镜像目录；ensure_license_keys() 会把 store/keys/local/ 的公钥同步到这里。
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


def ensure_license_keys() -> dict[str, str]:
    """确保本地授权密钥存在并镜像公钥，返回主应用需要的环境变量覆盖项。

    config.py 里钉死的公钥指纹是正式发布版本的，本地开发生成的密钥指纹不同；
    这里用环境变量把主应用的指纹校验对准本地密钥，避免改动发布版常量。
    ``ensure_store_license_keys`` 幂等：已存在则复用、缺失则生成，同时把公钥
    镜像到 ``keys/``（与容器启动复用同一段逻辑，不依赖任何命令行脚本）。
    """
    keys_dir = ROOT / 'store' / 'keys' / 'local'
    source = keys_dir / 'license-transport-public.pem'
    # 镜像缺失或与真相源不一致时重新同步：避免占位公钥让指纹校验失败。
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


def primary_lan_address() -> str:
    """探出本机对外的局域网 IPv4 地址；拿不到时返回空串。

    用 UDP socket 的「连接」让内核选一条默认路由：它只查路由表、**不发任何数据包**，
    因此不需要网络可达、也不会因为目标不可达而失败。``--lan`` 时把结果打出来，
    省得用户自己翻系统设置找 IP 再手打给另一台设备。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # TEST-NET-1（192.0.2.0/24，RFC 5737）保留给文档示例，不会指向真实主机；
        # 这里只用它选路，永远不会真的发包。
        probe.connect(('192.0.2.1', 9))
        address = probe.getsockname()[0]
    except OSError:
        return ''
    finally:
        probe.close()
    return '' if address in LOOPBACK_BIND_HOSTS else address


def resolve_run_options(arguments: list[str]) -> tuple[str, bool]:
    """把命令行参数解析成「绑哪个地址 + 是否开模拟支付」。

    抽成纯函数是为了能单独验证这套判断，而不必真的把服务拉起来：它决定了「联调后门会
    不会连同网卡一起暴露」，是本次改动里唯一有安全后果的一行逻辑。

    模拟收银台是「点一下就直接签发一张真实授权」（见 ``store/payments/mock.py`` 与
    ``store/config.py`` 的 ``payment_provider`` 注释）—— 它只在服务**仅绑本机**时算联调
    后门。一旦绑到局域网，同网段任何设备（访客手机、被入侵的智能家居设备）都能白拿授权，
    因此 ``--lan`` 下默认关掉它，要开必须再显式加 ``--allow-mock-payments``。
    """
    unknown = [item for item in arguments if item not in {LAN_FLAG, ALLOW_MOCK_ON_LAN_FLAG}]
    if unknown:
        # 必须喊出来：把 ``--lan`` 打成 ``--Lang`` 会被静默忽略，结果退回只绑回环，
        # 而用户以为已经暴露到局域网了 —— 排查这种「明明加了参数却访问不到」最费时间。
        print(f'⚠ 忽略了无法识别的参数：{" ".join(unknown)}')
        print(f'  本脚本只认 {LAN_FLAG} 和 {ALLOW_MOCK_ON_LAN_FLAG}。')
    host = LAN_HOST if LAN_FLAG in arguments else HOST
    mock_payments = host in LOOPBACK_BIND_HOSTS or ALLOW_MOCK_ON_LAN_FLAG in arguments
    return host, mock_payments


def is_port_listening(port: str) -> bool:
    """探测本机回环地址上 ``port`` 是否已有服务在监听。

    用「连得上」而不是「绑不上」判断，是因为绑定探测在这里会说谎：macOS 允许
    ``0.0.0.0:P`` 与 ``127.0.0.1:P`` 同时存在，第二个实例的商店能成功绑上
    ``127.0.0.1:18082``，随后主应用才在 ``data/.license-process.lock`` 上抢锁失败退出
    （见 ``backend/license/process_lock.py``）—— 于是「端口已被占用」被误判成「空闲」。
    只有真正发起一次 TCP 连接才能区分这两种状态。
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.5)
    try:
        # connect_ex 返回 0 表示对端接受了连接（即该端口有人在监听），非 0 表示没有服务。
        return probe.connect_ex(('127.0.0.1', int(port))) == 0
    finally:
        probe.close()


def ensure_ports_available() -> None:
    """启动前预检两个服务端口；已被占用时立刻中止，不拉起任何子进程。

    没有这道预检时，端口被旧实例占用的表现是「商店起来了、主应用在 lifespan 里抢授权锁
    失败退出」的半启动状态：两个商店同时对外服务，而客户端在重启窗口里全是
    ``TypeError: Failed to fetch``（见 ``data/logs/global-events.jsonl``）——现象与
    「后端崩了」无异，却没有一句日志指向「你启动了第二个实例」。所以拦在 fork 之前：
    一旦端口被占，宁可什么都不起，也不留一个更难排查的半启动进程树。
    """
    occupied = [(port, name) for port, name in SERVICE_PORTS if is_port_listening(port)]
    if not occupied:
        return
    print('⚠ 检测到服务端口已被占用，本次启动已中止（未拉起任何进程）：', flush=True)
    for port, name in occupied:
        print(f'  - {port}（{name}）已有服务在监听', flush=True)
    print('  最常见的原因是上一份 start.py 还没退出，或已在另一个终端里运行。', flush=True)
    print('  请先停掉已有实例再启动：关闭它所在的终端，或执行 `pkill -f start.py`。', flush=True)
    # 非零退出码：让调用方（shell 脚本 / CI）也能区分「拒绝启动」与正常结束。
    raise SystemExit(1)


def main() -> None:
    host, mock_payments = resolve_run_options(sys.argv[1:])
    # 预检必须在拉起任何子进程之前（见 ensure_ports_available 的说明）。
    ensure_ports_available()
    python = ensure_venv()
    # 本地密钥指纹覆盖：把主应用的指纹校验对准本地生成的密钥，
    # 而不是 config.py 里钉死的正式发布版指纹。
    license_overrides = ensure_license_keys()
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
    app_environment['PYTHONPATH'] = str(ROOT)
    app_environment.update(license_overrides)

    store_environment = base_environment.copy()
    store_environment['STORE_DATA_DIR'] = str(ROOT / 'store' / 'data')
    store_environment['STORE_HOST'] = host
    store_environment['STORE_PORT'] = STORE_PORT
    store_environment['PYTHONPATH'] = str(ROOT)
    # 本地联调打开热重载：主应用用 --reload，商店也要跟着重载，否则改了 store/ 下的
    # 授权协议/密钥相关代码后商店仍跑旧模块，客户端会出现「授权请求无法解密」。
    store_environment.setdefault('STORE_RELOAD', '1')
    # 本地联调：验证码回显到接口响应（并同步写入日志），否则默认 log 模式会让注册流程
    # 卡在「收不到验证码」。.env 里写了 STORE_MAIL_MODE=smtp 就会走真实发信。
    # 回显本身是安全的：商店对**所有** mail_mode 都只对可确认来自本机的请求回显，
    # 局域网客户端只会让验证码进服务端日志、不出现在跨网络的响应里（见 store/api/store.py
    # 的 echo_allowed），所以这一项与绑定地址无关，不必跟着收紧。
    store_environment.setdefault('STORE_MAIL_MODE', 'echo')
    # 本地联调：模拟收银台（点一下就发码）。它是**双开关**：光选渠道不够，服务端还必须允许
    # mock —— 这个刻意设计就是为了「照文档部署 ≠ 白送授权」。这里再叠一道：绑到局域网时
    # 默认根本不打开它们，除非用户显式写了 --allow-mock-payments。
    # 生产部署绝不要设置这两个变量（该用 STORE_PAYMENT_PROVIDER=alipay）。
    if mock_payments:
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
                'backend.main:app',
                '--host',
                host,
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

    # 全部 flush=True：这几行是「复制哪个地址去别的设备」的唯一出处，而后台运行时 stdout 是
    # 块缓冲的重定向文件 —— 不显式 flush 就会卡在缓冲区里，服务正常跑着却看不到地址，
    # 恰恰在最需要它的「nohup 起好了但不知道访问什么」场景下消失。
    print(f'本机访问  主应用 http://{HOST}:{APP_PORT}/setup', flush=True)
    print(f'          授权商店 http://{HOST}:{STORE_PORT}/', flush=True)
    if host not in LOOPBACK_BIND_HOSTS:
        # 不要在这条分支里再重复打印回环地址：--lan 下运维要复制给对方设备的是局域网地址，
        # 上面那两行只说明「本机怎么访问」，混在一起最容易贴错一个连不上的链接。
        lan_address = primary_lan_address()
        print('', flush=True)
        print(f'已绑定 {host}，同网段设备用下面的地址访问（Host 与 Origin 会随之校验，无需额外配置）：', flush=True)
        if lan_address:
            print(f'局域网访问  主应用   http://{lan_address}:{APP_PORT}/', flush=True)
            print(f'            授权商店 http://{lan_address}:{STORE_PORT}/', flush=True)
        else:
            print(f'  （没探到局域网地址，请自行查看本机 IP，端口 {APP_PORT} / {STORE_PORT}）', flush=True)
        if mock_payments:
            print('  ⚠ 模拟支付已开启：同网段任何设备都能点「模拟收银台」直接拿到真实授权。', flush=True)
            print('    仅在你完全信任当前网络、且确认只是联调时保留；否则去掉 --allow-mock-payments 重启。', flush=True)
        else:
            print('  模拟支付已关闭（--lan 下的默认）：要联调模拟收银台请加 --allow-mock-payments。', flush=True)
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
