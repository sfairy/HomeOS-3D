"""把数据库层的唯一约束冲突翻译成业务判断。

项目名称与 slug 都是「先查后写」：查一遍没人用，然后插进去。两个请求可以同时查到
「没人用」，于是唯一约束成了真正的裁决者，撞上的那一个会拿到 ``IntegrityError``。
不处理的话它就是 500「服务器内部错误」，而正确的结果可能是 409「名称已存在」，
也可能只是「换一个 slug 再插一次」。

这里只做判断，不做重试：该怎么退让取决于撞的是哪一条约束（slug 可以加后缀，
名称不能），只有调用方知道。判断本身也不按状态码或错误码猜，而是读数据库给的
约束名 —— 那是唯一可靠的来源。
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError


def is_unique_violation(error: IntegrityError, column: str) -> bool:
    """这个 ``IntegrityError`` 是不是「某一列上的唯一约束被撞了」。

    两个条件都必须满足，各有各的必要性：

    - ``UNIQUE``：只按列名判断的话，**非空约束**的消息里同样会出现列名
      （``NOT NULL constraint failed: projects.name``），于是「name 恒为 NULL」这种缺陷会被
      当成「重名」报给用户 —— 真正的 bug 藏在一句听起来很合理的提示后面，而且按「重名」
      重试再多次也是同样的失败。
    - ``column``：必须带表名（``projects.name`` 而不是 ``name``），否则
      ``display_pairing_codes.name`` 之类别的表上的同名列也会命中。

    参数 ``error`` 是捕获到的 ``IntegrityError``，``column`` 是带表名的限定列名。
    """
    text = str(getattr(error, 'orig', error)).upper()
    return 'UNIQUE' in text and column.upper() in text
