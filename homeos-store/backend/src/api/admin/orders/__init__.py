"""运营后台的 orders 资源组。

原先这里是单个 1,020 行的 ``orders.py``：列表、人工补记、履约、复核、退款（含渠道
幂等与记账冲突处理）、取消、删除全挤在一个模块里。退款那段尤其危险 ——
「渠道已退款但本地记账抢单失败」这类分支必须能被单独读完整，混在 1,000 行里
没人会去读它。按**职责**切成包，路由路径与鉴权类型零变化：

- ``listing.py``：只读（订单列表、退款流水）
- ``settlement.py``：钱已到账侧（mark-paid / settle-offline / fulfill / review）
- ``refund.py``：退款全流程（计划 → 占位流水 → 渠道调用 → 记账 → 终态 → 审计）
- ``mutations.py``：取消与删除

``router`` 的聚合顺序与原文件一致（``/orders`` 先于 ``/orders/{order_no}/refunds``），
``admin/routes.py`` 仍然只 ``include_router(orders.router)``，无需改动。
"""

from __future__ import annotations

from fastapi import APIRouter

from . import listing, mutations, refund, settlement

router = APIRouter()

router.include_router(listing.router)
router.include_router(settlement.router)
router.include_router(refund.router)
router.include_router(mutations.router)

__all__ = ["router"]
