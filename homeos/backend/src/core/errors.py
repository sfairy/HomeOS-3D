"""统一错误码、业务异常、HTTP 文案本地化与 ``apiErrorCode`` 解析。

逐字段复刻 Nest 侧 ``business-exception.ts`` / ``http-exception-message.util.ts`` /
``api-error-resolver.util.ts`` / ``api-error-messages.ts`` 与共享包
``@homeos/shared/errors/http-messages`` 的行为，保证：

- 响应体结构与中文文案与 Nest 版逐字节一致；
- ``apiErrorCode`` 正查表命中结果一致（前端 i18n 依赖此稳定码）。
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


# --------------------------------------------------------------------------- #
# HTTP 文案本地化（共享包 http-messages.ts 的等价实现）
# --------------------------------------------------------------------------- #
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
    "throttler": re.compile(r"throttler|too many requests", re.I),
    "badRequest": re.compile(r"^bad request$", re.I),
    "forbidden": re.compile(r"^forbidden$", re.I),
    "forbiddenResource": re.compile(r"forbidden resource", re.I),
    "notFound": re.compile(r"^not found$", re.I),
    "conflict": re.compile(r"^conflict$", re.I),
    "timeout": re.compile(r"timeout|timed?\s*out", re.I),
    "internalServerError": re.compile(r"internal server error", re.I),
    "csrf": re.compile(r"csrf", re.I),
    "tokenExpired": re.compile(r"jwt expired|token expired|invalid token|jwt malformed", re.I),
}

_CJK = re.compile(r"[\u4e00-\u9fff]")
_EXCEPTION_PREFIX = re.compile(r"^[A-Za-z][A-Za-z0-9]*Exception:\s*", re.I)


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
    if status == 401 or re.fullmatch(r"unauthorized", text, re.I):
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
        r"internal error", text, re.I
    ):
        return HTTP_MESSAGE_TEXTS["internalServerError"]
    if _HTTP_MESSAGE_PATTERNS["csrf"].search(text):
        return HTTP_MESSAGE_TEXTS["csrf"]
    if _HTTP_MESSAGE_PATTERNS["tokenExpired"].search(text):
        return HTTP_MESSAGE_TEXTS["tokenExpired"]
    return text


# --------------------------------------------------------------------------- #
# apiErrorCode 正查表（api-error-messages.ts 的等价移植）
# --------------------------------------------------------------------------- #
_F = Callable[..., str]

#: 错误码 → 文案。值为「静态字符串」或「惰性工厂（lambda，需参数）」的联合类型。
#: 调用方一律使用 :func:`api_error`（``api_error(key, *args)``）取值，
#: 不要直接 ``API_ERROR[key]`` 下标——联合类型会破坏静态检查，且工厂需传参。
API_ERROR: dict[str, str | _F] = {
    # auth
    "AUTH_ACCOUNT_LOCKED": "账户已锁定，请稍后再试",
    "AUTH_CANNOT_DELETE_LAST_ADMIN": "不能删除最后一个管理员",
    "AUTH_CANNOT_DELETE_SELF": "不能删除当前登录用户",
    "AUTH_CANNOT_MODIFY_ADMIN": "无权修改管理员账户",
    "AUTH_GUEST_TOKEN_INVALID": "访客凭证无效或已过期",
    "AUTH_GUEST_SHARE_CODE_MISSING": "缺少访客短码",
    "AUTH_GUEST_SHARE_CODE_INVALID": "访客短码无效或已过期",
    "AUTH_GUEST_SHARE_CODE_PAYLOAD_INVALID": "访客短码数据无效",
    "AUTH_GUEST_SHARE_CODE_REVOKED": "访客短码已失效，请重新获取",
    "AUTH_INVALID_CREDENTIALS": "凭据无效",
    "AUTH_INVALID_ROLE": "无效角色",
    "AUTH_MFA_ADMIN_ONLY": "仅管理员可配置 MFA",
    "AUTH_MFA_NOT_ENABLED": "该账户未启用 MFA",
    "AUTH_MFA_SETUP_REQUIRED": "请先发起 MFA 设置",
    "AUTH_MFA_TOTP_INVALID": "验证码无效",
    "AUTH_MFA_RELOGIN_REQUIRED": "已启用 MFA，请使用验证码重新登录",
    "AUTH_NEED_CURRENT_PASSWORD": "修改密码需提供当前密码",
    "AUTH_NOT_GUEST_TOKEN": "非访客凭证",
    "AUTH_PASSWORD_WRONG": "当前密码不正确",
    "AUTH_SESSION_EXPIRED": "会话已失效，请重新登录",
    "AUTH_SYSTEM_INITIALIZED": "系统已初始化",
    "AUTH_USER_EXISTS": "用户名已存在",
    "AUTH_USER_NOT_FOUND": "用户不存在",
    "AUTH_USER_OR_SESSION_INVALID": "用户不存在或会话已失效",
    "AUTH_USERNAME_REQUIRED": "用户名不能为空",
    # access / guards
    "ACCESS_CHILD_NO_WHITELIST": "儿童账户未配置设备白名单，无法操作设备",
    "ACCESS_ENTITY_DENIED": "当前账户无权操作该设备",
    "TARGET_LABEL_UNRESOLVED": lambda ids: f"未能通过标签 ID（{ids}）解析到实体，请改用 entity_id，或确认 HA 实体已打上对应标签",
    "ACCESS_ENTITY_FORBIDDEN": "无权访问该实体",
    "ACCESS_GUEST_DEVICE_DENIED": "访客账户无权控制设备",
    "ACCESS_GUEST_READ_ONLY": "访客账户仅可查看，无权修改",
    "ACCESS_GUEST_SCENE_DENIED": "访客无权执行该场景",
    "ACCESS_GROUP_PARTIAL_DENIED": "当前账户无权操作分组内部分设备",
    "ACCESS_LOGIN_REQUIRED": "需要登录用户",
    "ACCESS_NOTIFY_DND_ADMIN": "仅管理员可修改免打扰时段",
    "ACCESS_ROLE_DEVICE_DENIED": "当前角色无权操作此设备类型",
    # config / backup
    "CONFIG_JSON_OBJECT_REQUIRED": "配置须为 JSON 对象",
    "RETENTION_KEYS_INVALID": "包含无效的数据保留策略配置项",
    "BACKUP_BUNDLE_CONFIRM_REQUIRED": "完整备份还原需 confirm: true",
    "BACKUP_BUNDLE_INVALID_JSON": "无效的备份包 JSON",
    "BACKUP_BUNDLE_INVALID_STRUCTURE": "备份包结构无效（缺少必要字段或字段类型错误）",
    "BACKUP_BUNDLE_UI_LAYOUT_INVALID": "备份包中 UI 布局为空或格式无效",
    "BACKUP_FILE_INVALID_NAME": "无效的备份文件名（仅允许 homeos-bundle-*.json）",
    "BACKUP_FILE_NOT_FOUND": "备份文件不存在",
    "BACKUP_CONFIG_CONFIRM_REQUIRED": "全量替换需 confirm: true",
    "BACKUP_CONFIG_MISSING": "缺少 config 对象",
    "BACKUP_BUNDLE_SECTIONS_INVALID": "备份包分区无效",
    # ui-config
    "UI_CONFIG_SVG_ONLY": "仅支持 SVG 格式",
    "UI_CONFIG_DEFAULT_DELETE_DENIED": "不能删除默认配置",
    "UI_CONFIG_PATH_TRAVERSAL": "检测到目录遍历攻击",
    "UI_CONFIG_DIR_EXISTS": "目录已存在",
    "UI_CONFIG_FILE_TYPE_DENIED": lambda ext: f'不允许的文件类型 "{ext}"。',
    "UI_CONFIG_FILE_NOT_FOUND": "文件或目录未找到",
    "UI_CONFIG_ICON_NOT_FOUND": "图标文件不存在",
    "HA_NOT_CONFIGURED": "HA 未配置",
    "HA_NOT_CONNECTED": "HA 未连接",
    "HA_BATCH_NOT_CONNECTED": "HA 未连接，无法执行批量控制",
    "HA_MEDIA_PATH_INVALID": "非法的媒体路径",
    "HA_REST_API_FAILED": lambda status, detail: f"HA REST 接口 {status}: {detail}",
    "HA_REST_RESPONSE_FAILED": lambda status: f"HA 返回 {status}",
    "HA_WS_NOT_CONNECTED": "WebSocket 未连接",
    "HA_COMMAND_BRIDGE_UNAVAILABLE": "Redis 不可用，HA 命令桥接未就绪",
    "HA_COMMAND_BRIDGE_TIMEOUT": "HA 命令桥接超时",
    "HA_CONFIG_SYNC_FAILED": lambda component, status, detail: f"HA {component} 同步失败 {status}: {detail}",
    "HA_CONFIG_DELETE_FAILED": lambda component, status, hint="": f"HA {component} 删除失败 {status}{hint}",
    "HA_FLOW_FAILED": lambda status, message: f"HA Flow 失败 {status}: {message}",
    "HA_TEMPLATE_OPTIONS_FLOW_START_FAILED": "无法启动 template options flow",
    "HA_TEMPLATE_CONFIG_FLOW_START_FAILED": "无法启动 template config flow",
    "HA_TEMPLATE_ENTRY_ID_MISSING": "template helper 创建完成但未返回 entry_id",
    "HA_FLOW_ABORTED": lambda reason: f"HA Flow 已中止: {reason}",
    "HA_FLOW_STEP_UNSUPPORTED": lambda type_: f"不支持的 Flow 步骤类型: {type_}",
    "HA_FLOW_MAX_STEPS": lambda max_steps: f"HA Flow 超过 {max_steps} 步仍未完成",
    "HA_FLOW_MENU_CHOICE_REQUIRED": lambda options: f"需要选择实体类型 (next_step_id)，可选: {options}",
    "HA_FLOW_FORM_VALIDATION_FAILED": lambda detail: f"表单校验失败: {detail}",
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
    # system / proxy
    "SYSTEM_CONFIG_NOT_FOUND": "未找到系统配置",
    "SYSTEM_INVALID_API_PATH": "无效的 API 路径",
    "SYSTEM_INVALID_IMAGE_URL": "无效或不安全的图片 URL",
    "SYSTEM_INVALID_LAYOUT": "无效的布局配置",
    "SYSTEM_PAGINATION_REQUIRED": "请提供 page 与 limit 查询参数",
    # ui-config (data/project/profile)
    "UI_CONFIG_DATA_INVALID": "无效的配置数据",
    "UI_CONFIG_FILE_REQUIRED": "没有上传文件",
    "UI_CONFIG_PATH_REQUIRED": "需要提供路径",
    "UI_CONFIG_PROJECT_ID_REQUIRED": "projectId 不能为空",
    "UI_CONFIG_CLIENT_ID_REQUIRED": "clientId 不能为空",
    "UI_CONFIG_PROFILE_ID_REQUIRED": "profileId 不能为空",
    "UI_CONFIG_TERMINAL_DEFAULT_INVALID": "newTerminalDefault 须为 activeProfile 或 default",
    "UI_CONFIG_PROFILE_NOT_FOUND": lambda project_id: f'配置方案 "{project_id}" 不存在',
    "UI_CONFIG_TERMINAL_BINDING_FORBIDDEN": "无权修改该终端绑定",
    # command proxy
    "PROXY_ENTITY_IDS_REQUIRED": "需要提供 entity_ids 查询参数",
    "PROXY_ENTITY_IDS_MAX": "entity_ids 最多 15 个",
    "PROXY_ENTITY_ID_REQUIRED": "entity_id 必填",
    "PROXY_HOURS_RANGE": "hours 须在 1–168 之间",
    "PROXY_PATH_REQUIRED": "需要提供 path 查询参数",
    "PROXY_TOKEN_REQUIRED": "需要提供 token",
    "PROXY_URL_REQUIRED": "需要提供 url",
    "PROXY_HA_SERVICE_FAILED": lambda detail: f"Home Assistant 服务错误：{detail or '未知错误'}",
    # common validation
    "VALIDATION_ENTITY_ID_QUERY_REQUIRED": "缺少 entityId 查询参数",
    "VALIDATION_ENTITY_ID_REQUIRED": "缺少 entityId 参数",
    "VALIDATION_PARAMS_REQUIRED": "缺少参数",
    "VALIDATION_ID_REQUIRED": "缺少 id",
    "VALIDATION_CAMERA_ENTITY_REQUIRED": "entity_id 须为 camera 实体",
    "VALIDATION_OFFER_REQUIRED": "offer 不能为空",
    "PAYLOAD_TOO_LARGE": "请求体过大",
    "VALIDATION_CONFIG_SECTION_INVALID": lambda section: f"无效的配置分区: {section}",
    "VALIDATION_JSON_ARRAY_REQUIRED": lambda label: f"{label} 须为合法 JSON 数组",
    "VALIDATION_JSON_ARRAY_TYPE": lambda label: f"{label} 须为 JSON 数组",
    "VALIDATION_ARRAY_ITEM_INVALID": lambda label, index: f"{label} 第 {index + 1} 项无效",
    "VALIDATION_ARRAY_ITEM_ENTITY_ID": lambda label, index: f"{label} 第 {index + 1} 项缺少 entity_id",
    "VALIDATION_ARRAY_ITEM_TYPE": lambda label, index: f"{label} 第 {index + 1} 项缺少 type",
    "VALIDATION_ARRAY_ITEM_TIME": lambda label, index: f"{label} 第 {index + 1} 项时间格式无效（需 HH:mm）",
    "VALIDATION_ARRAY_ITEM_LOCK_ENTITY": lambda label, index: f"{label} 第 {index + 1} 项门锁触发需指定 entityId",
    "VALIDATION_ARRAY_ITEM_STATE_ENTITY": lambda label, index: f"{label} 第 {index + 1} 项状态触发需指定 entityId",
    "VALIDATION_ARRAY_ITEM_STATE_TO": lambda label, index: f"{label} 第 {index + 1} 项状态触发需指定 to",
    # domain not-found / auth extras
    "ENTITY_NOT_FOUND": lambda entity_id: f"实体未找到: {entity_id}",
    "AUTH_CANNOT_DEMOTE_LAST_ADMIN": "不能降级最后一个管理员",
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
    "GUEST_PASS_LIMIT": lambda max_: f"临时密码数量已达上限 ({max_})，请先撤销旧密码",
    "GUEST_PASS_CRYPTO_SECRET_MISSING": "GUEST_PASS_SECRET 或 JWT_SECRET 未配置，无法加密访客密码",
    "GUEST_PASS_CRYPTO_DECRYPT_FAILED": "访客密码解密失败",
    "GUEST_PASS_LOCK_WRITE_FAILED": "门锁写入临时密码失败，请检查门锁集成是否支持 set_usercode，未创建访客通行",
    "DEVICE_GROUP_DOMAIN_SERVICE_REQUIRED": "必须指定 domain 和 service",
    "CSRF_INVALID": "CSRF token 无效或缺失",
    "LICENSE_INACTIVE": "系统未激活，请导入商业授权许可证。",
    "LICENSE_BYPASS_FORBIDDEN_IN_PRODUCTION": "HOMEOS_LICENSE_BYPASS 禁止在 production 使用。请移除该环境变量。",
    "WECOM_CREDENTIALS_MISSING": "企业微信 CorpId/CorpSecret 未配置",
    "WECOM_GET_TOKEN_FAILED": lambda detail: f"企业微信获取 access_token 失败: {detail}",
    "WECOM_SEND_FAILED": lambda detail: f"企业微信发送消息失败: {detail}",
    "WECOM_DECRYPT_FAILED": lambda detail: f"企业微信消息解密失败: {detail}",
    "CHANNEL_WEBPUSH_ENDPOINT_INVALID": "WebPush 订阅地址无效（须为 https 公网推送服务地址）",
    "LOCK_BUSY": "资源正在被其他同步任务占用，请稍后重试",
    "LOCK_REDIS_UNAVAILABLE": "Redis 已配置但未就绪，拒绝获取分布式锁",
    "BACKUP_SCHEMA_TOO_NEW": lambda payload_version, current_version: f"备份 schema {payload_version} 高于当前 {current_version}",
    "BUNDLE_SCHEMA_TOO_NEW": lambda bundle_version, current_version: f"备份包 schema {bundle_version} 高于当前 {current_version}",
    "HA_CALL_SERVICE_TIMEOUT": lambda domain, service: f"服务调用超时：{domain}.{service}",
    "HA_CALL_SERVICE_DEPS_NOT_READY": "HA call_service 依赖未初始化",
    "HA_COMMAND_QUEUE_FULL": "HA 未连接且命令队列已满",
    "HA_COMMAND_QUEUE_TTL_EXPIRED": "HA 命令队列已过期（TTL）",
    "HA_COMMAND_QUEUE_EMPTY": "没有可重试的丢弃指令",
    "HA_COMMAND_QUEUE_INSTANCE_STOPPING": "实例关闭，未下发指令已转入可重试列表",
    "HA_COMMAND_BRIDGE_FAILED": "HA 命令桥接失败",
    "HA_COMMAND_BRIDGE_PUBLISH_FAILED": lambda detail: f"HA 命令桥接请求发布失败: {detail}",
    "HA_COMMAND_BRIDGE_SUBSCRIBE_FAILED": lambda detail: f"HA 命令桥接订阅失败: {detail}",
    "HA_WS_CONNECTION_CLOSED": "WebSocket 连接已关闭",
    "HA_WS_REQUEST_TIMEOUT": lambda type_: f"WebSocket 请求超时：{type_}",
    "HA_WS_REQUEST_FAILED": "HA WebSocket 请求失败",
    "HA_GET_STATES_TIMEOUT": "get_states 请求超时",
    "HA_GET_STATES_INVALID_RESPONSE": "get_states 返回无效响应",
    "HA_SUBSCRIBE_EVENTS_TIMEOUT": "subscribe_events 超时",
    "HA_SUBSCRIBE_ENTITY_REGISTRY_TIMEOUT": "subscribe_events（entity_registry_updated）超时",
    "HA_SUBSCRIBE_AUTOMATION_TIMEOUT": "subscribe_events（automation.triggered）超时",
    "HA_WEBRTC_NO_RESULT": "WebRTC 协商无结果",
    "HA_WEBRTC_TIMEOUT": "WebRTC 协商超时",
    "HA_WEBRTC_ERROR": "WebRTC 错误",
    "HA_WEBRTC_OFFER_ACK_TIMEOUT": "WebRTC offer 确认超时",
    "HA_UNSUBSCRIBE_TIMEOUT": "unsubscribe 超时",
    "HA_WEBRTC_NOT_CONNECTED": "Home Assistant 未连接，无法建立 WebRTC",
    "HA_STATE_RESYNC_FAILED": lambda detail: f"HA 状态同步失败: {detail or '未知错误'}",
    "AREA_NOT_FOUND": lambda area_id: f"区域 {area_id} 不存在",
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
    ("备份包 schema ", "BUNDLE_SCHEMA_TOO_NEW"),
    ("企业微信获取 access_token 失败: ", "WECOM_GET_TOKEN_FAILED"),
    ("企业微信发送消息失败: ", "WECOM_SEND_FAILED"),
    ("实体未找到: ", "ENTITY_NOT_FOUND"),
    ("区域 ", "AREA_NOT_FOUND"),
    ("WebSocket 请求超时：", "HA_WS_REQUEST_TIMEOUT"),
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
        except Exception:  # noqa: BLE001 - 工厂含算术/格式化，哨兵调用失败则跳过
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
