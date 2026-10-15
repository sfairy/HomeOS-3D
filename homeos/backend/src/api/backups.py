"""管理员加密业务备份路由（``/api/v1/backups/*``）。

对齐 HA Bridge 0.7.1：export / inspect / cancel job / restore，
含会话绑定票据、管理员密码限流、导出前 flush、恢复后素材目录刷新。
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import quote, unquote
from uuid import uuid4

from fastapi import Depends, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from starlette.background import BackgroundTask

from .router import NestRouter
from ..api.studio3d import _deliver_pending
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
from ..platform.core.models import User
from ..platform.security.auth_context import require_user
from ..platform.security.login_limiter import retry_after_headers
from ..platform.security.passwords import verify_password
from ..platform.security.request_origin import require_same_origin_write
from ..platform.security.session_store import session_token_hash

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
    token = request.cookies.get(request.app.state.settings.cookie_name, "") or ""
    return f"{user.get('userId')}:{session_token_hash(token)}"


def _busy_response(request: Request) -> JSONResponse | None:
    """还原进行中时拒绝其他备份操作（``/api/v1/backups`` 不受维护中间件拦截）。"""
    if _gate(request).maintenance:
        return JSONResponse(
            status_code=503,
            content={"detail": "正在恢复业务数据，请稍候…"},
        )
    return None


def _job_for(request: Request, user: dict[str, Any], ticket: str) -> dict[str, Any] | None:
    gate = _gate(request)
    gate.expire_jobs()
    job = gate.jobs.get(ticket)
    if job is None:
        return None
    if job.get("owner") != _owner_key(request, user):
        return None
    return job


def _flush_pending(request: Request) -> None:
    try:
        with request.app.state.database.session_factory() as database:
            _deliver_pending(request, database)
    except Exception:  # 后台任务收尾，失败不能带塌当前请求；留痕由下轮 flush 重试
        logger.warning("待投递后台任务 flush 失败（下轮重试）", exc_info=True)


def _drop_owner_jobs(gate: Any, owner: str, *, keep: str | None = None) -> None:
    stale = [
        ticket
        for ticket, job in gate.jobs.items()
        if job.get("owner") == owner and ticket != keep
    ]
    for ticket in stale:
        job = gate.jobs.pop(ticket, None)
        if job:
            gate.cleanup_job(job.get("directory"))


def _ensure_same_admin_session(
    request: Request, user: dict[str, Any]
) -> JSONResponse | None:
    """对齐 0.7.1 current_admin：恢复/检查前再验短会话，防止登录态中途变化。"""
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
    gate.expire_jobs()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    _flush_pending(request)
    directory = gate.workspace()
    try:
        archive = await durable_work(
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
        gate.cleanup_job(directory)
        return JSONResponse(status_code=400, content={"detail": str(error)})
    except Exception:
        gate.cleanup_job(directory)
        raise


@router.post("/inspect", status_code=200)
async def inspect_backup(
    request: Request,
    user: dict[str, Any] = Depends(require_user),
):
    require_same_origin_write(request)
    session_error = _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    busy = _busy_response(request)
    if busy is not None:
        return busy
    gate = _gate(request)
    gate.expire_jobs()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    password = unquote(request.headers.get("X-Backup-Password", "") or "")
    if not (8 <= len(password) <= 128):
        return JSONResponse(status_code=400, content={"detail": "请提供 8–128 位备份密码。"})
    body = await request.body()
    if not body:
        return JSONResponse(status_code=400, content={"detail": "请选择备份文件。"})
    if len(body) > MAX_ARCHIVE:
        return JSONResponse(status_code=400, content={"detail": "备份文件超过 512 MB 限制。"})
    owner = _owner_key(request, user)
    if any(job.get("owner") == owner for job in gate.jobs.values()):
        _drop_owner_jobs(gate, owner)
    directory = gate.workspace()
    upload = directory / "upload.habackup"
    upload.write_bytes(body)
    try:
        preview = await durable_work(
            inspect_archive, request.app.state.settings, directory, password
        )
    except BackupError as error:
        gate.cleanup_job(directory)
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
    job = _job_for(request, user, ticket)
    if job:
        gate.jobs.pop(ticket, None)
        gate.cleanup_job(job.get("directory"))
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
    session_error = _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    busy = _busy_response(request)
    if busy is not None:
        return busy
    gate = _gate(request)
    gate.expire_jobs()
    if gate.recovery_required:
        return JSONResponse(
            status_code=503,
            content={"detail": "恢复回退尚未完成，请重启程序后再操作。"},
        )
    if not payload.confirm:
        return JSONResponse(status_code=400, content={"detail": "请先确认覆盖当前业务数据。"})
    job = _job_for(request, user, payload.ticket)
    if job is None:
        return JSONResponse(
            status_code=400,
            content={"detail": "检查结果已失效，请重新选择并检查备份文件。"},
        )
    limiter = gate.backup_password_limiter
    limiter_key = f"backup-restore:{_owner_key(request, user)}"
    if limiter.blocked(limiter_key):
        return JSONResponse(
            status_code=429,
            content={"detail": "密码尝试过多，请稍后再试。"},
            headers=retry_after_headers(limiter.retry_after(limiter_key)),
        )
    with request.app.state.database.session_factory() as session:
        admin = session.scalar(select(User).where(User.id == user["userId"]))
        if admin is None or not verify_password(payload.adminPassword, admin.password):
            limiter.record_failure(limiter_key)
            return JSONResponse(status_code=401, content={"detail": "当前管理员密码不正确。"})
    limiter.reset(limiter_key)
    # 密码校验后、写入前再验一次，覆盖长时间停留在确认页的情况。
    session_error = _ensure_same_admin_session(request, user)
    if session_error is not None:
        return session_error
    directory = job["directory"]
    gate.maintenance = True
    try:
        database = getattr(request.app.state, "database", None)
        await durable_work(
            lambda: restore_business(
                request.app.state.settings,
                directory,
                dispose=(database.engine.dispose if database is not None else None),
            )
        )
        # 数据库已整体替换：重建系统配置 / 素材目录 / HA 连接等进程内缓存
        await refresh_runtime_after_restore(request.app)
        gate.jobs.pop(payload.ticket, None)
        gate.cleanup_job(directory)
        gate.prune_rollbacks()
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
