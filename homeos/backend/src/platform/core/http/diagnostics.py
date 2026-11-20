"""请求级诊断：有界的中文 HTTP 诊断，**不读取请求体、不记录凭据**。

与上游 `app/request_diagnostics.py` 的分工一致：本模块只做「把一次请求的稳定事实
（操作名、实体 / 仪表盘编号、阶段事件、失败原因与排查建议）收敛成可落日志的字典」，
落盘与查询仍在 `domains/logs/global_log.py`、对外出口在 `api/global_logs.py`。

设计约束：

1. **不读 body**：请求体里可能有密码、令牌、户型 JSON 全文。所有上下文只来自
   `request.url`、`request.headers`、`request.client` 与调用方显式传入的键值。
2. **有界**：阶段事件用固定长度队列，超出后只记次数（`deferred_diagnostics_dropped`），
   不让一个坏请求把日志撑爆。
3. **只保留错误契约**：`diagnostic_detail()` 把路由回显的任意 detail 收敛成
   `{code, hint, reason}`，避免把上游报文/内部路径原样写进日志。
"""

from __future__ import annotations

import math
import re
from typing import Any

from starlette.requests import Request

#: 慢请求阈值（毫秒）。与 `bootstrap/middleware.py` 的日志判定共用同一常量。
SLOW_REQUEST_MILLISECONDS = 2000

#: 单个请求最多保留的阶段事件条数；超出只累加丢弃计数。
_MAX_DEFERRED_EVENTS = 8

#: 请求上下文在 `request.state` 里的键（不跨请求复用，避免串号）。
STATE_KEY = "diagnostic_context"

#: 阶段事件队列在 `request.state` 里的键。
DEFERRED_KEY = "deferred_diagnostics"

#: 错误码 → 排查建议。只收录**有明确处置动作**的码；未命中的回落到分类建议。
CODE_HINTS: dict[str, str] = {
    "STORAGE_OPERATION_FAILED": "保留当前编辑，检查数据目录权限、剩余空间和挂载状态；保存是否完成以对应保存记录为准。",
    "PROJECT_REVISION_CONFLICT": "保留当前编辑，核对其他页面的保存结果，按冲突提示选择处理方式。",
    "STUDIO3D_REVISION_CONFLICT": "保留当前户型编辑，核对其他绘制窗口的最新修订，再按冲突提示处理。",
    "REQUEST_VALIDATION_FAILED": "按错误详情检查输入格式与范围。",
    "LICENSE_RESTRICTED": "查看管理端授权页的具体状态；重复点击设备按钮不能解除授权限制。",
    "HA_HISTORY_ENTITY_NOT_FOUND": "检查 HA 的历史记录功能及反向代理接口路径；这与本地实体目录缺失是不同的来源。",
    "DISPLAY_PROJECT_UNPAIRED": "请管理员检查显示设备是否仍配对，以及当前绑定的仪表盘是否正确。",
    "BACKUP_POST_RESTORE_FAILED": "业务恢复已提交，后续步骤未完成。请保留当前数据并查看具体错误，避免重复提交恢复。",
    "STUDIO_FILE_DELIVERY_FAILED": "草稿已提交到数据库，文件交付尚未完成。请保留当前编辑，检查存储空间和权限，再重新读取核对保存结果。",
}

#: 错误响应里的字段名 → 中文标签（校验失败可读化，只用于日志/提示，不改响应体）。
FIELD_LABELS: dict[str, str] = {
    "username": "账号",
    "password": "密码",
    "passwordConfirmation": "确认密码",
    "adminPassword": "管理员密码",
    "activationCode": "激活码",
    "backupPassword": "备份密码",
    "pairingCode": "配对码",
    "entityId": "实体",
    "projectId": "仪表盘",
    "componentId": "控件",
    "revision": "修订号",
    "name": "名称",
    "hours": "历史范围（小时）",
    "document": "仪表盘配置",
    "scene": "户型数据",
    "properties": "属性",
    "pages": "页面",
    "components": "控件",
    "data": "数据",
    "service": "服务参数",
    "baseUrl": "HA 服务地址",
    "accessToken": "HA 访问令牌",
}

#: 精确路径 → 操作名。
_EXACT_OPERATIONS: dict[str, str] = {
    "/api/v1/auth/login": "管理员登录",
    "/api/v1/auth/logout": "结束管理员登录",
    "/api/v1/setup/admin": "设置管理员账号",
    "/api/v1/ha/test": "测试 Home Assistant 连接",
    "/api/v1/ha/services/call": "调用设备服务",
    "/api/v1/displays/pair": "绑定显示设备",
    "/api/v1/displays/pairing-code": "创建配对入口",
    "/api/v1/license/activate": "激活授权",
    "/api/v1/license/deactivate": "停用授权",
    "/api/v1/license/verify": "重新验证授权",
    "/api/v1/license/retry": "重新验证授权",
    "/api/v1/backups/restore": "恢复业务备份",
    "/api/v1/backups/inspect": "检查业务备份",
    "/api/v1/backups/export": "导出业务备份",
    "/api/v1/modules/interaction3d/control": "操作三维设备",
    "/api/v1/ha/history": "读取实体历史",
}

#: 前缀 → 操作名（按出现顺序匹配，先具体后笼统）。
_PREFIX_OPERATIONS: tuple[tuple[str, str], ...] = (
    ("/api/v1/ha/connection", "配置 Home Assistant 连接"),
    ("/api/v1/ha/", "访问 Home Assistant"),
    ("/api/camera", "读取摄像头画面"),
    ("/api/image", "读取实体图片"),
    ("/api/v1/modules/interaction3d/", "读取三维交互数据"),
    ("/api/v1/license", "检查授权"),
    ("/api/v1/auth", "账号操作"),
    ("/api/v1/fonts", "读取仪表盘字体"),
    ("/api/v1/assets", "访问图片素材"),
    ("/api/v1/displays", "访问显示设备配对"),
    ("/api/v1/updates", "检查版本更新"),
)

#: 资源型前缀：按方法区分读/写/删。
_RESOURCE_PREFIXES: tuple[tuple[str, str], ...] = (
    ("/api/v1/projects", "仪表盘"),
    ("/api/v1/studio3d", "户型"),
)

_ENTITY_ID = re.compile(r"[a-z0-9_]+\.[a-z0-9_]{1,230}")
_PROJECT_ID = re.compile(r"[A-Za-z0-9_-]{1,100}")
_PROJECT_PATH = re.compile(r"/api/v1/projects/([A-Za-z0-9_-]{1,100})(?:/.*)?")
_MEDIA_ENTITY_PATH = re.compile(
    r"/api/(?:camera_proxy|camera_proxy_stream|camera_hls|image_proxy)/([a-z0-9_]+\.[a-z0-9_]+)"
)
_READ_METHODS = frozenset({"GET", "HEAD"})


def event_hint(category: str) -> str:
    """按日志分类给一句排查建议（与前端 `global-log.js` 的分类词表同源）。"""
    if category in {"连接", "实体同步"}:
        return "检查 Home Assistant 的运行状态、连接地址、访问令牌及网络连接。"
    if category == "实时连接":
        return "检查浏览器到 HomeOS 的网络，以及 Home Assistant 连接状态；重复出现时导出日志。"
    if category == "设备操作":
        return "先确认设备实际状态，再检查 Home Assistant 连接和实体；本次命令可能已经执行。"
    if category == "摄像头":
        return "检查摄像头实体、视频来源及网络连接，并查看关联请求的具体原因。"
    if category == "授权":
        return "查看管理端授权状态，并检查服务器时间和联网情况。"
    if category == "中控设备":
        return "检查显示设备配对记录及绑定的仪表盘；配对凭据不会出现在日志中。"
    if category in {"3D 准备", "3D 图形", "3D 阴影", "模型预览"}:
        return "查看本条记录是否已回退到其他绘制方式；若画面仍异常，记录操作步骤并导出日志。"
    if category in {"界面", "配置", "资源加载"}:
        return "保留当前编辑，记录问题出现时的操作和时间，导出日志交给维护者检查。"
    return "记录问题发生时间与操作，导出本条及关联日志交给维护者检查。"


def _resource_operation(path: str, method: str, noun: str) -> str:
    if method in _READ_METHODS:
        return f"读取{noun}"
    if method == "DELETE":
        return f"删除{noun}"
    return f"保存{noun}数据"


def operation_name(path: str, method: str) -> str:
    """把「路径 + 方法」翻译成中文操作名（用于日志的 `operation` 字段）。"""
    upper = method.upper()
    exact = _EXACT_OPERATIONS.get(path)
    if exact:
        return exact
    if "/render-cache/" in path:
        return "读取三维画面缓存" if upper in _READ_METHODS else "写入三维画面缓存"
    if path.startswith("/api/v1/displays/pairing-codes/"):
        return "删除配对入口" if upper == "DELETE" else "修改配对入口"
    if path.startswith("/api/v1/displays/") and upper in {"PATCH", "DELETE"}:
        return "撤销显示设备配对" if upper == "DELETE" else "修改显示设备绑定"
    if path.startswith("/api/v1/studio3d/exports"):
        return "导出户型图片"
    for prefix, noun in _RESOURCE_PREFIXES:
        if path.startswith(prefix):
            return _resource_operation(path, upper, noun)
    for prefix, name in _PREFIX_OPERATIONS:
        if path.startswith(prefix):
            return name
    return "接口请求"


def request_entity_context(path: str, query: Any) -> dict[str, str]:
    """只从白名单路径里提取**已校验格式**的实体 / 仪表盘编号。"""
    context: dict[str, str] = {}
    if path in {"/api/v1/ha/history", "/api/v1/ha/weather/forecast"}:
        entity = str(query.get("entityId", "") or "")
        if _ENTITY_ID.fullmatch(entity):
            context["entityId"] = entity
    project = str(query.get("projectId", "") or "")
    if _PROJECT_ID.fullmatch(project):
        context["projectId"] = project
    match = _PROJECT_PATH.fullmatch(path)
    if match:
        context["projectId"] = match.group(1)
    match = _MEDIA_ENTITY_PATH.fullmatch(path)
    if match:
        context["entityId"] = match.group(1)
    return context


def _field_label(position: Any) -> str:
    if isinstance(position, int):
        return f"第 {position + 1} 项"
    text = str(position or "")
    return FIELD_LABELS.get(text, f"字段（{text[:30]}）")


def _validation_message(error: dict[str, Any]) -> str:
    parts = [_field_label(part) for part in (error.get("loc") or []) if isinstance(part, (str, int))]
    where = " › ".join(parts) or "请求参数"
    message = str(error.get("msg") or "")
    if re.search(r"[\u4e00-\u9fff]", message):
        return where + message if message.startswith("是") else f"{where}{message}"
    kind = str(error.get("type") or "")
    reasons = {
        "missing": "不能为空。",
        "int_parsing": "需要填写整数。",
        "int_type": "需要填写整数。",
        "float_parsing": "需要填写有效数字。",
        "float_type": "需要填写有效数字。",
        "string_type": "需要填写文本。",
        "string_too_short": "长度不足。",
        "string_too_long": "长度超过限制。",
        "literal_error": "不在允许的选项中。",
        "extra_forbidden": "是不支持的字段。",
    }
    return where + reasons.get(kind, "格式不正确，校验位置见日志详情。")


def validation_reason(errors: Any) -> str:
    """把 Pydantic 校验错误收敛成一句中文（最多 4 条，其余归并为「另有 N 处」）。"""
    if not isinstance(errors, (list, tuple)):
        return "请求参数未通过校验。"
    items = [error for error in errors[:4] if isinstance(error, dict)]
    text = "；".join(_validation_message(error) for error in items) or "请求参数未通过校验。"
    extra = len(errors) - len(items)
    return text + (f"另有 {extra} 处参数问题，见详情。" if extra > 0 else "")


def diagnostic_detail(detail: Any) -> Any:
    """保留错误契约（`code/hint/reason/message`），丢掉路由回显的任意报文。"""
    if isinstance(detail, str):
        return detail[:300]
    if not isinstance(detail, dict):
        return None
    kept: dict[str, Any] = {}
    for key in ("code", "hint", "reason", "message"):
        value = detail.get(key)
        if isinstance(value, str) and value.strip():
            kept[key] = value.strip()[:300]
    return kept or None


def _state(request: Request) -> dict[str, Any]:
    existing = getattr(request.state, STATE_KEY, None)
    if isinstance(existing, dict):
        return existing
    fresh: dict[str, Any] = {}
    setattr(request.state, STATE_KEY, fresh)
    return fresh


def update_request_context(request: Request, *, finished: bool = False, **fields: Any) -> dict[str, Any]:
    """把若干稳定字段并进本次请求的诊断上下文，并**返回一份快照**。

    调用方（路由）在写日志时传 `context=update_request_context(request, ...)`：
    这样同一次请求内的多条记录共享同一组编号，便于按 `requestId` 关联。
    """
    context = _state(request)
    for key, value in fields.items():
        if value is None:
            continue
        context[key] = value
    if finished:
        context["finished"] = True
    return dict(context)


def remember_diagnostic_event(request: Request, *, level: str, message: str, **fields: Any) -> None:
    """记一条**立即**的阶段事件（调用方已持有业务锁、可安全写日志的场景）。"""
    store = getattr(request.app.state, "global_log", None)
    if store is None:
        return
    context = update_request_context(request, **fields)
    store.append(level, "系统后台", "请求阶段诊断", message, context=context)


def defer_diagnostic(request: Request, *, level: str, message: str, **fields: Any) -> None:
    """记一条**延后**的阶段事件：本请求写完响应后由中间件统一落盘。

    用于业务锁仍持有、不希望同步写盘的路径（如户型保存的文件交付阶段）。
    """
    queue = getattr(request.state, DEFERRED_KEY, None)
    if not isinstance(queue, list):
        queue = []
        setattr(request.state, DEFERRED_KEY, queue)
    if len(queue) >= _MAX_DEFERRED_EVENTS:
        dropped = int(getattr(request.state, "deferred_diagnostics_dropped", 0)) + 1
        request.state.deferred_diagnostics_dropped = dropped
        return
    context = update_request_context(request, **fields)
    queue.append({"level": level, "message": message, "context": context})


def http_error_context(
    request: Request, *, status: int, duration_ms: float, error: BaseException | None = None
) -> dict[str, Any]:
    """4xx/5xx 的公共上下文：状态、耗时、错误码与建议。"""
    context: dict[str, Any] = {
        "status": status,
        "durationMs": round(duration_ms, 1),
        "operation": operation_name(request.url.path, request.method),
    }
    if error is not None:
        context["code"] = type(error).__name__.upper()
        context["reason"] = str(error)[:200]
        context["hint"] = event_hint("界面")
    return context


def storage_error_context(error: BaseException) -> dict[str, Any]:
    """存储类异常 → 中文原因（`errno` 优先，缺失时按异常类型兜底）。"""
    code = getattr(error, "errno", None)
    reasons = {
        5: "存储设备读写失败。",
        13: "当前进程没有访问数据文件的权限。",
        28: "磁盘剩余空间不足。",
        30: "目标存储为只读，本次写入未完成。",
    }
    if isinstance(code, int) and code in reasons:
        return {"reason": reasons[code], "hint": CODE_HINTS["STORAGE_OPERATION_FAILED"]}
    hint = CODE_HINTS["STORAGE_OPERATION_FAILED"]
    if isinstance(error, (ValueError, TypeError)):
        return {"reason": "数据格式不符合预期。", "hint": hint}
    if isinstance(error, OSError):
        return {"reason": "存储操作失败，原始异常已保留在详情中。", "hint": hint}
    return {"reason": "服务内部运行异常。", "hint": "保留本条日志及关联编号，联系维护者检查具体原因。"}


def error_hint(context: dict[str, Any]) -> str:
    """按上下文里的 `code` 选排查建议，未命中回落到分类建议。"""
    code = str(context.get("code") or "")
    if code in CODE_HINTS:
        return CODE_HINTS[code]
    return event_hint(str(context.get("category") or ""))


def diagnostic_headers(request: Request) -> dict[str, str]:
    """错误响应头：稳定错误码 + 本次日志编号（便于用户报障时只给一个编号）。"""
    context = getattr(request.state, STATE_KEY, None) or {}
    headers: dict[str, str] = {}
    code = str(context.get("errorCode") or context.get("code") or "")
    if code:
        headers["X-HA-Bridge-Error-Code"] = code[:128]
    log_id = str(context.get("diagnosticEventId") or "")
    if log_id:
        headers["X-HA-Bridge-Log-ID"] = log_id[:64]
    return headers


def tag_error(request: Request, *, error_code: str, message: str) -> None:
    """异常处理器调用：把稳定错误码写进请求状态，供响应头与日志复用。"""
    from .errors import resolve_api_error_code

    resolved = resolve_api_error_code(message) or error_code
    context = _state(request)
    context.setdefault("errorCode", resolved)


def round_ms(value: float) -> float:
    """毫秒保留 1 位小数；非有限值按 0 处理（避免 JSON 里出现 NaN）。"""
    if not math.isfinite(value):
        return 0.0
    return round(value, 1)


__all__ = [
    "CODE_HINTS",
    "DEFERRED_KEY",
    "FIELD_LABELS",
    "SLOW_REQUEST_MILLISECONDS",
    "STATE_KEY",
    "defer_diagnostic",
    "diagnostic_detail",
    "diagnostic_headers",
    "error_hint",
    "event_hint",
    "http_error_context",
    "operation_name",
    "remember_diagnostic_event",
    "request_entity_context",
    "round_ms",
    "storage_error_context",
    "tag_error",
    "update_request_context",
    "validation_reason",
]
