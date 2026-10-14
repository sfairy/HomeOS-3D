"""门禁自检的公共骨架：**断言登记 + 异常用例 + 收尾口径**。

为什么要有这一层
----------------
`ops/check/*_selftest.py` 每份都自带一套同样的骨架：
`failures` 清单、`checked` 计数、一个把异常收成失败项的 `run(name, fn)`、
以及最后那段「有几条失败就打印几条、返回 1 / 否则打印通过数」的收尾。
八个自检各写一遍的结果是：**收尾口径会各自漂移**（有的写 `N 项断言`、有的写 `N 项`、
有的只打用例数不打断言数），而这段代码是纯粹的记账，没有任何一份是「因为语义不同才这么写」的。

拆出去以后各文件只留**真正属于它自己的东西**：夹具构造、注入手法、判据片段。
断言数量与用例集合一行不动 —— 本层不改判定逻辑，只统一记账与打印。

三条登记方式覆盖了全仓既有用法（迁移时各文件自取所需，调用点不用改）：

- :meth:`check` / :meth:`expect`：断言一个布尔条件；
- :meth:`case`：跑一个会 `raise` 的用例体（「门禁没拦住」= 抛出），异常收成一条失败，
  **不许把整轮炸掉** —— 否则第一个坏用例之后的用例结果全看不见。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


class Selftest:
    """一份自检的记账器。

    ``title`` 用于收尾行（如 ``端口一致性门禁自检`` → ``✓ 端口一致性门禁自检通过（19 项断言）``）；
    ``note`` 是可选的补充说明，原样缀在收尾行后面（用来保留各文件原先在通过行里带的覆盖面清单）。
    """

    def __init__(self, title: str, *, note: str = "") -> None:
        self.title = title
        self.note = note
        self.failures: list[str] = []
        self.checked = 0

    def check(self, label: str, condition: bool, detail: str = "") -> bool:
        """登记一项断言；``condition`` 为假时把 ``label``（可带 ``detail``）记成失败。"""
        self.checked += 1
        if not condition:
            self.failures.append(f"{label}（{detail}）" if detail else label)
        return bool(condition)

    def expect(self, condition: bool, message: str, detail: str = "") -> bool:
        """``check`` 的参数顺序变体（``expect(条件, 说明)``）—— 早期自检的写法。"""
        return self.check(message, condition, detail)

    def fail(self, message: str) -> None:
        """直接记一条失败（用例自己已经算过账、只想报告的情况）。"""
        self.checked += 1
        self.failures.append(message)

    def case(self, name: str, fn: Callable[..., Any], *args: Any) -> None:
        """跑一个用例体并逐条打印结果；异常收成一条失败，不中断这一轮。

        这里刻意捕获 ``Exception``：自检的用例体既会用 `raise AssertionError` 表示
        「门禁没拦住」，也可能因为夹具本身的问题抛别的类型 —— 两者都该记成失败，
        而不是让整轮在第一个用例就停住（本仓未启用 BLE001，故不需要 noqa）。
        """
        self.checked += 1
        try:
            fn(*args)
        except Exception as error:
            detail = f"{type(error).__name__}: {error}"
            self.failures.append(f"{name} —— {detail}")
            print(f"  FAIL {name} —— {detail}")
        else:
            print(f"  OK   {name}")

    def bump(self) -> None:
        """补记一次通过。

        给「用例自己已判定、只是需要计数」的写法用：个别自检刻意把 `AssertionError`
        （= 判据没拦住）与意外异常（= 自检自身炸了）分开报，这条策略属于那个文件而不是记账层，
        于是它保留自己的 ``check(name, fn)``，只把计数与收尾交给这里。
        """
        self.checked += 1

    def report(self) -> int:
        """统一收尾：有失败打印清单并返回 1，否则打印通过项数并返回 0。"""
        if self.failures:
            print(f"\n✗ {self.title}失败：{len(self.failures)}/{self.checked} 项")
            for item in self.failures:
                print(f"  - {item}")
            return 1
        print(f"\n✓ {self.title}通过（{self.checked} 项断言）{self.note}")
        return 0
