"""请求体的输入上限与 JSON 嵌套深度扫描。
"""
from __future__ import annotations

#: 请求允许的最大嵌套深度。
MAX_JSON_DEPTH = 64

#: 没有 JSON 层级可言的路由的请求体上限。
MAX_DEFAULT_BODY_BYTES = 1024 * 1024

#: 仪表盘文档的请求体上限。文档里只放布局与绑定，图片本身走素材上传，
MAX_PANEL_DOCUMENT_BYTES = 8 * 1024 * 1024

#: 3D 户型草稿的请求体上限，与 studio3d 写盘时的 ``MAX_DRAFT_BYTES`` 同源
MAX_SCENE_DOCUMENT_BYTES = 32 * 1024 * 1024


def json_nesting_depth(payload: bytes) -> int:
    """数一段 JSON 文本的最大嵌套深度（字符串内部的括号不算）。
    """
    depth = 0
    deepest = 0
    in_string = False
    escaped = False
    for byte in payload:
        if in_string:
            if escaped:
                escaped = False
            elif byte == 0x5C:
                escaped = True
            elif byte == 0x22:
                in_string = False
            continue
        if byte == 0x22:
            in_string = True
        elif byte in (0x7B, 0x5B):
            depth += 1
            deepest = max(deepest, depth)
        elif byte in (0x7D, 0x5D):
            depth -= 1
    return deepest
