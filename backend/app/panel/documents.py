"""新建仪表盘时的初始文档。

只负责拼一份合法的空文档并交给校验层归一，不接触数据库；
落库由调用方（`api/projects.py`）负责，因此这里可以单独测试。
"""
from __future__ import annotations

from .schema import validate_panel_document

# 设计标称画布尺寸，对应常见 16:9 大屏在 2 倍 DPI 下的像素数。
DESIGN_WIDTH = 2778
DESIGN_HEIGHT = 1940


def create_blank_project(
    project_id: str,
    name: str,
    canvas_width: int = DESIGN_WIDTH,
    canvas_height: int = DESIGN_HEIGHT,
) -> dict:
    """构造一份空白仪表盘文档。

    参数:
        project_id: 项目 ID，会写进文档的 projectId，需与数据库记录一致。
        name: 仪表盘名称，直接作为文档 name。
        canvas_width: 画布宽度，默认取设计标称宽度。
        canvas_height: 画布高度，默认取设计标称高度。

    返回:
        经 validate_panel_document 归一后的文档字典（字段为 camelCase，
        已剔除 None），可直接序列化入库。
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
                # 默认底色与 homeos-dark 主题配套，避免新建即白屏刺眼。
                "background": {"type": "color", "color": "#0b1116"},
            },
            "theme": {
                "name": "homeos-dark",
                # 主题只预置强调色，其余变量由前端按内置主题补齐。
                "variables": {"accent": "#f2a20d"},
            },
            # 空白项目没有任何共享组件、组合弹窗与页面，
            # 但保留空数组让前端拿到稳定的结构，不必做存在性判断。
            "sharedComponents": [],
            "customPopups": [],
            "pages": [],
        }
    )
