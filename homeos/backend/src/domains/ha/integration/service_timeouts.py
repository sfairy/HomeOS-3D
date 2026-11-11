"""HA 服务调用的超时策略（从 ``client.py`` 拆出）。

超时不是「一个常数」：慢服务（AI 生成 / 语音提问 / 固件安装）要几十秒，远程学习还要
按指令条数放大。把它们集中在一处，前端 ``control-timeout.ts`` 才有一个可对照的真源。

拆出来的动机：``client.py`` 已被文件规模棘轮锁住，而这段是纯函数策略、与连接管理无关。
"""

from __future__ import annotations

import math
from typing import Any

#: 慢服务统一超时（秒）：AI 生成、语音提问、固件安装都可能跑几十秒。
SLOW_SERVICE_TIMEOUT = 115

#: 单次控制请求的超时上限（秒）。远程学习按条数放大后理论上可达数小时，
#: 而控制连接池只有 16 条 —— 几个「学习一整套遥控器」的请求就能把全屋控制饿死。
#: 前端同一算法的转圈预算也远小于这个值，超出后前端早已放弃等待。
REMOTE_LEARNING_MAX_TIMEOUT = 180


def slow_service_timeout(domain: str, service: str, default: float) -> float:
    """慢服务超时；非慢服务返回调用方默认值。"""
    if is_slow_service(domain, service):
        return max(default, SLOW_SERVICE_TIMEOUT)
    return default


def is_slow_service(domain: str, service: str) -> bool:
    """该服务是否属于「慢服务」（AI 生成 / 语音提问 / 固件安装 / 远程学习）。

    慢服务占用连接的时间是秒到分钟级，必须与控制类请求分开配额，否则几次学习就能
    把 16 槽的控制池排满。
    """
    if domain == "ai_task" or (domain == "update" and service == "install"):
        return True
    if domain == "assist_satellite" and service == "ask_question":
        return True
    return (domain, service) == ("remote", "learn_command")


def remote_learning_timeout(data: dict[str, Any]) -> float:
    """学习红外/射频指令的超时：一条指令码通常要按下再等待，按条数放大。

    与前端 ``control-timeout.ts`` 同一套算法（前端用来决定"按钮转圈多久"，
    后端用来决定"HTTP 请求等多久"），差一个常数就出现"前端已超时、后端还在等"。

    末尾按 :data:`REMOTE_LEARNING_MAX_TIMEOUT` 封顶：不封顶时 64 条 × 2 相 × 60s
    可达 7695s（约 2 小时），期间每条都占着一个控制连接池槽位。
    """
    wait = data.get("timeout")
    if not isinstance(wait, (int, float)) or isinstance(wait, bool) or not math.isfinite(wait) or wait <= 0:
        wait = 60
    commands = data.get("command")
    count = max(1, min(64, len(commands))) if isinstance(commands, list) else 1
    phases = 2 if data.get("command_type") == "rf" else 1
    return float(min(REMOTE_LEARNING_MAX_TIMEOUT, min(60, wait) * count * phases + 15))


__all__ = [
    "REMOTE_LEARNING_MAX_TIMEOUT",
    "SLOW_SERVICE_TIMEOUT",
    "is_slow_service",
    "remote_learning_timeout",
    "slow_service_timeout",
]
