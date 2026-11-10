"""配置变更事件的**唯一**名字。

为什么单独一个模块：``app.config.updated`` 与 ``SYSTEM_CONFIG_UPDATED`` 曾是两套并存的
名字 —— 真正保存设置的是前者（``domains/app_config``），而通道 / 邮件 / 地震 / Agent 配置
热更新的 7 个订阅端却都写着后者（只有「保存布局」会发）。结果是「改了设置不生效，必须重启」。

这里收敛成一个权威名：发布方只发 ``CONFIG_UPDATED``（载荷为变更的 section 列表），
订阅方统一走 :func:`subscribe`。
"""

from __future__ import annotations

from typing import Any

#: 权威事件名：任何「用户改了系统配置」都发这个。
CONFIG_UPDATED = "app.config.updated"


def subscribe(bus: Any, handler: Any) -> None:
    """在总线上订阅配置变更。"""
    bus.on(CONFIG_UPDATED, handler)


__all__ = ["CONFIG_UPDATED", "subscribe"]
