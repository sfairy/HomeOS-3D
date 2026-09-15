from __future__ import annotations

from .schema import validate_panel_document
from ..ui_packs import DEFAULT_UI_PACK_ID, get_ui_pack

DESIGN_WIDTH = 2778
DESIGN_HEIGHT = 1940


def create_blank_project(
    project_id: str,
    name: str,
    canvas_width: int = DESIGN_WIDTH,
    canvas_height: int = DESIGN_HEIGHT,
    ui_pack_id: str = DEFAULT_UI_PACK_ID,
) -> dict:
    ui_pack = get_ui_pack(ui_pack_id)
    if ui_pack is None:
        raise ValueError(f"未知 UI 方案：{ui_pack_id}")
    return validate_panel_document(
        {
            "schemaVersion": 1,
            "projectId": project_id,
            "name": name,
            "soundEnabled": True,
            "canvas": {
                "width": canvas_width,
                "height": canvas_height,
                "scaleMode": "contain",
                "componentScale": 1,
                "background": {"type": "color", "color": "#0b1116"},
            },
            "theme": {
                "name": "homeos-dark",
                "variables": {"accent": "#f2a20d"},
            },
            "uiPack": {"id": ui_pack.id, "version": ui_pack.version},
            "sharedComponents": [],
            "customPopups": [],
            "pages": [],
        }
    )
