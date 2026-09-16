#!/usr/bin/env python3
"""商店容器启动器：准备授权密钥、按需 seed，再启动 store。"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from docker.license_keys import ensure_store_license_keys  # noqa: E402


def maybe_bootstrap_seed(environment: dict[str, str]) -> None:
    """提供了管理员凭据时幂等执行 seed（建管理员 / 补商品 / 版本记录）。"""
    email = environment.get("STORE_ADMIN_EMAIL", "").strip()
    password = environment.get("STORE_ADMIN_PASSWORD", "")
    if not email or not password:
        print(
            "未设置 STORE_ADMIN_EMAIL / STORE_ADMIN_PASSWORD："
            "跳过 seed。若是全新部署，请设置后重启商店容器，或手动执行 "
            "`python -m store.tools.seed`。",
            flush=True,
        )
        return
    print(f"执行商店初始化 seed（管理员 {email}）…", flush=True)
    subprocess.check_call(
        [sys.executable, "-m", "store.tools.seed"],
        cwd=ROOT,
        env=environment,
    )


def main() -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT)
    environment.setdefault("STORE_DATA_DIR", "/data")
    environment.setdefault("STORE_LICENSE_KEYS_DIR", "/data/license-keys")
    environment.setdefault("APP_CLIENT_KEYS_DIR", "/data/keys")
    environment.setdefault("STORE_HOST", "0.0.0.0")
    environment.setdefault("STORE_PORT", "18082")
    environment.pop("STORE_RELOAD", None)

    keys_dir = Path(environment["STORE_LICENSE_KEYS_DIR"]).expanduser()
    client_keys_dir = Path(environment["APP_CLIENT_KEYS_DIR"]).expanduser()
    ensure_store_license_keys(keys_dir, client_keys_dir)

    Path(environment["STORE_DATA_DIR"]).mkdir(parents=True, exist_ok=True)
    maybe_bootstrap_seed(environment)

    os.environ.clear()
    os.environ.update(environment)
    os.execvp(sys.executable, [sys.executable, "-m", "store.run"])


if __name__ == "__main__":
    main()
