"""仪表盘文档的 pydantic 结构定义与整体校验。 模型的字段名用 snake_case，别名（alias）用前端的 camelCase： 入库与网络传输一律走别名，内部代码读写属性名，两边互不干扰。"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..domains.fonts import valid_font_selection
from ..platform.core.entity.entity_ids import valid_entity_id, valid_ha_entity_id

IDENTIFIER = re.compile("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")

#: ``more-info`` 动作的弹窗来源枚举（只有面板 schema 用它，故随 schema 同住）。
POPUP_SOURCES = frozenset({"custom", "entity", "current"})

#: 情景弹窗（``controlMode='scene'``）最多容纳的条目数。再多就不该用弹窗，该用整页控件。
MAX_SCENE_POPUP_ITEMS = 80


class ExtensibleModel(BaseModel):

    model_config = ConfigDict(extra="allow", populate_by_name=True)


class CanvasBackground(ExtensibleModel):

    type: Literal['color', 'asset', 'none'] = "color"
    color: str | None = "#10151a"
    asset_id: str | None = Field(default=None, alias="assetId")


class Canvas(ExtensibleModel):

    width: int = Field(default=2778, ge=320, le=7680)
    height: int = Field(default=1940, ge=240, le=4320)
    scale_mode: Literal['contain', 'cover', 'stretch'] = Field(
        default="contain", alias="scaleMode"
    )
    component_scale: float = Field(default=1, alias="componentScale", gt=0, le=256)
    popup_scale: float = Field(default=1, alias="popupScale", gt=0, le=256)
    resize_base_width: float | None = Field(
        default=None, alias="resizeBaseWidth", ge=320, le=7680
    )
    resize_base_height: float | None = Field(
        default=None, alias="resizeBaseHeight", ge=240, le=4320
    )
    resize_content_scale: float | None = Field(
        default=None, alias="resizeContentScale", gt=0, le=256
    )
    background: CanvasBackground = Field(default_factory=CanvasBackground)


class DashboardFonts(BaseModel):
    """仪表盘全局字体：中文与英文/数字分开选；``device`` 即系统字体栈。"""

    model_config = ConfigDict(extra="forbid")

    chinese: str = "device"
    latin: str = "device"

    @model_validator(mode="after")
    def validate_choices(self) -> DashboardFonts:
        if not valid_font_selection(self.chinese, latin=False) or not valid_font_selection(
            self.latin, latin=True
        ):
            raise ValueError("字体选择无效。")
        return self


class Theme(ExtensibleModel):

    fonts: DashboardFonts | None = None
    name: str = Field(default="dashboard-v1-dark", min_length=1, max_length=128)
    variables: dict[str, str | int | float] = Field(default_factory=dict)


class TemplateReference(ExtensibleModel):

    template_id: str = Field(alias="templateId", min_length=1, max_length=128)
    version: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validate_ids(self) -> TemplateReference:
        if not IDENTIFIER.fullmatch(self.template_id):
            raise ValueError("控件或弹窗模板来源无效。")
        return self


class Position(ExtensibleModel):

    x: float = 0
    y: float = 0
    width: float = Field(default=100, gt=0)
    height: float = Field(default=100, gt=0)
    rotation: float = Field(default=0, ge=-360, le=360)
    z_index: int = Field(default=1, alias="zIndex", ge=-10000, le=10000)


class EntityBinding(ExtensibleModel):

    entity_id: str | None = Field(default=None, alias="entityId", max_length=255)
    attribute: str | None = Field(default=None, max_length=128)
    required: bool = False

    @model_validator(mode="after")
    def validate_entity_id(self) -> EntityBinding:
        if self.entity_id and not valid_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class ScenePopupItem(ExtensibleModel):
    """情景弹窗里的一条控件。

    约束三条，都是「不这样就会画出坏界面」的硬边界：

    - 最多 80 条：弹窗是移动端尺寸，再多只能滚动到看不见；
    - 标题 ≤128：与其它控件的 ``label`` 同一档；
    - 必须绑实体：允许 ``virtual.`` 前缀（前端自造的虚拟实体，如"全部关闭"聚合项）。
    """

    id: str = Field(min_length=1, max_length=128)
    entity_id: str = Field(alias="entityId", min_length=1, max_length=255)
    label: str | None = Field(default=None, max_length=128)
    mode: Literal['toggle', 'switch', 'number', 'select', 'button'] = "toggle"
    icon: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_item(self) -> ScenePopupItem:
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效情景弹窗条目 ID：{self.id}")
        if not self.entity_id.startswith("virtual.") and not valid_ha_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class ComponentAction(ExtensibleModel):

    type: Literal['none', 'toggle', 'more-info', 'navigate'] = "none"
    target: str | None = Field(default=None, max_length=255)
    domain: str | None = Field(default=None, max_length=64)
    service: str | None = Field(default=None, max_length=64)
    data: dict[str, Any] = Field(default_factory=dict)
    # 控件模式：``scene`` 表示这是一组情景按钮，点开走情景弹窗而不是单实体详情。
    control_mode: Literal['scene-mode'] | None = Field(default=None, alias="controlMode")
    popup_enabled: bool = Field(default=False, alias="popupEnabled")
    popup_items: list[ScenePopupItem] = Field(default_factory=list, alias="popupItems")

    @model_validator(mode="after")
    def validate_scene_popup(self) -> ComponentAction:
        if len(self.popup_items) > MAX_SCENE_POPUP_ITEMS:
            raise ValueError(f"情景弹窗最多 {MAX_SCENE_POPUP_ITEMS} 项。")
        ids = [item.id for item in self.popup_items]
        if len(ids) != len(set(ids)):
            raise ValueError("情景弹窗条目的 ID 不能重复。")
        # 情景弹窗不允许嵌套弹窗：item 上没有 popup 字段，但 ``data`` 是自由的，
        # 顺手挡住把整份 action 塞进 data 的写法，避免运行期无限递归。
        if isinstance(self.data, dict) and "popupItems" in self.data:
            raise ValueError("情景弹窗不支持嵌套弹窗。")
        return self


class CustomPopupLayout(ExtensibleModel):

    rows: Literal[2, 3] = 3
    columns: int = Field(default=3, ge=1, le=24)
    width: int = Field(default=840, ge=360, le=1920)
    height: int = Field(default=520, ge=240, le=1440)


class CustomPopupModule(ExtensibleModel):

    id: str = Field(min_length=1, max_length=128)
    type: Literal['light', 'climate', 'air-purifier', 'water-heater', 'media-player', 'electric-bed', 'switch', 'cover', 'camera', 'line-chart', 'generic'] = (
        "generic"
    )
    entity_id: str = Field(alias="entityId", min_length=3, max_length=255)
    title: str | None = Field(default=None, max_length=128)
    x: int = Field(default=0, ge=0, le=23)
    y: int = Field(default=0, ge=0, le=7)
    width: int = Field(default=1, ge=1, le=24)
    height: int = Field(default=1, ge=1, le=8)

    @model_validator(mode="after")
    def validate_module(self) -> CustomPopupModule:
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效弹窗模块 ID：{self.id}")
        if not valid_ha_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class CustomPopup(ExtensibleModel):

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    layout: CustomPopupLayout = Field(default_factory=CustomPopupLayout)
    modules: list[CustomPopupModule] = Field(default_factory=list)
    template_ref: TemplateReference | None = Field(
        default=None, alias="templateRef"
    )

    @model_validator(mode="after")
    def validate_popup(self) -> CustomPopup:
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效组合弹窗 ID：{self.id}")
        module_ids = [module.id for module in self.modules]
        if len(module_ids) != len(set(module_ids)):
            raise ValueError(f"组合弹窗 {self.name} 的模块 ID 不能重复。")
        return self


class PanelComponent(ExtensibleModel):

    id: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=128)
    component_version: int = Field(default=1, alias="componentVersion", ge=1)
    template_ref: TemplateReference | None = Field(
        default=None, alias="templateRef"
    )
    position: Position = Field(default_factory=Position)
    bindings: dict[str, EntityBinding] = Field(default_factory=dict)
    properties: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)
    actions: dict[str, ComponentAction] = Field(default_factory=dict)
    children: list[PanelComponent] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_id(self) -> PanelComponent:
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效组件 ID：{self.id}")
        return self


class PanelPage(ExtensibleModel):

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    path: str = Field(min_length=1, max_length=128)
    shared_component_ids: list[str] = Field(
        default_factory=list, alias="sharedComponentIds"
    )
    components: list[PanelComponent] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_identifiers(self) -> PanelPage:
        if not IDENTIFIER.fullmatch(self.id) or not IDENTIFIER.fullmatch(self.path):
            raise ValueError(f"无效页面 ID 或路径：{self.id}/{self.path}")
        return self


class PanelDocument(ExtensibleModel):

    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    project_id: str = Field(alias="projectId", min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    sound_enabled: bool = Field(default=True, alias="soundEnabled")
    default_page_path: str | None = Field(
        default=None, alias="defaultPagePath", max_length=128
    )
    canvas: Canvas = Field(default_factory=Canvas)
    theme: Theme = Field(default_factory=Theme)
    shared_components: list[PanelComponent] = Field(
        default_factory=list, alias="sharedComponents"
    )
    custom_popups: list[CustomPopup] = Field(
        default_factory=list, alias="customPopups"
    )
    pages: list[PanelPage] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_structure(self) -> PanelDocument:
        def walk(items: list[PanelComponent]):
            for item in items:
                yield item
                yield from walk(item.children)

        page_ids = [page.id for page in self.pages]
        page_paths = [page.path for page in self.pages]
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("页面 ID 不能重复。")
        if len(page_paths) != len(set(page_paths)):
            raise ValueError("页面路径不能重复。")
        popup_ids = [popup.id for popup in self.custom_popups]
        if len(popup_ids) != len(set(popup_ids)):
            raise ValueError("组合弹窗 ID 不能重复。")
        all_components = list(walk(self.shared_components))
        for page in self.pages:
            all_components.extend(walk(page.components))
            if len(page.shared_component_ids) != len(set(page.shared_component_ids)):
                raise ValueError(f"页面 {page.path} 的共享组件引用不能重复。")
            missing_shared = set(page.shared_component_ids) - {
                item.id for item in self.shared_components
            }
            if missing_shared:
                raise ValueError(f"页面 {page.path} 引用了不存在的共享组件。")
        component_ids = [item.id for item in all_components]
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("组件 ID 必须在项目内唯一。")
        for component in all_components:
            for action in component.actions.values():
                if action.type == "navigate" and action.target not in page_paths:
                    raise ValueError(f"组件 {component.id} 跳转到了不存在的页面。")
                if action.type == "more-info":
                    popup_source = action.data.get("popupSource", "current")
                    if popup_source not in POPUP_SOURCES:
                        raise ValueError(f"组件 {component.id} 使用了无效的弹窗来源。")
                    if popup_source == "entity":
                        entity_id = action.data.get("entityId")
                        if not isinstance(entity_id, str) or not valid_ha_entity_id(
                            entity_id
                        ):
                            raise ValueError(f"组件 {component.id} 的弹窗目标实体无效。")
                    if popup_source == "custom":
                        if action.data.get("popupId") not in popup_ids:
                            raise ValueError(f"组件 {component.id} 打开了不存在的组合弹窗。")
        return self


def validate_panel_document(value: dict[str, Any]) -> dict[str, Any]:
    document = PanelDocument.model_validate(value)
    return document.model_dump(mode="json", by_alias=True, exclude_none=True)
