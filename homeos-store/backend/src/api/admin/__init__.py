"""运营后台 API：``/store-admin/v1/*``。

- ``routes.py``：宿主路由（overview / maintenance / 订单状态元数据 / 授权补丁），
  并按既定顺序 ``include_router`` 各子面板路由
- 子面板：``accounts`` ``bindings`` ``compliance`` ``coupons`` ``entitlements``
  ``licenses`` ``ops`` ``orders`` ``products`` ``settings`` ``withdrawals``
- ``shared.py``：子面板共用的鉴权/查询助手
- ``appearance.py``：站点配色（与后台同前缀，但在 ``app.py`` 独立注册）

**不在本文件 eager 导入子模块**：注册顺序由 ``app.py`` 与 ``routes.py`` 单点决定。
"""
