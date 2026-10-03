"""Explicit door bindings and capability-checked lock commands."""
import math
import re

from fastapi import HTTPException


def validate_lock_bindings(items, validate_camera) -> None:

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
        "doorEntityId",
        "openDirection",
        "tamperEntityId",
        "batteryEntityId",
        "backgroundOpacity",
        "lowBatteryEntityId",
    }
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
        model_id = item.get("modelId")
        if isinstance(model_id, str) and model_id:
            item["modelId"] = model_id if model_id.startswith("door:") else f"door:{model_id}"
        if any(
            not isinstance(item.get(k, ''), str) or len(item.get(k, '')) > 255
            for k in fields
            - {
                "x",
                "y",
                "size",
                "height",
                "duration",
                "fontSize",
                "labelMode",
                "openAngle",
                "focusCamera",
                "openDirection",
                "backgroundOpacity",
            }
        ):
            fail()
        if (
            any(not item.get(k) for k in ("id", "floorId", "modelId"))
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
        for key in ("doorEventEntityId", "doorOpenEntityId", "doorCloseEntityId"):
            if not item.get(key):
                continue
            if re.fullmatch("event\\.[a-z0-9_]+", item[key]):
                continue
            fail()
        if (
            item.get("doorSource") == "dual-event"
            and item.get("doorOpenEntityId")
            and item.get("doorOpenEntityId") == item.get("doorCloseEntityId")
        ):
            fail()
        if item.get("doorSource") == "single-event" and item.get("doorEventEntityId"):
            if (
                not item.get("doorOpenValue", "").strip()
                or not item.get("doorCloseValue", "").strip()
                or item["doorOpenValue"].strip() == item["doorCloseValue"].strip()
            ):
                fail()
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
        if type(item.get("openDirection", 1)) is not int or item.get("openDirection", 1) not in (-1, 1):
            fail()
        if item.get("hinge", "left") not in ("left", "right"):
            fail()
        if item.get("labelMode", "always") not in ("hidden", "always", "open"):
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
        if "backgroundOpacity" in item:
            value = item["backgroundOpacity"]
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or not 0 <= value <= 1
            ):
                fail()
        for field in ("x", "y", "height"):
            value = item.get(field)
            if value in (None, ""):
                continue
            if type(value) not in (int, float) or not math.isfinite(value):
                fail()
        validate_camera(item.get("focusCamera"))


def require_lock_model(binding: dict, scene: dict) -> None:
    valid = any(
        'door:' + str(door.get('id')) == binding.get("modelId")
        and door.get("doorType") != "frame-only"
        and any(
            w.get("id") == door.get("wallId")
            for w in floor.get("scene", {}).get("walls", [])
        )
        for floor in scene.get("floors", [])
        if floor.get("id") == binding.get("floorId")
        for door in floor.get("scene", {}).get("doors", [])
    )
    if not valid:
        raise HTTPException(409, detail="门模型已移除或更改，请重新配置。")


def validate_lock_command(service: str, data, state) -> None:
    if service not in {"lock", "open", "unlock"} or not isinstance(data, dict) or set(data) - {"code"}:
        raise HTTPException(422, detail="不支持的门锁操作或参数。")
    if not state:
        raise HTTPException(409, detail="门锁状态尚未载入，请稍后重试。")
    if (
        state.get("available") is False
        or state.get("state") in {None, "", "unknown", "unavailable"}
    ):
        raise HTTPException(409, detail="门锁状态不可用。")
    if state.get("state") in {"locking", "opening", "unlocking"}:
        raise HTTPException(409, detail="门锁正在动作，请稍后重试。")
    attributes = state.get("attributes") or {}
    features = attributes.get("supported_features", 0)
    if service == "open" and (type(features) is not int or not features & 1):
        raise HTTPException(422, detail="该门锁不支持释放锁舌。")
    code = data.get("code")
    if code is not None and (not isinstance(code, str) or not 1 <= len(code) <= 128):
        raise HTTPException(422, detail="门锁密码格式无效。")
    if attributes.get("code_format") and not code:
        raise HTTPException(422, detail="此门锁需要密码。")
