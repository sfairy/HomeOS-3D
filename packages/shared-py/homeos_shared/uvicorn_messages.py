"""uvicorn 自身文案的中文化（两侧共用一份）。

uvicorn 的启动 / 关闭行是**英文**且格式与后端自己的日志不同 —— 它那套 handler 由
``uvicorn.config.LOGGING_CONFIG`` 装配，样式是 ``INFO:     Started server process [12]``：
没有时间戳、没有进程身份，混在 ``2026-10-17 09:12:33,819 INFO    src | …`` 之间读起来
像两个人的日志拼在一起。主应用的做法是**接管 uvicorn 的日志器**（见 ``platform/core/log.py``），
把这几行翻成中文并纳入自家格式；商店侧此前没有对应物，于是同一台机器上两个服务的启动日志
风格不一致，排障时要分别认两套。

本模块只放**两侧逐字需要一致**的部分：英文文案 → 中文的规则表，以及 uvicorn 日志器名 →
中文展示名。装配方式（handler、格式、颜色、进程身份）各后端自定，故不在此处。

为什么要共享而不是各写一份：规则表是**跟着 uvicorn 版本走**的（``Uvicorn running on
<addr> (Press CTRL+C to quit)`` 这类字符串在 uvicorn 升级时会被改写）。两份副本的代价是
「一边翻成中文、另一边还在打英文原文」，而这正是启动日志最需要一眼看懂的时刻。

匹配策略是**尽力而为**：未命中任何规则的文案原样输出，绝不吞行 —— 过滤掉未知格式的日志
比留一行英文更糟（uvicorn 换了措辞，翻译不生效只是不好看；丢日志是信息缺失）。
"""
from __future__ import annotations

import re

#: uvicorn 日志器名 → 中文展示名。
#: 只列 uvicorn 自己的日志树：``uvicorn.access`` 是逐请求的访问日志，其余是它的内部阶段。
UVICORN_CONTEXT_ZH: dict[str, str] = {
    "uvicorn": "Web服务器",
    "uvicorn.error": "Web服务器",
    "uvicorn.access": "HTTP访问",
    "uvicorn.asgi": "ASGI",
    "uvicorn.lifespan": "应用生命周期",
    "uvicorn.lifespan.on": "应用生命周期",
    "uvicorn.lifespan.off": "应用生命周期",
    "uvicorn.protocols.http": "HTTP协议",
    "uvicorn.protocols.websockets": "WebSocket协议",
}

#: uvicorn 英文文案 → 中文（``pattern.match`` 从头匹配，未命中保持原文）
UVICORN_MESSAGE_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^Will watch for changes in these directories: (.+)$"), r"监听目录变更: \1"),
    (
        re.compile(r"^Uvicorn running on (\S+) \(Press CTRL\+C to quit\)$"),
        r"服务运行在 \1 (按 CTRL+C 退出)",
    ),
    (
        re.compile(r"^Started reloader process \[(\d+)\] using (.+)$"),
        r"已启动重载进程 [\1] (\2)",
    ),
    (re.compile(r"^Started server process \[(\d+)\]$"), r"已启动服务进程 [\1]"),
    (re.compile(r"^Waiting for application startup\.$"), "正在等待应用启动..."),
    (re.compile(r"^Application startup complete\.$"), "应用启动完成"),
    (re.compile(r"^Waiting for application shutdown\.$"), "正在等待应用关闭..."),
    (re.compile(r"^Application shutdown complete\.$"), "应用关闭完成"),
    (re.compile(r"^Finished server process \[(\d+)\]$"), r"服务进程已结束 [\1]"),
    (re.compile(r"^Shutting down$"), "正在关闭"),
)


def is_uvicorn_logger(name: str) -> bool:
    """是否属于 uvicorn 的日志树（``uvicorn`` / ``uvicorn.access`` / …）。"""
    return name == "uvicorn" or name.startswith("uvicorn.")


def localize_uvicorn_context(name: str) -> str | None:
    """uvicorn 日志器名 → 中文展示名；不是 uvicorn 的日志器返回 ``None``（由调用方决定怎么显示）。"""
    if not is_uvicorn_logger(name):
        return None
    return UVICORN_CONTEXT_ZH.get(name) or UVICORN_CONTEXT_ZH["uvicorn"]


def localize_uvicorn_message(text: str) -> str:
    """uvicorn 英文文案 → 中文；未命中规则时原样返回（fail-open，绝不丢信息）。"""
    for pattern, repl in UVICORN_MESSAGE_RULES:
        if pattern.match(text):
            return pattern.sub(repl, text)
    return text


__all__ = [
    "UVICORN_CONTEXT_ZH",
    "UVICORN_MESSAGE_RULES",
    "is_uvicorn_logger",
    "localize_uvicorn_context",
    "localize_uvicorn_message",
]
