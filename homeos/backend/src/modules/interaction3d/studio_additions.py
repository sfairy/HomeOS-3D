"""0.8.9 新增的两条 3D 路由：配置诊断 + 按场景下发装饰模型。

单独成路由器（而不是塞进 `api.py`）的理由：

- `api.py` 已经很大，每加一条路由都在继续堆高它；
- 两条路由都不共享「控制」那条链路的上下文，只有一个共同前提：场景访问权。

挂载方式仍是 `router.include_router(...)`，因此 `route_inventory` 的 openapi 快照
能照常看到它们（它是构造真实 FastAPI 应用后读 `openapi()`，不是静态扫装饰器）。
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from .access import require_access, require_scene_transfer
from .config_diagnostics import ConfigDiagnosticsRequest, diagnostic_payload
from .scene_io import MODEL_ID_PATTERN, load_scene_document, scene_model_ids
from ...dependencies import LicensedViewer
from ...domains.studio3d.models import MODEL_CONTENT_TYPE
from ...platform.core.http.errors import BusinessException, ErrorCode, api_error

router = APIRouter(tags=["3D interaction"])


@router.post("/config-diagnostics", response_model=None)
async def config_diagnostics(payload: ConfigDiagnosticsRequest, request: Request):
    """只读检查一份 3D 控件配置（0.8.9「检查失效配置」）。

    与保存路径共用 `config_diagnostics.CONFIG_SECTIONS`：永不拒绝请求，固定返回
    `{valid, findings}`，让前端把失败项逐条列出来。
    """
    await run_in_threadpool(require_access, request)
    return diagnostic_payload(payload.properties)


@router.get("/scenes/{scene_id}/models/{asset_id}")
def get_scene_model(
    scene_id: str, asset_id: str, request: Request, viewer: LicensedViewer, projectId: str = ""
) -> Response:
    """按场景引用下发装饰模型（0.8.9）。

    与 `/studio3d/models/{id}`（编辑器预览）的区别：那条只判登录，这条要求**该模型被这个
    场景引用** —— `assetId` 是可枚举的 hex 空间，「知道 id」不该等于「有权取」。
    """
    require_scene_transfer(request, viewer, scene_id, projectId)
    if not MODEL_ID_PATTERN.fullmatch(asset_id):
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_MODEL_NOT_FOUND"), 404)
    if asset_id not in scene_model_ids(load_scene_document(request, scene_id)):
        raise BusinessException(ErrorCode.NOT_FOUND, api_error("STUDIO3D_SCENE_MODEL_MISSING"), 404)
    library = getattr(request.app.state, "studio_models", None)
    if library is None:  # pragma: no cover - 装配期保证存在
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, api_error("STUDIO3D_MODELS_UNAVAILABLE"), 503)
    try:
        payload = library.read_model_bytes(asset_id)
    except BusinessException as error:
        raise HTTPException(error.status_code, detail=error.message) from error
    # 模型 id 不可变（上传即固定），可长缓存；`private` 避免共享缓存把授权资源发给别人。
    return Response(
        content=payload,
        media_type=MODEL_CONTENT_TYPE,
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


__all__ = ["router"]
