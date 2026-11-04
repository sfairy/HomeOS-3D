"""每个**窗扇**的只读绑定校验：几何仍归 3D Studio，这里只管"这个窗扇还在不在"。

窗扇的模型身份是 ``window:{windowId}:{sashId}``：两段都做过 URL 转义，因为
``sashId`` 来自前端生成，可能带空格或冒号；不转义的话 ``window:a:b:c`` 无法区分是
三段还是两段，正则 ``window:[^:]+:[^:]+`` 也会被绕过。

为什么要做「活动窗扇」限定：固定扇（``fixed``）不能开合，把它绑成开窗器只会让用户
点开面板却什么都动不了。因此 :func:`window_targets` 只把**可开启**的叶子节点算作
绑定目标 —— 但 ``include_legacy=True`` 时连推拉组的每扇面板 id 也算进去，用于清理
旧版本按扇绑定的残留（删除型操作必须能找到它们）。
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterator
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException, status

#: 可开启的窗扇类型；``fixed`` 不在其中。
MOVABLE_KINDS = frozenset({"sliding", "casement", "top-hung", "bottom-hung"})

#: 窗扇模型身份的正则（与 :func:`window_model_id` 的产出保持一致）。
WINDOW_MODEL_PATTERN = re.compile(r"window:[^:]+:[^:]+")

#: 窗扇绑定的合法字段集合。
WINDOW_BINDING_FIELDS = frozenset(
    {
        "x",
        "y",
        "id",
        "icon",
        "size",
        "label",
        "height",
        "floorId",
        "modelId",
        "deviceId",
        "duration",
        "fontSize",
        "labelMode",
        "deviceName",
        "openPercent",
        # 运动来源与时长估计（0.8.4）：开窗器可能只有接触传感器、也可能带行程电机，
        # ``motionSource`` 决定 3D 用哪一路驱动开合动画。
        "motionSource",
        "estimateMotion",
        "travelSeconds",
        "doorEntityId",
        "batteryEntityId",
        "backgroundOpacity",
    }
)

#: 数值字段的合法区间（闭区间）。
WINDOW_BINDING_RANGES: dict[str, tuple[float, float]] = {
    "openPercent": (0, 100),
    # 行程时长（秒）：与衣架同口径，短于此无法分辨"刚启动"，长于此多半是配置错误。
    "travelSeconds": (5, 180),
    "duration": (0.2, 3),
    "size": (20, 500),
    "fontSize": (0.01, 10000),
    "backgroundOpacity": (0, 1),
    "x": (-1e6, 1e6),
    "y": (-1e6, 1e6),
    "height": (-1000, 1000),
}

#: 运动来源枚举：自动（按实体能力推断）/ 电机行程 / 接触传感器。
MOTION_SOURCES = ("auto", "opener", "contact")

#: 布尔字段（其余非数值字段一律按字符串校验）。
WINDOW_BOOLEAN_FIELDS = frozenset({"estimateMotion"})

#: 需要按「字符串 + 长度」校验的字段（字段集去掉数值字段与布尔字段）。
#:
#: 必须落成模块级常量，不能在循环里现算：Cython 3.3.0 的 OptimizeBuiltinCalls 会把
#: `SET - DICT.keys() - SET` 里的 `.keys()` 调用节点替换成属性访问后把 `args` 置为
#: `None`，随后 `MethodDispatcherTransform` 对同一个节点二次派发时崩在
#: ``TypeError: 'NoneType' object is unsliceable``（构建期直接失败）。运算符链越长
#: 越容易命中；模块级常量顺带把每轮循环的集合运算也省掉了。
WINDOW_TEXT_FIELDS = frozenset(WINDOW_BINDING_FIELDS) - frozenset(WINDOW_BINDING_RANGES) - WINDOW_BOOLEAN_FIELDS

#: 绑定上限：再多也该拆控件了。
MAX_WINDOW_BINDINGS = 512

_ENTITY_PATTERN = re.compile(r"(?:binary_sensor|sensor)\.[a-z0-9_-]+")
_ICON_PATTERN = re.compile(r"mdi:[a-z0-9][a-z0-9-]{0,119}")


def window_model_id(window_id: Any, sash_id: Any) -> str:
    """拼出窗扇的模型身份；两段都按 URL 规则转义。"""
    safe = "-_.!~*'()"
    return f"window:{quote(str(window_id), safe=safe)}:{quote(str(sash_id), safe=safe)}"


def _iter_sashes(layout: Any, *, include_legacy: bool) -> Iterator[str]:
    """深度优先产出设计树里**可绑定**的窗扇 id。

    - 推拉组只产出组 id（整组一起滑动）；``include_legacy`` 时额外产出每扇面板 id，
      用于清理 0.8.2 以前按扇绑定的旧数据；
    - 平开 / 上悬 / 下悬产出自身 id；
    - 固定扇不产出 —— 它没有可动的行程。
    """
    if not isinstance(layout, dict):
        return
    children = layout.get("children")
    if isinstance(children, list):
        for child in children:
            yield from _iter_sashes(child, include_legacy=include_legacy)
        return
    kind = layout.get("kind")
    if kind == "sliding":
        yield str(layout.get("id"))
        if include_legacy:
            for panel_id in layout.get("panelIds") or []:
                yield str(panel_id)
        return
    if kind in ("casement", "top-hung", "bottom-hung"):
        yield str(layout.get("id"))


def window_targets(scene: Any, *, include_legacy: bool = True) -> set[str]:
    """**单个楼层场景**里所有可绑定窗扇的模型身份（``window:{窗}:{扇}``）。

    窗户挂在 ``scene['windows']``（墙体开洞）上，由 ``wallId`` 指回 ``scene['walls']``。
    只有带 ``windowDesign`` + ``mode == 'custom'`` + 版式 ``version == 1`` 的窗户才有
    细分窗扇；普通窗型是一整块玻璃，没有可绑定的目标。``wallId`` 指向的墙体已删除时
    也跳过 —— 那扇窗在 3D 里根本画不出来。
    """
    if not isinstance(scene, dict):
        return set()
    wall_ids = {wall.get("id") for wall in scene.get("walls") or [] if isinstance(wall, dict)}
    targets: set[str] = set()
    for window in scene.get("windows") or []:
        if not isinstance(window, dict):
            continue
        design = window.get("windowDesign")
        if not isinstance(design, dict):
            continue
        if design.get("version") != 1 or design.get("mode") != "custom":
            continue
        if window.get("wallId") not in wall_ids:
            continue
        window_id = window.get("id")
        if not isinstance(window_id, str) or not window_id:
            continue
        for sash_id in _iter_sashes(design.get("layout"), include_legacy=include_legacy):
            targets.add(window_model_id(window_id, sash_id))
    return targets


def require_window_model(binding: dict, scene: dict) -> None:
    """只放行「绑定所在楼层里仍然存在的活动窗扇」。

    与 :func:`require_curtain_model` 同一套判定口径：楼层必须唯一命中、模型身份必须
    出现在该楼层的窗扇集合里；否则给一条能指导用户操作的 409，而不是 500。
    """
    floor_id = binding.get("floorId")
    model_id = binding.get("modelId")
    floors = [
        floor for floor in (scene or {}).get("floors") or [] if isinstance(floor, dict) and floor.get("id") == floor_id
    ]
    if len(floors) == 1 and model_id and model_id in window_targets(floors[0].get("scene"), include_legacy=False):
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="开窗器关联的活动窗扇已移除，请重新配置。",
    )


def validate_window_bindings(items: Any) -> None:
    """校验一组窗扇绑定（写入 3D 配置时调用）。任何一条不合格就整体拒绝。"""

    def fail() -> None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="窗扇配置无效，请检查窗扇、检测实体及显示开度。",
        )

    if not isinstance(items, list) or len(items) > MAX_WINDOW_BINDINGS:
        fail()

    ids: set[str] = set()
    targets: set[str] = set()
    for item in items:
        if not isinstance(item, dict) or set(item) - WINDOW_BINDING_FIELDS:
            fail()
        for key in WINDOW_TEXT_FIELDS:
            value = item.get(key, "")
            limit = 1500 if key == "modelId" else 255
            if not isinstance(value, str) or len(value) > limit:
                fail()
        if not item.get("id") or not item.get("floorId") or not item.get("modelId") or item["floorId"] == "all":
            fail()
        if WINDOW_MODEL_PATTERN.fullmatch(item["modelId"]) is None:
            fail()
        if item["id"] in ids or item["modelId"] in targets:
            fail()
        ids.add(item["id"])
        targets.add(item["modelId"])
        for key in ("doorEntityId", "batteryEntityId"):
            value = item.get(key)
            if not value:
                continue
            if not isinstance(value, str) or _ENTITY_PATTERN.fullmatch(value) is None:
                fail()
        for key, (low, high) in WINDOW_BINDING_RANGES.items():
            if key not in item:
                continue
            value = item[key]
            if type(value) not in (int, float):
                fail()
            try:
                finite = math.isfinite(value)
            except OverflowError:
                finite = False
            if not finite or not low <= value <= high:
                fail()
        if item.get("labelMode", "always") not in ("hidden", "always", "open"):
            fail()
        if item.get("motionSource", "auto") not in MOTION_SOURCES:
            fail()
        # 显式给了 ``estimateMotion`` 就必须是布尔：字符串 "false" 在前端是真值，
        # 会让"关闭位移估计"的用户得到反而更抖的动画。
        if "estimateMotion" in item and not isinstance(item["estimateMotion"], bool):
            fail()
        icon = item.get("icon")
        if icon and _ICON_PATTERN.fullmatch(icon) is None:
            fail()
