"""仪表盘文档（panel document）的校验与构造。

仪表盘在前端是一份 JSON 文档：画布、主题、共享组件、组合弹窗与页面。
本包负责把这份外部传入的 JSON 校验归一，并定义页面与组件的引用规则。
对外出口只有 `PanelDocument` 与 `validate_panel_document` 两个名字。
"""
from .schema import PanelDocument, validate_panel_document
__all__ = [
    'PanelDocument',
    'validate_panel_document']
