"""管理员加密业务备份路由（``/api/v1/backups/*``）。

export / inspect / cancel job / restore，含会话绑定票据、管理员密码限流、导出前 flush、
恢复后素材目录刷新。
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any
from urllib.parse import quote, unquote
from uuid import uuid4

from fastapi import Depends, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from .backup_guard import owner_session_key, verify_admin_password
from .router import NestRouter
from ..dependencies import authenticated_short_lived_user
from ..domains.backup.business_backup import (
    JOB_TTL_SECONDS,
    MAX_ARCHIVE,
    BackupError,
    create_archive,
    durable_work,
    inspect_archive,
    refresh_runtime_after_restore,
    restore_business,
)
from ..platform.security.auth_context import require_user
from ..platform.security.request_origin import require_same_origin_write

router = NestRouter(prefix="/backups", tags=["backups"])

logger = logging.getLogger("homeos.api.backups")


class ExportRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class RestoreRequest(BaseModel):
    ticket: str = Field(pattern="^[a-f0-9]{32}$")
    adminPassword: str = Field(min_length=1, max_length=128)
    confirm: bool = False


def _gate(request: Request):
    return request.app.state.business_backup


def _owner_key(request: Request, user: dict[str, Any]) -> str:
    return owner_session_key(request, user)


def _busy_response(request: Request) -> JSONResponse | None:
    """还原进行中时拒绝其他备份操作（``/api/v1/backups`` 不受维护中间件拦截）。"""
    if _gate(request).maintenance:
        return JSONResponse(
            status_code=503,
            content={"detail": "正在恢复业务数据，请稍候…"},
        )
    return None


async def _job_for(
    request: Request, user: dict[str, Any], ticket: str
) -> dict[str, Any] | None:
    gate = _gate(request)
    await gate.expire_jobs_async()
    job = gate.jobs.get(ticket)
    if job is None:
        return None
    if job.get("owner") != _owner_key(request, user):
        return None
    return job


async def _drop_owner_jobs(gate: Any, owner: str, *, keep: str | None = None) -> None:
    stale = [
        ticket
        for ticket, job in gate.jobs.items()
        if job.get("owner") == owner and ticket != keep
    ]
    for ticket in stale:
        job = gate.jobs.pop(ticket, None)
        if job:
            await gate.cleanup_job_async(job.get("directory"))


def _check_same_admin_session(
    request: Request, user: dict[str, Any]
) -> JSONResponse | None:
    """恢复/检查前再验短会话（同步 DB 部分，由 ``_ensure_same_admin_session`` 放进线程池）。"""
    try:
        fresh = authenticated_short_lived_user(request, Response())
    except Exception:
        return JSONResponse(
            status_code=401, content={"detail": "登录状态已变化，请重新登录。"}
        )
    if str(getattr(fresh, "id", "")) != str(user.get("userId") or ""):
        return JSONResponse(
            status_code=401, content={"detail": "登录状态已变化，请重新登录。"}
        )
    return None


async def _ensure_same_admin_session(
    request: Request, user: dict[str, Any]
) -> JSONResponse | None:
    """恢复/检查前再验短会话，防止登录态中途变化；同步 DB 鉴权放 worker 线程。"""
    return await asyncio.to_thread(_check_same_admin_session, request, user)


@router.post("/export", status_code=200)
async def export_backup(
    payload: ExportRequest,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    busy = _busy_response(request)
    if busy is not None:
        return busy
    gate = _gate(request)
    await gate.expire_jobs_async()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    directory = gate.workspace()
    try:
        archive = await gate.run_exclusive(
            create_archive,
            request.app.state.settings,
            directory,
            payload.password,
        )
        version = request.app.state.settings.version.replace("/", "-")
        filename = f"HomeOS-{version}.habackup"
        return FileResponse(
            archive,
            media_type="application/octet-stream",
            filename=filename,
            background=BackgroundTask(gate.cleanup_job, directory),
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"; '
                f"filename*=UTF-8''{quote(filename)}"
            },
        )
    except BackupError as error:
        await gate.cleanup_job_async(directory)
        return JSONResponse(status_code=400, content={"detail": str(error)})
    except Exception:
        await gate.cleanup_job_async(directory)
        raise


@router.post("/inspect", status_code=200)
async def inspect_backup(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    session_error = await _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    busy = _busy_response(request)
    if busy is not None:
        return busy
    gate = _gate(request)
    await gate.expire_jobs_async()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    password = unquote(request.headers.get("X-Backup-Password", "") or "")
    if not (8 <= len(password) <= 128):
        return JSONResponse(status_code=400, content={"detail": "请提供 8–128 位备份密码。"})
    owner = _owner_key(request, user)
    if any(job.get("owner") == owner for job in gate.jobs.values()):
        await _drop_owner_jobs(gate, owner)
    directory = gate.workspace()
    upload = directory / "upload.habackup"
    # 流式落盘而不是 ``await request.body()``：整包上限是 512MB，先整包读进内存等于让
    # 一次上传占掉 512MB（还得再复制一份），在家庭 NAS 上足以把进程压垮。这里边收边写、
    # 边累计限长，超限立刻断开——与 studio3d 导出包的处理方式一致。
    written = 0
    try:
        with upload.open("xb") as output:
            async for chunk in request.stream():
                written += len(chunk)
                if written > MAX_ARCHIVE:
                    raise BackupError("备份文件超过 512 MB 限制。")
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
    except BackupError as error:
        await gate.cleanup_job_async(directory)
        return JSONResponse(status_code=400, content={"detail": str(error)})
    except Exception:
        # 断开 / 磁盘写失败：清掉半截归档，别把 workspace 留成垃圾
        await gate.cleanup_job_async(directory)
        return JSONResponse(status_code=400, content={"detail": "备份文件上传中断，请重试。"})
    if written == 0:
        await gate.cleanup_job_async(directory)
        return JSONResponse(status_code=400, content={"detail": "请选择备份文件。"})
    try:
        preview = await durable_work(
            inspect_archive, request.app.state.settings, directory, password
        )
    except BackupError as error:
        await gate.cleanup_job_async(directory)
        return JSONResponse(status_code=400, content={"detail": str(error)})
    ticket = uuid4().hex
    gate.jobs[ticket] = {
        "directory": directory,
        "preview": preview,
        "expiresAt": time.time() + JOB_TTL_SECONDS,
        "owner": owner,
        "passwordOk": True,
    }
    return {"ticket": ticket, **preview, "expiresIn": JOB_TTL_SECONDS}


@router.delete("/jobs/{ticket}", status_code=200)
async def cancel_inspection(
    ticket: str,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    gate = _gate(request)
    job = await _job_for(request, user, ticket)
    if job:
        gate.jobs.pop(ticket, None)
        await gate.cleanup_job_async(job.get("directory"))
    elif ticket in gate.jobs:
        # 非本会话票据：不泄露是否存在，直接当作已清理。
        pass
    return {"ok": True}


@router.post("/restore", status_code=200)
async def restore_backup(
    payload: RestoreRequest,
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    session_error = await _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    busy = _busy_response(request)
    if busy is not None:
        return busy
    gate = _gate(request)
    await gate.expire_jobs_async()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    if not payload.confirm:
        return JSONResponse(status_code=400, content={"detail": "请先确认覆盖当前业务数据。"})
    job = await _job_for(request, user, payload.ticket)
    if job is None:
        return JSONResponse(
            status_code=400,
            content={"detail": "检查结果已失效，请重新选择并检查备份文件。"},
        )
    password_error = await verify_admin_password(request, user, payload.adminPassword)
    if password_error is not None:
        return password_error
    # 密码校验后、写入前再验一次，覆盖长时间停留在确认页的情况。
    session_error = await _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    directory = job["directory"]
    gate.maintenance = True
    try:
        database = getattr(request.app.state, "database", None)
        await gate.run_exclusive(
            lambda: restore_business(
                request.app.state.settings,
                directory,
                dispose=(database.engine.dispose if database is not None else None),
            )
        )
        # 数据库已整体替换：重建系统配置 / 素材目录 / HA 连接等进程内缓存
        await refresh_runtime_after_restore(request.app)
        gate.jobs.pop(payload.ticket, None)
        await gate.cleanup_job_async(directory)
        await gate.prune_rollbacks_async()
        try:
            request.app.state.global_log.append(
                "success",
                "系统后台",
                "备份",
                "全量业务数据（含账号、授权、素材与数据库）已恢复；中控设备需重新配对",
            )
        except Exception:  # 恢复结果已落定，这条只是全局日志提示，不得因写日志失败把成功变成 5xx
            pass
        return {"ok": True, "restored": True, "rePairDisplays": True}
    except BackupError as error:
        return JSONResponse(
            status_code=400,
            content={"detail": str(error) or "恢复失败，已保留原业务数据，请重新检查备份文件。"},
        )
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"detail": "恢复失败，已保留原业务数据，请重新检查备份文件。"},
        )
    finally:
        gate.maintenance = False
