"""规范性 JSON 序列化：排序键 + 紧凑分隔符 + 不转义非 ASCII。

同一份内容必须每次序列化成完全一致的字符串，才能直接按字符串比对「内容是否
变化」、或对字节做摘要 / 加密。落库、写草稿文件、算 syncKey、授权传输加密都走
这一份实现：各处手写 ``json.dumps`` 参数时最容易漏掉某一项（例如漏掉
``ensure_ascii=False`` 会让非 ASCII 内容被转义成另一套字节，摘要随之对不上）。
"""
from __future__ import annotations

import json
from typing import Any


def canonical_json(value: Any) -> str:
    """把任意可 JSON 化的值序列化成规范字符串。"""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def canonical_json_bytes(value: Any) -> bytes:
    """规范字符串的 UTF-8 字节，供摘要 / 加密使用。"""
    return canonical_json(value).encode('utf-8')
