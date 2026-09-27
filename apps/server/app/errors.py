"""异常处理器：把异常变成响应，并把细节留给全局日志。

从 main.py 拆出来的（连同校验错误摘要的常量表）。三条处理器各管一类：
未捕获异常、HTTPException、请求校验失败（422）。

共同点是它们都要把「给人看的响应」和「给日志看的细节」分开：响应里不回堆栈，
细节经 request.state.diagnostic_detail 交给诊断中间件落盘（见 app/middleware.py）。
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

#: 校验失败的中文原因表：键是 pydantic v2 的 error ``type``。
#: 为什么要有这张表：pydantic 的 ``msg`` 是**英文**且面向开发者，可以进日志但不适合直接给用户看；
#: 这份映射只覆盖本仓接口真的会产生的那几类，其余落到「取值不合法」—— 宁可笼统也不要猜错。
#: 与前端的分工：这里负责「这一次校验为什么没过」（而且知道约束值），前端负责从任意错误载荷里挑出
#: 最能说明问题的那句话，两边刻意不重叠。
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
#: 比「长度不足」可操作）。值是 ``(ctx 键, 前缀词, 单位)`` —— 方向词直接写在表里，
#: 不在拼装处按类型名做判断（那种判断是改一处漏一处的形态）。
_VALIDATION_BOUND_TEXT = {
    'string_too_short': ('min_length', '至少', ' 个字符'),
    'string_too_long': ('max_length', '最多', ' 个字符'),
    'greater_than': ('gt', '需大于', ''),
    'greater_than_equal': ('ge', '需不小于', ''),
    'less_than': ('lt', '需小于', ''),
    'less_than_equal': ('le', '需不大于', ''),
}

#: 请求位置的固定前缀（FastAPI 的 ``loc`` 首段）：对着用户显示「参数 body.x」没有意义。
_VALIDATION_LOCATION_PREFIXES = ('body', 'query', 'path', 'header', 'cookie')

#: 一条 message 里最多说几处错：字段一多（批量提交）会把提示撑成一屏，用户反而读不出重点。
_VALIDATION_MESSAGE_MAX_PARTS = 3


def _validation_error_message(errors: list[dict]) -> str:
    """把 FastAPI 的校验错误压成一句中文摘要，供前端直接展示。
    值得在后端做：只有这里知道**约束值**，前端拿到的 ``msg`` 是英文、``ctx`` 里的边界值也读不出，
    自己再维护 pydantic 类型表才是真正的重复。形态（前端优先取顶层 ``message``）如
    ``参数 activationCode 长度不足（至少 8 个字符）``；多处用「；」连，超过上限只报前几处并缀「等」。
    连一条都解析不出来时也返回兜底文案，绝不返回空串。
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

        带上 X-Request-ID 便于用户报障时与服务端日志对上号；
        真正的异常详情已经由诊断中间件记进全局日志。
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

        只保留 loc / msg / type 三个键：pydantic 原始错误里会带 input 原文，
        那可能包含用户提交的敏感内容，不该进日志。
        """
        request.state.diagnostic_detail = [
            {key: item[key] for key in ('loc', 'msg', 'type') if key in item}
            for item in error.errors()
        ]
        # 响应体在标准 ``{"detail": [...]}`` 之上**追加**顶层 ``message``：``detail`` 原样保留
        # （OpenAPI 契约与既有解析方认它），中文摘要给用户看 —— 前端调用点只认字符串与
        # ``detail.message``（认不出 422 的数组形态），走标准处理器补键以保住状态码与编码。
        response = await request_validation_exception_handler(request, error)
        body = json.loads(response.body)
        body['message'] = _validation_error_message(error.errors())
        return JSONResponse(status_code=response.status_code, content=body)
