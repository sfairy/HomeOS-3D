"""进程内滑动窗口限流（真源见 ``homeos_shared.rate_limit``）。

本模块只做一层薄转发，保留 ``from ..security.limiter import SlidingWindowLimiter`` 这个既有
导入路径：调用点分布在 ``api/license.py``、``api/alipay.py``、``api/store.py``、
``api/store_shared.py``、``security/setup_guard.py`` 等处，逐个改导入路径只会制造噪音，
而实现本身必须与主应用共用一份（限流器是安全组件，两份副本会分叉）。

``__all__`` 里列出 ``SlidingWindowLimiter`` 是必需的：否则 ruff 会把这条转发当未使用导入删掉。
"""
from __future__ import annotations

from homeos_shared.rate_limit import SlidingWindowLimiter

__all__ = ["SlidingWindowLimiter"]
