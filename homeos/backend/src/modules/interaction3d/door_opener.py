"""环境「开门器」（``door-opener``）的绑定校验与模型存在性检查（0.9.0）。

## 为什么与窗扇分开
门机与开窗器的**物理形态**不同，校验口径也不同：

- 开窗器的宿主是「窗扇」（``window:{窗}:{扇}``），门机的宿主是**户型里画的门**
  （``door:{id}``，且 ``doorType != 'frame-only'`` —— 纯门框没有可动的门扇）；
- 门机绑定的是 **switch 实体**（``switch.*``），不是 ``cover.*``。门机厂商普遍只提供
  「开关」两态，没有行程百分比；
- 因此多了一个 ``switchMode``：

  - ``maintained``（保持型，默认）：开 / 关各对应一个 switch 服务调用；
  - ``momentary``（点动型）：发一次脉冲、开关自动复位，**只能开门**，且复位前禁止再发。

## 与安防门磁的关系
门磁（``security.doors``）负责**确认**门是否关上，开门器负责**控制**。
两者可以同时绑定在同一扇门上，但只有一套动画来源 —— 这与开窗器 + 窗磁的分工一致。
"""

from __future__ import annotations

import math
import re
from typing import Any, NoReturn

from fastapi import HTTPException

from .config_ctx import MDI_ICON_PATTERN

#: 单层最多绑定的开门器数量。
MAX_DOOR_OPENERS = 128

#: 门模型身份前缀（与 ``lock.py`` 的 ``DOOR_MODEL_PREFIX`` 同值：同一扇门两个功能共用）。
DOOR_MODEL_PREFIX = "door:"

#: 开门器绑定字段全集。
DOOR_OPENER_BINDING_FIELDS = frozenset(
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
        "deviceName",
        "duration",
        "entityId",
        "fontSize",
        "labelMode",
        "switchMode",
        "switchOpenState",
        "openPercent",
        "travelSeconds",
        "motionSource",
        "estimateMotion",
        "backgroundOpacity",
    }
)

#: 数值字段的合法区间（闭区间）。门机与开窗器同一套量程。
DOOR_OPENER_BINDING_RANGES: dict[str, tuple[float, float]] = {
    "openPercent": (0, 100),
    "travelSeconds": (5, 180),
    "duration": (0.2, 3),
    "size": (20, 500),
    "fontSize": (0.01, 10000),
    "backgroundOpacity": (0, 1),
    "x": (-1e6, 1e6),
    "y": (-1e6, 1e6),
    "height": (-1000, 1000),
}

#: 开关方式：保持型（开/关分别控制）/ 点动型（脉冲后自动复位）。
DOOR_SWITCH_MODES = ("maintained", "momentary")

#: 「开门」对应的 switch 原始状态。
DOOR_SWITCH_OPEN_STATES = ("on", "off")

#: 动画来源：自动 / 开门器自身 / 门磁。
DOOR_OPENER_MOTION_SOURCES = ("auto", "opener", "contact")

#: 布尔字段。
DOOR_OPENER_BOOLEAN_FIELDS = frozenset({"estimateMotion"})

#: 文本字段 = 全集 − 数值字段 − 布尔字段。
DOOR_OPENER_TEXT_FIELDS = (
    frozenset(DOOR_OPENER_BINDING_FIELDS) - frozenset(DOOR_OPENER_BINDING_RANGES) - DOOR_OPENER_BOOLEAN_FIELDS
)

#: 门机实体：switch（两态 + 开关方式）或 cover（自带行程）。binary_sensor 是门磁，不是控制实体。
_DOOR_ENTITY_PATTERN = re.compile(r"(?:switch|cover)\.[a-z0-9_]+")
_DOOR_MODEL_PATTERN = re.compile(r"door:[A-Za-z0-9._:-]{1,120}")
#: 裸门 id（不含冒号）：与 ``lock.py`` 共用同一批 id 字符集。
_BARE_DOOR_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,120}")


def _fail_door_opener(detail: str | None = None) -> NoReturn:
    """任一字段不合格时的统一 422。"""
    raise HTTPException(
        status_code=422,
        detail=detail or "开门器配置无效，请检查门模型、开关实体与开关方式。",
    )


def door_opener_targets(scene: Any) -> set[str]:
    """**单个楼层场景**里所有可绑定的门模型身份（``door:{id}``）。

    与 ``require_lock_model`` 同一口径：``frame-only``（纯门框）没有可动门扇，
    ``wallId`` 指向的墙体已删除时那扇门在 3D 里画不出来，两者都跳过。
    """
    if not isinstance(scene, dict):
        return set()
    wall_ids = {wall.get("id") for wall in scene.get("walls") or [] if isinstance(wall, dict)}
    return {
        DOOR_MODEL_PREFIX + str(door.get("id"))
        for door in scene.get("doors") or []
        if isinstance(door, dict)
        and door.get("id") is not None
        and door.get("doorType") != "frame-only"
        and door.get("wallId") in wall_ids
    }


def require_door_opener_model(binding: dict, scene: dict) -> None:
    """落库前确认门模型仍在场景里（否则 409，带可操作提示）。"""
    floor_id = binding.get("floorId")
    model_id = binding.get("modelId")
    floors = [
        floor for floor in (scene or {}).get("floors") or [] if isinstance(floor, dict) and floor.get("id") == floor_id
    ]
    if len(floors) == 1 and model_id and model_id in door_opener_targets(floors[0].get("scene")):
        return
    raise HTTPException(409, detail="开门器关联的门模型已移除或更改，请重新配置。")


def _check_fields(item: dict) -> None:
    """字段白名单 + 文本长度：不认识的键、超长文本一律拒绝。"""
    if set(item) - DOOR_OPENER_BINDING_FIELDS:
        _fail_door_opener()
    for key in DOOR_OPENER_TEXT_FIELDS:
        value = item.get(key, "")
        limit = 1500 if key == "modelId" else 255
        if not isinstance(value, str) or len(value) > limit:
            _fail_door_opener()


def _check_identity(item: dict) -> None:
    """必填 id / 楼层 / 门模型身份（``all`` 不是合法楼层）。"""
    if not item.get("id") or not item.get("floorId") or not item.get("modelId") or item["floorId"] == "all":
        _fail_door_opener()
    model_id = item["modelId"]
    if _DOOR_MODEL_PATTERN.fullmatch(model_id) is not None:
        return
    # 裸门 id（不含冒号）也接受：与 ``lock.py`` 的写入路径一致，由上层补 ``door:`` 前缀。
    # 含冒号的其它身份（``wall:`` / ``window:``）必须拒绝 —— 那是别的控件的宿主。
    if ":" not in model_id and _BARE_DOOR_ID_PATTERN.fullmatch(model_id) is not None:
        return
    _fail_door_opener()


def _check_numbers(item: dict) -> None:
    """数值字段：有限、落在量程内；``bool`` 不算数字。"""
    for key, (low, high) in DOOR_OPENER_BINDING_RANGES.items():
        if key not in item:
            continue
        value = item[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            _fail_door_opener()
        try:
            finite = math.isfinite(value)
        except OverflowError:
            finite = False
        if not finite or not low <= value <= high:
            _fail_door_opener()


def _check_switch_contract(item: dict) -> None:
    """开关实体与开关方式。

    ``switchOpenState`` 的语义是「哪个原始状态算开门」：默认 ``on``。
    低电平有效的门机把它设成 ``off``，开 / 关两次调用的服务就会互换。

    点动型**不允许**带 ``switchOpenState``：脉冲触发后开关自动复位，「开门对应状态」
    这个概念不成立，留着只会让用户以为它能反向关门。
    """
    entity_id = item.get("entityId")
    if not entity_id:
        _fail_door_opener("请为开门器选择开关实体。")
    # 上游文案是「选择可动门模型，再绑定 cover 或 switch 实体」—— 两种都合法：
    # ``switch`` 走两态 + 开关方式；``cover`` 自带行程，不需要开关方式。
    if not isinstance(entity_id, str) or _DOOR_ENTITY_PATTERN.fullmatch(entity_id) is None:
        _fail_door_opener("开门器只支持 switch 或 cover 域实体。")
    switch_mode = item.get("switchMode", "maintained")
    if switch_mode not in DOOR_SWITCH_MODES:
        _fail_door_opener()
    # cover 域没有「保持型 / 点动型」之分：它按行程开合，不存在脉冲复位。
    if entity_id.startswith("cover.") and switch_mode != "maintained":
        _fail_door_opener("cover 实体按行程开合，不支持点动型开关方式。")
    if "switchOpenState" in item and item["switchOpenState"] not in DOOR_SWITCH_OPEN_STATES:
        _fail_door_opener()
    if switch_mode == "momentary" and "switchOpenState" in item:
        _fail_door_opener("点动型开关不支持设置开门对应状态。")


def _check_enums(item: dict) -> None:
    """其余枚举 / 布尔 / 图标。"""
    if item.get("motionSource", "auto") not in DOOR_OPENER_MOTION_SOURCES:
        _fail_door_opener()
    if item.get("labelMode", "always") not in ("hidden", "always", "open"):
        _fail_door_opener()
    if "estimateMotion" in item and not isinstance(item["estimateMotion"], bool):
        # 字符串 ``"false"`` 在前端是真值，会让「关闭估算」的用户得到更抖的动画。
        _fail_door_opener()
    if "icon" in item:
        icon = item["icon"]
        if not isinstance(icon, str) or MDI_ICON_PATTERN.fullmatch(icon) is None:
            _fail_door_opener()


def validate_door_opener_bindings(items: Any) -> None:
    """校验一组开门器绑定（写入 3D 配置时调用）。任一条不合格即整体拒绝。"""
    if not isinstance(items, list) or len(items) > MAX_DOOR_OPENERS:
        _fail_door_opener()
    seen_ids: set[str] = set()
    seen_targets: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            _fail_door_opener()
        _check_fields(item)
        _check_identity(item)
        # 同一扇门只能有一个开门器：两个会同时发指令，门机收到的两次调用可能互相打断。
        target_key = item["modelId"].removeprefix(DOOR_MODEL_PREFIX)
        if item["id"] in seen_ids or target_key in seen_targets:
            _fail_door_opener("同一扇门只能配置一个开门器。")
        seen_ids.add(item["id"])
        seen_targets.add(target_key)
        _check_numbers(item)
        _check_switch_contract(item)
        _check_enums(item)
