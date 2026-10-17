"""容器内 Caddy 反代与应用进程的守护（反代已内置进镜像，见 Dockerfile）。

两个镜像各自内置自己那一侧的反代，并由本模块在容器里与后端一起拉起：

  - 主应用镜像：Caddy 监听 :8803 → 反代同容器 127.0.0.1:8801（uvicorn）
  - 商店镜像：  Caddy 监听 :8804 → 反代同容器 127.0.0.1:8802（商店）

反代与应用同容器、同镜像 tag、同生命周期，因此：

  - 配置随镜像发布，不会和宿主机上的文件漂移；
  - 不要求先把应用端口发布到宿主机；
  - 对端固定是回环，uvicorn 的转发头信任范围保持默认 ``127.0.0.1,::1`` 即可，
    不必放宽到 docker 网段（限流与审计的来源地址因此保持可信）。

Caddy 退出会被记录并按节奏重启；超过上限后放弃反代但**不**拖垮应用进程（HTTP 直连
端口仍可用）。主进程退出会连带停掉 Caddy，让容器一起退出并由 restart 策略接管。
"""
from __future__ import annotations

import ipaddress
import os
import shutil
import signal
import subprocess
import sys
import time
from collections.abc import Mapping, MutableMapping, Sequence
from pathlib import Path
from typing import Any, NamedTuple

CADDY_BINARY = 'caddy'
CADDY_CONFIG = Path('/etc/caddy/Caddyfile')

RESTART_DELAY_SECONDS = 1.0
MAX_CADDY_RESTARTS = 5
TERMINATE_GRACE_SECONDS = 10.0
POLL_INTERVAL_SECONDS = 0.5

#: Caddyfile 里 ``default_sni`` 的取值变量名 → 默认名。默认名必须与
#: ``ops/caddy/*.Caddyfile`` 的 ``{$VAR:默认名}`` 逐字一致，否则这里打印的提示就是错的。
DEFAULT_SNI_VARIABLE = 'APP_HTTPS_DEFAULT_SNI'
DEFAULT_SNI_FALLBACK = 'homeos.local'
STORE_DEFAULT_SNI_VARIABLE = 'STORE_HTTPS_DEFAULT_SNI'
STORE_DEFAULT_SNI_FALLBACK = 'store.local'


def _note(message: str) -> None:
    print(f'[proxy] {message}', flush=True)


def _warn(message: str) -> None:
    print(f'[proxy] {message}', file=sys.stderr, flush=True)


def caddy_environment(environment: Mapping[str, str], data_dir: Path) -> dict[str, str]:
    """给 Caddy 补上持久化的 XDG 目录。

    Caddy 把自签 CA 与证书放在 ``$XDG_DATA_HOME/caddy``：默认落到容器可写层，
    容器重建即失效。这里指到数据卷（``<data_dir>/caddy``），证书得以跨重启保留。
    """
    env = dict(environment)
    home = data_dir / 'caddy'
    env.setdefault('XDG_DATA_HOME', str(home / 'data'))
    env.setdefault('XDG_CONFIG_HOME', str(home / 'config'))
    return env


class DefaultSni(NamedTuple):
    """内置反代证书的默认名字（Caddyfile 的 ``default_sni``）解析结果。"""

    #: 最终生效的名字：证书会签给它，也就是「用 IP 访问时不会再报地址不匹配」的那个地址。
    value: str
    #: 是否由环境变量显式指定（``False`` 表示用的是 Caddyfile 里的默认名）。
    configured: bool
    #: 非空表示取值有问题、已被忽略（只影响提示文案，不影响启动）。
    warning: str


def _default_sni_problem(value: str) -> str:
    """取值不像「单个主机名或 IP」时给出原因；看起来正常则返回空串。"""
    if '://' in value or '/' in value:
        return '看起来是一个 URL，而 default_sni 只接受主机名或 IP（去掉 https:// 与端口）'
    if ',' in value or any(character.isspace() for character in value):
        return '看起来填了多个名字，而 default_sni 只接受一个（多个地址请只填你最常输入的那个）'
    if ':' in value:
        try:
            ipaddress.IPv6Address(value)
        except ValueError:
            return '带上了端口号，而 default_sni 只接受主机名或 IP（端口由 8803 / 8804 决定）'
    return ''


def resolve_default_sni(
    environment: MutableMapping[str, str],
    *,
    variable: str = DEFAULT_SNI_VARIABLE,
    fallback: str = DEFAULT_SNI_FALLBACK,
    hint: str = '',
) -> DefaultSni:
    """读取并校验内置反代证书的默认名字，必要时把变量摘掉。

    为什么需要这一步：浏览器用 **IP** 访问时不发 SNI（RFC 6066），Caddy 的 ``on_demand``
    拿不到名字，就只能按容器自己的 docker IP 签证书，浏览器随即判「证书与地址不匹配」。
    ``default_sni`` 给这类连接兜底，取值只能来自配置 —— 容器无法预知宿主的局域网地址。

    两种取值必须处理掉，否则故障很难读：
    - **空值**：Caddy 的 ``default_sni`` 收到空值会直接解析失败，反代起不来（重试 5 次后
      只剩一句「HTTPS 不可用」）。这里摘掉变量，让 Caddyfile 的默认值生效。
    - **不像名字的值**（URL / host:port / 逗号列表）：要么让 on_demand 去签一个不可能的名字
      （握手直接失败），要么静默签错名字。一律忽略并在启动日志里说清楚。

    摘变量而不是报错退出：内置反代是可选的旁路（见模块 docstring），不该因为它把一个
    本来能跑的应用拦在启动之外 —— 与 ``run_with_proxy`` 对 Caddy 崩溃的处理口径一致。

    ``hint`` 由调用方给（各角色知道自己的端口），拼在告警末尾告诉用户该怎么改。
    """
    raw = str(environment.get(variable) or '').strip()
    if not raw:
        # 没设是正常的（用默认名）；设成空串则必须摘掉，见上面「空值」那条。
        environment.pop(variable, None)
        return DefaultSni(fallback, configured=False, warning='')
    problem = _default_sni_problem(raw)
    if problem:
        environment.pop(variable, None)
        return DefaultSni(
            fallback,
            configured=False,
            warning=(
                f'{variable}={raw!r} {problem}；已忽略该取值，内置反代改用默认名 {fallback}。{hint}'
            ),
        )
    return DefaultSni(raw, configured=True, warning='')


def _caddy_command() -> list[str]:
    return [CADDY_BINARY, 'run', '--config', str(CADDY_CONFIG), '--adapter', 'caddyfile']


def _spawn(argv: Sequence[str], environment: Mapping[str, str]) -> subprocess.Popen:
    return subprocess.Popen(list(argv), env=dict(environment), close_fds=True)


def _stop(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=TERMINATE_GRACE_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def _exit_code(returncode: int | None) -> int:
    if returncode is None:
        return 0
    return returncode if returncode >= 0 else 128 - returncode


def run_with_proxy(
    main_command: Sequence[str],
    *,
    data_dir: Path,
    service_label: str,
) -> int:
    """常驻运行 ``main_command``，同时守护同容器的 Caddy 反代。

    返回主进程的退出码（收到终止信号时返回 128+signum）。
    """
    environment = dict(os.environ)

    caddy_available = shutil.which(CADDY_BINARY) is not None
    if not CADDY_CONFIG.is_file():
        _warn(f'{service_label}：缺少 {CADDY_CONFIG}，跳过内置反代（HTTP 直连端口仍可用）')
    elif not caddy_available:
        _warn(f'{service_label}：找不到 {CADDY_BINARY}，跳过内置反代（HTTP 直连端口仍可用）')
    proxy_enabled = CADDY_CONFIG.is_file() and caddy_available

    caddy_env = caddy_environment(environment, data_dir)
    if proxy_enabled:
        for key in ('XDG_DATA_HOME', 'XDG_CONFIG_HOME'):
            Path(caddy_env[key]).mkdir(parents=True, exist_ok=True)

    stopping: dict[str, int] = {}

    def _handle_signal(signum: int, _frame: object) -> None:
        stopping.setdefault('signal', signum)

    installed: dict[int, Any] = {}
    for name in ('SIGTERM', 'SIGINT'):
        number = getattr(signal, name, None)
        if number is not None:
            installed[number] = signal.signal(number, _handle_signal)

    caddy: subprocess.Popen | None = None
    restarts = 0
    if proxy_enabled:
        caddy = _spawn(_caddy_command(), caddy_env)
        _note(f'{service_label}内置反代已启动（{CADDY_CONFIG} → 同容器上游）')

    process = _spawn(main_command, environment)
    exit_code = 0
    try:
        while True:
            if 'signal' in stopping:
                _stop(process)
                _stop(caddy)
                exit_code = 128 + stopping['signal']
                break

            if process.poll() is not None:
                exit_code = _exit_code(process.returncode)
                _stop(caddy)
                break

            if caddy is not None and caddy.poll() is not None:
                code = caddy.returncode
                restarts += 1
                if restarts > MAX_CADDY_RESTARTS:
                    _warn(
                        f'{service_label}：内置反代已连续退出 {restarts} 次（最后退出码 {code}），'
                        '不再重启；HTTPS 不可用，HTTP 直连端口仍可用'
                    )
                    caddy = None
                else:
                    _warn(
                        f'{service_label}：内置反代退出（退出码 {code}），'
                        f'{RESTART_DELAY_SECONDS:g}s 后重启（第 {restarts} 次）'
                    )
                    time.sleep(RESTART_DELAY_SECONDS)
                    if 'signal' not in stopping:
                        caddy = _spawn(_caddy_command(), caddy_env)

            time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        _stop(process)
        _stop(caddy)
        for number, handler in installed.items():
            signal.signal(number, handler)
    return exit_code
