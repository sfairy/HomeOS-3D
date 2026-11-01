"""配置变更事件的**唯一**名字。

为什么单独一个模块：``app.config.updated`` 与 ``SYSTEM_CONFIG_UPDATED`` 曾是两套并存的
名字 —— 真正保存设置的是前者（``domains/app_config``），而通道 / 邮件 / 地震 / Agent 配置
热更新的 7 个订阅端却都写着后者（只有「保存布局」会发）。结果是「改了设置不生效，必须重启」。

这里收敛成一个权威名 + 一个兼容别名：

- 发布方只发 ``CONFIG_UPDATED``；
- 订阅方统一走 :func:`subscribe`（同时挂别名，兼容仍在发旧名的 ``ui_config``）。
"""

from __future__ import annotations

from typing import Any

#: 权威事件名：任何「用户改了系统配置」都发这个。
CONFIG_UPDATED = "app.config.updated"

#: 兼容别名：``domains/ui_config`` 保存布局时仍会发；等它切到权威名后可删除。
LEGACY_CONFIG_UPDATED = "SYSTEM_CONFIG_UPDATED"


def subscribe(bus: Any, handler: Any) -> None:
    """在总线上订阅配置变更（权威名 + 兼容别名，两个都挂）。

    两个名字挂同一个 handler 是刻意的：``LocalEventBus`` 按名字分发，漏挂哪个都会
    让热更新在某些路径下静默失效 —— 而这正是本模块要修的问题。
    """
    bus.on(CONFIG_UPDATED, handler)
    bus.on(LEGACY_CONFIG_UPDATED, handler)


__all__ = ["CONFIG_UPDATED", "LEGACY_CONFIG_UPDATED", "subscribe"]
