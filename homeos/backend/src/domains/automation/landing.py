"""把已确认的草案落成「本机计划任务」或「HA 自动化」（Phase 2：仍需用户显式确认）。

草案本身永远只预览；只有用户点击「生成计划任务」/「导出到 HA 自动化」，或明确让管家
落地时，才走这里。落地目标刻意收窄：

- 只支持 ``control_device`` 一种动作（沿用调度器白名单与到期时的权限 / 高危拦截）；
- 只支持单一时间型触发（``at`` / ``cron`` / ``days``）；状态触发与多目标需要拆成多条；
- 已是 ``BLOCKED`` / ``CLARIFYING`` 的草案不落地（前者高危、后者信息不全）。

两种落地目标的语义差别（**别混**）：

- ``build_task_payload`` → 本机计划任务：由 HomeOS 调度器在到期时下发命令；
- ``build_ha_automation_payload`` → HA 自动化：写进 HA 自己的 automation 配置，
  由 HA 执行，生态内可见、可被其它触发源复用。换机 / HA 重装后规则仍在 HA 侧。

返回 ``(payload, error)``；``error`` 非空时 payload 为 ``None``。
"""

from __future__ import annotations

import logging
from typing import Any

from .spec import describe_trigger, is_high_risk, text

logger = logging.getLogger("homeos.automation")

#: 星期写法 → cron 的 day-of-week（0 与 7 都是周日）
_WEEKDAYS = {
    "mon": 1,
    "monday": 1,
    "周一": 1,
    "星期一": 1,
    "tue": 2,
    "tuesday": 2,
    "周二": 2,
    "星期二": 2,
    "wed": 3,
    "wednesday": 3,
    "周三": 3,
    "星期三": 3,
    "thu": 4,
    "thursday": 4,
    "周四": 4,
    "星期四": 4,
    "fri": 5,
    "friday": 5,
    "周五": 5,
    "星期五": 5,
    "sat": 6,
    "saturday": 6,
    "周六": 6,
    "星期六": 6,
    "sun": 0,
    "sunday": 0,
    "周日": 0,
    "周天": 0,
    "星期日": 0,
    "星期天": 0,
}
_EVERY_DAY = {"", "*", "每天", "每日", "天天", "every day", "daily", "everyday"}
_WEEKDAYS_RANGE = {"工作日", "weekday", "weekdays", "mon-fri"}
_WEEKEND = {"周末", "weekend", "weekends"}


def build_task_payload(spec: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    """草案 spec → 计划任务载荷。"""
    risks = is_high_risk(spec)
    if risks:
        return None, f"草案命中高危设备，不能落地为计划任务（{', '.join(risks)}）"

    raw_action = spec.get("action")
    action: dict[str, Any] = raw_action if isinstance(raw_action, dict) else {}
    service = text(action.get("service"))
    if not service:
        return None, "草案没有指定执行动作，无法落地"
    if "." not in service:
        return None, f"动作 {service} 缺少设备域，无法落地"
    domain, _, service_name = service.partition(".")

    targets = [item for item in (spec.get("targets") or []) if isinstance(item, dict)]
    entity_ids = [text(item.get("entityId")) for item in targets if text(item.get("entityId"))]
    if not entity_ids:
        return None, "草案没有已解析的目标设备，无法落地"
    # 同一句话里的多台设备就是一条规则：计划任务支持逐个下发（scheduler._run_action），
    # 只要它们同属一个域、且与动作域一致即可。跨域（灯 + 门锁）必须拆开，否则动作会打错设备。
    mismatched = [
        entity_id for entity_id in entity_ids if entity_id.split(".", 1)[0] != domain and domain != "homeassistant"
    ]
    if mismatched:
        return None, f"动作域 {domain} 与目标设备 {mismatched[0]} 不一致，请把不同域的设备拆成多条规则"

    triggers = [item for item in (spec.get("triggers") or []) if isinstance(item, dict)]
    if len(triggers) != 1:
        return None, "计划任务只支持一个触发条件；请精简草案的触发器"
    cron, error = _cron_from_trigger(triggers[0])
    if error:
        return None, error

    action_args: dict[str, Any] = {"domain": domain, "service": service_name}
    if len(entity_ids) == 1:
        action_args["entity_id"] = entity_ids[0]
    else:
        action_args["entity_ids"] = entity_ids
    raw_data = action.get("data")
    if isinstance(raw_data, dict) and raw_data:
        action_args["service_data"] = raw_data

    name = text(spec.get("intentSummary")) or f"{entity_ids[0]} {service_name}"
    return (
        {
            "name": name[:128],
            "scheduleType": "RECURRING",
            "cron": cron,
            "timezone": text(spec.get("timezone")) or "Asia/Shanghai",
            "actionTool": "control_device",
            "actionArgs": action_args,
        },
        "",
    )


def build_ha_automation_payload(spec: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    """草案 spec → **HA 自动化**配置体（``automation/`` 里的那一条）。

    与 :func:`build_task_payload` 共用同一套校验（高危拦截 / 单触发 / 单域目标），
    但产出的是 HA 的形状：``trigger`` / ``action``。写成自动化后由 HA 自己执行，
    不再依赖 HomeOS 调度器。
    """
    task, error = build_task_payload(spec)
    if task is None:
        return None, error
    action_args = task["actionArgs"]
    domain = str(action_args.get("domain") or "")
    service_name = str(action_args.get("service") or "")
    entity_ids = action_args.get("entity_ids") or ([action_args["entity_id"]] if action_args.get("entity_id") else [])
    if not entity_ids or not domain or not service_name:
        return None, "草案缺少目标设备或动作，无法生成 HA 自动化"

    trigger = _ha_trigger_from_cron(task["cron"], spec)
    if trigger is None:
        return None, f"cron「{task['cron']}」超出 HA 时间触发可表达的范围（只支持每天 / 每周定时）"
    weekdays = trigger.pop("_weekdays", None)

    action: dict[str, Any] = {
        "service": f"{domain}.{service_name}",
        "target": {"entity_id": entity_ids if len(entity_ids) > 1 else entity_ids[0]},
    }
    service_data = action_args.get("service_data")
    if isinstance(service_data, dict) and service_data:
        action["data"] = service_data
    payload: dict[str, Any] = {
        "alias": task["name"],
        "description": "由 HomeOS 自动化草案导出",
        "mode": "single",
        "trigger": [trigger],
        "action": [action],
    }
    if weekdays:
        # HA 的 time 触发没有「只在某些星期」字段：星期限制要放在 condition 上。
        payload["condition"] = [{"condition": "time", "weekday": weekdays}]
    return payload, ""


def _ha_trigger_from_cron(cron: str, spec: dict[str, Any]) -> dict[str, Any] | None:
    """``分 时 * * 周`` → HA ``time`` 触发；非「每天/每周」形状返回 ``None``。

    HA 的 ``time`` 触发不能表达任意 cron（例如「每小时第 5 分钟」需要 ``minutes: 5``），
    这里只覆盖草案实际会产出的两种形状：``M H * * *``（每天）与 ``M H * * D``（每周）。
    """
    parts = str(cron).split()
    if len(parts) != 5:
        return None
    minute, hour, day, month, dow = parts
    try:
        hour_value, minute_value = int(hour), int(minute)
    except ValueError:
        logger.debug("cron 的时分不是整数：%r", cron)
        return None
    if day != "*" or month != "*":
        return None
    # HA 的 ``time`` 触发接受任意 ``HH:MM[:SS]``（07:03 完全合法）。这里只校验范围；
    # 旧实现额外要求「分钟是 5 的倍数」，于是「07:03」草案能落成 HomeOS 任务、
    # 却导不出 HA 自动化（还提示「超出 HA 时间触发可表达的范围」）。
    if not (0 <= hour_value <= 23 and 0 <= minute_value <= 59):
        return None
    trigger: dict[str, Any] = {"platform": "time", "at": f"{hour_value:02d}:{minute_value:02d}:00"}
    if dow != "*":
        weekdays = _ha_weekdays(dow)
        if weekdays is None:
            return None
        # HA 用 ``condition: time/ weekday`` 表达「只在某些星期」：放在 trigger 里没有
        # 官方字段，因此保留在 ``condition`` 上（调用方负责拼装）。
        trigger["_weekdays"] = weekdays
    return trigger


def _ha_weekdays(dow: str) -> list[str] | None:
    """cron 的 day-of-week（0/7=周日）→ HA weekday 名；范围不支持时返回 ``None``。"""
    names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    if dow == "1-5":
        return ["mon", "tue", "wed", "thu", "fri"]
    if dow == "0,6":
        return ["sat", "sun"]
    try:
        values = [int(item) for item in dow.split(",") if item.strip()]
    except ValueError:
        logger.debug("cron 的星期字段不是整数：%r", dow)
        return None
    if any(value < 0 or value > 7 for value in values):
        return None
    return [names[value % 7] for value in values]


def _cron_from_trigger(trigger: dict[str, Any]) -> tuple[str, str]:
    """时间型触发器 → cron；不支持的类型返回错误说明。"""
    kind = text(trigger.get("type")) or "time"
    if kind not in ("time", "cron"):
        return "", f"「{kind}」类型的触发暂不支持生成计划任务（当前支持每天 / 每周定时）"

    raw_cron = text(trigger.get("cron"))
    if raw_cron:
        parts = raw_cron.split()
        if len(parts) != 5:
            return "", "cron 表达式需要 5 段（分 时 日 月 周）"
        return " ".join(parts), ""

    hour, minute, error = _parse_time(text(trigger.get("at")))
    if error:
        return "", error
    dow, error = _cron_dow(trigger.get("days"))
    if error:
        return "", error
    return f"{minute} {hour} * * {dow}", ""


def _parse_time(raw: str) -> tuple[int, int, str]:
    value = text(raw).replace("：", ":").strip()
    if not value:
        return 0, 0, "草案的触发时间不完整（需要 HH:MM）"
    if "点" in value:
        hour_text, _, rest = value.partition("点")
        minute_text = rest.replace("分", "").strip() or "0"
        value = f"{hour_text}:{minute_text}"
    if ":" not in value:
        if value.isdigit():
            value = f"{value}:00"
        else:
            return 0, 0, f"无法识别触发时间「{raw}」（需要 HH:MM）"
    hour_text, _, minute_text = value.partition(":")
    try:
        hour = int(hour_text)
        minute = int(minute_text or 0)
    except ValueError as exc:  # fmt: skip
        logger.debug("无法解析触发时间 %r: %s", raw, exc)
        return 0, 0, f"无法识别触发时间「{raw}」（需要 HH:MM）"
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return 0, 0, f"触发时间「{raw}」超出范围（00:00 ~ 23:59）"
    return hour, minute, ""


def _cron_dow(raw: Any) -> tuple[str, str]:
    tokens = _day_tokens(raw)
    if not tokens:
        return "*", ""
    if "*" in tokens:
        return "*", ""
    if all(token in _EVERY_DAY for token in tokens):
        return "*", ""
    if any(token in _WEEKDAYS_RANGE for token in tokens):
        return "1-5", ""
    if any(token in _WEEKEND for token in tokens):
        return "0,6", ""
    indices: list[int] = []
    for token in tokens:
        index = _day_index(token)
        if index is None:
            return "", f"无法识别重复日「{' '.join(tokens)}」（可用：周一~周日 / 工作日 / 周末）"
        indices.append(index)
    return ",".join(str(item) for item in sorted(set(indices))), ""


def _day_tokens(raw: Any) -> list[str]:
    """把「周一,周三」/ ["周六","周日"] / "工作日" 拆成小写 token 列表。"""
    if raw in (None, "", [], {}):
        return []
    items = raw if isinstance(raw, list) else [raw]
    tokens: list[str] = []
    for item in items:
        parts = text(item).replace("，", ",").replace("、", ",").split(",")
        tokens.extend(part.strip().lower() for part in parts if part.strip())
    return tokens


def _day_index(token: str) -> int | None:
    """单个星期 token → cron 的 day-of-week；无法识别返回 ``None``。"""
    if token.isdigit() and 0 <= int(token) <= 7:
        return 0 if int(token) == 7 else int(token)
    return _WEEKDAYS.get(token)


def describe_landing(spec: dict[str, Any]) -> str:
    """落地说明：把 spec 概括成一句可读文本（前端确认框 / 接口回执用）。"""
    raw_trigger = (spec.get("triggers") or [{}])[0]
    trigger = raw_trigger if isinstance(raw_trigger, dict) else {}
    raw_action = spec.get("action")
    action: dict[str, Any] = raw_action if isinstance(raw_action, dict) else {}
    targets = "、".join(
        text(item.get("name")) or text(item.get("entityId"))
        for item in (spec.get("targets") or [])
        if isinstance(item, dict)
    )
    return f"{describe_trigger(trigger)} · {targets} · {text(action.get('service'))}"


__all__ = ["build_task_payload", "describe_landing"]
