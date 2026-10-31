"""商店前台 API：``/store/v1/*``。

- ``routes.py``：宿主路由（登录 / 会话 / 导航数据）
- ``auth.py`` ``catalog.py`` ``orders.py`` ``products_cache.py`` ``referrals.py``
- ``shared.py``：会话 cookie、客户解析等共用助手

**不在本文件 eager 导入子模块**：注册顺序由 ``app.py`` 决定。
"""
