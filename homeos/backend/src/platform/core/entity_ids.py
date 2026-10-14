"""HA 实体 id 的形状校验（叶子模块，无业务依赖）。

原先住在 ``panel/action_rules.py``：那份文件是「面板动作规则」的名字，但内容其实是
**通用实体 id 语法 + 可切换域清单 + 弹窗来源枚举**三件互不相干的事，于是
``domains``/``modules`` 想用其中一条校验就必须 import ``panel`` —— 一次 import 把
「实体 id 合不合法」和「面板编辑器的动作规则」绑在了一起。这里按「一个名字一件事」拆开：

- 实体 id 语法 → 本模块（平台叶子）；
- 可切换域清单 → ``platform/core/ha_service_catalog.py``（HA 服务目录）；
- 弹窗来源枚举 → ``panel/schema.py``（只有面板 schema 自己用）。
"""

from __future__ import annotations

import re

#: HA 风格实体 id：``domain.object_id``（小写字母 / 数字 / 下划线）。
ENTITY_ID = re.compile("^[a-z0-9_]+\\.[a-z0-9_]+$")
#: 渲染器虚拟实体 id（``virtual.<domain>.<name>``），不入 HA 实体表。
VIRTUAL_ENTITY_ID = re.compile("^virtual\\.[a-z0-9_]+\\.[a-z0-9_]+$")


def valid_ha_entity_id(value: object) -> bool:
    """是否为合法的 HA 实体 id（不接受虚拟 id）。"""
    return bool(ENTITY_ID.fullmatch(str(value or "")))


def valid_entity_id(value: object) -> bool:
    """同时接受 Home Assistant 的 id 与渲染器作用域内的虚拟 id。"""
    return valid_ha_entity_id(value) or bool(VIRTUAL_ENTITY_ID.fullmatch(str(value or "")))


__all__ = [
    "ENTITY_ID",
    "VIRTUAL_ENTITY_ID",
    "valid_entity_id",
    "valid_ha_entity_id",
]
