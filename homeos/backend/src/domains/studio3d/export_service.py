"""Studio 3D 导出包：校验、落盘、引用扫描与删除。

从 api.studio3d 迁出的重 I/O 部分（C1）。三条约束值得单独写下来：

1. 锁内只做目录元数据操作。旧实现把「解压 + 逐条拷贝」整段放在 _storage_lock 里，
   512MB 包的复制会让同一时刻的草稿 GET/PUT、导出、删除全部排队 —— 一个进程内
   RLock 被磁盘 I/O 占住，是「导出时保存转圈」的直接原因。现在锁内只判冲突、建
   staging，拷贝在锁外做，最后再进锁做一次原子交换；
2. 交换是原子的。覆盖导出时先把旧目录 os.replace 到 .previous-*，替换失败再换回来，
   用户不会看到「半个新目录」；
3. 删除前要扫全部引用面。导出图片被数据库里的项目草稿、全局弹窗、草稿场景和级联
   归档同时引用；只扫其中一处就会出现「删掉图片后项目里全是破图」。
"""

from __future__ import annotations

import json
import os
import shutil
import zipfile
from pathlib import Path
from threading import RLock
from urllib.parse import unquote
from uuid import uuid4

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import draft_repository
from ..ui_config.global_popups import global_popups
from ...platform.core.models import Project, ProjectDraft
from ...platform.core.upload_limits import MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES

MAX_EXPORT_ARCHIVE_BYTES = MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES
MAX_EXPORT_EXPANDED_BYTES = 1073741824
#: 单个成员解压后上限：累计上限挡不住「一个条目吃掉整个预算」的高压缩率 zip。
MAX_EXPORT_ENTRY_BYTES = 67108864
MAX_EXPORT_FILES = 512
_storage_lock = RLock()
#: 目录名校验的非法字符；反斜杠本身在字符串里需要转义。
INVALID_NAME_CHARACTERS = '<>:"/\\|?*'


def folder_name(request: Request) -> str:
    encoded = request.headers.get("x-export-folder", "")
    try:
        name = unquote(encoded).strip()
    except (UnicodeError, ValueError) as error:
        raise HTTPException(422, "导出文件夹名称无效。") from error
    if (
        not name
        or name in {".", ".."}
        or name.startswith(".")
        or name.endswith((".", " "))
        or any(character in INVALID_NAME_CHARACTERS for character in name)
        or any(ord(character) < 32 or ord(character) == 127 for character in name)
        or len(name.encode("utf-8")) > 180
        or Path(name).name != name
    ):
        raise HTTPException(422, "文件夹名不能包含路径符号、控制字符或系统保留符号。")
    return name


def export_folder_exists(request: Request, name: str) -> bool:
    target = request.app.state.settings.studio3d_exports_dir / name
    with _storage_lock:
        return target.exists()


def _document_uses_asset_prefix(value, prefix: str) -> bool:
    if isinstance(value, dict):
        return any(_document_uses_asset_prefix(item, prefix) for item in value.values())
    if isinstance(value, list):
        return any(_document_uses_asset_prefix(item, prefix) for item in value)
    return isinstance(value, str) and value.startswith(prefix)


def validate_archive(archive_path: Path) -> list[zipfile.ZipInfo]:
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as error:
        raise HTTPException(422, "导出数据不是有效的 ZIP 文件。") from error
    with archive:
        entries = archive.infolist()
        if not entries or len(entries) > MAX_EXPORT_FILES:
            raise HTTPException(422, "导出文件数量无效。")
        names = {entry.filename for entry in entries}
        if len(names) != len(entries):
            raise HTTPException(422, "导出包包含重名文件。")
        expanded_size = 0
        for entry in entries:
            _validate_entry(entry, expanded_size)
            expanded_size += entry.file_size
            if expanded_size > MAX_EXPORT_EXPANDED_BYTES:
                raise HTTPException(413, "导出内容超过 NAS 保存上限。")
        _validate_json_entries(archive, names)
        _validate_image_entries(archive, names)
        return entries


def _validate_entry(entry: zipfile.ZipInfo, expanded_size: int) -> None:
    name = entry.filename
    if (
        entry.is_dir()
        or not name
        or name.startswith(".")
        or Path(name).name != name
        or "/" in name
        or "\\" in name
        or Path(name).suffix.lower() not in {".png", ".json", ".webp"}
    ):
        raise HTTPException(422, "导出包包含无效文件路径或文件类型。")
    # 单条目上限：累计上限管不住「一个成员吃掉整个预算」—— zip 声明 file_size 时
    # 可以只写一个 900MB 的高压缩率条目，归档本身仍远小于 ZIP 上限。下面读取时
    # 还会再按 MAX_EXPORT_ENTRY_BYTES 兜一次，防声明值撒谎。
    if entry.file_size > MAX_EXPORT_ENTRY_BYTES:
        raise HTTPException(413, "导出包单个文件超过 NAS 保存上限。")


def _validate_json_entries(archive: zipfile.ZipFile, names: set[str]) -> None:
    for json_name in (name for name in names if name.lower().endswith(".json")):
        try:
            with archive.open(json_name) as stream:
                raw = stream.read(MAX_EXPORT_ENTRY_BYTES + 1)
        except KeyError as error:
            raise HTTPException(422, f"{json_name} 内容无效。") from error
        if len(raw) > MAX_EXPORT_ENTRY_BYTES:
            raise HTTPException(413, "导出包单个文件超过 NAS 保存上限。")
        try:
            value = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HTTPException(422, f"{json_name} 内容无效。") from error
        if not isinstance(value, dict):
            raise HTTPException(422, f"{json_name} 内容无效。")


def _validate_image_entries(archive: zipfile.ZipFile, names: set[str]) -> None:
    for image_name in (name for name in names if Path(name).suffix.lower() in {".png", ".webp"}):
        # 只取文件头做魔数校验：没必要把整张图读进内存。
        with archive.open(image_name) as stream:
            head = stream.read(12)
        suffix = Path(image_name).suffix.lower()
        if suffix == ".png":
            valid = head.startswith(b"\x89PNG\r\n\x1a\n")
        else:
            valid = len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"
        if not valid:
            format_name = "PNG" if suffix == ".png" else "WebP"
            raise HTTPException(422, f"{image_name} 不是有效的 {format_name} 文件。")


def store_export_package(
    request: Request,
    name: str,
    overwrite: bool,
    temporary_archive: Path,
    entries: list[zipfile.ZipInfo],
) -> dict:
    root = request.app.state.settings.studio3d_exports_dir
    target = root / name
    with _storage_lock:
        if target.exists() and not overwrite:
            raise _folder_exists(name)
        # 结果里的 overwritten 取「交换前」的状态：交换后 target 必然存在。
        existed = target.exists()
        staging = root / f".export-{uuid4().hex}"
        staging.mkdir(mode=0o700)
    try:
        _extract_package(temporary_archive, staging, entries, name)
        with _storage_lock:
            if target.exists() and not overwrite:
                raise _folder_exists(name)
            _swap_staging_into_place(staging, target)
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
    _register_export_assets(request, name, target, entries)
    request.app.state.global_log.append("success", "3D户型图编辑器", "导出", f"3D 户型图已导出到：{name}")
    return {
        "folderName": name,
        "relativePath": f"exports/{name}",
        # 必须是「交换前」的取值：交换后 target 恒存在，overwritten 会永远为 True。
        "overwritten": existed,
        "files": [*sorted(entry.filename for entry in entries), f"{name}.zip"],
    }


def _folder_exists(name: str) -> HTTPException:
    return HTTPException(
        status.HTTP_409_CONFLICT,
        {
            "code": "STUDIO3D_EXPORT_EXISTS",
            "message": "该文件夹已存在，请确认覆盖或换一个文件夹名。",
            "folderName": name,
        },
    )


def _extract_package(temporary_archive: Path, staging: Path, entries: list[zipfile.ZipInfo], name: str) -> None:
    with zipfile.ZipFile(temporary_archive) as archive:
        for entry in entries:
            output_path = staging / entry.filename
            with archive.open(entry) as source, output_path.open("xb") as output:
                shutil.copyfileobj(source, output)
            output_path.chmod(0o600)
    archive_name = f"{name}.zip"
    shutil.copyfile(temporary_archive, staging / archive_name)
    (staging / archive_name).chmod(0o600)


def _swap_staging_into_place(staging: Path, target: Path) -> None:
    if not target.exists():
        os.replace(staging, target)
        return
    backup = target.parent / f".previous-{uuid4().hex}"
    os.replace(target, backup)
    try:
        os.replace(staging, target)
    except Exception:
        os.replace(backup, target)
        raise
    shutil.rmtree(backup, ignore_errors=True)


def _register_export_assets(request: Request, name: str, target: Path, entries: list[zipfile.ZipInfo]) -> None:
    catalog = getattr(request.app.state, "asset_catalog", None)
    if catalog is None:
        return
    for entry in entries:
        if Path(entry.filename).suffix.lower() in {".png", ".webp"}:
            catalog.register_studio3d_export(name, target / entry.filename)


def scan_usages(database: Session, name: str) -> list[str]:
    """扫描所有可能引用 studio3d:{name}/ 的存储面，返回可读的使用方名称。"""
    prefix = f"studio3d:{name}/"
    usages: list[str] = []
    project_names = {project.id: project.name for project in database.scalars(select(Project)).all()}
    for draft in database.scalars(select(ProjectDraft)).all():
        if _document_uses_asset_prefix(_decode_document(draft.document_json), prefix):
            usages.append(project_names.get(draft.project_id, draft.project_id))
    if _document_uses_asset_prefix({"customPopups": global_popups(database)}, prefix):
        usages.append("全局组合弹窗")
    scene = _draft_scene(database)
    if _document_uses_asset_prefix(scene, prefix):
        usages.append("户型图绘制")
    if _document_uses_asset_prefix(draft_repository.read_sync_document(database), prefix):
        usages.append("户型图删除归档")
    return list(dict.fromkeys(usages))


def _draft_scene(database: Session) -> dict:
    """草稿场景；无行或损坏时按空场景处理。"""
    try:
        snapshot = draft_repository.read_snapshot(database)
    except HTTPException:
        # 草稿损坏不应让「删除图片」变成不可操作：跳过该项扫描，其它引用面照旧拦截。
        return {}
    return snapshot.scene if snapshot is not None else {}


def _decode_document(raw) -> dict:
    try:
        value = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def delete_export_folder(request: Request, database: Session, name: str) -> None:
    settings = request.app.state.settings
    usages = scan_usages(database, name)
    if usages:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "STUDIO3D_EXPORT_IN_USE",
                "message": f"该文件夹中的图片正在被“{'、'.join(usages)}”使用，请先替换或移除后再删除。",
                "folderName": name,
                "projects": usages,
            },
        )
    root = settings.studio3d_exports_dir.resolve()
    target = (root / name).resolve()
    if not target.is_relative_to(root) or target.parent != root:
        raise HTTPException(422, "导出文件夹名称无效。")
    with _storage_lock:
        if not target.is_dir():
            raise HTTPException(404, "导图文件夹不存在。")
        discarded = root / f".deleted-{uuid4().hex}"
        os.replace(target, discarded)
        catalog = getattr(request.app.state, "asset_catalog", None)
        if catalog is not None:
            catalog.remove_studio3d_folder(name)
        shutil.rmtree(discarded, ignore_errors=True)
    request.app.state.global_log.append("success", "图片管理", "删除", f"已删除自动导图文件夹：{name}")
