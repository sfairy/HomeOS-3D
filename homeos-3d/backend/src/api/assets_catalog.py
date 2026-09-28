"""素材目录的进程内缓存与扫描：AssetCatalog、孤儿素材清扫、3D 工作室导出索引。
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from threading import RLock
from time import time
from urllib.parse import quote
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select

from .assets_uploads import (
    SUPPORTED_IMAGE_SUFFIXES,
    UPLOAD_IMAGE_SUFFIXES,
)
from ..core.canonical_json import canonical_json
from ..core.models import ProjectDraft
from ..panel.documents import parse_document
from ..panel.entity_refs import document_mentioned_values, document_mentions
from ..panel.global_popups import global_popups

# 用户素材目录的**总量**上限：单文件上限挡不住「一直传」，而盘满之后先坏的是数据库与日志。
MAX_USER_ASSET_TOTAL_BYTES = 1000 * 1000 * 1000
# 用量超过这个水位就记警告，不自动删图（未被引用不等于没人要，删它等于弄丢用户的图）。
USER_ASSET_WARN_BYTES = MAX_USER_ASSET_TOTAL_BYTES * 4 // 5
# 「目录里已没有合法图片」的空壳目录保留多久再回收。上传是「先建目录、写完临时文件、
USER_ASSET_ORPHAN_GRACE_SECONDS = 3600
# 变体缓存里对不上任何现存素材版本的键保留多久再回收（缓存可以随时重算）。
EFFECT_VARIANT_GRACE_SECONDS = 24 * 3600
EFFECT_VARIANT_PADDING = 2
EFFECT_VARIANT_MAX_AREA_RATIO = 0.98
# 用户素材 ID 就是 uuid4().hex：用固定长度十六进制做目录名校验，从源头杜绝路径穿越。
ASSET_ID = re.compile('^[0-9a-f]{32}$')
def user_asset_file(root: Path, asset_id: str) -> Path | None:
    """定位某个用户素材目录里唯一的图片文件；目录非法或文件数不为 1 时返回 None。"""
    # 目录名必须是纯十六进制 ID：先把 ../ 这类构造挡在门口。
    if not ASSET_ID.fullmatch(asset_id):
        return None
    directory = (root / asset_id).resolve()
    # resolve 之后再确认仍在 root 之下：防止符号链接把读取引到目录之外。
    if not directory.is_relative_to(root) or not directory.is_dir():
        return None
    matches = [item for item in directory.iterdir() if item.is_file() and not item.name.startswith('.') and item.suffix.lower() in UPLOAD_IMAGE_SUFFIXES]
    return matches[0] if len(matches) == 1 else None
def user_asset_payload(root: Path, asset_id: str, path: Path, dimensions: tuple[int, int] | None = None) -> dict:
    """把用户素材文件拼成前端使用的 JSON（camelCase 出）。
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
    """
    return hashlib.sha256(f'{full_asset_id}\x00{version}'.encode()).hexdigest()
def directory_bytes(directory: Path) -> int:
    """递归统计目录占用的字节数；读不到的条目按 0 计。
    """
    total = 0
    for path in directory.rglob('*'):
        # 条目在遍历途中被删 / 无权限：跳过它，不因一个文件中断整次统计。
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total
def directory_holds_asset(directory: Path) -> bool:
    for path in directory.rglob('*'):
        # 单个条目探测失败不改变「目录里是否有图片」的结论，继续看下一个。
        try:
            if path.is_file() and not path.name.startswith('.') and path.suffix.lower() in UPLOAD_IMAGE_SUFFIXES:
                return True
        except OSError:
            continue
    return False
def _discard_variant_files(variant_path: Path | None) -> int:
    """删掉一张变体缓存（PNG + 同名 JSON 元数据），返回释放的字节数。
    """
    if variant_path is None:
        return 0
    released = 0
    for path in (variant_path, variant_path.with_suffix('.json')):
        # 变体文件或其元数据缺失：这个变体不计入，继续下一个。
        try:
            size = path.stat().st_size
        except OSError:
            continue
        # 删不掉（占用 / 权限）也继续：清理是尽力而为，剩下的下次再处理。
        try:
            path.unlink()
        except OSError:
            continue
        released += size
    return released
def effect_variant_payload(path: Path, full_asset_id: str, version: str, cache_root: Path) -> tuple[dict, Path] | None:
    """按 alpha 包围盒生成透明裁剪后的 PNG 变体，供运行时渲染器使用。
    """
    # 只有 PNG / WebP 能做无损透明裁剪，其它格式直接跳过。
    if path.suffix.lower() not in frozenset({'.png', '.webp'}):
        return None
    # 缓存键 = 素材 ID + 版本号：内容变了键就变，无需主动失效旧文件。
    cache_key = effect_variant_cache_key(full_asset_id, version)
    variant_path = cache_root / f'{cache_key}.png'
    metadata_path = cache_root / f'{cache_key}.json'
    if variant_path.is_file() and metadata_path.is_file():
        try:
            metadata = json.loads(metadata_path.read_text(encoding = 'utf-8'))
            original_width = int(metadata['originalWidth'])
            original_height = int(metadata['originalHeight'])
            left = int(metadata['cropX'])
            top = int(metadata['cropY'])
            crop_width = int(metadata['width'])
            crop_height = int(metadata['height'])
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
        temporary_metadata_path.write_text(canonical_json(metadata), encoding = 'utf-8')
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
    """
    if not folder_name or folder_name in frozenset({'.', '..'}) or Path(folder_name).name != folder_name or folder_name.startswith('.') or not filename or filename in frozenset({'.', '..'}) or Path(filename).name != filename or filename.startswith('.') or Path(filename).suffix.lower() not in frozenset({'.png', '.webp'}):
        return None
    # 目录名与文件名先做单层校验，resolve 后再确认仍在 root 之下：双重防路径穿越。
    folder = (root / folder_name).resolve()
    path = (folder / filename).resolve()
    if not (folder.is_relative_to(root) and path.is_relative_to(folder) and path.is_file()):
        return None
    return path
class AssetCatalog:
    '''进程内的素材目录缓存。
    '''

    def __init__(self, built_in_root: Path, user_root: Path, studio3d_exports_root: Path | None = None, effect_variants_root: Path | None = None) -> None:
        """记录各素材根目录并统一转成绝对路径。
        """
        self.built_in_root = built_in_root.resolve()
        self.user_root = user_root.resolve()
        self.studio3d_exports_root = studio3d_exports_root.resolve() if studio3d_exports_root else None
        self.effect_variants_root = effect_variants_root.resolve() if effect_variants_root else self.user_root.parent / 'cache' / 'effect-variants'
        # 目录的读写都在这把锁下进行：上传/删除与列表读取并发时不会读到半更新状态。
        self.mutation_lock = RLock()
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
        """
        try:
            generated = effect_variant_payload(path, str(payload['assetId']), str(payload['version']), self.effect_variants_root)
            if generated is None:
                return
            (metadata, variant_path) = generated
            payload['effectVariant'] = metadata
            self._effect_variant_paths[str(payload['assetId'])] = variant_path
        # 生成变体失败（IO 错误等）不影响主流程：少一个可选字段而已。
        except OSError:
            return

    def _load_builtin(self) -> None:
        """懒加载内置素材目录，建立 assetId → 条目与相对路径 → 文件路径两张索引。"""
        with self.mutation_lock:
            # 双检：多线程同时首次访问时，后到的直接返回。
            if self._builtin_loaded:
                return
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
        """
        with self.mutation_lock:
            if self._user_loaded:
                return
            for directory in self.user_root.iterdir():
                path = user_asset_file(self.user_root, directory.name)
                if path is None:
                    continue
                # 单个资源构建负载失败（文件被删 / 读不了）：跳过它，其余资源照常列出。
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
                    (export_roles, export_order) = studio3d_export_metadata(folder)
                    for path in folder.iterdir():
                        if not path.is_file() or path.name.startswith('.') or path.suffix.lower() not in frozenset({'.png', '.webp'}):
                            continue
                        # 同上：单个导出文件读不了就跳过，不影响同目录其它导出。
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
        items.sort(key = lambda item: (item['folder'], item['name'].casefold()))
        return items

    def user_items(self) -> list[dict]:
        """列出全部用户素材（含 3D 导出），顺带清理磁盘上已消失的条目。
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
        # 前缀决定查哪本索引：user: 与 studio3d: 共用用户侧目录（studio3d 的导出图也登记在那里，
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
        """
        return directory_bytes(self.user_root) if self.user_root.is_dir() else 0

    def effect_variant_keys(self) -> set[str]:
        """现存素材版本对应的变体缓存键，供巡检判断缓存里哪些文件是孤儿。
        """
        return {
            effect_variant_cache_key(str(item.get('assetId') or ''), str(item.get('version') or ''))
            for item in self.user_items()
        }
def referenced_user_asset_ids(database, studio3d_draft_path: Path) -> set[str]:
    """此刻仍被引用的用户素材 ID（不含 ``user:`` 前缀）集合。
    """
    def is_user_asset(text: str) -> bool:
        """只收用户上传的图片：内置素材不会出现在这个目录里。"""
        return text.startswith('user:')

    def referenced_in(value) -> set[str]:
        """从一份文档里捞出全部用户素材 ID（去掉前缀，与磁盘目录名对齐）。"""
        return {
            asset_id.removeprefix('user:')
            for asset_id in document_mentioned_values(value, is_user_asset)
        }

    referenced: set[str] = set()
    for document_json in database.scalars(select(ProjectDraft.document_json)):
        # 损坏的草稿跳过：它的读取路径自会报错，不该连累巡检（与删素材同一口径）。
        document = parse_document(document_json)
        if document is None:
            continue
        referenced.update(referenced_in(document))
    referenced.update(referenced_in({'customPopups': global_popups(database)}))
    if studio3d_draft_path.is_file():
        try:
            studio_draft = json.loads(studio3d_draft_path.read_text(encoding = 'utf-8'))
        except (OSError, json.JSONDecodeError):
            studio_draft = { }
        referenced.update(referenced_in(studio_draft.get('scene', { })))
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
    moment = time() if now is None else now
    stats = {'directories': 0, 'files': 0, 'variants': 0, 'released': 0, 'kept': 0}
    # 先归一成绝对路径：``user_asset_file`` 内部会 resolve 再判「还在根目录之下」，
    root = root.resolve()
    if root.is_dir():
        for entry in sorted(root.iterdir()):
            if entry.is_dir() and not entry.is_symlink():
                # 还有图片文件的目录一律不动：是否有用不由这里判断，而「还有没有东西」用放宽的判定。
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
            # 条目已消失：判不了年龄就不纳入本次回收，继续下一个。
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
    """整份文档（任意嵌套的 dict/list）里是否还有地方提到该素材 ID。
    """
    return document_mentions(value, lambda text: text == asset_id)
