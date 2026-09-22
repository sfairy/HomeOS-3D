#!/usr/bin/env python3
"""主应用容器启动器：等待商店同步的公钥后启动 uvicorn。"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from docker.license_keys import apply_client_key_env  # noqa: E402
from backend.security.http_security import (  # noqa: E402  (必须晚于 sys.path 注入)
    forwarded_allow_ips_warning,
)

#: 默认只信任回环：容器里没有反向代理时，TCP 对端就是客户端本人，任何人都伪造不了
#: ``X-Forwarded-For``。前面真有反代（宿主机 nginx / 另一个容器）时，必须由运维显式
#: 写成那个代理的地址或网段 —— 不能用 ``*`` 图省事，那等于把「来源地址」交给客户端自己填
#: （见 ``unsafe_forwarded_allow_ips``）。
DEFAULT_FORWARDED_ALLOW_IPS = '127.0.0.1,::1'

#: 授权公钥（Ed25519 与 X25519）都是 SubjectPublicKeyInfo，PEM 头一致。
PUBLIC_KEY_MARKER = b'-----BEGIN PUBLIC KEY-----'


def _inspect_client_key(path: Path) -> tuple[bool, str]:
    """检查一个公钥文件是否可用，返回 (就绪, 未就绪原因)。

    只有「读不了」是立刻终止的硬错误 —— 权限不会自愈，而且这是跨机器拷贝最常见的
    坑（scp / docker cp 留下的 root:600）。空文件与坏内容按「还在写」处理：商店写入
    不是原子的，瞬时读到半截不应该让主应用退出。
    """
    try:
        content = path.read_bytes()
    except FileNotFoundError:
        return False, '尚未出现'
    except OSError as error:
        raise SystemExit(
            f'授权公钥 {path} 存在但读不了（{error.strerror or error}）。'
            '跨服务器拷贝请确认权限为 644（chmod 644 <两个 pem>），'
            '且运行时用户（uid 1000 homeos）可读。'
        ) from error
    if not content:
        return False, '内容为空（可能正在写入）'
    if PUBLIC_KEY_MARKER not in content:
        return False, '内容不是 PEM 公钥（缺少 -----BEGIN PUBLIC KEY----- 头）'
    return True, ''


def wait_for_client_keys(client_keys_dir: Path, timeout_seconds: float = 120.0) -> None:
    """等待商店把公钥写到共享目录。

    文件还没出现、或正处于写入中途（空文件）时继续等；**存在但读不了**时立刻退出：
    那是权限问题，不会自己好。旧实现只检查「存在且非空」，遇到跨机器拷贝留下的
    ``root:600`` 会一路等到 120 秒超时，报出来的还是「请确认商店已启动」，指错方向。
    """
    paths = (
        client_keys_dir / 'license-public.pem',
        client_keys_dir / 'license-transport-public.pem',
    )
    deadline = time.monotonic() + timeout_seconds
    reasons = {path.name: '尚未出现' for path in paths}
    while True:
        pending = False
        for path in paths:
            ready, reason = _inspect_client_key(path)
            if ready:
                reasons.pop(path.name, None)
                continue
            reasons[path.name] = reason
            pending = True
        if not pending:
            return
        if time.monotonic() >= deadline:
            detail = '；'.join(f'{name}：{reason}' for name, reason in reasons.items())
            raise SystemExit(
                f'等待授权公钥超时（{timeout_seconds:.0f}s）：{client_keys_dir}（{detail}）。'
                '请确认 homeos-3d-store 已启动；跨服务器部署需要手工把两个 PEM 放进'
                'APP_CLIENT_KEYS_DIR 对应的卷，并 chmod 644。'
            )
        time.sleep(0.5)


def main() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT)
    environment.setdefault("APP_DATA_DIR", "/data")
    environment.setdefault("APP_CLIENT_KEYS_DIR", "/data/keys")
    environment.setdefault("APP_UPDATE_CHANNEL", "docker")
    environment.setdefault("APP_LICENSE_SERVER_URL", "http://homeos-3d-store:18082")

    app_port = environment.get("APP_PORT", "18081").strip() or "18081"
    client_keys_dir = Path(environment["APP_CLIENT_KEYS_DIR"]).expanduser()
    Path(environment["APP_DATA_DIR"]).mkdir(parents=True, exist_ok=True)

    wait_for_client_keys(client_keys_dir)
    environment = apply_client_key_env(environment, client_keys_dir)

    # 转发头信任范围：默认回环，只有显式配置才放宽。取成通配时在 uvicorn 起来之前
    # 就喊出来 —— 那一刻还没有全局日志，只能用 stderr（docker logs 里看得到）。
    forwarded_allow_ips = (
        environment.get('UVICORN_FORWARDED_ALLOW_IPS', '').strip() or DEFAULT_FORWARDED_ALLOW_IPS
    )
    environment['UVICORN_FORWARDED_ALLOW_IPS'] = forwarded_allow_ips
    forwarded_warning = forwarded_allow_ips_warning(forwarded_allow_ips)
    if forwarded_warning:
        print(f'警告：{forwarded_warning}', file=sys.stderr, flush=True)

    print(f"HomeOS 主应用  http://0.0.0.0:{app_port}/setup", flush=True)
    print(f"授权服务器      {environment['APP_LICENSE_SERVER_URL']}", flush=True)

    os.environ.clear()
    os.environ.update(environment)
    os.execvp(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            app_port,
            "--proxy-headers",
            "--forwarded-allow-ips",
            forwarded_allow_ips,
        ],
    )


if __name__ == "__main__":
    main()
