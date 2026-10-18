"""Studio 3D 数据面：草稿、删除级联清理与导出包。

从 api.studio3d 单文件拆出的领域层（C1）：
- draft_repository：studio_drafts 单行表的 CAS 读写与旧单文件只读回退；
- service：GET/PUT 草稿的业务编排（乐观并发、级联清理确认）；
- cleanup：删除 3D 物件后对项目交互配置的级联摘除（自 interaction3d 迁入）；
- export_service：导出包的校验、落盘、引用扫描与删除。
"""

from __future__ import annotations

__all__ = ['cleanup', 'draft_repository', 'export_service', 'service']
