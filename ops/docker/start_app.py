#!/usr/bin/env python3
"""主应用容器启动器：准备授权公钥后启动 uvicorn。

授权公钥不用人工投放（见 ``ops/docker/bootstrap_keys.py``）：本地没有时向授权服务器
``GET /v2/keys`` 取回并落到数据卷，之后离线也能启动；同机部署改挂商店写出的共享卷，
那条路径由 ``wait_for_client_keys`` 等商店写完即可。
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.docker.bootstrap_keys import (
    FIRST_FETCH_WAIT_SECONDS,
    PUBLIC_KEY_MARKER,
    derive_key_id,
    ensure_client_keys,
)
from ops.docker.http_security import forwarded_allow_ips_warning
from ops.docker.proxy import resolve_default_sni, run_with_proxy
from ops.license_keys import apply_client_key_env

DEFAULT_FORWARDED_ALLOW_IPS = '127.0.0.1,::1'


def _inspect_client_key(path: Path) -> tuple[bool, str]:
    try:
        content = path.read_bytes()
    except FileNotFoundError:
        return False, '尚未出现'
    except OSError as error:
        raise SystemExit(
            f'授权公钥 {path} 存在但读不了（{error.strerror or error}）。'
            '目录与两个 PEM 的权限须为 644 且运行时用户（uid 1000 homeos）可读；'
            '手工投放请 chmod 644 <两个 pem>。'
        ) from error
    if not content:
        return False, '内容为空（可能正在写入）'
    if PUBLIC_KEY_MARKER not in content:
        return False, '内容不是 PEM 公钥（缺少 -----BEGIN PUBLIC KEY----- 头）'
    return True, ''


def wait_for_client_keys(client_keys_dir: Path, timeout_seconds: float = 120.0) -> None:
    """等待 APP_CLIENT_KEYS_DIR 里出现可读的授权公钥。
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
                '分拆部署请确认主应用能访问 APP_LICENSE_SERVER_URL（启动时会自动取回公钥）；'
                '同机部署请确认商店已启动且 docker-compose.yml 挂载了共享公钥卷；'
                '目录与 PEM 权限须为 644。'
            )
        time.sleep(0.5)


def main() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT)
    environment.setdefault("APP_DATA_DIR", "/data")
    environment.setdefault("HOMEOS_DATA_DIR", environment["APP_DATA_DIR"])
    environment.setdefault("APP_CLIENT_KEYS_DIR", "/data/client-keys")
    environment.setdefault("HOMEOS_IMAGE_DIR", "/app/image")
    environment.setdefault("APP_UPDATE_CHANNEL", "docker")
    # Compose / 文档使用 APP_COOKIE_SECURE；运行时 cookies 读 COOKIE_SECURE。
    if "COOKIE_SECURE" not in environment and "APP_COOKIE_SECURE" in environment:
        environment["COOKIE_SECURE"] = environment["APP_COOKIE_SECURE"]
    if not (environment.get("APP_LICENSE_SERVER_URL") or "").strip():
        raise SystemExit(
            '未设置 APP_LICENSE_SERVER_URL。'
            '客户机请用 docker-compose.app.yml（里面已写好商店地址）；'
            '同机部署用 docker-compose.yml（商店地址走容器内网服务名，已注入）。'
        )

    license_url = environment['APP_LICENSE_SERVER_URL'].strip().rstrip('/')
    # 8804 是镜像内置反代的端口，用的是 Caddy **内部 CA 的自签**证书：跨机（或从容器里）
    # 用 https 连它，httpx 会按系统 CA 校验并直接拒绝。这是文档里反复警告的坑，
    # 所以在启动时就把它说破 —— 否则症状只是「取回授权公钥超时」，很难查到根因。
    if license_url.lower().startswith('https://') and license_url.rsplit(':', 1)[-1] == '8804':
        print(
            f'警告：APP_LICENSE_SERVER_URL={license_url} 用的是商店内置反代的 8804 端口，'
            '它的证书是自签的（本容器会拒绝）。请改成厂商那台机器的 HTTP 地址或公网域名，'
            '例如 http://192.168.1.20:8802 或 https://store.example.com。',
            file=sys.stderr,
            flush=True,
        )

    app_port = environment.get("APP_PORT", "8801").strip() or "8801"
    client_keys_dir = Path(environment["APP_CLIENT_KEYS_DIR"]).expanduser()
    Path(environment["APP_DATA_DIR"]).mkdir(parents=True, exist_ok=True)

    def log(message: str) -> None:
        print(f'授权公钥：{message}', flush=True)

    ensure_client_keys(
        client_keys_dir,
        license_server_url=environment["APP_LICENSE_SERVER_URL"],
        environment=environment,
        retry_seconds=FIRST_FETCH_WAIT_SECONDS,
        log=log,
    )
    wait_for_client_keys(client_keys_dir)
    environment = apply_client_key_env(environment, client_keys_dir)
    log(f'就绪目录 {client_keys_dir}（签名 keyId={derive_key_id(client_keys_dir / "license-public.pem")}）')

    forwarded_allow_ips = (
        environment.get('UVICORN_FORWARDED_ALLOW_IPS', '').strip() or DEFAULT_FORWARDED_ALLOW_IPS
    )
    environment['UVICORN_FORWARDED_ALLOW_IPS'] = forwarded_allow_ips
    forwarded_warning = forwarded_allow_ips_warning(forwarded_allow_ips)
    if forwarded_warning:
        print(f'警告：{forwarded_warning}', file=sys.stderr, flush=True)

    # 内置反代（:8803）证书签给谁：浏览器用 IP 访问时不发 SNI，只能靠 default_sni 兜底。
    # 取值有问题时 resolve_default_sni 会摘掉变量并在 warning 里说明（见 ops/docker/proxy.py）。
    default_sni = resolve_default_sni(
        environment,
        hint='要用 https://<局域网IP>:8803 打开，请把它设成那个 IP（例如 192.168.1.10）。',
    )
    if default_sni.warning:
        print(f'警告：{default_sni.warning}', file=sys.stderr, flush=True)

    print(f"HomeOS 主应用  http://0.0.0.0:{app_port}/register", flush=True)
    if default_sni.configured:
        print(
            f"主应用 HTTPS    https://{default_sni.value}:8803/register"
            "（镜像内置反代，自签证书首次需放行）",
            flush=True,
        )
    else:
        print(
            "主应用 HTTPS    https://<本机局域网IP>:8803/register"
            "（镜像内置反代，自签证书首次需放行）",
            flush=True,
        )
        print(
            f"  提示：证书默认签给 {default_sni.value}，用 https://<局域网IP>:8803 打开会报"
            "「证书与地址不匹配」。要避免就设 APP_HTTPS_DEFAULT_SNI=<你输入的那个IP>。",
            flush=True,
        )
    print("首次部署此处为“注册本机唯一账号”（账号 / 密码 / 邮箱 / 邮箱验证码）", flush=True)
    print(f"授权服务器      {environment['APP_LICENSE_SERVER_URL']}", flush=True)

    os.environ.clear()
    os.environ.update(environment)
    raise SystemExit(
        run_with_proxy(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.app:create_asgi_app",
                "--factory",
                "--host",
                "0.0.0.0",
                "--port",
                app_port,
                "--proxy-headers",
                "--forwarded-allow-ips",
                forwarded_allow_ips,
            ],
            data_dir=Path(environment["APP_DATA_DIR"]),
            service_label="主应用",
        )
    )


if __name__ == "__main__":
    main()
