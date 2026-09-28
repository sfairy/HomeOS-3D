"""新建仪表盘时的初始文档，以及读取库里草稿文档的唯一入口。
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from ..core.design import DESIGN_HEIGHT, DESIGN_WIDTH
from .schema import validate_panel_document

if TYPE_CHECKING:
    from ..core.models import ProjectDraft

def parse_document(value: object) -> dict | None:
    """把库里存的文档 JSON 解析成字典；坏了或不是对象时回 ``None``。
    """
    if not isinstance(value, (str, bytes, bytearray)):
        return None
    try:
        document = json.loads(value)
    except (TypeError, ValueError):
        return None
    return document if isinstance(document, dict) else None


def require_document(draft: 'ProjectDraft', *, on_error: str) -> dict:
    """读出草稿文档，损坏时按 422 回 ``on_error``。
    """
    document = parse_document(draft.document_json)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=on_error
        )
    return document


def create_blank_project(
    project_id: str,
    name: str,
    canvas_width: int = DESIGN_WIDTH,
    canvas_height: int = DESIGN_HEIGHT,
) -> dict:
    """构造一份空白仪表盘文档。
    """
    return validate_panel_document(
        {
            # 当前只有一版文档结构；将来升级结构时靠它做分支兼容。
            "schemaVersion": 1,
            "projectId": project_id,
            "name": name,
            # 默认开启音效（控件点击、开关反馈），用户可在编辑器里关闭。
            "soundEnabled": True,
            "canvas": {
                "width": canvas_width,
                "height": canvas_height,
                # contain：等比缩放并留黑边，保证不同屏幕下版式不被裁切。
                "scaleMode": "contain",
                "componentScale": 1,
                "background": {"type": "color", "color": "#0b1116"},
            },
            "theme": {
                "name": "homeos-dark",
                "variables": {},
            },
            # 空白项目没有任何共享组件、组合弹窗与页面，
            "sharedComponents": [],
            "customPopups": [],
            "pages": [],
        }
    )
