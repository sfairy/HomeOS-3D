"""语音命令执行 helper（对齐 ``awareness/voice-command-execute.helper.ts``）。

将解析后的语音意图（自然语言映射或 HA Assist 返回）经家庭模式 / 命令代理下发，
统一执行鉴权（命令代理授权、实体 ACL）。

关键策略：
- ACL 前移：进入 HA conversation 前先校验，避免 guest/child 绕过 HomeOS ACL；
- 受限账户（child / guest / 带白名单的非 admin）不走 HA Assist 自动执行；
- HomeOS 本地场景 / 自动化已下线：对应 kind 抛不支持异常（改由 HA 场景 / 脚本承担）；
- 失败汇总返回给 VoiceService。
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .voice_commands import (
    extract_ha_assist_speech,
    extract_room_from_text,
    ha_assist_succeeded,
    plan_voice_commands,
)
from ..command_proxy_auth import assert_command_proxy_authorized
from ...core.errors import BusinessException, ErrorCode, api_error, bad_request, forbidden

logger = logging.getLogger("homeos.awareness.voice_command")


@dataclass
class VoiceCommandExecuteDeps:
    """语音命令执行依赖注入（对齐 Nest ``VoiceCommandExecuteDeps``）。"""

    session_factory: Any
    command_proxy: Any
    home_mode: Any
    get_voice_commands: Callable[[], list[dict[str, Any]]]
    get_entities: Callable[[], list[dict[str, Any]]]
    get_rooms: Callable[[], list[dict[str, Any]]]
    use_ha_conversation: Callable[[], bool]
    process_conversation: Callable[[str], Awaitable[dict[str, Any]]]
    logger: logging.Logger = logger


def assert_can_execute_voice(user: dict[str, Any] | None) -> str | None:
    """预检语音执行权限：guest 拒绝，child 必须配置白名单，否则放行。"""
    role = (user or {}).get("role")
    if role == "guest":
        return "访客账户无权控制设备"
    if role == "child":
        restrictions = (user or {}).get("restrictions")
        if not isinstance(restrictions, list) or len(restrictions) == 0:
            return "儿童账户未配置设备白名单，无法操作设备"
    return None


def should_skip_ha_assist(user: dict[str, Any] | None) -> bool:
    """child / guest / 带实体白名单的非 admin：HA Assist 不会复用 HomeOS ACL，禁止自动执行。"""
    role = (user or {}).get("role")
    if role in ("child", "guest"):
        return True
    restrictions = (user or {}).get("restrictions")
    restrictions = restrictions if isinstance(restrictions, list) else []
    return role != "admin" and len(restrictions) > 0


def _as_actor(user: dict[str, Any] | None) -> dict[str, Any] | None:
    if not user:
        return None
    return {"role": user.get("role"), "restrictions": user.get("restrictions")}


async def _execute_homeos_voice_action(
    action: dict[str, Any], user: dict[str, Any] | None, deps: VoiceCommandExecuteDeps
) -> None:
    target_id = str(action.get("targetId") or "").strip()
    if not target_id:
        bad_request(str(api_error("VOICE_HOMEOS_TARGET_MISSING")))
    kind = action.get("kind")
    if kind in ("homeos_scene", "homeos_automation"):
        raise BusinessException(
            ErrorCode.EXTERNAL_ERROR,
            "HomeOS 本地场景 / 自动化已下线，请在 HA 中配置并使用 HA 场景 / 脚本",
        )
    if kind == "homeos_mode":
        result = await deps.home_mode.activate(
            target_id, {"source": "manual", "reason": "voice", "actor": _as_actor(user)}
        )
        if isinstance(result, dict) and result.get("success") is False:
            detail = api_error("VOICE_HOME_MODE_FAILED", result.get("error") or "")
            raise BusinessException(ErrorCode.EXTERNAL_ERROR, detail)
        return
    bad_request(str(api_error("VOICE_UNKNOWN_COMMAND_TYPE")))


async def execute_voice_command(
    text: str, user: dict[str, Any] | None, deps: VoiceCommandExecuteDeps
) -> dict[str, Any]:
    """执行语音命令，返回 ``{ok, message, source, room?, count?}``。"""
    trimmed = str(text or "").strip()
    if not trimmed:
        return {"ok": False, "message": "未识别到语音内容", "source": "none"}

    rooms = deps.get_rooms()

    # ACL 前移：HA conversation 前先校验，避免绕过 HomeOS ACL
    acl_block = assert_can_execute_voice(user)
    if acl_block:
        forbidden(acl_block)

    # 受限账户不走 HA Assist 自动执行
    if deps.use_ha_conversation() and not should_skip_ha_assist(user):
        conv = await deps.process_conversation(trimmed)
        resp = conv.get("response") if isinstance(conv, dict) else None
        if ha_assist_succeeded(resp):
            speech = extract_ha_assist_speech(resp)
            hit_room = extract_room_from_text(trimmed, rooms)
            return {
                "ok": True,
                "message": speech or "已由 HA Assistant 执行",
                "source": "ha_assist",
                "room": hit_room.get("label") if hit_room else None,
            }

    mappings = deps.get_voice_commands()
    entities = deps.get_entities()
    plan = plan_voice_commands(trimmed, mappings, entities, rooms)

    room_label = (plan.get("room") or {}).get("label") if plan.get("room") else None
    if not plan.get("matched"):
        return {"ok": False, "message": plan.get("message"), "source": "none", "room": room_label}
    if not plan.get("actions"):
        return {
            "ok": False,
            "message": plan.get("message"),
            "source": "mapping",
            "room": room_label,
            "count": 0,
        }

    errors: list[str] = []
    skipped = 0

    for action in plan.get("actions") or []:
        kind = action.get("kind")
        if kind and kind != "entity":
            # 场景/自动化/家庭模式可含任意联动，儿童与访客一律拒绝
            role = (user or {}).get("role")
            denied = assert_can_execute_voice(user) or (
                "儿童账户不可通过语音触发场景/自动化/家庭模式" if role == "child" else None
            )
            if denied:
                skipped += 1
                errors.append(denied)
                continue
            try:
                await _execute_homeos_voice_action(action, user, deps)
            except Exception as exc:
                errors.append(str(exc))
            continue

        dto = {
            "domain": action.get("domain"),
            "service": action.get("service"),
            "entity_id": action.get("entityId"),
            "service_data": action.get("serviceData") or {},
        }
        try:
            await assert_command_proxy_authorized(dto, _as_actor(user))
        except Exception as exc:
            denied = str(exc) or "无权操作该设备"
            skipped += 1
            errors.append(f"{action.get('entityId')}: {denied}")
            continue
        try:
            await deps.command_proxy.call_service(dto)
        except Exception as exc:
            errors.append(f"{action.get('entityId')}: {exc}")

    total = len(plan.get("actions") or [])
    if skipped == total and len(errors) == skipped:
        return {
            "ok": False,
            "message": "当前账户无权执行该语音命令",
            "source": "mapping",
            "room": room_label,
            "count": 0,
        }
    if len(errors) == total:
        return {
            "ok": False,
            "message": f"命令执行失败：{errors[0]}",
            "source": "mapping",
            "room": room_label,
            "count": 0,
        }

    suffix = f"（{len(errors)} 个失败）" if errors else ""
    return {
        "ok": True,
        "message": f"{plan.get('message')}{suffix}",
        "source": "mapping",
        "room": room_label,
        "count": max(0, int(plan.get("count") or 0) - len(errors)),
    }


__all__ = [
    "VoiceCommandExecuteDeps",
    "assert_can_execute_voice",
    "execute_voice_command",
    "should_skip_ha_assist",
]
