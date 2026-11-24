"""媒体域的 ORM 表（第一个「域拥有自己的表定义」的样板）。

## 为什么它在域包里而不是 ``platform/core/db``

`platform` 是架构检查（B1）里的**叶子层**：它不能 import 任何上层包。把所有域的表都
堆在 ``platform/core/db/models.py`` 里，等于让叶子层同时承担「引擎 / 会话 / 建表工具」和
「三十个域的数据形状」两种职责 —— 后果是任何域想改自己的表，都要动 platform 里的一个
942 行文件。

本模块是这条路的第一块砖：表定义住在它所属的域里，元数据装配由
``src/db_models.py``（组合根）负责。迁移过程是机械的，一次搬一个模块，每次都用
「metadata 表清单与搬迁前逐项相同」来验证（见提交说明）。

## 兼容性

`MediaArrival` 原先从 ``platform.core.db.media_models`` 导入。全仓只有一个消费方
（``domains/media/service.py``），已同步改为从本模块导入；旧模块已删除。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ...platform.core.db.database import Base
from ...platform.core.db.models import new_uuid, utc_now


class MediaArrival(Base):
    """一条「媒体已入库」记录。

    ``remoteId`` 是 MoviePilot 里媒体记录的主键字符串；``(source, remoteId)`` 唯一，
    因此同一批入库被重复轮询到不会产生第二条。``notifiedAt`` 为空表示还没成功通知，
    轮询只捞 ``notifiedAt = NULL`` 且到达超过 2 分钟的记录。
    """

    __tablename__ = "media_arrivals"
    __table_args__ = (
        UniqueConstraint("source", "remoteId", name="media_arrivals_source_remote"),
        Index("media_arrivals_notifiedAt_idx", "notifiedAt"),
        Index("media_arrivals_arrivedAt_idx", "arrivedAt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="moviepilot")
    remote_id: Mapped[str] = mapped_column("remoteId", String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    season: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tmdb_id: Mapped[str | None] = mapped_column("tmdbId", String(64), nullable=True)
    poster_url: Mapped[str | None] = mapped_column("posterUrl", Text, nullable=True)
    arrived_at: Mapped[datetime] = mapped_column("arrivedAt", DateTime, nullable=False, default=utc_now)
    notified_at: Mapped[datetime | None] = mapped_column("notifiedAt", DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, nullable=False, default=utc_now)


__all__ = ["MediaArrival"]
