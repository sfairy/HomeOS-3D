"""页面背景组件的结构校验（0.8.9）。

## 为什么单独一个模块

四条规则里有两类：**位置**（只能顶层）和**取值**（来源 / 布局 / 静态）。位置校验要
遍历整份文档（页面 / 共享组件 / 子组件），取值校验只看单个组件 —— 混进
`PanelDocument.validate_structure` 会把那个已经很长的模型校验撑爆（它已经有 8 类规则）。

## 与前端的分工

前端 `normalizePageBackground` 是**宽容**的：未知预设回落第一个、非法透明度夹到 0–100。
后端这里是**严格**的：拒绝而不是修正。理由：宽容归一化在「用户手改备份文件」时会把
错误悄悄改掉，用户永远不知道自己写错了；后端拒绝才能让问题在保存时暴露。

## 文案与 0.8.9 一致

四句话与上游 `.das` 里的常量逐字相同（含结尾句号）。面板 schema 的既有惯例是
`raise ValueError("中文")`（20+ 处），API 层统一转 422 —— 沿用同一写法，
不要在这里引入 `BusinessException`（那是路由层的事，schema 是纯模型层）。
"""

from __future__ import annotations

from typing import Any

#: 页面背景组件的类型名（与前端 `PAGE_BACKGROUND_TYPE` 一致）。
PAGE_BACKGROUND_TYPE = "page-background"

#: 背景来源与布局的枚举（与前端 `PAGE_BACKGROUND_SOURCES` / `_LAYOUTS` 一致）。
BACKGROUND_SOURCES = frozenset({"preset", "image"})
BACKGROUND_LAYOUTS = frozenset({"fill", "free"})

#: 备注上限（与前端 `PAGE_BACKGROUND_LABEL_LIMIT` 一致）。
LABEL_LIMIT = 128

#: 自由布局下宽高的下限（%）：0 会让元素彻底消失，用户会以为「点了没反应」。
POSITION_MIN_SIZE = 0.1

#: 「静态显示」的判据：出现这些键就说明写方想做动效 / 视频背景。
#: 前端只渲染静态图（`<img>` / 画布裁切），这些字段即使存下来也不会生效 ——
#: 与其让用户以为生效了，不如保存时就拒绝。
DYNAMIC_KEYS = frozenset(
    {
        "animation",
        "animationName",
        "animationDuration",
        "animationTimingFunction",
        "animationIterationCount",
        "transition",
        "transitionDuration",
        "motion",
        "video",
        "videoUrl",
        "autoplay",
        "playbackRate",
    }
)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_static(properties: dict[str, Any]) -> None:
    """拒绝动效 / 视频相关字段。"""
    present = [key for key in properties if key in DYNAMIC_KEYS]
    if present:
        raise ValueError("页面背景只支持静态显示。")


def _check_source(properties: dict[str, Any]) -> None:
    """来源必须是 `preset` / `image`（缺省视为 `preset`，与前端一致）。"""
    source = properties.get("source", "preset")
    if source not in BACKGROUND_SOURCES:
        raise ValueError("页面背景来源无效。")


def _check_layout(properties: dict[str, Any]) -> None:
    """布局必须是 `fill` / `free`（缺省视为 `fill`，与前端一致）。"""
    layout = properties.get("layoutMode", "fill")
    if layout not in BACKGROUND_LAYOUTS:
        raise ValueError("页面背景布局无效。")


def _check_scalars(properties: dict[str, Any]) -> None:
    """透明度 / 备注 / 自由布局的尺寸与位置。"""
    opacity = properties.get("opacity")
    if opacity is not None and (not _is_number(opacity) or not 0 <= float(opacity) <= 100):
        raise ValueError("页面背景透明度必须在 0 到 100 之间。")

    label = properties.get("label")
    if label is not None and (not isinstance(label, str) or len(label) > LABEL_LIMIT):
        raise ValueError(f"页面背景备注不能超过 {LABEL_LIMIT} 个字符。")

    # 铺满模式忽略 position（与前端 `normalizePosition` 同口径），所以只在自由布局校验。
    if properties.get("layoutMode", "fill") != "free":
        return
    position = properties.get("position")
    if position is None:
        return
    if not isinstance(position, dict):
        raise ValueError("页面背景位置无效。")
    for axis in ("x", "y"):
        value = position.get(axis)
        if value is not None and (not _is_number(value) or not 0 <= float(value) <= 100):
            raise ValueError("页面背景位置无效。")
    for axis in ("width", "height"):
        value = position.get(axis)
        if value is not None and (not _is_number(value) or not POSITION_MIN_SIZE <= float(value) <= 100):
            raise ValueError("页面背景位置无效。")


def validate_page_background_component(component: Any) -> None:
    """校验单个页面背景组件（取值四类）。"""
    properties = getattr(component, "properties", None) or {}
    _check_static(properties)
    _check_source(properties)
    _check_layout(properties)
    _check_scalars(properties)


def validate_page_backgrounds(
    *,
    pages: list[Any],
    shared_components: list[Any],
    walk: Any,
) -> None:
    """位置校验：只允许出现在**页面顶层**。

    `walk` 是调用方传入的「递归产出自身与全部子组件」的生成器，这里不重复实现遍历
    （schema 里已经有一份，两处各写一份必然会漂移）。
    """
    for shared in shared_components:
        for item in walk([shared]):
            if getattr(item, "type", "") == PAGE_BACKGROUND_TYPE:
                raise ValueError("页面背景只能添加到主页面或侧边栏的顶层。")

    for page in pages:
        top_level_ids = {item.id for item in page.components}
        for item in walk(page.components):
            if getattr(item, "type", "") != PAGE_BACKGROUND_TYPE:
                continue
            if item.id not in top_level_ids:
                raise ValueError("页面背景只能添加到主页面或侧边栏的顶层。")
            validate_page_background_component(item)
