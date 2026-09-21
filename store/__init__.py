"""HomeOS 授权商店与授权服务器（独立服务，默认端口 18082）。"""

from __future__ import annotations

__all__ = ["__version__"]

#: **服务端口线版本**，随端口号走（18082），进 ``/healthz`` 与 OpenAPI 的 ``version``。
#: 它与「产品版本」``store.ops.release_info.CURRENT_VERSION``（进 ``releases`` 表与更新接口）
#: 是两件不同的事：前者用来区分接口代际，后者是给客户端比对升级用的版本号。
#: 两者同名容易在运维排查时被当成同一个数字，看到两个不一样的「version」时先看这一行。
__version__ = "18082.1"
