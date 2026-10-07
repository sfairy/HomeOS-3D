"""把 ``homeos-bundle`` 完整备份包的 ``ui`` / ``appConfig`` 分区导入目标库。

用途
----
``migrate_from_homeos3d_legacy.py`` 只搬数据库里的 3D 业务表与授权状态；而布局
（``project_configs.layout``）与运行参数（``system_configs.data``）是以
**完整备份包** 形式导出的，必须走 homeos 自己的导入服务，才能拿到两条保护：

- ``ui``：``import_all_configs`` 会在保存时合并敏感字段（HA 地址 / token 由
  ``layout_secrets`` 统一处理），直接写库会绕过这层；
- ``appConfig``：``import_config`` 会做 schema 版本校验与字段规范化。

脱敏占位符
----------
手动备份包默认对敏感字段脱敏（``CONFIG_MASK_PLACEHOLDER``）。若把占位符原样导入，
会把目标上**真实的**密钥 / 密钥开关覆盖成 ``••••••••``。本脚本在导入前递归剥离
所有等于占位符的字段（键直接删除），让这些字段保持目标现状（或落回默认值）。

用法
----
::

    python scripts/import_bundle.py --bundle /path/homeos-bundle.json \\
        --data-dir ../data [--sections ui,appConfig] [--app-config-mode merge] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

#: 与 ``services/app_config/constants.py`` 的 CONFIG_MASK_PLACEHOLDER 一致。
MASK_PLACEHOLDER = "••••••••"

#: 备份包分区白名单（与 ``bundle_backup.BUNDLE_IMPORT_SECTION_WHITELIST`` 一致）。
SECTION_WHITELIST: tuple[str, ...] = ("ui", "appConfig")


def strip_masked(value: Any, placeholder: str = MASK_PLACEHOLDER) -> Any:
    """递归剥离等于占位符的字段（保留结构，只删除命中的键 / 元素）。"""
    if isinstance(value, dict):
        return {
            key: strip_masked(item, placeholder)
            for key, item in value.items()
            if not (isinstance(item, str) and item == placeholder)
        }
    if isinstance(value, list):
        return [strip_masked(item, placeholder) for item in value]
    return value


def count_masked(value: Any, placeholder: str = MASK_PLACEHOLDER) -> int:
    """统计占位符出现次数，便于导入前提示。"""
    if isinstance(value, dict):
        return sum(count_masked(item, placeholder) for item in value.values())
    if isinstance(value, list):
        return sum(count_masked(item, placeholder) for item in value)
    return 1 if isinstance(value, str) and value == placeholder else 0


def load_bundle(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"备份包不是 JSON 对象：{path}")
    if payload.get("kind") != "homeos-system-bundle":
        raise SystemExit(f"不是 HomeOS 完整备份包（kind={payload.get('kind')!r}）：{path}")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="导入 homeos-bundle 的 ui / appConfig 分区")
    parser.add_argument("--bundle", required=True, help="完整备份包 JSON 路径")
    parser.add_argument("--data-dir", required=True, help="目标 data 目录（homeos/data 或 backend/data）")
    parser.add_argument("--sections", default="ui,appConfig", help="逗号分隔；白名单 ui,appConfig")
    parser.add_argument("--app-config-mode", default="merge", choices=("merge", "replace"))
    parser.add_argument("--dry-run", action="store_true", help="只校验与统计，不写库")
    args = parser.parse_args(argv)

    sections = [item.strip() for item in args.sections.split(",") if item.strip()]
    unknown = [item for item in sections if item not in SECTION_WHITELIST]
    if unknown:
        raise SystemExit(f"未知分区：{unknown}（仅支持 {list(SECTION_WHITELIST)}）")

    data_dir = Path(args.data_dir).expanduser().resolve()
    bundle = load_bundle(Path(args.bundle).expanduser().resolve())
    ui_rows = bundle.get("ui") or []
    app_config = (bundle.get("appConfig") or {}).get("config") or {}

    print(f"[bundle→homeos] {'（dry-run）' if args.dry_run else ''}data_dir={data_dir}")
    print(f"  分区：{sections}；appConfig 模式：{args.app_config_mode}")
    print(f"  ui 布局 {len(ui_rows)} 份；appConfig {len(app_config)} 个 section")
    print(
        f"  脱敏占位符：ui {count_masked(ui_rows)} 处、appConfig {count_masked(app_config)} 处（将剥离）"
    )
    if args.dry_run:
        return 0

    # 目标库位置由环境变量决定，必须在导入 src.config 之前设置。
    os.environ["HOMEOS_DATA_DIR"] = str(data_dir)

    from src.config import load_settings  # noqa: PLC0415 - 需先设置环境变量
    from src.core.database import Database  # noqa: PLC0415
    from src.services.app_config import AppConfigBackupService, AppConfigService  # noqa: PLC0415
    from src.services.ui_config import UiConfigService  # noqa: PLC0415

    settings = load_settings()
    print(f"  目标库：{settings.database_path}")
    database = Database(settings.database_url)
    try:
        app_config_service = AppConfigService(database.session_factory)
        app_config_service.start()

        if "ui" in sections and ui_rows:
            ui_config = UiConfigService(database.session_factory, app_config_service)
            configs = [
                {"projectId": row["projectId"], "layout": strip_masked(row.get("layout"))}
                for row in ui_rows
                if isinstance(row, dict) and row.get("projectId")
            ]
            result = ui_config.import_all_configs(configs)
            print(f"  ui 已导入：{result}")

        if "appConfig" in sections and app_config:
            backup = AppConfigBackupService(app_config_service)
            payload: dict[str, Any] = {
                "config": strip_masked(app_config),
                "schemaVersion": (bundle.get("appConfig") or {}).get("schemaVersion"),
                "mode": args.app_config_mode,
            }
            if args.app_config_mode == "replace":
                payload["confirm"] = True
            result = backup.import_config(payload)
            print(f"  appConfig 已导入：{result}")
    finally:
        database.dispose()

    print("[bundle→homeos] 完成。请重启后端使内存缓存（运行参数 / 授权 / 账号）生效。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
