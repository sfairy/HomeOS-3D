"""Home Assistant 入口子包。

- ``routes.py``：``/api/v1/ha/*`` 主路由（含状态流 WebSocket 的 runtime 订阅）
- ``proxy.py``：媒体代理与短时许可观看者（``/api/v1/ha/proxy/*``）
- ``webrtc.py``：WebRTC 摄像头信令（``/api/v1/ha/webrtc/*``）

三者同属 HA 入口面，收成一个包以便与 ``domains/ha/`` 的集成层对照阅读。
**刻意不在本文件 eager 导入子模块**：``api.*`` 的导入顺序由
``bootstrap/router_registry.py`` 统一决定，包 ``__init__`` 再导入一次会让
「谁先被加载」出现第二个答案（历史上 ``notification ↔ earthquake`` 正是这样出环）。
"""
