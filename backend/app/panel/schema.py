"""仪表盘文档的 pydantic 结构定义与整体校验。

模型的字段名用 snake_case，别名（alias）用前端的 camelCase：
入库与网络传输一律走别名，内部代码读写属性名，两边互不干扰。

`ExtensibleModel.extra = "allow"` 是刻意的：前端会先于后端上线新字段，
放行未知键可以让旧后端继续保存新前端写出的文档，不会因多一个字段就整份拒绝。

对外入口：`validate_panel_document`。它负责跨字段的引用校验，
单字段的范围约束则写在各自的 Field 上。
"""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .action_rules import POPUP_SOURCES, valid_entity_id, valid_ha_entity_id

# 通用标识符：字母或数字开头，后续允许字母数字与 . _ -，总长不超过 128。
# 页面 ID、组件 ID、弹窗 ID、模板 ID 共用这一条规则。
IDENTIFIER = re.compile("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")


class ExtensibleModel(BaseModel):
    """所有文档模型共同基类：放行未知字段，并允许按属性名或别名赋值。"""

    model_config = ConfigDict(extra="allow", populate_by_name=True)


class CanvasBackground(ExtensibleModel):
    """画布底色：纯色、素材图，或不铺底。"""

    type: Literal['color', 'asset', 'none'] = "color"
    color: str | None = "#10151a"
    # type 为 asset 时生效，指向资产目录里的图片。
    asset_id: str | None = Field(default=None, alias="assetId")


class Canvas(ExtensibleModel):
    """画布尺寸与缩放策略。

    resize_* 三个字段记录「用户手动调整窗口后」的基准尺寸与内容缩放，
    为空表示从未手动调整过，此时前端直接按 width / height 等比铺满。
    """

    # 上下限与前端编辑器的输入框约束保持一致，防止绕过界面写入异常尺寸。
    width: int = Field(default=2778, ge=320, le=7680)
    height: int = Field(default=1940, ge=240, le=4320)
    scale_mode: Literal['contain', 'cover', 'stretch'] = Field(
        default="contain", alias="scaleMode"
    )
    # 组件整体缩放系数；上限 256 是历史约定，用于超大屏点阵字场景。
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
    """主题：内置主题名 + 变量覆盖表。"""

    # 默认 homeos-dark 是仓库内置主题，前端按该名字补齐缺失的变量。
    name: str = Field(default="homeos-dark", min_length=1, max_length=128)
    # 值允许字符串（颜色）与数字（尺寸），因此类型放宽到联合。
    variables: dict[str, str | int | float] = Field(default_factory=dict)


class TemplateReference(ExtensibleModel):
    """控件 / 弹窗对模板的引用与版本号。"""

    template_id: str = Field(alias="templateId", min_length=1, max_length=128)
    # 版本用于在模板结构变更后决定是否需要迁移，目前只做记录与比较。
    version: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validate_ids(self) -> 'TemplateReference':
        """模板 ID 必须符合通用标识符规则，防止前端拼出不安全的名字。"""
        if not IDENTIFIER.fullmatch(self.template_id):
            raise ValueError("控件或弹窗模板来源无效。")
        return self


class Position(ExtensibleModel):
    """组件在画布上的位置与层级。"""

    x: float = 0
    y: float = 0
    # 尺寸必须为正：零宽高会让组件不可见又占着撤销栈，属于脏数据。
    width: float = Field(default=100, gt=0)
    height: float = Field(default=100, gt=0)
    rotation: float = Field(default=0, ge=-360, le=360)
    # zIndex 允许负数，便于把背景类组件压到其它组件之下。
    z_index: int = Field(default=1, alias="zIndex", ge=-10000, le=10000)


class EntityBinding(ExtensibleModel):
    """组件某个插槽到实体的绑定。"""

    entity_id: str | None = Field(default=None, alias="entityId", max_length=255)
    # 绑定到实体的某个属性（例如 light 的 brightness），为空表示绑定整个状态。
    attribute: str | None = Field(default=None, max_length=128)
    required: bool = False

    @model_validator(mode="after")
    def validate_entity_id(self) -> 'EntityBinding':
        """校验实体 ID 格式；未绑定（None）与空串都视为合法的未配置状态。"""
        if self.entity_id and not valid_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class ComponentAction(ExtensibleModel):
    """组件动作：无动作、开关、打开弹窗、跳转页面。"""

    type: Literal['none', 'toggle', 'more-info', 'navigate'] = "none"
    # navigate 时为页面路径；more-info 的来源是 entity 时为实体 ID。
    target: str | None = Field(default=None, max_length=255)
    domain: str | None = Field(default=None, max_length=64)
    service: str | None = Field(default=None, max_length=64)
    # 透传参数（如 more-info 的 popupSource / popupId / entityId），
    # 键名由前端与运行期约定，这里只做容器不做约束。
    data: dict[str, Any] = Field(default_factory=dict)


class CustomPopupLayout(ExtensibleModel):
    """组合弹窗的网格布局（行数、列数与整体尺寸）。"""

    # 布局按行切分，目前只支持 2 行或 3 行两种版式。
    rows: Literal[2, 3] = 3
    columns: int = Field(default=3, ge=1, le=24)
    width: int = Field(default=840, ge=360, le=1920)
    height: int = Field(default=520, ge=240, le=1440)


class CustomPopupModule(ExtensibleModel):
    """组合弹窗里的单个模块（一个实体卡片）。"""

    id: str = Field(min_length=1, max_length=128)
    # 模块类型决定前端用哪套卡片渲染；generic 是不认识的类型时的兜底。
    type: Literal['light', 'climate', 'air-purifier', 'water-heater', 'media-player', 'electric-bed', 'switch', 'cover', 'camera', 'line-chart', 'generic'] = (
        "generic"
    )
    # 组合弹窗模块只能绑原生实体，虚拟实体在弹窗里没有作用域，故用 valid_ha_entity_id。
    entity_id: str = Field(alias="entityId", min_length=3, max_length=255)
    title: str | None = Field(default=None, max_length=128)
    # 网格坐标与跨度；y 上限 7 对应最多 2~3 行布局按 1 行起始的排布空间。
    x: int = Field(default=0, ge=0, le=23)
    y: int = Field(default=0, ge=0, le=7)
    width: int = Field(default=1, ge=1, le=24)
    height: int = Field(default=1, ge=1, le=8)

    @model_validator(mode="after")
    def validate_module(self) -> 'CustomPopupModule':
        """校验模块 ID 规范性与实体 ID 格式。"""
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效弹窗模块 ID：{self.id}")
        if not valid_ha_entity_id(self.entity_id):
            raise ValueError(f"无效实体 ID：{self.entity_id}")
        return self


class CustomPopup(ExtensibleModel):
    """组合弹窗：把多个实体模块拼成一张自定义面板。"""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    layout: CustomPopupLayout = Field(default_factory=CustomPopupLayout)
    modules: list[CustomPopupModule] = Field(default_factory=list)
    template_ref: TemplateReference | None = Field(
        default=None, alias="templateRef"
    )

    @model_validator(mode="after")
    def validate_popup(self) -> 'CustomPopup':
        """校验弹窗 ID，并保证同一弹窗内模块 ID 不重复。"""
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效组合弹窗 ID：{self.id}")
        module_ids = [module.id for module in self.modules]
        # 模块 ID 重复会让前端 Vue/key 冲突、拖拽错位，因此在这里直接拒绝。
        if len(module_ids) != len(set(module_ids)):
            raise ValueError(f"组合弹窗 {self.name} 的模块 ID 不能重复。")
        return self


class PanelComponent(ExtensibleModel):
    """仪表盘控件：位置、绑定、属性、样式与动作的集合体。"""

    id: str = Field(min_length=1, max_length=128)
    # type 不做枚举：类型清单由前端控件注册表决定，后端放行以便前端先上新控件。
    type: str = Field(min_length=1, max_length=128)
    component_version: int = Field(default=1, alias="componentVersion", ge=1)
    template_ref: TemplateReference | None = Field(
        default=None, alias="templateRef"
    )
    position: Position = Field(default_factory=Position)
    # 插槽名 -> 绑定，例如 {"main": EntityBinding(...)}。
    bindings: dict[str, EntityBinding] = Field(default_factory=dict)
    properties: dict[str, Any] = Field(default_factory=dict)
    style: dict[str, Any] = Field(default_factory=dict)
    # 事件名 -> 动作，例如 {"tap": ComponentAction(...)}。
    actions: dict[str, ComponentAction] = Field(default_factory=dict)
    # 子组件（成组控件），通过字符串前向引用指回自身类型。
    children: list['PanelComponent'] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_id(self) -> 'PanelComponent':
        """组件 ID 必须符合通用标识符规则。"""
        if not IDENTIFIER.fullmatch(self.id):
            raise ValueError(f"无效组件 ID：{self.id}")
        return self


class PanelPage(ExtensibleModel):
    """仪表盘页面：路径、共享组件引用与自有组件。"""

    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=128)
    # path 既是路由也是跳转动作的 target，因此与 id 用同一套标识符规则。
    path: str = Field(min_length=1, max_length=128)
    shared_component_ids: list[str] = Field(
        default_factory=list, alias="sharedComponentIds"
    )
    components: list[PanelComponent] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_identifiers(self) -> 'PanelPage':
        """页面 ID 与路径都必须符合通用标识符规则。"""
        if not IDENTIFIER.fullmatch(self.id) or not IDENTIFIER.fullmatch(self.path):
            raise ValueError(f"无效页面 ID 或路径：{self.id}/{self.path}")
        return self


class PanelDocument(ExtensibleModel):
    """一份完整的仪表盘文档，也是校验与入库的顶层对象。"""

    # 目前只有 1 版；结构升级时这里加字面量并补迁移分支。
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

    @field_validator("default_page_path")
    @classmethod
    def normalize_default_page_path(cls, value: str | None) -> str | None:
        """空串归一成 None：前端用空值表示「没设默认页」。

        不归一的话，``""`` 会被当成一个路径去参加下面那条「必须存在于 pages」的校验，
        于是「清空默认页」这个动作反而保存不了。
        """
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def validate_structure(self) -> 'PanelDocument':
        """跨字段的引用完整性校验。

        单字段的范围约束由各自 Field 负责，这里只查「引用是否存在、ID 是否唯一」
        这类无法在单字段上表达的问题，把错误尽早挡在入库之前。
        """
        def walk(items: list[PanelComponent]):
            """深度优先展开组件树，让嵌套子组件也参与唯一性与动作校验。"""
            for item in items:
                yield item
                yield from walk(item.children)

        # 页面 ID 与路径各自唯一：路径同时是路由与跳转目标，重复会导致跳转歧义。
        page_ids = [page.id for page in self.pages]
        page_paths = [page.path for page in self.pages]
        if len(page_ids) != len(set(page_ids)):
            raise ValueError("页面 ID 不能重复。")
        if len(page_paths) != len(set(page_paths)):
            raise ValueError("页面路径不能重复。")
        # 默认页必须真的存在：指向一个不存在的路径，展示页打开就落在空白页上
        # （前端虽然有「兜底到第一页」的容错，但把打不开的默认页存进库里本身就是脏数据，
        # 而且它会让「默认页」这个设置在别的读取路径上继续骗人）。
        if self.default_page_path is not None and self.default_page_path not in page_paths:
            raise ValueError(f"默认页 {self.default_page_path} 不存在。")
        popup_ids = [popup.id for popup in self.custom_popups]
        if len(popup_ids) != len(set(popup_ids)):
            raise ValueError("组合弹窗 ID 不能重复。")
        # 共享组件与各页面组件放在一起校验：不同页面引用同一共享组件时，
        # 组件实体本身只存一份，ID 必须在整个项目内唯一。
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
        # 逐个组件校验动作指向：跳转目标必须是本项目的页面，
        # more-info 的弹窗来源与目标必须存在，避免运行时点下去没反应。
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
                    # 指向实体弹窗时必须给出合法的原生实体 ID。
                    entity_id = action.data.get("entityId")
                    if not isinstance(entity_id, str) or not valid_ha_entity_id(
                        entity_id
                    ):
                        raise ValueError(f"组件 {component.id} 的弹窗目标实体无效。")
                if popup_source != "custom":
                    continue
                # 指向组合弹窗时，popupId 必须命中本文档已定义的弹窗。
                if action.data.get("popupId") in popup_ids:
                    continue
                raise ValueError(f"组件 {component.id} 打开了不存在的组合弹窗。")
        return self


def validate_panel_document(value: dict[str, Any]) -> dict[str, Any]:
    """校验并归一一份仪表盘文档。

    参数:
        value: 外部传入的原始文档字典（字段名为 camelCase）。

    返回:
        归一后的字典：按别名（camelCase）输出、剔除 None 字段，
        可直接序列化入库或回传给前端。

    异常:
        pydantic.ValidationError: 字段类型、范围或引用完整性校验失败，
        由调用方转成 422 响应。
    """
    document = PanelDocument.model_validate(value)
    # by_alias：保证出参与前端 JSON 字段名一致；
    # exclude_none：不把未配置字段写成 null，避免前端覆盖已有默认值。
    return document.model_dump(mode="json", by_alias=True, exclude_none=True)
