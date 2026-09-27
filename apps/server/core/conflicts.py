"""把数据库层的唯一约束冲突翻译成业务判断。
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError


def is_unique_violation(error: IntegrityError, column: str) -> bool:
    """这个 ``IntegrityError`` 是不是「某一列上的唯一约束被撞了」。
    """
    text = str(getattr(error, 'orig', error)).upper()
    return 'UNIQUE' in text and column.upper() in text
