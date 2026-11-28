#!/usr/bin/env python3
"""房间内实体顺序自检：设置页保存的顺序必须在设备列表里真的生效。

## 为什么需要它

后端 ``_apply_entity_order`` 曾经写成「只要带了 ``sort`` 就整体跳过本地顺序」，
而设备页的默认排序 ``name-asc`` 又总是被映射成 ``sort=name_asc`` 上送 ——
两边合起来让设置页的「上移 / 下移」保存成功却毫无效果，且没有任何报错。

本自检钉住三条口径：

1. ``name_asc``（前端默认值）与空值都必须应用本地顺序；
2. ``name_desc`` / ``status`` / ``last_changed`` 是显式排序意图，本地顺序必须让位；
3. 没有覆盖记录的实体保持原有相对顺序，排在已排序实体之后（稳定排序）。
"""

from __future__ import annotations

from _selftest_support import check, ensure_repo_on_path, report

ensure_repo_on_path()

from homeos.backend.src.api.entities import (
    entity_order_override_applies,
    sort_entities_by_local_order,
)

ENTITIES = [
    {"entity_id": "light.b"},
    {"entity_id": "light.a"},
    {"entity_id": "light.c"},
]
ORDER = {"light.a": 0, "light.b": 1}


def ids(items: list[dict]) -> list[str]:
    return [str(item["entity_id"]) for item in items]


def test_default_sort_applies_local_order() -> None:
    """前端默认 `name-asc` → 空 sort；空 sort 与 `name_asc` 都应用本地顺序。"""
    check("空 sort 应用本地顺序", entity_order_override_applies(None) is True)
    check("空字符串应用本地顺序", entity_order_override_applies("") is True)
    check("name_asc 应用本地顺序", entity_order_override_applies("name_asc") is True)
    check("kebab 形态 name-asc 也应用本地顺序", entity_order_override_applies("name-asc") is True)
    check(
        "本地顺序重排结果正确",
        ids(sort_entities_by_local_order(ENTITIES, ORDER)) == ["light.a", "light.b", "light.c"],
        str(ids(sort_entities_by_local_order(ENTITIES, ORDER))),
    )


def test_explicit_sorts_win() -> None:
    for value in ("name_desc", "status", "last_changed"):
        check(f"显式排序 {value} 让位", entity_order_override_applies(value) is False)
    check("kebab 形态 name-desc 也让位", entity_order_override_applies("name-desc") is False)


def test_unlisted_entities_keep_relative_order() -> None:
    """没有覆盖记录的实体保持原相对顺序，排在已排序实体之后。"""
    result = ids(sort_entities_by_local_order(ENTITIES, {"light.b": 0}))
    check("已排序在前", result[0] == "light.b", str(result))
    check("未排序列保持原相对顺序", result[1:] == ["light.a", "light.c"], str(result))


def test_empty_order_is_noop() -> None:
    check("空顺序表不改变输入", sort_entities_by_local_order(ENTITIES, {}) is ENTITIES)


def main() -> int:
    test_default_sort_applies_local_order()
    test_explicit_sorts_win()
    test_unlisted_entities_keep_relative_order()
    test_empty_order_is_noop()
    report("房间内实体顺序")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
