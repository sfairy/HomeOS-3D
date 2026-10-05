"""NestJS 风格控制台日志（对齐 ``common/observability/structured-logger.ts``）。

- 控制台格式与 Nest ``ConsoleLogger`` 对齐：
  ``[HomeOS] <pid>  - <时间> <级别> [<中文来源>] <消息>``
- 日志上下文（Python logger 名）映射为中文展示名（对齐 ``logger-context-zh.util.ts``）；
- 打印前做全角标点转半角 + 收紧中英文边界空格（对齐 Nest ``localizeLogMessage``）；
- ``LOG_FORMAT=json`` 时输出结构化 JSON 行（含 traceId），便于 Loki / ELK；
- 一并接管 uvicorn 自身的日志器，保证控制台风格统一。
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import UTC, datetime
from typing import Any

from .observability import get_trace_id
from .status_log_dedupe import StatusLogDedupeFilter

#: Nest ``verbose`` 级别：低于 ``DEBUG``，与 Nest ``LogLevel`` 一一对应
_VERBOSE = 5
logging.addLevelName(_VERBOSE, "VERBOSE")

#: Nest 语义日志级别名 → Python logging 级别
_LEVEL_NAMES = {
    "debug": logging.DEBUG,
    "verbose": _VERBOSE,
    "log": logging.INFO,
    "info": logging.INFO,
    "warn": logging.WARNING,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "fatal": logging.CRITICAL,
}

#: Python 级别 → Nest 控制台级别标签
_NEST_LEVEL_LABEL = {
    _VERBOSE: "VERBOSE",
    logging.DEBUG: "DEBUG",
    logging.INFO: "LOG",
    logging.WARNING: "WARN",
    logging.ERROR: "ERROR",
    logging.CRITICAL: "FATAL",
}

#: ANSI 颜色（对齐 Nest ``cli-colors.util``：前景色用 ``39`` 复位、粗体用 ``0`` 复位）
_RESET = "\x1b[0m"
_BOLD = "\x1b[1m"
#: Nest ``yellow`` 取 256 色 3 号，与 ``clc`` 一致
_CONTEXT_YELLOW = "\x1b[38;5;3m"

#: 级别 → 前景色（Nest ``getColorByLogLevel``）
_LEVEL_COLOR = {
    "VERBOSE": "\x1b[96m",  # cyanBright
    "DEBUG": "\x1b[95m",  # magentaBright
    "LOG": "\x1b[32m",  # green
    "WARN": "\x1b[33m",  # yellow
    "ERROR": "\x1b[31m",  # red
    "FATAL": _BOLD,  # bold
}

#: 起始码 → 复位码
_ANSI_RESET = {
    _RESET: _RESET,
    _BOLD: _RESET,
    _CONTEXT_YELLOW: "\x1b[39m",
    "\x1b[96m": "\x1b[39m",
    "\x1b[95m": "\x1b[39m",
    "\x1b[32m": "\x1b[39m",
    "\x1b[33m": "\x1b[39m",
    "\x1b[31m": "\x1b[39m",
}

#: logger 名 → 中文展示名（对齐 Nest ``LOGGER_CONTEXT_ZH``，按 Python 侧命名重排）
_CONTEXT_ZH: dict[str, str] = {
    "homeos": "HomeOS",
    "homeos.app": "应用服务",
    "homeos.bootstrap": "启动引导",
    # 认证 / 授权
    "homeos.auth": "认证",
    "homeos.license": "授权许可",
    # 界面配置
    "homeos.ui_config": "界面配置",
    "homeos.ui_config.assets": "静态资源",
    # 基础设施
    "homeos.database": "数据库",
    "homeos.retention": "数据库留存",
    "homeos.distributed-lock": "分布式锁",
    "homeos.circuit_breaker": "熔断器",
    "homeos.jobs": "任务注册",
    "homeos.event_log": "事件日志",
    "homeos.shared.event_bus": "事件总线",
    "homeos.app_config": "应用配置",
    "homeos.app_config.backup": "应用配置备份",
    # HA 连接
    "homeos.ha_ws": "HA WebSocket",
    "homeos.ha_rest": "HA REST客户端",
    "homeos.ha_config": "HA配置",
    "homeos.ha_connector": "HA连接器",
    "homeos.ha_command_queue": "HA指令队列",
    "homeos.state_ingress_coalesce": "HA状态入站合并",
    "homeos.state_store.entity_area": "实体区域补全",
    "homeos.state_store.entity_references": "实体引用",
    # 实时通道
    "homeos.realtime.gateway": "WS推送网关",
    "homeos.realtime.domain_events": "领域事件",
    "homeos.ws-proxy": "WS反代",
    "homeos.api.ws-proxy": "WS反代",
    # 通知 / 通道
    "homeos.notification": "通知",
    "homeos.notification.rules": "通知规则",
    "homeos.notification.settings": "通知设置",
    "homeos.notification.prune": "通知清理",
    "homeos.notification.events": "通知事件",
    "homeos.notification.dispatch": "通知分发",
    "homeos.channels.service": "通知通道",
    "homeos.channels.config": "通道配置",
    "homeos.channels.email": "邮件通道",
    "homeos.channels.webpush": "WebPush通道",
    "homeos.channels.wecom": "企业微信",
    "homeos.api.channels": "通道接口",
    # 系统 / 运维
    "homeos.system": "系统",
    "homeos.system.controller": "系统接口",
    "homeos.system.device_management": "设备管理",
    "homeos.system.embed_proxy": "内嵌反代",
    "homeos.system.upstream": "上游代理",
    "homeos.system.ops.moviepilot": "MoviePilot反代",
    "homeos.system.ops.external_api": "外部API",
    "homeos.system.ops.weather": "天气预警",
    "homeos.system.lifestyle.guest": "访客通行",
    "homeos.system.lifestyle.media": "媒体场景",
    "homeos.setup.wizard": "设置向导",
    "homeos.client_power": "终端电量",
    # 备份
    "homeos.backup.auto": "自动备份",
    "homeos.backup.users": "用户备份",
    "homeos.backup.server": "服务器备份",
    "homeos.backup.bundle": "系统包备份",
    # 指令代理
    "homeos.command_proxy": "指令代理",
    "homeos.command_audit": "指令审计",
    # 安防 / 存在
    "homeos.security": "安防",
    "homeos.security.service": "安防",
    "homeos.security.panel": "安防面板",
    "homeos.security.presence": "在家状态",
    "homeos.security.linkage": "安防联动",
    "homeos.security.events": "安防事件",
    "homeos.security.drill": "安防演练",
    "homeos.security.mmwave": "毫米波存在",
    "homeos.security.dismissed": "告警忽略",
    "homeos.security.cooldown": "安防冷却",
    "homeos.security.away_sim": "离家模拟",
    "homeos.security.frigate": "Frigate",
    "homeos.security.layout": "安防布局",
    # 家庭模式 / 儿童模式
    "homeos.home_mode": "家庭模式",
    "homeos.child_mode": "儿童模式",
    # 智能管家
    "homeos.agent.service": "智能管家",
    "homeos.agent.config": "智能管家配置",
    "homeos.agent.session_store": "管家会话",
    "homeos.agent.mcp": "MCP网关",
    "homeos.agent.home_tools": "全屋工具",
    "homeos.agent.resolving_llm": "LLM解析",
    "homeos.agent.fast_path": "快路径",
    "homeos.agent.lang_template": "语言模板",
    "homeos.agent.command_cache": "指令缓存",
    "homeos.agent.short_term_memory": "短期记忆",
    # 感知 / 语音
    "homeos.awareness.voice": "语音服务",
    "homeos.awareness.voice_command": "语音指令",
    "homeos.awareness.stt": "语音识别",
    "homeos.awareness.tts": "语音播报",
    "homeos.awareness.advisor_usage": "顾问用量",
    # 地震 / 天气
    "homeos.earthquake": "地震服务",
    "homeos.earthquake.api": "地震接口",
    "homeos.earthquake.service": "地震服务",
    "homeos.earthquake.catalog": "震情目录通知",
    "homeos.earthquake.global": "全球震情",
    "homeos.earthquake.leader": "主EEW",
    "homeos.earthquake.poll": "EEW轮询",
    "homeos.earthquake.wolfx": "Wolfx数据源",
    "homeos.earthquake.place": "震中地名",
    "homeos.weather.linkage": "天气自动联动",
    "homeos.weather.watch": "天气监视",
}

#: uvicorn 日志器 → 中文展示名
_UVICORN_CONTEXT_ZH = {
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

#: uvicorn 英文启动文案 → 中文（尽力匹配，未命中保持原文）
_UVICORN_MESSAGE_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
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


def localize_logger_context(name: str) -> str:
    """logger 名 → 中文展示名；未收录则去掉 ``homeos.`` 前缀原样展示。"""
    if not name:
        return "HomeOS"
    exact = _CONTEXT_ZH.get(name)
    if exact is not None:
        return exact
    uvicorn = _UVICORN_CONTEXT_ZH.get(name)
    if uvicorn is not None:
        return uvicorn
    if name.startswith("homeos."):
        return name[len("homeos.") :]
    return name


# --------------------------------------------------------------------------- #
# 控制台文案规整（对齐 Nest ``toHalfWidthPunct`` + ``compactLogSpaces``）
# --------------------------------------------------------------------------- #
_FULLWIDTH_PUNCT_MULTI: tuple[tuple[str, str], ...] = (("…", "..."), ("——", "--"))

_FULLWIDTH_PUNCT_MAP: dict[str, str] = {
    "：": ":",
    "，": ",",
    "。": ".",
    "（": "(",
    "）": ")",
    "！": "!",
    "？": "?",
    "；": ";",
    "、": ",",
    "【": "[",
    "】": "]",
    "「": '"',
    "」": '"',
    "『": '"',
    "』": '"',
    "—": "-",
    "～": "~",
    "．": ".",
    "＇": "'",
    "＂": '"',
    "／": "/",
    "％": "%",
    "＋": "+",
    "－": "-",
    "＝": "=",
    "｜": "|",
}

_SPACE_COMPACT_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # 拉丁/数字 与 汉字 之间
    (re.compile(r"([A-Za-z0-9_%./+-])\s+(?=[\u4e00-\u9fff])"), r"\1"),
    (re.compile(r"([\u4e00-\u9fff])\s+(?=[A-Za-z0-9_%./+-])"), r"\1"),
    # 符号 ≤≥≈~ 与汉字
    (re.compile(r"([≤≥≈~])\s+(?=[\u4e00-\u9fff])"), r"\1"),
    # 冒号后、中文前的逗号后
    (re.compile(r":\s+"), ":"),
    (re.compile(r",\s+(?=[\u4e00-\u9fff])"), ","),
    # 紧贴括号：条 (过期 → 条(过期；) 已启用 → )已启用
    (re.compile(r"([\u4e00-\u9fff0-9])\s+\("), r"\1("),
    (re.compile(r"\)\s+(?=[\u4e00-\u9fffA-Za-z0-9])"), ")"),
)


def to_half_width_punct(text: str) -> str:
    """全角标点 → 半角，统一控制台输出风格。"""
    out = text
    for src, dst in _FULLWIDTH_PUNCT_MULTI:
        out = out.replace(src, dst)
    return "".join(_FULLWIDTH_PUNCT_MAP.get(ch, ch) for ch in out)


def compact_log_spaces(text: str) -> str:
    """收紧中英文/数字边界多余空格（逐行处理，避免吃掉换行）。"""
    out_lines: list[str] = []
    for line in text.split("\n"):
        for pattern, repl in _SPACE_COMPACT_RULES:
            line = pattern.sub(repl, line)
        out_lines.append(line)
    return "\n".join(out_lines)


def localize_log_message(text: str) -> str:
    """控制台消息本地化：全角转半角 + 收紧空格。"""
    return compact_log_spaces(to_half_width_punct(text))


def localize_log_record(name: str, message: str) -> str:
    """控制台与运行日志**共用**的消息本地化：uvicorn 英文文案转中文 + 全角转半角 + 收紧空格。

    抽成公共函数，避免控制台与运行日志缓冲各写一套导致展示不一致。
    """
    if name.startswith("uvicorn"):
        message = _localize_uvicorn_message(message)
    return localize_log_message(message)


def _localize_uvicorn_message(text: str) -> str:
    for pattern, repl in _UVICORN_MESSAGE_RULES:
        if pattern.match(text):
            return pattern.sub(repl, text)
    return text


# --------------------------------------------------------------------------- #
# 时间戳
# --------------------------------------------------------------------------- #
def _nest_timestamp() -> str:
    """对齐 Nest ``Intl.DateTimeFormat``（``month: '2-digit', day: '2-digit'``）。

    形如 ``10/05/2026, 11:39:21 PM``：月 / 日补零，时分秒不补零。
    """
    now = datetime.now()
    hour = now.hour % 12 or 12
    meridiem = "AM" if now.hour < 12 else "PM"
    return (
        f"{now.month:02d}/{now.day:02d}/{now.year}, "
        f"{hour}:{now.minute:02d}:{now.second:02d} {meridiem}"
    )


def _iso_now() -> str:
    now = datetime.now(UTC)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _resolve_color() -> bool:
    """是否启用 ANSI 颜色（对齐 Nest ``isColorAllowed()``：只受 ``NO_COLOR`` 约束）。

    与 Nest 一致，默认**即便 stdout 是管道也保留颜色**：``bun run`` / ``npm run``
    之类脚本包装器会把子进程 stdout 变成管道，若以 TTY 判定就会整片失色。
    """
    if (os.getenv("NO_COLOR") or "").strip():
        return False
    if (os.getenv("LOG_FORMAT") or "").strip().lower() == "json":
        return False
    force = (os.getenv("FORCE_COLOR") or "").strip()
    if force and force.lower() in ("0", "false"):
        return False
    return True


# --------------------------------------------------------------------------- #
# 格式化器
# --------------------------------------------------------------------------- #
class NestStyleFormatter(logging.Formatter):
    """Nest ``ConsoleLogger`` 风格格式化器（可选 JSON 行）。"""

    def __init__(self, *, color: bool = False, app_name: str = "HomeOS") -> None:
        super().__init__()
        self._color = color
        self._app = app_name
        self._pid = os.getpid()
        self._json = (os.getenv("LOG_FORMAT") or "").strip().lower() == "json"

    def _paint(self, text: str, code: str | None) -> str:
        if not self._color or not code:
            return text
        return f"{code}{text}{_ANSI_RESET.get(code, _RESET)}"

    def format(self, record: logging.LogRecord) -> str:
        label = _NEST_LEVEL_LABEL.get(record.levelno, "LOG")
        context = localize_logger_context(record.name)
        message = localize_log_record(record.name, record.getMessage())
        trace_id = get_trace_id()

        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)

        if self._json:
            payload: dict[str, Any] = {
                "level": label.lower(),
                "pid": self._pid,
                "context": context,
                "message": message,
                "ts": _iso_now(),
            }
            if record.exc_text:
                payload["stack"] = record.exc_text
            if trace_id:
                payload["traceId"] = trace_id
            return json.dumps(payload, ensure_ascii=False)

        # 对齐 Nest ``formatPid``：``[<prefix>] <pid>  - ``（``-`` 前两个空格、尾随一个空格），
        # 且整段用级别色着色
        level_color = _LEVEL_COLOR.get(label)
        head = f"{self._paint(f'[{self._app}] {self._pid}  - ', level_color)}"
        # 对齐 Nest：时间戳不着色
        stamp = _nest_timestamp()
        # 对齐 Nest：级别 ``padStart(7)`` 且按级别着色
        level = self._paint(label.rjust(7), level_color)
        # 对齐 Nest ``formatContext``：上下文恒为黄色，尾随空格在色块内
        ctx = self._paint(f"[{context}] ", _CONTEXT_YELLOW)
        # 对齐 Nest ``stringifyMessage`` → ``colorize``：正文同样按级别着色
        body = self._paint(message, level_color)
        line = f"{head}{stamp} {level} {ctx}{body}"
        # 堆栈单独成行且不着色（对齐 Nest ``printStackTrace``）
        if record.exc_text:
            line = f"{line}\n{record.exc_text}"
        return line


#: 标记我们自建的 handler，便于幂等判断
_HANDLER_FLAG = "_homeos_nest_handler"

#: uvicorn 自身日志器（需一并接管，避免风格不统一）
_UVICORN_LOGGERS = ("uvicorn", "uvicorn.error", "uvicorn.access")


def _attach_handler(logger: logging.Logger, level: int, color: bool) -> None:
    if any(getattr(handler, _HANDLER_FLAG, False) for handler in logger.handlers):
        return
    # 接管：移除 uvicorn（reload 场景）预先装配的默认 handler，
    # 否则访问日志会被默认格式与 Nest 格式各打一份。
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(NestStyleFormatter(color=color))
    # 状态日志去重：与运行日志缓冲 handler 共享同一次判定（判定结果缓存在 record 上）
    handler.addFilter(StatusLogDedupeFilter())
    setattr(handler, _HANDLER_FLAG, True)
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False


def configure_app_logging() -> logging.Logger:
    """初始化 ``homeos`` 日志树与 uvicorn 日志器：Nest 风格输出到 stdout。

    幂等：重复调用不会重复挂 handler。同时保证 ``RuntimeLogHandler``
    （``/system/runtime-logs``）能收到完整日志流。
    """
    raw_level = (os.getenv("LOG_LEVEL") or "info").strip().lower()
    logger = logging.getLogger("homeos")
    level = _LEVEL_NAMES.get(raw_level, logging.INFO)
    color = _resolve_color()
    _attach_handler(logger, level, color)
    for name in _UVICORN_LOGGERS:
        _attach_handler(logging.getLogger(name), level, color)
    return logger


def log(level: str, message: str, **context: Any) -> None:
    """兼容 ``observability.log`` 调用签名的薄封装：走标准 logging（统一格式 + 运行日志镜像）。"""
    text = message
    if context:
        extra = " ".join(f"{key}={value}" for key, value in context.items() if value is not None)
        if extra:
            text = f"{text} {extra}"
    logging.getLogger("homeos").log(_LEVEL_NAMES.get(level, logging.INFO), text)


__all__ = [
    "NestStyleFormatter",
    "compact_log_spaces",
    "configure_app_logging",
    "localize_log_message",
    "localize_log_record",
    "localize_logger_context",
    "log",
    "to_half_width_punct",
]
