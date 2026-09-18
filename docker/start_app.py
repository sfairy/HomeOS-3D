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
from backend.app.http_security import (  # noqa: E402  (必须晚于 sys.path 注入)
    forwarded_allow_ips_warning,
)

#: 默认只信任回环：容器里没有反向代理时，TCP 对端就是客户端本人，任何人都伪造不了
#: ``X-Forwarded-For``。前面真有反代（宿主机 nginx / 另一个容器）时，必须由运维显式
#: 写成那个代理的地址或网段 —— 不能用 ``*`` 图省事，那等于把「来源地址」交给客户端自己填
#: （见 ``unsafe_forwarded_allow_ips``）。
DEFAULT_FORWARDED_ALLOW_IPS = '127.0.0.1,::1'


def wait_for_client_keys(client_keys_dir: Path, timeout_seconds: float = 120.0) -> None:
    """等待商店把公钥写到共享目录。"""
    public_path = client_keys_dir / "license-public.pem"
    transport_path = client_keys_dir / "license-transport-public.pem"
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if (
            public_path.is_file()
            and public_path.stat().st_size > 0
            and transport_path.is_file()
            and transport_path.stat().st_size > 0
        ):
            return
        time.sleep(0.5)
    raise SystemExit(
        f"等待授权公钥超时（{timeout_seconds:.0f}s）：{client_keys_dir}。"
        "请确认 homeos-3d-store 已启动且共享了 client-keys 卷。"
    )


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
            "backend.app.main:app",
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
