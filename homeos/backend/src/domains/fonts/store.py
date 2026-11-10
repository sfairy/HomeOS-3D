"""用户上传字体的落盘存储。

目录布局：``<root>/<32hex>/font<suffix>`` + ``info.json``。写入先落到同级
``.upload-<hex>`` 临时目录，元数据写完再整体 ``rename``，中途失败不会留下半个条目。
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from pathlib import Path
from typing import Any
from uuid import uuid4

from .constants import FONT_ID, FONT_ID_PREFIX, FONT_TYPES, MAX_FONTS
from .validation import validate_font_file
from ...platform.core.runtime.atomic_write import ensure_private_dir, restrict_private_file

_INFO_FILE = "info.json"

logger = logging.getLogger(__name__)


class FontStore:
    def __init__(self, root: Path) -> None:
        self.root = root

    def _directory(self, font_id: str) -> Path | None:
        if FONT_ID.fullmatch(font_id) is None:
            return None
        return self.root / font_id.removeprefix(FONT_ID_PREFIX)

    def entry(self, font_id: str) -> tuple[dict[str, Any], Path] | None:
        """``(条目, 字体文件路径)``；不存在或元数据损坏时返回 ``None``。"""
        directory = self._directory(font_id)
        if directory is None or directory.is_symlink() or not directory.is_dir():
            return None
        try:
            info = json.loads((directory / _INFO_FILE).read_text(encoding="utf-8"))
            suffix = str(info["suffix"])
            if suffix not in FONT_TYPES:
                return None
            path = directory / f"font{suffix}"
            if path.is_symlink() or not path.is_file():
                return None
            body = {
                "id": font_id,
                "name": str(info["name"]),
                "role": "both",
                "source": "user",
                "weight": str(info.get("weight") or "400"),
                "size": int(info["size"]),
                "url": f"/api/v1/fonts/user/{directory.name}?v={str(info['sha256'])[:16]}",
            }
        except (OSError, ValueError, KeyError, TypeError):  # fmt: skip
            logger.warning("字体条目元数据无法读取，已跳过：%s", directory, exc_info=True)
            return None
        return body, path

    def entries(self) -> list[dict[str, Any]]:
        if not self.root.is_dir():
            return []
        items = []
        for directory in self.root.iterdir():
            found = self.entry(f"{FONT_ID_PREFIX}{directory.name}")
            if found is not None:
                items.append(found[0])
        return sorted(items, key=lambda item: item["name"].casefold())

    def save(self, data: bytes, filename: str) -> dict[str, Any]:
        """校验并保存；同一文件重复上传直接返回已有条目。``ValueError`` 携带用户可读原因。"""
        suffix = Path(filename).suffix.lower()
        weight = validate_font_file(data, suffix)
        digest = hashlib.sha256(data).hexdigest()
        font_id = f"{FONT_ID_PREFIX}{digest[:32]}"
        existing = self.entry(font_id)
        if existing is not None:
            return existing[0]
        if len(self.entries()) >= MAX_FONTS:
            raise ValueError("最多保留 32 款上传字体，请先删除不再使用的字体。")
        ensure_private_dir(self.root)
        staging = self.root / f".upload-{uuid4().hex}"
        try:
            ensure_private_dir(staging)
            font_path = staging / f"font{suffix}"
            font_path.write_bytes(data)
            info = {
                "name": Path(filename).stem[:120] or "字体",
                "suffix": suffix,
                "size": len(data),
                "weight": weight,
                "sha256": digest,
                "role": "both",
            }
            info_path = staging / _INFO_FILE
            info_path.write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
            restrict_private_file(font_path)
            restrict_private_file(info_path)
            staging.replace(self.root / digest[:32])
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
        saved = self.entry(font_id)
        if saved is None:
            raise ValueError("字体保存失败，请重试。")
        return saved[0]

    def delete(self, font_id: str) -> None:
        directory = self._directory(font_id)
        if directory is not None and directory.is_dir() and not directory.is_symlink():
            shutil.rmtree(directory)
