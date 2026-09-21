"""新建仪表盘时的初始文档，以及读取库里草稿文档的唯一入口。

「写」的一半只负责拼一份合法的空文档并交给校验层归一，不接触数据库；
「读」的一半只做 JSON 解析与损坏兜底，同样不碰数据库（`ProjectDraft` 只是
形参上的类型提示）。因此这里可以单独测试，也不会引出循环导入。
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

    这是**全仓库唯一的文档解析入口**。此前这段 ``try: json.loads(...) except ...``
    在十几个地方各抄了一遍，各处的兜底还不一样：写路径没接住（500 加堆栈），
    遍历全部草稿的地方 ``continue`` 跳过，展示页回 ``{}``。同一份输入在不同入口
    得到不同行为，改一处漏一处几乎必然。

    字段名与类型都保持原样（不做 pydantic 校验）：调用方拿到的是「库里的原貌」，
    需要归一的地方自己调 `validate_panel_document`，读取路径不该因为一份旧版文档
    就被拒。

    参数:
        value: 草稿行的 ``document_json``（字符串）；``None`` 等非法类型回 None。
    返回:
        文档字典；JSON 损坏、或是数组 / 字符串这类「顶层不是对象」的内容时回 None。
    异常:
        不抛异常：判断「坏了怎么办」是调用方的事，见 :func:`require_document`。
    """
    try:
        document = json.loads(value)
    except (TypeError, ValueError):
        # JSONDecodeError 是 ValueError 的子类；TypeError 覆盖 document_json 为 None。
        return None
    return document if isinstance(document, dict) else None


def require_document(draft: 'ProjectDraft', *, on_error: str) -> dict:
    """读出草稿文档，损坏时按 422 回 ``on_error``。

    写路径（复制、保存）用它：用户该知道自己的草稿坏了、为什么不让保存，而
    ``JSONDecodeError`` 直接冒出去只会是 500 加堆栈。读路径宁可降级也不该报错，
    用 :func:`parse_document` 自己处理 ``None``。
    草稿可能来自更早的版本（字段已下线）或在写盘时被截断。
    异常:
        HTTPException 422: 文档 JSON 损坏或不是对象。
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

    参数:
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
                # 刻意留空 variables：空 = 「跟随设计系统的主控色」。
                #
                # 这里原先预置 accent: #f2a20d（编辑器旧版橙色）。那是个三方不一致：
                # schema.Theme 的默认本来就是 {}，前端兜底主题 DEFAULT_DASHBOARD_THEME
                # 也是 {}，渲染器每个默认色都走 paletteColor("--hos-accent", …) ——
                # 只有这一个 Python 字面量还写着橙色，于是每建一个新仪表盘，
                # theme.variables 被 renderer.js 原样写成 CSS 变量挂到渲染容器上，
                # var(--accent, var(--hos-accent)) 的回落链永远轮不到，
                # 新建项目就自动脱离全站配色（改主控色也对它无效）。
                "variables": {},
            },
            # 空白项目没有任何共享组件、组合弹窗与页面，
            # 但保留空数组让前端拿到稳定的结构，不必做存在性判断。
            "sharedComponents": [],
            "customPopups": [],
            "pages": [],
        }
    )
