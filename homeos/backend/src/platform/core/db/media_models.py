"""媒体入库记录（MoviePilot 轮询写、通知读）。

``remoteId`` 是 MoviePilot 里媒体记录的主键字符串；``(source, remoteId)`` 唯一，
因此同一批入库被重复轮询到不会产生第二条。``notifiedAt`` 为空表示还没成功通知，
轮询只捞 ``notifiedAt = NULL`` 且到达超过 2 分钟的记录。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_uuid, utc_now


class MediaArrival(Base):
    """一条「媒体已入库」记录。"""

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
