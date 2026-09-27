"""素材（图片）的目录、上传与读取接口。

路由前缀 /api/v1/assets；另有 read_builtin_asset 由 main.py 挂到 /assets/builtin/*。
三类素材：builtin（随发行版只读）、user（上传，每素材一个十六进制目录）、
studio3d（3D 工作室导出，按文件夹分组）。目录状态由进程内 AssetCatalog 缓存
（单进程部署前提），上传的 SVG 先白名单清洗再落盘，读取带长期缓存头靠 URL 版本失效。
"""
from __future__ import annotations
import asyncio
import json
import os
import shutil
from xml.etree import ElementTree
from pathlib import Path
from urllib.parse import unquote
from uuid import uuid4
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from ..security.dependencies import DatabaseSession, LicensedUser, LicensedViewer, authenticated_short_lived_viewer, licensed_viewer, require_capability, require_viewer_studio3d_asset, require_viewer_user_asset, viewer_user_asset_ids
from ..http.http_cache import set_private_immutable_cache, set_versioned_private_cache
from ..panel.documents import parse_document
from ..core.models import Project, ProjectDraft
from ..panel.global_popups import global_popups
from ..http.streaming import write_stream_in_batches

from .assets_uploads import (
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_PIXELS,
    MAX_UPLOAD_SVG_BYTES,
    SVG_NAMESPACE,
    UPLOAD_CONTENT_TYPES,
    UPLOAD_IMAGE_SUFFIXES,
    XLINK_NAMESPACE,
    validate_uploaded_image,
)

from .assets_catalog import (
    MAX_USER_ASSET_TOTAL_BYTES,
    USER_ASSET_WARN_BYTES,
    document_uses_asset,
    studio3d_export_file,
    sweep_user_assets_for_app,
    user_asset_file,
)

router = APIRouter(prefix = '/assets', tags = [
    'assets'])
# 固定输出时的命名空间前缀：否则 ElementTree 会写出 ns0: 之类的前缀，前端按标签名取元素会失效。
ElementTree.register_namespace('', SVG_NAMESPACE)
ElementTree.register_namespace('xlink', XLINK_NAMESPACE)































@router.get('/builtin')
def list_builtin_assets(request: Request, _viewer: LicensedViewer) -> dict:
    """列出全部内置素材。

    身份：LicensedViewer（认证 + api）且授权允许 assets，否则 403 LICENSE_RESTRICTED。
    """
    # 内置素材虽是发行版内容，读取同样受 assets 能力码约束。
    require_capability(request, 'assets', '当前授权不允许读取素材。')
    items = request.app.state.asset_catalog.builtin_items()
    versions = request.app.state.asset_catalog.versions()
    return {
        'items': items,
        'total': len(items),
        'catalogVersion': versions['builtin'] }

@router.get('/user')
def list_user_assets(request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """列出用户素材（含 3D 导出）。

    中控设备身份只会看到自己仪表盘文档里引用过的图片，管理员不受限。返回
    {items, total, maxUploadPixels, usageBytes, maxTotalBytes, catalogVersion}；
    前端用 maxUploadPixels 预校验，用 usageBytes / maxTotalBytes 显示已用多少。
    """
    catalog = request.app.state.asset_catalog
    items = catalog.user_items()
    allowed_asset_ids = viewer_user_asset_ids(database, viewer)
    # 可见范围为 None 表示管理员（不受限）；否则只保留文档引用过的那些图片。
    if allowed_asset_ids is not None:
        items = [item for item in items if item['assetId'].removeprefix('user:') in allowed_asset_ids]
    versions = catalog.versions()
    return {
        'items': items,
        'total': len(items),
        'maxUploadPixels': MAX_UPLOAD_PIXELS,
        'usageBytes': catalog.user_asset_bytes(),
        'maxTotalBytes': MAX_USER_ASSET_TOTAL_BYTES,
        'catalogVersion': versions['user'] }

@router.get('/version')
def asset_catalog_version(request: Request, _viewer: LicensedViewer) -> dict:
    """只返回两个目录的版本戳，供前端轮询判断是否需要重新拉素材列表。"""
    return request.app.state.asset_catalog.versions()

@router.post('/user', status_code = status.HTTP_201_CREATED)
async def upload_user_asset(request: Request, background_tasks: BackgroundTasks, _user: LicensedUser) -> dict:
    """上传一张用户图片，返回登记后的素材条目（201）。

    身份：LicensedUser（认证 + api）。文件名走 X-File-Name 请求头（URL 编码），请求体是
    裸文件流。422 为文件名/后缀/内容/尺寸非法，413 为超过该后缀上限（位图 64 MB、SVG 5 MB）；
    大小**逐块累计**判断、不信任 Content-Length。文案均为可直接展示的中文。
    """
    # 文件名放在自定义头里：请求体是裸文件流，没有 multipart 表单可承载文件名。
    encoded_name = request.headers.get('x-file-name', '')
    try:
        filename = unquote(encoded_name)
    except (UnicodeError, ValueError) as error:
        raise HTTPException(status_code = 422, detail = '图片文件名无效。') from error
    # 文件名白名单校验：点开头、含路径分隔符、含控制字符或超长的一律拒绝，URL 编码解出来也不放过。
    if not filename or filename in frozenset({'.', '..'}) or filename.startswith('.') or Path(filename).name != filename or '/' in filename or '\\' in filename or any((ord(character) < 32 or ord(character) == 127 for character in filename)) or len(filename.encode('utf-8')) > 240:
        raise HTTPException(status_code = 422, detail = '图片文件名无效，请保留普通文件名后重试。')
    suffix = Path(filename).suffix.lower()
    if suffix not in UPLOAD_IMAGE_SUFFIXES:
        raise HTTPException(status_code = 422, detail = '仅支持 PNG、JPG、JPEG、WebP 和 SVG 图片。')
    # 按后缀取更严的那个上限：SVG 只要 5 MB，就不该先写 64 MB 再回头判它超限。
    byte_limit = MAX_UPLOAD_SVG_BYTES if suffix == '.svg' else MAX_UPLOAD_BYTES
    size_hint = f'{byte_limit // 1000000} MB'
    # 声明超限的直接拒，连第一个字节都不读（放在建目录之前，早拒路径无需清理）。
    declared_length = request.headers.get('content-length', '').strip()
    if declared_length.isdigit() and int(declared_length) > byte_limit:
        raise HTTPException(status_code = 413, detail = f'图片不能超过 {size_hint}，请压缩后重试。')
    root = request.app.state.settings.user_assets_dir.resolve()
    # 总量配额：单文件上限挡不住「一直传」。先按声明长度粗判，流式写入时再按实收字节精判。
    # 这是软上限：并发上传可能同时通过，真正兜底的是单文件上限与巡检告警。
    catalog = request.app.state.asset_catalog
    used_bytes = await asyncio.to_thread(catalog.user_asset_bytes)
    quota_detail = (
        f'素材总容量已达上限（{MAX_USER_ASSET_TOTAL_BYTES // 1000000} MB），'
        '请先在素材库中删除不再使用的图片。'
    )
    if used_bytes + (int(declared_length) if declared_length.isdigit() else 0) > MAX_USER_ASSET_TOTAL_BYTES:
        raise HTTPException(status_code = 413, detail = quota_detail)
    # 目录名用随机 ID 而不是原文件名：避免重名与不可控字符，URL 里也不暴露文件名。
    asset_id = uuid4().hex
    directory = root / asset_id
    directory.mkdir(mode = 448)
    path = directory / filename
    # 落到临时名、校验通过后再改名：否则「文件已存在」与「文件已登记」之间有窗口，
    # 扫盘建索引会把 user:<id> 登记成指向不存在文件的条目。临时名以点开头，扫描端本就跳过。
    temporary = directory / f'.upload-{asset_id}{suffix}'
    try:
        # 流式落盘、不预信任 Content-Length；写盘分批放线程池，避免几十次 write 串在所有请求前面。
        with temporary.open('xb') as descriptor:
            def _reject_oversized(received: int) -> None:
                # 逐块累计：Content-Length 可以是假的，分块传输则干脆没有它。
                if received > byte_limit:
                    raise HTTPException(status_code = 413, detail = f'图片不能超过 {size_hint}，请压缩后重试。')
                # 总量配额也要按实收字节再判一次：没有长度头时上面那一档判不了。
                if used_bytes + received > MAX_USER_ASSET_TOTAL_BYTES:
                    raise HTTPException(status_code = 413, detail = quota_detail)

            received = await write_stream_in_batches(request.stream(), descriptor, before_write = _reject_oversized)
            # 最后留在 Python 缓冲里的不足一批（至多 BATCH_BYTES），同样别占着事件循环。
            await asyncio.to_thread(descriptor.flush)
        if received == 0:
            raise HTTPException(status_code = 422, detail = '请选择需要上传的图片。')
        # 先落盘再校验：Pillow 与 XML 解析都要文件路径；不通过就在下面把文件与目录清理掉。
        # 解码位图 / 解析 XML 是 CPU 与 IO 重活，放进线程池：留在事件循环里一张大图就能停摆几百毫秒。
        try:
            dimensions = await asyncio.to_thread(validate_uploaded_image, suffix, temporary)
        except ValueError as error:
            raise HTTPException(status_code = 422, detail = str(error)) from error
        # 同目录内改名是原子的：扫盘方看到的要么没有这个文件，要么是一份已校验的文件。
        os.replace(temporary, path)
        path.chmod(384)
    # 任何失败都要把刚建的目录删干净，否则素材目录里会留下空目录与半截文件。
    except Exception:
        # 清理绝不能再抛：rmdir 在目录非空时会抛 OSError，把真正的失败原因（422/413）
        # 顶成一条与客户端无关的 500，上传人看到的是「目录不是空的」。
        shutil.rmtree(directory, ignore_errors = True)
        raise
    # 登记同样进线程池：内部要为这张图生成透明裁剪变体（又一次完整解码 + PNG 编码）。
    item = await asyncio.to_thread(request.app.state.asset_catalog.register_user, asset_id, path, dimensions)
    if used_bytes + received > USER_ASSET_WARN_BYTES:
        # 越过水位才巡检：它要扫盘、遍历所有草稿，没必要每次上传都做。
        # 放到后台任务里（不是请求路径上）：用户拿到 201 不该等这次扫盘。
        background_tasks.add_task(sweep_user_assets_for_app, request.app)
    return item

@router.get('/user/{asset_id}')
def read_user_asset(asset_id: str, request: Request, viewer: LicensedViewer) -> FileResponse:
    """读取用户上传的图片文件。

    鉴权：该图片必须被当前主体的仪表盘引用，否则 403「该图片不属于当前中控仪表盘。」；
    文件不存在抛 404「图片不存在。」。响应带一年期强缓存（URL 带版本参数）。
    """
    # 单独开一个短会话做鉴权：读完立即归还连接，文件响应体不再占用数据库连接。
    with request.app.state.database.session_factory() as database:
        require_viewer_user_asset(database, viewer, asset_id)
    root = request.app.state.settings.user_assets_dir.resolve()
    path = user_asset_file(root, asset_id)
    if path is None:
        raise HTTPException(status_code = 404, detail = '图片不存在。')
    response = FileResponse(path, media_type = UPLOAD_CONTENT_TYPES[path.suffix.lower()])
    # 一年强缓存 + immutable：URL 带版本参数，内容一变 URL 就变，不会读到旧图。
    set_private_immutable_cache(response)
    return response

@router.get('/effect-variant')
def read_effect_variant(request: Request, asset_id: str = Query(alias = 'assetId')) -> FileResponse:
    """读取素材的透明裁剪变体（PNG）；查询参数 assetId（三种前缀都可）。

    可见性：user: 与 studio3d: 需被当前主体的仪表盘引用（导出目录按项目生成，不校验
    归属就能按文件名猜出别的项目的户型图），builtin: 需存在于素材目录。
    不存在或无权访问一律 404「效果图片不存在。」，不区分两者。
    """
    catalog = request.app.state.asset_catalog
    # 鉴权过程可能刷新会话/设备 Cookie，先收集进临时响应，最后再合并到文件响应上。
    authorization_response = Response()
    viewer = licensed_viewer(request, authenticated_short_lived_viewer(request, authorization_response))
    with request.app.state.database.session_factory() as database:
        if asset_id.startswith('user:'):
            require_viewer_user_asset(database, viewer, asset_id.removeprefix('user:'))
        elif asset_id.startswith('builtin:'):
            if not catalog.asset_exists(asset_id):
                raise HTTPException(status_code = 404, detail = '效果图片不存在。')
        elif asset_id.startswith('studio3d:'):
            require_viewer_studio3d_asset(database, viewer, asset_id)
        else:
            raise HTTPException(status_code = 404, detail = '效果图片不存在。')
        path = catalog.effect_variant_path(asset_id)
        if path is None:
            raise HTTPException(status_code = 404, detail = '效果图片不存在。')
    response = FileResponse(path, media_type = 'image/png')
    set_private_immutable_cache(response)
    # 只转发 Set-Cookie：其余头部（如 Content-Length）留给文件响应自己决定。
    for key, value in authorization_response.raw_headers:
        if key.lower() != b'set-cookie':
            continue
        response.raw_headers.append((key, value))
    return response

@router.get('/studio3d-export/{folder_name}/{filename}')
def read_studio3d_export(folder_name: str, filename: str, request: Request, viewer: LicensedViewer) -> FileResponse:
    """读取 3D 工作室导出的图片原文。

    身份：LicensedViewer（认证 + api）。中控设备身份额外要求「该文件被自己那块屏引用」
    ——URL 只带目录名与文件名，不校验归属就是跨项目 IDOR；管理员不受限。
    路径参数严格校验，非法或不存在 404「导出图片不存在。」，引用校验不过 403。
    """
    root = request.app.state.settings.studio3d_exports_dir.resolve()
    folder = unquote(folder_name)
    name = unquote(filename)
    path = studio3d_export_file(root, folder, name)
    if path is None:
        raise HTTPException(status_code = 404, detail = '导出图片不存在。')
    if viewer.project_id is not None:
        # 短会话：读完即归还连接，文件响应体不再占用数据库连接。
        with request.app.state.database.session_factory() as database:
            require_viewer_studio3d_asset(database, viewer, f'studio3d:{folder}/{name}')
    # 只允许 PNG / WebP 两种后缀，所以媒体类型可以在这里直接穷举。
    media_type = 'image/webp' if path.suffix.lower() == '.webp' else 'image/png'
    response = FileResponse(path, media_type = media_type)
    set_private_immutable_cache(response)
    return response

@router.delete('/user/{asset_id}', status_code = status.HTTP_204_NO_CONTENT)
def delete_user_asset(asset_id: str, request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    """删除一张用户上传的图片，返回 204。

    身份：LicensedUser（认证 + api）。仍被仪表盘文档或全局组合弹窗引用时抛 409
    ASSET_IN_USE 并列出引用方；被 3D 工作室草稿引用时抛同码的中文提示；不存在抛 404。
    """
    catalog = request.app.state.asset_catalog
    # 与保存文档共用同一把锁：删除与「保存时校验引用」不会交错执行。
    with catalog.mutation_lock:
        root = request.app.state.settings.user_assets_dir.resolve()
        path = user_asset_file(root, asset_id)
        if path is None:
            raise HTTPException(status_code = 404, detail = '图片不存在。')
        full_asset_id = f'user:{asset_id}'
        # 先取一次项目名映射：409 的文案里要给出人看得懂的名称，而不是项目 id。
        projects = {item.id: item.name for item in database.scalars(select(Project))}
        usages = []
        for draft in database.scalars(select(ProjectDraft)):
            # 单份草稿损坏时跳过：它的读取路径自会报错，不该连累删除流程。
            document = parse_document(draft.document_json)
            if document is None:
                continue
            if not document_uses_asset(document, full_asset_id):
                continue
            usages.append(projects.get(draft.project_id, draft.project_id))
        # 全局组合弹窗独立于项目文档存放，也要单独查一次引用。
        if document_uses_asset({ 'customPopups': global_popups(database) }, full_asset_id):
            usages.append('全局组合弹窗')
        # 只要还有引用就整体拒绝：不做级联替换，避免把别的仪表盘改坏。
        if usages:
            raise HTTPException(status_code = status.HTTP_409_CONFLICT, detail = { 'code': 'ASSET_IN_USE', 'message': f'图片正在被仪表盘“{"、".join(usages)}”使用，请先替换或移除后再删除。', 'projects': usages })
        # 3D 工作室的草稿不在数据库里，单独读盘检查一次引用。
        studio_draft_path = request.app.state.settings.studio3d_draft_path
        if studio_draft_path.is_file():
            try:
                studio_draft = json.loads(studio_draft_path.read_text(encoding = 'utf-8'))
            except (OSError, json.JSONDecodeError):
                studio_draft = { }
            if document_uses_asset(studio_draft.get('scene', { }), full_asset_id):
                raise HTTPException(status_code = status.HTTP_409_CONFLICT, detail = { 'code': 'ASSET_IN_USE', 'message': '图片正在被户型图绘制使用，请先替换或移除后再删除。' })
        # 先删磁盘文件、再从内存目录摘掉。remove_user 会连带删掉效果变体缓存 ——
        # 变体路径记录只在目录里，摘掉条目后就再也查不到，两件事必须在同一动作里完成。
        path.unlink()
        catalog.remove_user(full_asset_id)
        # 目录非空 / 权限不足时留着即可：这只是顺手清理，不是这一步的目的。
        try:
            path.parent.rmdir()
        except OSError:
            pass
        return Response(status_code = status.HTTP_204_NO_CONTENT)

def read_builtin_asset(relative_path: str, request: Request) -> FileResponse:
    """读取内置素材文件（由 main.py 直接挂到 /assets/builtin/*，不带 /api/v1 前缀）。

    绕过了 api 依赖，因此这里自己再过一次 assets 能力码，否则 403「当前授权状态不允许
    读取该资源。」；素材不存在抛 404「素材不存在。」。
    """
    # 这个入口挂在 /assets/builtin/* 上、不经过 api 依赖，能力码必须在这里自查。
    if not request.app.state.license_service.allows('assets'):
        raise HTTPException(status_code = 403, detail = '当前授权状态不允许读取该资源。')
    match = request.app.state.asset_catalog.builtin_path(relative_path)
    if match is None:
        raise HTTPException(status_code = 404, detail = '素材不存在。')
    response = FileResponse(match)
    # 带 v 参数（内容版本）才允许强缓存；否则要求每次校验，避免旧图被浏览器长期留下。
    set_versioned_private_cache(response, bool(request.query_params.get('v')))
    return response
