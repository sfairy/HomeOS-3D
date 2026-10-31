"""静态资源路径与公开 URL 工具（对齐 ``project-paths.util.ts`` / ``public-url.util.ts`` /
``http-security/path.util.ts`` 的 SVG 消毒子集）。

目录解析顺序：单项环境变量（``ICONS_DIR`` 等）→ ``HOMEOS_ASSETS_DIR``（实例目录，容器里
跟宿主机 ``./assets`` bind mount）→ 工作区 ``assets/<name>`` → 仓库 ``assets/<name>`` →
随包默认素材 ``assets-default/<name>`` → ``backend/assets/<name>``。
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from xml.etree import ElementTree

from .errors import api_error, bad_request
from ...config import PROJECT_ROOT, REPO_ROOT, WORKSPACE_ROOT

#: 允许上传的图片扩展名。
ALLOWED_IMAGE_EXTS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"})

#: 用户上传目录里接受的图片扩展名（比 ``ALLOWED_IMAGE_EXTS`` 宽：历史数据里有这些格式，
#: 读取侧不能因为换了白名单就读不出旧素材）。原先住在 ``api/assets.py``，
#: 但 3D 模块也要按它判素材文件，于是模块层不得不 import ``api`` —— 这里下沉为平台叶子。
UPLOAD_IMAGE_SUFFIXES = frozenset(
    {
        ".jpg",
        ".png",
        ".svg",
        ".jpeg",
        ".webp",
        ".gif",
        ".bmp",
        ".tif",
        ".tiff",
        ".ico",
        ".avif",
        ".heic",
        ".heif",
    }
)

#: 上传图片扩展名 → HTTP ``Content-Type``。
UPLOAD_CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    ".heic": "image/heic",
    ".heif": "image/heif",
}

#: 用户素材目录名（32 位十六进制），同时是防目录穿越的第一道形状校验。
ASSET_ID = re.compile("^[0-9a-f]{32}$")

#: 工作区级资源目录（monorepo 开发态的**实例目录**）：compose 把仓库根的 ``./assets``
#: bind mount 到容器 ``/app/assets``，源码态它就是 ``homeos/`` 的上一层那份 ``assets/``。
_WORKSPACE_ASSETS = WORKSPACE_ROOT / "assets"

#: 仓库级资源目录（``homeos/assets``，素材搬家前的旧位置；保留兼容）。
_REPO_ASSETS = REPO_ROOT / "assets"

#: 随包默认素材种子（镜像里由 entrypoint 铺入实例目录；源码态没有 entrypoint，
#: 直接作为兜底层 —— 否则开发态 ``/backgrounds``、``/icons`` 会整类 404）。
_DEFAULT_ASSETS = REPO_ROOT / "assets-default"

#: 后端本级资源目录（生产态 / 独立部署）。
_LOCAL_ASSETS = PROJECT_ROOT / "assets"


def _asset_roots() -> tuple[Path, ...]:
    """实例素材根候选：``HOMEOS_ASSETS_DIR`` 优先，其次工作区 / 仓库 ``assets/``。

    显式配了 ``HOMEOS_ASSETS_DIR`` 就只认它（容器口径：entrypoint 负责铺种子）；
    源码态没有该变量，按「实例目录 → 旧仓库目录」顺序取实际存在的那些。
    """
    override = os.getenv("HOMEOS_ASSETS_DIR", "").strip()
    if override:
        return (Path(override).expanduser(),)
    return tuple(
        candidate
        for candidate in (_WORKSPACE_ASSETS, _REPO_ASSETS)
        if candidate.is_dir()
    )


def _asset_dir(env_name: str, default_name: str) -> Path:
    override = os.getenv(env_name, "").strip()
    if override:
        return Path(override).expanduser()
    # 逐层找「确实有这个子目录」的根：实例目录常常只放了被替换过的那几类，
    # 其余类目必须回落到随包种子，而不是整类 404。
    for root in (*_asset_roots(), _DEFAULT_ASSETS):
        candidate = root / default_name
        if candidate.is_dir():
            return candidate
    return _LOCAL_ASSETS / default_name


def get_icons_dir() -> Path:
    """图标目录（对外 URL ``/icons/...``）。"""
    return _asset_dir("ICONS_DIR", "icons")


def get_backgrounds_dir() -> Path:
    """仪表盘背景图目录（对外 URL ``/backgrounds/...``）。"""
    return _asset_dir("BACKGROUNDS_DIR", "backgrounds")


def get_logo_dir() -> Path:
    """品牌 Logo 目录（对外 URL ``/logo/...``）。"""
    return _asset_dir("LOGO_DIR", "logo")


def get_sounds_dir() -> Path:
    """音效目录（对外 URL ``/sounds/...``）。"""
    return _asset_dir("SOUNDS_DIR", "sounds")


def get_ui_assets_dir() -> Path:
    """用户可写 UI 静态资源根（图标 / 背景图上传层）。

    仅作为**兜底**：正式装配会传入 ``Settings.ui_assets_dir``（位于 ``data_dir`` 下）。
    """
    override = os.getenv("HOMEOS_UI_ASSETS_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    return REPO_ROOT / "data" / "ui-assets"


def public_asset_url(root: str, *segments: str) -> str:
    """拼接静态资源公开访问 URL（空片段忽略、反斜杠归一、单前导斜杠）。"""
    base = str(root or "").strip("/")
    tail = "/".join(segment for segment in segments if segment)
    tail = tail.replace("\\", "/").strip("/")
    if not base:
        return f"/{tail}" if tail else "/"
    return f"/{base}/{tail}" if tail else f"/{base}"


def resolve_safe_path(root_dir: str | Path, sub_path: str = "") -> Path:
    """在根目录下解析安全路径（拒绝目录穿越与根目录本身）。"""
    root = Path(root_dir).resolve()
    target = (root / (sub_path or "")).resolve()
    relative = os.path.relpath(target, root)
    if relative.startswith("..") or relative == ".":
        bad_request(api_error("UI_CONFIG_PATH_TRAVERSAL"))
    return target


#: SVG 命名空间（浏览器按 XML 解析 SVG，非本命名空间的元素/属性一律剔除）。
SVG_NAMESPACE = "http://www.w3.org/2000/svg"
XLINK_NAMESPACE = "http://www.w3.org/1999/xlink"
#: ``style`` / ``url()`` 中的危险表达式。
SVG_UNSAFE_STYLE = re.compile(
    r"(?:@import|expression\s*\(|javascript\s*:|-moz-binding)", re.IGNORECASE
)
#: 属性值中的危险引用（``javascript:`` / ``vbscript:`` / ``data:text/html``）。
SVG_UNSAFE_REFERENCE = re.compile(
    r"(?:javascript|vbscript)\s*:|data\s*:\s*text/html", re.IGNORECASE
)
#: 按本地名屏蔽的元素（与命名空间前缀无关，任何写法都拦）。
SVG_BLOCKED_ELEMENTS = frozenset(
    {
        "script",
        "foreignobject",
        "iframe",
        "embed",
        "object",
        "audio",
        "video",
        "canvas",
        "set",
        "animate",
        "animatemotion",
        "animatetransform",
        "discard",
    }
)
_SVG_URL = re.compile(r"url\(\s*['\"]?(.*?)['\"]?\s*\)", re.IGNORECASE)
MAX_SVG_BYTES = 5_000_000
_MAX_SVG_ELEMENTS = 20_000


def _svg_style_is_safe(value: str) -> bool:
    if SVG_UNSAFE_STYLE.search(value):
        return False
    return all(_svg_reference_is_safe(match.group(1)) for match in _SVG_URL.finditer(value))


def _svg_reference_is_safe(value: str) -> bool:
    normalized = value.strip()
    if normalized.startswith("#"):
        return True
    if not normalized.lower().startswith("data:image/"):
        return False
    media_type = normalized[11:].split(";", 1)[0].lower()
    return media_type in {"gif", "jpg", "png", "jpeg", "webp"} and ";base64," in normalized.lower()


def _xml_namespace(value: str) -> str:
    return value[1:].split("}", 1)[0] if value.startswith("{") else ""


def _xml_local_name(value: str) -> str:
    return value.rsplit("}", 1)[-1].lower()


def sanitize_uploaded_svg(raw: bytes) -> bytes:
    """按 **XML 语义**消毒上传的 SVG（存储型 XSS 的最后一道防线）。

    必须是解析式而非正则式：浏览器把 SVG 当 XML 解析，``<s:script>`` 这类带命名空间
    前缀的写法能绕过 ``<script>`` 的文本匹配并照常执行；``&#106;avascript:`` 也会绕过
    ``javascript:`` 的文本匹配（属性值里的字符引用会被解码后执行）。这里解析成元素树后：
    剔除文档类型 / 实体声明、剔除非 SVG 命名空间的元素与属性、剔除事件处理器属性、
    校验 ``style`` 与 ``url()`` 引用，再序列化回字节。非法内容抛 400。
    """
    if len(raw) > MAX_SVG_BYTES:
        bad_request("SVG 文件过大，请精简后重试。")
    lowered = raw.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        # DOCTYPE / ENTITY 先拦掉，XXE 与实体膨胀随之封死。
        bad_request("SVG 不允许包含文档类型或实体声明。")
    try:
        root = ElementTree.fromstring(raw)  # noqa: S314
    except ElementTree.ParseError:
        bad_request("SVG 文件已损坏或无法解析。")
    if _xml_local_name(root.tag) != "svg":
        bad_request("文件须以 <svg> 根元素开头")
    elements = list(root.iter())
    if len(elements) > _MAX_SVG_ELEMENTS:
        bad_request("SVG 元素数量过多，请精简后重试。")
    for parent in elements:
        for child in list(parent):
            if not isinstance(child.tag, str):
                continue
            if _xml_namespace(child.tag) not in {
                "",
                SVG_NAMESPACE,
            } or _xml_local_name(child.tag) in SVG_BLOCKED_ELEMENTS:
                parent.remove(child)
    for element in root.iter():
        if _xml_local_name(element.tag) == "style" and not _svg_style_is_safe(
            element.text or ""
        ):
            element.text = ""
        for attribute, value in list(element.attrib.items()):
            local_name = _xml_local_name(attribute)
            if local_name.startswith("on") or _xml_namespace(attribute) not in {
                "",
                XLINK_NAMESPACE,
            }:
                del element.attrib[attribute]
                continue
            if SVG_UNSAFE_REFERENCE.search(value):
                del element.attrib[attribute]
                continue
            if local_name in {"src", "href"} and not _svg_reference_is_safe(value):
                del element.attrib[attribute]
                continue
            if "url(" not in value.lower() and local_name != "style":
                continue
            if _svg_style_is_safe(value):
                continue
            del element.attrib[attribute]
    ElementTree.register_namespace("", SVG_NAMESPACE)
    ElementTree.register_namespace("xlink", XLINK_NAMESPACE)
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def user_asset_file(root: Path, asset_id: str) -> Path | None:
    """用户上传素材的单一文件：目录名形状合法、落在根内、且目录里只有一个受支持的图片。

    形状校验（``ASSET_ID``）+ ``is_relative_to`` 两道都在，防目录穿越。
    """
    if not ASSET_ID.fullmatch(asset_id):
        return None
    directory = (root / asset_id).resolve()
    if not directory.is_relative_to(root) or not directory.is_dir():
        return None
    matches = [
        item
        for item in directory.iterdir()
        if item.is_file() and not item.name.startswith(".") and item.suffix.lower() in UPLOAD_IMAGE_SUFFIXES
    ]
    return matches[0] if len(matches) == 1 else None


#: 内置素材「隐藏标记」文件：用户删除随包默认素材时只记录相对路径，而不是真去改只读的
#: 随包目录 —— 否则升级 / 重建镜像后文件会「复活」，用户以为删除失效。
HIDDEN_ASSETS_FILENAME = ".hidden-assets.json"


def hidden_asset_key(kind: str, relative_path: str) -> str:
    """隐藏标记的键：``<kind>/<相对路径>``（``kind`` 取 ``icons`` / ``backgrounds``）。"""
    return f"{kind}/{relative_path.strip('/').replace('\\', '/')}"


def is_hidden_asset(hidden: set[str], kind: str, relative_path: str) -> bool:
    """相对路径是否被隐藏；**祖先被隐藏时其后代一律算隐藏**（删目录即删子树）。"""
    parts = [segment for segment in str(relative_path).strip("/").replace("\\", "/").split("/") if segment]
    return any(hidden_asset_key(kind, "/".join(parts[:index])) in hidden for index in range(1, len(parts) + 1))


def load_hidden_assets(user_root: str | Path) -> set[str]:
    """读取隐藏标记集合；文件缺失或损坏一律当空集（宁可见也不漏资源）。"""
    path = Path(user_root) / HIDDEN_ASSETS_FILENAME
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    if not isinstance(raw, list):
        return set()
    return {str(item).strip("/").replace("\\", "/") for item in raw if isinstance(item, str) and item.strip("/")}


def save_hidden_assets(user_root: str | Path, hidden: set[str]) -> None:
    """原子写入隐藏标记集合（与其它资源写入共用「临时文件 + fsync + replace」语义）。"""
    root = Path(user_root)
    root.mkdir(parents=True, exist_ok=True)
    dest = root / HIDDEN_ASSETS_FILENAME
    payload = json.dumps(sorted(hidden), ensure_ascii=False, indent=2)
    fd, temp_name = tempfile.mkstemp(prefix=f".{HIDDEN_ASSETS_FILENAME}.", dir=str(root))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, dest)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def layered_asset_path(
    builtin_root: str | Path,
    user_root: str | Path,
    hidden: set[str],
    kind: str,
    relative_path: str,
) -> Path | None:
    """分层解析静态资源：用户层优先，其次随包默认层（被隐藏的默认素材不返回）。

    两层都做目录穿越校验；返回 ``None`` 表示资源不存在或已被用户隐藏。
    """
    relative = str(relative_path or "").strip("/").replace("\\", "/")
    if not relative or ".." in relative.split("/"):
        return None
    user_base = Path(user_root).resolve()
    user_file = user_base / relative
    if user_file.resolve().is_relative_to(user_base) and user_file.is_file():
        return user_file
    if is_hidden_asset(hidden, kind, relative):
        return None
    builtin_base = Path(builtin_root).resolve()
    builtin_file = builtin_base / relative
    if builtin_file.resolve().is_relative_to(builtin_base) and builtin_file.is_file():
        return builtin_file
    return None


__all__ = [
    "ALLOWED_IMAGE_EXTS",
    "ASSET_ID",
    "HIDDEN_ASSETS_FILENAME",
    "UPLOAD_CONTENT_TYPES",
    "UPLOAD_IMAGE_SUFFIXES",
    "get_backgrounds_dir",
    "get_icons_dir",
    "get_logo_dir",
    "get_sounds_dir",
    "get_ui_assets_dir",
    "hidden_asset_key",
    "is_hidden_asset",
    "layered_asset_path",
    "load_hidden_assets",
    "public_asset_url",
    "resolve_safe_path",
    "sanitize_uploaded_svg",
    "save_hidden_assets",
    "user_asset_file",
]
