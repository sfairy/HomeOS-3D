"""静态 GLB 装饰模型的结构校验（0.8.9 `studio_model_glb.py`）。

为什么不用 three 的后端等价物：后端没有 three，也不该为「看一个文件是否合法」引入
几百 MB 的依赖。这里只做**容器级**校验 —— GLB 是自描述的二进制容器（JSON chunk +
BIN chunk），读头 + 读 JSON 就能判定九成问题：

- 魔数不是 ``glTF`` / 版本不是 2 → 不是 GLB 2.0；
- 没有 JSON chunk → 不是合法容器；
- 场景里没有可摆放的网格（只有相机/灯光/空节点）→ 摆了也看不见；
- 贴图是外部 URI（``.png`` 相对路径）→ 上传后必然 404，必须内嵌；
- 三角面 / 节点 / 图元 / 贴图数量超限 → 浏览器端会卡死或 OOM。

**不解码贴图**：像素级校验（``MAX_IMAGE_PIXELS``）只在 ``display_images`` 的处理链里做，
那里本来就要解码。装饰模型的贴图只需「内嵌且格式为 PNG/JPEG」。

所有失败都抛 :func:`models.model_error`（携带稳定 ``apiErrorCode``），文案由
``API_ERROR['STUDIO3D_MODEL_INVALID']`` 加原因拼出。
"""

from __future__ import annotations

import base64
import json
import logging
import struct
from dataclasses import dataclass

from .models import model_error, model_too_large_error

_logger = logging.getLogger("homeos.studio3d.model_glb")

#: GLB 容器魔数与版本。
GLB_MAGIC = b"glTF"
GLB_VERSION = 2

#: JSON chunk / BIN chunk 的类型标记（小端 ``0x4E4F534A`` / ``0x004E4942``）。
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

#: 单模型三角面上限（6 万）。家具级装饰到这个量级已经很奢侈。
MAX_TRIANGLES = 60_000
#: 节点 / 网格 / 图元 / 场景 / 访问器 / bufferView 数量上限。
MAX_NODES = 2_048
MAX_MESHES = 512
MAX_PRIMITIVES = 4_096
MAX_SCENES = 32
MAX_ACCESSORS = 2_048
MAX_BUFFER_VIEWS = 2_048
#: 贴图 / 图片数量上限。
MAX_IMAGES = 32
MAX_TEXTURE_LINKS = 64
#: 贴图边长上限（像素）。超过 2048 的装饰贴图意义不大，却显著拖慢首屏。
MAX_IMAGE_SIDE = 2_048
#: 全部贴图的**像素总量**上限（0.8.9 上游 `imagePixels`）。
#:
#: 单张边长限制挡不住「32 张 2048×2048」这种组合（= 1.3 亿像素，移动端直接 OOM），
#: 所以另有一条总和限制。取 16 Mi 像素：4 张 2048² 或 16 张 1024²，
#: 对「一件家具/摆件」级别的装饰绰绰有余。
MAX_IMAGE_PIXELS = 16 * 1024 * 1024
#: 属性总字节上限（顶点+索引），约 24 MiB。
MAX_ATTRIBUTE_BYTES = 24 * 1024 * 1024

#: 允许内嵌的贴图 MIME。
ALLOWED_IMAGE_MIMES = frozenset({"image/png", "image/jpeg"})

#: 允许的扩展（0.8.9 实际支持集合）。未知扩展不阻断，但记录在返回值里供诊断。
KNOWN_EXTENSIONS = frozenset(
    {
        "KHR_materials_emissive_strength",
        "KHR_materials_pbrSpecularGlossiness",
        "KHR_materials_unlit",
        "KHR_texture_transform",
        "KHR_mesh_quantization",
        "EXT_texture_webp",
    }
)


#: GLB 体积上限与 ``models.MAX_MODEL_BYTES`` 同源，由调用方传入更灵活。
@dataclass(frozen=True, slots=True)
class GlbSummary:
    """校验通过后的摘要（用于日志与前端展示「多少面」）。"""

    triangles: int
    nodes: int
    meshes: int
    images: int
    #: 贴图合计像素（0.8.9 `imagePixels`；量不出尺寸的贴图不计入）。
    image_pixels: int = 0
    #: 0.8.9 未登记的扩展名（不阻断，仅用于诊断：渲染端可能忽略它们）。
    unknown_extensions: tuple[str, ...] = ()


def _read_uint32(buffer: bytes, offset: int) -> int:
    return struct.unpack_from("<I", buffer, offset)[0]


def _iter_chunks(buffer: bytes):
    """逐块产出 ``(chunk_type, chunk_bytes)``；长度越界立即失败。"""
    offset = 12
    while offset + 8 <= len(buffer):
        chunk_length, chunk_type = struct.unpack_from("<II", buffer, offset)
        offset += 8
        if chunk_length > len(buffer) - offset:
            raise model_error("GLB 分块长度越界（文件被截断或损坏）。")
        yield chunk_type, buffer[offset : offset + chunk_length]
        offset += chunk_length


def _decode_json_chunk(chunk: bytes) -> dict:
    try:
        parsed = json.loads(chunk.decode("utf-8").rstrip("\x00 "))
    except (UnicodeDecodeError, ValueError) as error:
        raise model_error("GLB 的 JSON 分块无法解析。") from error
    if not isinstance(parsed, dict):
        raise model_error("GLB 的 JSON 分块不是对象。")
    return parsed


def _parse_container(buffer: bytes) -> tuple[dict, bytes]:
    """拆 GLB 容器，返回 ``(gltf_json, bin_chunk)``。"""
    if len(buffer) < 12:
        raise model_error("文件不是有效的 GLB（长度不足 12 字节）。")
    magic, version, total_length = struct.unpack_from("<4sII", buffer, 0)
    if magic != GLB_MAGIC:
        raise model_error("文件不是 GLB（魔数不是 glTF）。")
    if version != GLB_VERSION:
        raise model_error(f"只支持 GLB 2.0（当前版本 {version}）。")
    if total_length != len(buffer):
        raise model_error("GLB 头部声明长度与实际字节数不一致。")

    json_payload: dict | None = None
    bin_payload = b""
    for chunk_type, chunk in _iter_chunks(buffer):
        if chunk_type == CHUNK_JSON and json_payload is None:
            json_payload = _decode_json_chunk(chunk)
        elif chunk_type == CHUNK_BIN and not bin_payload:
            bin_payload = chunk
        # 其它 chunk 按规范忽略（扩展可能自带自定义 chunk）。
    if json_payload is None:
        raise model_error("GLB 缺少 JSON 分块。")
    return json_payload, bin_payload


def _check_image_entry(image: object, index: int) -> None:
    """单张贴图：必须内嵌，且只能是 PNG / JPEG。"""
    if not isinstance(image, dict):
        raise model_error(f"第 {index + 1} 张贴图格式无效。")
    uri = image.get("uri")
    if isinstance(uri, str) and uri and not uri.startswith("data:"):
        raise model_error("贴图必须内嵌（不支持外部图片文件）。")
    mime = str(image.get("mimeType") or "")
    if mime and mime not in ALLOWED_IMAGE_MIMES:
        raise model_error(f"贴图格式不受支持（{mime}），仅支持 PNG 或 JPEG。")
    if mime:
        return
    if isinstance(uri, str) and uri.startswith("data:"):
        if not uri.startswith(("data:image/png", "data:image/jpeg")):
            raise model_error("贴图必须内嵌为 PNG 或 JPEG。")
        return
    if "bufferView" not in image:
        raise model_error("贴图既没有内嵌数据也没有内容类型。")


def _png_dimensions(data: bytes) -> tuple[int, int] | None:
    """从 PNG 的 IHDR 读宽高（签名 8 + 长度 4 + 类型 4，宽高紧随其后）。"""
    if len(data) < 24 or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    width, height = struct.unpack_from(">II", data, 16)
    return (width, height) if width and height else None


def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    """遍历 JPEG 的段，在 SOF0-SOF15（除 DHT/JPG/DAC）里读宽高。"""
    if len(data) < 4 or not data.startswith(b"\xff\xd8"):
        return None
    offset = 2
    while offset + 9 <= len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset + 1]
        # SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11 / SOF13..SOF15 都带尺寸。
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            height, width = struct.unpack_from(">HH", data, offset + 5)
            return (width, height) if width and height else None
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            offset += 2
            continue
        segment_length = struct.unpack_from(">H", data, offset + 2)[0]
        if segment_length < 2:
            return None
        offset += 2 + segment_length
    return None


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """内嵌贴图的宽高；不是 PNG/JPEG 或数据截断时返回 ``None``。

    ``None`` 表示「量不出来」，调用方应**放行**（宁可少一层校验，也不要拒掉合法文件）。
    """
    return _png_dimensions(data) or _jpeg_dimensions(data)


def _image_bytes_at(gltf: dict, image: dict, bin_payload: bytes) -> bytes:
    """取出某张贴图的字节（支持 ``bufferView`` 内嵌；``data:`` URI 也从这里过）。"""
    view_index = image.get("bufferView")
    views = gltf.get("bufferViews") or []
    if isinstance(view_index, int) and 0 <= view_index < len(views):
        view = views[view_index]
        if isinstance(view, dict):
            start = view.get("byteOffset", 0)
            length = view.get("byteLength")
            if isinstance(start, int) and isinstance(length, int) and start >= 0 and length > 0:
                return bin_payload[start : start + length]
    uri = image.get("uri")
    if isinstance(uri, str) and uri.startswith("data:"):
        _, _, payload = uri.partition(",")
        try:
            return base64.b64decode(payload, validate=False)
        except (ValueError, TypeError):  # fmt: skip
            # 内嵌贴图的 data: URI 坏了：按「没有这张贴图」处理（GLB 仍可加载），
            # 但要留下线索 —— 否则「材质变白」会无从排查。
            _logger.warning("内嵌贴图 base64 解码失败，按缺失处理", exc_info=True)
            return b""
    return b""


def _check_image_sizes(gltf: dict, bin_payload: bytes) -> int:
    """校验单张贴图边长与贴图合计像素总量，返回合计像素数。

    与上游 ``uploadLimits.imageSide`` / ``imagePixels`` 同一口径：只统计**能量出尺寸**的
    贴图（``image_dimensions`` 返回 ``None`` 的一律跳过），避免把合法文件误判。
    """
    total_pixels = 0
    for image in gltf.get("images") or []:
        if not isinstance(image, dict):
            continue
        dimensions = image_dimensions(_image_bytes_at(gltf, image, bin_payload))
        if dimensions is None:
            continue
        width, height = dimensions
        if max(width, height) > MAX_IMAGE_SIDE:
            raise model_error(f"贴图长边 {max(width, height)} 像素超过上限 {MAX_IMAGE_SIDE}。")
        total_pixels += width * height
    if total_pixels > MAX_IMAGE_PIXELS:
        raise model_error(f"贴图合计 {total_pixels} 像素超过上限 {MAX_IMAGE_PIXELS}。请缩小贴图或简化网格后重新导出。")
    return total_pixels


def _count_texture_links(gltf: dict) -> int:
    referenced = 0
    for texture in gltf.get("textures") or []:
        if isinstance(texture, dict) and "source" in texture:
            referenced += 1
    return referenced


def _check_images(gltf: dict, bin_payload: bytes) -> int:
    images = gltf.get("images") or []
    if not isinstance(images, list):
        raise model_error("GLB 的 images 字段格式无效。")
    if len(images) > MAX_IMAGES:
        raise model_error(f"贴图数量超过 {MAX_IMAGES} 张。")
    for index, image in enumerate(images):
        _check_image_entry(image, index)
    if _count_texture_links(gltf) > MAX_TEXTURE_LINKS:
        raise model_error(f"贴图引用超过 {MAX_TEXTURE_LINKS} 处。")
    if images and not bin_payload and all(isinstance(image, dict) and "bufferView" in image for image in images):
        raise model_error("贴图声明在 BIN 分块里，但文件没有 BIN 分块。")
    return len(images)


def _primitive_triangles(primitive: dict, accessors: list) -> int:
    mode = primitive.get("mode", 4)
    if mode != 4:  # 非三角形列表（点/线）不产生三角面
        return 0
    indices = primitive.get("indices")
    if isinstance(indices, int) and 0 <= indices < len(accessors):
        accessor = accessors[indices]
        if isinstance(accessor, dict):
            count = accessor.get("count")
            if isinstance(count, int) and count > 0:
                return count // 3
    attributes = primitive.get("attributes") or {}
    position = attributes.get("POSITION") if isinstance(attributes, dict) else None
    if isinstance(position, int) and 0 <= position < len(accessors):
        accessor = accessors[position]
        if isinstance(accessor, dict):
            count = accessor.get("count")
            if isinstance(count, int) and count > 0:
                return count // 3
    return 0


def _count_mesh_primitives(mesh: object) -> tuple[int, int]:
    """一个网格的 ``(图元数, 三角面数)``。"""
    if not isinstance(mesh, dict):
        return 0, 0
    primitives = 0
    triangles = 0
    accessors = mesh.get("_accessors") or []
    for primitive in mesh.get("primitives") or []:
        if not isinstance(primitive, dict):
            continue
        primitives += 1
        triangles += _primitive_triangles(primitive, accessors)
    return primitives, triangles


def _check_meshes(gltf: dict) -> tuple[int, int]:
    meshes = gltf.get("meshes") or []
    if not isinstance(meshes, list):
        raise model_error("GLB 的 meshes 字段格式无效。")
    if len(meshes) > MAX_MESHES:
        raise model_error(f"网格数量超过 {MAX_MESHES}。")
    accessors = gltf.get("accessors") or []
    if not isinstance(accessors, list):
        raise model_error("GLB 的 accessors 字段格式无效。")
    if len(accessors) > MAX_ACCESSORS:
        raise model_error(f"访问器数量超过 {MAX_ACCESSORS}。")
    primitives = 0
    triangles = 0
    for mesh in meshes:
        # 访问器表挂在 gltf 上，临时塞进 mesh 的副本里传下去，避免再多一个参数。
        counted = _count_mesh_primitives({**mesh, "_accessors": accessors} if isinstance(mesh, dict) else mesh)
        primitives += counted[0]
        triangles += counted[1]
    if primitives > MAX_PRIMITIVES:
        raise model_error(f"图元数量超过 {MAX_PRIMITIVES}。")
    if triangles > MAX_TRIANGLES:
        raise model_error(f"三角面数量超过 {MAX_TRIANGLES}。")
    return primitives, triangles


def _check_nodes(gltf: dict) -> int:
    nodes = gltf.get("nodes") or []
    if not isinstance(nodes, list):
        raise model_error("GLB 的 nodes 字段格式无效。")
    if len(nodes) > MAX_NODES:
        raise model_error(f"节点数量超过 {MAX_NODES}。")
    scenes = gltf.get("scenes") or []
    if isinstance(scenes, list) and len(scenes) > MAX_SCENES:
        raise model_error(f"场景数量超过 {MAX_SCENES}。")
    return len(nodes)


def _check_attribute_bytes(gltf: dict) -> None:
    views = gltf.get("bufferViews") or []
    if not isinstance(views, list):
        raise model_error("GLB 的 bufferViews 字段格式无效。")
    if len(views) > MAX_BUFFER_VIEWS:
        raise model_error(f"bufferView 数量超过 {MAX_BUFFER_VIEWS}。")
    total = 0
    for view in views:
        if isinstance(view, dict):
            byte_length = view.get("byteLength")
            if isinstance(byte_length, int) and byte_length > 0:
                total += byte_length
    if total > MAX_ATTRIBUTE_BYTES:
        raise model_error(f"几何数据超过 {MAX_ATTRIBUTE_BYTES // (1024 * 1024)} MiB。")


def _node_reaches_mesh(nodes: list, index: object) -> bool:
    """某个节点（或它的一级子节点）是否挂了网格。"""
    if not isinstance(index, int) or not (0 <= index < len(nodes)):
        return False
    node = nodes[index]
    if not isinstance(node, dict):
        return False
    if "mesh" in node:
        return True
    for child_index in node.get("children") or []:
        if isinstance(child_index, int) and 0 <= child_index < len(nodes):
            child = nodes[child_index]
            if isinstance(child, dict) and "mesh" in child:
                return True
    return False


def _has_renderable_mesh(gltf: dict) -> bool:
    """是否存在「被默认场景引用、且有几何」的网格。"""
    meshes = gltf.get("meshes") or []
    if not any(isinstance(mesh, dict) and mesh.get("primitives") for mesh in meshes):
        return False
    nodes = gltf.get("nodes") or []
    scenes = gltf.get("scenes") or []
    if not scenes:
        # 没有 scenes 字段时按「全部节点都在默认场景」处理（导出器差异）。
        return True
    default_index = gltf.get("scene", 0)
    if not isinstance(default_index, int) or not (0 <= default_index < len(scenes)):
        default_index = 0
    scene = scenes[default_index]
    roots = scene.get("nodes") if isinstance(scene, dict) else None
    if not isinstance(roots, list) or not roots:
        return False
    return any(_node_reaches_mesh(nodes, root_index) for root_index in roots)


def validate_glb(buffer: bytes, *, max_bytes: int) -> GlbSummary:
    """校验一份 GLB，通过则返回摘要；不通过抛 :class:`BusinessException`（422/413）。"""
    if not buffer:
        raise model_error("文件为空，请重新选择模型。")
    if len(buffer) > max_bytes:
        raise model_too_large_error(max_bytes)
    gltf, bin_payload = _parse_container(buffer)
    if str(gltf.get("asset", {}).get("version") or "") not in {"2.0", "2"}:
        raise model_error("只支持 glTF 2.0 资源。")
    primitives, triangles = _check_meshes(gltf)
    node_count = _check_nodes(gltf)
    image_count = _check_images(gltf, bin_payload)
    image_pixels = _check_image_sizes(gltf, bin_payload)
    _check_attribute_bytes(gltf)
    if primitives == 0:
        raise model_error("GLB 没有可摆放的静态网格。")
    if not _has_renderable_mesh(gltf):
        raise model_error("GLB 默认场景没有可摆放的网格。")
    extensions_used = gltf.get("extensionsUsed") or []
    unknown_extensions = (
        tuple(sorted({str(name) for name in extensions_used if isinstance(name, str)}))
        if isinstance(extensions_used, list)
        else ()
    )
    return GlbSummary(
        triangles=triangles,
        nodes=node_count,
        meshes=len(gltf.get("meshes") or []),
        images=image_count,
        image_pixels=image_pixels,
        unknown_extensions=tuple(name for name in unknown_extensions if name not in KNOWN_EXTENSIONS),
    )
