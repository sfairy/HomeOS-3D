"""请求体的输入上限与 JSON 嵌套深度扫描。

为什么这几个值从 ``http/body_guard.py`` 下沉到这里：``core/schemas.py`` 也要用同一批
上限（户型图落盘那一段自己再校验一次字节数与嵌套深度），而 ``core`` 是更底层的一侧 ——
让 ``core`` 反向依赖 ``http`` 就是一条包级环（``core → http → core``，因为 ``http``
自己的模块要读 ``core`` 的模型），平时只是导入顺序问题，踩到就报在启动期。这与
``core/design.py``、``core/ha_url.py`` 是同一个处置：把「两边都要用、又不依赖任何一侧
运行时」的东西放进 ``core``。

``http/body_guard.py`` 仍然照旧转出这几个人名（那里是 ASGI 中间件的实现），所以别处
``from ..http.body_guard import MAX_SCENE_DOCUMENT_BYTES`` 的写法不受影响。

``json_nesting_depth`` 放在这里而不只留在中间件里：写盘那一层必须在**解析之前**判断
用户提交的户型图深度，而它的判据必须与中间件逐字一致 —— 两处各写一份扫描器，
迟早在「字符串里的括号算不算」这类细节上走散，而走散的表现是「接口放行、落盘拒收」。
"""
from __future__ import annotations

#: 请求允许的最大嵌套深度。
#:
#: 文档层级固定（文档 → 页面 → 组件 → 属性 → 绑定 …），实测个位数，留到 64 是给模板与自定义字段余量。
#: 它同时是递归遍历（素材收集、弹窗引用清理、pydantic 校验）的深度前提，封在这里后面就不必各自防爆栈。
MAX_JSON_DEPTH = 64

#: 没有 JSON 层级可言的路由的请求体上限。
#:
#: 1 MiB 对这批接口远远够用：最大的一批是壁挂屏上报的客户端日志，而前端队列自身的硬上限是
#: 50 条 / 约 120KB（见 frontend/static/logging/client-log.js）。给这么紧是为了让「用一个大 body
#: 把内存打满」在任何一条未鉴权入口上都不可行，而不是为了省那几个字节。
MAX_DEFAULT_BODY_BYTES = 1024 * 1024

#: 仪表盘文档的请求体上限。文档里只放布局与绑定，图片本身走素材上传，
#: 因此 8 MiB 对正常文档（哪怕上万个组件）都远远够用。
MAX_PANEL_DOCUMENT_BYTES = 8 * 1024 * 1024

#: 3D 户型草稿的请求体上限，与 studio3d 写盘时的 ``MAX_DRAFT_BYTES`` 同源
#: （那边 import 这里的常量），避免出现「接口放行、落盘拒收」两套阈值。
MAX_SCENE_DOCUMENT_BYTES = 32 * 1024 * 1024


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
