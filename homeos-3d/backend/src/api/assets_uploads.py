"""素材上传的校验与清洗：后缀/像素/体积上限、SVG 白名单净化、图片格式校验。
"""
from __future__ import annotations

import math
import re
import warnings
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, UnidentifiedImageError

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
# 单次上传请求体的字节上限，**逐块累计**判断（分块传输会让 Content-Length 失效）。
MAX_UPLOAD_BYTES = 64 * 1000 * 1000
MAX_UPLOAD_SVG_BYTES = 5000000
MAX_UPLOAD_SVG_ELEMENTS = 20000
# SVG 与 xlink 命名空间常量：清洗属性/元素时按这两个值做白名单比对。
SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
SVG_LENGTH = re.compile('^\\s*([+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*(px|pt|pc|mm|cm|in)?\\s*$', re.IGNORECASE)
# 取出 CSS 里 url(...) 的引用目标，用于判断样式引用的图片是否安全。
SVG_URL = re.compile('url\\(\\s*([\'\\"]?)(.*?)\\1\\s*\\)', re.IGNORECASE)
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
def xml_local_name(value: str) -> str:
    """取 XML 名称的本地部分（去掉 {namespace} 前缀）并统一小写。"""
    # 统一小写后就能按元素/属性名直接与白名单比较，不受大小写写法影响。
    return value.rsplit('}', 1)[-1].lower()
def svg_reference_is_safe(value: str) -> bool:
    """判断 SVG 里的一处引用是否安全。
    """
    normalized = value.strip()
    # 片段引用（渐变、滤镜等内部 id）永远安全。
    if normalized.startswith('#'):
        return True
    if not normalized.lower().startswith('data:image/'):
        return False
    # 11 是 'data:image/' 的长度：取出媒体子类型再核对白名单，并要求确实是 base64。
    media_type = normalized[11:].split(';', 1)[0].lower()
    return media_type in frozenset({'gif', 'jpg', 'png', 'jpeg', 'webp'}) and ';base64,' in normalized.lower()
def svg_style_is_safe(value: str) -> bool:
    """判断一段 CSS 文本是否安全：先过黑名单，再逐个检查 url(...) 引用。"""
    if SVG_UNSAFE_STYLE.search(value):
        return False
    return all(svg_reference_is_safe(match.group(2)) for match in SVG_URL.finditer(value))
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
    """推断 SVG 的像素尺寸：优先 width/height，缺失时按 viewBox 补算，都没有则用
    """
    view_box = None
    raw_view_box = root.attrib.get('viewBox') or root.attrib.get('viewbox')
    if raw_view_box:
        try:
            parts = [float(part) for part in re.split('[\\s,]+', raw_view_box.strip()) if part]
        except ValueError:
            parts = []
        if len(parts) == 4 and all(math.isfinite(part) for part in parts) and parts[2] > 0 and parts[3] > 0:
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
    """
    if path.stat().st_size > MAX_UPLOAD_SVG_BYTES:
        raise ValueError('SVG 文件过大，请精简后重试。')
    source = path.read_bytes()
    lowered = source.lower()
    # 一律拒绝 DOCTYPE 与 ENTITY：这是 XXE 与实体展开炸弹的入口。
    if b'<!doctype' in lowered or b'<!entity' in lowered:
        raise ValueError('SVG 不允许包含文档类型或实体声明。')
    # 解析失败即文件损坏或并非 XML，统一转成中文错误文案。
    try:
        root = ElementTree.fromstring(source)  # noqa: S314  # 解析前已拒绝 DOCTYPE/ENTITY（见上），defusedxml 可作进一步加固
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
        # style 文本可能藏 @import / expression()：不安全就清空文本（不删元素更保险）。
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
