"""单进程约束的唯一实现：两个后端都不支持多 worker 部署。

为什么必须 fail-closed
--------------------
进程内限流（登录失败桶、匿名端点桶）、配色快照、巡检状态、socket.io 房间都住在
内存里。多 worker 时每个进程各有一份，限流会被放大 N 倍、状态彼此不可见。与其让它
"看起来能跑"，不如在启动时直接拒绝 —— 配置错误应该在启动日志里炸掉，而不是在安全
审计里才发现。

只拒绝"明确配了 >1 的 worker 数"。环境变量缺失、空串、1、非数字都按单进程处理；
``auto`` 代表平台自行决定，按多进程处理（无法保证仍是 1）。
"""

from __future__ import annotations

import os
from collections.abc import Mapping

WORKER_ENV_NAMES: tuple[str, ...] = (
    "WEB_CONCURRENCY",
    "UVICORN_WORKERS",
    "GUNICORN_WORKERS",
    "HOMEOS_WORKERS",
    "STORE_WORKERS",
)


def configured_worker_count(env: Mapping[str, str] | None = None) -> int:
    """返回已配置的 worker 数；未配置或无法解析时返回 1。"""
    source = os.environ if env is None else env
    for name in WORKER_ENV_NAMES:
        raw = (source.get(name) or "").strip().lower()
        if not raw:
            continue
        if raw == "auto":
            return 2
        try:
            count = int(raw)
        except ValueError:
            continue
        if count > 1:
            return count
    return 1


def assert_single_process(service: str, env: Mapping[str, str] | None = None) -> None:
    """发现多 worker 配置时抛 RuntimeError，阻止应用启动。"""
    source = os.environ if env is None else env
    offenders = [
        f"{name}={value}"
        for name in WORKER_ENV_NAMES
        if (value := (source.get(name) or "").strip()) and _is_multi(value)
    ]
    if not offenders:
        return
    raise RuntimeError(
        f"{service} 只支持单进程运行，检测到多 worker 配置：{'、'.join(offenders)}。"
        "进程内限流/会话状态/配色快照都按单进程设计；请删除这些环境变量，"
        "或改用独立实例 + 外部共享存储（当前版本未提供）。"
    )


def _is_multi(raw: str) -> bool:
    text = raw.strip().lower()
    if text == "auto":
        return True
    try:
        return int(text) > 1
    except ValueError:
        return False
