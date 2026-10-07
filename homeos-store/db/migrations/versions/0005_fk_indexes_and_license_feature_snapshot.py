"""FK 索引 + 授权功能码快照。

- 为高频外键补索引（referred_by / order license 引用 / entitlement 商品与订单）。
- ``licenses.feature_codes_json``：签发时固化商品功能码，心跳不再跟随商品 PATCH 改写已售能力。

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.create_index(
            op.f("ix_accounts_referred_by_account_id"),
            ["referred_by_account_id"],
            unique=False,
        )
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.create_index(op.f("ix_orders_target_license_id"), ["target_license_id"], unique=False)
        batch_op.create_index(op.f("ix_orders_license_id"), ["license_id"], unique=False)
    with op.batch_alter_table("entitlements", schema=None) as batch_op:
        batch_op.create_index(op.f("ix_entitlements_product_id"), ["product_id"], unique=False)
        batch_op.create_index(op.f("ix_entitlements_source_order_id"), ["source_order_id"], unique=False)
    with op.batch_alter_table("licenses", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("feature_codes_json", sa.Text(), nullable=False, server_default="[]")
        )
    with op.batch_alter_table("device_release_events", schema=None) as batch_op:
        batch_op.create_index(
            op.f("ix_device_release_events_account_id"),
            ["account_id"],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("device_release_events", schema=None) as batch_op:
        batch_op.drop_index(op.f("ix_device_release_events_account_id"))
    with op.batch_alter_table("licenses", schema=None) as batch_op:
        batch_op.drop_column("feature_codes_json")
    with op.batch_alter_table("entitlements", schema=None) as batch_op:
        batch_op.drop_index(op.f("ix_entitlements_source_order_id"))
        batch_op.drop_index(op.f("ix_entitlements_product_id"))
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_index(op.f("ix_orders_license_id"))
        batch_op.drop_index(op.f("ix_orders_target_license_id"))
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_index(op.f("ix_accounts_referred_by_account_id"))
