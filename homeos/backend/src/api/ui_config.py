"""UI 配置路由（``/api/v1/config/*``，对齐 Nest ``UiConfigController``）。

覆盖：
- 激活方案 / 新终端默认策略 / 终端绑定解析与绑定（``/config/project*``、``/config/terminal*``）；
- 项目 UI 配置读取 / 保存 / 删除 / 列表 / 导入导出（``/config/project/:id``、``/config/profiles``、``/config/all/*``）；
- 背景图 / 图标静态资源的列表 / 建目录 / 上传 / 删除。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Depends, File, Query, Request, UploadFile

from ..core.asset_paths import ALLOWED_IMAGE_EXTS
from ..core.errors import api_error, bad_request
from ..security.auth_context import require_roles, require_user
from .router import NestRouter
from .schemas.base import StrictModel

router = NestRouter(prefix="/config", tags=["display"])

#: 单次批量上传的最大文件数（与 Nest ``MAX_UPLOAD_FILES`` 一致）。
MAX_UPLOAD_FILES = 100

def _service(request: Request):
    return request.app.state.ui_config

class SetActiveProfileDto(StrictModel):
    projectId: str | None = None

class SetNewTerminalDefaultDto(StrictModel):
    newTerminalDefault: str | None = None

class TerminalBindingDto(StrictModel):
    clientId: str | None = None
    profileId: str | None = None
    label: str | None = None

class SaveProjectConfigDto(StrictModel):
    layout: str | dict[str, Any] | None = None

class ImportAllConfigsDto(StrictModel):
    configs: list[dict[str, Any]] | None = None

class MkdirDto(StrictModel):
    path: str

# ---------------------------------------------------------------------- #
# 激活方案 / 终端绑定
# ---------------------------------------------------------------------- #
@router.put("/project/active")
async def set_active_profile(
    payload: SetActiveProfileDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).set_active_profile(payload.projectId)

@router.get("/project/active")
async def get_active_profile_settings(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return _service(request).get_active_profile_settings()

@router.put("/project/defaults")
async def set_new_terminal_default(
    payload: SetNewTerminalDefaultDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).set_new_terminal_default(payload.newTerminalDefault)

@router.get("/terminal/resolve")
async def resolve_terminal_profile(
    request: Request,
    clientId: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    return await _service(request).resolve_profile_for_terminal(clientId)

@router.get("/terminal/bindings")
async def list_terminal_bindings(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return _service(request).list_terminal_bindings()

@router.put("/terminal/binding/self")
async def bind_self_terminal(
    payload: TerminalBindingDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin", "adult", "child")),
):
    return await _service(request).bind_self_terminal(
        payload.model_dump(exclude_none=True), user
    )

@router.put("/terminal/binding")
async def upsert_terminal_binding(
    payload: TerminalBindingDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).upsert_terminal_binding(
        payload.model_dump(exclude_none=True), user.get("userId")
    )

@router.delete("/terminal/binding/{clientId}")
async def remove_terminal_binding(
    clientId: str,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).remove_terminal_binding(clientId)

# ---------------------------------------------------------------------- #
# 方案列表 / 导入导出
# ---------------------------------------------------------------------- #
@router.get("/profiles")
async def list_profiles(request: Request, user: dict[str, Any] = Depends(require_user)):
    return {"success": True, "data": await asyncio.to_thread(_service(request).list_profiles)}

@router.get("/all/export")
async def export_configs(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return {"success": True, "data": await asyncio.to_thread(_service(request).export_all_configs)}

@router.post("/all/import")
async def import_configs(
    payload: ImportAllConfigsDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).import_all_configs_validated(
        payload.model_dump(exclude_none=True)
    )

@router.get("/project/{projectId}")
async def get_config(
    projectId: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    return _service(request).get_config_for_api(projectId, user.get("role"))

@router.post("/project/{projectId}")
async def save_config(
    projectId: str,
    payload: SaveProjectConfigDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).save_config_from_body(
        projectId, payload.model_dump(exclude_none=True)
    )

@router.delete("/project/{projectId}")
async def delete_profile(
    projectId: str,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _service(request).delete_profile_safe(projectId)

# ---------------------------------------------------------------------- #
# 静态资源：列表
# ---------------------------------------------------------------------- #
async def _list_assets(request: Request, kind: str, sub_path: str | None) -> dict[str, Any]:
    service = _service(request)
    sub = sub_path or ""
    lister = getattr(service, f"list_{kind}")
    return {"success": True, "data": await asyncio.to_thread(lister, sub)}

@router.get("/backgrounds")
async def list_backgrounds(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    return await _list_assets(request, "backgrounds", path)

@router.get("/icons")
async def list_icons(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    return await _list_assets(request, "icons", path)

# ---------------------------------------------------------------------- #
# 静态资源：建目录
# ---------------------------------------------------------------------- #
def _require_sub_path(payload: MkdirDto) -> str:
    sub_path = (payload.path or "").strip()
    if not sub_path:
        bad_request(api_error("UI_CONFIG_PATH_REQUIRED"))
    return payload.path

def _mkdir(request: Request, method_name: str, payload: MkdirDto) -> dict[str, Any]:
    sub_path = _require_sub_path(payload)
    return {"success": True, "data": getattr(_service(request), method_name)(sub_path)}

@router.post("/backgrounds/mkdir")
async def create_background_directory(
    payload: MkdirDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return _mkdir(request, "create_background_directory", payload)

@router.post("/icons/mkdir")
async def create_icon_directory(
    payload: MkdirDto,
    request: Request,
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return _mkdir(request, "create_icon_directory", payload)

# ---------------------------------------------------------------------- #
# 静态资源：上传
# ---------------------------------------------------------------------- #
async def _upload(
    request: Request,
    files: list[UploadFile],
    sub_path: str | None,
    save_method: str,
    svg_only: bool = False,
) -> dict[str, Any]:
    if not files:
        bad_request(api_error("UI_CONFIG_FILE_REQUIRED"))
    names = [file.filename or "" for file in files]
    for name in names:
        if svg_only:
            if not name.lower().endswith(".svg"):
                bad_request(api_error("UI_CONFIG_SVG_ONLY"))
        elif _suffix(name) not in ALLOWED_IMAGE_EXTS:
            bad_request(f"不允许的文件类型：{name}")

    service = _service(request)
    saver = getattr(service, save_method)
    sub = sub_path or ""
    saved = []
    for file, name in zip(files, names, strict=False):
        buffer = await file.read()
        saved.append(await asyncio.to_thread(saver, name, buffer, sub))
    return {"success": True, "uploaded": len(saved), "data": saved}

def _suffix(name: str) -> str:
    index = name.rfind(".")
    return name[index:].lower() if index >= 0 else ""

@router.post("/backgrounds/upload")
async def upload_backgrounds(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _upload(request, files[:MAX_UPLOAD_FILES], path, "save_background")

@router.post("/icons/upload")
async def upload_icons(
    request: Request,
    files: list[UploadFile] = File(default=[]),
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return await _upload(request, files[:MAX_UPLOAD_FILES], path, "save_icon", svg_only=True)

# ---------------------------------------------------------------------- #
# 静态资源：删除
# ---------------------------------------------------------------------- #
def _delete(request: Request, method_name: str, full_path: str | None) -> dict[str, Any]:
    if not full_path:
        bad_request(api_error("UI_CONFIG_PATH_REQUIRED"))
    getattr(_service(request), method_name)(full_path)
    return {"success": True, "deleted": full_path}

@router.delete("/backgrounds")
async def delete_background(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return _delete(request, "delete_background", path)

@router.delete("/icons")
async def delete_icon(
    request: Request,
    path: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    return _delete(request, "delete_icon", path)

__all__ = ["router"]
