"""实体 ID 的合法性规则，以及控件动作用到的少量口径常量。

口径只在这里写一份：校验层（`schema.py`）与运行期都从这里取，避免同一规则写两份。
本模块不依赖 pydantic，也不碰数据库，因此可以被任意层安全导入。

**不要再往这里加动作判定**：动作类型与弹窗来源的校验由 `schema.py` 的 pydantic
`Literal` 承担。同名逻辑的 **JS 版仍在用**
（`frontend/static/shared/action-rules.js` 被 `editor/home.js` 引用），这是两侧的漂移，记在 B43。
"""
from __future__ import annotations

import re

# Home Assistant 原生实体 ID：域 + 点 + 对象 ID，两段都只允许小写字母、数字与下划线，**两段各限 200**
# （与 interaction3d/config.py 的实体校验同一个数）。没有上限时 `"a" * 一千万 + ".b"` 这种「合法实体 ID」
# 会被静默收进可见范围、订阅集与日志；只限对象 ID 那一段时，域那一段仍可以无限长。
ENTITY_ID = re.compile(r"^[a-z0-9_]{1,200}\.[a-z0-9_]{1,200}$")
# 渲染器自造的虚拟实体：在原生格式前多一段固定的 virtual 前缀，
# 例如 virtual.light.abc，用于把同一个 HA 实体在不同页面作用域下区分开。
VIRTUAL_ENTITY_ID = re.compile(r"^virtual\.[a-z0-9_]{1,200}\.[a-z0-9_]{1,200}$")

# more-info 弹窗的三种来源：custom 打开组合弹窗，entity 打开指定实体的原生弹窗，
# current 打开控件自身绑定实体的弹窗。`schema.py` 校验 popupSource 时用它。
POPUP_SOURCES = frozenset({"custom", "entity", "current"})
# 这些域下的实体「开关」语义成立，才允许把 toggle 动作挂上去；
# 列表之外的域（例如 sensor、camera）只能做 more-info 或跳转。
TOGGLE_ENTITY_DOMAINS = frozenset(
    {
        "fan",
        "cover",
        "light",
        "button",
        "remote",
        "script",
        "switch",
        "climate",
        "automation",
        "media_player",
        "water_heater",
        "input_boolean",
    }
)


def valid_ha_entity_id(value: str) -> bool:
    """判断是否为 Home Assistant 原生实体 ID（不接受虚拟实体）。"""
    return bool(ENTITY_ID.fullmatch(value))


def valid_entity_id(value: str) -> bool:
    """判断是否为合法实体 ID：Home Assistant 原生 ID 或渲染器的作用域虚拟 ID。"""
    return valid_ha_entity_id(value) or bool(VIRTUAL_ENTITY_ID.fullmatch(value))
