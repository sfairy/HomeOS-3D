"""从仪表盘文档里收集它引用到的 Home Assistant 实体 / 场景标识。
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
    """
    return any(predicate(text) for text in document_strings(value))


def document_mentioned_values(value: Any, predicate: Callable[[str], bool]) -> set[str]:
    """``document_mentions`` 的收集版本：把所有满足 predicate 的字符串收成集合。"""
    return {text for text in document_strings(value) if predicate(text)}



def document_entity_ids(value: Any) -> set[str]:
    """收集文档中显式或隐式用到的全部 HA 实体 ID。
    """
    result = document_keyed_values(value, "entityId", keep=valid_ha_entity_id)

    def walk_for_implicit_sun(item: Any) -> None:
        """补上天气控件隐式依赖的太阳实体。
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
    """
    return document_keyed_values(value, "sceneId")

