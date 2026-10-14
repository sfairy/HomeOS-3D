"""统一错误码、业务异常、HTTP 文案本地化与 ``apiErrorCode`` 解析。

逐字段复刻 Nest 侧 ``business-exception.ts`` / ``http-exception-message.util.ts`` /
``api-error-resolver.util.ts`` / ``api-error-messages.ts`` 与共享包
``@homeos/shared/errors/http-messages`` 的行为，保证：

- 响应体结构与中文文案与 Nest 版逐字节一致；
- ``apiErrorCode`` 正查表命中结果一致（前端 i18n 依赖此稳定码）。

**码表已收敛为「有真实失败点」的集合**：Nest 侧退役后，角色 / MFA / 访客账户 / 旧 HA
直连（``HA_*``）等能力一并下线，其错误码在四个项目里**零引用**却仍留在表里，既误导调用方
（以为有分支可走），也让前端 i18n 表无法判断哪些码是活的。本轮删除 98 个零引用码，
只保留在真实失败点抛出的 90 个；``ops/check/check_error_codes.py`` 逐码校验引用率，新增死码即红。
"""

from __future__ import annotations

import re
from collections.abc import Callable
from enum import StrEnum
from typing import Any, NoReturn

from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorCode(StrEnum):
    """业务错误码枚举（与 Nest ``ErrorCode`` 取值一致）。"""

    UNKNOWN = "UNKNOWN"
    NOT_FOUND = "NOT_FOUND"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    FORBIDDEN = "FORBIDDEN"
    UNAUTHORIZED = "UNAUTHORIZED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    EXTERNAL_ERROR = "EXTERNAL_ERROR"
    CONFLICT = "CONFLICT"
    CONFIG_ERROR = "CONFIG_ERROR"
    DB_ERROR = "DB_ERROR"


#: 错误码 → 默认 HTTP 状态码（未显式传 httpStatus 时使用）。
ERROR_HTTP_MAP: dict[str, int] = {
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.VALIDATION_FAILED: 400,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.SERVICE_UNAVAILABLE: 503,
    ErrorCode.EXTERNAL_ERROR: 502,
    ErrorCode.CONFLICT: 409,
    ErrorCode.CONFIG_ERROR: 500,
    ErrorCode.DB_ERROR: 500,
}


class BusinessException(Exception):
    """统一业务异常：携带 errorCode / message / HTTP 状态码三元组。"""

    def __init__(self, error_code: ErrorCode, message: str, http_status: int | None = None) -> None:
        self.error_code = error_code
        self.message = message
        self.status_code = http_status or ERROR_HTTP_MAP.get(error_code, 500)
        super().__init__(message)


def not_found(message: str) -> NoReturn:
    raise BusinessException(ErrorCode.NOT_FOUND, message)


class RequestRejected(StarletteHTTPException):
    """带稳定 ``errorCode`` 的 HTTP 异常。

    存在的理由：``HTTPException`` 走全局处理器时只能给 ``errorCode=UNKNOWN``，而前端是
    按 ``errorCode`` 分派的（``CSRF_INVALID`` 刷新令牌重试、``LICENSE_*`` 跳激活页）。
    让每个调用点自己拼响应体形状既啰嗦又容易漏，所以由异常自带一个码，处理器照读即可。
    需要保留 ``detail`` 原样的场景（studio 侧读 ``payload.detail.code``）继续用普通
    ``HTTPException``，不受影响。
    """

    def __init__(
        self,
        detail: str,
        *,
        error_code: ErrorCode = ErrorCode.FORBIDDEN,
        status_code: int = 403,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code


class ConfigValidationError(StarletteHTTPException):
    """配置字段校验异常（对齐 ``AppConfigValidationError extends BadRequestException``）。

    与 :class:`BusinessException` 的差异（复刻 Nest 全局过滤器分支）：
    ``errorCode`` 为 ``UNKNOWN``、``error`` 取异常类名 ``AppConfigValidationError``。
    """

    error_name = "AppConfigValidationError"

    def __init__(self, summary: str) -> None:
        super().__init__(status_code=400, detail=summary)


def bad_request(message: str) -> NoReturn:
    raise BusinessException(ErrorCode.VALIDATION_FAILED, message)


def forbidden(message: str) -> NoReturn:
    raise BusinessException(ErrorCode.FORBIDDEN, message, 403)


def unauthorized(message: str) -> NoReturn:
    raise BusinessException(ErrorCode.UNAUTHORIZED, message, 401)


# HTTP 文案本地化（共享包 http-messages.ts 的等价实现）
HTTP_MESSAGE_TEXTS: dict[str, str] = {
    "badRequest": "请求无效",
    "forbidden": "没有权限执行此操作",
    "notFound": "请求的资源不存在",
    "conflict": "操作冲突，请刷新后重试",
    "timeout": "请求超时，请稍后重试",
    "rateLimited": "操作过于频繁，请约 1 分钟后再试",
    "internalServerError": "服务器内部错误",
    "csrf": "安全校验失败，请刷新页面后重试",
    "tokenExpired": "登录已过期，请重新登录",
}

HTTP_STATUS_MESSAGES: dict[int, str] = {
    400: HTTP_MESSAGE_TEXTS["badRequest"],
    403: HTTP_MESSAGE_TEXTS["forbidden"],
    404: HTTP_MESSAGE_TEXTS["notFound"],
    408: HTTP_MESSAGE_TEXTS["timeout"],
    409: HTTP_MESSAGE_TEXTS["conflict"],
    429: HTTP_MESSAGE_TEXTS["rateLimited"],
    500: HTTP_MESSAGE_TEXTS["internalServerError"],
}

_HTTP_MESSAGE_PATTERNS = {
    "throttler": re.compile(r"throttler|too many requests", re.IGNORECASE),
    "badRequest": re.compile(r"^bad request$", re.IGNORECASE),
    "forbidden": re.compile(r"^forbidden$", re.IGNORECASE),
    "forbiddenResource": re.compile(r"forbidden resource", re.IGNORECASE),
    "notFound": re.compile(r"^not found$", re.IGNORECASE),
    "conflict": re.compile(r"^conflict$", re.IGNORECASE),
    "timeout": re.compile(r"timeout|timed?\s*out", re.IGNORECASE),
    "internalServerError": re.compile(r"internal server error", re.IGNORECASE),
    "csrf": re.compile(r"csrf", re.IGNORECASE),
    "tokenExpired": re.compile(r"jwt expired|token expired|invalid token|jwt malformed", re.IGNORECASE),
}

_CJK = re.compile(r"[\u4e00-\u9fff]")
_EXCEPTION_PREFIX = re.compile(r"^[A-Za-z][A-Za-z0-9]*Exception:\s*", re.IGNORECASE)


def flatten_http_exception_message(raw: Any, fallback: str) -> str:
    """展平 ``message`` 数组（ValidationPipe 风格 string | string[]）。"""
    if isinstance(raw, (list, tuple)):
        parts = [str(item).strip() for item in raw if str(item or "").strip()]
        return "；".join(parts) if parts else fallback
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    if raw is not None and not isinstance(raw, (dict, list, tuple)):
        text = str(raw).strip()
        if text:
            return text
    return fallback


def localize_http_exception_message(message: str, status: int, error_name: str = "") -> str:
    """将英文/框架文案规范为中文；已含中文则原样返回。"""
    combined = f"{error_name} {message}".strip()
    text = message.strip()
    text = _EXCEPTION_PREFIX.sub("", text).strip() or text

    if _CJK.search(text):
        return text

    if status == 429 or _HTTP_MESSAGE_PATTERNS["throttler"].search(combined):
        return HTTP_MESSAGE_TEXTS["rateLimited"]
    if status == 401 or re.fullmatch(r"unauthorized", text, re.IGNORECASE):
        return "未登录或登录已过期"
    if (
        status == 403
        or _HTTP_MESSAGE_PATTERNS["forbidden"].search(text)
        or _HTTP_MESSAGE_PATTERNS["forbiddenResource"].search(text)
    ):
        return HTTP_MESSAGE_TEXTS["forbidden"]
    if status == 404 or _HTTP_MESSAGE_PATTERNS["notFound"].search(text):
        return HTTP_MESSAGE_TEXTS["notFound"]
    if _HTTP_MESSAGE_PATTERNS["badRequest"].search(text):
        return HTTP_MESSAGE_TEXTS["badRequest"]
    if status == 409 or _HTTP_MESSAGE_PATTERNS["conflict"].search(text):
        return HTTP_MESSAGE_TEXTS["conflict"]
    if status == 408 or _HTTP_MESSAGE_PATTERNS["timeout"].search(text):
        return HTTP_MESSAGE_TEXTS["timeout"]
    if status >= 500 or _HTTP_MESSAGE_PATTERNS["internalServerError"].search(text) or re.fullmatch(
        r"internal error", text, re.IGNORECASE
    ):
        return HTTP_MESSAGE_TEXTS["internalServerError"]
    if _HTTP_MESSAGE_PATTERNS["csrf"].search(text):
        return HTTP_MESSAGE_TEXTS["csrf"]
    if _HTTP_MESSAGE_PATTERNS["tokenExpired"].search(text):
        return HTTP_MESSAGE_TEXTS["tokenExpired"]
    return text


# apiErrorCode 正查表（api-error-messages.ts 的等价移植）
_F = Callable[..., str]

#: 错误码 → 文案。值为「静态字符串」或「惰性工厂（lambda，需参数）」的联合类型。
#: 调用方一律使用 :func:`api_error`（``api_error(key, *args)``）取值，
#: 不要直接 ``API_ERROR[key]`` 下标——联合类型会破坏静态检查，且工厂需传参。
API_ERROR: dict[str, str | _F] = {
    # auth
    "AUTH_SESSION_EXPIRED": "会话已失效，请重新登录",
    # access / guards
    "ACCESS_ENTITY_DENIED": "当前账户无权操作该设备",
    "TARGET_LABEL_UNRESOLVED": lambda ids: f"未能通过标签 ID（{ids}）解析到实体，请改用 entity_id，或确认 HA 实体已打上对应标签",
    "ACCESS_ENTITY_FORBIDDEN": "无权访问该实体",
    "ACCESS_LOGIN_REQUIRED": "需要登录用户",
    # config / backup
    "RETENTION_KEYS_INVALID": "包含无效的数据保留策略配置项",
    "BACKUP_CONFIRM_REQUIRED": "全量备份还原需 confirm: true",
    "BACKUP_FILE_INVALID_NAME": "无效的备份文件名（仅允许 homeos-full-*.zip）",
    "BACKUP_FILE_NOT_FOUND": "备份文件不存在",
    "BACKUP_CONFIG_CONFIRM_REQUIRED": "全量替换需 confirm: true",
    "BACKUP_CONFIG_MISSING": "缺少 config 对象",
    # ui-config
    "UI_CONFIG_SVG_ONLY": "仅支持 SVG 格式",
    "UI_CONFIG_DEFAULT_DELETE_DENIED": "不能删除默认配置",
    "UI_CONFIG_PATH_TRAVERSAL": "检测到目录遍历攻击",
    "UI_CONFIG_DIR_EXISTS": "目录已存在",
    "UI_CONFIG_FILE_TYPE_DENIED": lambda ext: f'不允许的文件类型 "{ext}"。',
    "UI_CONFIG_FILE_NOT_FOUND": "文件或目录未找到",
    "UI_CONFIG_ICON_NOT_FOUND": "图标文件不存在",
    "HA_NOT_CONNECTED": "HA 未连接",
    "TTS_XIAOMI_PLAY_TEXT_NOT_FOUND": "未找到「播放文本」实体，请在 HA → Xiaomi Home 集成配置中开启 Action 调试模式",
    # alerts
    "ALERT_RULE_NAME_REQUIRED": "规则名称不能为空",
    "ALERT_RULE_CONDITION_REQUIRED": "触发条件不能为空",
    "ALERT_RULE_DUPLICATE": "已存在相同实体与条件的告警规则",
    # agent / llm
    "AGENT_LLM_NOT_CONFIGURED": "DEEPSEEK_API_KEY 未配置，无法调用 DeepSeek。请在设置或 .env 填入，或改用 LLM_PROVIDER=mock",
    "AGENT_LLM_UPSTREAM_ERROR": lambda status, detail: f"DeepSeek 接口错误 {status}{f': {detail}' if detail else ''}",
    "AGENT_LLM_RESPONSE_INVALID": "DeepSeek 返回结构异常，无 choices[0].message",
    # voice
    "VOICE_AUDIO_EMPTY": "音频数据为空",
    "VOICE_STT_NOT_CONFIGURED": "未配置 STT 实体，请在设置 → 语音中配置 STT 实体或确保 HA 已启用 STT 集成",
    "VOICE_STT_NO_TEXT": "HA STT 未返回识别文本",
    "VOICE_STT_FAILED": lambda detail: f"HA 语音识别失败: {detail}",
    "VOICE_HA_CONVERSATION_FAILED": lambda status, detail: f"HA 对话接口 HTTP {status}{f': {detail}' if detail else ''}",
    "VOICE_HOMEOS_TARGET_MISSING": "未配置 HomeOS 目标 ID",
    "VOICE_HOME_MODE_FAILED": lambda detail: detail or "家庭模式激活失败",
    "VOICE_UNKNOWN_COMMAND_TYPE": "未知 HomeOS 语音命令类型",
    # home mode
    "HOME_MODE_CONFIG_PARSE_FAILED": "模式配置解析失败",
    "HOME_MODE_NOT_FOUND": "模式不存在",
    "HOME_MODE_PRESET_ACTIONS_EMPTY": "预设动作为空，请检查实体映射",
    "HOME_MODE_PRESET_NOT_FOUND": "预设不存在",
    "HOME_MODE_LINKAGE_BLOCKED": lambda reason: f"家庭模式联动已拦截：{reason}" if reason else "家庭模式联动已拦截",
    # system
    "SYSTEM_CONFIG_NOT_FOUND": "未找到系统配置",
    "SYSTEM_INVALID_API_PATH": "无效的 API 路径",
    "SYSTEM_INVALID_IMAGE_URL": "无效或不安全的图片 URL",
    "SYSTEM_INVALID_LAYOUT": "无效的布局配置",
    # ui-config (data/project/profile)
    "UI_CONFIG_DATA_INVALID": "无效的配置数据",
    "UI_CONFIG_FILE_REQUIRED": "没有上传文件",
    "UI_CONFIG_PATH_REQUIRED": "需要提供路径",
    "UI_CONFIG_PROJECT_ID_REQUIRED": "projectId 不能为空",
    "UI_CONFIG_CLIENT_ID_REQUIRED": "clientId 不能为空",
    "UI_CONFIG_PROFILE_ID_REQUIRED": "profileId 不能为空",
    "UI_CONFIG_TERMINAL_DEFAULT_INVALID": "newTerminalDefault 须为 activeProfile 或 default",
    "UI_CONFIG_PROFILE_NOT_FOUND": lambda project_id: f'配置方案 "{project_id}" 不存在',
    # command proxy（HA 服务调用失败的统一文案）
    "PROXY_HA_SERVICE_FAILED": lambda detail: f"Home Assistant 服务错误：{detail or '未知错误'}",
    # common validation
    "PAYLOAD_TOO_LARGE": "请求体过大",
    "VALIDATION_CONFIG_SECTION_INVALID": lambda section: f"无效的配置分区: {section}",
    "VALIDATION_JSON_ARRAY_TYPE": lambda label: f"{label} 须为 JSON 数组",
    "VALIDATION_ARRAY_ITEM_INVALID": lambda label, index: f"{label} 第 {index + 1} 项无效",
    "VALIDATION_ARRAY_ITEM_ENTITY_ID": lambda label, index: f"{label} 第 {index + 1} 项缺少 entity_id",
    "VALIDATION_ARRAY_ITEM_TYPE": lambda label, index: f"{label} 第 {index + 1} 项缺少 type",
    "VALIDATION_ARRAY_ITEM_TIME": lambda label, index: f"{label} 第 {index + 1} 项时间格式无效（需 HH:mm）",
    "VALIDATION_ARRAY_ITEM_LOCK_ENTITY": lambda label, index: f"{label} 第 {index + 1} 项门锁触发需指定 entityId",
    "VALIDATION_ARRAY_ITEM_STATE_ENTITY": lambda label, index: f"{label} 第 {index + 1} 项状态触发需指定 entityId",
    "VALIDATION_ARRAY_ITEM_STATE_TO": lambda label, index: f"{label} 第 {index + 1} 项状态触发需指定 to",
    # domain not-found
    "ENTITY_NOT_FOUND": lambda entity_id: f"实体未找到: {entity_id}",
    "SECURITY_ZONE_ID_NAME_REQUIRED": "安防区域 id 与 name 不能为空",
    "SECURITY_ZONE_ID_DUPLICATE": lambda zone_id: f"安防区域 id 重复: {zone_id}",
    "SECURITY_ZONE_NOT_FOUND": "布防区域未匹配到任何已配置区域",
    "EMBED_NOT_FOUND": lambda embed_id: f"内嵌页「{embed_id}」未配置或不存在",
    "EMBED_URL_MISSING": "内嵌地址未配置",
    "EMBED_URL_INVALID": "内嵌地址格式无效",
    "EMBED_URL_PROTOCOL": "内嵌地址须以 http:// 或 https:// 开头",
    "EMBED_URL_LOCALHOST": "内嵌地址不能使用 localhost 或 127.0.0.1",
    "EMBED_URL_LAN_ONLY": "内嵌反代仅允许局域网地址",
    "EMBED_MOVIEPILOT_URL_MISSING": "MoviePilot 内嵌地址未配置",
    "EMBED_UPSTREAM_UNREACHABLE": lambda url: f"无法连接内嵌目标 {url}。请确认该服务在线，且本机/容器网络可达该局域网地址",
    "EMBED_UPSTREAM_TIMEOUT": lambda url: f"连接内嵌目标 {url} 超时。请确认该服务在线，且本机/容器网络可达该局域网地址",
    "SECURITY_SENSOR_ENTITY_INVALID": lambda sid: f"传感器 entity_id 格式无效: {sid}",
    "MOVIEPILOT_URL_NOT_CONFIGURED": "MoviePilot URL 未在仪表板设置中配置",
    "MOVIEPILOT_PROXY_IMAGE_FAILED": "无法通过 MoviePilot 代理获取远程图像",
    "SETUP_WIZARD_STEPS_PENDING": lambda pending: f"请先完成向导步骤：{pending}",
    "CSRF_INVALID": "CSRF token 无效或缺失",
    "LICENSE_INACTIVE": "系统未激活，请导入商业授权许可证。",
    "WECOM_CREDENTIALS_MISSING": "企业微信 CorpId/CorpSecret 未配置",
    "WECOM_GET_TOKEN_FAILED": lambda detail: f"企业微信获取 access_token 失败: {detail}",
    "WECOM_SEND_FAILED": lambda detail: f"企业微信发送消息失败: {detail}",
    "WECOM_DECRYPT_FAILED": lambda detail: f"企业微信消息解密失败: {detail}",
    "CHANNEL_WEBPUSH_ENDPOINT_INVALID": "WebPush 订阅地址无效（须为 https 公网推送服务地址）",
    "LOCK_BUSY": "资源正在被其他同步任务占用，请稍后重试",
    "BACKUP_SCHEMA_TOO_NEW": lambda payload_version, current_version: f"备份 schema {payload_version} 高于当前 {current_version}",
    "HA_STATE_RESYNC_FAILED": lambda detail: f"HA 状态同步失败: {detail or '未知错误'}",
    "UI_CONFIG_LOAD_FAILED": lambda detail: f"无法加载配置。请确认已执行数据库初始化：{detail}",
}

#: 静态文案 → 错误码（保留首个出现，与旧实现顺序优先语义一致）。
_STATIC_CODE_BY_MESSAGE: dict[str, str] = {}
#: 动态文案前缀 → 错误码（自动推导 + 手工兜底）。
_DYNAMIC_PREFIX_CODES: dict[str, str] = {}

_PREFIX_SENTINEL = "\x00HOMEOS_PREFIX_SENTINEL\x00"

#: 工厂含非插值逻辑无法用哨兵提取时的手工兜底前缀表。
_MANUAL_DYNAMIC_PREFIXES: list[tuple[str, str]] = [
    ("备份 schema ", "BACKUP_SCHEMA_TOO_NEW"),
    ("企业微信获取 access_token 失败: ", "WECOM_GET_TOKEN_FAILED"),
    ("企业微信发送消息失败: ", "WECOM_SEND_FAILED"),
    ("实体未找到: ", "ENTITY_NOT_FOUND"),
    ("Home Assistant 服务错误：", "PROXY_HA_SERVICE_FAILED"),
    ("内嵌页「", "EMBED_NOT_FOUND"),
]


def _build_code_indexes() -> None:
    for code, value in API_ERROR.items():
        if isinstance(value, str):
            _STATIC_CODE_BY_MESSAGE.setdefault(value, code)
            continue
        try:
            out = str(value(_PREFIX_SENTINEL))
        except Exception:  # noqa: S112 - 单条格式化失败不应阻断索引构建
            continue
        index = out.find(_PREFIX_SENTINEL)
        if index > 0:
            prefix = out[:index]
            if prefix.strip():
                _DYNAMIC_PREFIX_CODES.setdefault(prefix, code)


_build_code_indexes()
for _prefix, _code in _MANUAL_DYNAMIC_PREFIXES:
    _DYNAMIC_PREFIX_CODES.setdefault(_prefix, _code)


def resolve_api_error_code(message: str | None) -> str | None:
    """根据 message 解析稳定 ``apiErrorCode``（静态正查 → 动态前缀）。"""
    if not message:
        return None
    trimmed = message.strip()
    if not trimmed:
        return None
    static_hit = _STATIC_CODE_BY_MESSAGE.get(trimmed)
    if static_hit:
        return static_hit
    for prefix, code in _DYNAMIC_PREFIX_CODES.items():
        if trimmed.startswith(prefix):
            return code
    return None


def api_error(key: str, *args: object) -> str:
    """解析 ``API_ERROR`` 文案：静态字符串直接返回；lambda 传入参数求值。"""
    value = API_ERROR.get(key)
    if value is None:
        return key
    if callable(value):
        return str(value(*args))
    return str(value)
