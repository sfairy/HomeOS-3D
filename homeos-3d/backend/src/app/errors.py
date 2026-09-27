"""异常处理器：把异常变成响应，并把细节留给全局日志。
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_VALIDATION_REASON_TEXT = {
    'missing': '为必填项',
    'string_too_short': '长度不足',
    'string_too_long': '长度超限',
    'string_type': '必须是文本',
    'string_pattern_mismatch': '格式不符',
    'int_parsing': '必须是整数',
    'int_type': '必须是整数',
    'int_from_float': '必须是整数',
    'float_parsing': '必须是数字',
    'float_type': '必须是数字',
    'bool_parsing': '必须是布尔值',
    'bool_type': '必须是布尔值',
    'json_invalid': '请求体不是合法 JSON',
    'list_type': '必须是列表',
    'dict_type': '必须是对象',
    'url_parsing': '必须是合法链接',
    'url_scheme': '链接协议不支持',
    'datetime_parsing': '必须是合法时间',
    'date_parsing': '必须是合法日期',
    'uuid_parsing': '必须是合法标识',
    'greater_than': '超出允许范围',
    'greater_than_equal': '超出允许范围',
    'less_than': '超出允许范围',
    'less_than_equal': '超出允许范围',
    'enum': '取值不在允许范围内',
    'literal_error': '取值不在允许范围内',
    'value_error': '取值不合法',
}

#: 带上下界约束的那几类，把 ``ctx`` 里的边界值一起说出来（「长度不足（至少 8 个字符）」
_VALIDATION_BOUND_TEXT = {
    'string_too_short': ('min_length', '至少', ' 个字符'),
    'string_too_long': ('max_length', '最多', ' 个字符'),
    'greater_than': ('gt', '需大于', ''),
    'greater_than_equal': ('ge', '需不小于', ''),
    'less_than': ('lt', '需小于', ''),
    'less_than_equal': ('le', '需不大于', ''),
}

_VALIDATION_LOCATION_PREFIXES = ('body', 'query', 'path', 'header', 'cookie')

#: 一条 message 里最多说几处错：字段一多（批量提交）会把提示撑成一屏，用户反而读不出重点。
_VALIDATION_MESSAGE_MAX_PARTS = 3


def _validation_error_message(errors: list[dict]) -> str:
    """把 FastAPI 的校验错误压成一句中文摘要，供前端直接展示。
    """
    parts: list[str] = []
    for item in errors:
        if not isinstance(item, dict):
            continue
        location = [str(part) for part in (item.get('loc') or ())]
        # 首段是请求位置（body / query / path …）：去掉，剩下的用 `.` 拼成字段路径。
        if location and location[0] in _VALIDATION_LOCATION_PREFIXES:
            location = location[1:]
        field = '.'.join(location)
        error_type = str(item.get('type') or '')
        reason = _VALIDATION_REASON_TEXT.get(error_type, '取值不合法')
        bound = _VALIDATION_BOUND_TEXT.get(error_type)
        context = item.get('ctx') if isinstance(item.get('ctx'), dict) else {}
        if bound and bound[0] in context:
            reason = f'{reason}（{bound[1]} {context[bound[0]]}{bound[2]}）'
        parts.append(f'参数 {field} {reason}' if field else reason)
    if not parts:
        return '参数校验未通过。'
    if len(parts) > _VALIDATION_MESSAGE_MAX_PARTS:
        return '；'.join(parts[:_VALIDATION_MESSAGE_MAX_PARTS]) + ' 等。'
    return '；'.join(parts) + '。'


def install_exception_handlers(app: FastAPI) -> None:
    """注册三条异常处理器（顺序无关，见模块头）。"""
    @app.exception_handler(Exception)
    async def unhandled_error_response(request: Request, _error: Exception):
        """兜底异常处理：只回纯文本，不回堆栈。
        """
        context = getattr(request.state, 'log_context', {})
        return PlainTextResponse('Internal Server Error', status_code = 500, headers = {'X-Request-ID': context['requestId']} if context.get('requestId') else None)

    @app.exception_handler(StarletteHTTPException)
    async def remember_http_error(request: Request, error: StarletteHTTPException):
        """把 HTTPException 的 detail 暂存到请求上，供诊断中间件写日志。"""
        request.state.diagnostic_detail = error.detail
        return await http_exception_handler(request, error)

    @app.exception_handler(RequestValidationError)
    async def remember_validation_error(request: Request, error: RequestValidationError):
        """同上，并对 422 的校验错误做裁剪。
        """
        request.state.diagnostic_detail = [
            {key: item[key] for key in ('loc', 'msg', 'type') if key in item}
            for item in error.errors()
        ]
        response = await request_validation_exception_handler(request, error)
        body = json.loads(response.body)
        body['message'] = _validation_error_message(error.errors())
        return JSONResponse(status_code=response.status_code, content=body)
