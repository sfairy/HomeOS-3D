# [补充说明] 3D 户型图（Studio 3D）草稿与导出文件的存储接口。
#
# 草稿不走数据库，以单文件 JSON 存在 settings.studio3d_draft_path 上：编辑器每次保存都带
# revision，服务端比对一致再 +1，用这个字段做乐观并发控制；落盘走「临时文件 + fsync + rename」，
# 保证断电不会留下半份草稿。
#
# 导出方向相反：前端把 ZIP（场景 JSON + 家具图片）POST 上来，校验后解压到
# settings.studio3d_exports_dir 并注册进资产目录；删除前先扫描草稿与全局弹窗确认无引用。
# 所有涉及导出目录的读改写都串行化在 _storage_lock 上，避免并发上传 / 删除互相踩踏。
from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool

from ..dependencies import DatabaseSession, LicensedUser
from ..global_popups import global_popups
from ..models import Project, ProjectDraft, StudioInteractionSync
from ..modules.interaction3d.studio_cleanup import confirmation_token, plan_cleanup
from ..schemas import Studio3DDraftUpdate

router = APIRouter(prefix='/studio3d', tags=['studio3d'])
# 各条上限都是「防御性天花板」：正常户型图远小于这些值，设上限是为了挡住前端 bug 或
# 恶意构造的超大请求把磁盘写满。草稿那条与导出包那两条同源，免得出现「接口放行、落盘拒收」
# 这种自相矛盾的门槛。
MAX_DRAFT_BYTES = 67108864
MAX_EXPORT_ARCHIVE_BYTES = 536870912
MAX_EXPORT_EXPANDED_BYTES = 1073741824
MAX_EXPORT_FILES = 512
# 导出目录的互斥锁：上传、覆盖、删除都会做「先落临时目录再 rename」的多步操作，
# 不加锁时两个并发请求的中间目录可能互相覆盖。
_storage_lock = RLock()


def _utc_now() -> str:
    # [补充说明] 当前 UTC 时间的 ISO 字符串，写入草稿的 updatedAt 字段。
    #
    # 注意与 observability/global_log 的同名概念区分：那个 utc_now() 返回的是
    # datetime，本函数返回的是**字符串**。
    return datetime.now(UTC).isoformat()


def _atomic_json_write(path: Path, payload: dict) -> None:
    # [补充说明] 把草稿原子地写进 JSON 文件。
    #
    # 步骤：序列化 -> 检查大小 -> 写同目录临时文件 -> fsync -> rename 覆盖。
    # payload 按键排序、去空格，保证内容相同则字节一致。
    # 异常: HTTPException 413 —— 序列化后超过 MAX_DRAFT_BYTES。
    # ensure_ascii=False 让中文按 UTF-8 原样落盘；sort_keys + 紧凑分隔符则保证
    # 同一份内容永远序列化成同一串字节。
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    # 写盘前就拦下超大草稿，避免先把大文件写出去再回滚。
    if len(encoded) > MAX_DRAFT_BYTES:
        raise HTTPException(413, '户型图数据过大，无法保存。')
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


def _decode_document_json(raw: str | bytes | None) -> dict | None:
    # [补充说明] 宽松解析项目/同步行里的文档 JSON；损坏或不是对象时返回 None。
    #
    # 与 _read_draft 的「坏了就报错」相反：这些文档只是清理与迁移的输入，
    # 单份坏掉应当跳过这一份（调用方决定退化成空对象还是 continue），而不是让整个请求 500。
    try:
        value = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _read_draft(path: Path) -> dict | None:
    # [补充说明] 读取草稿文件；文件不存在返回 None。
    #
    # 异常: HTTPException 500 —— 文件存在但 JSON 损坏或缺少 revision 字段。只能人工从备份恢复，
    # 因此不静默降级成空草稿，否则编辑器下一次保存就会把坏文件覆盖掉。
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise HTTPException(500, '独立户型图草稿已损坏，请从 NAS 备份恢复。') from error
    # revision 必须是整数：后续的并发比对全靠它，缺失或类型不对一律按损坏处理。
    if not isinstance(payload, dict) or not isinstance(payload.get('revision'), int):
        raise HTTPException(500, '独立户型图草稿格式无效，请从 NAS 备份恢复。')
    return payload


def _migrate_legacy_scene(request: Request, database: DatabaseSession) -> dict | None:
    # [补充说明] 把旧版仪表盘文档里的 studio3d 字段迁出成独立草稿文件。
    #
    # 迁移只做一次：从所有草稿里挑出第一份可用场景写入草稿文件（revision=1），并把该字段
    # 从所有文档中删净 —— 不删的话每次启动都会重复迁移。没有任何可迁内容时返回 None。
    #
    # 参数用 request 而不是单独的 draft_path，是因为写入目标就来自
    # settings.studio3d_draft_path，调用方不必自己再解析一遍配置。
    selected_scene = None
    changed = False
    # 按更新时间倒序：优先采用最近编辑过的那份场景。
    drafts = database.scalars(select(ProjectDraft).order_by(ProjectDraft.updated_at.desc())).all()
    for draft in drafts:
        # 单份草稿损坏时跳过（统一入口）：迁移不该因为一份坏文档整个失败。
        try:
            document = json.loads(draft.document_json)
        except (TypeError, json.JSONDecodeError):
            continue
        # pop 而非 get：迁走之后要把它从文档里彻底移除，避免下次再被扫到。
        scene = document.pop('studio3d', None)
        if scene is None:
            continue
        # 只采用第一份有效场景；后续文档里的字段照删，但内容不再覆盖。
        if selected_scene is None and isinstance(scene, dict):
            selected_scene = scene
        draft.document_json = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
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
    # [补充说明] 从 x-export-folder 请求头解析并校验导出文件夹名。
    #
    # 必须是单个路径段：不含分隔符、不以点开头、结尾不是点或空格、不含 Windows 保留字符与
    # 控制字符、UTF-8 编码不超过 180 字节。异常: HTTPException 422 —— 名称无效。
    encoded = request.headers.get('x-export-folder', '')
    try:
        # 前端发的是 URL 编码值，这里解码后统一去掉首尾空白。
        name = unquote(encoded).strip()
    except (UnicodeError, ValueError) as error:
        raise HTTPException(422, '导出文件夹名称无效。') from error
    # Windows / NAS 共享上的保留字符，命中就拒绝，避免跨平台拷贝时出错。
    invalid_characters = '<>:"/\\|?*'
    if (
        not name
        or name in {'.', '..'}
        or name.startswith('.')
        or name.endswith(('.', ' '))
        or any((character in invalid_characters for character in name))
        or any((ord(character) < 32 or ord(character) == 127 for character in name))
        # 按字节限长：中文一个字占 3 字节，而 NAS 的路径长度限制按字节算。
        or len(name.encode('utf-8')) > 180
        # 兜底再确认一次「只剩文件名」，挡住用 '..' 拼出的路径穿越。
        or Path(name).name != name
    ):
        raise HTTPException(422, '文件夹名不能包含路径符号、控制字符或系统保留符号。')
    return name


def _document_uses_asset_prefix(value, prefix: str) -> bool:
    # [补充说明] 整份文档里是否存在以该前缀开头的字符串（用于查图片引用）。
    #
    # 递归扫字典的值与列表项；宽一格只是少删一张图，窄一格会把还在用的导出图删掉。
    if isinstance(value, dict):
        return any((_document_uses_asset_prefix(item, prefix) for item in value.values()))
    if isinstance(value, list):
        return any((_document_uses_asset_prefix(item, prefix) for item in value))
    return isinstance(value, str) and value.startswith(prefix)


def _validate_archive(archive_path: Path) -> list[zipfile.ZipInfo]:
    # [补充说明] 校验导出 ZIP 的结构与内容，返回条目列表。
    #
    # 校验项：ZIP 能打开、条目数与解压后总大小在上限内、只允许单层文件名、扩展名限定
    # .png/.json/.webp、JSON 必须能解析成对象、图片必须带正确魔数。任何一项不过都抛 4xx
    # 中文错误，不做「尽量解压」的兜底。413 表示解压后总大小超限（防 zip bomb）；422 表示结构或内容非法。
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as error:
        raise HTTPException(422, '导出数据不是有效的 ZIP 文件。') from error
    with archive:
        entries = archive.infolist()
        # 空包与超量包都拒绝；数量上限同时也约束了后面逐个校验的开销。
        if not entries or len(entries) > MAX_EXPORT_FILES:
            raise HTTPException(422, '导出文件数量无效。')
        names = {entry.filename for entry in entries}
        # set 会静默吞掉重名，而解压时第二条同名条目会撞上独占创建（xb）报 500：
        # 在只读的校验阶段就把重名拒掉。
        if len(names) != len(entries):
            raise HTTPException(422, '导出包包含重名文件。')
        expanded_size = 0
        for entry in entries:
            name = entry.filename
            # 只收单层文件名：出现 '/' 或 '\\' 说明是目录或嵌套路径，解压后会跑到导出目录之外。
            if (
                entry.is_dir()
                or not name
                or name.startswith('.')
                or Path(name).name != name
                or '/' in name
                or '\\' in name
                or Path(name).suffix.lower() not in {'.png', '.json', '.webp'}
            ):
                raise HTTPException(422, '导出包包含无效文件路径或文件类型。')
            # 按声明的解压后大小累计，挡住 zip bomb 把磁盘写满。
            expanded_size += entry.file_size
            if expanded_size > MAX_EXPORT_EXPANDED_BYTES:
                raise HTTPException(413, '导出内容超过 NAS 保存上限。')
        for json_name in (name for name in names if name.lower().endswith('.json')):
            try:
                value = json.loads(archive.read(json_name))
            except (UnicodeDecodeError, json.JSONDecodeError, KeyError) as error:
                raise HTTPException(422, f'{json_name} 内容无效。') from error
            # JSON 必须是对象：场景文件结构固定，数组或标量说明包不是本项目的导出。
            if isinstance(value, dict):
                continue
            raise HTTPException(422, f'{json_name} 内容无效。')
        for image_name in (name for name in names if Path(name).suffix.lower() in {'.png', '.webp'}):
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
            raise HTTPException(422, f'{image_name} 不是有效的 {format_name} 文件。')
        return entries


@router.get('')
def get_studio3d_draft(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    # [补充说明] 读取 3D 户型图草稿（需已登录且授权允许 api）。
    #
    # 返回 {revision, scene, updatedAt}；草稿文件不存在时尝试把旧版仪表盘文档里的
    # studio3d 字段一次性迁出，仍然没有就返回 revision=0 的空草稿，前端据此进入新建流程。
    # 读操作同样加锁：必须与写入串行。
    with _storage_lock:
        # 上一次保存若在「库已提交、文件还没落盘」之间崩掉，这里补写草稿文件。
        _deliver_pending(request, database)
        payload = _read_draft(request.app.state.settings.studio3d_draft_path)
        if payload is None:
            payload = _migrate_legacy_scene(request, database)
        return payload or {'revision': 0, 'scene': None, 'updatedAt': None}


@router.put('')
def update_studio3d_draft(payload: Studio3DDraftUpdate, request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    # [补充说明] 保存 3D 户型图草稿（需已登录且授权允许 api）。
    #
    # 请求体: scene（场景数据）与 revision（客户端持有的版本号）；成功返回新的
    # {revision, scene, updatedAt}。
    #
    # 保存时顺带清理「引用了已被删掉的场景模型」的 3D 控件绑定：删模型删的只是家具/门窗，
    # 可仪表盘上那些绑定（灯、锁、窗帘……）还指着一个不存在的模型，点开就是空壳。
    # 清理计划由纯函数 plan_cleanup 算出，本路由只负责取数据、落库、写盘；被剪掉的条目
    # 连同身份键存进 studio_interaction_sync，等模型被重新画回场景时原样放回去。
    #
    # 异常:
    # - HTTPException 409 —— 版本号不一致，detail 为 {code: 'STUDIO3D_REVISION_CONFLICT',
    # message, currentRevision}，前端应提示「已在其他页面更新」并让用户重新拉取。
    # - HTTPException 428 —— 本次删除会让控件绑定悬空且未获确认，detail 为
    # {code: 'STUDIO3D_INTERACTION_CONFIRMATION', token, message, impacts, projects}：
    # 前端弹确认框，用户同意后带同一个 token 重发即可；未确认时草稿、项目文档、撤销记录
    # 一律未改动，撤销/取消直接丢弃本次请求即可。
    with _storage_lock:
        # 同一个草稿的读改写都串行在这把锁上，但锁只保护本进程；先补完上一次的落盘，
        # 再用 BEGIN IMMEDIATE 把整段事务提前升级成写锁，避免并发请求读到半途状态。
        _deliver_pending(request, database)
        database.commit()
        database.execute(text('BEGIN IMMEDIATE'))
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
        # ---- 模型删除的级联清理 ------------------------------------------------
        # 先把所有项目文档读成内存快照：plan_cleanup 只读它，改的是自己深拷贝出来的副本。
        drafts = database.scalars(select(ProjectDraft)).all()
        # 单份文档损坏时跳过它：清理只处理能读懂的项目，不让一份坏数据把整次保存变成 500。
        documents = {}
        for draft in drafts:
            document = _decode_document_json(draft.document_json)
            if document is None:
                continue
            documents[draft.project_id] = document
        state = database.get(StudioInteractionSync, 1)
        # 撤销记录存在同步行里；全新库、内容被外部改坏、archive 不是数组都按「没有撤销记录」处理。
        saved = _decode_document_json(state.document_json) if state is not None else {}
        archive = (saved or {}).get('archive', [])
        if not isinstance(archive, list):
            archive = []
        (changed, archive, impacts) = plan_cleanup(
            documents,
            (current or {}).get('scene') or {},
            payload.scene,
            archive,
            request.app.state.settings)
        # 令牌绑定「当前 revision + 新场景 + 现有文档 + 本次影响」：任何一项变了令牌就变，
        # 用户确认的永远是它当时看到的那份计划。
        token = confirmation_token(current_revision, payload.scene, documents, impacts)
        if impacts and payload.interactionConfirmation != token:
            # 影响提示里的 projectId 换成人看得懂的项目名；项目可能刚被删掉，这时退回显示 id。
            names = {p.id: p.name for p in database.scalars(select(Project)).all()}
            # 确认之前什么都不写：草稿、项目文档、撤销记录保持原样。
            database.rollback()
            raise HTTPException(428, {
                'code': 'STUDIO3D_INTERACTION_CONFIRMATION',
                'token': token,
                'message': '删除将同步移除关联的 3D 交互配置。',
                'impacts': impacts,
                'projects': [names.get(key, key) for key in dict.fromkeys((impact['projectId'] for impact in impacts))]})
        # 逐份写回被清理过的文档；revision 也随之 +1，与草稿的版本链保持一致。
        for draft in drafts:
            if draft.project_id in changed:
                draft.document_json = json.dumps(changed[draft.project_id], ensure_ascii=False)
                draft.revision += 1
                draft.updated_by = _user.id
                continue
        if state is None:
            state = StudioInteractionSync(id=1)
            database.add(state)
        # 草稿先记进同步行的 pending 字段，等提交成功后再由 _deliver_pending 落到磁盘文件：
        # 这样「库改了但文件没写」可以被下一次读取补上，而不会出现半份草稿。
        state.document_json = json.dumps({'archive': archive, 'pending': updated}, ensure_ascii=False)
        # 撤销记录与草稿共用同一条体积上限：archive 存的是历次被剪掉的控件条目，反复增删模型
        # 会让它越滚越大，一次保存就可能把库里这一行写成超大 JSON。超限时整批回滚（含上面
        # 逐份文档的清理），并明确告知「关联清理未执行」—— 否则用户会以为清理成功、实际整份
        # 保存都没落库。与草稿那条 413 是两条独立入口，故文案也不同。
        if len(state.document_json.encode('utf-8')) > MAX_DRAFT_BYTES:
            database.rollback()
            raise HTTPException(413, '户型及撤销记录过大，未执行关联清理。')
        database.commit()
        _deliver_pending(request, database)
        request.app.state.global_log.append('success', '3D户型图编辑器', '配置', f"3D 户型图草稿已保存（修订 {updated['revision']}）")
        return updated


def _deliver_pending(request, database):
    # [补充说明] 把同步行里 pending 的草稿补写到磁盘，成功后就地清掉 pending。
    #
    # 保存路径先提交库、再调本函数写文件；两步之间进程被杀时，下一次读草稿会再次调用它，
    # 于是补写完成 —— 库与文件最终一致。
    state = database.get(StudioInteractionSync, 1)
    if state is None:
        return
    # 这一段读不出来（被外部改坏）时按「没有待补写内容」处理，避免读取草稿也 500。
    value = _decode_document_json(state.document_json) or {}
    if value.get('pending') is not None:
        _atomic_json_write(request.app.state.settings.studio3d_draft_path, value['pending'])
        value.pop('pending')
        state.document_json = json.dumps(value, ensure_ascii=False)
        database.commit()


@router.get('/exports/check')
def check_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    # [补充说明] 检查导出文件夹是否已存在（需已登录且授权允许 api）。
    #
    # 文件夹名取自 x-export-folder 请求头（经 _folder_name 校验）。
    # 返回 {folderName, exists}，供前端在上传前弹「覆盖 / 换名」确认框。
    folder_name = _folder_name(request)
    target = request.app.state.settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        return {'folderName': folder_name, 'exists': target.exists()}


@router.post('/exports', status_code=status.HTTP_201_CREATED)
async def save_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    # [补充说明] 上传并保存 3D 导出包（需已登录且授权允许 api）。
    #
    # 请求头 x-export-folder（目标文件夹名，必填）、x-export-overwrite（'true' 表示允许覆盖）；
    # 成功 201 返回 {folderName, relativePath, overwritten, files}。413 超限、422 结构非法、
    # 409 已存在且未允许覆盖（STUDIO3D_EXPORT_EXISTS）。
    # 整条链路（收流、fsync、校验、解压换位、登记素材）都留在请求自身的执行流里：
    # 收流必须 await 请求体，其余步骤虽重，但都在同一个请求的临界区内完成，语义最直接。
    folder_name = _folder_name(request)
    overwrite = request.headers.get('x-export-overwrite', '').strip().lower() == 'true'
    settings = request.app.state.settings
    # 上传先落在同目录下的临时名再校验，正式路径上不会出现半截 ZIP。
    temporary_archive = settings.studio3d_exports_dir / f'.upload-{uuid4().hex}.zip'
    written = 0
    try:
        # 'xb' 独占创建：万一同名临时文件存在就直接失败，不做覆盖。
        with temporary_archive.open('xb') as output:
            # 边收边计数，超过压缩包上限立刻中断，不等整个流收完。
            async for chunk in request.stream():
                written += len(chunk)
                if written > MAX_EXPORT_ARCHIVE_BYTES:
                    raise HTTPException(413, '导出 ZIP 超过 NAS 保存上限。')
                output.write(chunk)
            # flush + fsync 真的等存储设备回应（NAS 上可能到秒级）。
            output.flush()
            os.fsync(output.fileno())
        # 384 = 0o600，导出包可能含用户私有素材，权限与草稿保持一致。
        temporary_archive.chmod(384)
        # 空文件也会在 ZIP 解析时报错，这里提前给出更明确的提示。
        if written == 0:
            raise HTTPException(422, '导出 ZIP 为空。')
        entries = _validate_archive(temporary_archive)
        # 校验之后的解压、目录换位与素材登记都是同步磁盘重活：丢进线程池执行，
        # 免得一条导出请求把事件循环卡住，同进程的其他接口与 WebSocket 都要在一旁等。
        return await run_in_threadpool(
            _store_export_package, request, folder_name, overwrite, temporary_archive, entries)
    finally:
        # 无论成功失败都清掉上传临时文件，不给导出目录留下垃圾。
        if temporary_archive.exists():
            temporary_archive.unlink()


def _store_export_package(request: Request, folder_name: str, overwrite: bool, temporary_archive: Path, entries: list[zipfile.ZipInfo]) -> dict:
    # [补充说明] 把已校验的导出包解压进正式目录、登记素材并拼出接口响应（同步阻塞函数）。
    #
    # 与路由分开是因为它全是同步磁盘操作：调用方用 run_in_threadpool 执行，
    # 事件循环在 NAS 慢慢 fsync 时仍然可以服务其他请求。
    # 解压与目录换位连同 _storage_lock 一起做：存在性与覆盖判断放在锁内，
    # 防止两个并发上传都看到「不存在」而互相覆盖。
    settings = request.app.state.settings
    target = settings.studio3d_exports_dir / folder_name
    with _storage_lock:
        target_exists = target.exists()
        if target_exists and not overwrite:
            raise HTTPException(409, {
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
                    # 逐条复制而不是 extractall：条目名与类型已在 _validate_archive 校验过，
                    # 不再信任 ZIP 自带信息。
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
                except Exception:
                    os.replace(backup, target)
                    raise
                shutil.rmtree(backup, ignore_errors=True)
            else:
                os.replace(staging, target)
        finally:
            # 失败路径清掉暂存目录；成功时它已被 rename 走，这里不会命中。
            if staging.exists():
                shutil.rmtree(staging)
    catalog = getattr(request.app.state, 'asset_catalog', None)
    if catalog is not None:
        # 只登记图片：JSON 不是素材，前端素材库也不需要它。
        for entry in entries:
            if Path(entry.filename).suffix.lower() in {'.png', '.webp'}:
                catalog.register_studio3d_export(folder_name, target / entry.filename)
    request.app.state.global_log.append('success', '3D户型图编辑器', '导出', f'3D 户型图已导出到：{folder_name}')
    return {
        'folderName': folder_name,
        'relativePath': f'exports/{folder_name}',
        'overwritten': target_exists,
        'files': sorted([entry.filename for entry in entries]) + [f'{folder_name}.zip'],
    }


@router.delete('/exports', status_code=status.HTTP_204_NO_CONTENT)
def delete_studio3d_export_folder(request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    # [补充说明] 删除一个自动导图文件夹（需已登录且授权允许 api）。
    #
    # 文件夹名取自 x-export-folder 请求头。删除前先扫描所有项目草稿、全局组合弹窗与户型图草稿，
    # 只要还有图片被引用就拒绝。成功返回 204。
    # 异常: HTTPException 409 —— 图片仍被引用，detail 为 {code: 'STUDIO3D_EXPORT_IN_USE',
    # message, folderName, projects}；404 不存在；422 名称非法。
    folder_name = _folder_name(request)
    # 资产 ID 的前缀形式与前端约定一致，用前缀匹配即可覆盖文件夹下所有图片。
    asset_prefix = f'studio3d:{folder_name}/'
    projects = {item.id: item.name for item in database.scalars(select(Project))}
    usages = []
    for draft in database.scalars(select(ProjectDraft)):
        # 单份草稿损坏时跳过：它的读取路径自会报错，不该连累删除流程。
        try:
            document = json.loads(draft.document_json)
        except (TypeError, json.JSONDecodeError):
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
        raise HTTPException(422, '导出文件夹名称无效。')
    with _storage_lock:
        if not target.is_dir():
            raise HTTPException(404, '导图文件夹不存在。')
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
