from __future__ import annotations

from .schema import validate_panel_document

DESIGN_WIDTH = 2778
DESIGN_HEIGHT = 1940


def create_blank_project(
    project_id: str,
    name: str,
    canvas_width: int = DESIGN_WIDTH,
    canvas_height: int = DESIGN_HEIGHT,
) -> dict:
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
            "sharedComponents": [],
            "customPopups": [],
            "pages": [],
        }
    )
