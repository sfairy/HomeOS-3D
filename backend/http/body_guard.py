"""草稿类请求体的两道输入上限：字节数与 JSON 嵌套深度。

为什么必须放在 ASGI 中间件里，而不是路由函数或依赖里：FastAPI 处理请求时**先把整个
请求体读进内存并 ``json.loads``**，之后才轮到依赖与路由体（见 fastapi.routing.get_request_handler）。
因此依赖里做上限检查已经太晚（内存峰值在前一行就产生了），而深度检查必须在
``json.loads`` **之前** —— 几千层嵌套括号的请求体只有几 KB，字节上限拦不住，
而 ``json.loads`` 会先抛 ``RecursionError``（未捕获 → 500，堆栈还会进全局日志）。

两道上限管两件事，缺一不可：字节上限挡「把几百 MB 写进草稿列」（413）；深度上限挡
「几个 KB 把解析器打爆」（422）。

只作用于「整份 JSON 落库」的写路由（见 :data:`_DRAFT_ROUTE_LIMITS`）：上传素材、
导出 ZIP 这类自己带流式上限的路径不在这里判 —— 中间件先缓冲反而会把它们的分块上限作废。
"""
from __future__ import annotations

from fastapi.responses import JSONResponse

#: 草稿允许的最大嵌套深度。
#:
#: 前端生成的文档层级是固定的（文档 → 页面 → 组件 → 属性 → 绑定 …），
#: 实测深度个位数；留到 64 是给模板与自定义字段的余量。它同时也是本服务里
#: 那些递归遍历（素材收集、弹窗引用清理、pydantic 校验）的深度前提 ——
#: 深度被封在这里，后面就不需要每处都自己防爆栈。
MAX_JSON_DEPTH = 64

#: 仪表盘文档的请求体上限。文档里只放布局与绑定，图片本身走素材上传，
#: 因此 8 MiB 对正常文档（哪怕上万个组件）都远远够用。
MAX_PANEL_DOCUMENT_BYTES = 8 * 1024 * 1024

#: 3D 户型草稿的请求体上限，与 studio3d 写盘时的 ``MAX_DRAFT_BYTES`` 同源
#: （那边 import 这里的常量），避免出现「接口放行、落盘拒收」两套阈值。
MAX_SCENE_DOCUMENT_BYTES = 32 * 1024 * 1024

#: 「路径 → 请求体字节上限」的登记表。键是 (方法, 路径) 的匹配规则：
#: 项目草稿的路径带项目 id，因此用「前缀 + 后缀」匹配。
_DRAFT_ROUTE_LIMITS = (
    ('/api/v1/projects/', '/draft', MAX_PANEL_DOCUMENT_BYTES),
    ('/api/v1/studio3d', '', MAX_SCENE_DOCUMENT_BYTES),
)


def draft_body_limit(path: str, method: str) -> int | None:
    """该请求是不是「整份 JSON 落库」的写路由；是则给出它的字节上限。

    只认 PUT：这几条路由的读接口在同一路径上（GET 没有请求体），
    按方法区分可以避免把上限套到读路径上。
    """
    if method != 'PUT':
        return None
    normalized = path.rstrip('/') or '/'
    for prefix, suffix, limit in _DRAFT_ROUTE_LIMITS:
        if not normalized.startswith(prefix):
            continue
        if not suffix:
            # 无后缀的规则要求整条路径相等（``/api/v1/studio3d``），
            # 否则同前缀的子路径（``/api/v1/studio3d/exports``）会被一起套上。
            if normalized == prefix:
                return limit
            continue
        # 前缀 + 后缀两段都要对上，且中间至少有一个字符：
        # ``/api/v1/projects/x/draft`` 命中，``/api/v1/projects//draft`` 不命中。
        if normalized.endswith(suffix) and len(normalized) > len(prefix) + len(suffix):
            return limit
    return None


def json_nesting_depth(payload: bytes) -> int:
    """数一段 JSON 文本的最大嵌套深度（字符串内部的括号不算）。

    刻意不做解析，只扫一遍字节：它必须在 ``json.loads`` 之前跑完，而
    「深到能打爆解析器」的输入恰恰只有几 KB（``[[[[…`` 每层两个字节）。
    字符串状态机是必需的 —— 否则 ``{"message": "[[[[[["}`` 这种正常文档
    会被数成六层，把合法请求误判成超深。

    UTF-8 里 0x22（``"``）与 0x5C（``\\``）只可能是 ASCII 字符本身
    （续字节都在 ≥ 0x80），因此按字节扫与按字符扫等价。
    """
    depth = 0
    deepest = 0
    in_string = False
    escaped = False
    for byte in payload:
        if in_string:
            if escaped:
                escaped = False
            elif byte == 0x5C:  # 反斜杠：下一个字节是转义内容
                escaped = True
            elif byte == 0x22:  # 结束引号
                in_string = False
            continue
        if byte == 0x22:
            in_string = True
        elif byte in (0x7B, 0x5B):  # { [
            depth += 1
            if depth > deepest:
                deepest = depth
        elif byte in (0x7D, 0x5D):  # } ]
            depth -= 1
    return deepest


async def _read_capped_body(receive, limit: int) -> tuple[bytes, bool]:
    """逐块读请求体，累计超过 ``limit`` 就停下。

    返回 ``(请求体, 是否超限)``。超限时返回值无意义（调用方直接回 413）。

    不信任 ``Content-Length``：分块传输（chunked）根本没有这个头，伪造一个
    小值也能让「先看头再读」的写法形同虚设。累计判断是唯一可靠的判据。

    超限后仍把剩余分块读完再返回：连接上残留的字节会被 h11 当成下一个请求的
    起始，直接报协议错误 —— 那会让「请求太大」表现成连接被重置。
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message.get('type') != 'http.request':
            # http.disconnect：客户端已经走了，没必要再往路由里送。
            return b'', False
        body = message.get('body') or b''
        total += len(body)
        if total > limit:
            while message.get('more_body'):
                message = await receive()
                if message.get('type') != 'http.request':
                    break
            return b'', True
        chunks.append(body)
        if not message.get('more_body'):
            return b''.join(chunks), False


async def _send_error(send, status_code: int, detail: str) -> None:
    """直接回一个 JSON 错误（走真正的 Response，保证头部与 JSON 体一致）。"""
    response = JSONResponse(
        {'detail': detail}, status_code=status_code, headers={'cache-control': 'no-store'}
    )
    await response({'type': 'http'}, None, send)


class DraftBodyGuard:
    """给草稿类写路由加上「请求体字节上限 + 嵌套深度上限」的 ASGI 中间件。

    同时把读到的请求体**重放**给下游：FastAPI 仍按原样再读一次并自己
    ``json.loads``，因此路由签名（``payload: ProjectDraftUpdate``）与校验
    行为完全不变 —— 这一层只负责在解析之前把病态输入挡掉。
    """

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope.get('type') != 'http':
            await self.app(scope, receive, send)
            return
        limit = draft_body_limit(scope.get('path', ''), scope.get('method', ''))
        if limit is None:
            await self.app(scope, receive, send)
            return
        (body, too_large) = await _read_capped_body(receive, limit)
        if too_large:
            await _send_error(send, 413, '草稿数据过大，无法保存。请精简后重试。')
            return
        if json_nesting_depth(body) > MAX_JSON_DEPTH:
            await _send_error(
                send, 422, f'草稿的嵌套层级超过 {MAX_JSON_DEPTH} 层，无法保存。'
            )
            return

        async def replay() -> dict:
            """把已读到的请求体交给下游（可被重复调用，返回同一份内容）。"""
            return {'type': 'http.request', 'body': body, 'more_body': False}

        await self.app(scope, replay, send)
