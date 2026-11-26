"""按**实际显示尺寸**派生图片副本（0.8.9 `display_images.py`）。

要解决的是内存而不是流量：一块 200×120 的控件去下 4000×3000 的原图，解出来的位图
是 48 MB，而浏览器只用其中 1/1600。0.8.9 让前端在 URL 上带 ``displaySize=WxH``，
服务端按目标尺寸出一份副本，原图仍保留（授权与「导出原图」语义不变）。

参数契约（与前端 `display-images.js` 逐项对应）：

===============  ==========================================================
``displaySize``  ``WxH``，1–4096 的整数。前端按 DPR 取整到 64 的倍数。
``displayFit``   ``cover``：裁到目标宽高比并填满；缺省按「装进目标框」缩放。
``displayStill`` ``1``：动图只取第一帧（3D 屏幕贴图不需要动画）。
``displayCrop``  ``1``：按 ``displayCropBand`` 指定的宽高比分带做居中裁切。
``displayCropBand`` 整数：``aspect = 2 ** (band / 16)``，用于背景图的横竖裁切。
===============  ==========================================================

为什么用分带而不是直接传宽高比：前端只有「按容器宽高比的 log2 量化」这一种信息
（``floor(log2(w/h) * 16)``），量化后相邻容器的宽高比落在同一档，命中同一份缓存 ——
这正是不让缓存爆炸的关键。服务端只认这个量化值，不去猜真实像素。

缓存落在 ``data/modules/interaction3d/display-images/``（**不进备份**，见
``domains/backup/scope.py``）：文件名由「源文件指纹 + 参数」哈希得出，因此源图更新
（同名不同图）不会命中旧副本。
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("homeos.display_images")

#: 目标边长上限（与前端 `displaySize` 的 1–4096 一致）。超过就夹到 4096：
#: 再大对屏幕没有意义，却会让服务端解码一整张原图。
MAX_EDGE = 4096

#: 源图像素上限（宽 × 高）。超过直接回落原图：解码这么一张图的内存代价比省下的带宽大。
MAX_SOURCE_PIXELS = 36_000_000

#: 裁剪分带的上下限与每倍频程档数（与前端 `floor(log2(aspect) * 16)` 对应）。
MAX_CROP_BAND = 64
CROP_BANDS_PER_OCTAVE = 16

#: 缓存体积 / 文件数上限。超过按最旧访问顺序淘汰。
MAX_CACHE_BYTES = 128 * 1024 * 1024
MAX_CACHE_FILES = 4_096

#: 可派生副本的栅格后缀。SVG 由调用方直接放行（不做缩放，矢量无损）。
RASTER_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})

#: 输出格式：统一 WebP（体积约为 PNG 的 1/4，且带 alpha）。
OUTPUT_SUFFIX = ".webp"

_SIZE_PATTERN = re.compile(r"([1-9][0-9]{0,3})x([1-9][0-9]{0,3})")


#: 派生参数（参与缓存键，因此必须是不可变值）。
@dataclass(frozen=True, slots=True)
class DisplayRequest:
    """一次「按显示尺寸取图」的请求参数。"""

    width: int
    height: int
    cover: bool = False
    still: bool = False
    crop: bool = False
    crop_band: int | None = None

    def cache_token(self) -> str:
        band = "" if self.crop_band is None else str(self.crop_band)
        return f"{self.width}x{self.height}-{'c' if self.cover else 'f'}-{int(self.still)}-{int(self.crop)}-{band}"


def parse_display_request(query: dict[str, str]) -> DisplayRequest | None:
    """从查询参数解析派生请求；没有 ``displaySize``（或格式不对）返回 ``None``。

    格式不对时**回落原图**而不是 422：``displaySize`` 是纯优化参数，坏值不该让图片挂掉。
    """
    raw_size = str(query.get("displaySize") or "").strip()
    if not raw_size:
        return None
    matched = _SIZE_PATTERN.fullmatch(raw_size)
    if not matched:
        return None
    width = min(MAX_EDGE, int(matched.group(1)))
    height = min(MAX_EDGE, int(matched.group(2)))
    raw_band = str(query.get("displayCropBand") or "").strip()
    crop_band: int | None = None
    if raw_band:
        try:
            parsed = int(raw_band)
        except ValueError:
            # 坏参数按「不裁切」处理：这只是优化开关，不该让图片挂掉。
            logger.debug("displayCropBand 不是整数，忽略：%r", raw_band)
            parsed = None
        if parsed is not None:
            crop_band = max(-MAX_CROP_BAND, min(MAX_CROP_BAND, parsed))
    return DisplayRequest(
        width=width,
        height=height,
        cover=str(query.get("displayFit") or "") == "cover",
        still=str(query.get("displayStill") or "") == "1",
        crop=str(query.get("displayCrop") or "") == "1",
        crop_band=crop_band,
    )


def supports_display_derivative(path: Path) -> bool:
    """这个文件能否派生副本（SVG 与未知后缀直接放行原图）。"""
    return path.suffix.lower() in RASTER_SUFFIXES


def _source_identity(path: Path) -> str:
    """源文件指纹：路径 + 大小 + mtime。同名不同图（覆盖上传）不会命中旧副本。"""
    try:
        stat = path.stat()
    except OSError:
        logger.debug("读取源文件指纹失败，退回文件名：%s", path, exc_info=True)
        return path.name
    return f"{path.name}:{stat.st_size}:{int(stat.st_mtime)}"


def _crop_band_aspect(band: int) -> float:
    """分带 → 宽高比。``band / 16`` 是 ``log2(aspect)``，因此 ``aspect = 2 ** (band/16)``。"""
    return 2.0 ** (band / CROP_BANDS_PER_OCTAVE)


def _center_crop_box(width: int, height: int, aspect: float) -> tuple[int, int, int, int] | None:
    """把源图居中裁到目标宽高比；裁完过小（<16px）返回 ``None``（放弃派生）。"""
    if width <= 0 or height <= 0:
        return None
    current = width / height
    if abs(current - aspect) < 1e-6:
        return (0, 0, width, height)
    if current > aspect:
        crop_width = max(1, round(height * aspect))
        left = (width - crop_width) // 2
        return (left, 0, left + crop_width, height)
    crop_height = max(1, round(width / aspect))
    top = (height - crop_height) // 2
    return (0, top, width, top + crop_height)


class DisplayImageCache:
    """派生副本的落盘 + 淘汰。

    无数据库：缓存是纯派生数据，丢了重算即可。索引靠目录扫描（文件数上限 4096，
    一次 ``iterdir`` 可接受），因此不需要维护额外的一致性状态。
    """

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.mutation_lock = threading.RLock()

    def ensure_dir(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, source: Path, request: DisplayRequest) -> Path:
        digest = hashlib.sha256(f"{_source_identity(source)}|{request.cache_token()}".encode()).hexdigest()
        return self.root / f"{digest[:40]}{OUTPUT_SUFFIX}"

    def get_or_create(self, source: Path, request: DisplayRequest) -> Path | None:
        """命中即返回；未命中就派生并落盘。任何失败返回 ``None``（调用方回落原图）。

        **不抛错是刻意的**：这是纯优化路径。派生失败时给原图，用户还能看到图；
        抛 500 会让「换个窗口尺寸」变成一次页面故障。
        """
        try:
            cached = self.path_for(source, request)
        except OSError:
            logger.warning("无法计算派生缓存路径，回落原图：%s", source, exc_info=True)
            return None
        if cached.exists():
            # 命中时刷新 mtime，让淘汰按「最久未用」而不是「最早生成」。
            try:
                os.utime(cached, None)
            except OSError:
                logger.debug("刷新缓存 mtime 失败（不影响命中）：%s", cached, exc_info=True)
            return cached
        with self.mutation_lock:
            if cached.exists():
                return cached
            derived = self._derive(source, request)
            if derived is None:
                return None
            self.ensure_dir()
            temporary = cached.with_suffix(f"{OUTPUT_SUFFIX}.tmp")
            try:
                temporary.write_bytes(derived)
                os.replace(temporary, cached)
            except OSError:
                logger.warning("写入派生缓存失败，回落原图：%s", cached, exc_info=True)
                _unlink_quietly(temporary)
                return None
            self.evict()
            return cached

    def _derive(self, source: Path, request: DisplayRequest) -> bytes | None:
        """解码 → 裁切 → 缩放 → 编码 WebP。PIL 在函数内导入（首屏路径不碰图片）。"""
        try:
            stat = source.stat()
        except OSError:
            logger.warning("读取源文件失败，回落原图：%s", source, exc_info=True)
            return None
        if stat.st_size <= 0:
            return None
        try:
            from PIL import Image, ImageOps
        except ImportError:  # pragma: no cover - 镜像保证有 Pillow
            logger.warning("Pillow 不可用，显示尺寸派生已停用")
            return None
        try:
            with Image.open(source) as opened:
                if opened.width * opened.height > MAX_SOURCE_PIXELS:
                    return None
                if request.still and getattr(opened, "is_animated", False):
                    opened.seek(0)
                image = opened.convert("RGBA") if opened.mode in {"RGBA", "LA", "P"} else opened.convert("RGB")
        except Exception:
            logger.debug("显示尺寸派生失败（解码）：%s", source, exc_info=True)
            return None
        try:
            return _encode_derived(image, request, Image, ImageOps)
        except Exception:
            logger.debug("显示尺寸派生失败（写入）：%s", source, exc_info=True)
            return None

    def evict(self) -> None:
        """按最久未用顺序淘汰，直到体积与文件数都回到上限内。"""
        try:
            entries = [entry for entry in self.root.iterdir() if entry.suffix == OUTPUT_SUFFIX]
        except OSError:
            logger.warning("扫描派生缓存目录失败，跳过本轮淘汰：%s", self.root, exc_info=True)
            return
        total = _total_size(entries)
        if len(entries) <= MAX_CACHE_FILES and total <= MAX_CACHE_BYTES:
            return
        # 最旧的在前：mtime 在每次命中时会被刷新，所以这就是「最久未用」。
        entries.sort(key=_mtime)
        index = 0
        while index < len(entries) and (len(entries) - index > MAX_CACHE_FILES or total > MAX_CACHE_BYTES):
            entry = entries[index]
            total -= _size(entry)
            _unlink_quietly(entry)
            index += 1


def _encode_derived(image, request: DisplayRequest, Image, ImageOps) -> bytes:
    """按参数裁切并缩放，返回 WebP 字节。"""
    working = image
    if request.crop and request.crop_band is not None:
        box = _center_crop_box(image.width, image.height, _crop_band_aspect(request.crop_band))
        if box is not None:
            working = image.crop(box)
    if request.cover:
        # cover：先按目标宽高比居中裁切，再缩放到目标尺寸（不放大，避免糊）。
        box = _center_crop_box(working.width, working.height, request.width / max(1, request.height))
        if box is not None:
            working = working.crop(box)
        target = (min(request.width, working.width), min(request.height, working.height))
        working = ImageOps.fit(working, target, method=Image.Resampling.LANCZOS)
    else:
        working = working.copy()
        working.thumbnail((request.width, request.height), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    # `quality=82` 与产品其它 WebP 口径一致；`method=4` 是速度/体积的折中。
    working.save(buffer, format="WEBP", quality=82, method=4)
    return buffer.getvalue()


def _size(entry: Path) -> int:
    try:
        return entry.stat().st_size
    except OSError:
        logger.debug("读取缓存文件大小失败，按 0 计：%s", entry, exc_info=True)
        return 0


def _mtime(entry: Path) -> float:
    try:
        return entry.stat().st_mtime
    except OSError:
        logger.debug("读取缓存文件 mtime 失败，按最旧处理：%s", entry, exc_info=True)
        return 0.0


def _total_size(entries: list[Path]) -> int:
    return sum(_size(entry) for entry in entries)


def _unlink_quietly(entry: Path) -> None:
    try:
        entry.unlink()
    except OSError:
        logger.debug("删除缓存文件失败（可能已被并发淘汰）：%s", entry, exc_info=True)


__all__ = [
    "CROP_BANDS_PER_OCTAVE",
    "MAX_CACHE_BYTES",
    "MAX_CACHE_FILES",
    "MAX_CROP_BAND",
    "MAX_EDGE",
    "MAX_SOURCE_PIXELS",
    "OUTPUT_SUFFIX",
    "RASTER_SUFFIXES",
    "DisplayImageCache",
    "DisplayRequest",
    "parse_display_request",
    "supports_display_derivative",
]
