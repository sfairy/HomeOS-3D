"""3D 户型图（Studio 3D）草稿与导出文件的存储接口。
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import shutil
import tempfile
import warnings
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, update
from starlette.concurrency import run_in_threadpool

from .assets_uploads import MAX_UPLOAD_DIMENSION, MAX_UPLOAD_PIXELS
from ..core.body_limits import MAX_SCENE_DOCUMENT_BYTES
from ..core.canonical_json import canonical_json, canonical_json_bytes
from ..security.dependencies import DatabaseSession, LicensedUser
from ..panel.global_popups import global_popups
from ..core.models import Project, ProjectDraft, StudioInteractionSync
from ..modules.interaction3d.studio_cleanup import confirmation_token, plan_cleanup
from ..panel.documents import parse_document
from ..panel.entity_refs import document_mentions
from ..core.schemas import Studio3DDraftUpdate
from ..http.streaming import flush_and_sync, write_stream_in_batches

router = APIRouter(prefix='/studio3d', tags=['studio3d'])
# 各条上限都是「防御性天花板」：正常户型图远小于这些值，设上限是为了挡住前端 bug 或
MAX_DRAFT_BYTES = MAX_SCENE_DOCUMENT_BYTES
MAX_EXPORT_ARCHIVE_BYTES = 536870912
MAX_EXPORT_EXPANDED_BYTES = 1073741824
MAX_EXPORT_FILES = 512
# 「本次删除影响」的确认文案。真保存的 428 与预检（dryRun）的 200 回的是同一件事，
INTERACTION_CONFIRMATION_MESSAGE = '删除的模型被 3D 控件引用，保存将一并移除这些绑定。'
# 导出目录的互斥锁：上传、覆盖、删除都会做「先落临时目录再 rename」的多步操作，
_storage_lock = RLock()


def utc_iso_now() -> str:
    """当前 UTC 时间的 ISO 字符串，写入草稿的 updatedAt 字段。
    """
    return datetime.now(timezone.utc).isoformat()


def _atomic_json_write(path: Path, payload: dict) -> None:
    """把草稿原子地写进 JSON 文件。
    """
    encoded = canonical_json_bytes(payload)
    if len(encoded) > MAX_DRAFT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail='户型图数据过大，无法保存。')
    # 临时文件必须与目标同目录：跨文件系统的 rename 不是原子操作。
    (descriptor, temporary_name) = tempfile.mkstemp(prefix='.draft-', suffix='.tmp', dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(encoded)
            output.flush()
            # 先 flush 再 fsync：只有真落到磁盘，断电后才不会留下被截断的草稿。
            os.fsync(output.fileno())
        # 384 = 0o600，创建后立刻收紧权限 —— 草稿里有完整的户型与家具布局。
        temporary_path.chmod(384)
        os.replace(temporary_path, path)
    finally:
        # 成功路径下临时文件已被 rename 走，这里只清理失败时的残留。
        if temporary_path.exists():
            temporary_path.unlink()


def _read_draft(path: Path) -> dict | None:
    """读取草稿文件；文件不存在返回 None。
    """
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='独立户型图草稿已损坏，请从 NAS 备份恢复。') from error
    # revision 必须是整数：后续的并发比对全靠它，缺失或类型不对一律按损坏处理。
    if not isinstance(payload, dict) or not isinstance(payload.get('revision'), int):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='独立户型图草稿格式无效，请从 NAS 备份恢复。')
    return payload


def _folder_name(request: Request) -> str:
    """从 x-export-folder 请求头解析并校验导出文件夹名。
    """
    encoded = request.headers.get('x-export-folder', '')
    try:
        # 前端发的是 URL 编码值，这里解码后统一去掉首尾空白。
        name = unquote(encoded).strip()
    except (UnicodeError, ValueError) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出文件夹名称无效。') from error
    invalid_characters = '<>:"/\\|?*'
    if (
        not name
        or name in frozenset({'.', '..'})
        or name.startswith('.')
        or name.endswith(('.', ' '))
        or any((character in invalid_characters for character in name))
        or any((ord(character) < 32 or ord(character) == 127 for character in name))
        # 按字节限长：中文一个字占 3 字节，而 NAS 的路径长度限制按字节算。
        or len(name.encode('utf-8')) > 180
        # 兜底再确认一次「只剩文件名」，挡住用 '..' 拼出的路径穿越。
        or Path(name).name != name
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='文件夹名不能包含路径符号、控制字符或系统保留符号。')
    return name


def _document_uses_asset_prefix(value, prefix: str) -> bool:
    """整份文档里是否存在以该前缀开头的字符串（用于查图片引用）。
    """
    return document_mentions(value, lambda text: text.startswith(prefix))


def _validate_archive(archive_path: Path) -> list[zipfile.ZipInfo]:
    """校验导出 ZIP 的结构与内容，返回条目列表。
    """
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出数据不是有效的 ZIP 文件。') from error
    with archive:
        entries = archive.infolist()
        # 空包与超量包都拒绝；数量上限同时也约束了后面逐个校验的开销。
        if not entries or len(entries) > MAX_EXPORT_FILES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出文件数量无效。')
        names = {entry.filename for entry in entries}
        if not names:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出包不能为空。')
        expanded_size = 0
        for entry in entries:
            name = entry.filename
            # 只收单层文件名：出现 '/' 或 '\' 说明是目录或嵌套路径，解压后会跑到导出目录之外。
            if (
                entry.is_dir()
                or not name
                or name.startswith('.')
                or Path(name).name != name
                or '/' in name
                or '\\' in name
                or Path(name).suffix.lower() not in frozenset({'.png', '.json', '.webp'})
            ):
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出包包含无效文件路径或文件类型。')
            # 按声明的解压后大小累计，挡住 zip bomb 把磁盘写满。
            expanded_size += entry.file_size
            if expanded_size > MAX_EXPORT_EXPANDED_BYTES:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail='导出内容超过 NAS 保存上限。')
        for json_name in [name for name in names if name.lower().endswith('.json')]:
            try:
                value = json.loads(archive.read(json_name))
            except (UnicodeDecodeError, json.JSONDecodeError, KeyError) as error:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{json_name} 内容无效。') from error
            # JSON 必须是对象：场景文件结构固定，数组或标量说明包不是本项目的导出。
            if isinstance(value, dict):
                continue
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{json_name} 内容无效。')
        for image_name in [name for name in names if Path(name).suffix.lower() in frozenset({'.png', '.webp'})]:
            # 图片逐个读出来验魔数；条目数量已被上限约束，不会在这里放大内存开销。
            image_data = archive.read(image_name)
            suffix = Path(image_name).suffix.lower()
            # PNG 固定 8 字节魔数；WebP 是 RIFF 容器，头 4 字节 RIFF、第 8~12 字节 WEBP。
            if suffix == '.png':
                valid = image_data.startswith(b'\x89PNG\r\n\x1a\n')
            else:
                valid = len(image_data) >= 12 and image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP'
            if valid:
                _assert_image_within_upload_limits(image_name, image_data)
                continue
            format_name = 'PNG' if suffix == '.png' else 'WebP'
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{image_name} 不是有效的 {format_name} 文件。')
        return entries


def _assert_image_within_upload_limits(name: str, data: bytes) -> None:
    """按**真实像素尺寸**校验导出包里的位图，越界抛 422。
    """
    try:
        with warnings.catch_warnings():
            # 尺寸超限由下面的显式判断负责，这里不靠 Pillow 的阈值报警；
            warnings.simplefilter('ignore', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                (width, height) = probe.size
    except Image.DecompressionBombError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{name} 像素尺寸过大，请压缩后重试。') from error
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{name} 图片已损坏或无法完整解码。') from error
    if (
        width <= 0
        or height <= 0
        or width > MAX_UPLOAD_DIMENSION
        or height > MAX_UPLOAD_DIMENSION
        or width * height > MAX_UPLOAD_PIXELS
    ):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=f'{name} 像素尺寸过大，请压缩后重试。')


@router.get('')
def get_studio3d_draft(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    """读取 3D 户型图草稿（需已登录且授权允许 api）。
    """
    # 读操作同样加锁：必须与写入串行。
    with _storage_lock:
        # 先补完上一次可能中断的落盘，再读文件，保证读到的 revision 与库一致。
        _deliver_pending(request, database)
        payload = _read_draft(request.app.state.settings.studio3d_draft_path)
        return payload or {'revision': 0, 'scene': None, 'updatedAt': None}


def _interaction_archive(state: StudioInteractionSync | None) -> list:
    """从单行同步状态里取出上一次留下的撤销记录列表。
    """
    if state is None:
        return []
    try:
        payload = json.loads(state.document_json)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []
    archive = payload.get('archive')
    return archive if isinstance(archive, list) else []


def _interaction_project_labels(database: DatabaseSession, impacts: list[dict]) -> list[str]:
    """把影响记录里的 projectId 换成人看得懂的项目名，供确认弹窗直接展示。
    """
    names = {project.id: project.name for project in database.scalars(select(Project)).all()}
    seen = dict.fromkeys(impact['projectId'] for impact in impacts)
    return [names.get(project_id, project_id) for project_id in seen]


@router.put('')
def update_studio3d_draft(
    payload: Studio3DDraftUpdate,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
    dry_run: bool = Query(False, alias='dryRun'),
) -> dict:
    """保存 3D 户型图草稿（需已登录且授权允许 api）。
    """
    with _storage_lock:
        _deliver_pending(request, database)
        current = _read_draft(request.app.state.settings.studio3d_draft_path)
        current_revision = current['revision'] if current else 0
        # 乐观并发控制（If-Match 语义）：客户端必须回传自己读到的版本号，
        if payload.revision != current_revision:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'STUDIO3D_REVISION_CONFLICT',
                'message': '户型图草稿已在其他页面更新。',
                'currentRevision': current_revision})
        updated = {
            # 每次成功保存都 +1，客户端拿着新版本号继续编辑，形成串行化的版本链。
            'revision': current_revision + 1,
            'scene': payload.scene,
            'updatedAt': utc_iso_now()}
        # ---- 模型删除的级联清理 ------------------------------------------------
        # 先把所有项目文档读成内存快照：plan_cleanup 只读它，改的是自己 deepcopy 出来的副本。
        drafts = database.scalars(select(ProjectDraft)).all()
        documents = {}
        for draft in drafts:
            # 单份文档损坏就跳过：清理不该因一份坏文档整体失败。
            document = parse_document(draft.document_json)
            if document is not None:
                documents[draft.project_id] = document
        state = database.get(StudioInteractionSync, 1)
        changed, archive, impacts = plan_cleanup(
            documents,
            (current or {}).get('scene') or {},
            payload.scene,
            _interaction_archive(state),
            request.app.state.settings)
        if impacts:
            # 令牌绑定「当前 revision + 新场景 + 现有文档 + 本次影响」：任何一项变了令牌就变，
            token = confirmation_token([current_revision, payload.scene, documents, impacts])
            if payload.interaction_confirmation != token:
                projects = _interaction_project_labels(database, impacts)
                if dry_run:
                    # 预检命中：只回「要确认什么」，草稿、项目文档、撤销记录一律未改动。
                    return {
                        'confirmationRequired': True,
                        'token': token,
                        'message': INTERACTION_CONFIRMATION_MESSAGE,
                        'impacts': impacts,
                        'projects': projects,
                        'revision': current_revision}
                # 确认之前什么都不写：草稿、项目文档、撤销记录保持原样。
                database.rollback()
                raise HTTPException(status_code=status.HTTP_428_PRECONDITION_REQUIRED, detail={
                    'code': 'STUDIO3D_INTERACTION_CONFIRMATION',
                    'token': token,
                    'message': INTERACTION_CONFIRMATION_MESSAGE,
                    'impacts': impacts,
                    'projects': projects})
        if dry_run:
            # 预检未命中（本次没有会让绑定悬空的删除）：同样不落盘，只回「无需确认」。
            return {'confirmationRequired': False, 'revision': current_revision}
        for draft in drafts:
            cleaned = changed.get(draft.project_id)
            if cleaned is None:
                continue
            result = database.execute(
                update(ProjectDraft)
                .where(ProjectDraft.project_id == draft.project_id, ProjectDraft.revision == draft.revision)
                .values(document_json=canonical_json(cleaned), revision=ProjectDraft.revision + 1, updated_by=_user.id)
                .execution_options(synchronize_session=False))
            if result.rowcount != 1:
                # 期间有人改了这份仪表盘：整批回滚，让用户重试，绝不用旧快照做部分覆盖。
                database.rollback()
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    'code': 'PROJECT_REVISION_CONFLICT',
                    'message': '关联仪表盘已在其他页面更新，本次 3D 交互配置清理未保存，请重试。'})
        if state is None:
            state = StudioInteractionSync(id=1)
            database.add(state)
        # 草稿先记进同步行的 pending 字段，等提交成功后再由 _deliver_pending 落到磁盘文件：
        state.document_json = canonical_json({'archive': archive, 'pending': updated})
        # 撤销记录与草稿共用同一条体积上限：archive 存的是历次被剪掉的控件条目，反复增删模型
        if len(state.document_json.encode('utf-8')) > MAX_DRAFT_BYTES:
            database.rollback()
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail='户型及撤销记录过大，未执行关联清理。')
        # 先提交库、再落盘：两步之间中断时，下一次读/写草稿会用 pending 补写完成，
        database.commit()
        _deliver_pending(request, database)
        request.app.state.global_log.append('success', '3D户型图编辑器', '配置', f"3D 户型图草稿已保存（修订 {updated['revision']}）")
        return updated


def _deliver_pending(request, database) -> None:
    """把同步行里 pending 的草稿补写到磁盘，成功后就地清掉 pending。
    """
    state = database.get(StudioInteractionSync, 1)
    if state is None:
        return
    try:
        value = json.loads(state.document_json)
    except (TypeError, json.JSONDecodeError):
        # 内容被外部改坏：没有可补写的 pending，保持原样（与 _interaction_archive 同一策略）。
        return
    if not isinstance(value, dict) or value.get('pending') is None:
        return
    _atomic_json_write(request.app.state.settings.studio3d_draft_path, value['pending'])
    value.pop('pending')
    state.document_json = canonical_json(value)
    database.commit()


@router.get('/exports/check')
def check_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    """检查导出文件夹是否已存在（需已登录且授权允许 api）。
    """
    folder_name = _folder_name(request)
    target = request.app.state.settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        return {'folderName': folder_name, 'exists': target.exists()}


def _install_export(settings, folder_name: str, temporary_archive: Path, entries: list[zipfile.ZipInfo], overwrite: bool) -> bool:
    """在写锁内把校验过的 ZIP 解压成正式导出目录，返回是否覆盖了旧文件夹。
    """
    target = settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        target_exists = target.exists()
        if target_exists and not overwrite:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'STUDIO3D_EXPORT_EXISTS',
                'message': '该文件夹已存在，请确认覆盖或换一个文件夹名。',
                'folderName': folder_name})
        # 448 = 0o700；先解压到隐藏的暂存目录，成功后再整体 rename 成正式目录。
        staging = settings.studio3d_exports_dir / f'.export-{uuid4().hex}'
        staging.mkdir(mode=448)
        try:
            with zipfile.ZipFile(temporary_archive) as archive:
                for entry in entries:
                    output_path = staging / entry.filename
                    with archive.open(entry) as source:
                        with output_path.open('xb') as output:
                            shutil.copyfileobj(source, output)
                    output_path.chmod(384)
            # 原始 ZIP 也留在文件夹里，便于用户回下载或做整体备份。
            archive_name = f'{folder_name}.zip'
            shutil.copyfile(temporary_archive, staging / archive_name)
            (staging / archive_name).chmod(384)
            if target_exists:
                # 换位法：新目录就位失败时把旧目录改回来，任何时刻都有一份可用数据。
                backup = settings.studio3d_exports_dir / f'.previous-{uuid4().hex}'
                os.replace(target, backup)
                try:
                    os.replace(staging, target)
                    shutil.rmtree(backup, ignore_errors=True)
                except Exception as error:
                    try:
                        os.replace(backup, target)
                    except OSError as rollback_error:
                        raise RuntimeError(
                            f'导出目录替换失败且回滚未完成（{type(error).__name__}: {error}；'
                            f'回滚又失败：{rollback_error}）。备份仍在 {backup.name}，请手工恢复。'
                        ) from error
                    raise
            else:
                os.replace(staging, target)
        finally:
            # 失败路径清掉暂存目录；成功时它已被 rename 走，这里不会命中。
            if staging.exists():
                shutil.rmtree(staging)
    return target_exists


def _register_exported_assets(catalog, folder_name: str, target: Path, entries: list[zipfile.ZipInfo]) -> None:
    """把导出包里的图片登记进素材目录（同步，调用方放进线程池）。
    """
    for entry in entries:
        # 只登记图片：JSON 不是素材，前端素材库也不需要它。
        if Path(entry.filename).suffix.lower() in frozenset({'.png', '.webp'}):
            catalog.register_studio3d_export(folder_name, target / entry.filename)


@router.post('/exports', status_code=status.HTTP_201_CREATED)
async def save_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    """上传并保存 3D 导出包（需已登录且授权允许 api）。
    """
    folder_name = _folder_name(request)
    overwrite = request.headers.get('x-export-overwrite', '').strip().lower() == 'true'
    settings = request.app.state.settings
    target = settings.studio3d_exports_dir / folder_name
    # 上传先落在同目录下的临时名再校验，正式路径上不会出现半截 ZIP。
    temporary_archive = settings.studio3d_exports_dir / f'.upload-{uuid4().hex}.zip'
    try:
        # 'xb' 独占创建：万一同名临时文件存在就直接失败，不做覆盖。
        with temporary_archive.open('xb') as output:
            def _reject_oversized(received: int) -> None:
                # 边收边计数，超过压缩包上限立刻中断，不等整个流收完。
                if received > MAX_EXPORT_ARCHIVE_BYTES:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail='导出 ZIP 超过 NAS 保存上限。')

            written = await write_stream_in_batches(request.stream(), output, before_write=_reject_oversized)
            # flush + fsync 真的等存储设备回应（NAS 上可能到秒级），不能占着事件循环。
            await asyncio.to_thread(flush_and_sync, output)
        # 384 = 0o600，导出包可能含用户私有素材，权限与草稿保持一致。
        temporary_archive.chmod(384)
        # 空文件也会在 ZIP 解析时报错，这里提前给出更明确的提示。
        if written == 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出 ZIP 为空。')
        # 校验会逐个解压 JSON 与图片（最多 MAX_EXPORT_EXPANDED_BYTES），同样放线程池。
        entries = await run_in_threadpool(_validate_archive, temporary_archive)
        # 解压与目录换位连同 _storage_lock 一起搬进线程池：在事件循环里等同步锁会卡住别的请求。
        target_exists = await run_in_threadpool(_install_export, settings, folder_name, temporary_archive, entries, overwrite)
        catalog = getattr(request.app.state, 'asset_catalog', None)
        if catalog is not None:
            await run_in_threadpool(_register_exported_assets, catalog, folder_name, target, entries)
        request.app.state.global_log.append('success', '3D户型图编辑器', '导出', f'3D 户型图已导出到：{folder_name}')
        return {
            'folderName': folder_name,
            'relativePath': f'exports/{folder_name}',
            'overwritten': target_exists,
            'files': sorted([entry.filename for entry in entries]) + [f'{folder_name}.zip'],
        }
    finally:
        # 无论成功失败都清掉上传临时文件，不给导出目录留下垃圾。
        if temporary_archive.exists():
            temporary_archive.unlink()


@router.delete('/exports', status_code=status.HTTP_204_NO_CONTENT)
def delete_studio3d_export_folder(request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    """删除一个自动导图文件夹（需已登录且授权允许 api）。
    """
    folder_name = _folder_name(request)
    # 资产 ID 的前缀形式与前端约定一致，用前缀匹配即可覆盖文件夹下所有图片。
    asset_prefix = f'studio3d:{folder_name}/'
    projects = {item.id: item.name for item in database.scalars(select(Project))}
    usages = []
    for draft in database.scalars(select(ProjectDraft)):
        # 单份草稿损坏时跳过：它的读取路径自会报错，不该连累删除流程。
        document = parse_document(draft.document_json)
        if document is None:
            continue
        if not _document_uses_asset_prefix(document, asset_prefix):
            continue
        # 记项目名而不是 ID，错误提示可以直接展示给用户看。
        usages.append(projects.get(draft.project_id, draft.project_id))
    # 全局组合弹窗不属于任何项目，单独扫一遍。
    if _document_uses_asset_prefix({'customPopups': global_popups(database)}, asset_prefix):
        usages.append('全局组合弹窗')
    # 户型图编辑器自己的场景也可能引用这些图片。
    studio_draft_path = request.app.state.settings.studio3d_draft_path
    if studio_draft_path.is_file():
        try:
            studio_draft = json.loads(studio_draft_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            studio_draft = {}
        if _document_uses_asset_prefix(studio_draft.get('scene', {}), asset_prefix):
            usages.append('户型图绘制')
    if usages:
        # 去重并保持出现顺序：同一个项目引用多次时，错误提示里只列一遍。
        unique_usages = list(dict.fromkeys(usages))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
            'code': 'STUDIO3D_EXPORT_IN_USE',
            'message': f'该文件夹中的图片正在被“{"、".join(unique_usages)}”使用，请先替换或移除后再删除。',
            'folderName': folder_name,
            'projects': unique_usages})
    settings = request.app.state.settings
    # resolve 后再做前缀比对，挡住符号链接或 '..' 拼出的路径穿越。
    root = settings.studio3d_exports_dir.resolve()
    target = (root / folder_name).resolve()
    if not target.is_relative_to(root) or target.parent != root:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail='导出文件夹名称无效。')
    with _storage_lock:
        if not target.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='导图文件夹不存在。')
        # 先改名成隐藏目录再删：rename 是瞬时的，界面不会看到「删到一半」的目录。
        discarded = root / f'.deleted-{uuid4().hex}'
        os.replace(target, discarded)
        catalog = getattr(request.app.state, 'asset_catalog', None)
        if catalog is not None:
            catalog.remove_studio3d_folder(folder_name)
        shutil.rmtree(discarded, ignore_errors=True)
    request.app.state.global_log.append('success', '图片管理', '删除', f'已删除自动导图文件夹：{folder_name}')
    return Response(status_code=status.HTTP_204_NO_CONTENT)
