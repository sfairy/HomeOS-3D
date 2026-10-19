"""uvicorn 自身文案的中文化（两侧共用一份）。

uvicorn 的启动 / 关闭行是**英文**且格式与后端自己的日志不同 —— 它那套 handler 由
``uvicorn.config.LOGGING_CONFIG`` 装配，样式是 ``INFO:     Started server process [12]``：
没有时间戳、没有进程身份，混在 ``2026-10-17 09:12:33,819 INFO    src | …`` 之间读起来
像两个人的日志拼在一起。主应用的做法是**接管 uvicorn 的日志器**（见 ``platform/core/log.py``），
把这几行翻成中文并纳入自家格式；商店侧此前没有对应物，于是同一台机器上两个服务的启动日志
风格不一致，排障时要分别认两套。

本模块只放**两侧逐字需要一致**的部分：英文文案 → 中文的规则表，以及 uvicorn 日志器名 →
中文展示名。装配方式（handler、格式、颜色、进程身份）各后端自定，故不在此处。

WebSocket 的握手行也在这里翻译：uvicorn 把它写进 ``uvicorn.error``（不是 ``uvicorn.access``），
形如 ``127.0.0.1:50380 - "WebSocket /api/v1/ws/runtime" [accepted]``。它既没有中文，
也不属于 ``http_access_log`` 能识别的 ``"GET /x" 200`` 形态，所以只能靠文案规则处理；
重复握手行的折叠另见 ``http_access_log.install_websocket_handshake_log_filter``。

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
    (re.compile(r"^Will watch for changes in these directories: (.+)$"), r"监听目录变更（热重载）: \1"),
    (
        re.compile(r"^Uvicorn running on (\S+) \(Press CTRL\+C to quit\)$"),
        r"服务已就绪: \1 (按 CTRL+C 退出)",
    ),
    (
        re.compile(r"^Started reloader process \[(\d+)\] using (.+)$"),
        r"已启动重载进程 [\1] (\2)",
    ),
    (re.compile(r"^Started server process \[(\d+)\]$"), r"服务进程已启动 [\1]"),
    # 「等待启动 / 关闭」是 uvicorn 的说法，读起来像正在等别人；用户看到的是应用在起停。
    (re.compile(r"^Waiting for application startup\.$"), "正在启动应用..."),
    (re.compile(r"^Application startup complete\.$"), "应用启动完成"),
    (re.compile(r"^Waiting for application shutdown\.$"), "正在停止应用..."),
    (re.compile(r"^Application shutdown complete\.$"), "应用已停止"),
    (re.compile(r"^Finished server process \[(\d+)\]$"), r"服务进程已退出 [\1]"),
    (re.compile(r"^Shutting down$"), "正在关闭"),
    # WebSocket：握手结果由 uvicorn 写进 ``uvicorn.error``，方括号标记是协议原文不是文案
    (
        re.compile(r'^(?P<client>\S+) - "WebSocket (?P<path>[^"]+)" \[accepted\]$'),
        r"WebSocket 已连接: \g<path>(来源 \g<client>)",
    ),
    (
        re.compile(r'^(?P<client>\S+) - "WebSocket (?P<path>[^"]+)" (?P<status>\d{3})$'),
        r"WebSocket 握手失败(\g<status>): \g<path>(来源 \g<client>)",
    ),
    # 连接生命周期由 ``websockets`` 库打在同一个日志器上，没有客户端/路径信息
    (re.compile(r"^connection open$"), "WebSocket 连接已建立"),
    (re.compile(r"^connection closed$"), "WebSocket 连接已关闭"),
    (
        re.compile(r"^connection rejected \((?P<status>\d+) (?P<reason>.+)\)$"),
        r"WebSocket 连接被拒(\g<status> \g<reason>)",
    ),
)

#: 状态去重补在消息尾部的折叠注记（全角 / 半角括号都认：控制台规整会把全角转半角）
_FOLD_NOTE_RE = re.compile(r"(?:（同类已折叠\s*\d+\s*条）|\(同类已折叠\s*\d+\s*条\))$")


def is_uvicorn_logger(name: str) -> bool:
    """是否属于 uvicorn 的日志树（``uvicorn`` / ``uvicorn.access`` / …）。"""
    return name == "uvicorn" or name.startswith("uvicorn.")


def localize_uvicorn_context(name: str) -> str | None:
    """uvicorn 日志器名 → 中文展示名；不是 uvicorn 的日志器返回 ``None``（由调用方决定怎么显示）。"""
    if not is_uvicorn_logger(name):
        return None
    return UVICORN_CONTEXT_ZH.get(name) or UVICORN_CONTEXT_ZH["uvicorn"]


def localize_uvicorn_message(text: str) -> str:
    """uvicorn 英文文案 → 中文；未命中规则时原样返回（fail-open，绝不丢信息）。

    先摘掉去重过滤器补在尾部的折叠注记（``（同类已折叠 N 条）``，见
    ``status_log_dedupe.FOLD_NOTE``）再匹配：本模块的规则都以 ``$`` 结尾，不摘注记的话
    命中折叠的那一行会退回英文 —— 实测 ``connection open(同类已折叠10条)`` 就是这么来的。
    """
    note = ""
    folded = _FOLD_NOTE_RE.search(text)
    if folded is not None:
        note = folded.group(0)
        text = text[: folded.start()]
    for pattern, repl in UVICORN_MESSAGE_RULES:
        if pattern.match(text):
            return pattern.sub(repl, text) + note
    return text + note


__all__ = [
    "UVICORN_CONTEXT_ZH",
    "UVICORN_MESSAGE_RULES",
    "is_uvicorn_logger",
    "localize_uvicorn_context",
    "localize_uvicorn_message",
]
