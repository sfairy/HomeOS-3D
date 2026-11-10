"""仪表盘字体目录与用户字体上传（对齐 0.8.6 的 ``api/fonts.py``）。

- ``GET /fonts``：``{builtin, uploaded}``——内置字体（``assets-default/fonts/catalog.json``）
  与查看者可见的上传字体；
- ``POST /fonts/user``：原始字节上传，文件名走 ``X-File-Name``（URL 编码）；
- ``GET /fonts/user/{id}``：字体文件，内容寻址（URL 带 ``?v=``）故可长缓存；
- ``DELETE /fonts/user/{id}``：仍被任一仪表盘草稿引用时 409。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse

from ..dependencies import (
    DatabaseSession,
    LicensedUser,
    LicensedViewer,
    require_license_feature,
    viewer_asset_ids,
)
from ..domains.fonts import FONT_TYPES, MAX_FONT_BYTES
from ..domains.license import features as feature_codes
from ..panel.asset_refs import document_asset_ids, saved_project_documents
from ..platform.core.http.asset_paths import get_fonts_dir
from ..platform.core.http.frontend_static import FONTS_MOUNT_PREFIX
from ..platform.core.runtime.async_work import durable_work

logger = logging.getLogger("homeos.api.fonts")

router = APIRouter(prefix="/fonts")

_IMMUTABLE_CACHE = "private, max-age=31536000, immutable"


def _builtin_fonts() -> list[dict[str, Any]]:
    """内置字体条目；目录缺失或损坏时退化为空列表（仪表盘回退设备字体）。"""
    try:
        catalog = json.loads((get_fonts_dir() / "catalog.json").read_text(encoding="utf-8"))
        items = catalog["fonts"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("内置字体目录读取失败：%s", error)
        return []
    fonts = []
    for item in items:
        if not isinstance(item, dict) or not item.get("id") or not item.get("file"):
            continue
        version = str(item.get("sha256") or "")[:16]
        body = {
            "id": str(item["id"]),
            "name": str(item.get("name") or item["id"]),
            "role": str(item.get("role") or "both"),
            "source": "builtin",
            "weight": str(item.get("weight") or "400"),
            "size": int(item.get("size") or 0),
            "url": f"{FONTS_MOUNT_PREFIX}/{item['file']}?v={version}",
        }
        if item.get("license"):
            body["licenseUrl"] = f"{FONTS_MOUNT_PREFIX}/{item['license']}"
        fonts.append(body)
    return fonts


def _valid_upload_name(filename: str) -> bool:
    return bool(
        filename
        and not filename.startswith(".")
        and Path(filename).name == filename
        and "/" not in filename
        and "\\" not in filename
        and not any(ord(character) < 32 or ord(character) == 127 for character in filename)
        and len(filename.encode("utf-8")) <= 240
    )


@router.get("")
def list_fonts(request: Request, database: DatabaseSession, viewer: LicensedViewer) -> dict:
    allowed = viewer_asset_ids(database, viewer)
    uploaded = [
        item for item in request.app.state.asset_catalog.fonts.entries() if allowed is None or item["id"] in allowed
    ]
    return {"builtin": _builtin_fonts(), "uploaded": uploaded}


@router.post("/user", status_code=status.HTTP_201_CREATED)
async def upload_font(request: Request, _user: LicensedUser) -> dict:
    require_license_feature(request, feature_codes.FEATURE_ASSETS)
    try:
        filename = unquote(request.headers.get("x-file-name", ""))
    except (UnicodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="字体文件名无效。") from error
    if not _valid_upload_name(filename) or Path(filename).suffix.lower() not in FONT_TYPES:
        raise HTTPException(status_code=422, detail="字体文件名无效。")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_FONT_BYTES:
            raise HTTPException(status_code=413, detail="字体文件最大为 32 MB。")
    catalog = request.app.state.asset_catalog

    def save() -> dict:
        with catalog.mutation_lock:
            return catalog.fonts.save(bytes(data), filename)

    try:
        return await durable_work(save)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/user/{font_id}")
def read_font(font_id: str, request: Request, database: DatabaseSession, viewer: LicensedViewer) -> FileResponse:
    full_id = f"font:{font_id}"
    allowed = viewer_asset_ids(database, viewer)
    if allowed is not None and full_id not in allowed:
        raise HTTPException(status_code=403, detail="该字体不属于当前中控仪表盘。")
    found = request.app.state.asset_catalog.fonts.entry(full_id)
    if found is None:
        raise HTTPException(status_code=404, detail="字体不存在。")
    _body, path = found
    response = FileResponse(path, media_type=FONT_TYPES[path.suffix.lower()])
    response.headers["Cache-Control"] = _IMMUTABLE_CACHE
    return response


@router.delete("/user/{font_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_font(font_id: str, request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    require_license_feature(request, feature_codes.FEATURE_ASSETS)
    catalog = request.app.state.asset_catalog
    full_id = f"font:{font_id}"
    with catalog.mutation_lock:
        if catalog.fonts.entry(full_id) is None:
            raise HTTPException(status_code=404, detail="字体不存在。")
        for _project_id, document in saved_project_documents(database):
            if full_id in document_asset_ids(document):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="字体仍被仪表盘使用，请先替换并保存后再删除。",
                )
        catalog.fonts.delete(full_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
