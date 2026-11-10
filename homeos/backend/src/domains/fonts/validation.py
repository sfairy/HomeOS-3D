"""字体选择与字体文件的校验。

文件校验只约束容器与表目录的长度边界；字形解码交给浏览器的 ``FontFace``。
"""

from __future__ import annotations

import struct

from .constants import BUILTIN_FONT_IDS, FONT_ID, FONT_TYPES, MAX_FONT_BYTES

_INVALID_FILE = "字体文件无效，支持最大 32 MB 的 TTF、OTF、WOFF 和 WOFF2。"
_INVALID_DIRECTORY = "字体表目录无效。"
_INCOMPLETE_TABLE = "字体表数据不完整。"
_INVALID_COMPRESSED = "压缩字体的格式或大小无效。"
_MIN_FONT_BYTES = 48
_MAX_TABLES = 128
_MAX_EXPANDED_BYTES = 128 * 1024 * 1024
_REQUIRED_TABLES = frozenset({b"cmap", b"head", b"name"})


def valid_font_selection(value: object, *, latin: bool) -> bool:
    """仪表盘字体选择值：``device`` / 内置 id / ``font:<32hex>``；拉丁另可 ``chinese``。"""
    if not isinstance(value, str):
        return False
    if value in BUILTIN_FONT_IDS or value == "device" or (latin and value == "chinese"):
        return True
    return FONT_ID.fullmatch(value) is not None


def _variable_weight(data: bytes, offset: int, length: int) -> str | None:
    """可变字体 ``fvar`` 里 ``wght`` 轴的取值范围，如 ``"100 900"``。"""
    if length < 16:
        return None
    axes_offset = struct.unpack_from(">H", data, offset + 4)[0]
    axes_count, axes_size = struct.unpack_from(">HH", data, offset + 8)
    if axes_size < 20 or axes_offset + axes_count * axes_size > length:
        return None
    for index in range(axes_count):
        axis, low, _default, high = struct.unpack_from(">4siii", data, offset + axes_offset + index * axes_size)
        if axis != b"wght":
            continue
        low_weight, high_weight = round(low / 65536), round(high / 65536)
        if 1 <= low_weight <= high_weight <= 1000:
            return f"{low_weight} {high_weight}"
    return None


def _validate_sfnt(data: bytes, suffix: str, magic: bytes) -> str:
    expected = ".otf" if magic == b"OTTO" else ".ttf"
    if suffix != expected:
        raise ValueError("字体格式与扩展名不一致。")
    count = struct.unpack_from(">H", data, 4)[0]
    if not 1 <= count <= _MAX_TABLES or 12 + count * 16 > len(data):
        raise ValueError(_INVALID_DIRECTORY)
    tables: dict[bytes, tuple[int, int]] = {}
    for index in range(count):
        tag, _checksum, offset, length = struct.unpack_from(">4sIII", data, 12 + index * 16)
        if offset + length > len(data):
            raise ValueError(_INCOMPLETE_TABLE)
        tables[tag] = (offset, length)
    if not tables.keys() >= _REQUIRED_TABLES:
        raise ValueError("字体缺少必要的字形或名称信息。")
    if b"fvar" in tables:
        return _variable_weight(data, *tables[b"fvar"]) or "400"
    return "400"


def _validate_woff(data: bytes, suffix: str, magic: bytes) -> str:
    expected = ".woff2" if magic == b"wOF2" else ".woff"
    size, count = struct.unpack_from(">IH", data, 8)
    expanded = struct.unpack_from(">I", data, 16)[0]
    if (
        suffix != expected
        or size != len(data)
        or not 1 <= count <= _MAX_TABLES
        or not _MIN_FONT_BYTES <= expanded <= _MAX_EXPANDED_BYTES
    ):
        raise ValueError(_INVALID_COMPRESSED)
    if magic == b"wOFF":
        if 44 + count * 20 > len(data):
            raise ValueError(_INVALID_DIRECTORY)
        for index in range(count):
            _tag, offset, compressed, original, _checksum = struct.unpack_from(">4sIIII", data, 44 + index * 20)
            if offset + compressed > len(data) or compressed > original:
                raise ValueError(_INCOMPLETE_TABLE)
    return "400"


def validate_font_file(data: bytes, suffix: str) -> str:
    """校验字体文件；返回 CSS ``font-weight`` 描述（固定字重 ``"400"`` 或可变范围）。"""
    if not _MIN_FONT_BYTES <= len(data) <= MAX_FONT_BYTES or suffix not in FONT_TYPES:
        raise ValueError(_INVALID_FILE)
    magic = data[:4]
    if magic in (b"\x00\x01\x00\x00", b"OTTO"):
        return _validate_sfnt(data, suffix, magic)
    if magic in (b"wOFF", b"wOF2"):
        return _validate_woff(data, suffix, magic)
    raise ValueError("无法识别此字体，请选择 TTF、OTF、WOFF 或 WOFF2 文件。")
