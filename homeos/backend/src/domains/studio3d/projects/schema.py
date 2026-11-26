"""3D Studio 数据面的 ORM 表：项目 / 草稿 / 全局弹窗 / 交互同步。

## 为什么在域包里

这些表原先定义在 ``platform/core/db/models.py``（942 行、41 个类）。``platform`` 是架构
检查（B1）里的**叶子层**：它不能 import 上层包，因此当 ``platform/security`` 需要读
``project_drafts`` 时，只能把这些表也一起放在 platform 里 —— 那是「平台层认识业务表」
的根源。现在表定义跟着业务走，元数据装配由组合根 ``src/db_models.py`` 负责。

## 表名与列名一律保持 snake_case

表名与列名与 ``homeos-3d`` 一致：移植来的 ``ha/**``、``panel/**``、
``modules/interaction3d/**`` 与 ``api/{projects,studio3d,assets,...}.py`` 直接按属性名
访问，无需改写；同时便于一次性导入 ``homeos-3d`` 的 app.db 数据。
注意：``User`` / ``LoginSession`` / ``LicenseState`` 与 homeos-3d 同名但沿用 homeos
既有表，因此这里的 FK 指向的是 homeos 的 ``users``。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ....platform.core.db.database import Base
from ....platform.core.db.models import new_uuid, utc_now


# 3D Studio 数据面（项目 / HA 目录 / 全局弹窗）
#
# 表名与列名一律保持 homeos-3d 的 snake_case：移植来的 ha/**、panel/**、
# modules/interaction3d/** 与 api/{projects,studio3d,assets,...}.py 直接按属性名访问，
# 无需改写；同时便于一次性导入 homeos-3d 的 app.db 数据。
# 注意：`User` / `LoginSession` / `LicenseState` 与 homeos-3d 同名但沿用 homeos 既有表，
# 因此这里的 FK 指向的是 homeos 的 `users`。
class Project(Base):
    """Studio 项目（一个项目对应一套可编辑 / 可展示的 3D 仪表盘）。"""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProjectDraft(Base):
    """项目草稿（Studio 文档 JSON + 修订号），一行一项目。"""

    __tablename__ = "project_drafts"

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProjectDraftEntityRef(Base):
    """草稿引用的 HA 实体（派生表）。

    为什么把它抽出来：``_load_persistent_entity_ids`` 原先要读**所有**草稿的
    ``document_json``（单份 30–90KB）并逐份 ``json.loads`` + 递归遍历，而触发点包括
    每次草稿保存、删除仪表盘、HA 全量同步 —— 一次保存就扫全表。把「文档里出现了哪些
    实体」物化成索引表后，同一次调用变成一条 ``SELECT DISTINCT entity_id``。

    维护口径：与草稿文档**同事务**写入（见 ``api/projects._replace_draft_entity_refs``），
    因此不存在「文档更新了、索引还是旧的」的窗口。``document_json`` 仍是唯一真源，
    本表可随时由它整体重建（迁移 9 的回填就是这么做的）。
    """

    __tablename__ = "project_draft_entity_refs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("project_drafts.project_id", ondelete="CASCADE"), primary_key=True
    )
    entity_id: Mapped[str] = mapped_column(String(255), primary_key=True, index=True)


class StudioInteractionSync(Base):
    """Studio ↔ interaction3d 的同步文档（单例行，``id`` 恒为 1）。"""

    __tablename__ = "studio_interaction_sync"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")


class StudioDraft(Base):
    """3D 户型图工作台草稿（单例行，id 恒为 1；全局一份 + 每项目快照）。"""

    __tablename__ = "studio_drafts"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_studio_drafts_singleton"),
        CheckConstraint("json_valid(scene_json)", name="ck_studio_drafts_scene_json"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    scene_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    updated_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class GlobalCustomPopupState(Base):
    """全局自定义弹窗（单例行，``id`` 恒为 1）。"""

    __tablename__ = "global_custom_popup_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    popups_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    updated_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
