"""反代与转发子包。

- ``command_proxy.py``：HA 服务调用透传
- ``embed_proxy.py``：内嵌网页反代
- ``moviepilot_proxy.py``：MoviePilot 反代
- ``ws_proxy.py``：WebSocket 双向桥接
- ``go2rtc.py``：go2rtc 目标解析与鉴权

它们都是「把请求转给别的进程」的路由层，业务逻辑在 ``domains/proxy/``。
**刻意不在本文件 eager 导入子模块**（理由同 ``api/ha/__init__.py``）。
"""
