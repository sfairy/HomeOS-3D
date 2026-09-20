"""3D 户型图（Studio 3D）草稿与导出文件的存储接口。

草稿不走数据库，而是以单文件 JSON 存在 settings.studio3d_draft_path 上：编辑器每次保存都带
revision，服务端比对一致再 +1，用这个字段实现乐观并发控制；落盘一律走「临时文件 + fsync +
rename」，保证断电或崩溃不会留下半份草稿。

导出方向相反 —— 前端把 ZIP（场景 JSON + 家具图片）POST 上来，服务端校验后解压到
settings.studio3d_exports_dir 下的一个文件夹并注册进资产目录；删除导出文件夹前会先扫描所有
草稿与全局弹窗，确认没有图片仍被引用。

所有涉及导出目录的读改写都串行化在 _storage_lock 上，避免并发上传 / 删除互相踩踏。
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from ..http.body_guard import MAX_SCENE_DOCUMENT_BYTES
from ..core.canonical_json import canonical_json, canonical_json_bytes
from ..core.dependencies import DatabaseSession, LicensedUser
from ..panel.global_popups import global_popups
from ..core.models import Project, ProjectDraft
from ..panel.documents import parse_document
from ..core.schemas import Studio3DDraftUpdate
from ..http.streaming import flush_and_sync, write_stream_in_batches

router = APIRouter(prefix='/studio3d', tags=['studio3d'])
# 各条上限都是「防御性天花板」：正常户型图远小于这些值，
# 设上限是为了挡住前端 bug 或恶意构造的超大请求把磁盘写满。
# 草稿那一条与请求体上限同源（body_guard.MAX_SCENE_DOCUMENT_BYTES）：
# 请求体先被中间件按它拦一道，这里再按序列化后的紧凑形式判一次 ——
# 两处用同一个数字，免得出现「接口放行、落盘拒收」这种自相矛盾的门槛。
MAX_DRAFT_BYTES = MAX_SCENE_DOCUMENT_BYTES
MAX_EXPORT_ARCHIVE_BYTES = 536870912
MAX_EXPORT_EXPANDED_BYTES = 1073741824
MAX_EXPORT_FILES = 512
# 预留的「必含文件」清单，目前为空即不强制任何文件名；保留是为了将来需要
# 校验固定文件时不必改动接口契约。
REQUIRED_EXPORT_FILES = {}
# 导出目录的互斥锁：上传、覆盖、删除都会做「先落临时目录再 rename」的多步操作，
# 不加锁时两个并发请求的中间目录可能互相覆盖。
_storage_lock = RLock()


def _utc_now() -> str:
    """当前 UTC 时间的 ISO 字符串，写入草稿的 updatedAt 字段。"""
    return datetime.now(timezone.utc).isoformat()


def _atomic_json_write(path: Path, payload: dict) -> None:
    """把草稿原子地写进 JSON 文件。

    步骤：序列化 → 检查大小 → 写同目录临时文件 → fsync → rename 覆盖。
    参数:
        path: 目标草稿文件路径（其父目录必须已存在）。
        payload: 要写入的字典（键排序、去空格，保证相同内容字节一致）。
    异常:
        HTTPException 413: 序列化后超过 MAX_DRAFT_BYTES。
    """
    encoded = canonical_json_bytes(payload)
    # 写盘前就拦下超大草稿，避免先把大文件写出去再回滚。
    if len(encoded) > MAX_DRAFT_BYTES:
        raise HTTPException(status_code=413, detail='户型图数据过大，无法保存。')
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
    """读取草稿文件。

    返回:
        草稿字典；文件不存在返回 None。
    异常:
        HTTPException 500: 文件存在但 JSON 损坏或缺少 revision 字段。
            这两种情况只能人工从备份恢复，因此不静默降级成空草稿，
            否则编辑器下一次保存就会把坏文件覆盖掉。
    """
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=500, detail='独立户型图草稿已损坏，请从 NAS 备份恢复。') from error
    # revision 必须是整数：后续的并发比对全靠它，缺失或类型不对一律按损坏处理。
    if not isinstance(payload, dict) or not isinstance(payload.get('revision'), int):
        raise HTTPException(status_code=500, detail='独立户型图草稿格式无效，请从 NAS 备份恢复。')
    return payload


def _migrate_legacy_scene(request: Request, database: DatabaseSession) -> dict | None:
    """把旧版仪表盘文档里的 studio3d 字段迁出成独立草稿文件。

    早期 3D 场景是塞在 ProjectDraft.document_json 里的，现在独立成文件。
    迁移只做一次：从所有草稿里挑出第一份可用的场景写入草稿文件（revision=1），
    并把该字段从所有文档中删净 —— 不删的话每次启动都会重复迁移。

    返回:
        新写入的草稿字典；没有任何可迁内容时返回 None。
    """
    selected_scene = None
    changed = False
    # 按更新时间倒序：优先采用最近编辑过的那份场景。
    drafts = database.scalars(select(ProjectDraft).order_by(ProjectDraft.updated_at.desc())).all()
    for draft in drafts:
        # 单份草稿损坏时跳过（B54 的统一入口）：迁移不该因为一份坏文档整个失败。
        document = parse_document(draft.document_json)
        if document is None:
            continue
        # pop 而非 get：迁走之后要把它从文档里彻底移除，避免下次再被扫到。
        scene = document.pop('studio3d', None)
        if scene is None:
            continue
        # 只采用第一份有效场景；后续文档里的字段照删，但内容不再覆盖。
        if selected_scene is None and isinstance(scene, dict):
            selected_scene = scene
        draft.document_json = canonical_json(document)
        changed = True
    if changed:
        database.commit()
    if selected_scene is None:
        return None
    # 迁移产物从 revision 1 起步，让客户端拿到的初始版本号与新建草稿一致。
    payload = {'revision': 1, 'scene': selected_scene, 'updatedAt': _utc_now()}
    _atomic_json_write(request.app.state.settings.studio3d_draft_path, payload)
    return payload


def _folder_name(request: Request) -> str:
    """从 x-export-folder 请求头解析并校验导出文件夹名。

    必须是单个路径段：不含路径分隔符、不以点开头、结尾不能是点或空格、
    不含 Windows 保留字符与控制字符、UTF-8 编码不超过 180 字节。
    异常:
        HTTPException 422: 名称无效（含解码失败）。
    """
    encoded = request.headers.get('x-export-folder', '')
    try:
        # 前端发的是 URL 编码值，这里解码后统一去掉首尾空白。
        name = unquote(encoded).strip()
    except (UnicodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail='导出文件夹名称无效。') from error
    # Windows / NAS 共享上的保留字符，命中就拒绝，避免跨平台拷贝时出错。
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
        raise HTTPException(status_code=422, detail='文件夹名不能包含路径符号、控制字符或系统保留符号。')
    return name


def _document_uses_asset_prefix(value, prefix: str) -> bool:
    """递归判断文档里是否存在以该前缀开头的字符串（用于查图片引用）。"""
    if isinstance(value, dict):
        return any((_document_uses_asset_prefix(item, prefix) for item in value.values()))
    if isinstance(value, list):
        return any((_document_uses_asset_prefix(item, prefix) for item in value))
    return isinstance(value, str) and value.startswith(prefix)


def _validate_archive(archive_path: Path) -> list[zipfile.ZipInfo]:
    """校验导出 ZIP 的结构与内容，返回条目列表。

    校验项：ZIP 能打开、条目数与解压后总大小在上限内、只允许单层文件名、扩展名限定
    .png/.json/.webp、JSON 必须能解析成对象、图片必须带正确魔数。任何一项不过都直接抛 4xx 中文
    错误，不做「尽量解压」的兜底。413 表示解压后总大小超过 MAX_EXPORT_EXPANDED_BYTES（防 zip
    bomb）；422 表示文件不是 ZIP、条目数量 / 路径 / 类型非法、JSON 或图片内容无效。
    """
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as error:
        raise HTTPException(status_code=422, detail='导出数据不是有效的 ZIP 文件。') from error
    with archive:
        entries = archive.infolist()
        # 空包与超量包都拒绝；数量上限同时也约束了后面逐个校验的开销。
        if not entries or len(entries) > MAX_EXPORT_FILES:
            raise HTTPException(status_code=422, detail='导出文件数量无效。')
        names = {entry.filename for entry in entries}
        if not names:
            raise HTTPException(status_code=422, detail='导出包不能为空。')
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
                raise HTTPException(status_code=422, detail='导出包包含无效文件路径或文件类型。')
            # 按声明的解压后大小累计，挡住 zip bomb 把磁盘写满。
            expanded_size += entry.file_size
            if expanded_size > MAX_EXPORT_EXPANDED_BYTES:
                raise HTTPException(status_code=413, detail='导出内容超过 NAS 保存上限。')
        for json_name in [name for name in names if name.lower().endswith('.json')]:
            try:
                value = json.loads(archive.read(json_name))
            except (UnicodeDecodeError, json.JSONDecodeError, KeyError) as error:
                raise HTTPException(status_code=422, detail=f'{json_name} 内容无效。') from error
            # JSON 必须是对象：场景文件结构固定，数组或标量说明包不是本项目的导出。
            if isinstance(value, dict):
                continue
            raise HTTPException(status_code=422, detail=f'{json_name} 内容无效。')
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
                continue
            # 校验魔数而不只看扩展名，避免把伪装文件存进资产目录。
            format_name = 'PNG' if suffix == '.png' else 'WebP'
            raise HTTPException(status_code=422, detail=f'{image_name} 不是有效的 {format_name} 文件。')
        return entries


@router.get('')
def get_studio3d_draft(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    """读取 3D 户型图草稿（需已登录且授权允许 api）。

    返回 {revision, scene, updatedAt}；草稿文件不存在时先尝试从旧版仪表盘文档迁移，
    迁移也拿不到内容才返回 revision=0 的空草稿，前端据此进入新建流程。
    """
    # 读操作同样加锁：读取过程中可能触发迁移（写文件 + 改库），必须与写入串行。
    with _storage_lock:
        payload = _read_draft(request.app.state.settings.studio3d_draft_path)
        # 只在确实没有草稿文件时才迁移，保证旧数据只被搬一次。
        if payload is None:
            payload = _migrate_legacy_scene(request, database)
        return payload or {'revision': 0, 'scene': None, 'updatedAt': None}


@router.put('')
def update_studio3d_draft(payload: Studio3DDraftUpdate, request: Request, _user: LicensedUser) -> dict:
    """保存 3D 户型图草稿（需已登录且授权允许 api）。

    请求体: scene（场景数据）与 revision（客户端持有的版本号）。
    成功返回新的 {revision, scene, updatedAt}。
    异常:
        HTTPException 409: 版本号与磁盘不一致，detail 为
            {code: 'STUDIO3D_REVISION_CONFLICT', message, currentRevision}，
            前端应提示「已在其他页面更新」并让用户重新拉取。
    """
    with _storage_lock:
        current = _read_draft(request.app.state.settings.studio3d_draft_path)
        current_revision = current['revision'] if current else 0
        # 乐观并发控制（If-Match 语义）：客户端必须回传自己读到的版本号，
        # 服务端不做覆盖式写入，避免两个标签页互相抹掉对方的编辑。
        if payload.revision != current_revision:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                'code': 'STUDIO3D_REVISION_CONFLICT',
                'message': '户型图草稿已在其他页面更新。',
                'currentRevision': current_revision})
        updated = {
            # 每次成功保存都 +1，客户端拿着新版本号继续编辑，形成串行化的版本链。
            'revision': current_revision + 1,
            'scene': payload.scene,
            'updatedAt': _utc_now()}
        _atomic_json_write(request.app.state.settings.studio3d_draft_path, updated)
        request.app.state.global_log.append('success', '3D户型图编辑器', '配置', f"3D 户型图草稿已保存（修订 {updated['revision']}）")
        return updated


@router.get('/exports/check')
def check_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    """检查导出文件夹是否已存在（需已登录且授权允许 api）。

    文件夹名取自 x-export-folder 请求头（经 _folder_name 校验）。
    返回 {folderName, exists}，供前端在上传前弹「覆盖 / 换名」确认框。
    """
    folder_name = _folder_name(request)
    target = request.app.state.settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        return {'folderName': folder_name, 'exists': target.exists()}


def _atomic_swap(source: Path, destination: Path) -> None:
    """原子替换一个路径（单独包一层是为了让「替换失败」可注入）。

    覆盖导出时用的是「旧目录改名 → 新目录就位 → 删旧」的换位法，其中任何一步
    都可能失败，而失败与回滚的先后顺序决定了异常链长什么样（B39）。要复现
    「新目录就位失败且回滚也失败」这种罕见组合，直接打 ``os.replace`` 会污染
    整个进程，所以留这一个可替换的入口（排障时手工打桩用）。
    """
    os.replace(source, destination)


def _install_export(settings, folder_name: str, temporary_archive: Path, entries: list[zipfile.ZipInfo], overwrite: bool) -> bool:
    """在写锁内把校验过的 ZIP 解压成正式导出目录，返回是否覆盖了旧文件夹。

    整段都是同步文件操作（解压最大 1 GiB、若干次 rename），调用方必须放进线程池：
    留在事件循环里会让一次大导出把全部 HTTP 与 WebSocket 一起冻住（B5）。

    存在性与覆盖判断放在锁内做，防止两个并发上传都看到「不存在」而互相覆盖。
    """
    target = settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        target_exists = target.exists()
        if target_exists and not overwrite:
            raise HTTPException(status_code=409, detail={
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
                    # 逐条复制而不是 extractall：条目名与类型已在 _validate_archive
                    # 校验过，这里不再信任 ZIP 自带的路径信息。
                    with archive.open(entry) as source:
                        with output_path.open('xb') as output:
                            shutil.copyfileobj(source, output)
                    output_path.chmod(384)
            # 原始 ZIP 也留在文件夹里，便于用户回下载或做整体备份。
            archive_name = f'{folder_name}.zip'
            shutil.copyfile(temporary_archive, staging / archive_name)
            (staging / archive_name).chmod(384)
            if target_exists:
                # 覆盖采用「旧目录改名 → 新目录就位 → 删旧」的换位法；
                # 新目录就位失败时把旧目录改回来，任何时刻都有一份可用数据。
                backup = settings.studio3d_exports_dir / f'.previous-{uuid4().hex}'
                _atomic_swap(target, backup)
                try:
                    _atomic_swap(staging, target)
                    shutil.rmtree(backup, ignore_errors=True)
                except Exception as error:
                    # 回滚自己失败时不能让它顶掉原始异常（B39）：那样调用方与全局日志
                    # 看到的都是「回滚失败」，真正的原因（新目录没能就位）反而丢了，
                    # 数据此时只剩隐藏的 backup。把两者一起说清楚，并链上原始异常。
                    try:
                        _atomic_swap(backup, target)
                    except OSError as rollback_error:
                        raise RuntimeError(
                            f'导出目录替换失败且回滚未完成（{type(error).__name__}: {error}；'
                            f'回滚又失败：{rollback_error}）。备份仍在 {backup.name}，请手工恢复。'
                        ) from error
                    raise
            else:
                _atomic_swap(staging, target)
        finally:
            # 失败路径清掉暂存目录；成功时它已被 rename 走，这里不会命中。
            if staging.exists():
                shutil.rmtree(staging)
    return target_exists


def _register_exported_assets(catalog, folder_name: str, target: Path, entries: list[zipfile.ZipInfo]) -> None:
    """把导出包里的图片登记进素材目录（同步，调用方放进线程池）。

    登记时要为每张图生成「透明裁剪变体」—— 那是一次完整的 Pillow 解码 + 一次
    PNG 编码，属于与解压同量级的同步重活（B6 的同类问题），因此与解压一起
    交给工作线程，而不是留在事件循环里逐张处理。
    """
    for entry in entries:
        # 只登记图片：JSON 不是素材，前端素材库也不需要它。
        if Path(entry.filename).suffix.lower() in frozenset({'.png', '.webp'}):
            catalog.register_studio3d_export(folder_name, target / entry.filename)


@router.post('/exports', status_code=status.HTTP_201_CREATED)
async def save_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    """上传并保存 3D 导出包（需已登录且授权允许 api）。

    请求头 x-export-folder（目标文件夹名，必填）、x-export-overwrite（'true' 表示允许覆盖同名
    文件夹）；请求体是 ZIP 原始字节流（场景 JSON + 家具图片）。成功 201 返回
    {folderName, relativePath, overwritten, files}。413 ZIP 本体或解压后总大小超限；422 ZIP 为空 /
    结构非法；409 文件夹已存在且未允许覆盖（code=STUDIO3D_EXPORT_EXISTS）。

    收流部分留在事件循环里（``await request.stream()`` 本身是异步的），所有同步重活 —— 落盘、
    fsync、校验（要解压每个 JSON 与图片）、解压换位、生成效果变体 —— 一律交给工作线程：
    一次大导出冻结全部 HTTP / WebSocket 是修复前的行为（B5/B6）。
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
                    raise HTTPException(status_code=413, detail='导出 ZIP 超过 NAS 保存上限。')

            written = await write_stream_in_batches(request.stream(), output, before_write=_reject_oversized)
            # flush + fsync 真的等存储设备回应（NAS 上可能到秒级），不能占着事件循环。
            await asyncio.to_thread(flush_and_sync, output)
        # 384 = 0o600，导出包可能含用户私有素材，权限与草稿保持一致。
        temporary_archive.chmod(384)
        # 空文件也会在 ZIP 解析时报错，这里提前给出更明确的提示。
        if written == 0:
            raise HTTPException(status_code=422, detail='导出 ZIP 为空。')
        # 校验会逐个解压 JSON 与图片（最多 MAX_EXPORT_EXPANDED_BYTES），同样放线程池。
        entries = await run_in_threadpool(_validate_archive, temporary_archive)
        # 解压与目录换位连同那把 _storage_lock 一起搬进线程池：锁是同步锁，
        # 在事件循环里等锁同样会卡住别的请求。
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

    文件夹名取自 x-export-folder 请求头。删除前先扫描所有项目草稿、全局组合弹窗
    与户型图草稿，只要还有图片被引用就拒绝。
    成功返回 204；异常:
        HTTPException 409: 文件夹内图片仍被引用，detail 为
            {code: 'STUDIO3D_EXPORT_IN_USE', message, folderName, projects}；
        404 文件夹不存在；422 名称非法。
    """
    folder_name = _folder_name(request)
    # 资产 ID 的前缀形式与前端约定一致，用前缀匹配即可覆盖文件夹下所有图片。
    asset_prefix = f'studio3d:{folder_name}/'
    projects = {item.id: item.name for item in database.scalars(select(Project))}
    usages = []
    for draft in database.scalars(select(ProjectDraft)):
        # 单份草稿损坏时跳过：它的读取路径自会报错，不该连累删除流程（B54）。
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
        raise HTTPException(status_code=422, detail='导出文件夹名称无效。')
    with _storage_lock:
        if not target.is_dir():
            raise HTTPException(status_code=404, detail='导图文件夹不存在。')
        # 先改名成隐藏目录再删：rename 是瞬时的，界面不会看到「删到一半」的目录。
        discarded = root / f'.deleted-{uuid4().hex}'
        os.replace(target, discarded)
        catalog = getattr(request.app.state, 'asset_catalog', None)
        if catalog is not None:
            # 同步摘掉资产登记，否则素材库里会留下指向已删文件的死链。
            catalog.remove_studio3d_folder(folder_name)
        shutil.rmtree(discarded, ignore_errors=True)
    request.app.state.global_log.append('success', '图片管理', '删除', f'已删除自动导图文件夹：{folder_name}')
    return Response(status_code=status.HTTP_204_NO_CONTENT)
