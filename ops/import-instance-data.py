#!/usr/bin/env python3
"""把「另一套实例」的 data 目录按列映射搬迁进当前开发树的 data 目录。

背景
----
开发树 ``homeos-3d/`` 与发行实例 ``homeos-3d 0.6.5/`` 是**两条不同的迁移链**：

* 开发树    ``0001_initial_schema``（``homeos-3d/migrations``，head = ``0001``）
* 发行实例  ``0001_initial_schema`` + ``0002_reconcile_legacy_objects``（head = ``0002``）

两边复用同样的 revision 号却指向不同的迁移，且列也不完全一致，所以**不能**把旧
``app.db`` 直接拷进来让 Alembic ``upgrade``（会被当成已应用、或从别的迁移开始
重建已存在的表而失败）。本脚本改为「按列映射」把行数据搬过来，目标库结构保持
开发树的 head 不动。

搬迁的内容
----------
1. 行数据：目标库里存在、源库里也有的列照搬；目标库多出的列交给列默认值，
   源库多出的列（旧版本遗留）丢弃。表和插入顺序按外键依赖排列。
2. 加密密钥 ``secrets/*.key``：HA 访问令牌、配对码、授权凭据都是用它加密的，
   不搬过来旧行就是一堆解不开的密文。
3. ``instance-id``：与 ``license_state.instance_id`` 必须一致，否则授权校验失败。
4. ``admin-account.json``：管理员账号存在业务库之外，不搬会丢登录密码。
5. 项目文件：``studio3d/``、``modules/interaction3d/scenes/``、``assets/``、
   ``exports/``；``render-cache`` 是可再生的渲染缓存，默认跳过。

用法
----
    # 先看一眼会做什么，不写任何东西
    python ops/import-instance-data.py --source "homeos-3d 0.6.5/data" --dry-run

    # 确认后执行（请先停掉 ops/start.py）
    python ops/import-instance-data.py --source "homeos-3d 0.6.5/data"

运行前请先停掉 ``ops/start.py``：脚本会检查 ``app.db`` 是否仍被进程占用，
占用时拒绝执行（要求显式 --force 才能绕过）。
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

#: 本脚本住在 ops/ 下，脚本目录不再是仓库根。
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / 'homeos-3d 0.6.5' / 'data'
DEFAULT_TARGET = ROOT / 'homeos-3d' / 'data'

#: 目标库必须处的 revision：开发树的 head（迁移链已压缩成单一基线 0001）。搬完不动它。
TARGET_REVISION = '0001'
#: 源库记录在案的 revision：发行实例那条 squashed 链的 head。
EXPECTED_SOURCE_REVISION = '0002'

#: 插入顺序（外键父表在前）。
#: users → projects → ha_connections 是三条根；其余都挂在它们下面。
TABLE_ORDER = (
    'users',
    'projects',
    'ha_connections',
    'ha_areas',
    'ha_devices',
    'ha_entities',
    'ha_sync_state',
    'project_drafts',
    'sessions',
    'display_pairing_codes',
    'display_devices',
    'global_custom_popup_state',
    'license_state',
    'studio_interaction_sync',
)

#: 整体搬运的目录（项目数据，不可再生）。
COPY_DIRS = (
    'studio3d',
    'assets',
    'exports',
)
#: 只搬其中一部分的目录：``render-cache`` 是可再生缓存的目录名。
MODULES_DIR = 'modules'
RENDER_CACHE_DIRNAME = 'render-cache'
#: cache 下只搬这几个可再生的元数据文件；``effect-variants`` 同样是缓存。
CACHE_FILES = ('entity-translations.json',)

#: 单文件搬运项：源相对路径 → 目标相对路径。
#: 末位标记「可保留项」：被 --keep-admin / --keep-instance-id 挡住时不覆盖。
COPY_FILES = (
    ('admin-account.json', 'admin-account.json', 'admin'),
    ('appearance.json', 'appearance.json', None),
    ('instance-id', 'instance-id', 'instance-id'),
    ('hardware-fallback-id', 'hardware-fallback-id', 'instance-id'),
)
#: 加密密钥必须整套搬，文件名与开发树 ``config.py`` 里的约定一致。
SECRETS_DIRNAME = 'secrets'


def _log(message: str = '') -> None:
    print(message, flush=True)


class Abort(RuntimeError):
    """不可继续的迁移前置条件不满足。"""


def resolve_data_dir(value: str) -> Path:
    path = Path(value).expanduser().resolve()
    return path.parent if path.name.endswith('.db') else path


def _database_revision(database_path: Path) -> str | None:
    if not database_path.is_file() or database_path.stat().st_size == 0:
        return None
    with sqlite3.connect(f'file:{database_path}?mode=ro', uri=True) as connection:
        table = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'alembic_version'"
        ).fetchone()
        if table is None:
            return None
        row = connection.execute('SELECT version_num FROM alembic_version LIMIT 1').fetchone()
        return str(row[0]) if row else None


def _columns(connection: sqlite3.Connection, table: str) -> dict[str, tuple[str, int, object]]:
    """列名 → (类型, 是否 NOT NULL, 默认值)。"""
    return {
        row[1]: (row[2], int(row[3]), row[4])
        for row in connection.execute(f'PRAGMA table_info("{table}")')
    }


def holders(database_path: Path) -> list[str]:
    """谁正开着这个库文件；拿不到 lsof 时返回空（不阻断迁移）。"""
    try:
        completed = subprocess.run(
            ['lsof', '-n', '--', str(database_path)],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return []
    lines = [line for line in completed.stdout.strip().splitlines()[1:] if line.strip()]
    result = []
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            result.append(f'{parts[0]} (pid {parts[1]})')
    return result


def backup_target(target: Path, dry_run: bool) -> Path:
    """整目录快照。目标目录只有几百 KB，整份留下最省心。"""
    stamp = time.strftime('%Y%m%d-%H%M%S')
    destination = target.with_name(f'{target.name}.pre-import-{stamp}')
    suffix = 1
    while destination.exists():
        destination = target.with_name(f'{target.name}.pre-import-{stamp}-{suffix}')
        suffix += 1
    if dry_run:
        _log(f'  [dry-run] 备份 {target} → {destination}')
        return destination
    shutil.copytree(target, destination, symlinks=True)
    _log(f'  已备份原数据目录 → {destination}')
    return destination


def _copy_file(source: Path, target: Path, dry_run: bool) -> None:
    if not source.is_file():
        return
    _log(f'    {source.name}')
    if dry_run:
        return
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copy2(source, target)
    os.chmod(target, 0o600)


def _copy_tree(source: Path, target: Path, *, skip_dirnames: frozenset[str], dry_run: bool) -> int:
    if not source.is_dir():
        return 0
    count = 0
    for current, directory_names, file_names in os.walk(source):
        directory_names[:] = [name for name in directory_names if name not in skip_dirnames]
        relative = Path(current).relative_to(source)
        for file_name in file_names:
            source_file = Path(current) / file_name
            target_file = target / relative / file_name
            count += 1
            if not dry_run:
                target_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                shutil.copy2(source_file, target_file)
    return count


def copy_payload(
    source: Path,
    target: Path,
    *,
    include_render_cache: bool,
    keep_admin: bool,
    keep_instance_id: bool,
    dry_run: bool,
) -> None:
    _log('文件：')
    secrets_source = source / SECRETS_DIRNAME
    if secrets_source.is_dir():
        _log(f'  加密密钥 {SECRETS_DIRNAME}/')
        for key_file in sorted(secrets_source.glob('*.key')):
            _copy_file(key_file, target / SECRETS_DIRNAME / key_file.name, dry_run)
    kept = {
        'admin': keep_admin,
        'instance-id': keep_instance_id,
    }
    for relative, destination, keep_flag in COPY_FILES:
        if keep_flag is not None and kept.get(keep_flag):
            _log(f'    （保留现有 {destination}）')
            continue
        _copy_file(source / relative, target / destination, dry_run)

    for directory in COPY_DIRS:
        copied = _copy_tree(source / directory, target / directory, skip_dirnames=frozenset(), dry_run=dry_run)
        if copied:
            _log(f'  {directory}/ （{copied} 个文件）')

    skip = frozenset() if include_render_cache else frozenset({RENDER_CACHE_DIRNAME})
    copied = _copy_tree(source / MODULES_DIR, target / MODULES_DIR, skip_dirnames=skip, dry_run=dry_run)
    if copied:
        note = '' if include_render_cache else '，已跳过 render-cache'
        _log(f'  {MODULES_DIR}/ （{copied} 个文件{note}）')

    for file_name in CACHE_FILES:
        _copy_file(source / 'cache' / file_name, target / 'cache' / file_name, dry_run)


def plan_rows(source_db: Path, target_db: Path) -> list[dict]:
    """算出每张表的列映射与行数；目标库已有数据时直接报错。"""
    plans: list[dict] = []
    source = sqlite3.connect(f'file:{source_db}?mode=ro', uri=True)
    target = sqlite3.connect(f'file:{target_db}?mode=ro', uri=True)
    try:
        source_tables = {
            row[0] for row in source.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        target_tables = {
            row[0] for row in target.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        for table in TABLE_ORDER:
            if table not in target_tables:
                raise Abort(f'目标库里没有表 {table}：目标库结构不是预期的 {TARGET_REVISION}。')
            if table not in source_tables:
                raise Abort(f'源库里没有表 {table}：源库不是预期的实例数据。')
            target_columns = _columns(target, table)
            source_columns = _columns(source, table)
            shared = [name for name in target_columns if name in source_columns]
            missing = [name for name in target_columns if name not in source_columns]
            for name in missing:
                _, not_null, default = target_columns[name]
                # NOT NULL 且无默认值的列无法靠数据库补，只能显式给值 —— 这里直接拦住。
                if not_null and default is None:
                    raise Abort(
                        f'{table}.{name} 在目标库里是 NOT NULL 且无默认值，但源库没有该列；'
                        '需要人工决定填什么值。'
                    )
            dropped = [name for name in source_columns if name not in target_columns]
            plans.append({
                'table': table,
                'columns': shared,
                'filled': missing,
                'dropped': dropped,
                'source_rows': source.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0],
                'target_rows': target.execute(f'SELECT count(*) FROM "{table}"').fetchone()[0],
            })
    finally:
        source.close()
        target.close()
    return plans


def print_plan(plans: list[dict]) -> None:
    _log('行数据映射：')
    _log(f'  {"表".ljust(28)}{"源行数":>8}{"目标现有":>10}   说明')
    for plan in plans:
        notes = []
        if plan['filled']:
            notes.append('目标库补默认值: ' + ','.join(plan['filled']))
        if plan['dropped']:
            notes.append('丢弃源库遗留列: ' + ','.join(plan['dropped']))
        _log(
            f'  {plan["table"].ljust(28)}{plan["source_rows"]:>8}{plan["target_rows"]:>10}   '
            + '；'.join(notes)
        )


def copy_rows(source_db: Path, target_db: Path, plans: list[dict], *, force: bool, dry_run: bool) -> None:
    occupied = [plan for plan in plans if plan['target_rows'] and not force]
    if occupied:
        names = '、'.join(f'{plan["table"]}({plan["target_rows"]})' for plan in occupied)
        raise Abort(
            f'目标库里已有数据：{names}。直接写入会撞主键。'
            '确认要覆盖请先自行清空，或加 --force（脚本会先清空这些表）。'
        )
    if dry_run:
        return

    source = sqlite3.connect(f'file:{source_db}?mode=ro', uri=True)
    target = sqlite3.connect(str(target_db), timeout=5)
    try:
        target.execute('PRAGMA foreign_keys=ON')
        target.execute('PRAGMA busy_timeout=5000')
        target.execute('BEGIN IMMEDIATE')
        for plan in plans:
            table = plan['table']
            columns = plan['columns']
            if force and plan['target_rows']:
                target.execute(f'DELETE FROM "{table}"')
            quoted = ', '.join(f'"{name}"' for name in columns)
            placeholders = ', '.join('?' for _ in columns)
            rows = source.execute(
                f'SELECT {quoted} FROM "{table}"'
            ).fetchall()
            target.executemany(
                f'INSERT INTO "{table}" ({quoted}) VALUES ({placeholders})',
                rows,
            )
            plan['copied'] = len(rows)
        violations = target.execute('PRAGMA foreign_key_check').fetchall()
        if violations:
            raise Abort(f'外键校验失败（已回滚）：{violations[:10]}')
        target.execute('COMMIT')
        target.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    except Exception:
        target.execute('ROLLBACK')
        raise
    finally:
        source.close()
        target.close()


def main() -> int:
    parser = argparse.ArgumentParser(description='把另一套实例的 data 目录搬迁进开发树。')
    parser.add_argument('--source', default=str(DEFAULT_SOURCE), help='源 data 目录（或其中的 app.db）')
    parser.add_argument('--target', default=str(DEFAULT_TARGET), help='目标 data 目录（或其中的 app.db）')
    parser.add_argument('--dry-run', action='store_true', help='只打印计划，不写任何文件')
    parser.add_argument('--force', action='store_true', help='目标库被占用 / 已有数据时仍继续（会先清空这些表）')
    parser.add_argument('--include-render-cache', action='store_true', help='连 257MB 的渲染缓存一起搬')
    parser.add_argument('--keep-admin', action='store_true', help='保留目标库现有的管理员凭据，不用源库覆盖')
    parser.add_argument('--keep-instance-id', action='store_true', help='保留目标库现有 instance-id（授权需重新激活）')
    arguments = parser.parse_args()

    source = resolve_data_dir(arguments.source)
    target = resolve_data_dir(arguments.target)
    source_db = source / 'app.db'
    target_db = target / 'app.db'

    _log(f'源   {source}')
    _log(f'目标 {target}')
    _log(f'模式 {"dry-run（不写盘）" if arguments.dry_run else "实际写入"}')
    _log()

    if not source_db.is_file():
        raise Abort(f'源库不存在：{source_db}')
    if not target_db.is_file():
        raise Abort(f'目标库不存在：{target_db}')

    source_revision = _database_revision(source_db)
    target_revision = _database_revision(target_db)
    _log(f'源库 revision   {source_revision}（预期 {EXPECTED_SOURCE_REVISION}）')
    _log(f'目标库 revision {target_revision}（预期 {TARGET_REVISION}，保持不动）')
    if target_revision != TARGET_REVISION:
        raise Abort(
            f'目标库 revision 是 {target_revision}，不是 {TARGET_REVISION}；'
            '先把目标库升到 head 再搬迁。'
        )
    if source_revision != EXPECTED_SOURCE_REVISION:
        _log(f'⚠ 源库 revision 不是 {EXPECTED_SOURCE_REVISION}，列映射会按实际结构自动适配。')
    _log()

    plans = plan_rows(source_db, target_db)
    print_plan(plans)
    _log()

    if not arguments.dry_run:
        busy = holders(target_db)
        if busy and not arguments.force:
            raise Abort(
                f'目标库仍被进程占用：{"、".join(busy)}。\n'
                '  请先停掉 ops/start.py（Ctrl+C 或 pkill -f ops/start.py）再重试。'
            )
    _log('原数据目录备份：')
    backup_target(target, arguments.dry_run)

    if not arguments.dry_run:
        _log('文件搬运：')
    copy_payload(
        source,
        target,
        include_render_cache=arguments.include_render_cache,
        keep_admin=arguments.keep_admin,
        keep_instance_id=arguments.keep_instance_id,
        dry_run=arguments.dry_run,
    )
    if arguments.dry_run:
        _log('行数据：')
        _log(f'  [dry-run] 清空并按列映射写入 {len(plans)} 张表')
    else:
        copy_rows(source_db, target_db, plans, force=arguments.force, dry_run=False)
        _log('行数据：')
        for plan in plans:
            _log(f'  {plan["table"].ljust(28)}{plan.get("copied", 0):>6} 行')
        _log()
        _log('✅ 搬迁完成。重启 ops/start.py 后即可用旧实例的账号登录。')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Abort as error:
        _log(f'✗ 已中止：{error}')
        sys.exit(1)
