#!/usr/bin/env python3
"""后端路由清单快照：证明目录迁移没有改变任何 (method, path)。

通过临时符号链接把 ``homeos/backend/src`` 暴露为包 ``probe_src``，
只导入 ``bootstrap.router_registry`` 并注册路由，不启动 lifespan、不连数据库。

用法：
    node ops/lib/py.mjs ops/checks/architecture/route_inventory.py --write
    node ops/lib/py.mjs ops/checks/architecture/route_inventory.py --check
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import tempfile
import warnings
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SRC = REPO_ROOT / "homeos" / "backend" / "src"
DEFAULT_BASELINE = Path(__file__).with_name("routes-baseline.json")
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}


def collect_operations(src: Path = DEFAULT_SRC) -> list[str]:
    """返回排序后的 ``METHOD PATH`` 列表。"""
    src = src.resolve()
    if not src.is_dir():
        raise FileNotFoundError(src)
    with tempfile.TemporaryDirectory(prefix="homeos-route-probe-") as tmp:
        link = Path(tmp) / "probe_src"
        link.symlink_to(src, target_is_directory=True)
        sys.dont_write_bytecode = True
        sys.path.insert(0, tmp)
        try:
            from fastapi import FastAPI

            registry = importlib.import_module("probe_src.bootstrap.router_registry")
            app = FastAPI()
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message=".*[Dd]uplicate.*[Oo]peration.*")
                registry.register_routers(app)
                schema = app.openapi()
        finally:
            try:
                sys.path.remove(tmp)
            except ValueError:
                pass
            sys.dont_write_bytecode = False
            for name in [key for key in sys.modules if key == "probe_src" or key.startswith("probe_src.")]:
                del sys.modules[name]

    operations: list[str] = []
    for path, methods in schema.get("paths", {}).items():
        for method in methods:
            if str(method).lower() in HTTP_METHODS:
                operations.append(f"{str(method).upper()} {path}")
    return sorted(operations)


def _load(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return list(payload["operations"])


def _dump(path: Path, operations: list[str]) -> None:
    payload = {
        "description": "homeos 后端 OpenAPI 实际注册的 (method, path) 快照；目录迁移后必须完全一致",
        "operations": operations,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="写入基线")
    mode.add_argument("--check", action="store_true", help="与基线比对")
    args = parser.parse_args()

    operations = collect_operations(args.src)
    print(f"operations={len(operations)} paths={len({op.split(' ', 1)[1] for op in operations})}")

    if args.write:
        _dump(args.baseline, operations)
        print(f"baseline written: {args.baseline}")
        return 0
    if args.check:
        if not args.baseline.is_file():
            print(f"baseline missing: {args.baseline}", file=sys.stderr)
            return 2
        expected = _load(args.baseline)
        missing = sorted(set(expected) - set(operations))
        added = sorted(set(operations) - set(expected))
        if missing or added:
            for item in missing:
                print(f"MISSING {item}", file=sys.stderr)
            for item in added:
                print(f"ADDED   {item}", file=sys.stderr)
            return 1
        print("route inventory matches baseline")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
