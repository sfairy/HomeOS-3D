"""静态资源路径与公开 URL 工具（对齐 ``project-paths.util.ts`` / ``public-url.util.ts`` /
``http-security/path.util.ts`` 的 SVG 消毒子集）。

目录解析顺序：环境变量覆盖 → 仓库 ``assets/<name>`` → ``backend/assets/<name>``。
"""

from __future__ import annotations

import os
from pathlib import Path

from ..config import PROJECT_ROOT, REPO_ROOT
from .errors import api_error, bad_request

#: 允许上传的图片扩展名。
ALLOWED_IMAGE_EXTS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"})

#: 仓库级资源目录（monorepo 开发态）。
_REPO_ASSETS = REPO_ROOT / "assets"

#: 后端本级资源目录（生产态 / 独立部署）。
_LOCAL_ASSETS = PROJECT_ROOT / "assets"


def _assets_root() -> Path:
    return _REPO_ASSETS if _REPO_ASSETS.is_dir() else _LOCAL_ASSETS


def _asset_dir(env_name: str, default_name: str) -> Path:
    override = os.getenv(env_name, "").strip()
    if override:
        return Path(override).expanduser()
    return _assets_root() / default_name


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


_BLOCKED_SVG_PATTERNS = (
    r"<script[\s>]",
    r"javascript:",
    r"data:\s*text/html",
    r"\bon\w+\s*=",
    r"<foreignObject[\s>]",
    r"<iframe[\s>]",
    r"<embed[\s>]",
    r"<object[\s>]",
    r"<use[^>]+href\s*=\s*[\"']?\s*javascript:",
)


def sanitize_uploaded_svg(raw: bytes) -> bytes:
    """上传 SVG 基础消毒（存储型 XSS 最后一道防线），非法内容抛 400。"""
    import re

    text = raw.decode("utf-8", errors="replace").strip()
    if not text:
        bad_request("SVG 内容为空")
    if not re.match(r"^<\s*svg[\s>]", text, re.IGNORECASE):
        bad_request("文件须以 <svg> 根元素开头")
    for pattern in _BLOCKED_SVG_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            bad_request("SVG 含有不允许的脚本或嵌入内容")
    return text.encode("utf-8")


__all__ = [
    "ALLOWED_IMAGE_EXTS",
    "get_backgrounds_dir",
    "get_icons_dir",
    "get_logo_dir",
    "get_sounds_dir",
    "public_asset_url",
    "resolve_safe_path",
    "sanitize_uploaded_svg",
]
