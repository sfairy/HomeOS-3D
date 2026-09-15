from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .action_rules import POPUP_SOURCES, valid_entity_id, valid_ha_entity_id

IDENTIFIER = re.compile("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")


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


class Theme(ExtensibleModel):
    name: str = Field(default="homeos-dark", min_length=1, max_length=128)
    variables: dict[str, str | int | float] = Field(default_factory=dict)


class TemplateReference(ExtensibleModel):
    template_id: str = Field(alias="templateId", min_length=1, max_length=128)
    version: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validate_ids(self) -> 'TemplateReference':
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
    def validate_entity_id(self) -> 'EntityBinding':
        if self.entity_id and not valid_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class ComponentAction(ExtensibleModel):
    type: Literal['none', 'toggle', 'more-info', 'navigate'] = "none"
    target: str | None = Field(default=None, max_length=255)
    domain: str | None = Field(default=None, max_length=64)
    service: str | None = Field(default=None, max_length=64)
    data: dict[str, Any] = Field(default_factory=dict)


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
    def validate_module(self) -> 'CustomPopupModule':
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
    def validate_popup(self) -> 'CustomPopup':
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
    children: list['PanelComponent'] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_id(self) -> 'PanelComponent':
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
    def validate_identifiers(self) -> 'PanelPage':
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
    def validate_structure(self) -> 'PanelDocument':
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
                if action.type != "more-info":
                    continue
                popup_source = action.data.get("popupSource", "current")
                if popup_source not in POPUP_SOURCES:
                    raise ValueError(f"组件 {component.id} 使用了无效的弹窗来源。")
                if popup_source == "entity":
                    entity_id = action.data.get("entityId")
                    if not isinstance(entity_id, str) or not valid_ha_entity_id(
                        entity_id
                    ):
                        raise ValueError(f"组件 {component.id} 的弹窗目标实体无效。")
                if popup_source != "custom":
                    continue
                if action.data.get("popupId") in popup_ids:
                    continue
                raise ValueError(f"组件 {component.id} 打开了不存在的组合弹窗。")
        return self


def validate_panel_document(value: dict[str, Any]) -> dict[str, Any]:
    document = PanelDocument.model_validate(value)
    return document.model_dump(mode="json", by_alias=True, exclude_none=True)
