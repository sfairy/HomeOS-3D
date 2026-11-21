"""计划任务的常量与 ORM → 字典序列化（从 ``scheduler`` 拆出，控制文件规模）。

这些定义只被调度器 / 工具 / API 读取，不参与 tick 循环本身；把它们留在
``scheduler.py`` 里会让「调度逻辑」与「字段形状」混在一个 800+ 行的文件里。
"""

from __future__ import annotations

import json
from typing import Any

from ..runtime.agent_actor import AgentActor
from ....platform.core.db.json_field import read_json_object
from ....platform.core.db.models import AgentScheduledTask, AgentTaskExecutionLog

#: tick 间隔（秒）
TICK_SECONDS = 10
#: 任务条数上限
MAX_TASKS = 100
#: 单次查询执行日志条数上限
MAX_LOG_ROWS = 100
#: 执行日志保留天数（超过即清理，避免 10 秒 tick 长期运行把表撑爆）
LOG_RETENTION_DAYS = 90
#: 两次日志清理的最小间隔（秒）
PRUNE_INTERVAL_SECONDS = 3600
#: 任务名最长字符数
MAX_NAME_CHARS = 128
#: 允许被计划任务调用的工具：只放开控制类动作与提醒消息，避免把任意工具挂到定时器上。
#: 与 ``schedule_task`` 的 schema 一一对应 —— 之前这里只放 ``control_device``，
#: schema 却宣称支持场景与家庭模式，模型照着 schema 传参就会被这条白名单拒掉。
ALLOWED_ACTION_TOOLS = frozenset({"control_device", "activate_scene", "activate_home_mode", "send_notification"})

#: 计划任务到点发提醒时的系统执行身份。
#: 任务创建者可能是一个已解绑的渠道用户；提醒属于「系统到点投递」，不该因为创建者
#: 身份缺失就静默不发。设备控制仍然要求原身份（见 ``_execute_task``）。
SYSTEM_NOTIFY_ACTOR = AgentActor(user_id="system:agent-scheduler", username="计划任务")


def json_dump(value: Any) -> str:
    """JSON 文本字段：与仓内其它 JSON 列同一口径（ensure_ascii=False、None → {}）。"""
    return json.dumps(value if value is not None else {}, ensure_ascii=False)


def serialize_task(row: AgentScheduledTask) -> dict[str, Any]:
    """ORM → camelCase 字典（API / 工具 / 前端共用）。"""
    return {
        "id": row.id,
        "name": row.name,
        "enabled": bool(row.enabled),
        "scheduleType": row.schedule_type,
        "runAt": row.run_at.isoformat() if row.run_at else None,
        "cron": row.cron or "",
        "timezone": row.timezone or "",
        "actionTool": row.action_tool or "",
        "actionArgs": read_json_object(row.action_args, {}),
        "precondition": read_json_object(row.precondition, {}),
        "lastRunAt": row.last_run_at.isoformat() if row.last_run_at else None,
        "nextRunAt": row.next_run_at.isoformat() if row.next_run_at else None,
        "lastStatus": row.last_status or "",
        "lastError": row.last_error or "",
        "runCount": int(row.run_count or 0),
        "updatedBy": read_json_object(getattr(row, "updated_by", None), {}),
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def serialize_log(row: AgentTaskExecutionLog) -> dict[str, Any]:
    return {
        "id": row.id,
        "taskId": row.task_id,
        "startedAt": row.started_at.isoformat() if row.started_at else None,
        "finishedAt": row.finished_at.isoformat() if row.finished_at else None,
        "status": row.status,
        "message": row.message,
        "result": read_json_object(row.result, {}),
    }


__all__ = [
    "ALLOWED_ACTION_TOOLS",
    "LOG_RETENTION_DAYS",
    "MAX_LOG_ROWS",
    "MAX_NAME_CHARS",
    "MAX_TASKS",
    "PRUNE_INTERVAL_SECONDS",
    "SYSTEM_NOTIFY_ACTOR",
    "TICK_SECONDS",
    "json_dump",
    "serialize_log",
    "serialize_task",
]
