'''素材（图片）的目录、上传与读取接口。

路由前缀 /api/v1/assets；另有一个不带前缀的 read_builtin_asset 由 main.py
直接挂载到 /assets/builtin/*。素材分三类：
- builtin: 随发行版打包的内置素材，只读；
- user: 用户上传的图片，落在 user_assets_dir 下，每个素材一个十六进制目录；
- studio3d: 3D 工作室导出的图片，落在 studio3d_exports_dir 下，按文件夹分组。
目录状态由进程内的 AssetCatalog 缓存（单进程部署前提）；
上传的 SVG 先做白名单式清洗再落盘；读取一律带长期缓存头，靠 URL 里的版本参数失效。
'''
from __future__ import annotations
import asyncio
import json
import hashlib
import math
import os
import re
import shutil
import warnings
from xml.etree import ElementTree
from pathlib import Path
from threading import RLock
from time import time
from urllib.parse import quote, unquote
from uuid import uuid4
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from ..dependencies import DatabaseSession, LicensedUser, LicensedViewer, authenticated_short_lived_viewer, licensed_viewer, require_viewer_studio3d_asset, require_viewer_user_asset, viewer_user_asset_ids
from ..panel.documents import parse_document
from ..panel.entity_refs import document_keyed_values
from ..models import Project, ProjectDraft
from ..global_popups import global_popups
from ..streaming import write_stream_in_batches

router = APIRouter(prefix = '/assets', tags = [
    'assets'])
# 内置素材目录里认得的图片后缀，比允许上传的多一个 .gif（动图只读不处理）。
SUPPORTED_IMAGE_SUFFIXES = {
    '.gif',
    '.jpg',
    '.png',
    '.svg',
    '.jpeg',
    '.webp'}
# 允许上传的后缀：排除 gif —— 透明裁剪与效果变体都不支持动图。
UPLOAD_IMAGE_SUFFIXES = {
    '.jpg',
    '.png',
    '.svg',
    '.jpeg',
    '.webp'}
# 后缀到响应 Content-Type 的映射：FileResponse 不会猜类型，必须显式给出。
UPLOAD_CONTENT_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml' }
# 上传图片的硬上限：1000 万像素、单边 8192，挡住解压炸弹式的超大图。
MAX_UPLOAD_PIXELS = 10000000
MAX_UPLOAD_DIMENSION = 8192
# 单次上传请求体的字节上限，**逐块累计**判断（分块传输会让 Content-Length 失效，
# 只信它等于没限）。用十进制 MB（与 MAX_UPLOAD_SVG_BYTES 同口径），因为同一个数字
# 会出现在给用户看的文案里。取值刻意宽于像素上限所允许的最大文件：1000 万像素 ×
# 4 字节原始数据 = 40 MB，PNG 最坏情况也只是「原始数据 + 每行 1 字节过滤字节 +
# zlib 分块开销」，所以在 64 MB 之内 —— 它的目的不是挑图片，而是不让**单个**请求
# 把磁盘写满（修复前这里是 `async for chunk in request.stream(): descriptor.write(chunk)`，
# 没有任何上限，一个请求就能塞满整块盘并连带拖垮 SQLite 与日志）。
MAX_UPLOAD_BYTES = 64 * 1000 * 1000
# SVG 是文本，另限体积与元素数量，避免海量节点把解析与渲染拖垮。
MAX_UPLOAD_SVG_BYTES = 5000000
MAX_UPLOAD_SVG_ELEMENTS = 20000
# 用户素材目录的**总量**上限（B42）：单文件上限只挡得住「一张图」，挡不住「一直传」——
# 反复上传 64 MB 的图就能把盘填满，而盘满之后先坏掉的不是上传接口，是数据库与日志
# （它们写同一块盘）。1 GiB 对家庭部署够放几百张仪表盘图片，同时把上限写进给用户看的
# 文案里，所以和 MAX_UPLOAD_BYTES 一样用十进制 MB 表述。
MAX_USER_ASSET_TOTAL_BYTES = 1000 * 1000 * 1000
# 用量超过这个水位就记一条警告（不自动删任何图片：素材库本来就有「先传进来、以后再用」
# 的用法，未被引用不等于没人要，删它等于把用户的图弄丢）。
USER_ASSET_WARN_BYTES = MAX_USER_ASSET_TOTAL_BYTES * 4 // 5
# 「目录里已经没有合法图片」的空壳目录保留多久再回收。上传是「先建目录、写完临时文件、
# 校验通过后改名」，正在进行的上传长的就是这个样子，因此不能一看见就删。
USER_ASSET_ORPHAN_GRACE_SECONDS = 3600
# 变体缓存里对不上任何现存素材版本的键保留多久再回收（缓存可以随时重算）。
EFFECT_VARIANT_GRACE_SECONDS = 24 * 3600
# 透明裁剪后向外多留 2 像素：避免缩放采样时边缘出现一圈锯齿。
EFFECT_VARIANT_PADDING = 2
# 裁剪后面积几乎等于原图就不生成变体：省下一份没有意义的缓存文件。
EFFECT_VARIANT_MAX_AREA_RATIO = 0.98
# 用户素材 ID 就是 uuid4().hex：用固定长度十六进制做目录名校验，从源头杜绝路径穿越。
ASSET_ID = re.compile('^[0-9a-f]{32}$')
# SVG 与 xlink 命名空间常量：清洗属性/元素时按这两个值做白名单比对。
SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
# CSS 长度语法：可选正负号 + 数字 + 可选单位（px/pt/pc/mm/cm/in），用于解析 width/height。
SVG_LENGTH = re.compile('^\\s*([+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*(px|pt|pc|mm|cm|in)?\\s*$', re.IGNORECASE)
# 取出 CSS 里 url(...) 的引用目标，用于判断样式引用的图片是否安全。
SVG_URL = re.compile('url\\(\\s*([\'\\"]?)(.*?)\\1\\s*\\)', re.IGNORECASE)
# style 文本里明确禁止的写法：@import 能拉外部样式，expression() 与 javascript: 能执行脚本。
SVG_UNSAFE_STYLE = re.compile('(?:@import|expression\\s*\\(|javascript\\s*:|-moz-binding)', re.IGNORECASE)
# 属性值里禁止的协议：脚本协议，以及把 HTML 冒充成图片的 data URL。
SVG_UNSAFE_REFERENCE = re.compile('(?:javascript|vbscript)\\s*:|data\\s*:\\s*text/html', re.IGNORECASE)
# 白名单清洗时整棵摘掉的元素：脚本、动画、外部嵌入与画布。
SVG_BLOCKED_ELEMENTS = {
    'set',
    'audio',
    'embed',
    'video',
    'canvas',
    'iframe',
    'object',
    'script',
    'animate',
    'discard',
    'animatemotion',
    'foreignobject',
    'animatetransform'}
# CSS 单位到像素的换算系数（96 dpi 下的标准换算），'' 表示无单位按 px 处理。
SVG_LENGTH_FACTORS = {
    '': 1,
    'px': 1,
    'pt': 1.33333,
    'pc': 16,
    'mm': 3.77953,
    'cm': 37.7953,
    'in': 96 }
# 固定输出时的命名空间前缀：否则 ElementTree 会写出 ns0: 之类的前缀，前端按标签名取元素会失效。
ElementTree.register_namespace('', SVG_NAMESPACE)
ElementTree.register_namespace('xlink', XLINK_NAMESPACE)

def user_asset_file(root: Path, asset_id: str) -> Path | None:
    """定位某个用户素材目录里唯一的图片文件；目录非法或文件数不为 1 时返回 None。

    参数:
        root: 用户素材根目录。
        asset_id: 32 位十六进制素材 ID。
    """
    # 目录名必须是纯十六进制 ID：先把 ../ 这类构造挡在门口。
    if not ASSET_ID.fullmatch(asset_id):
        return None
    directory = (root / asset_id).resolve()
    # resolve 之后再确认仍在 root 之下：防止符号链接把读取引到目录之外。
    if not directory.is_relative_to(root) or not directory.is_dir():
        return None
    # 一个素材目录应当恰好一个非隐藏图片文件：0 个或多个都算非法（避免歧义）。
    matches = [item for item in directory.iterdir() if item.is_file() and not item.name.startswith('.') and item.suffix.lower() in UPLOAD_IMAGE_SUFFIXES]
    return matches[0] if len(matches) == 1 else None

def user_asset_payload(root: Path, asset_id: str, path: Path, dimensions: tuple[int, int] | None = None) -> dict:
    """把用户素材文件拼成前端使用的 JSON（camelCase 出）。

    dimensions 只在刚上传时已知，列目录时不传，避免为每张图解码。
    """
    stat = path.stat()
    # 版本号取「修改时间纳秒 + 文件大小」：内容一变 URL 就变，浏览器可以长期强缓存。
    version = f'{stat.st_mtime_ns:x}-{stat.st_size:x}'
    payload = {
        'assetId': f'user:{asset_id}',
        'name': path.name,
        'relativePath': f'{asset_id}/{path.name}',
        'folder': '我的图片',
        'source': 'user',
        'size': stat.st_size,
        'version': version,
        'url': f'/api/v1/assets/user/{asset_id}?v={version}' }
    if dimensions:
        (payload['width'], payload['height']) = dimensions
    return payload

def effect_variant_cache_key(full_asset_id: str, version: str) -> str:
    """变体缓存的键：素材 ID 与版本号的哈希。

    生成（:func:`effect_variant_payload`）与回收（:func:`sweep_user_asset_storage`）
    必须用同一个算法 —— 各写一遍的话，巡检算出来的键与生成时不一致，就会把**正在用的**
    变体当成垃圾删掉（表现为运行时渲染悄悄退回整图，或者干脆报缺文件）。
    """
    return hashlib.sha256(f'{full_asset_id}\x00{version}'.encode('utf-8')).hexdigest()


def directory_bytes(directory: Path) -> int:
    """递归统计目录占用的字节数；读不到的条目按 0 计。

    与 ``scene_store.scene_folder_bytes`` 不同：那个只数目录**第一层**的文件（户型快照
    目录是平铺的），而用户素材目录是「一层目录一个素材」，因此必须递归。
    """
    total = 0
    for path in directory.rglob('*'):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def directory_holds_asset(directory: Path) -> bool:
    """目录里是否还有「像素材」的文件 —— 判定刻意放宽，宁可漏收也不删用户的图。

    巡检把「没有素材的目录」当残留回收，因此这个判定是**唯一**的分界线，必须偏保守：
    与 ``user_asset_file`` 的严格判定（恰好一个非隐藏图片文件才有效）不同，这里只要
    目录里还有任何一层存在图片文件就算「有素材」。两者的差别正是事故隐患所在 ——
    比如一个目录里因历史原因留下了两个图片文件（``user_asset_file`` 会判它非法、
    谁也选不中），若照那个判定回收，用户的图片就会被删掉。宁可留着这个目录（它至多
    继续占几 MB），也不能删掉可能还有用的东西。
    """
    for path in directory.rglob('*'):
        try:
            if path.is_file() and not path.name.startswith('.') and path.suffix.lower() in UPLOAD_IMAGE_SUFFIXES:
                return True
        except OSError:
            continue
    return False


def _discard_variant_files(variant_path: Path | None) -> int:
    """删掉一张变体缓存（PNG + 同名 JSON 元数据），返回释放的字节数。

    变体是缓存，删掉最多让它重算一次；查不到路径（没生成过、或已经被清理）返回 0。
    删不掉的条目按 0 计而不是抛错：清理是附加工作，不该让「删素材」这条路径失败。
    """
    if variant_path is None:
        return 0
    released = 0
    for path in (variant_path, variant_path.with_suffix('.json')):
        try:
            size = path.stat().st_size
        except OSError:
            continue
        try:
            path.unlink()
        except OSError:
            continue
        released += size
    return released


def effect_variant_payload(path: Path, full_asset_id: str, version: str, cache_root: Path) -> tuple[dict, Path] | None:
    '''按 alpha 包围盒生成透明裁剪后的 PNG 变体，供运行时渲染器使用。

    原图不动：变体另存到缓存目录，文件名由「素材 ID + 版本号」的哈希决定，
    并附一份同名 JSON 记录裁剪矩形，命中缓存时无需重新解码原图。
    参数:
        path: 原图路径（只支持 PNG / WebP）。
        full_asset_id: 完整素材 ID（如 user:xxx），参与缓存键计算。
        version: 素材版本号，内容变化时缓存键随之变化。
        cache_root: 变体缓存目录。
    返回:
        (变体元数据, 变体文件路径)；不适用或收益不足时返回 None。
    '''
    # 只有 PNG / WebP 能做无损透明裁剪，其它格式直接跳过。
    if path.suffix.lower() not in frozenset({'.png', '.webp'}):
        return None
    # 缓存键 = 素材 ID + 版本号：内容变了键就变，无需主动失效旧文件。
    cache_key = effect_variant_cache_key(full_asset_id, version)
    variant_path = cache_root / f'{cache_key}.png'
    metadata_path = cache_root / f'{cache_key}.json'
    # 命中缓存还要校验元数据自洽：裁剪矩形必须落在原图范围内，否则当作脏缓存重新生成。
    if variant_path.is_file() and metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding = 'utf-8'))
            original_width = int(metadata['originalWidth'])
            original_height = int(metadata['originalHeight'])
            left = int(metadata['cropX'])
            top = int(metadata['cropY'])
            crop_width = int(metadata['width'])
            crop_height = int(metadata['height'])
            # 元数据各项必须为正且裁剪框不越界，否则视为损坏。
            if not (original_width > 0 and original_height > 0 and left >= 0 and top >= 0 and crop_width > 0 and crop_height > 0 and left + crop_width <= original_width and top + crop_height <= original_height):
                raise ValueError('invalid effect variant metadata')
            metadata['url'] = f'/api/v1/assets/effect-variant?assetId={quote(full_asset_id, safe = "")}&v={quote(version, safe = "")}'
            return (metadata, variant_path)
        # 元数据读不出来就当缓存未命中，往下重新生成。
        except (KeyError, TypeError, ValueError, json.JSONDecodeError, OSError):
            pass
    # 解码失败或命中解压炸弹都当作「无法处理」，不让异常冒到路由层。
    try:
        with Image.open(path) as source:
            if getattr(source, 'is_animated', False):
                return None
            rgba = source.convert('RGBA')
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError):
        return None
    (original_width, original_height) = rgba.size
    # 按 alpha 通道求包围盒：空值说明整张全透明，没有可裁剪的内容。
    alpha_bounds = rgba.getchannel('A').getbbox()
    if not alpha_bounds:
        return None
    (left, top, right, bottom) = alpha_bounds
    # 包围盒向外扩一圈，再夹回原图范围内。
    left = max(0, left - EFFECT_VARIANT_PADDING)
    top = max(0, top - EFFECT_VARIANT_PADDING)
    right = min(original_width, right + EFFECT_VARIANT_PADDING)
    bottom = min(original_height, bottom + EFFECT_VARIANT_PADDING)
    crop_width = right - left
    crop_height = bottom - top
    if crop_width <= 0 or crop_height <= 0:
        return None
    # 几乎没裁掉内容：这种「变体」与用原图无异，直接跳过。
    if crop_width * crop_height >= original_width * original_height * EFFECT_VARIANT_MAX_AREA_RATIO:
        return None
    if not variant_path.is_file():
        cache_root.mkdir(parents = True, exist_ok = True, mode = 448)
        # 先写随机名临时文件再 rename：并发读缓存时不会看到半成品。
        temporary_path = cache_root / f'.{cache_key}.{uuid4().hex}.tmp'
        try:
            rgba.crop((left, top, right, bottom)).save(temporary_path, format = 'PNG', optimize = True)
            # 0o600：缓存图属于用户的私有素材，权限与用户素材目录保持一致。
            temporary_path.chmod(384)
            temporary_path.replace(variant_path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()
    # 裁剪信息单独落盘：命中缓存时不必重新解码原图就能给出缩放参数。
    metadata = {
        'originalWidth': original_width,
        'originalHeight': original_height,
        'cropX': left,
        'cropY': top,
        'width': crop_width,
        'height': crop_height }
    cache_root.mkdir(parents = True, exist_ok = True, mode = 448)
    temporary_metadata_path = cache_root / f'.{cache_key}.{uuid4().hex}.json.tmp'
    try:
        temporary_metadata_path.write_text(json.dumps(metadata, ensure_ascii = False, separators = (',', ':')), encoding = 'utf-8')
        temporary_metadata_path.chmod(384)
        temporary_metadata_path.replace(metadata_path)
    finally:
        if temporary_metadata_path.exists():
            temporary_metadata_path.unlink()
    payload = {
        'url': f'/api/v1/assets/effect-variant?assetId={quote(full_asset_id, safe = "")}&v={quote(version, safe = "")}',
        **metadata }
    return (payload, variant_path)

def studio3d_export_metadata(folder: Path) -> tuple[dict[str, str], dict[str, int]]:
    """读取 3D 工作室导出文件夹里的 lights.json 清单。

    返回:
        (文件名 → 角色, 文件名 → 导出顺序)；清单缺失或损坏时返回两个空字典，
        此时素材仍会被列出，只是角色与排序退化为默认值。
    """
    manifest_path = folder / 'lights.json'
    # 没有清单就当没有角色信息，不影响图片本身的列出与访问。
    if not manifest_path.is_file():
        return ({ }, { })
    try:
        manifest = json.loads(manifest_path.read_text(encoding = 'utf-8'))
        roles = { }
        # 清单字段名到角色名的映射，与 3D 工作室的导出约定死，改一边就要改另一边。
        for key, role in (('floorPlanImage', 'floor-plan'), ('backgroundImage', 'background'), ('baseImage', 'background-with-plan')):
            filename = manifest.get(key)
            if not isinstance(filename, str):
                continue
            if not filename:
                continue
            roles[filename] = role
        for key, role in (('televisionOnImages', 'television'), ('vehicleChargingImages', 'vehicle')):
            for filename in manifest.get(key) or []:
                if not isinstance(filename, str):
                    continue
                if not filename:
                    continue
                roles[filename] = role
        # exportedFiles 的顺序即导出顺序，用于同一文件夹内的稳定排序。
        order = {filename: index for index, filename in enumerate(manifest.get('exportedFiles') or []) if isinstance(filename, str) and filename}
    except (OSError, json.JSONDecodeError):
        return ({ }, { })
    return (roles, order)

def studio3d_export_payload(folder_name: str, path: Path, role: str = '', export_order: int | None = None) -> dict:
    """把 3D 工作室导出的图片拼成前端使用的 JSON（assetId 前缀为 studio3d:）。"""
    stat = path.stat()
    version = f'{stat.st_mtime_ns:x}-{stat.st_size:x}'
    payload = {
        'assetId': f'studio3d:{folder_name}/{path.name}',
        'name': path.name,
        'relativePath': f'exports/{folder_name}/{path.name}',
        'folder': folder_name,
        'source': 'studio3d-export',
        'size': stat.st_size,
        'version': version,
        'url': f'/api/v1/assets/studio3d-export/{quote(folder_name, safe = "")}/{quote(path.name, safe = "")}?v={version}' }
    # 角色与顺序只在实际取到值时才带上，前端据此排序并挑选默认底图。
    if role:
        payload['exportRole'] = role
    if export_order is not None:
        payload['exportOrder'] = export_order
    return payload

def user_asset_sort_key(item: dict) -> tuple[str, int, int, str]:
    """用户素材的展示排序键：目录 → 3D 角色 → 导出顺序 → 名称。

    3D 导出的图片要按固定角色顺序排在前面（电视、车辆、户型图、底图…），
    其余素材统一落到最后一档。
    """
    name = str(item.get('name', ''))
    base_name = Path(name).stem
    # 3D 导出图的固定角色顺序：电视、车辆、户型图、底图、带户型底图。
    studio3d_role_order = {
        'television': 0,
        'vehicle': 1,
        'floor-plan': 2,
        'background': 3,
        'background-with-plan': 4 }
    # 清单缺失时按文件名里的中文关键词兜底猜角色，兼容手工放进导出目录的图片。
    if '电视' in base_name:
        fallback_role = 'television'
    elif '汽车' in base_name or '车辆' in base_name:
        fallback_role = 'vehicle'
    elif base_name == '00户型图':
        fallback_role = 'floor-plan'
    elif base_name == '00底图':
        fallback_role = 'background'
    elif base_name == '00底图带户型':
        fallback_role = 'background-with-plan'
    else:
        fallback_role = ''
    # 优先用清单里写明的角色，没有才用猜出来的兜底值。
    role = str(item.get('exportRole') or fallback_role)
    priority = studio3d_role_order.get(role, 5) if item.get('source') == 'studio3d-export' else 5
    # 未在清单里排序的图片排在最后：1000000 是哨兵大数，保证稳定且可读。
    export_order = item.get('exportOrder')
    user_order = export_order if isinstance(export_order, int) else 1000000
    return (str(item.get('folder', '')).casefold(), priority, user_order, name.casefold())

def studio3d_export_file(root: Path, folder_name: str, filename: str) -> Path | None:
    """校验并解析 3D 导出图片的路径；任何可疑输入都返回 None（路由层转成 404）。

    只接受单层、不以点开头的目录名与文件名，且后缀必须是 PNG / WebP。
    """
    if not folder_name or folder_name in frozenset({'.', '..'}) or Path(folder_name).name != folder_name or folder_name.startswith('.') or not filename or filename in frozenset({'.', '..'}) or Path(filename).name != filename or filename.startswith('.') or Path(filename).suffix.lower() not in frozenset({'.png', '.webp'}):
        return None
    # 目录名与文件名先做单层校验，resolve 后再确认仍在 root 之下：双重防路径穿越。
    folder = (root / folder_name).resolve()
    path = (folder / filename).resolve()
    if not (folder.is_relative_to(root) and path.is_relative_to(folder) and path.is_file()):
        return None
    return path

def xml_local_name(value: str) -> str:
    """取 XML 名称的本地部分（去掉 {namespace} 前缀）并统一小写。"""
    # 统一小写后就能按元素/属性名直接与白名单比较，不受大小写写法影响。
    return value.rsplit('}', 1)[-1].lower()

def svg_reference_is_safe(value: str) -> bool:
    """判断 SVG 里的一处引用是否安全。

    只放行两类：文档内部的片段引用（#id），以及内联的 data:image/*;base64 位图。
    """
    normalized = value.strip()
    # 片段引用（渐变、滤镜等内部 id）永远安全。
    if normalized.startswith('#'):
        return True
    # 其余引用（http、file、其它 data:）一律拒绝，避免外链与脚本注入。
    if not normalized.lower().startswith('data:image/'):
        return False
    # 11 是 'data:image/' 的长度：取出媒体子类型再核对白名单，并要求确实是 base64。
    media_type = normalized[11:].split(';', 1)[0].lower()
    return media_type in frozenset({'gif', 'jpg', 'png', 'jpeg', 'webp'}) and ';base64,' in normalized.lower()

def svg_style_is_safe(value: str) -> bool:
    """判断一段 CSS 文本是否安全：先过黑名单，再逐个检查 url(...) 引用。"""
    if SVG_UNSAFE_STYLE.search(value):
        return False
    return all((svg_reference_is_safe(match.group(2)) for match in SVG_URL.finditer(value)))

def parse_svg_length(value: str | None) -> float | None:
    """把 SVG 的长度字符串解析成像素值；非法、非有限或非正数返回 None。"""
    if not value:
        return None
    match = SVG_LENGTH.fullmatch(value)
    if match is None:
        return None
    number = float(match.group(1))
    if not math.isfinite(number) or number <= 0:
        return None
    return number * SVG_LENGTH_FACTORS[(match.group(2) or '').lower()]

def svg_dimensions(root: ElementTree.Element) -> tuple[int, int]:
    """推断 SVG 的像素尺寸：优先 width/height，缺失时按 viewBox 补算。

    三者都缺失时回落到规范里 <image> 的默认 300x150。
    尺寸超过上传上限时抛 ValueError（原文案为中文，直接给用户看）。
    """
    view_box = None
    raw_view_box = root.attrib.get('viewBox') or root.attrib.get('viewbox')
    if raw_view_box:
        try:
            parts = [float(part) for part in re.split('[\\s,]+', raw_view_box.strip()) if part]
        except ValueError:
            parts = []
        # viewBox 必须是四个有限数且宽高为正，否则视为无效。
        if len(parts) == 4 and all((math.isfinite(part) for part in parts)) and parts[2] > 0 and parts[3] > 0:
            view_box = (parts[2], parts[3])
    # 只缺一边时按 viewBox 比例补出另一边。
    width = parse_svg_length(root.attrib.get('width'))
    height = parse_svg_length(root.attrib.get('height'))
    if width is None and height is not None and view_box:
        width = height * view_box[0] / view_box[1]
    elif height is None and width is not None and view_box:
        height = width * view_box[1] / view_box[0]
    elif width is None and height is None and view_box:
        (width, height) = view_box
    # 两边都拿不到时用默认尺寸，保证后续按像素做上限校验始终有值可比。
    if width is None or height is None:
        (width, height) = (300, 150)
    dimensions = (max(1, round(width)), max(1, round(height)))
    # 声明尺寸同样要过上传上限：不能靠放大 viewBox 把超大图塞进来。
    if dimensions[0] > MAX_UPLOAD_DIMENSION or dimensions[1] > MAX_UPLOAD_DIMENSION or dimensions[0] * dimensions[1] > MAX_UPLOAD_PIXELS:
        raise ValueError('图片像素尺寸过大，请压缩后重试。')
    return dimensions

def validate_and_sanitize_uploaded_svg(path: Path) -> tuple[int, int]:
    """校验并就地清洗上传的 SVG，返回其像素尺寸。

    清洗策略是白名单：只保留 SVG/xlink 命名空间下的安全元素与属性，
    摘掉脚本、动画、外部嵌入，去掉 on* 事件属性与危险引用，
    最后把清洗后的内容覆盖回原文件。
    任何一项不合规都抛 ValueError，文案为中文，可直接返回给用户。
    """
    # 三道体积/结构闸门都放在解析之前，避免把超大 XML 读进内存。
    if path.stat().st_size > MAX_UPLOAD_SVG_BYTES:
        raise ValueError('SVG 文件过大，请精简后重试。')
    source = path.read_bytes()
    lowered = source.lower()
    # 一律拒绝 DOCTYPE 与 ENTITY：这是 XXE 与实体展开炸弹的入口。
    if b'<!doctype' in lowered or b'<!entity' in lowered:
        raise ValueError('SVG 不允许包含文档类型或实体声明。')
    # 解析失败即文件损坏或并非 XML，统一转成中文错误文案。
    try:
        root = ElementTree.fromstring(source)
    except ElementTree.ParseError as error:
        raise ValueError('SVG 文件已损坏或无法解析。') from error
    # 根元素必须是 svg：扩展名可以随便改，内容骗不过这一关。
    if xml_local_name(root.tag) != 'svg':
        raise ValueError('图片内容与文件扩展名不一致。')
    # 一次性列出所有节点：既用于数量闸门，也供后面的遍历清洗复用。
    elements = list(root.iter())
    if len(elements) > MAX_UPLOAD_SVG_ELEMENTS:
        raise ValueError('SVG 元素数量过多，请精简后重试。')
    for parent in elements:
        # 白名单式清洗：命名空间不在白名单、或元素在黑名单里的，整棵子树摘掉。
        for child in list(parent):
            namespace = child.tag[1:].split('}', 1)[0] if isinstance(child.tag, str) and child.tag.startswith('{') else ''
            if namespace not in {
                '',
                SVG_NAMESPACE} or xml_local_name(child.tag) in SVG_BLOCKED_ELEMENTS:
                parent.remove(child)
    for element in root.iter():
        # style 文本里可能藏 @import / expression()：不安全就把内容清空而不是删元素（保留选择器结构没意义，但更保险）。
        if xml_local_name(element.tag) == 'style':
            if not svg_style_is_safe(element.text or ''):
                element.text = ''
        for attribute, value in list(element.attrib.items()):
            local_name = xml_local_name(attribute)
            namespace = attribute[1:].split('}', 1)[0] if attribute.startswith('{') else ''
            # on* 事件属性与未知命名空间的属性一律删除。
            if local_name.startswith('on') or namespace not in {
                '',
                XLINK_NAMESPACE}:
                del element.attrib[attribute]
                continue
            # 命中脚本协议或 HTML data URL 的属性直接删掉。
            if SVG_UNSAFE_REFERENCE.search(value):
                del element.attrib[attribute]
                continue
            # 图片引用只能是内部片段或内联位图，不安全的删除该属性。
            if local_name in frozenset({'src', 'href'}) and not svg_reference_is_safe(value):
                del element.attrib[attribute]
                continue
            # 只有带 url(...) 或本身就是 style 的属性才需要深度检查，其余已经足够安全。
            if 'url(' not in value.lower() and local_name != 'style':
                continue
            if svg_style_is_safe(value):
                continue
            del element.attrib[attribute]
    dimensions = svg_dimensions(root)
    # 用清洗后的树覆盖原文件：之后所有读取（含目录扫描）拿到的都是安全版本。
    path.write_bytes(ElementTree.tostring(root, encoding = 'utf-8', xml_declaration = True))
    return dimensions

def validate_uploaded_image(suffix: str, path: Path) -> tuple[int, int]:
    """校验刚上传的图片文件，返回其像素尺寸；不合法时抛 ValueError。

    SVG 走清洗流程，位图则核对真实格式与像素上限。
    所有 ValueError 的文案都是中文，可直接作为 422 的 detail 返回。
    """
    if suffix == '.svg':
        return validate_and_sanitize_uploaded_svg(path)
    # 后缀与真实格式必须一致：把 .png 改名成 .jpg 这类伪装要在这里挡住。
    expected_format = {
        '.png': 'PNG',
        '.jpg': 'JPEG',
        '.jpeg': 'JPEG',
        '.webp': 'WEBP' }[suffix]
    try:
        # 把 Pillow 的「解压炸弹」警告升级成异常，才能与其它解码错误一并处理。
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.format != expected_format:
                    raise ValueError('图片内容与文件扩展名不一致。')
                (width, height) = image.size
                # 与上传常量共用同一套上限，SVG 与位图口径保持一致。
                if width <= 0 or height <= 0 or width > MAX_UPLOAD_DIMENSION or height > MAX_UPLOAD_DIMENSION or width * height > MAX_UPLOAD_PIXELS:
                    raise ValueError('图片像素尺寸过大，请压缩后重试。')
                image.load()
                return (width, height)
    except ValueError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as error:
        raise ValueError('图片文件已损坏或无法完整解码。') from error

class AssetCatalog:
    '''进程内的素材目录缓存。

    前提：客户部署只有一个 app 进程，因此可以把目录状态放在内存里、
    用 RLock 保护并发访问，不需要引入 Redis 之类的共享缓存。
    内容变更后对应 revision 会换成新的随机值，前端据此判断是否重新拉列表。
    '''

    def __init__(self, built_in_root: Path, user_root: Path, studio3d_exports_root: Path | None = None, effect_variants_root: Path | None = None) -> None:
        """记录各素材根目录并统一转成绝对路径。

        参数:
            built_in_root: 内置素材根目录（随仓库分发，只读）。
            user_root: 用户上传素材根目录（可写）。
            studio3d_exports_root: 3D 工作室导出物根目录；None 表示不使用。
            effect_variants_root: 特效变体缓存根目录；None 时默认落在用户素材的
                同级 cache/effect-variants 下。
        """
        self.built_in_root = built_in_root.resolve()
        self.user_root = user_root.resolve()
        self.studio3d_exports_root = studio3d_exports_root.resolve() if studio3d_exports_root else None
        self.effect_variants_root = effect_variants_root.resolve() if effect_variants_root else self.user_root.parent / 'cache' / 'effect-variants'
        # 目录的读写都在这把锁下进行：上传/删除与列表读取并发时不会读到半更新状态。
        self.mutation_lock = RLock()
        # 懒加载标记：首次访问才扫盘，避免应用启动时就遍历素材目录。
        self._builtin_loaded = False
        self._user_loaded = False
        self._builtin_items = { }
        self._builtin_paths = { }
        self._user_items = { }
        self._effect_variant_paths = { }
        # 版本戳用随机值而非递增数字：进程重启后必然变化，前端不会误用旧缓存。
        self._builtin_revision = uuid4().hex
        self._user_revision = uuid4().hex

    def _attach_effect_variant(self, payload: dict, path: Path) -> None:
        """给素材条目附加效果变体信息（失败就静默跳过）。

        变体是可选增强字段，生成失败不影响素材本身的使用。
        """
        try:
            generated = effect_variant_payload(path, str(payload['assetId']), str(payload['version']), self.effect_variants_root)
            if generated is None:
                return None
            (metadata, variant_path) = generated
            payload['effectVariant'] = metadata
            self._effect_variant_paths[str(payload['assetId'])] = variant_path
        # 生成变体失败（IO 错误等）不影响主流程：少一个可选字段而已。
        except OSError:
            return None

    def _load_builtin(self) -> None:
        """懒加载内置素材目录，建立 assetId → 条目与相对路径 → 文件路径两张索引。"""
        with self.mutation_lock:
            # 双检：多线程同时首次访问时，后到的直接返回。
            if self._builtin_loaded:
                return None
            for path in self.built_in_root.rglob('*'):
                if not path.is_file() or path.name.startswith('.') or path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
                    continue
                resolved = path.resolve()
                if not resolved.is_relative_to(self.built_in_root):
                    continue
                # 路径统一成 POSIX 形式：它要拼进 assetId 与 URL，必须跨平台稳定。
                relative_path = resolved.relative_to(self.built_in_root).as_posix()
                try:
                    stat = resolved.stat()
                except OSError:
                    continue
                version = f'{stat.st_mtime_ns:x}-{stat.st_size:x}'
                asset_id = f'builtin:{relative_path}'
                payload = {
                    'assetId': asset_id,
                    'name': path.name,
                    'relativePath': relative_path,
                    'folder': resolved.parent.relative_to(self.built_in_root).as_posix() or '.',
                    'source': 'builtin',
                    'version': version,
                    'url': '/assets/builtin/' + '/'.join(relative_path.split('/')) + f'?v={version}' }
                self._attach_effect_variant(payload, resolved)
                self._builtin_items[asset_id] = payload
                self._builtin_paths[relative_path] = resolved
            self._builtin_loaded = True

    def _load_user(self) -> None:
        """懒加载用户素材目录，同时把 3D 工作室的导出图片并进同一份索引。

        两类素材的 assetId 前缀不同（user: / studio3d:），因此在同一字典里不会冲突。
        """
        with self.mutation_lock:
            if self._user_loaded:
                return None
            for directory in self.user_root.iterdir():
                path = user_asset_file(self.user_root, directory.name)
                if path is None:
                    continue
                try:
                    payload = user_asset_payload(self.user_root, directory.name, path)
                    self._attach_effect_variant(payload, path)
                    self._user_items[f'user:{directory.name}'] = payload
                except OSError:
                    continue
            if self.studio3d_exports_root and self.studio3d_exports_root.is_dir():
                for folder in self.studio3d_exports_root.iterdir():
                    if not folder.is_dir() or folder.name.startswith('.'):
                        continue
                    # 每个导出文件夹只读一次清单，拿到角色与排序，避免逐文件读盘。
                    (export_roles, export_order) = studio3d_export_metadata(folder)
                    for path in folder.iterdir():
                        if not path.is_file() or path.name.startswith('.') or path.suffix.lower() not in frozenset({'.png', '.webp'}):
                            continue
                        try:
                            payload = studio3d_export_payload(folder.name, path, export_roles.get(path.name, ''), export_order.get(path.name))
                        except OSError:
                            continue
                        self._attach_effect_variant(payload, path)
                        self._user_items[payload['assetId']] = payload
            # 标记加载完成：之后的新增/删除由注册接口直接改内存字典，不再扫盘。
            self._user_loaded = True

    def versions(self) -> dict[str, str]:
        """返回内置与用户素材目录的版本戳，前端据此判断是否需要重新拉列表。"""
        self._load_builtin()
        self._load_user()
        return {
            'builtin': self._builtin_revision,
            'user': self._user_revision }

    def builtin_items(self) -> list[dict]:
        """列出全部内置素材（副本，按目录 + 名称排序）。"""
        self._load_builtin()
        with self.mutation_lock:
            items = [dict(item) for item in self._builtin_items.values()]
        # 名称做 casefold 再比较，避免大小写影响展示顺序。
        items.sort(key = lambda item: (item['folder'], item['name'].casefold()))
        return items

    def user_items(self) -> list[dict]:
        """列出全部用户素材（含 3D 导出），顺带清理磁盘上已消失的条目。

        清理只在真的删掉条目时才换版本戳，否则轮询这个接口会不断触发前端重拉。
        """
        self._load_user()
        with self.mutation_lock:
            # 磁盘文件被手工删掉时，下一次列表读取就把它从缓存里剔除。
            stale_ids = []
            for asset_id, item in self._user_items.items():
                if item.get('source') == 'user':
                    raw_id = asset_id.removeprefix('user:')
                    if user_asset_file(self.user_root, raw_id) is not None:
                        continue
                elif item.get('source') == 'studio3d-export':
                    raw_path = asset_id.removeprefix('studio3d:')
                    (folder_name, separator, filename) = raw_path.partition('/')
                    if separator and self.studio3d_exports_root is not None and studio3d_export_file(self.studio3d_exports_root, folder_name, filename) is not None:
                        continue
                else:
                    continue
                stale_ids.append(asset_id)
            # 只有确实清理了内容才换版本戳，避免无谓地让前端重新拉取。
            if stale_ids:
                for asset_id in stale_ids:
                    self._user_items.pop(asset_id, None)
                self._user_revision = uuid4().hex
            items = [dict(item) for item in self._user_items.values()]
        # 排序规则见 user_asset_sort_key：目录优先，再按 3D 角色与导出顺序。
        items.sort(key = user_asset_sort_key)
        return items

    def builtin_path(self, relative_path: str) -> Path | None:
        """把内置素材的相对路径换成磁盘路径；未收录的返回 None。"""
        self._load_builtin()
        normalized = relative_path.strip('/')
        with self.mutation_lock:
            return self._builtin_paths.get(normalized)

    def asset_exists(self, asset_id: str) -> bool:
        """判断素材 ID 是否在目录里；user: 与 studio3d: 都查用户侧索引。"""
        # 三类素材的可见性规则不同；studio3d 走到最后的 effect_variant_path 兜底（不存在即 404）。
        if asset_id.startswith('user:'):
            self._load_user()
            with self.mutation_lock:
                return asset_id in self._user_items
        if asset_id.startswith('builtin:'):
            self._load_builtin()
            with self.mutation_lock:
                return asset_id in self._builtin_items
        if asset_id.startswith('studio3d:'):
            self._load_user()
            with self.mutation_lock:
                return asset_id in self._user_items
        return False

    def register_user(self, asset_id: str, path: Path, dimensions: tuple[int, int]) -> dict:
        """把刚上传成功的用户素材登记进内存目录，并返回它的对外条目。"""
        self._load_user()
        payload = user_asset_payload(self.user_root, asset_id, path, dimensions)
        self._attach_effect_variant(payload, path)
        with self.mutation_lock:
            self._user_items[payload['assetId']] = payload
            self._user_revision = uuid4().hex
        return dict(payload)

    def register_studio3d_export(self, folder_name: str, path: Path) -> dict:
        """把 3D 工作室刚导出的图片登记进内存目录，并返回它的对外条目。"""
        self._load_user()
        (export_roles, export_order) = studio3d_export_metadata(path.parent)
        payload = studio3d_export_payload(folder_name, path, export_roles.get(path.name, ''), export_order.get(path.name))
        self._attach_effect_variant(payload, path)
        with self.mutation_lock:
            self._user_items[payload['assetId']] = payload
            self._user_revision = uuid4().hex
        return dict(payload)

    def remove_user(self, full_asset_id: str) -> int:
        """从内存目录里摘掉一个用户素材，同时删掉它的效果变体缓存，返回释放的字节数。

        两件事必须同一个动作里做完（B42）：变体的路径记录就在下面这张表里，先摘条目的话
        路径就再也查不到了 —— 缓存文件会永远留在这块盘上，谁也看不见、谁也删不掉。
        合成一个动作，调用方就没有「先调哪个」这种可以搞错的余地。
        """
        self._load_user()
        with self.mutation_lock:
            variant_path = self._effect_variant_paths.pop(full_asset_id, None)
            self._user_items.pop(full_asset_id, None)
            self._user_revision = uuid4().hex
        return _discard_variant_files(variant_path)

    def remove_studio3d_folder(self, folder_name: str) -> None:
        """按前缀摘掉某个 3D 导出文件夹下的全部素材。"""
        self._load_user()
        prefix = f'studio3d:{folder_name}/'
        with self.mutation_lock:
            removed_ids = [asset_id for asset_id in self._user_items if asset_id.startswith(prefix)]
            for asset_id in removed_ids:
                self._user_items.pop(asset_id, None)
                self._effect_variant_paths.pop(asset_id, None)
            # 一个都没删到就不换版本戳，避免让前端白重拉一次。
            if removed_ids:
                self._user_revision = uuid4().hex

    def effect_variant_path(self, asset_id: str) -> Path | None:
        """给出某素材效果变体的磁盘路径；没有变体或文件已被清理时返回 None。"""
        self._load_builtin()
        self._load_user()
        with self.mutation_lock:
            path = self._effect_variant_paths.get(asset_id)
        # 缓存文件可能被外部清理掉，因此这里再确认一次存在性。
        return path if path is not None and path.is_file() else None

    def user_asset_bytes(self) -> int:
        """用户素材目录当前占用的字节数（含尚未改名的临时文件）。

        直接扫盘，不维护累加计数：手工删文件、上传中断、外部工具都改得动这个目录，计数一旦
        漂移配额就失效（少算 → 盘被填满；多算 → 用户明明删了却传不上去）。代价是每次上传
        前多一次目录遍历，而上传本来就要做一次完整的图片解码。
        """
        return directory_bytes(self.user_root) if self.user_root.is_dir() else 0

    def effect_variant_keys(self) -> set[str]:
        """现存素材版本对应的变体缓存键，供巡检判断缓存里哪些文件是孤儿。

        只列「当前版本」的键：版本变了旧键就作废（URL 里带版本号，旧变体没有任何人再请求）。
        """
        return {
            effect_variant_cache_key(str(item.get('assetId') or ''), str(item.get('version') or ''))
            for item in self.user_items()
        }

def referenced_user_asset_ids(database, studio3d_draft_path: Path) -> set[str]:
    """此刻仍被引用的用户素材 ID（不含 ``user:`` 前缀）集合。

    引用来源有三处，缺一处就会把在用的图片当成没人要的：项目草稿文档、全局组合弹窗
    （独立于项目存放）、3D 户型草稿（不在数据库里，单独读盘）。

    键名扫描复用 :func:`panel.entity_refs.document_keyed_values`，与「哪些实体 / 场景
    还有人用」是同一套启发式（前端加字段不用改这里）；不另写一份递归扫描，是因为
    「同一个约束有第二个主人」正是上一批吃过的教训。
    """
    def is_user_asset(value: str) -> bool:
        """只收用户上传的图片：内置素材不会出现在这个目录里。"""
        return value.startswith('user:')

    referenced: set[str] = set()
    for document_json in database.scalars(select(ProjectDraft.document_json)):
        # 损坏的草稿跳过：它的读取路径自会报错，不该连累巡检（与删素材同一口径）。
        document = parse_document(document_json)
        if document is None:
            continue
        referenced.update(
            value.removeprefix('user:')
            for value in document_keyed_values(document, 'assetId', keep = is_user_asset)
        )
    referenced.update(
        value.removeprefix('user:')
        for value in document_keyed_values({'customPopups': global_popups(database)}, 'assetId', keep = is_user_asset)
    )
    if studio3d_draft_path.is_file():
        try:
            studio_draft = json.loads(studio3d_draft_path.read_text(encoding = 'utf-8'))
        except (OSError, json.JSONDecodeError):
            studio_draft = { }
        referenced.update(
            value.removeprefix('user:')
            for value in document_keyed_values(studio_draft.get('scene', { }), 'assetId', keep = is_user_asset)
        )
    return referenced


def sweep_user_asset_storage(
    root: Path,
    variants_root: Path,
    active_variant_keys: set[str],
    *,
    now: float | None = None,
    orphan_grace: int = USER_ASSET_ORPHAN_GRACE_SECONDS,
    variant_grace: int = EFFECT_VARIANT_GRACE_SECONDS,
) -> dict[str, int]:
    """回收用户素材目录里那些**看不见的**残留，返回本轮统计。

    只收两类「谁也选不中、谁也删不掉」的东西：

    1. **空壳目录 / 散落文件**：目录里已经没有合法图片（上传中断留下的临时文件、被手工
       删掉的文件、崩溃残留）。它们不会出现在素材列表里（``user_asset_file`` 返回 None），
       因此用户根本没有办法意识到它们占着盘，更没有办法删掉它们；
    2. **对不上任何现存素材版本的变体缓存**：素材已删、或版本已变（版本号进缓存键），
       这些文件是纯缓存，删掉最多重算一次。

    **刻意不回收「没有被引用的图片」**：素材库本来就有「先传进来、以后再用」的用法，
    未被引用不等于没人要 —— 删它等于把用户的图片弄丢，这与户型快照不同（快照没人引用就
    真的没人再会打开）。未被引用的用量改为在 :func:`sweep_user_assets_for_app` 里报出来，
    由人来决定删不删。

    参数:
        root: 用户素材根目录。
        variants_root: 效果变体缓存目录。
        active_variant_keys: 现存素材版本对应的缓存键（见 ``AssetCatalog.effect_variant_keys``）。
        now: 当前时间戳（秒，便于测试注入）；默认取系统时间。
        orphan_grace: 空壳目录保留多久再回收。
        variant_grace: 孤儿缓存文件保留多久再回收。

    返回:
        ``{'directories': 回收的空壳目录数, 'files': 回收的散落文件数,
        'variants': 回收的缓存文件数, 'released': 释放的字节数, 'kept': 未动的条目数}``。
    """
    moment = time() if now is None else now
    stats = {'directories': 0, 'files': 0, 'variants': 0, 'released': 0, 'kept': 0}
    # 先归一成绝对路径：``user_asset_file`` 内部会 resolve 再判「还在根目录之下」，
    # 根目录自己带符号链接（如 macOS 的 /var → /private/var）时两边口径必须一致，
    # 否则每个素材目录都会被判成非法目录 —— 而这里的判定后果是**删掉它**。
    root = root.resolve()
    if root.is_dir():
        for entry in sorted(root.iterdir()):
            if entry.is_dir() and not entry.is_symlink():
                # 还有图片文件的目录一律不动：它是不是「没人用」不由这里判断（见函数说明），
                # 而「目录里到底还有没有东西」用的是放宽的判定（见 directory_holds_asset）。
                if directory_holds_asset(entry):
                    stats['kept'] += 1
                    continue
                counter = 'directories'
            else:
                # 根目录下不该有任何散落文件（临时文件名都在素材目录内），一律按残留处理。
                counter = 'files'
            try:
                modified = entry.stat().st_mtime
            except OSError:
                continue
            if moment - modified <= orphan_grace:
                # 没到宽限期：可能是正在进行中的上传（先建目录、写完临时文件才改名）。
                stats['kept'] += 1
                continue
            stats['released'] += directory_bytes(entry) if entry.is_dir() else entry.stat().st_size
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors = True)
            else:
                try:
                    entry.unlink()
                except OSError:
                    pass
            # 以「真的不在了」判定回收成功：删不掉（权限 / 占用）时不能算成已回收，
            # 否则统计会骗人（这里与户型快照巡检同一口径）。
            if entry.exists():
                stats['kept'] += 1
            else:
                stats[counter] += 1
    if variants_root.is_dir():
        for path in sorted(variants_root.iterdir()):
            if not path.is_file() or path.name.startswith('.'):
                continue
            # 键是文件名去掉后缀：``<key>.png`` 与它的 ``<key>.json`` 元数据同名不同后缀。
            if path.stem in active_variant_keys:
                stats['kept'] += 1
                continue
            try:
                info = path.stat()
            except OSError:
                continue
            if moment - info.st_mtime <= variant_grace:
                stats['kept'] += 1
                continue
            try:
                path.unlink()
            except OSError:
                stats['kept'] += 1
                continue
            stats['released'] += info.st_size
            stats['variants'] += 1
    return stats


def sweep_user_assets_for_app(app) -> dict[str, int]:
    """请求路径 / 启动流程用的薄封装：自己开短会话算引用关系，再巡检并汇总用量。

    顺带把「该由人来看一眼」的两件事写进全局日志：用量过水位、以及存在没有任何仪表盘
    引用的图片（给出张数与字节）。不自动删它们，理由见 :func:`sweep_user_asset_storage`。
    """
    root = app.state.settings.user_assets_dir
    variants_root = app.state.asset_catalog.effect_variants_root
    with app.state.database.session_factory() as database:
        referenced = referenced_user_asset_ids(database, app.state.settings.studio3d_draft_path)
        items = app.state.asset_catalog.user_items()
    active_keys = app.state.asset_catalog.effect_variant_keys()
    stats = sweep_user_asset_storage(root, variants_root, active_keys)
    used_bytes = app.state.asset_catalog.user_asset_bytes()
    if stats['released']:
        app.state.global_log.append(
            'info', '系统后台', '存储',
            f'用户素材巡检：回收空壳目录 {stats["directories"]} 个、散落文件 {stats["files"]} 个、'
            f'孤儿变体 {stats["variants"]} 个，释放 {stats["released"] / 1048576:.1f} MiB。',
        )
    # 「未被引用」的用量单独算：这是唯一一类「用户看得见、但不知道该不该删」的占用。
    unused_bytes = sum(
        int(item.get('size') or 0)
        for item in items
        if str(item.get('assetId') or '').removeprefix('user:') not in referenced
    )
    if used_bytes > USER_ASSET_WARN_BYTES:
        app.state.global_log.append(
            'warning', '系统后台', '存储',
            f'用户素材目录已占用 {used_bytes / 1048576:.0f} MiB（超过上限的 '
            f'{USER_ASSET_WARN_BYTES * 100 // MAX_USER_ASSET_TOTAL_BYTES}%，'
            f'上限 {MAX_USER_ASSET_TOTAL_BYTES / 1000000:.0f} MB）；'
            f'其中没有任何仪表盘引用的图片约 {unused_bytes / 1048576:.0f} MiB，'
            '请在素材库中删除不再需要的图片。',
        )
    return {**stats, 'usedBytes': used_bytes, 'unusedBytes': unused_bytes}


def document_uses_asset(value, asset_id: str) -> bool:
    """递归判断一份文档（任意嵌套的 dict/list）里是否引用了指定素材 ID。

    只看值不看键名，用于删除素材前的引用检查。
    """
    if isinstance(value, dict):
        return any((document_uses_asset(item, asset_id) for item in value.values()))
    if isinstance(value, list):
        return any((document_uses_asset(item, asset_id) for item in value))
    # 递归到标量再比较：不关心键名，只关心文档里有没有引用这个 ID。
    return value == asset_id

@router.get('/builtin')
def list_builtin_assets(request: Request, _viewer: LicensedViewer) -> dict:
    """列出全部内置素材。

    身份与能力码：LicensedViewer（认证 + api），另需授权允许 assets，
    否则 403 LICENSE_RESTRICTED「当前授权不允许读取素材。」。
    """
    # 内置素材虽是发行版内容，读取同样受 assets 能力码约束。
    if not request.app.state.license_service.allows('assets'):
        raise HTTPException(status_code = 403, detail = { 'code': 'LICENSE_RESTRICTED', 'message': '当前授权不允许读取素材。' })
    items = request.app.state.asset_catalog.builtin_items()
    versions = request.app.state.asset_catalog.versions()
    return {
        'items': items,
        'total': len(items),
        'catalogVersion': versions['builtin'] }

@router.get('/user')
def list_user_assets(request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    """列出用户素材（含 3D 导出）。

    中控设备身份只会看到自己仪表盘文档里引用过的图片；管理员不受限。
    返回 {items, total, maxUploadPixels, usageBytes, maxTotalBytes, catalogVersion}：
    前端用 maxUploadPixels 做上传前预校验，用 usageBytes / maxTotalBytes 显示「已用多少」
    （B42 的总量配额到了之后上传会 413，用户得先知道该删什么）。
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

    身份与能力码：LicensedUser（认证 + api）。
    文件名走 X-File-Name 请求头（URL 编码），请求体是裸文件流。
    返回：素材 JSON（含 url 与 version）。
    会抛 422：文件名无效、后缀不支持、文件为空、内容与扩展名不符、尺寸超限；
    会抛 413：请求体超过该后缀的上限（位图 64 MB、SVG 5 MB）。逐块累计判断，
    不信任 Content-Length —— 否则分块传输或伪造的长度都能绕过。
    错误文案均为可直接展示的中文。
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
    # 声明超限的直接拒，连第一个字节都不读：省下带宽与一次落盘（放在建目录之前，
    # 这样早拒路径不需要任何清理）。
    declared_length = request.headers.get('content-length', '').strip()
    if declared_length.isdigit() and int(declared_length) > byte_limit:
        raise HTTPException(status_code = 413, detail = f'图片不能超过 {size_hint}，请压缩后重试。')
    root = request.app.state.settings.user_assets_dir.resolve()
    # 总量配额（B42）：单文件上限只挡得住「一张图」，挡不住「一直传」。先按声明的长度粗判
    # （省下一次落盘），流式写入时再按已收字节精判（分块传输压根没有长度头）。
    # 这一档是**软上限**：两次并发上传可能同时通过检查，真正的兜底是单文件上限与巡检告警。
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
    # 落到临时名、校验通过后再改名为真名（B41）。直接写最终文件名的话，「文件已存在」
    # 与「文件已登记」之间有一段窗口：首次 GET /assets/user 会扫盘建索引，它可能在这段
    # 窗口里（甚至在我们即将因为校验失败而删掉这个文件之后）把 user:<id> 登记进内存目录 ——
    # 于是目录里留下一条指向不存在文件的条目，删素材、算版本、发 URL 都会跟着它走。
    # 临时名以点开头，而扫描端本来就跳过隐藏文件（见 user_asset_file）。
    temporary = directory / f'.upload-{asset_id}{suffix}'
    try:
        # 流式落盘：不把整个上传体读进内存，也不预先信任 Content-Length。
        # 写盘分批放进线程池（见 streaming.write_stream_in_batches）：留在事件循环里
        # 的话，一次 64 MB 上传的几十次 write 系统调用会串在所有请求前面。
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
        # 解码最大 64 MB / 1000 万像素的位图、解析 5 MB XML 都是 CPU 与 IO 重活，
        # 放进线程池（B6）：放在事件循环里，一张大图就能让整个应用停摆几百毫秒。
        try:
            dimensions = await asyncio.to_thread(validate_uploaded_image, suffix, temporary)
        except ValueError as error:
            raise HTTPException(status_code = 422, detail = str(error)) from error
        # 同目录内改名是原子的：扫盘方看到的要么没有这个文件，要么是一份已校验的文件。
        os.replace(temporary, path)
        path.chmod(384)
    # 任何失败都要把刚建的目录删干净，否则素材目录里会留下空目录与半截文件。
    except Exception:
        # 清理本身绝不能再抛（B40）：原先这里调 directory.rmdir()，目录非空时它抛
        # OSError，把真正的失败原因（422/413/校验文案）顶成一条与客户端无关的 500 ——
        # 上传人看到的是「目录不是空的」，而实际原因是他的图片不合格。
        shutil.rmtree(directory, ignore_errors = True)
        raise
    # 登记同样要进线程池：内部会为这张图生成透明裁剪变体（另一次完整的 Pillow
    # 解码 + PNG 编码），与上面的校验是同一类同步重活。
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
    文件不存在抛 404「图片不存在。」。
    响应带一年期强缓存（URL 里带版本参数，内容变了 URL 就变）。
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
    response.headers['Cache-Control'] = 'private, max-age=31536000, immutable'
    return response

@router.get('/effect-variant')
def read_effect_variant(request: Request, asset_id: str = Query(alias = 'assetId')) -> FileResponse:
    """读取素材的透明裁剪变体（PNG）。

    查询参数为 assetId（三种前缀都可）。可见性按素材类型区分：
    user: 需被当前主体的仪表盘引用，builtin: 需存在于素材目录，
    studio3d: 同样需被当前主体的仪表盘引用（导出目录按项目生成，
    没有这一步任何中控设备都能按文件名猜出别的项目的户型图）。
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
    response.headers['Cache-Control'] = 'private, max-age=31536000, immutable'
    # 只转发 Set-Cookie：其余头部（如 Content-Length）留给文件响应自己决定。
    for key, value in authorization_response.raw_headers:
        if key.lower() != b'set-cookie':
            continue
        response.raw_headers.append((key, value))
    return response

@router.get('/studio3d-export/{folder_name}/{filename}')
def read_studio3d_export(folder_name: str, filename: str, request: Request, viewer: LicensedViewer) -> FileResponse:
    """读取 3D 工作室导出的图片原文。

    身份与能力码：LicensedViewer（认证 + api）。
    中控设备身份额外要求「这个文件被自己那块屏引用了」——导出目录是按项目生成的，
    但 URL 只带目录名与文件名，不校验归属的话任何一台中控设备都能拿到别的项目的
    户型图与图层截图（跨项目 IDOR）。管理员不受限。
    路径参数经 studio3d_export_file 严格校验，非法或不存在抛 404「导出图片不存在。」；
    引用校验不通过抛 403「该图片不属于当前中控仪表盘。」。
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
    response.headers['Cache-Control'] = 'private, max-age=31536000, immutable'
    return response

@router.delete('/user/{asset_id}', status_code = status.HTTP_204_NO_CONTENT)
def delete_user_asset(asset_id: str, request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    """删除一张用户上传的图片，返回 204。

    身份与能力码：LicensedUser（认证 + api）。
    仍被仪表盘文档或全局组合弹窗引用时抛 409 ASSET_IN_USE，detail 里列出引用方；
    3D 工作室草稿引用它时抛 409「图片正在被户型图绘制使用，请先替换或移除后再删除。」；
    图片不存在抛 404「图片不存在。」。
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
            # 单份草稿损坏时跳过：它的读取路径自会报错，不该连累删除流程（B54）。
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
        # 先删磁盘文件、再从内存目录摘掉：两步都成功才算删除完成。
        # remove_user 会连带删掉这张图的效果变体缓存（B42）—— 变体路径记录只在目录里，
        # 摘掉条目之后就再也查不到它了，所以两件事必须在同一个动作里完成。
        path.unlink()
        catalog.remove_user(full_asset_id)
        try:
            path.parent.rmdir()
        except OSError:
            pass
        return Response(status_code = status.HTTP_204_NO_CONTENT)

def read_builtin_asset(relative_path: str, request: Request) -> FileResponse:
    """读取内置素材文件（由 main.py 直接挂到 /assets/builtin/*，不带 /api/v1 前缀）。

    由于绕过了 api 依赖，这里自己再过一次 assets 能力码，否则 403
    「当前授权状态不允许读取该资源。」；素材不存在抛 404「素材不存在。」。
    """
    # 这个入口挂在 /assets/builtin/* 上、不经过 api 依赖，能力码必须在这里自查。
    if not request.app.state.license_service.allows('assets'):
        raise HTTPException(status_code = 403, detail = '当前授权状态不允许读取该资源。')
    match = request.app.state.asset_catalog.builtin_path(relative_path)
    if match is None:
        raise HTTPException(status_code = 404, detail = '素材不存在。')
    response = FileResponse(match)
    # 带 v 参数（内容版本）才允许强缓存；否则要求每次校验，避免旧图被浏览器长期留下。
    response.headers['Cache-Control'] = 'private, max-age=31536000, immutable' if request.query_params.get('v') else 'private, no-cache'
    return response
