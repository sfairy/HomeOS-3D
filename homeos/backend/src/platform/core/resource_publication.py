"""资源目录的「两段式改名」发布与崩溃恢复。

导图导出（``studio3d_exports_dir``）与用户素材（``user_assets_dir``）都是「一整个目录
同时对外可见」的资源：读者（素材目录、前端）只会看到改名前后两个状态，不会看到中间态。

难点不在改名，而在**改名到一半进程没了**。旧实现是「先 ``os.replace(target, backup)``，
再 ``os.replace(staging, target)``，最后删 backup」—— 如果进程恰好死在两次改名之间，
磁盘上就只剩 ``.previous-<随机>`` 而没有 target，重启后这个导出包就凭空消失了，而且
没有任何线索能说明它原本叫什么。

这里补上**日志（journal）**：改名之前先把「目标名 / 暂存目录名」写进
``.replace-<token>.json`` 并 fsync，改名完成后再删掉它。启动时 ``recover_resource_publications``
扫一遍残留日志，按日志把上一代目录换回原位。语义只有两条：

- target 存在 → 说明新一代或旧一代已经完整可见，清掉 backup/staging 即可；
- target 缺失 → 必须能从 ``.previous-<token>`` 换回来，换不回来就**报错保留现场**，
  绝不猜、绝不静默删。

调用方继续持有各自的 catalog/storage 锁；本模块只管文件系统交接，不碰项目版本、
绑定关系与编辑器历史。
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
from pathlib import Path
from uuid import uuid4

from .atomic_write import PRIVATE_FILE_MODE

LOGGER = logging.getLogger(__name__)

#: 日志文件与暂存目录共用的随机串格式（32 位小写十六进制）。
_TOKEN = r"[0-9a-f]{32}"

#: 目录名里不允许出现的字符：路径分隔符与 NUL。
_FORBIDDEN_NAME_CHARS = ("/", "\\", "\x00")


def _sync_directory(directory: Path) -> None:
    """把「改名」这件事刷到磁盘上。

    ``os.replace`` 只保证原子性，不保证持久性：掉电后目录项可能还停在改名前的状态。
    对目录 ``fsync`` 才能让改名落地。非 POSIX 平台（Windows）不支持对目录 open，跳过。
    """
    try:
        descriptor = os.open(directory, os.O_RDONLY)
    except OSError:
        # Windows 不支持对目录 open；这里只是「尽力刷盘」，不是失败路径。
        LOGGER.debug('目录不支持 fsync，跳过：%s', directory)
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _remove_owned_directory(path: Path) -> None:
    """删掉本模块自己创建的目录；符号链接一律拒绝，避免被指到别处删数据。"""
    if path.is_symlink():
        raise RuntimeError("资源恢复目录不能是符号链接。")
    if path.exists():
        shutil.rmtree(path)


def recover_export_replacements(root: Path) -> None:
    """按残留日志把未完成的改名收尾（启动时，或持有 catalog/storage 锁时调用）。"""
    for journal in sorted(root.glob(".replace-*.json")):
        if journal.is_symlink() or not re.fullmatch(rf"\.replace-({_TOKEN})\.json", journal.name):
            raise RuntimeError("导图恢复记录路径无效，已保留文件。")
        token = journal.name[len(".replace-") : -len(".json")]
        value = json.loads(journal.read_text(encoding="utf-8"))
        target_name = value.get("target")
        stage_name = value.get("staging")
        if (
            value.get("version") != 1
            or not isinstance(target_name, str)
            or not target_name
            or target_name.startswith(".")
            or Path(target_name).name != target_name
            or any(character in target_name for character in _FORBIDDEN_NAME_CHARS)
            or not isinstance(stage_name, str)
            or not re.fullmatch(rf"\.export-{_TOKEN}", stage_name)
        ):
            raise RuntimeError("导图恢复记录内容无效，已保留文件。")
        target = root / target_name
        backup = root / f".previous-{token}"
        staging = root / stage_name
        if any(path.is_symlink() for path in (target, backup, staging)):
            raise RuntimeError("导图恢复路径不能是符号链接。")
        if not target.exists():
            if not backup.is_dir():
                raise RuntimeError("导图恢复缺少完整版本，已保留恢复记录。")
            os.replace(backup, target)
            _sync_directory(root)
        if not target.is_dir():
            raise RuntimeError("导图恢复目标不是目录，已保留恢复记录。")
        _remove_owned_directory(backup)
        _remove_owned_directory(staging)
        _sync_directory(root)
        journal.unlink()
        _sync_directory(root)


def replace_export_directory(staging: Path, target: Path) -> None:
    """把已写完的 ``staging`` 发布成 ``target``；覆盖时用日志保证可恢复。"""
    root = target.parent
    if staging.parent != root or not re.fullmatch(rf"\.export-{_TOKEN}", staging.name):
        raise ValueError("导图临时目录无效。")
    if staging.is_symlink() or target.is_symlink():
        raise RuntimeError("导图发布路径不能是符号链接。")
    # 先把 staging 里每个文件刷盘：只 fsync 目录不保证文件内容已经落盘，
    # 那样「改名成功 + 掉电」会得到一个空壳目录，比不做还糟。
    for file in staging.iterdir():
        with file.open("rb") as source:
            os.fsync(source.fileno())
    _sync_directory(staging)

    if not target.exists():
        os.replace(staging, target)
        _sync_directory(root)
        return

    token = uuid4().hex
    journal = root / f".replace-{token}.json"
    temporary = root / f".replace-{token}.tmp"
    backup = root / f".previous-{token}"
    try:
        # 日志本身也要「先写临时文件、再改名」，否则会留下写了一半的 JSON。
        with temporary.open("x", encoding="utf-8") as output:
            os.chmod(temporary, PRIVATE_FILE_MODE)
            json.dump(
                {"version": 1, "target": target.name, "staging": staging.name},
                output,
            )
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, journal)
        _sync_directory(root)
        try:
            os.replace(target, backup)
            _sync_directory(root)
            os.replace(staging, target)
            _sync_directory(root)
        except BaseException:
            # 两次改名之间出事：立刻按日志回滚，别把「没有 target」的状态留给下次启动。
            recover_export_replacements(root)
            raise
        _remove_owned_directory(backup)
        _sync_directory(root)
        journal.unlink()
        _sync_directory(root)
    finally:
        temporary.unlink(missing_ok=True)


def recover_resource_publications(settings) -> None:
    """启动期收尾：必须在处理请求、素材目录扫描之前调用。"""
    root = settings.studio3d_exports_dir
    recover_export_replacements(root)
    if root.is_dir():
        for path in root.iterdir():
            if re.fullmatch(rf"\.export-{_TOKEN}", path.name):
                _remove_owned_directory(path)
                continue
            if not re.fullmatch(rf"\.(?:upload-{_TOKEN}\.zip|replace-{_TOKEN}\.tmp)", path.name):
                continue
            if path.is_symlink() or not path.is_file():
                raise RuntimeError("资源临时文件类型无效，已保留文件。")
            path.unlink()
    user_assets = settings.user_assets_dir
    if user_assets.is_dir():
        for path in user_assets.iterdir():
            if not re.fullmatch(rf"\.upload-{_TOKEN}", path.name):
                continue
            _remove_owned_directory(path)
