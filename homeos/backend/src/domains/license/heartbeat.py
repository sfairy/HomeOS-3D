"""授权心跳间隔的计算（纯函数，不依赖服务实例）。

为什么单独成模块
----------------
心跳间隔直接决定「多久打一次商店」：算小了把商店打爆，算大了到期/吊销状态延迟生效。
它此前混在 1600 行的 ``service.py`` 里，靠人工读代码判断边界；抽出来之后
畸形输入的回退口径集中在这一个文件里。
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("homeos.license.service")

#: 心跳间隔下限（秒）：商店下发的 heartbeatIn 再小也不能低于这个值，否则会把商店打爆。
#: 允许用 HOMEOS_LICENSE_HEARTBEAT_SECONDS 覆盖（现场排障时想更频繁地拉状态）。
DEFAULT_MIN_HEARTBEAT_SECONDS = 30


def min_heartbeat_seconds() -> int:
    """心跳间隔下限（秒）：环境变量优先，缺失或非法值回落到 30，且至少 1 秒。"""
    raw = os.getenv("HOMEOS_LICENSE_HEARTBEAT_SECONDS")
    if not raw:
        return DEFAULT_MIN_HEARTBEAT_SECONDS
    try:
        value = int(raw)
    except (TypeError, ValueError):  # fmt: skip
        # 写错的值不阻断启动：回落到默认下限即可，但要留痕（现场排障时常在这一行）。
        logger.warning(
            "HOMEOS_LICENSE_HEARTBEAT_SECONDS 不是整数，按 %s 秒处理: %r", DEFAULT_MIN_HEARTBEAT_SECONDS, raw
        )
        return DEFAULT_MIN_HEARTBEAT_SECONDS
    return max(1, value)


def heartbeat_seconds(raw: Any, default: int = 300) -> int:
    """商店返回的心跳间隔（秒）。

    ``heartbeatIn`` 是远端 JSON 字段：``None`` / ``"5m"`` / 列表都会让裸 ``int()`` 抛
    ``TypeError``/``ValueError``，而这条路径上调用方只捕获 ``LicenseClientError`` ——
    一次畸形响应就会把「已写入的激活状态」留在库里、却给用户一个 500。
    """
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return default
    try:
        value = int(float(raw))
    except (TypeError, ValueError):  # fmt: skip
        logger.warning("商店返回的 heartbeatIn 非法，按默认 %s 秒处理: %r", default, raw)
        return default
    return value if value > 0 else default
