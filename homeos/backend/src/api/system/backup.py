"""系统备份路由（``/api/v1/system/backup/*``）。

覆盖：
- 定时自动备份状态（``GET /system/backup/auto/status``）；
- 服务器全量备份包（含数据库）的生成 / 列出 / 下载 / 还原 / 删除（``/system/backup/files*``）。

鉴权：全部接口仅管理员可访问（JwtAuthGuard + RolesGuard + @Roles('admin')）。
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Body, Depends, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from ..backup_guard import verify_admin_password
from ..router import NestRouter
from ...domains.backup.business_backup import BackupError, refresh_runtime_after_restore
from ...platform.core.http.errors import BusinessException
from ...platform.security.auth_context import require_user
from ...platform.security.request_origin import require_same_origin_write

router = NestRouter(prefix="/system/backup", tags=["system"])


class RestoreServerBackupRequest(BaseModel):
    """服务器快照还原请求。

    ``adminPassword`` 是**强制**的：这条路由会用备份包整体覆盖数据库（含账号与授权），
    与业务备份恢复同样不可撤销。只有 ``confirm`` 不足以证明此刻是本人操作 —— 一条被窃取
    的会话 Cookie 就能完成清库。
    """

    name: str = Field(default="", max_length=255)
    confirm: bool = False
    adminPassword: str = Field(default="", max_length=128)


def _server(request: Request):
    return request.app.state.server_backup


def _auto(request: Request):
    return request.app.state.auto_backup


def _gate(request: Request):
    """备份协调器（维护标记 / 串行锁）；未装配时返回 None。"""
    return getattr(request.app.state, "business_backup", None)


# 自动备份状态
@router.get("/auto/status")
async def auto_backup_status(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return {"success": True, "data": _auto(request).get_status()}


# 服务器全量备份包文件
@router.post("/files/create")
async def create_server_backup(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    gate = _gate(request)
    runner = gate.run_exclusive if gate is not None else asyncio.to_thread
    return await runner(_server(request).create_backup)


@router.get("/files")
async def list_server_backup_files(
    request: Request, user: dict[str, Any] = Depends(require_user)
):
    return {"success": True, "data": await asyncio.to_thread(_server(request).list_files)}


@router.get("/files/download")
async def download_server_backup_file(
    request: Request,
    name: str = Query(default=""),
    user: dict[str, Any] = Depends(require_user),
):
    path = await asyncio.to_thread(_server(request).resolve_file_path, name)
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=path.name,
    )


@router.delete("/files")
async def delete_server_backup_file(
    request: Request,
    name: str = Query(default=""),
    user: dict[str, Any] = Depends(require_user),
):
    data = await asyncio.to_thread(_server(request).delete_file, name)
    return {"success": True, "data": data}


@router.post("/files/restore")
async def restore_server_backup_file(
    request: Request,
    payload: RestoreServerBackupRequest = Body(default_factory=RestoreServerBackupRequest),
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    gate = _gate(request)
    if gate is not None and gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    if gate is not None and gate.maintenance:
        return JSONResponse(
            status_code=503,
            content={"detail": "正在恢复业务数据，请稍候…"},
        )
    # 覆盖数据库前重验当前管理员密码（含失败限流）：与 /backups/restore 同一道门，
    # 且必须在置 maintenance 之前完成，否则密码校验期间的并发请求会被误判为"正在恢复"。
    password_error = await verify_admin_password(request, user, payload.adminPassword)
    if password_error is not None:
        return password_error
    database = getattr(request.app.state, "database", None)
    if gate is not None:
        gate.maintenance = True
    try:
        runner = gate.run_exclusive if gate is not None else asyncio.to_thread
        result = await runner(
            _server(request).restore_file,
            str(payload.name or ""),
            {"confirm": payload.confirm is True},
            dispose=(database.engine.dispose if database is not None else None),
        )
    except BackupError as error:
        return JSONResponse(
            status_code=400,
            content={"detail": str(error) or "恢复失败，已保留原业务数据。"},
        )
    except BusinessException:
        # 文件名非法 / 未找到 / 未确认等结构化错误：交给全局处理器保留 errorCode。
        raise
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"detail": "恢复失败，已保留原业务数据，请重新选择备份包。"},
        )
    finally:
        if gate is not None:
            gate.maintenance = False
    # 数据库已整体替换：重建系统配置 / 素材目录 / HA 连接等进程内缓存
    await refresh_runtime_after_restore(request.app)
    if gate is not None:
        await gate.prune_rollbacks_async()
    return {"success": True, "data": result}
