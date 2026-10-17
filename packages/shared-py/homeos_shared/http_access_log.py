"""HTTP 访问日志降噪：两个后端共用同一份实现。

为什么需要它
------------
uvicorn 默认把**每一条**请求（含静态资源的 ``200`` / ``304``、几秒一次的健康检查探针、
客户机的租约与心跳轮询）都按 INFO 打进 ``uvicorn.access``。真正被这份噪音伤害的是
**只打印一次**的信息，首装窗口的引导密钥横幅就是典型：它随启动出现，而 ``docker logs``
与各编排面板都只显示尾部，几秒的轮询之后横幅就被顶出可见范围 —— 于是「密钥去哪了」
变成每次部署都要重新查一遍的问题。把成功请求收掉，横幅自然留在可读范围里。

四种模式（由环境变量选择，名字由调用方给：主应用 ``LOG_HTTP_ACCESS``、商店
``STORE_LOG_HTTP_ACCESS``）：

- ``errors``（默认）：丢弃 ``2xx`` / ``3xx``（成功与重定向），保留 ``4xx`` / ``5xx``；
- ``off``：整条链路静默（排障时想彻底安静）；
- ``all``：不做过滤，恢复 uvicorn 原样。

判据刻意选在**状态码**上：客户端拿 401/429、回调 4xx 这类「真得看」的记录一律保留，
被丢掉的只有「一切都好」的噪音。解析不到状态码时**保留**记录（fail-open），
否则一个格式变化就会静默吞掉整条访问日志。

4xx/5xx 也不是照抄：同一条重复请求折叠成一行
-------------------------------------------
``errors`` 模式下，保留的 4xx/5xx 还会**按同一来源折叠重复**。原因是「保留错误」与
「把同一个错误打印 60 遍」是两件事 —— 实测给商店连打 80 次坏激活包：20 条
``429 Too Many Requests`` + 60 条 ``400 Bad Request``，逐字相同（客户端临时端口每次都变，
所以按整行去重是无效的，必须归纳成「来源 + 方法 + 路径 + 状态」）。

判定与「按数量级放行 + 折叠注记」的取舍写在 ``homeos_shared.status_log_dedupe``（抑制到
第 10 / 100 / 1000 … 次放行一行并注明折叠了多少条）。窗口由调用方指定的
``dedupe_env_var`` 选择，与状态日志用同一个窗口。

折叠只发生在 ``errors`` 模式：``all`` 的契约是「恢复 uvicorn 原样」，那是排障时的逃生口
（例如要逐条核对某个客户端的重试节奏），必须逐条可见。

为什么在共享包里
----------------
两个后端的差别只有「变量名」与「模式说明挂哪个 logger」，逻辑本身逐字相同；
两处各存一份的代价是分叉（见 ``packages/shared-py/README.md`` 的分诊台账）。
本模块不依赖 FastAPI、不读任何一方的配置，故可安全共享。
"""
from __future__ import annotations

import logging
import os
import re

from .status_log_dedupe import annotate_fold_note, dedupe_decision

#: 过滤模式
MODE_ALL = "all"
MODE_ERRORS = "errors"
MODE_OFF = "off"

#: 状态码提取兜底：uvicorn access 文案形如 ``... "GET /x HTTP/1.1" 200``
_STATUS_RE = re.compile(r'"\s+(\d{3})(?:\s|$)')

#: 访问日志归纳用：``127.0.0.1:61234 - "GET /x HTTP/1.1" 404 Not Found``
#: → 折叠键 ``<来源> "GET /x" 404``（临时端口与状态短语都不进键）
_ACCESS_SIGNATURE_RE = re.compile(
    r'^(?P<source>\S+) - "(?P<method>[A-Z]+) (?P<path>\S+) HTTP/[\d.]+" (?P<status>\d{3})'
)

#: 折叠判定挂在哪棵日志树上（只用于生成去重键，不影响展示）
_DEDUPE_CONTEXT = "http.access"

_FILTER_NAME = "homeos-http-access"


def mode_label(mode: str, env_var: str) -> str:
    """模式 → 人话（仅在用户**显式**配置过时才打一行，方便确认降噪真的生效）。"""
    if mode == MODE_OFF:
        return f"已全部静默（{env_var}=errors 恢复默认、=all 逐条可见）"
    if mode == MODE_ALL:
        return f"未过滤，逐条可见（{env_var}=errors 恢复默认）"
    return f"仅保留 4xx/5xx，重复请求折叠为一行（{env_var}=all 逐条可见、=off 全部静默）"


def access_mode_env_set(env_var: str) -> bool:
    """用户是否显式配置了详略（空串与未设置都算「没配」）。

    默认行为不该每次启动都播报一遍：``errors`` 是内置默认，两个后端又各是一个进程
    （开发时主应用 + 商店、容器里也常各起一份），一条「降噪已启用」等于每个进程各喊一次，
    把真正只打印一次的启动横幅顶出可见范围 —— 与这个模块想解决的问题正好相反。
    """
    return bool((os.getenv(env_var) or "").strip())


def resolve_http_access_mode(env_var: str) -> str:
    """解析环境变量：``all`` / ``off`` 原样返回，其余（含未设置、拼错）一律按 ``errors``。"""
    raw = (os.getenv(env_var) or "").strip().lower()
    return raw if raw in (MODE_ALL, MODE_OFF) else MODE_ERRORS


def _extract_status(record: logging.LogRecord) -> int | None:
    """从日志记录里取出 HTTP 状态码；取不到返回 ``None``。

    优先读 ``record.args``（uvicorn 用 ``logger.info('%s - "%s %s HTTP/%s" %d', ...)``
    打日志，末位参数即状态码），失败再退回正则解析已格式化的文案。
    """
    args = record.args
    if isinstance(args, tuple) and args:
        last = args[-1]
        # 只对「本来就能转成整数」的类型做转换：pyright 对 ``int(object)`` 报错是有道理的，
        # 而这里确实可能收到任意对象（调用方换了参数顺序），转换失败即 fail-open 退回正则。
        if isinstance(last, (int, str)):
            try:
                return int(last)
            except ValueError:
                pass
    try:
        message = record.getMessage()
    except Exception:
        return None
    match = _STATUS_RE.search(message)
    return int(match.group(1)) if match else None


def access_signature(record: logging.LogRecord) -> str | None:
    """把访问日志归纳成折叠键 ``<来源> "GET /x" 404``；认不出格式返回 ``None``（fail-open）。

    刻意不含客户端**临时端口**与状态短语：前者每条请求都不同（照抄整行等于没去重），
    后者是状态码的同义重复。来源（IP:port 里的 IP 部分按原样保留，含端口时也不影响同一来源
    的重复判定 —— 端口变、IP 不变，键就不同，所以要连端口一起去掉）。
    """
    try:
        message = record.getMessage()
    except Exception:
        return None
    match = _ACCESS_SIGNATURE_RE.match(message)
    if match is None:
        return None
    source = match.group("source").rsplit(":", 1)[0] or match.group("source")
    return (
        f'{source} "{match.group("method")} {match.group("path")}" {match.group("status")}'
    )


class HttpAccessLogFilter(logging.Filter):
    """按状态码丢弃「正常」访问日志，并把保留的 4xx/5xx 按来源折叠重复（规则见模块 docstring）。"""

    def __init__(self, mode: str, dedupe_env_var: str) -> None:
        super().__init__(_FILTER_NAME)
        self._mode = mode
        self._dedupe_env_var = dedupe_env_var

    @property
    def mode(self) -> str:
        return self._mode

    def filter(self, record: logging.LogRecord) -> bool:
        if self._mode == MODE_ALL:
            return True
        if self._mode == MODE_OFF:
            return False
        status = _extract_status(record)
        if status is not None and status < 400:
            # 成功 / 重定向：一律丢掉（这正是本过滤器存在的理由）
            return False
        return self._fold_repeats(record)

    def _fold_repeats(self, record: logging.LogRecord) -> bool:
        """同一条重复请求折叠成一行；取不到折叠键时按原样保留。"""
        signature = access_signature(record)
        if signature is None:
            return True
        # normalize=False：归纳键已经自带归一化（去掉临时端口），再叠通用归一化会把来源 IP 抹掉
        decision = dedupe_decision(
            "log", _DEDUPE_CONTEXT, signature, self._dedupe_env_var, normalize=False
        )
        if decision.emit:
            # 本过滤器挂在日志器上，一条记录只判一次，直接补注记即可
            annotate_fold_note(record, decision.folded)
        return decision.emit


def install_http_access_log_filter(
    *,
    env_var: str,
    announce_logger: str,
    dedupe_env_var: str,
) -> HttpAccessLogFilter:
    """把过滤器挂到 ``uvicorn.access``（幂等，可在每次启动时调用）。

    ``env_var`` 决定详略（见模块 docstring）；``dedupe_env_var`` 是**折叠窗口**用哪个环境变量
    （与状态日志共用同一个窗口，主应用 ``LOG_STATUS_DEDUPE_MS`` / 商店
    ``STORE_LOG_STATUS_DEDUPE_MS``），``0`` 即关闭折叠；``announce_logger`` 只是模式说明
    挂到哪棵日志树上。日志记录上的 filter 在 ``Logger.handle`` 里判定，所以在应用
    lifespan 里调用同样生效 —— 不必抢在 uvicorn 自己的 ``dictConfig`` 之前。

    播报规则：只有用户**显式**设了 ``env_var`` 才按 INFO 说明一次（他们要确认的就是这个），
    默认配置下退到 DEBUG —— 两个后端各一个进程，默认值也播报等于每次启动多两行噪音，
    反而会把只出现一次的启动横幅顶出 ``docker logs`` 的可见范围。
    """
    logger = logging.getLogger("uvicorn.access")
    installed = next(
        (item for item in logger.filters if isinstance(item, HttpAccessLogFilter)), None
    )
    if installed is None:
        installed = HttpAccessLogFilter(resolve_http_access_mode(env_var), dedupe_env_var)
        logger.addFilter(installed)
        announce = logging.getLogger(announce_logger)
        if access_mode_env_set(env_var):
            announce.info("HTTP 访问日志：%s", mode_label(installed.mode, env_var))
        else:
            announce.debug("HTTP 访问日志：%s（默认，未显式配置 %s）", mode_label(installed.mode, env_var), env_var)
    return installed


__all__ = [
    "MODE_ALL",
    "MODE_ERRORS",
    "MODE_OFF",
    "HttpAccessLogFilter",
    "access_mode_env_set",
    "access_signature",
    "install_http_access_log_filter",
    "mode_label",
    "resolve_http_access_mode",
]
