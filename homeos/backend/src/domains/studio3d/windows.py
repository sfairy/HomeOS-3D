"""自定义窗型的**写入边界**校验（只校验，不存状态、不碰实体）。

为什么单独一个模块：窗型设计是「嵌套树 + 尺寸约束」的结构化数据，一旦写坏，
前端绘制器会在渲染阶段抛异常，而用户看到的是整层楼消失。放在 3D Studio 的保存
事务里逐字段校验，比事后靠前端 ``try/catch`` 兜底可靠得多。

四组硬约束（与前端 ``studio-window-layout`` 的交互限制一一对应）：

- 每个窗扇 id 唯一且 ≤80 字符 —— 撤销 / 绑定都靠它定位；
- 分格树节点 ≤47（即最多 24 个叶子窗扇），深度 ≤24 —— 递归渲染与撤销栈的上限；
- 任一被切分出来的格子，其高度不得小于 :data:`MIN_CELL`（0.26 m）；推拉组的宽度
  还要按扇数翻倍 —— 低于这个尺寸五金件装不下，铰链开启也会互相打架；
- 自定义窗必须落在所在墙体的洞口内（宽、高、窗台三重夹紧），否则 3D 里窗户会
  穿出墙面。

坐标单位是米；``ratio`` 是无量纲比例 (0, 1)。
"""

from __future__ import annotations

import math
from typing import Any, TypeVar

from fastapi import HTTPException, status

#: 支持的窗扇类型。``fixed`` 是固定扇（不可开启），其余四种带开启方式。
WINDOW_KINDS = frozenset({"fixed", "sliding", "casement", "top-hung", "bottom-hung"})

#: 单个分格的最小短边（米）。再小五金件装不下。
MIN_CELL = 0.26

#: 分格树节点上限：n 个叶子的二叉树有 2n-1 个节点，47 = 24 个窗扇。
MAX_NODES = 47

#: 分格树深度上限（防递归爆栈）。
MAX_DEPTH = 24

#: 整窗尺寸允许区间（米）：0.3 m 以下的洞口画不出窗框，20 m 以上必然是误输入。
MIN_SIZE = 0.3
MAX_SIZE = 20.0

#: 设计版本。版本号不匹配时直接拒绝，避免新编辑器写出旧渲染器读不懂的结构。
DESIGN_VERSION = 1

#: 窗扇身份 / 备注的字数上限（按字符计，不是字节）。
MAX_IDENTITY = 80
MAX_REMARKS = 96
MAX_REMARK_TEXT = 60

_DEFAULT_MESSAGE = "自定义窗户结构无效。"


def _number(value: Any) -> bool:
    """是否为有限数字（``bool`` 不算数字）。"""
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _require(condition: Any, message: str = _DEFAULT_MESSAGE) -> None:
    if not condition:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


_ValueT = TypeVar("_ValueT")


def _require_present(value: _ValueT | None, message: str = _DEFAULT_MESSAGE) -> _ValueT:
    """``_require(value is not None, ...)`` 的返回值版。

    类型检查器不会把 ``_require(...)`` 这种「条件 + 抛异常」的调用当成 ``assert``，
    也拿不到参数里的窄化，于是后面每次 ``wall.get(...)`` 都被判成可选链访问。
    把校验过的值返回出去，窄化就落在赋值语句上（``wall = _require_present(...)``）。
    """
    if value is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)
    return value


def _is_hung(kind: Any) -> bool:
    return kind in ("top-hung", "bottom-hung")


def validate_window_design(design: Any, width: Any, height: Any) -> None:
    """校验一棵窗型设计树；``width`` / ``height`` 是该窗户的外框尺寸（米）。"""
    _require(isinstance(design, dict))
    _require(design.get("version") == DESIGN_VERSION, "窗型版本不兼容，请使用支持此版本的编辑器。")
    _require(design.get("mode") in ("ordinary", "custom"))
    _require(type(design.get("interiorSide")) is int)
    _require(design["interiorSide"] in (-1, 1))
    direction = design.get("wallDirection", 1)
    _require(type(direction) is int and direction in (-1, 1), "窗型朝向无效。")
    _require(all(_number(size) and MIN_SIZE <= size <= MAX_SIZE for size in (width, height)))

    identifiers: set[str] = set()
    count = 0

    def unique(value: Any) -> None:
        _require(isinstance(value, str) and 0 < len(value) <= MAX_IDENTITY, "窗扇身份无效或重复。")
        _require(value not in identifiers, "窗扇身份无效或重复。")
        identifiers.add(value)

    def visit(node: Any, cell_width: float, cell_height: float, depth: int) -> None:
        nonlocal count
        count += 1
        _require(isinstance(node, dict))
        _require(depth <= MAX_DEPTH, "窗型最多支持 24 个分格。")
        _require(count <= MAX_NODES, "窗型最多支持 24 个分格。")
        unique(node.get("id"))
        if "children" in node:
            children = node["children"]
            ratio = node.get("ratio")
            axis = node.get("axis")
            _require(axis in ("x", "y"))
            _require(_number(ratio) and 0 < ratio < 1)
            _require(isinstance(children, list) and len(children) == 2, "分隔参数无效。")
            for index, child in enumerate(children):
                fraction = ratio if index == 0 else 1 - ratio
                visit(
                    child,
                    cell_width * fraction if axis == "x" else cell_width,
                    cell_height * fraction if axis == "y" else cell_height,
                    depth + 1,
                )
            return

        kind = node.get("kind")
        panels = node.get("panelIds")
        angle = node.get("angle")
        _require(
            isinstance(kind, str)
            and kind in WINDOW_KINDS
            and node.get("hinge") in ("left", "right")
            and node.get("swing") in ("in", "out")
            and node.get("slide") in ("left", "right")
            and type(node.get("count")) is int
            and node["count"] in (2, 3)
            and _number(angle)
            and 10 <= angle <= (90 if _is_hung(kind) else 120)
            and isinstance(panels, list),
            "窗扇参数无效。",
        )
        _require(len(panels) == node["count"], "窗扇参数无效。")
        for panel in panels:
            unique(panel)
        opening = node.get("defaultOpening", 0)
        _require(_number(opening) and 0 <= opening <= 100, "默认开度需在 0–100% 之间。")
        # 推拉组是「一格里再并排 n 扇」，所以宽度下限按扇数翻倍；高度对所有窗型一致。
        _require(
            cell_width + 1e-8 >= MIN_CELL * (node["count"] if kind == "sliding" else 1),
            "分格过小，请先扩大窗户或减少分格。",
        )
        _require(cell_height + 1e-8 >= MIN_CELL, "分格过小，请先扩大窗户或减少分格。")

    # 普通窗型（``ordinary``）只是「切回自定义前的占位树」，不含真实尺寸：用 20×20 的
    # 上限尺寸校验，避免 0.3 m 的普通窗户被分格规则误杀。
    dormant = design["mode"] == "ordinary"
    visit(
        design.get("layout"),
        MAX_SIZE if dormant else width,
        MAX_SIZE if dormant else height,
        0,
    )

    remarks = design.get("sashRemarks", {})
    _require(isinstance(remarks, dict), "窗扇备注无效。")
    _require(len(remarks) <= MAX_REMARKS, "窗扇备注无效。")
    for key, value in remarks.items():
        _require(isinstance(key, str) and 0 < len(key) <= MAX_IDENTITY, "窗扇备注无效。")
        _require(isinstance(value, str) and len(value) <= MAX_REMARK_TEXT, "窗扇备注最多 60 个字。")


def validate_window_designs(document: Any) -> None:
    """遍历草稿里的所有场景，校验带 ``windowDesign`` 的窗户。

    场景既可能挂在 ``document['floors'][*]['scene']`` 下（多楼层户型），也可能就是
    ``document`` 本身（单层 / 老版本草稿）。只校验墙体开洞里的窗户 —— 那是唯一带
    ``windowDesign`` 的来源，放置式窗户没有可校验的结构。
    """
    if not isinstance(document, dict):
        return
    floors = document.get("floors")
    if isinstance(floors, list):
        scenes = [floor.get("scene") for floor in floors if isinstance(floor, dict)]
    else:
        scenes = [document]
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("windows"), list):
            continue
        for index, window in enumerate(scene["windows"]):
            if not isinstance(window, dict) or "windowDesign" not in window:
                continue
            # 文案必须指名是哪一扇：一个户型十几扇窗，只说「自定义窗户超出墙体」时
            # 用户既不知道改哪扇，也不知道差多少毫米（0.8.4 现场是 7.000 m 窗塞
            # 6.997 m 墙，差 3 mm，看上去完全像按钮坏了）。
            label = f"窗户「{remark}」" if (remark := window.get("remark")) else f"第 {index + 1} 扇窗户"
            design = window["windowDesign"]
            try:
                validate_window_design(design, window.get("width"), window.get("height"))
            except HTTPException as error:
                raise HTTPException(error.status_code, f"{label}：{error.detail}") from None
            if design["mode"] != "custom":
                continue
            walls = scene.get("walls", [])
            _require(isinstance(walls, list))
            wall = _require_present(
                next(
                    (
                        candidate
                        for candidate in walls
                        if isinstance(candidate, dict) and candidate.get("id") == window.get("wallId")
                    ),
                    None,
                ),
                f"{label}：缺少所在墙体。",
            )
            calibration = scene.get("calibration") or {}
            _require(isinstance(calibration, dict))
            pixels_per_meter = calibration.get("pixelsPerMeter") or 100
            _require(
                _number(pixels_per_meter) and pixels_per_meter > 0 and _number(wall.get("height")),
                f"{label}：墙体尺寸无效，无法校验窗洞。",
            )
            start = wall.get("start", {})
            end = wall.get("end", {})
            _require(
                isinstance(start, dict) and isinstance(end, dict),
                f"{label}：墙体坐标无效，无法校验窗洞。",
            )
            coordinates = [start.get("x"), start.get("y"), end.get("x"), end.get("y")]
            _require(
                all(_number(coordinate) for coordinate in coordinates),
                f"{label}：墙体坐标无效，无法校验窗洞。",
            )
            length = math.hypot(end["x"] - start["x"], end["y"] - start["y"]) / pixels_per_meter
            sill = window.get("sill", 0)
            _require(_number(sill), f"{label}：窗台高度无效。")
            # 与前端 `windowSceneError` 一样拆成三条独立判据：合在一条 `and` 里
            # 只能给一句「请先调整窗宽、窗高或窗台」，用户得自己猜是哪条越界。
            _require(
                sill >= 0,
                f"{label}：窗台高度不能为负，请先调整窗台。",
            )
            _require(
                window["width"] <= length + 1e-6,
                f"{label}：超出墙体：窗宽 {round(window['width'] * 1000)} mm，"
                f"墙长只有 {round(length * 1000)} mm。请先缩窄窗宽或加长墙体。",
            )
            _require(
                sill + window["height"] <= wall["height"] + 1e-6,
                f"{label}：超出墙体：窗顶 {round((sill + window['height']) * 1000)} mm，"
                f"墙高只有 {round(wall['height'] * 1000)} mm。请先降低窗高或窗台。",
            )
