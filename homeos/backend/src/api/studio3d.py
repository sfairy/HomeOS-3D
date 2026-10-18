"""3D 户型图（Studio 3D）草稿与导出接口。

薄路由层：业务全部在 domains/studio3d。本文件只负责鉴权依赖、参数解析、流式收包、
状态码与操作日志 —— 一个 handler 超过一屏就说明业务该往下沉了。

拆分前后对外契约完全不变：
- GET    /studio3d
- PUT    /studio3d（revision 乐观并发，409 STUDIO3D_REVISION_CONFLICT / 428 确认）
- GET    /studio3d/exports/check
- POST   /studio3d/exports
- DELETE /studio3d/exports
"""

from __future__ import annotations

import os
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response, status
from starlette.concurrency import run_in_threadpool

from ..dependencies import DatabaseSession, LicensedUser
from ..domains.studio3d import export_service, service
from ..platform.core.upload_limits import MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES
from ..schemas import Studio3DDraftUpdate

router = APIRouter(prefix="/studio3d", tags=["studio3d"])


def _deliver_pending(request: Request, database: DatabaseSession) -> None:
    """兼容 api.backups 的历史导入：旧「待投递」指针现在并入 studio_drafts。

    旧实现把「待写文件」放在 studio_interaction_sync.document_json.pending，并在每次
    GET/PUT 时补写文件。文件不再是权威存储，这里只把残渣收敛进数据库然后清除，
    不写任何文件 —— 备份链路因此也不再有机会回放一个旧场景。
    """
    service.deliver_legacy_pending(database, request.app.state.settings)


@router.get("")
def get_studio3d_draft(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    return service.get_draft(database, request.app.state.settings)


@router.put("")
def update_studio3d_draft(
    payload: Studio3DDraftUpdate,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict:
    updated = service.save_draft(database, request.app.state.settings, _user, payload)
    request.app.state.global_log.append(
        "success", "3D户型图编辑器", "配置", f"3D 户型图草稿已保存（修订 {updated['revision']}）"
    )
    return updated


@router.get("/exports/check")
def check_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    name = export_service.folder_name(request)
    return {"folderName": name, "exists": export_service.export_folder_exists(request, name)}


@router.post("/exports", status_code=status.HTTP_201_CREATED)
async def save_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    """流式收包：512MB 的 ZIP 不整个读进内存，超过上限立刻 413 并中断。"""
    name = export_service.folder_name(request)
    overwrite = request.headers.get("x-export-overwrite", "").strip().lower() == "true"
    temporary_archive = request.app.state.settings.studio3d_exports_dir / f".upload-{uuid4().hex}.zip"
    written = 0
    try:
        with temporary_archive.open("xb") as output:
            async for chunk in request.stream():
                written += len(chunk)
                if written > MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES:
                    raise HTTPException(413, "导出 ZIP 超过 NAS 保存上限。")
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        temporary_archive.chmod(0o600)
        if written == 0:
            raise HTTPException(422, "导出 ZIP 为空。")
        entries = await run_in_threadpool(export_service.validate_archive, temporary_archive)
        return await run_in_threadpool(
            export_service.store_export_package, request, name, overwrite, temporary_archive, entries
        )
    finally:
        if temporary_archive.exists():
            temporary_archive.unlink()


@router.delete("/exports", status_code=status.HTTP_204_NO_CONTENT)
def delete_studio3d_export_folder(request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    export_service.delete_export_folder(request, database, export_service.folder_name(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
