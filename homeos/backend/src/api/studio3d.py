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

import logging
import os
from typing import Any
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from ..dependencies import DatabaseSession, LicensedUser
from ..domains.studio3d import export_service, service
from ..domains.studio3d.model_glb import (
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    MAX_IMAGES,
    MAX_NODES,
    MAX_PRIMITIVES,
    MAX_TRIANGLES,
    validate_glb,
)
from ..domains.studio3d.models import (
    MAX_LIBRARY_BYTES,
    MAX_LIBRARY_MODELS,
    MAX_MODEL_BYTES,
    MODEL_CONTENT_TYPE,
)
from ..domains.studio3d.schemas import Studio3DDraftUpdate, StudioLightRangesUpdate
from ..panel.asset_refs import studio_asset_ids
from ..platform.core.http.diagnostics import update_request_context
from ..platform.core.http.errors import BusinessException, ErrorCode, api_error
from ..platform.core.http.upload_limits import MAX_STUDIO3D_EXPORT_ARCHIVE_BYTES
from ..platform.core.runtime.async_work import durable_work
from ..platform.security.request_origin import require_same_origin_write

_logger = logging.getLogger("homeos.api.studio3d")

router = APIRouter(prefix="/studio3d", tags=["studio3d"])

#: 单模型 / 整库上限（对外暴露给前端用于提示；真实判定在 domains.studio3d.models）。
MAX_STUDIO3D_MODEL_BYTES = MAX_MODEL_BYTES
MAX_STUDIO3D_MODEL_COUNT = MAX_LIBRARY_MODELS
#: 上传限制的细项（0.8.9 上游 `uploadLimits`，字段名与前端文案一一对应）。
#: 全部与 ``model_glb`` 的校验常量同源 —— 前端展示的数值必须就是后端会拒的数值，
#: 否则用户会看到「说好 6 万面，5 万面却被拒」。
MAX_STUDIO3D_MODEL_MESH_PARTS = MAX_PRIMITIVES
MAX_STUDIO3D_MODEL_IMAGE_SIDE = MAX_IMAGE_SIDE
MAX_STUDIO3D_MODEL_IMAGE_PIXELS = MAX_IMAGE_PIXELS
MAX_STUDIO3D_MODEL_LIBRARY_BYTES = MAX_LIBRARY_BYTES

#: 户型文件交付的连续失败次数（进程级）：恢复到 0 时补一条 RECOVERED 事件。
_delivery_failure_count = 0


@router.get("")
def get_studio3d_draft(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    # 0.8.7：户型文件交付是「读草稿 → 交付文件」两步，读失败过一次之后再成功要点一条恢复。
    global _delivery_failure_count
    try:
        draft = service.get_draft(database)
    except Exception:
        _delivery_failure_count += 1
        request.app.state.global_log.append(
            "error",
            "3D户型图编辑器",
            "配置",
            "3D 户型图文件交付失败，可稍后重试打开。",
            context={
                "eventType": "运行故障",
                "code": "STUDIO_FILE_DELIVERY_FAILED",
                "phase": "studio-file-delivery",
                "hint": "刷新页面或稍后重试；若持续失败，导出日志并检查草稿文件是否可读。",
            },
        )
        raise
    if _delivery_failure_count:
        request.app.state.global_log.append(
            "success",
            "3D户型图编辑器",
            "配置",
            f"3D 户型图文件交付已恢复（此前失败 {_delivery_failure_count} 次）。",
            context={
                "eventType": "故障恢复",
                "code": "STUDIO_FILE_DELIVERY_RECOVERED",
                "phase": "studio-file-delivery",
            },
        )
        _delivery_failure_count = 0
    # 场景里引用的可变素材（user: / studio3d:）：素材管理据此标记「使用中」。
    # 与素材目录的增删共用一把锁，避免读到「草稿已引用、目录还没登记」的中间态。
    catalog = request.app.state.asset_catalog
    with catalog.mutation_lock:
        draft['assetIds'] = sorted(studio_asset_ids(draft.get('scene') or {}))
    return draft


@router.put("")
def update_studio3d_draft(
    payload: Studio3DDraftUpdate,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict:
    updated = service.save_draft(
        database,
        request.app.state.settings,
        _user,
        payload,
        catalog=request.app.state.asset_catalog,
    )
    request.app.state.global_log.append(
        "success",
        "3D户型图编辑器",
        "配置",
        f"3D 户型图草稿已保存（修订 {updated['revision']}）",
        context=update_request_context(
            request,
            finished=True,
            revision=updated["revision"],
            # 0.8.7 的日志上下文带「上一修订」，全局日志里能直接看出「这次改动从哪一版来」。
            previousRevision=updated["previousRevision"],
            code="STUDIO_DRAFT_SAVED",
            eventType="操作记录",
            operation="保存户型草稿",
            # 文案与响应里的 `persistenceState` 同源：本项目草稿即数据库单行，没有待补写的镜像文件。
            persistenceState=updated["persistenceState"],
            phase="studio-save",
        ),
    )
    return updated


@router.put("/light-ranges", response_model=None)
def update_studio3d_light_ranges(
    payload: StudioLightRangesUpdate,
    request: Request,
    database: DatabaseSession,
    _user: LicensedUser,
) -> dict:
    """只保存柔光范围（0.8.9）：绘制页与 3D 控件共用同一份范围。

    走与整份保存**同一条**链路（读到当前草稿 → 合并 → ``service.save_draft``）：
    这样 revision 乐观并发、配置校验、级联清理都只有一份实现。
    草稿还不存在时（``revision == 0``）拒绝：柔光范围没有可依附的户型。
    """
    draft = service.get_draft(database)
    current_scene = draft.get("scene")
    if not isinstance(current_scene, dict):
        raise BusinessException(
            ErrorCode.CONFLICT, api_error("INTERACTION3D_SCENE_REQUIRED"), 409
        )
    merged_scene = service.merge_light_ranges(current_scene, payload)
    updated = service.save_draft(
        database,
        request.app.state.settings,
        _user,
        Studio3DDraftUpdate(
            revision=payload.revision,
            scene=merged_scene,
            interactionConfirmation="",
        ),
        catalog=request.app.state.asset_catalog,
    )
    return {
        "revision": updated["revision"],
        "lightRegionOverrides": updated["scene"].get("lightRegionOverrides") or {},
        "lightRangeArchive": updated["scene"].get("lightRangeArchive") or {},
    }


@router.get("/exports/check")
def check_studio3d_export(request: Request, _user: LicensedUser) -> dict:
    name = export_service.folder_name(request)
    return {"folderName": name, "exists": export_service.export_folder_exists(request, name)}


#: 导出图转码的正文上限（一张 4096 边长的 PNG 约 30MB 封顶）。
MAX_EXPORT_IMAGE_BYTES = 64 * 1024 * 1024


@router.post("/exports/webp-fallback", status_code=status.HTTP_201_CREATED, response_model=None)
async def export_webp_fallback(request: Request, _user: LicensedUser) -> Response:
    """把一张导出图转成 WebP（Safari 的 ``canvas.toBlob('image/webp')`` 会静默回退 PNG）。

    前端在「拿不到 WebP」时把 PNG 交过来；返回 ``image/webp`` 字节本体。
    失败一律 422 且带稳定错误码：这是**用户可重试**的情形（换张图 / 缩小画布），
    不是服务端故障。
    """
    await run_in_threadpool(require_same_origin_write, request)
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_EXPORT_IMAGE_BYTES:
            raise BusinessException(
                ErrorCode.VALIDATION_FAILED, api_error("STUDIO3D_EXPORT_IMAGE_TOO_LARGE"), 413
            )
    if not content:
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED, api_error("STUDIO3D_EXPORT_IMAGE_INVALID"), 422
        )
    try:
        encoded = await run_in_threadpool(export_service.encode_webp, bytes(content))
    except ValueError as error:
        raise BusinessException(
            ErrorCode.VALIDATION_FAILED, api_error("STUDIO3D_EXPORT_IMAGE_INVALID"), 422
        ) from error
    # 转码结果只对本次请求有意义：不缓存，避免「同一 URL 出两种图」。
    return Response(content=encoded, media_type="image/webp", headers={"Cache-Control": "no-store"})


@router.post("/exports", status_code=status.HTTP_201_CREATED)
async def save_studio3d_export(request: Request, database: DatabaseSession, _user: LicensedUser) -> dict:
    """流式收包：512MB 的 ZIP 不整个读进内存，超过上限立刻 413 并中断。"""
    name = export_service.folder_name(request)
    overwrite = request.headers.get("x-export-overwrite", "").strip().lower() == "true"
    if overwrite:
        # 覆盖会替换整个文件夹里的图片：正在被仪表盘/户型图/全局弹窗使用的图片
        # 不能悄悄换掉，否则项目里留下的是「同名不同图」。
        usages = await run_in_threadpool(export_service.scan_usages, database, name)
        if usages:
            raise export_service.export_in_use(usages)
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
        # durable_work：客户端中断上传不能留下「staging 已解压、没换上去」的半截导出，
        # 也不能让调用方以为没发生而重发一次。
        return await durable_work(
            export_service.store_export_package, request, name, overwrite, temporary_archive, entries
        )
    finally:
        if temporary_archive.exists():
            temporary_archive.unlink()


@router.delete("/exports", status_code=status.HTTP_204_NO_CONTENT)
def delete_studio3d_export_folder(request: Request, database: DatabaseSession, _user: LicensedUser) -> Response:
    export_service.delete_export_folder(request, database, export_service.folder_name(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 装饰模型库（0.8.9「我的装饰」）───────────────────────────────────────
#
# 端点很小，但契约要一致：列表 / 上传 / 改名 / 删除 / 预览下载。上传走**流式**收包
# （与导出 ZIP 同一模式）：12 MiB 的 GLB 不整包进内存，超限立刻 413 并中断。


def _model_library(request: Request):
    library = getattr(request.app.state, "studio_models", None)
    if library is None:  # pragma: no cover - 装配期保证存在
        raise BusinessException(
            ErrorCode.SERVICE_UNAVAILABLE, api_error("STUDIO3D_MODELS_UNAVAILABLE"), 503
        )
    return library


from ..modules.interaction3d.scene_io import strip_decoration_asset_prefix


def _document_references_model(document: Any, asset_id: str) -> bool:
    """文档里是否有物件引用了该装饰模型。

    兼容两种文档形状：多楼层（`floors[].scene.items`）与单层老文档（`scene.items`）。
    非 `user-decoration` 的 `assetId` 一律忽略 —— 那是图片素材，走资产路由。
    """
    if not isinstance(document, dict):
        return False
    scenes: list[Any] = []
    nested_scene = document.get("scene") if isinstance(document.get("scene"), dict) else {}
    # 楼层数组可能在顶层（项目文档）或嵌在 `scene` 下（户型草稿 / 导出包）。
    for floors in (document.get("floors"), nested_scene.get("floors")):
        if isinstance(floors, list):
            scenes.extend(floor.get("scene") for floor in floors if isinstance(floor, dict))
    # 老文档没有 floors：items 直接在 scene 上（或就是文档本身）。
    scenes.append(nested_scene or document)
    for scene in scenes:
        if not isinstance(scene, dict):
            continue
        for item in scene.get("items") or []:
            if (
                isinstance(item, dict)
                and item.get("type") == "user-decoration"
                and strip_decoration_asset_prefix(item.get("assetId") or item.get("modelAssetId")) == asset_id
            ):
                return True
    return False


def studio_model_usages(request: Request, asset_id: str) -> list[str]:
    """扫描所有引用该装饰模型的存储面，返回可读的使用方名称。

    扫描面与 ``export_service.scan_usages`` 对齐：项目草稿 + 户型绘制草稿。
    读不出来时**不阻止删除**（返回空）—— 这里宁可漏一次保护，也不要因为一个坏草稿
    让用户永远删不掉模型；真正的安全网是「物件找不到模型时的降级显示」。
    """
    database = getattr(request.app.state, "database", None)
    if database is None:  # pragma: no cover - 装配期保证存在
        return []
    from ..domains.studio3d.draft_repository import read_snapshot
    from ..panel.asset_refs import saved_project_documents

    usages: list[str] = []

    try:
        from sqlalchemy import select

        from ..domains.projects.schema import Project

        project_names = {project.id: project.name for project in database.scalars(select(Project)).all()}
        for project_id, document in saved_project_documents(database):
            if _document_references_model(document, asset_id):
                usages.append(project_names.get(project_id, project_id))
    except Exception:
        _logger.warning("读取项目引用面失败，按「无引用」继续删除", exc_info=True)
        return []
    try:
        snapshot = read_snapshot(database)
        # 快照字段是 `scene`（StudioDraftSnapshot），不是 `document`。
        # 这里曾错写成 `document`，于是「户型图绘制」这条检查**永远**取到 None：
        # 草稿里还摆着某件装饰时也能把模型删掉，物件从此 404 且只能靠用户自己发现。
        scene = getattr(snapshot, "scene", None) if snapshot is not None else None
        if isinstance(scene, dict) and _document_references_model(scene, asset_id):
            usages.append("户型图绘制")
    except Exception:
        _logger.warning("读取户型图快照失败，跳过该引用面", exc_info=True)
    try:
        # 删除归档（Studio↔interaction3d 同步文档的 `archive`）：恢复楼层会把旧物件带回来，
        # 所以它和 `export_service.scan_usages` 一样算引用面。
        from ..domains.studio3d.draft_repository import read_sync_document

        archive = read_sync_document(database).get("archive")
        if isinstance(archive, list) and _document_references_model({"floors": archive}, asset_id):
            usages.append("户型图删除归档")
    except Exception:  # 同上：读不出来不阻断删除
        _logger.warning("读取删除归档失败，跳过该引用面", exc_info=True)
    return list(dict.fromkeys(usages))


@router.get("/models", response_model=None)
def list_studio3d_models(request: Request, _viewer: LicensedUser) -> dict:
    library = _model_library(request)
    models = [record.as_payload() for record in library.list_models()]
    return {
        # `models` 是本仓既有约定；`items` 是 0.8.9 上游的键名（同一份数据）。
        # 两个都下发，前端任选其一都能读，迁移期不需要两边同时改。
        "models": models,
        "items": models,
        "totalBytes": library.total_bytes(),
        "maxBytes": MAX_STUDIO3D_MODEL_BYTES,
        "maxModels": MAX_STUDIO3D_MODEL_COUNT,
        # 0.8.9 上游「上传说明」的逐项限制。字段名与前端文案一一对应，
        # 少一项就会让用户「上传被拒但不知道撞了哪条」。
        "maxUploadBytes": MAX_STUDIO3D_MODEL_BYTES,
        "uploadLimits": {
            "triangles": MAX_TRIANGLES,
            "meshParts": MAX_STUDIO3D_MODEL_MESH_PARTS,
            "nodes": MAX_NODES,
            "images": MAX_IMAGES,
            "imageSide": MAX_STUDIO3D_MODEL_IMAGE_SIDE,
            "imagePixels": MAX_STUDIO3D_MODEL_IMAGE_PIXELS,
        },
    }


class ModelRenamePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=0, max_length=128)


@router.patch("/models/{asset_id}", response_model=None)
def rename_studio3d_model(
    asset_id: str,
    payload: ModelRenamePayload,
    request: Request,
    _user: LicensedUser,
) -> dict:
    record = _model_library(request).rename(asset_id, payload.name)
    return record.as_payload()


@router.post("/models", status_code=status.HTTP_201_CREATED, response_model=None)
async def upload_studio3d_model(request: Request, _user: LicensedUser) -> dict:
    """流式接收 GLB：超过单模型上限立刻 413，不等整包落地。

    名字从 ``x-model-name``（URL 编码）或 ``?name=`` 取；缺省时由库给「我的装饰」。
    """
    library = _model_library(request)
    raw_name = request.headers.get("x-model-name") or request.query_params.get("name") or ''
    name = unquote(raw_name)
    temporary = library.root / f".upload-{uuid4().hex}"
    written = 0
    try:
        library.ensure_dirs()
        with temporary.open("xb") as output:
            async for chunk in request.stream():
                written += len(chunk)
                if written > MAX_STUDIO3D_MODEL_BYTES:
                    raise BusinessException(
                        ErrorCode.VALIDATION_FAILED,
                        api_error("STUDIO3D_MODEL_TOO_LARGE", f"{MAX_STUDIO3D_MODEL_BYTES // (1024 * 1024)} MiB"),
                        413,
                    )
                output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if written == 0:
            raise BusinessException(
                ErrorCode.VALIDATION_FAILED,
                api_error("STUDIO3D_MODEL_INVALID", "文件为空，请重新选择模型。"),
                422,
            )
        payload = temporary.read_bytes()
        summary = validate_glb(payload, max_bytes=MAX_STUDIO3D_MODEL_BYTES)
        asset_id = uuid4().hex
        record = library.store(asset_id, name, payload)
        request.app.state.global_log.append(
            "success",
            "3D户型图编辑器",
            "配置",
            f"装饰模型已上传：{record.name}",
            context={
                "eventType": "操作记录",
                "code": "STUDIO_MODEL_UPLOADED",
                "assetId": asset_id,
                "bytes": record.bytes,
                "triangles": summary.triangles,
            },
        )
        return record.as_payload()
    finally:
        if temporary.exists():
            temporary.unlink()


@router.delete("/models/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_studio3d_model(asset_id: str, request: Request, _user: LicensedUser) -> Response:
    # 被引用的模型不能删（0.8.9 上游 `deleteBlockReason`）。
    #
    # 放任删除的后果是**已放置的物件变成 404**：场景里还留着 `assetId`，
    # 但字节已经没了，3D 画面里那件装饰直接消失，且只能靠用户自己发现。
    # 所以这里与导出图片同一口径：证明不了「没引用」就不删。
    blocked = studio_model_usages(request, asset_id)
    if blocked:
        raise BusinessException(
            ErrorCode.CONFLICT,
            api_error(
                "STUDIO3D_MODEL_IN_USE",
                f"该模型正在被「{'、'.join(blocked)}」使用，请先删除这些户型里的物件再删模型。",
            ),
            409,
        )
    removed = _model_library(request).remove(asset_id)
    if not removed:
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404)
    request.app.state.global_log.append(
        "success",
        "3D户型图编辑器",
        "配置",
        "装饰模型已删除。",
        context={"eventType": "操作记录", "code": "STUDIO_MODEL_DELETED", "assetId": asset_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/models/{asset_id}")
def read_studio3d_model(asset_id: str, request: Request, _viewer: LicensedUser) -> FileResponse:
    """编辑器里的预览下载。

    与 3D 舞台的 ``/modules/interaction3d/scenes/{scene}/models/{id}`` 分开：这里只判登录，
    舞台那条还要判「该模型是否被该场景引用」。
    """
    library = _model_library(request)
    path = library.model_path(asset_id)
    record = library.get(asset_id)
    if record is None or not path.exists():
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404)
    return FileResponse(
        path,
        media_type=MODEL_CONTENT_TYPE,
        filename=f"{asset_id}.glb",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
