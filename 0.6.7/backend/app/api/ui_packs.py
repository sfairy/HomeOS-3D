from __future__ import annotations
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from ..dependencies import LicensedViewer
from ..ui_packs import DEFAULT_UI_PACK_ID, UI_PACKS, require_ui_pack_access
router = APIRouter(prefix = '/ui-packs', tags = [
    'ui-packs'])

@router.get('')
def list_ui_packs(request: Request, _viewer: LicensedViewer) -> dict:
    # 每个方案按当前授权是否允许它的能力码，把 allowed 一并交给前端 —— 前端据此决定
    # 是显示为可选、还是显示成「需要升级」。
    items = [
        item.payload(allowed = request.app.state.license_service.allows(item.feature_code))
        for item in UI_PACKS
    ]
    return {
        'items': items,
        'defaultId': DEFAULT_UI_PACK_ID,
        # 资产库的能力分档：用户自传已可用，高级目录还在计划中。
        'assetLibrary': {
            'status': 'available',
            'userUploads': True,
            'advancedCatalog': 'planned' } }


@router.get('/{ui_pack_id}/runtime.js')
def read_ui_pack_runtime(ui_pack_id: str, request: Request, _viewer: LicensedViewer) -> FileResponse:
    ui_pack = require_ui_pack_access(request, ui_pack_id)
    root = (request.app.state.settings.frontend_dir / 'ui-packs').resolve()
    path = (root / ui_pack.runtime_module).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code = 404, detail = 'UI 方案运行时不存在。')
    response = FileResponse(path, media_type = 'text/javascript; charset=utf-8')
    response.headers['Cache-Control'] = 'private, no-cache'
    return response
