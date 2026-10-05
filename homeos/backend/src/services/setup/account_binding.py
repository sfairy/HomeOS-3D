"""生活账户绑定类别标签 / 底栏账户引用聚合（对齐 ``@homeos/shared/setup/account-binding-categories.util``）。"""

from __future__ import annotations

from typing import Any

#: 生活账户绑定类别 → 简短中文标签映射（电网/燃气/水务/电信/联通）
ACCOUNT_BINDING_SOURCE_LABELS: dict[str, str] = {
    "grid": "电网",
    "gas": "燃气",
    "water": "水务",
    "ct": "电信",
    "cu": "联通",
}

#: 通信运营商账户类别（ct=中国电信、cu=中国联通）
COMM_ACCOUNT_BINDING_CATEGORIES: tuple[str, ...] = ("ct", "cu")

#: 能源与公用事业账户类别（grid=电网、gas=燃气、water=水务）
ENERGY_ACCOUNT_BINDING_CATEGORIES: tuple[str, ...] = ("grid", "gas", "water")


def is_comm_account_binding_category(cat: str) -> bool:
    return cat in COMM_ACCOUNT_BINDING_CATEGORIES


def resolve_account_binding_settings_route(_cat: str) -> str:
    """账户绑定缺口 / 深链 → 生活账户。"""
    return "/settings?tab=life-accounts"


def collect_footer_account_sources(items: list[Any] | None) -> list[str]:
    """底栏中启用且使用账户绑定的 source 集合。"""
    result: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        if (
            item.get("enabled")
            and item.get("kind") != "entity"
            and str(item.get("primaryField") or "").strip()
            and item.get("source")
        ):
            source = str(item["source"])
            if source not in seen:
                seen.add(source)
                result.append(source)
    return result


def collect_required_account_binding_categories(items: list[Any] | None) -> list[str]:
    """完整性检查：能源 Widget 默认电网 + 底栏引用的账户类别。"""
    ordered = ["grid"]
    for src in collect_footer_account_sources(items):
        if src not in ordered:
            ordered.append(src)
    return ordered


def format_account_binding_label(cat: str) -> str:
    return ACCOUNT_BINDING_SOURCE_LABELS.get(cat, cat)


__all__ = [
    "ACCOUNT_BINDING_SOURCE_LABELS",
    "COMM_ACCOUNT_BINDING_CATEGORIES",
    "ENERGY_ACCOUNT_BINDING_CATEGORIES",
    "collect_footer_account_sources",
    "collect_required_account_binding_categories",
    "format_account_binding_label",
    "is_comm_account_binding_category",
    "resolve_account_binding_settings_route",
]
