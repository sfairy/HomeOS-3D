"""数据保留域（对齐 ``common/database/retention.*``）。"""

from __future__ import annotations

from .service import RETENTION_STATS_STORAGE_ID, DatabaseRetentionService

__all__ = ["RETENTION_STATS_STORAGE_ID", "DatabaseRetentionService"]
