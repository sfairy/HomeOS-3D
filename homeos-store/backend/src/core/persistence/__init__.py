"""持久化底座：引擎/会话、建库与迁移、DDL 结构定义。

- ``database.py``：引擎、会话工厂、``Database`` 依赖
- ``migrations.py``：启动期增量迁移
- ``schema.py``：表结构 DDL / 索引定义

ORM 模型仍在 ``core/models.py``（被几乎所有模块 import，单独一层反而增加噪声）。
**不在本文件 eager 导入子模块**：导入顺序由 ``core/bootstrap.py`` 决定。
"""
