"""restore homeos-3d auth shape (drop homeos multi-user tables)

认证机制收敛到 homeos-3d 后，homeos 方言的多用户体系整体下线：

- ``users`` 恢复 3D 形状：新增 ``isActive`` / ``authExternalized``；
  移除仅服务 homeos MFA / 失败锁定机制的 ``failedLoginAttempts`` / ``lockedUntil``
  / ``totpSecret`` / ``totpEnabled``。
  （``preferences`` 与 ``tokenVersion`` **保留**：前者仍被通知设置、MCP、通道与备份
  服务消费，后者仍被用户备份与通知缓存失效逻辑消费。）
- 删除访客登录邀请码 ``guest_share_codes``、登录审计 ``login_audits``、
  设备指令审计 ``command_audits``、门锁访客临时密码 ``guest_passes``、
  儿童模式运行时 ``child_mode_runtime``。

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-06 14:30:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ---- users：恢复 3D 形状 ----
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("isActive", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column(
                "authExternalized", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )
        batch_op.drop_column("failedLoginAttempts")
        batch_op.drop_column("lockedUntil")
        batch_op.drop_column("totpSecret")
        batch_op.drop_column("totpEnabled")

    # ---- 下线 homeos 方言的表 ----
    # login_audits / command_audits 有 users 外键；guest_passes / guest_share_codes /
    # child_mode_runtime 自包含。直接 drop 即可，SQLite 会随表删除其索引。
    op.drop_table("login_audits")
    op.drop_table("command_audits")
    op.drop_table("guest_share_codes")
    op.drop_table("guest_passes")
    op.drop_table("child_mode_runtime")


def downgrade() -> None:
    # ---- 重建被删除的表 ----
    op.create_table(
        "child_mode_runtime",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("mediaUsedMin", sa.Float(), nullable=False),
        sa.Column("usageDate", sa.String(length=16), nullable=False),
        sa.Column("overrideUntil", sa.Integer(), nullable=False),
        sa.Column("updatedAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "guest_passes",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("lockEntityId", sa.String(length=255), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("codeCipher", sa.Text(), nullable=False),
        sa.Column("codeIv", sa.Text(), nullable=False),
        sa.Column("codeTag", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("updatedAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("guest_passes", schema=None) as batch_op:
        batch_op.create_index(
            "guest_passes_active_expiresAt_idx", ["active", "expiresAt"], unique=False
        )
        batch_op.create_index("guest_passes_lockEntityId_idx", ["lockEntityId"], unique=False)

    op.create_table(
        "guest_share_codes",
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("code"),
    )
    with op.batch_alter_table("guest_share_codes", schema=None) as batch_op:
        batch_op.create_index("guest_share_codes_expiresAt_idx", ["expiresAt"], unique=False)

    op.create_table(
        "login_audits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("userId", sa.String(length=36), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("login_audits", schema=None) as batch_op:
        batch_op.create_index("login_audits_createdAt_idx", ["createdAt"], unique=False)
        batch_op.create_index("login_audits_username_idx", ["username"], unique=False)

    op.create_table(
        "command_audits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("userId", sa.String(length=36), nullable=True),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=True),
        sa.Column("domain", sa.String(length=64), nullable=False),
        sa.Column("service", sa.String(length=64), nullable=False),
        sa.Column("entityId", sa.String(length=255), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("command_audits", schema=None) as batch_op:
        batch_op.create_index("command_audits_createdAt_idx", ["createdAt"], unique=False)
        batch_op.create_index("command_audits_entityId_idx", ["entityId"], unique=False)
        batch_op.create_index("command_audits_userId_idx", ["userId"], unique=False)
        batch_op.create_index(
            "command_audits_username_createdAt_idx", ["username", "createdAt"], unique=False
        )

    # ---- users：恢复 homeos 方言列 ----
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("failedLoginAttempts", sa.Integer(), nullable=False, server_default="0")
        )
        batch_op.add_column(sa.Column("lockedUntil", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("totpSecret", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column("totpEnabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.drop_column("authExternalized")
        batch_op.drop_column("isActive")
