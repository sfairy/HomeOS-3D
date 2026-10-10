#!/usr/bin/env python3
"""统一全量备份（含数据库）端到端冒烟：创建 → 检查 → 还原 → 校验。

守护的核心：
* 备份包含整库快照与数据目录文件（含 ``secrets/`` 密钥）；
* 还原后数据库记录、密钥文件、业务素材与还原前一致；
* 还原把库迁移到当前程序 head（``alembic_version == 0001``）。

用法：``python scripts/full_backup_smoke.py``（在 homeos/backend 下执行，纯离线）。
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

failures: list[str] = []
checked = 0


def check(label: str, condition: bool, detail: object = "") -> None:
    global checked
    checked += 1
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {'' if condition else detail}")
    if not condition:
        failures.append(label)


def table_row_counts(db_path: Path, tables: tuple[str, ...]) -> dict[str, int]:
    """统计各表行数；表不存在记 ``-1``（便于断言 schema 是否保留）。"""
    counts: dict[str, int] = {}
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
        existing = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        for table in tables:
            if table not in existing:
                counts[table] = -1
                continue
            row = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()  # noqa: S608
            counts[table] = int(row[0]) if row else 0
    return counts


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="full-backup-") as raw:
        tmp = Path(raw)
        os.environ["HOMEOS_DATA_DIR"] = str(tmp / "data")
        os.environ.pop("HOMEOS_DATABASE_URL", None)

        from src.config import load_settings
        from src.core import models  # noqa: F401  注册到 Base.metadata
        from src.core.database import Base, Database
        from src.core.migrations import SCHEMA_REVISION
        from src.services.backup.business_backup import (
            EXCLUDED_DB_TABLES,
            RECOVERY_DIR,
            RECOVERY_JOURNAL,
            create_archive,
            inspect_archive,
            read_manifest,
            recover_interrupted_restore,
            restore_business,
        )

        settings = load_settings()
        settings.data_dir.mkdir(parents=True, exist_ok=True)

        database = Database(settings.database_url)
        Base.metadata.create_all(database.engine)
        with database.engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS alembic_version ("
                "version_num VARCHAR(32) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
            connection.exec_driver_sql("DELETE FROM alembic_version")
            connection.exec_driver_sql(
                "INSERT INTO alembic_version (version_num) VALUES (?)", (SCHEMA_REVISION,)
            )

        from datetime import UTC, datetime

        from sqlalchemy import select
        from src.core.models import (
            DeviceUsageStat,
            EarthquakeAlertHistory,
            EnergyUsageDaily,
            EnergyUsageMonthly,
            EnvironmentRecord,
            EventLog,
            HAArea,
            HAConnection,
            HADevice,
            HAEntity,
            HASyncState,
            LoginSession,
            Notification,
            Project,
            SecurityEvent,
            User,
        )

        with database.session_factory() as session:
            user = User(username="owner", password="argon2$dummy")  # noqa: S106
            session.add(user)
            session.flush()
            project = Project(name="客厅", slug="living", description="d", created_by=user.id)
            connection = HAConnection(
                base_url="http://ha.local:8123",
                encrypted_access_token="fernet$token",  # noqa: S106
            )
            session.add_all([project, connection])
            session.flush()
            # 历史事件 / 日志 / 时序 + 运行时缓存：这些数据都不应进入全量备份
            session.add_all(
                [
                    EventLog(entity_id="sensor.temp", domain="sensor"),
                    SecurityEvent(type="door", detail="opened"),
                    Notification(message="测试通知"),
                    LoginSession(
                        id_hash="a" * 64,
                        user_id=user.id,
                        expires_at=datetime.now(UTC),
                    ),
                    HAEntity(connection_id=connection.id, entity_id="light.a", domain="light"),
                    HADevice(connection_id=connection.id, device_id="dev-1"),
                    HAArea(connection_id=connection.id, area_id="area-1", name="客厅"),
                    HASyncState(connection_id=connection.id),
                    EnvironmentRecord(room="客厅", temperature=22.0),
                    EnergyUsageDaily(entity_id="sensor.e", day="2026-10-10"),
                    EnergyUsageMonthly(entity_id="sensor.e", month="2026-10"),
                    DeviceUsageStat(entity_id="light.a", day="2026-10-10"),
                    EarthquakeAlertHistory(
                        event_id="evt-1",
                        epicenter="某地",
                        magnitude=4.0,
                        depth=10.0,
                        latitude=1.0,
                        longitude=2.0,
                        origin_time=0,
                        distance=10.0,
                        countdown=0,
                        local_intensity=1.0,
                    ),
                ]
            )
            session.commit()

        (settings.data_dir / "secrets").mkdir(parents=True, exist_ok=True)
        (settings.data_dir / "secrets" / "ha_credentials.key").write_bytes(b"KEY-MATERIAL")
        (settings.data_dir / "assets").mkdir(parents=True, exist_ok=True)
        (settings.data_dir / "assets" / "logo.png").write_bytes(b"\x89PNG-logo")
        (settings.data_dir / "studio3d").mkdir(parents=True, exist_ok=True)
        (settings.data_dir / "studio3d" / "scene.json").write_text('{"a":1}', encoding="utf-8")
        # 排除项不应进入备份
        (settings.data_dir / "cache").mkdir(parents=True, exist_ok=True)
        (settings.data_dir / "cache" / "junk.json").write_text("x", encoding="utf-8")

        work = tmp / "work"
        archive = create_archive(settings, work, "password123")
        check("生成加密备份文件", archive.is_file() and archive.stat().st_size > 0)

        inspect_dir = tmp / "inspect"
        inspect_dir.mkdir(parents=True, exist_ok=True)
        (inspect_dir / "upload.habackup").write_bytes(archive.read_bytes())
        preview = inspect_archive(settings, inspect_dir, "password123")
        check("检查：projects 计数", preview["projects"] == 1, preview)
        check("检查：connections 计数", preview["connections"] == 1, preview)
        check("检查：users 计数", preview["users"] == 1, preview)
        check("检查：包含密钥", preview["hasSecrets"] is True, preview)
        check("检查：文件计数 >= 3", preview["files"] >= 3, preview)

        manifest = read_manifest(inspect_dir / "payload.zip")
        check("清单排除 cache/", not any("cache/" in name for name in manifest["files"]), manifest["files"])
        check("清单含 secrets 密钥", "secrets/ha_credentials.key" in manifest["files"])
        check("清单标记不含历史", manifest.get("includesHistory") is False, manifest.get("includesHistory"))

        # 归档内的数据库快照：历史/日志/缓存表应已清空（表结构保留）
        snapshot_db = tmp / "snapshot.db"
        with zipfile.ZipFile(inspect_dir / "payload.zip") as archive:
            snapshot_db.write_bytes(archive.read("homeos.db"))
        snapshot_counts = table_row_counts(snapshot_db, EXCLUDED_DB_TABLES)
        check(
            "归档：历史/日志/时序/缓存表均已清空",
            all(count == 0 for count in snapshot_counts.values()),
            snapshot_counts,
        )

        # 破坏现场：删库记录 + 删素材 + 改密钥
        with database.session_factory() as session:
            session.query(Project).delete()
            session.commit()
        (settings.data_dir / "assets" / "logo.png").write_bytes(b"OVERWRITTEN")
        (settings.data_dir / "secrets" / "ha_credentials.key").write_bytes(b"CHANGED")

        restore_business(settings, inspect_dir, dispose=database.engine.dispose)

        with database.session_factory() as session:
            projects = session.execute(select(Project)).scalars().all()
            users = session.execute(select(User)).scalars().all()
            conn = session.execute(select(HAConnection)).scalars().all()
        check("还原：projects 恢复", len(projects) == 1 and projects[0].name == "客厅", projects)
        check("还原：users 恢复", len(users) == 1 and users[0].username == "owner", users)
        check("还原：HA 连接（含密文）恢复", len(conn) == 1 and conn[0].encrypted_access_token == "fernet$token", conn)
        check(
            "还原：素材文件恢复",
            (settings.data_dir / "assets" / "logo.png").read_bytes() == b"\x89PNG-logo",
        )
        check(
            "还原：密钥文件恢复",
            (settings.data_dir / "secrets" / "ha_credentials.key").read_bytes() == b"KEY-MATERIAL",
        )
        with sqlite3.connect(settings.database_path) as connection:
            revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
        check("还原：迁移到当前 head", revision is not None and revision[0] == SCHEMA_REVISION, revision)

        restored_counts = table_row_counts(settings.database_path, EXCLUDED_DB_TABLES)
        check(
            "还原：历史/日志/时序/缓存表保持清空",
            all(count == 0 for count in restored_counts.values()),
            restored_counts,
        )
        with sqlite3.connect(settings.database_path) as connection:
            schema_kept = connection.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_logs'"
            ).fetchone()
        check("还原：被排除表结构保留", schema_kept is not None and schema_kept[0] == 1)

        # 回退副本：成功后保留一份可反悔的 pre-restore 快照（journal phase=done）
        recovery = settings.data_dir / RECOVERY_DIR
        rollback_dirs = [p for p in recovery.iterdir() if p.is_dir()] if recovery.is_dir() else []
        check("还原：保留 1 份回退副本", len(rollback_dirs) == 1, rollback_dirs)
        if rollback_dirs:
            journal_path = rollback_dirs[0] / RECOVERY_JOURNAL
            journal = json.loads(journal_path.read_text(encoding="utf-8"))
            check("还原：回退副本已标记完成", journal.get("phase") == "done", journal.get("phase"))
            check(
                "还原：回退副本含还原前数据库快照",
                (rollback_dirs[0] / "homeos.db").is_file(),
            )

        # 启动期恢复：未完成的还原应被自动回滚并清理
        broken = recovery / "interrupted"
        broken.mkdir(parents=True, exist_ok=True)
        (broken / RECOVERY_JOURNAL).write_text(
            json.dumps({"id": "interrupted", "phase": "files", "moved": {}, "created": ["ghost"]}),
            encoding="utf-8",
        )
        ghost = settings.data_dir / "ghost"
        ghost.mkdir(parents=True, exist_ok=True)
        failed = recover_interrupted_restore(settings)
        check("启动恢复：无失败需人工介入", failed is False, failed)
        check("启动恢复：清理未完成还原的残留", not broken.exists() and not ghost.exists())

        # 服务器明文包（定时自动备份 / 服务器还原共用同一载荷）：
        # create_plain_archive → stage_payload(明文分支) → restore_business
        from src.services.backup.business_backup import create_plain_archive, stage_payload

        plain_zip = create_plain_archive(settings, tmp / "plain", "homeos-full-test.zip")
        check("明文包：生成 zip", plain_zip.is_file() and plain_zip.suffix == ".zip", plain_zip)
        plain_stage = tmp / "plain-stage"
        stage_payload(plain_zip, plain_stage, None)
        check("明文包：可解出 payload.zip", (plain_stage / "payload.zip").is_file())

        # 回退副本保留策略：连续还原后只保留最近 1 份
        from types import SimpleNamespace

        from src.services.backup.business_backup import BackupCoordinator

        restore_business(settings, plain_stage, dispose=database.engine.dispose)
        restore_business(settings, plain_stage, dispose=database.engine.dispose)
        before = [p for p in recovery.iterdir() if p.is_dir()]
        BackupCoordinator(SimpleNamespace(state=SimpleNamespace(settings=settings))).prune_rollbacks()
        after = [p for p in recovery.iterdir() if p.is_dir()]
        check("回退副本：超量自动清理为 1 份", len(before) >= 2 and len(after) == 1, (len(before), len(after)))

        database.dispose()

    print()
    if failures:
        print(f"全量备份冒烟失败：{len(failures)}/{checked} 项")
        for entry in failures:
            print(f"  - {entry}")
        return 1
    print(f"全量备份冒烟全部通过（{checked} 项）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
