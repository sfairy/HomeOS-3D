"""3D 交互配置的控件字段白名单：公共核 + 各类型扩展。

为什么单独一个模块
------------------
``config_sections_devices`` / ``config_sections_environment`` / ``device`` 三个文件里，
每个控件类型的 ``*_FIELDS`` 白名单都以同一段**17 个公共控件字段**开头（位置 / 尺寸 /
标识 / 选中跳转 / 点击行为），再各自追加类型专属字段。此前这段公共核在 8 个集合里
逐字抄了 8 遍：新增一个公共字段（例如给所有控件加一个通用开关）要记得改 8 处，
漏一处的表现是「某类控件保存时该字段被白名单丢掉」——**静默丢失，不报错**。

这里只放**字段名**，不放校验逻辑：白名单语义仍是各文件自己的 ``frozenset``，
公共核通过 ``{*WIDGET_COMMON_FIELDS, ...}`` 展开，集合内容与逐个手写完全一致。
"""

from __future__ import annotations

#: 所有画布控件共享的字段（位置 / 尺寸 / 标识 / 选中与点击行为）。
WIDGET_COMMON_FIELDS: tuple[str, ...] = (
    "x",
    "y",
    "id",
    "icon",
    "size",
    "label",
    "height",
    "floorId",
    "hitSize",
    "modelId",
    "visible",
    "entityId",
    "iconSize",
    "clickAction",
    "focusCamera",
    "buttonHidden",
    "hiddenClickable",
)

__all__ = ["WIDGET_COMMON_FIELDS"]
