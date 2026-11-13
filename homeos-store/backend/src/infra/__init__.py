"""进程内基础设施：邮件投递、网络探测、事故计数。

为什么单列一层
--------------
这四个模块原先住在 ``ops``（后台运营装配），但它们的消费者是 ``commerce``（发货通知）
与 ``payments``（退款/对账告警），而 ``ops`` 又依赖 ``payments`` —— 三方互为包级环，
``check_backend_deps`` 曾用白名单冻结。它们是**与业务无关的下沉能力**（发一封信、
连一次 SMTP、记一条告警计数），只依赖 ``core`` 与标准库，因此单列一层最贴合职责。

依赖方向：``infra → core``，被 ``commerce`` / ``payments`` / ``licensing`` / ``api`` 使用。
``ops`` 下的同名模块已退化为门面，旧导入路径继续可用。
"""

from __future__ import annotations

__all__: list[str] = []
