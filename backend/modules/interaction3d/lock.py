"""门锁与门磁：显式的门绑定 + 按 HA 能力位复核的锁命令。

门在户型图里是「模型 + 传感器」的组合：模型提供门扇几何与开合动画，实体提供开合状态。
绑定里同时记着这两者（modelId 指模型、doorEntityId 之类的指实体），所以校验要一起看：
模型被删掉后控件不能继续静默工作，传感器的域也必须和它读取的字段对得上。

命令侧只看 HA 上报的能力位（supported_features）：不同品牌的门锁支持的位不一样，
不按位判断就会出现「按钮点得动、设备不响应」。
"""
from __future__ import annotations

import math
import re

from fastapi import HTTPException

# 这些字段只做类型与长度校验，缺省即空串也允许 —— 门的绑定是渐进补全的，
# 例如先在户型图里放一扇门，之后才去绑定门磁实体。
_OPTIONAL_FIELDS = frozenset(
    {
        "x",
        "y",
        "size",
        "height",
        "duration",
        "fontSize",
        "labelMode",
        "openAngle",
        "focusCamera",
        "labelHidden",
        "openDirection",
    }
)


def _text(value) -> bool:
    """字符串且不超过 128 字符；空串合法（缺省字段按空串处理）。"""
    return isinstance(value, str) and len(value) <= 128


def validate_lock_bindings(items, validate_camera) -> None:
    """校验 security.locks 绑定表。

    参数:
        validate_camera: 来自 config 的相机参数校验器（聚焦视角是共用结构）。
    异常:
        HTTPException: 422，任一字段非法。
    """

    def fail():
        raise HTTPException(422, detail="门锁配置无效，请检查门模型、实体及动画设置。")

    if not isinstance(items, list) or len(items) > 128:
        fail()
    ids = set()
    models = set()
    fields = {
        "x",
        "y",
        "id",
        "icon",
        "size",
        "hinge",
        "label",
        "height",
        "floorId",
        "modelId",
        "deviceId",
        "duration",
        "entityId",
        "fontSize",
        "labelMode",
        "openAngle",
        "deviceName",
        "focusCamera",
        "labelHidden",
        "doorEntityId",
        "openDirection",
        "tamperEntityId",
        "batteryEntityId",
        "lowBatteryEntityId",
    }
    # 门磁的读数来源：sensor 读一个二值传感器；single-event / dual-event 读事件实体。
    fields.update(
        {
            "doorSource",
            "doorOpenValue",
            "doorCloseValue",
            "doorOpenEntityId",
            "doorCloseEntityId",
            "doorEventEntityId",
            "doorEventAttribute",
        }
    )
    for item in items:
        if not isinstance(item, dict):
            fail()
        # 旧版本把这几个字段写在门绑定里，现在它们属于户型图模型；直接丢弃，
        # 让老配置在保存时被自动清理，而不是因为多余字段被拒。
        for key in ("doorType", "doorLabel", "wallId", "t"):
            item.pop(key, None)
        model_id = item.get("modelId")
        if isinstance(model_id, str) and model_id:
            raw_model_id = model_id
            if raw_model_id.startswith("door:"):
                raw_model_id = raw_model_id[5:]
            # 反复剥前缀，兼容早期写成 door:door:xxx 的配置。
            while raw_model_id.startswith("door:"):
                raw_model_id = raw_model_id[5:]
            item["modelId"] = f"door:{raw_model_id}" if raw_model_id else model_id
        # 必填项里除 _OPTIONAL_FIELDS 之外都在此核对：字符串且不超过 128 字符。
        # 空串是合法的（见 _OPTIONAL_FIELDS 的说明），因此这里不强制非空。
        if any(not _text(item.get(key, "")) for key in fields - _OPTIONAL_FIELDS):
            fail()
        if (
            any(not _text(item.get(key, "")) for key in ("id", "floorId", "modelId"))
            or item["floorId"] == "all"
            or not item["modelId"].startswith("door:")
        ):
            fail()
        model = (item["floorId"], item["modelId"])
        if item["id"] in ids or model in models:
            fail()
        ids.add(item["id"])
        models.add(model)
        if item.get("doorSource", "sensor") not in ("sensor", "single-event", "dual-event"):
            fail()
        # 事件实体只允许 event.* 域。
        for key in ("doorEventEntityId", "doorOpenEntityId", "doorCloseEntityId"):
            if not item.get(key):
                continue
            if re.fullmatch("event\\.[a-z0-9_]+", item[key]):
                continue
            fail()
        # 双事件：开与关必须是两个不同的事件实体，否则永远分不清方向。
        if (
            item.get("doorSource") == "dual-event"
            and item.get("doorOpenEntityId")
            and item.get("doorOpenEntityId") == item.get("doorCloseEntityId")
        ):
            fail()
        # 单事件：靠 doorOpenValue / doorCloseValue 两个读数区分开合，两者都要有且不同。
        if item.get("doorSource") == "single-event" and item.get("doorEventEntityId"):
            open_value = (item.get("doorOpenValue") or "").strip()
            close_value = (item.get("doorCloseValue") or "").strip()
            if not open_value or not close_value or open_value == close_value:
                fail()
        # 传感器类实体 ID 允许 '-'（HA 的事件实体常见），比通用实体正则宽松一档。
        for field in ("entityId", "doorEntityId", "batteryEntityId", "lowBatteryEntityId", "tamperEntityId"):
            if not item.get(field):
                continue
            if re.fullmatch("[a-z_]+\\.[a-z0-9_-]+", item[field]):
                continue
            fail()
        if "icon" in item and (
            not isinstance(item["icon"], str) or not re.fullmatch("mdi:[a-z0-9][a-z0-9-]{0,119}", item["icon"])
        ):
            fail()
        # 开合角度与动画时长：带上默认值后必须落在各自的合理区间。
        for field, default, low, high in (("openAngle", 80, 10, 110), ("duration", 0.7, 0.2, 3)):
            value = item.get(field, default)
            if value in (None, ""):
                value = default
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or not low <= value <= high
            ):
                fail()
        # openDirection 用 -1 / 1 表示开门方向，不接受其它数值（0 会让几何退化）。
        if type(item.get("openDirection", 1)) is not int or item.get("openDirection", 1) not in (-1, 1):
            fail()
        if item.get("hinge", "left") not in ("left", "right"):
            fail()
        # labelHidden 是旧字段，labelMode 是新的三态；没写 labelMode 时由 labelHidden 折算。
        default_label_mode = "hidden" if item.get("labelHidden") is True else "always"
        if item.get("labelMode", default_label_mode) not in ("hidden", "always", "open"):
            fail()
        if "labelHidden" in item and item["labelHidden"] not in (None, "") and type(item["labelHidden"]) is not bool:
            fail()
        for field, low, high in (("size", 20, 500), ("fontSize", 8, 100)):
            value = item.get(field)
            if value in (None, ""):
                continue
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or not low <= value <= high
            ):
                fail()
        # x / y / height 只要求是有限数：楼层坐标系由户型图决定，这里没有可用的上下界。
        for field in ("x", "y", "height"):
            value = item.get(field)
            if value in (None, ""):
                continue
            if type(value) not in (int, float) or not math.isfinite(value):
                fail()
        validate_camera(item.get("focusCamera"))


def require_lock_model(binding: dict, scene: dict) -> None:
    """确认门绑定的模型仍在当前户型里，并且它挂靠的墙也还在。

    异常:
        HTTPException: 409，门模型已移除或更改。
    """
    valid = any(
        floor.get("id") == binding.get("floorId")
        and any(
            f"door:{door.get('id')}" == binding.get("modelId")
            # frame-only 是只有门框没有门扇的占位，不能作为门锁动画的载体。
            and door.get("doorType") != "frame-only"
            and (
                not door.get("wallId")
                or any(
                    wall.get("id") == door.get("wallId")
                    for wall in floor.get("scene", {}).get("walls", [])
                )
            )
            for door in floor.get("scene", {}).get("doors", [])
        )
        for floor in scene.get("floors", [])
    )
    if not valid:
        raise HTTPException(409, detail="门模型已移除或更改，请重新配置。")


def validate_lock_command(service: str, data, state) -> None:
    """按 HA 上报的能力位复核锁命令。

    异常:
        HTTPException: 422 操作或参数不支持；409 门锁不可用或正在动作。
    """
    if service not in frozenset({"lock", "open", "unlock"}) or not isinstance(data, dict) or set(data) - {"code"}:
        raise HTTPException(422, detail="不支持的门锁操作或参数。")
    if state and (
        state.get("available") is False
        or state.get("state") in frozenset({None, "", "unknown", "unavailable"})
    ):
        raise HTTPException(409, detail="门锁状态不可用。")
    # 正在动作时再发命令，设备端会互相覆盖；这里等它稳定。
    if state.get("state") in frozenset({"locking", "opening", "unlocking"}):
        raise HTTPException(409, detail="门锁正在动作，请稍后重试。")
    attributes = state.get("attributes") or {}
    features = attributes.get("supported_features", 0)
    # open 是「释放锁舌」（bit 1 = OPEN），不是「解锁」；不支持时必须明确拒绝。
    if service == "open" and (type(features) is not int or not features & 1):
        raise HTTPException(422, detail="该门锁不支持释放锁舌。")
    code = data.get("code")
    if code is not None and (not isinstance(code, str) or not 1 <= len(code) <= 128):
        raise HTTPException(422, detail="门锁密码格式无效。")
    # 设备声明了 code_format 就必须带密码，否则设备会拒绝或触发错误提示音。
    if attributes.get("code_format") and not code:
        raise HTTPException(422, detail="此门锁需要密码。")
