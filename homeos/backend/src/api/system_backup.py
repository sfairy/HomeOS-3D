"""系统备份路由（``/api/v1/system/backup/*``，对齐 Nest ``SystemBackupController``）。

覆盖：
- 定时自动备份状态（``GET /system/backup/auto/status``）；
- 完整备份包摘要 / 导出 / 导入（``GET /system/backup/bundle/*``、``POST /system/backup/bundle/import``）；
- 服务器备份包生成 / 列出 / 下载 / 导入 / 删除 / 还原（``/system/backup/files*``）。

鉴权：全部接口仅管理员可访问（JwtAuthGuard + RolesGuard + @Roles('admin')）。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Body, Depends, Query, Request

from ..core.booleans import parse_boolean_query
from ..security.auth_context import require_roles
from .router import NestRouter

router = NestRouter(prefix="/system/backup", tags=["system"])

def _bundle(request: Request):
    return request.app.state.bundle_backup

def _server(request: Request):
    return request.app.state.server_backup

def _auto(request: Request):
    return request.app.state.auto_backup

# ---------------------------------------------------------------------- #
# 自动备份状态
# ---------------------------------------------------------------------- #
@router.get("/auto/status")
async def auto_backup_status(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return {"success": True, "data": _auto(request).get_status()}

# ---------------------------------------------------------------------- #
# 完整备份包
# ---------------------------------------------------------------------- #
@router.get("/bundle/summary")
async def bundle_backup_summary(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return {"success": True, "data": _bundle(request).get_backup_summary()}

@router.get("/bundle/export")
async def export_bundle_backup(
    request: Request,
    maskSecrets: str | None = Query(default=None),
    includeEventLog: str | None = Query(default=None),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    mask = maskSecrets != "false"
    data = await asyncio.to_thread(
        _bundle(request).export_bundle,
        mask,
        {"include_event_log": parse_boolean_query(includeEventLog)},
    )
    return {"success": True, "data": data}

@router.post("/bundle/import")
async def import_bundle_backup(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    payload = body or {}
    bundle = payload.get("bundle") or payload.get("data") or payload
    return await asyncio.to_thread(
        _bundle(request).import_bundle,
        {
            "bundle": bundle,
            "appConfigMode": payload.get("appConfigMode"),
            "confirm": payload.get("confirm"),
            "sections": payload.get("sections"),
        },
    )

# ---------------------------------------------------------------------- #
# 服务器备份包文件
# ---------------------------------------------------------------------- #
@router.post("/files/create")
async def create_server_backup(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return await asyncio.to_thread(_server(request).create_backup)

@router.get("/files")
async def list_server_backup_files(
    request: Request, user: dict[str, Any] = Depends(require_roles("admin"))
):
    return {"success": True, "data": await asyncio.to_thread(_server(request).list_files)}

@router.get("/files/download")
async def download_server_backup_file(
    request: Request,
    name: str = Query(default=""),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    data = await asyncio.to_thread(_server(request).read_file_bundle, name)
    return {"success": True, "data": data}

@router.post("/files/import")
async def import_server_backup_file(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    payload = body or {}
    bundle = payload.get("bundle") or payload.get("data") or payload
    data = await asyncio.to_thread(
        _server(request).import_local_file, bundle, payload.get("name")
    )
    return {"success": True, "data": data}

@router.delete("/files")
async def delete_server_backup_file(
    request: Request,
    name: str = Query(default=""),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    data = await asyncio.to_thread(_server(request).delete_file, name)
    return {"success": True, "data": data}

@router.post("/files/restore")
async def restore_server_backup_file(
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    user: dict[str, Any] = Depends(require_roles("admin")),
):
    payload = body or {}
    return await asyncio.to_thread(
        _server(request).restore_file,
        str(payload.get("name") or ""),
        {
            "confirm": payload.get("confirm") is True,
            "appConfigMode": payload.get("appConfigMode"),
            "sections": payload.get("sections"),
        },
    )
