"""UI 静态资源服务（对齐 ``modules/ui-config/static-asset.service.ts``）。

管理背景图 / 图标两类静态资源的文件系统操作，
所有路径操作经 :func:`resolve_safe_path` 防止目录穿越。
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from ...core.asset_paths import (
    ALLOWED_IMAGE_EXTS,
    get_backgrounds_dir,
    get_icons_dir,
    public_asset_url,
    resolve_safe_path,
    sanitize_uploaded_svg,
)
from ...core.errors import api_error, bad_request

logger = logging.getLogger("homeos.ui_config.assets")


def _background_url(*segments: str) -> str:
    return public_asset_url("backgrounds", *segments)


def _icon_url(*segments: str) -> str:
    return public_asset_url("icons", *segments)


def _ensure_dir(target: Path) -> None:
    if not target.is_dir():
        os.makedirs(target, mode=0o755, exist_ok=True)


def _sort_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(entries, key=lambda item: (0 if item["type"] == "dir" else 1, item["name"]))


def list_image_assets(
    root_dir: Path,
    public_url,
    sub_path: str,
    log_label: str,
    allowed_exts: frozenset[str] = ALLOWED_IMAGE_EXTS,
) -> list[dict[str, Any]]:
    """列出图片资源目录下的文件与子目录（背景图共用）。"""
    try:
        target_dir = resolve_safe_path(root_dir, sub_path) if sub_path else Path(root_dir).resolve()
        _ensure_dir(target_dir)
        entries: list[dict[str, Any]] = []
        for item in sorted(os.scandir(target_dir), key=lambda entry: entry.name):
            path = Path(item.path)
            if item.is_dir():
                entries.append({"name": item.name, "type": "dir"})
                continue
            if path.suffix.lower() not in allowed_exts:
                continue
            entries.append(
                {
                    "name": item.name,
                    "type": "file",
                    "url": public_url(sub_path, item.name),
                    "size": path.stat().st_size,
                }
            )
        return _sort_entries(entries)
    except Exception as exc:
        logger.error('列出%s失败,路径 "%s": %s', log_label, sub_path, exc)
        return []


def create_image_directory(root_dir: Path, sub_path: str, log_label: str) -> dict[str, Any]:
    """在图片资源根目录下创建子目录（已存在则 400）。"""
    target_dir = resolve_safe_path(root_dir, sub_path) if sub_path else Path(root_dir).resolve()
    if target_dir.exists():
        bad_request(api_error("UI_CONFIG_DIR_EXISTS"))
    os.makedirs(target_dir, mode=0o755, exist_ok=True)
    logger.info("%s目录已创建:%s", log_label, sub_path)
    return {"success": True, "path": sub_path}


def save_image_asset(
    root_dir: Path,
    public_url,
    filename: str,
    buffer: bytes,
    sub_path: str,
    log_label: str,
) -> dict[str, Any]:
    """保存上传的图片文件（扩展名白名单 + basename 防穿越）。"""
    target_dir = resolve_safe_path(root_dir, sub_path) if sub_path else Path(root_dir).resolve()
    _ensure_dir(target_dir)
    safe_name = os.path.basename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        bad_request(api_error("UI_CONFIG_FILE_TYPE_DENIED", ext))
    dest = target_dir / safe_name
    dest.write_bytes(buffer)
    try:
        os.chmod(dest, 0o644)
    except OSError:
        pass
    logger.info("%s已保存到 %s:%s(%s 字节)", log_label, sub_path, safe_name, len(buffer))
    return {"name": safe_name, "url": public_url(sub_path, safe_name)}


def delete_image_asset(root_dir: Path, full_path: str, log_label: str) -> None:
    """删除资源文件或目录（支持递归删除目录）。"""
    import shutil

    target = resolve_safe_path(root_dir, full_path)
    if not target.exists():
        bad_request(api_error("UI_CONFIG_FILE_NOT_FOUND"))
    if target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        logger.info("%s目录已删除:%s", log_label, full_path)
    else:
        target.unlink()
        logger.info("%s已删除:%s", log_label, full_path)


class UiConfigStaticAssetService:
    """背景图 / 图标静态资源服务。"""

    def ensure_dirs(self) -> None:
        for label, directory in (
            ("背景图", get_backgrounds_dir()),
        ):
            logger.info("%s资源目录:%s", label, directory)
            if not Path(directory).exists():
                logger.info("正在创建资源目录:%s", directory)
                os.makedirs(directory, mode=0o755, exist_ok=True)

    # ------------------------------------------------------------------ #
    # 安全路径
    # ------------------------------------------------------------------ #
    def get_safe_background_path(self, sub_path: str = "") -> Path:
        return resolve_safe_path(get_backgrounds_dir(), sub_path)

    def get_safe_icon_path(self, sub_path: str = "") -> Path:
        return resolve_safe_path(get_icons_dir(), sub_path)

    # ------------------------------------------------------------------ #
    # 背景图
    # ------------------------------------------------------------------ #
    def list_backgrounds(self, sub_path: str = "") -> list[dict[str, Any]]:
        return list_image_assets(get_backgrounds_dir(), _background_url, sub_path, "背景图")

    def create_background_directory(self, sub_path: str) -> dict[str, Any]:
        return create_image_directory(get_backgrounds_dir(), sub_path, "背景图")

    def save_background(self, filename: str, buffer: bytes, sub_path: str = "") -> dict[str, Any]:
        return save_image_asset(
            get_backgrounds_dir(), _background_url, filename, buffer, sub_path, "背景图"
        )

    def delete_background(self, full_path: str) -> None:
        delete_image_asset(get_backgrounds_dir(), full_path, "背景图")

    # ------------------------------------------------------------------ #
    # 图标（仅 SVG）
    # ------------------------------------------------------------------ #
    def create_icon_directory(self, sub_path: str) -> dict[str, Any]:
        target_dir = self.get_safe_icon_path(sub_path) if sub_path else Path(get_icons_dir()).resolve()
        if target_dir.exists():
            bad_request(api_error("UI_CONFIG_DIR_EXISTS"))
        os.makedirs(target_dir, mode=0o755, exist_ok=True)
        logger.info("图标目录已创建:%s", sub_path)
        return {"success": True, "path": sub_path}

    def list_icons(self, sub_path: str = "") -> list[dict[str, Any]]:
        return list_image_assets(
            get_icons_dir(), _icon_url, sub_path, "图标", allowed_exts=frozenset({".svg"})
        )

    def save_icon(self, filename: str, buffer: bytes, sub_path: str = "") -> dict[str, Any]:
        target_dir = self.get_safe_icon_path(sub_path) if sub_path else Path(get_icons_dir()).resolve()
        _ensure_dir(target_dir)
        safe_name = os.path.basename(filename)
        if not safe_name.lower().endswith(".svg"):
            bad_request(api_error("UI_CONFIG_SVG_ONLY"))
        dest = target_dir / safe_name
        safe_buffer = sanitize_uploaded_svg(buffer)
        dest.write_bytes(safe_buffer)
        try:
            os.chmod(dest, 0o644)
        except OSError:
            pass
        logger.info("图标已保存到 %s:%s(%s 字节)", sub_path, safe_name, len(safe_buffer))
        return {
            "name": safe_name,
            "url": _icon_url(sub_path, safe_name),
            "size": len(safe_buffer),
        }

    def delete_icon(self, full_path: str) -> None:
        import shutil

        target = self.get_safe_icon_path(full_path)
        if not target.exists():
            bad_request(api_error("UI_CONFIG_ICON_NOT_FOUND"))
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
            logger.info("图标目录已删除:%s", full_path)
        else:
            target.unlink()
            logger.info("图标已删除:%s", full_path)


__all__ = [
    "UiConfigStaticAssetService",
    "create_image_directory",
    "delete_image_asset",
    "list_image_assets",
    "save_image_asset",
]
