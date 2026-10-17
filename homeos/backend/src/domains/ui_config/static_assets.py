"""UI 静态资源服务（对齐 ``modules/ui-config/static-asset.service.ts``）。

管理背景图 / 图标两类静态资源的文件系统操作，
所有路径操作经 :func:`resolve_safe_path` 防止目录穿越。
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from ...platform.core.asset_paths import (
    ALLOWED_IMAGE_EXTS,
    get_backgrounds_dir,
    get_icons_dir,
    hidden_asset_key,
    is_hidden_asset,
    load_hidden_assets,
    public_asset_url,
    resolve_safe_path,
    sanitize_uploaded_svg,
    save_hidden_assets,
)
from ...platform.core.errors import api_error, bad_request

logger = logging.getLogger("homeos.ui_config.assets")

def _background_url(*segments: str) -> str:
    return public_asset_url("backgrounds", *segments)


def _icon_url(*segments: str) -> str:
    return public_asset_url("icons", *segments)


def _ensure_dir(target: Path) -> None:
    if not target.is_dir():
        os.makedirs(target, mode=0o755, exist_ok=True)


def _write_asset(dest: Path, data: bytes) -> None:
    """原子写入资源文件（同目录临时文件 + fsync + ``os.replace``）。

    直接 ``open(dest, "wb")`` 会先截断旧文件：并发读取可能拿到 0 字节或半张图并当成功
    返回，崩溃后也会留下被布局 / 显示端引用的截断素材。本仓库其它写入点
    （effect-variant、studio3d、render-cache）都走「临时文件 + replace」，这里对齐。
    """
    fd, temp_name = tempfile.mkstemp(prefix=f".{dest.name}.", dir=str(dest.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, dest)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise
    try:
        os.chmod(dest, 0o644)
    except OSError:
        pass


def _sort_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(entries, key=lambda item: (0 if item["type"] == "dir" else 1, item["name"]))


def list_image_assets(
    builtin_root: Path,
    user_root: Path,
    ui_assets_root: Path,
    kind: str,
    public_url,
    sub_path: str,
    log_label: str,
    allowed_exts: frozenset[str] = ALLOWED_IMAGE_EXTS,
) -> list[dict[str, Any]]:
    """列出图片资源：随包默认层 + 用户层合并，用户层同名优先、被隐藏项剔除。"""
    try:
        hidden = load_hidden_assets(ui_assets_root)
        user_dir = resolve_safe_path(user_root, sub_path) if sub_path else Path(user_root).resolve()
        _ensure_dir(user_dir)
        builtin_dir = resolve_safe_path(builtin_root, sub_path) if sub_path else Path(builtin_root).resolve()
        # 子目录本身被隐藏（删的是它的祖先）时，随包层整层跳过。
        builtin_visible = not is_hidden_asset(hidden, kind, sub_path) if sub_path else True
        entries: dict[str, dict[str, Any]] = {}
        # 先随包默认层、后用户层：同名时用户层覆盖（用户上传的图覆盖默认图）。
        for is_builtin, base in ((True, builtin_dir), (False, user_dir)):
            if not base.is_dir():
                continue
            if is_builtin and not builtin_visible:
                continue
            for item in sorted(os.scandir(base), key=lambda entry: entry.name):
                path = Path(item.path)
                if is_builtin and is_hidden_asset(hidden, kind, _relative_rel(sub_path, item.name)):
                    continue
                if item.is_dir():
                    entries[item.name] = {"name": item.name, "type": "dir"}
                    continue
                if path.suffix.lower() not in allowed_exts:
                    continue
                entries[item.name] = {
                    "name": item.name,
                    "type": "file",
                    "url": public_url(sub_path, item.name),
                    "size": path.stat().st_size,
                }
        return _sort_entries(list(entries.values()))
    except Exception as exc:
        logger.error('列出%s失败,路径 "%s": %s', log_label, sub_path, exc)
        return []


def _relative_rel(sub_path: str, name: str) -> str:
    return f"{sub_path.strip('/')}/{name}" if sub_path else name


def create_image_directory(
    builtin_root: Path, user_root: Path, sub_path: str, log_label: str
) -> dict[str, Any]:
    """在用户层创建子目录（合并视图里已存在则 400，与单目录时期行为一致）。"""
    builtin_target = resolve_safe_path(builtin_root, sub_path) if sub_path else Path(builtin_root).resolve()
    user_target = resolve_safe_path(user_root, sub_path) if sub_path else Path(user_root).resolve()
    if builtin_target.exists() or user_target.exists():
        bad_request(api_error("UI_CONFIG_DIR_EXISTS"))
    os.makedirs(user_target, mode=0o755, exist_ok=True)
    logger.info("%s目录已创建:%s", log_label, sub_path)
    return {"success": True, "path": sub_path}


def save_image_asset(
    user_root: Path,
    public_url,
    filename: str,
    buffer: bytes,
    sub_path: str,
    log_label: str,
) -> dict[str, Any]:
    """保存上传的图片到用户层（扩展名白名单 + basename 防穿越）。"""
    target_dir = resolve_safe_path(user_root, sub_path) if sub_path else Path(user_root).resolve()
    _ensure_dir(target_dir)
    safe_name = os.path.basename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTS:
        bad_request(api_error("UI_CONFIG_FILE_TYPE_DENIED", ext))
    # SVG 必须与图标一样严格消毒：``/backgrounds`` 是匿名可取的静态挂载，且不在
    # ``APP_SURFACE_PREFIXES`` 里（没有任何 CSP 兜底），未消毒的 SVG 就是一个可长期引用、
    # 可分享的同源脚本 —— 存储型 XSS。
    payload = sanitize_uploaded_svg(buffer) if ext == ".svg" else buffer
    dest = target_dir / safe_name
    _write_asset(dest, payload)
    logger.info("%s已保存到 %s:%s(%s 字节)", log_label, sub_path, safe_name, len(payload))
    return {"name": safe_name, "url": public_url(sub_path, safe_name)}


def delete_image_asset(
    builtin_root: Path,
    user_root: Path,
    ui_assets_root: Path,
    kind: str,
    full_path: str,
    log_label: str,
    not_found_code: str = "UI_CONFIG_FILE_NOT_FOUND",
) -> None:
    """删除资源文件或目录。

    用户层实体直接删；随包默认层不能真删（升级就会复活），改为写隐藏标记 —— 对调用方
    而言「删除随包默认素材」这个能力保持不变，而且现在才是持久的。
    """
    import shutil

    user_target = resolve_safe_path(user_root, full_path)
    builtin_target = resolve_safe_path(builtin_root, full_path)
    removed = False
    if user_target.exists():
        if user_target.is_dir():
            shutil.rmtree(user_target, ignore_errors=True)
        else:
            user_target.unlink()
        removed = True
    if builtin_target.exists():
        key = hidden_asset_key(kind, full_path)
        hidden = load_hidden_assets(ui_assets_root)
        if key not in hidden:
            hidden.add(key)
            save_hidden_assets(ui_assets_root, hidden)
        removed = True
    if not removed:
        bad_request(api_error(not_found_code))
    logger.info("%s已删除:%s", log_label, full_path)


class UiConfigStaticAssetService:
    """背景图 / 图标静态资源服务（随包默认层 + 用户可写层）。"""

    def __init__(self, ui_assets_root: Path) -> None:
        #: 用户可写层根（``<data_dir>/ui-assets``）；随包默认层来自 ``assets/icons`` /
        #: ``assets/backgrounds``，永远只读。
        self.ui_assets_root = Path(ui_assets_root)
        self.icons_root = self.ui_assets_root / "icons"
        self.backgrounds_root = self.ui_assets_root / "backgrounds"

    def ensure_dirs(self) -> None:
        for label, directory in (
            ("背景图", self.backgrounds_root),
            ("图标", self.icons_root),
        ):
            # 绝对路径只在开发者排查「上传的图去哪了」时有用，启动日志里打两行纯属噪音。
            logger.debug("%s资源目录:%s", label, directory)
            if not Path(directory).exists():
                logger.info("已创建%s资源目录:%s", label, directory)
                os.makedirs(directory, mode=0o755, exist_ok=True)

    # 安全路径（用户层：写入永远落在这里）
    def get_safe_background_path(self, sub_path: str = "") -> Path:
        return resolve_safe_path(self.backgrounds_root, sub_path)

    def get_safe_icon_path(self, sub_path: str = "") -> Path:
        return resolve_safe_path(self.icons_root, sub_path)

    # 背景图
    def list_backgrounds(self, sub_path: str = "") -> list[dict[str, Any]]:
        return list_image_assets(
            get_backgrounds_dir(),
            self.backgrounds_root,
            self.ui_assets_root,
            "backgrounds",
            _background_url,
            sub_path,
            "背景图",
        )

    def create_background_directory(self, sub_path: str) -> dict[str, Any]:
        return create_image_directory(
            get_backgrounds_dir(), self.backgrounds_root, sub_path, "背景图"
        )

    def save_background(self, filename: str, buffer: bytes, sub_path: str = "") -> dict[str, Any]:
        return save_image_asset(
            self.backgrounds_root, _background_url, filename, buffer, sub_path, "背景图"
        )

    def delete_background(self, full_path: str) -> None:
        delete_image_asset(
            get_backgrounds_dir(),
            self.backgrounds_root,
            self.ui_assets_root,
            "backgrounds",
            full_path,
            "背景图",
        )

    # 图标（仅 SVG）
    def create_icon_directory(self, sub_path: str) -> dict[str, Any]:
        return create_image_directory(get_icons_dir(), self.icons_root, sub_path, "图标")

    def list_icons(self, sub_path: str = "") -> list[dict[str, Any]]:
        return list_image_assets(
            get_icons_dir(),
            self.icons_root,
            self.ui_assets_root,
            "icons",
            _icon_url,
            sub_path,
            "图标",
            allowed_exts=frozenset({".svg"}),
        )

    def save_icon(self, filename: str, buffer: bytes, sub_path: str = "") -> dict[str, Any]:
        target_dir = self.get_safe_icon_path(sub_path) if sub_path else Path(self.icons_root).resolve()
        _ensure_dir(target_dir)
        safe_name = os.path.basename(filename)
        if not safe_name.lower().endswith(".svg"):
            bad_request(api_error("UI_CONFIG_SVG_ONLY"))
        dest = target_dir / safe_name
        safe_buffer = sanitize_uploaded_svg(buffer)
        _write_asset(dest, safe_buffer)
        logger.info("图标已保存到 %s:%s(%s 字节)", sub_path, safe_name, len(safe_buffer))
        return {
            "name": safe_name,
            "url": _icon_url(sub_path, safe_name),
            "size": len(safe_buffer),
        }

    def delete_icon(self, full_path: str) -> None:
        delete_image_asset(
            get_icons_dir(),
            self.icons_root,
            self.ui_assets_root,
            "icons",
            full_path,
            "图标",
            not_found_code="UI_CONFIG_ICON_NOT_FOUND",
        )


__all__ = [
    "UiConfigStaticAssetService",
    "create_image_directory",
    "delete_image_asset",
    "list_image_assets",
    "save_image_asset",
]
