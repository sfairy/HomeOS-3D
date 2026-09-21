"""从仪表盘文档里收集它引用到的 Home Assistant 实体 / 场景标识。

用途：实体被删除或重命名时判断哪些仪表盘受影响、同步时只订阅真正用到的实体，
以及户型快照「还有没有人在用」（决定能不能回收磁盘）。
扫描是「按键名猜」的启发式遍历，不依赖文档结构版本，因此前端加字段不用改这里。

这里回答两个**不同**的问题，别混用：

1. **字段收集**（``document_keyed_values`` 一族）：哪些值位于「语义是 ID」的字段里
   （``entityId`` / ``assetId`` / ``sceneId`` 后缀，含复数列表）。用于「允许看到什么」
   「要订阅什么」这类**需要精确边界**的判断 —— 放宽一格就是放宽一格权限。
2. **任意提及**（``document_mentions`` / ``document_mentioned_values``）：整份文档里还有没有
   出现过某个字符串（键名与值都算）。用于「能不能删掉它」这类**宁多认不少认**的判断 ——
   多认一次的结果是少回收一个文件，漏认的结果是删掉别人正在用的东西。
"""
from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

from .action_rules import valid_ha_entity_id


def document_keyed_values(
    value: Any,
    suffix: str,
    keep: Callable[[str], bool] | None = None,
) -> set[str]:
    """收集文档里「键名以 suffix 结尾」的字符串值，以及 suffix 复数形式的字符串列表。

    遍历规则：
    1. 键名以 ``suffix`` 结尾且值是字符串 —— 收下（``keep`` 返回 False 则跳过）；
    2. 键名以 ``suffix`` + ``s`` 结尾且值是列表 —— 逐个收下其中的字符串；
    3. 命中的键不再向下递归，防止把它的值当容器重复扫描；
    4. 其余键继续向下递归。

    大小写不敏感：文档里既有 ``entityId`` 也有 ``EntityId`` 的历史写法。

    参数:
        keep: 可选的过滤器；不传则全部收下。
    """
    found: set[str] = set()
    normalized_suffix = suffix.casefold()
    normalized_plural = f"{normalized_suffix}s"

    def accepts(candidate: Any) -> bool:
        """值是否算一次引用：必须是非空字符串，并满足调用方的过滤条件。"""
        if not isinstance(candidate, str) or not candidate:
            return False
        return keep is None or keep(candidate)

    def walk(item: Any) -> None:
        """递归遍历 dict / list，把命中的值收进外层 found。"""
        if isinstance(item, dict):
            for key, child in item.items():
                normalized_key = str(key).casefold()
                if normalized_key.endswith(normalized_suffix) and accepts(child):
                    found.add(child)
                    continue
                if normalized_key.endswith(normalized_plural) and isinstance(child, list):
                    found.update(entry for entry in child if accepts(entry))
                    continue
                walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)
        return None

    walk(value)
    return found


def document_strings(value: Any) -> Iterator[str]:
    """产出文档里出现过的所有字符串：**键名**与字符串值都算。

    这是「任意提及」两个函数的公共遍历：不猜字段语义，只问「这个字符串在文档里出现过吗」。
    只产字符串，数字/布尔/None 一律跳过 —— 素材与实体标识都是字符串，把 ``0`` / ``True``
    也拿去比较只会带来误判（``True == 1``）。
    """
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(key, str):
                yield key
            yield from document_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from document_strings(child)
    elif isinstance(value, str):
        yield value


def document_mentions(value: Any, predicate: Callable[[str], bool]) -> bool:
    """文档里是否**出现过**满足 predicate 的字符串（键名或值），命中即短路。

    给「能不能删」这类守卫用：判据必须比「字段收集」更宽。例如素材除了写在 ``assetId`` 字段
    里，还可能被自定义字段、文案、历史遗留结构提到；漏认一次就是删掉一个还有人用的文件。
    """
    return any(predicate(text) for text in document_strings(value))


def document_mentioned_values(value: Any, predicate: Callable[[str], bool]) -> set[str]:
    """``document_mentions`` 的收集版本：把所有满足 predicate 的字符串收成集合。"""
    return {text for text in document_strings(value) if predicate(text)}



def document_entity_ids(value: Any) -> set[str]:
    """收集文档中显式或隐式用到的全部 HA 实体 ID。

    遍历规则（按优先级）：
    1. weather 控件即使没写 sun 绑定，也隐式依赖 `sun.sun`，必须补上；
    2. 键名以 `entityId` 结尾的字符串值；
    3. 键名以 `entityIds` 结尾的列表值；
    4. 其余键继续向下递归。

    虚拟实体（`virtual.*`）由渲染器自行维护，不属于 HA，全部剔除；
    值必须是**合法的原生实体 ID**（域 + 点 + 对象 ID，见
    `action_rules.valid_ha_entity_id`）。

    这里过去用的是「含点即算实体」的宽松判据，于是任何带点的字符串 —— 标题、
    说明文案、自定义字段里随手写的文本 —— 都会被当成实体收进这个集合。这个集合
    同时决定了**中控设备能看到哪些实体**与**要订阅哪些状态**：放宽一格就是放宽
    一格可见范围。判据改成与写入端（`panel/schema.py` 的绑定校验）同一把尺子，
    写入时不允许存的 ID，读取时也不该被认成实体。
    """
    result = document_keyed_values(value, "entityId", keep=valid_ha_entity_id)

    def walk_for_implicit_sun(item: Any) -> None:
        """补上天气控件隐式依赖的太阳实体。

        没显式绑定 sun 时按约定用 sun.sun，否则日出日落、昼夜图标会因为漏订阅
        而停在初始值。绑了但绑定值不合法（写坏的自定义字段）时同样退回 sun.sun ——
        这里不能像别的分支那样「不合格式就丢掉」，天气控件必须有个太阳实体可用。
        """
        if isinstance(item, dict):
            if item.get("type") == "weather":
                bound_sun = ((item.get("bindings") or {}).get("sun") or {}).get(
                    "entityId"
                )
                sun_id = (
                    bound_sun
                    if isinstance(bound_sun, str) and valid_ha_entity_id(bound_sun)
                    else "sun.sun"
                )
                result.add(sun_id)
            for child in item.values():
                walk_for_implicit_sun(child)
        elif isinstance(item, list):
            for child in item:
                walk_for_implicit_sun(child)
        return None

    walk_for_implicit_sun(value)
    return result


def document_scene_ids(value: Any) -> set[str]:
    """收集文档引用到的户型快照 sceneId。

    键名以 `sceneId` 结尾（含 `sceneIds` 列表）的值都算引用。这里**不过滤格式**：
    快照回收只看「有没有人引用」，多留一个认不出的字符串最多让一个文件多活一阵，
    而漏认一个引用就会把正在用的户型删掉（看板黑屏），两个方向的代价不对称。
    """
    return document_keyed_values(value, "sceneId")

