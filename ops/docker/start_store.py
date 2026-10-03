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

from ops.docker.proxy import run_with_proxy
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
    if not _check_admin_exists(data_dir):
        host = environment.get("STORE_HOST", "0.0.0.0")
        display_host = "localhost" if host in ("0.0.0.0", "::") else host
        print(
            "═══════════════════════════════════════════════════════════",
            flush=True,
        )
        print(
            f"  首次部署：请在浏览器打开 http://{display_host}:{store_port}/setup",
            flush=True,
        )
        print(
            "  通过页面设置管理员账号",
            flush=True,
        )
        print(
            "═══════════════════════════════════════════════════════════",
            flush=True,
        )
    else:
        print(f"商店已有管理员，跳过初始化。服务端口 {store_port}。", flush=True)

    os.environ.clear()
    os.environ.update(environment)
    raise SystemExit(
        run_with_proxy(
            [sys.executable, "-c", "import src.run as m; m.main()"],
            data_dir=Path(environment["STORE_DATA_DIR"]),
            service_label="授权商店",
        )
    )


if __name__ == "__main__":
    main()
