"""页面背景组件的结构校验（0.9.0）。

## 为什么单独一个模块

四条规则里有两类：**位置**（只能顶层）和**取值**（来源 / 布局 / 静态）。位置校验要
遍历整份文档（页面 / 共享组件 / 子组件），取值校验只看单个组件 —— 混进
`PanelDocument.validate_structure` 会把那个已经很长的模型校验撑爆。

## 与 0.9.0 逐条对齐

0.9.0 的 `panel/schema.py` 只做四条校验，文案与 `.das` 逐字一致：

1. 页面背景只支持静态显示。 —— `bindings` / `children` 非空，或存在 `type != 'none'` 的 action；
2. 页面背景来源无效。 —— `properties.backgroundSource` 缺省写入 `preset` 后必须是 preset/image；
3. 页面背景布局无效。 —— `properties.layoutMode` 缺省写入 `fill` 后必须是 free/fill；
4. 页面背景只能添加到主页面或侧边栏的顶层。 —— 允许的顶层是**共享组件顶层**与**页面顶层**。

注意：0.9.0 **没有**透明度 / 备注 / 位置范围校验；移植期额外加的宽松校验已移除，
避免「0.9.0 能保存的文档本仓存不了」。

## 文案风格

四句话与上游 `.das` 里的常量逐字相同（含结尾句号）。面板 schema 的既有惯例是
`raise ValueError("中文")`（20+ 处），API 层统一转 422 —— 沿用同一写法，
不要在这里引入 `BusinessException`（那是路由层的事，schema 是纯模型层）。
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

#: 页面背景组件的类型名（与前端 `PAGE_BACKGROUND_TYPE` 一致）。
PAGE_BACKGROUND_TYPE = "page-background"

#: 背景来源与布局的枚举（与前端 `PAGE_BACKGROUND_SOURCES` / `_LAYOUTS` 一致）。
BACKGROUND_SOURCES = frozenset({"preset", "image"})
BACKGROUND_LAYOUTS = frozenset({"free", "fill"})

#: 0.9.0 字段名：来源存在 `backgroundSource`（旧移植期的 `source` 不再被读）。
BACKGROUND_SOURCE_KEY = "backgroundSource"
BACKGROUND_LAYOUT_KEY = "layoutMode"


def _is_static_action(action: Any) -> bool:
    """0.9.0 的静态判据：`type == 'none'` 的动作不算动态。"""
    return getattr(action, "type", "none") == "none"


def _check_static(component: Any) -> None:
    """拒绝绑定 / 子控件 / 非 none 动作（0.9.0 `validate_id` 的同一段）。"""
    actions = getattr(component, "actions", None) or {}
    if getattr(component, "bindings", None) or getattr(component, "children", None):
        raise ValueError("页面背景只支持静态显示。")
    if not all(_is_static_action(action) for action in actions.values()):
        raise ValueError("页面背景只支持静态显示。")


def _check_source(properties: dict[str, Any]) -> None:
    """来源必须是 `preset` / `image`；缺省写入 `preset`（与 0.9.0 setdefault 一致）。

    兼容旧移植期文档的 `source` 键：缺失 `backgroundSource` 时把旧值搬过来，
    否则 `setdefault` 会把图片背景静默改成内置预设。
    """
    if BACKGROUND_SOURCE_KEY not in properties and "source" in properties:
        properties[BACKGROUND_SOURCE_KEY] = properties["source"]
    if properties.setdefault(BACKGROUND_SOURCE_KEY, "preset") not in BACKGROUND_SOURCES:
        raise ValueError("页面背景来源无效。")


def _check_layout(properties: dict[str, Any]) -> None:
    """布局必须是 `free` / `fill`；缺省写入 `fill`（与 0.9.0 setdefault 一致）。"""
    if properties.setdefault(BACKGROUND_LAYOUT_KEY, "fill") not in BACKGROUND_LAYOUTS:
        raise ValueError("页面背景布局无效。")


def validate_page_background_component(component: Any) -> None:
    """校验单个页面背景组件（0.9.0 的三条取值规则）。"""
    properties = getattr(component, "properties", None)
    if properties is None:
        properties = {}
        component.properties = properties
    _check_static(component)
    _check_source(properties)
    _check_layout(properties)


def validate_page_backgrounds(
    *,
    pages: list[Any],
    shared_components: list[Any],
    walk: Any,
) -> None:
    """位置校验：只允许出现在**共享组件顶层**或**页面顶层**（0.9.0 同口径）。

    `walk` 是调用方传入的「递归产出自身与全部子组件」的生成器，这里不重复实现遍历
    （schema 里已经有一份，两处各写一份必然会漂移）。
    """
    root_component_ids = {getattr(component, "id", "") for component in shared_components}
    for page in pages:
        root_component_ids.update(getattr(component, "id", "") for component in page.components)

    for component in _walk_all(shared_components, pages, walk):
        if getattr(component, "type", "") != PAGE_BACKGROUND_TYPE:
            continue
        if getattr(component, "id", "") not in root_component_ids:
            raise ValueError("页面背景只能添加到主页面或侧边栏的顶层。")
        validate_page_background_component(component)


def _walk_all(shared_components: list[Any], pages: list[Any], walk: Any) -> Iterable[Any]:
    """共享组件 + 全部页面的完整遍历（顺序与 0.9.0 的 all_components 一致）。"""
    yield from walk(shared_components)
    for page in pages:
        yield from walk(page.components)
