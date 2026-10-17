#!/usr/bin/env python3
"""商店容器启动器：准备授权密钥，再启动 store。

商店**没有** HTTPS 入口（内网 http://<局域网IP>:8802，公网靠隧道 / 跳板机在 80·443 上终止
TLS），因此这里不像主应用那样再守一个内置 Caddy：少一个进程、少一个自签端口，也少一类
「自签证书被客户机 / 支付平台拒绝」的故障。历史上容器内有过 8804 自签反代，已移除。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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

    # 内网直连走 http://<局域网IP>:8802，公网走 80/443 上的真实证书域名；商店本身不提供
    # HTTPS（也没有 8804 这类自签端口），这里如实说明，免得有人去找一个并不存在的 https 入口。
    print(
        "内网访问：http://<本机局域网IP>:8802（商店不提供 HTTPS；公网由隧道 / 反代在 80·443 终止 TLS）。",
        flush=True,
    )

    os.environ.clear()
    os.environ.update(environment)
    # 直接用 exec 顶替当前进程，不再拉守护子进程：没有 Caddy 要守，信号交给 tini 即可。
    os.execv(
        sys.executable,
        [sys.executable, "-c", "import app.run as m; m.main()"],
    )


if __name__ == "__main__":
    main()
