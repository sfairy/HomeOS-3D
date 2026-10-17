#!/usr/bin/env python3
"""商店容器启动器：准备授权密钥，再启动 store。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.docker.proxy import (
    STORE_DEFAULT_SNI_FALLBACK,
    STORE_DEFAULT_SNI_VARIABLE,
    resolve_default_sni,
    run_with_proxy,
)
from ops.license_keys import ensure_store_keys, sync_store_keys


def _check_admin_exists(data_dir: Path) -> bool:
    """快速探测数据库里是否已有管理员（只读打开，不跑迁移）。"""
    import sqlite3

    db_path = data_dir / "store.db"
    if not db_path.is_file():
        return False
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.execute("SELECT COUNT(*) FROM accounts WHERE is_admin = 1")
        count = cursor.fetchone()[0]
        conn.close()
        return count > 0
    except sqlite3.Error:
        return False


def main() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT)
    environment.setdefault("STORE_DATA_DIR", "/data")
    environment.setdefault("STORE_LICENSE_KEYS_DIR", "/data/license-keys")
    environment.setdefault("APP_CLIENT_KEYS_DIR", "/data/client-keys")
    environment.setdefault("STORE_HOST", "0.0.0.0")
    environment.setdefault("STORE_PORT", "8802")
    environment.pop("STORE_RELOAD", None)
    # Compose / 文档偶发用 COOKIE_SECURE；商店运行时读 STORE_COOKIE_SECURE。
    if "STORE_COOKIE_SECURE" not in environment and "COOKIE_SECURE" in environment:
        environment["STORE_COOKIE_SECURE"] = environment["COOKIE_SECURE"]
    if "STORE_COOKIE_SECURE" not in environment and "APP_COOKIE_SECURE" in environment:
        environment["STORE_COOKIE_SECURE"] = environment["APP_COOKIE_SECURE"]

    keys_dir = Path(environment["STORE_LICENSE_KEYS_DIR"]).expanduser()
    client_keys_dir = Path(environment["APP_CLIENT_KEYS_DIR"]).expanduser()
    ensure_store_keys(keys_dir)
    sync_store_keys(
        store_dir=keys_dir,
        target_dir=client_keys_dir,
        log=lambda message: print(f"授权公钥：{message}", flush=True),
    )

    data_dir = Path(environment["STORE_DATA_DIR"]).expanduser()
    data_dir.mkdir(parents=True, exist_ok=True)

    # 内置反代（:8804）证书签给谁：浏览器用 IP 访问时不发 SNI，只能靠 default_sni 兜底。
    # 取值有问题时 resolve_default_sni 会摘掉变量并在 warning 里说明（见 ops/docker/proxy.py）。
    default_sni = resolve_default_sni(
        environment,
        variable=STORE_DEFAULT_SNI_VARIABLE,
        fallback=STORE_DEFAULT_SNI_FALLBACK,
        hint='要用 https://<局域网IP>:8804 打开，请把它设成那个 IP（例如 192.168.1.20）。',
    )
    if default_sni.warning:
        print(f"警告：{default_sni.warning}", file=sys.stderr, flush=True)

    store_port = environment.get("STORE_PORT", "8802")
    # 首装引导地址：配了 STORE_BASE_URL 就用它（公网部署时那才是用户真正能打开的地址），
    # 否则退回「容器自己看到的 host:port」。同机部署里后者是服务名 / 0.0.0.0，
    # 所以只当兜底，并且额外提示本机回环地址。
    declared = (environment.get("STORE_BASE_URL") or "").strip().rstrip("/")
    if declared:
        setup_url = f"{declared}/setup"
        local_hint = f"（本机调试：http://127.0.0.1:{store_port}/setup）"
    else:
        host = environment.get("STORE_HOST", "0.0.0.0")
        display_host = "127.0.0.1" if host in ("0.0.0.0", "::") else host
        setup_url = f"http://{display_host}:{store_port}/setup"
        local_hint = ""
    if not _check_admin_exists(data_dir):
        print(
            "═══════════════════════════════════════════════════════════",
            flush=True,
        )
        print(
            f"  首次部署：请在浏览器打开 {setup_url}",
            flush=True,
        )
        print(
            "  通过页面设置管理员账号",
            flush=True,
        )
        if local_hint:
            print(f"  {local_hint}", flush=True)
        print(
            "═══════════════════════════════════════════════════════════",
            flush=True,
        )
    else:
        print(f"商店已有管理员，跳过初始化。服务端口 {store_port}。", flush=True)

    # 内置 HTTPS 入口在不在、证书签给谁 —— 用 IP 打开却报「证书与地址不匹配」时看这一行。
    if default_sni.configured:
        print(f"内置 HTTPS：https://{default_sni.value}:8804（自签证书首次需放行）", flush=True)
    else:
        print(
            f"内置 HTTPS：https://<本机局域网IP>:8804（自签证书首次需放行）；证书默认签给 "
            f"{default_sni.value}，用 IP 打开会报「证书与地址不匹配」——"
            "设 STORE_HTTPS_DEFAULT_SNI=<你输入的那个IP> 即可修。",
            flush=True,
        )

    os.environ.clear()
    os.environ.update(environment)
    raise SystemExit(
        run_with_proxy(
            [sys.executable, "-c", "import app.run as m; m.main()"],
            data_dir=Path(environment["STORE_DATA_DIR"]),
            service_label="授权商店",
        )
    )


if __name__ == "__main__":
    main()
