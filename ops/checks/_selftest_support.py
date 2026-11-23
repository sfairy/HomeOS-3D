#!/usr/bin/env python3
"""自检脚本的公共骨架（断言计数、仓库根路径、通用假件）。

## 为什么抽出来

9 个业务自检各自抄一遍「把仓库根加进 sys.path / check() / 计数 / 打印」以及同一套
假件（事件总线、冷却、状态仓、分区配置），累计 200+ 行纯样板。更糟的是样板会漂移：
一处 `check` 加了详情截断、另一处没加，输出格式就开始不一致。

这里只放**与业务无关**的东西。任何断言本身仍留在各自的 selftest 里 —— 共享骨架不能
变成「共享预期」，否则改一处会让九个自检一起变绿。
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

#: 仓库根（``ops/checks`` 上两级）。
ROOT = Path(__file__).resolve().parents[2]

#: 已通过的断言名。
CHECKS: list[str] = []


def ensure_repo_on_path() -> None:
    """让 ``homeos.backend.src`` 可导入。"""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))


def check(name: str, condition: bool, detail: str = "") -> None:
    """断言并记录；失败立刻抛出（自检是「全绿或失败」，不做部分通过）。"""
    if not condition:
        raise AssertionError(f"{name} 失败{('：' + detail) if detail else ''}")
    CHECKS.append(name)


def report(title: str) -> None:
    print(f"{title}自检通过：{len(CHECKS)} 项")


class FakeBus:
    """记录 ``emit`` / ``emit_soon`` 的假事件总线。"""

    def __init__(self) -> None:
        self.events: list[tuple[str, Any]] = []

    def on(self, _name: str, _handler: Any) -> None:
        return None

    async def emit(self, name: str, payload: Any = None) -> None:
        self.events.append((name, payload))

    def emit_soon(self, name: str, payload: Any = None) -> None:
        self.events.append((name, payload))

    def names(self) -> list[str]:
        return [name for name, _payload in self.events]

    def first(self, name: str) -> Any:
        return next((payload for event, payload in self.events if event == name), None)


class FakeCooldown:
    """只记键的冷却服务（语义与真实实现一致：写入即视为进入冷却）。"""

    def __init__(self) -> None:
        self.keys: set[tuple[str, str]] = set()

    def is_in_cooldown(self, namespace: str, key: str) -> bool:
        return (namespace, key) in self.keys

    def set_cooldown(self, namespace: str, key: str, _minutes: float) -> None:
        self.keys.add((namespace, key))


class FakeSectionConfig:
    """只有单个分区的假配置（``get(section)``）。"""

    def __init__(self, section: str, values: dict[str, Any]) -> None:
        self._section = section
        self._values = values

    def get(self, section: str) -> dict[str, Any]:
        return self._values if section == self._section else {}


class FakeStore:
    """``get_all`` / ``get`` 的假状态仓。"""

    def __init__(self, entities: dict[str, Any] | list[dict[str, Any]]) -> None:
        if isinstance(entities, dict):
            self._by_id: dict[str, Any] = dict(entities)
        else:
            self._by_id = {str(item.get("entity_id")): item for item in entities}

    def get_all(self) -> list[dict[str, Any]]:
        return list(self._by_id.values())

    def get(self, entity_id: str) -> Any:
        return self._by_id.get(entity_id)


__all__ = [
    "CHECKS",
    "ROOT",
    "FakeBus",
    "FakeCooldown",
    "FakeSectionConfig",
    "FakeStore",
    "check",
    "ensure_repo_on_path",
    "report",
]
