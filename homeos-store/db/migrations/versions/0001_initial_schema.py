"""商店结构基线：与当前 ORM 元数据完全一致的全新库结构。

本文件由 ``alembic revision --autogenerate`` 对着**空库**生成，不是对着某个存量库
生成的增量差异 —— 因此它精确等于 ``Base.metadata``。

**老库不能直升**：这里只声明 ``0001``，库内记录着 ``0002`` 及更早 revision 时 Alembic 会直接
报错；``downgrade()`` 也不可逆（降级等于删掉全部业务表），回退请用迁移前自动生成的
``store.db.pre-migrate-*.bak`` 快照。

Revision ID: 0001
Revises:
Create Date: 2026-09-28

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('accounts',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('password_hash', sa.String(length=512), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(), nullable=True),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.Column('referral_code', sa.String(length=16), nullable=True),
    sa.Column('referred_by_account_id', sa.String(length=36), nullable=True),
    sa.Column('referral_bound_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['referred_by_account_id'], ['accounts.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_accounts_email'), 'accounts', ['email'], unique=True)
    op.create_index(op.f('ix_accounts_referral_code'), 'accounts', ['referral_code'], unique=True)
    op.create_table('audit_logs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('actor', sa.String(length=255), nullable=False),
    sa.Column('action', sa.String(length=64), nullable=False),
    sa.Column('target', sa.String(length=255), nullable=False),
    sa.Column('detail', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_table('coupons',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=64), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=False),
    sa.Column('discount_type', sa.String(length=16), nullable=False),
    sa.Column('percent', sa.Float(), nullable=False),
    sa.Column('amount_cents', sa.Integer(), nullable=False),
    sa.Column('min_amount_cents', sa.Integer(), nullable=False),
    sa.Column('max_redemptions', sa.Integer(), nullable=True),
    sa.Column('redeemed_count', sa.Integer(), nullable=False),
    sa.Column('per_account_limit', sa.Integer(), nullable=False),
    sa.Column('applicable_product_ids_json', sa.Text(), nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=True),
    sa.Column('expires_at', sa.DateTime(), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_coupons_code'), 'coupons', ['code'], unique=True)
    op.create_table('email_verifications',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('code_salt', sa.String(length=32), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('consumed_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('delivered', sa.Boolean(), nullable=True),
    sa.Column('delivery_mode', sa.String(length=16), nullable=False),
    sa.Column('delivery_error', sa.String(length=255), nullable=False),
    sa.Column('delivery_attempts', sa.Integer(), nullable=False),
    sa.Column('delivered_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_email_verifications_email'), 'email_verifications', ['email'], unique=False)
    op.create_index('ix_email_verifications_email_purpose', 'email_verifications', ['email', 'purpose'], unique=False)
    op.create_index(op.f('ix_email_verifications_expires_at'), 'email_verifications', ['expires_at'], unique=False)
    op.create_table('licenses',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('activation_code', sa.String(length=128), nullable=False),
    sa.Column('code_hint', sa.String(length=32), nullable=False),
    sa.Column('customer_id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=True),
    sa.Column('product_id', sa.String(length=36), nullable=True),
    sa.Column('order_id', sa.String(length=36), nullable=True),
    sa.Column('product_name', sa.String(length=255), nullable=False),
    sa.Column('product_type', sa.String(length=32), nullable=False),
    sa.Column('price_cents', sa.Integer(), nullable=False),
    sa.Column('validity_days', sa.Integer(), nullable=True),
    sa.Column('issuance_source', sa.String(length=32), nullable=False),
    sa.Column('user_label', sa.String(length=64), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('lease_sequence', sa.Integer(), nullable=False),
    sa.Column('lease_id', sa.String(length=36), nullable=True),
    sa.Column('issued_at', sa.DateTime(), nullable=False),
    sa.Column('access_started_at', sa.DateTime(), nullable=True),
    sa.Column('access_expires_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_licenses_account_id'), 'licenses', ['account_id'], unique=False)
    op.create_index(op.f('ix_licenses_activation_code'), 'licenses', ['activation_code'], unique=True)
    op.create_index(op.f('ix_licenses_active'), 'licenses', ['active'], unique=False)
    op.create_index(op.f('ix_licenses_customer_id'), 'licenses', ['customer_id'], unique=False)
    op.create_index(op.f('ix_licenses_order_id'), 'licenses', ['order_id'], unique=False)
    op.create_index('ix_licenses_product_active', 'licenses', ['product_id', 'active'], unique=False)
    op.create_table('login_attempts',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('scope', sa.String(length=255), nullable=False),
    sa.Column('succeeded', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_login_attempts_created_at'), 'login_attempts', ['created_at'], unique=False)
    op.create_index(op.f('ix_login_attempts_scope'), 'login_attempts', ['scope'], unique=False)
    op.create_table('orders',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('order_no', sa.String(length=64), nullable=False),
    sa.Column('lookup_token', sa.String(length=64), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=True),
    sa.Column('customer_id', sa.String(length=36), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('product_name', sa.String(length=255), nullable=False),
    sa.Column('product_type', sa.String(length=32), nullable=False),
    sa.Column('order_type', sa.String(length=32), nullable=False),
    sa.Column('license_action', sa.String(length=32), nullable=False),
    sa.Column('target_license_id', sa.String(length=36), nullable=True),
    sa.Column('license_id', sa.String(length=36), nullable=True),
    sa.Column('license_state_before_json', sa.Text(), nullable=False),
    sa.Column('original_amount_cents', sa.Integer(), nullable=False),
    sa.Column('discount_cents', sa.Integer(), nullable=False),
    sa.Column('amount_cents', sa.Integer(), nullable=False),
    sa.Column('coupon_code', sa.String(length=64), nullable=True),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('fulfillment_mode', sa.String(length=32), nullable=False),
    sa.Column('payment_provider', sa.String(length=32), server_default='', nullable=False),
    sa.Column('payment_payload_json', sa.Text(), nullable=False),
    sa.Column('payment_trade_no', sa.String(length=128), nullable=True),
    sa.Column('refund_amount_cents', sa.Integer(), nullable=False),
    sa.Column('refund_trade_no', sa.String(length=128), nullable=True),
    sa.Column('needs_review', sa.Boolean(), nullable=False),
    sa.Column('review_note', sa.String(length=255), nullable=False),
    sa.Column('manual_settlement', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('referral_reward_points_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('license_email_sent_at', sa.DateTime(), nullable=True),
    sa.Column('license_email_error', sa.String(length=255), server_default=sa.text("('')"), nullable=False),
    sa.Column('license_email_attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('fulfillment_attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('fulfilled_at', sa.DateTime(), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(), nullable=True),
    sa.Column('refunded_at', sa.DateTime(), nullable=True),
    sa.Column('channel_closed_at', sa.DateTime(), nullable=True),
    sa.Column('archived_at', sa.DateTime(), nullable=True),
    sa.Column('stock_reservation_released_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ),
    sa.ForeignKeyConstraint(['target_license_id'], ['licenses.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orders_account_id'), 'orders', ['account_id'], unique=False)
    op.create_index(op.f('ix_orders_created_at'), 'orders', ['created_at'], unique=False)
    op.create_index(op.f('ix_orders_customer_id'), 'orders', ['customer_id'], unique=False)
    op.create_index(op.f('ix_orders_email'), 'orders', ['email'], unique=False)
    op.create_index(op.f('ix_orders_lookup_token'), 'orders', ['lookup_token'], unique=False)
    op.create_index(op.f('ix_orders_order_no'), 'orders', ['order_no'], unique=True)
    op.create_index(op.f('ix_orders_order_type'), 'orders', ['order_type'], unique=False)
    op.create_index(op.f('ix_orders_product_id'), 'orders', ['product_id'], unique=False)
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'], unique=False)
    op.create_index('ix_orders_status_expires', 'orders', ['status', 'expires_at'], unique=False)
    op.create_index('ix_orders_status_product', 'orders', ['status', 'product_id'], unique=False)
    op.create_index('uq_orders_pending_per_account', 'orders', ['account_id'], unique=True, sqlite_where=sa.text("status = 'pending' AND account_id IS NOT NULL"))
    op.create_table('products',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('product_code', sa.String(length=64), nullable=False),
    sa.Column('price_cents', sa.Integer(), nullable=False),
    sa.Column('original_price_cents', sa.Integer(), nullable=True),
    sa.Column('is_full_price', sa.Boolean(), nullable=False),
    sa.Column('validity_days', sa.Integer(), nullable=True),
    sa.Column('product_type', sa.String(length=32), nullable=False),
    sa.Column('feature_codes_json', sa.Text(), nullable=False),
    sa.Column('included_product_ids_json', sa.Text(), nullable=False),
    sa.Column('package_contents_locked', sa.Boolean(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('note', sa.String(length=512), nullable=True),
    sa.Column('display_description', sa.String(length=512), nullable=True),
    sa.Column('badge_text', sa.String(length=64), nullable=True),
    sa.Column('featured', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('fulfillment_mode', sa.String(length=32), nullable=False),
    sa.Column('stock_quantity', sa.Integer(), nullable=True),
    sa.Column('reserved_stock', sa.Integer(), nullable=False),
    sa.Column('requires_license', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_products_active'), 'products', ['active'], unique=False)
    op.create_index(op.f('ix_products_product_code'), 'products', ['product_code'], unique=False)
    op.create_table('releases',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('product', sa.String(length=64), nullable=False),
    sa.Column('channel', sa.String(length=32), nullable=False),
    sa.Column('version', sa.String(length=32), nullable=False),
    sa.Column('release_date', sa.String(length=32), nullable=False),
    sa.Column('upgrade_notes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_releases_channel'), 'releases', ['channel'], unique=False)
    op.create_index(op.f('ix_releases_product'), 'releases', ['product'], unique=False)
    op.create_index('ix_releases_product_channel_created', 'releases', ['product', 'channel', 'created_at'], unique=False)
    op.create_index('uq_releases_product_channel_version', 'releases', ['product', 'channel', 'version'], unique=True)
    op.create_table('store_settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('site_name', sa.String(length=128), nullable=False),
    sa.Column('site_title', sa.String(length=256), nullable=False),
    sa.Column('description', sa.String(length=512), nullable=False),
    sa.Column('announcement', sa.Text(), nullable=False),
    sa.Column('support_email', sa.String(length=255), nullable=False),
    sa.Column('logo_url', sa.String(length=512), nullable=False),
    sa.Column('maintenance_mode', sa.Boolean(), nullable=False),
    sa.Column('maintenance_message', sa.String(length=512), nullable=False),
    sa.Column('deploy_base_url', sa.String(length=512), nullable=False),
    sa.Column('payment_provider', sa.String(length=32), nullable=False),
    sa.Column('payment_channels_json', sa.Text(), nullable=False),
    sa.Column('payment_enabled', sa.Boolean(), nullable=False),
    sa.Column('payment_transaction_description', sa.String(length=128), nullable=False),
    sa.Column('alipay_app_id', sa.String(length=64), nullable=False),
    sa.Column('alipay_seller_id', sa.String(length=64), nullable=False),
    sa.Column('alipay_app_private_key', sa.Text(), nullable=False),
    sa.Column('alipay_public_key', sa.Text(), nullable=False),
    sa.Column('alipay_gateway_url', sa.String(length=255), nullable=False),
    sa.Column('alipay_notify_url', sa.String(length=512), nullable=False),
    sa.Column('alipay_return_url', sa.String(length=512), nullable=False),
    sa.Column('wechat_mch_id', sa.String(length=64), nullable=False),
    sa.Column('wechat_app_id', sa.String(length=64), nullable=False),
    sa.Column('wechat_api_v3_key', sa.String(length=64), nullable=False),
    sa.Column('wechat_merchant_private_key', sa.Text(), nullable=False),
    sa.Column('wechat_merchant_serial_no', sa.String(length=64), nullable=False),
    sa.Column('wechat_platform_public_key', sa.Text(), nullable=False),
    sa.Column('wechat_platform_public_key_id', sa.String(length=64), nullable=False),
    sa.Column('wechat_notify_url', sa.String(length=512), nullable=False),
    sa.Column('referral_enabled', sa.Boolean(), nullable=False),
    sa.Column('referral_rate_percent', sa.Float(), nullable=False),
    sa.Column('referral_withdrawal_fee_percent', sa.Float(), nullable=False),
    sa.Column('referral_withdrawal_min_points', sa.Float(), nullable=False),
    sa.Column('device_release_cooldown_override', sa.Integer(), nullable=True),
    sa.Column('mail_mode', sa.String(length=16), nullable=False),
    sa.Column('mail_from', sa.String(length=255), nullable=False),
    sa.Column('smtp_host', sa.String(length=255), nullable=False),
    sa.Column('smtp_port', sa.Integer(), nullable=False),
    sa.Column('smtp_username', sa.String(length=255), nullable=False),
    sa.Column('smtp_password', sa.Text(), nullable=False),
    sa.Column('smtp_security', sa.String(length=16), nullable=False),
    sa.Column('verification_ttl_seconds', sa.Integer(), nullable=False),
    sa.Column('verification_cooldown_seconds', sa.Integer(), nullable=False),
    sa.Column('verification_global_hourly_limit', sa.Integer(), nullable=False),
    sa.Column('delivery_email_enabled', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('account_sessions',
    sa.Column('id_hash', sa.String(length=64), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('is_admin_session', sa.Boolean(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(), nullable=False),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=512), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id_hash')
    )
    op.create_index(op.f('ix_account_sessions_account_id'), 'account_sessions', ['account_id'], unique=False)
    op.create_index(op.f('ix_account_sessions_expires_at'), 'account_sessions', ['expires_at'], unique=False)
    op.create_table('coupon_redemptions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('coupon_id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('order_id', sa.String(length=36), nullable=True),
    sa.Column('discount_cents', sa.Integer(), nullable=False),
    sa.Column('voided_at', sa.DateTime(), nullable=True),
    sa.Column('void_reason', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['coupon_id'], ['coupons.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_coupon_redemptions_account_id'), 'coupon_redemptions', ['account_id'], unique=False)
    op.create_index(op.f('ix_coupon_redemptions_coupon_id'), 'coupon_redemptions', ['coupon_id'], unique=False)
    op.create_index(op.f('ix_coupon_redemptions_order_id'), 'coupon_redemptions', ['order_id'], unique=False)
    op.create_table('customers',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customers_account_id'), 'customers', ['account_id'], unique=True)
    op.create_index(op.f('ix_customers_email'), 'customers', ['email'], unique=False)
    op.create_table('device_bindings',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('license_id', sa.String(length=36), nullable=False),
    sa.Column('instance_id', sa.String(length=128), nullable=False),
    sa.Column('client_version', sa.String(length=32), nullable=False),
    sa.Column('last_ip', sa.String(length=64), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('activated_at', sa.DateTime(), nullable=False),
    sa.Column('last_heartbeat_at', sa.DateTime(), nullable=True),
    sa.Column('released_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_bindings_active'), 'device_bindings', ['active'], unique=False)
    op.create_index(op.f('ix_device_bindings_instance_id'), 'device_bindings', ['instance_id'], unique=False)
    op.create_index(op.f('ix_device_bindings_license_id'), 'device_bindings', ['license_id'], unique=False)
    op.create_index('uq_device_bindings_license_instance', 'device_bindings', ['license_id', 'instance_id'], unique=True)
    op.create_table('device_release_events',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('license_id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=True),
    sa.Column('instance_id', sa.String(length=128), nullable=True),
    sa.Column('source', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_release_events_created_at'), 'device_release_events', ['created_at'], unique=False)
    op.create_index(op.f('ix_device_release_events_license_id'), 'device_release_events', ['license_id'], unique=False)
    op.create_table('order_refunds',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('order_id', sa.String(length=36), nullable=False),
    sa.Column('order_no', sa.String(length=64), nullable=False),
    sa.Column('out_request_no', sa.String(length=128), nullable=False),
    sa.Column('amount_cents', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('trade_no', sa.String(length=128), nullable=True),
    sa.Column('detail', sa.String(length=255), nullable=False),
    sa.Column('reason', sa.String(length=255), nullable=False),
    sa.Column('offline', sa.Boolean(), nullable=False),
    sa.Column('operator', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_refunds_created_at'), 'order_refunds', ['created_at'], unique=False)
    op.create_index(op.f('ix_order_refunds_order_id'), 'order_refunds', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_refunds_order_no'), 'order_refunds', ['order_no'], unique=False)
    op.create_index(op.f('ix_order_refunds_out_request_no'), 'order_refunds', ['out_request_no'], unique=True)
    op.create_index(op.f('ix_order_refunds_status'), 'order_refunds', ['status'], unique=False)
    op.create_table('product_images',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=False),
    sa.Column('path', sa.String(length=512), nullable=False),
    sa.Column('version', sa.String(length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_images_product_id'), 'product_images', ['product_id'], unique=True)
    op.create_table('referral_wallets',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=16), nullable=False),
    sa.Column('balance_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('frozen_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('earned_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('withdrawn_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_referral_wallets_account_id'), 'referral_wallets', ['account_id'], unique=True)
    op.create_index(op.f('ix_referral_wallets_code'), 'referral_wallets', ['code'], unique=True)
    op.create_table('entitlements',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('customer_id', sa.String(length=36), nullable=False),
    sa.Column('license_id', sa.String(length=36), nullable=False),
    sa.Column('product_id', sa.String(length=36), nullable=True),
    sa.Column('product_name', sa.String(length=255), nullable=False),
    sa.Column('product_type', sa.String(length=32), nullable=False),
    sa.Column('feature_code', sa.String(length=64), nullable=False),
    sa.Column('source_order_id', sa.String(length=36), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['source_order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_entitlements_customer_id'), 'entitlements', ['customer_id'], unique=False)
    op.create_index(op.f('ix_entitlements_feature_code'), 'entitlements', ['feature_code'], unique=False)
    op.create_index(op.f('ix_entitlements_license_id'), 'entitlements', ['license_id'], unique=False)
    op.create_index('uq_entitlements_license_feature', 'entitlements', ['license_id', 'feature_code'], unique=True)
    op.create_table('license_sessions',
    sa.Column('id_hash', sa.String(length=64), nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('binding_id', sa.String(length=36), nullable=False),
    sa.Column('license_id', sa.String(length=36), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('last_used_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['binding_id'], ['device_bindings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id_hash')
    )
    op.create_index(op.f('ix_license_sessions_binding_id'), 'license_sessions', ['binding_id'], unique=False)
    op.create_index(op.f('ix_license_sessions_expires_at'), 'license_sessions', ['expires_at'], unique=False)
    op.create_index(op.f('ix_license_sessions_license_id'), 'license_sessions', ['license_id'], unique=False)
    op.create_table('recovery_tokens',
    sa.Column('id_hash', sa.String(length=64), nullable=False),
    sa.Column('binding_id', sa.String(length=36), nullable=False),
    sa.Column('license_id', sa.String(length=36), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['binding_id'], ['device_bindings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['license_id'], ['licenses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id_hash')
    )
    op.create_index(op.f('ix_recovery_tokens_binding_id'), 'recovery_tokens', ['binding_id'], unique=False)
    op.create_index(op.f('ix_recovery_tokens_expires_at'), 'recovery_tokens', ['expires_at'], unique=False)
    op.create_index(op.f('ix_recovery_tokens_license_id'), 'recovery_tokens', ['license_id'], unique=False)
    op.create_table('referral_ledger',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('wallet_id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('delta_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('frozen_delta_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('balance_after_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('frozen_after_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('note', sa.String(length=255), nullable=False),
    sa.Column('reference', sa.String(length=128), nullable=True),
    sa.Column('order_id', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['wallet_id'], ['referral_wallets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_referral_ledger_account_id'), 'referral_ledger', ['account_id'], unique=False)
    op.create_index(op.f('ix_referral_ledger_created_at'), 'referral_ledger', ['created_at'], unique=False)
    op.create_index(op.f('ix_referral_ledger_kind'), 'referral_ledger', ['kind'], unique=False)
    op.create_index(op.f('ix_referral_ledger_order_id'), 'referral_ledger', ['order_id'], unique=False)
    op.create_index(op.f('ix_referral_ledger_wallet_id'), 'referral_ledger', ['wallet_id'], unique=False)
    op.create_table('referral_withdrawals',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('wallet_id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('request_key', sa.String(length=64), nullable=False),
    sa.Column('points_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('fee_bps', sa.Integer(), server_default='0', nullable=False),
    sa.Column('fee_points_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('net_points_centi', sa.Integer(), server_default='0', nullable=False),
    sa.Column('status', sa.String(length=32), nullable=False),
    sa.Column('note', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('resolved_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['wallet_id'], ['referral_wallets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('request_key')
    )
    op.create_index(op.f('ix_referral_withdrawals_account_id'), 'referral_withdrawals', ['account_id'], unique=False)
    op.create_index(op.f('ix_referral_withdrawals_created_at'), 'referral_withdrawals', ['created_at'], unique=False)
    op.create_index(op.f('ix_referral_withdrawals_status'), 'referral_withdrawals', ['status'], unique=False)
    op.create_index(op.f('ix_referral_withdrawals_wallet_id'), 'referral_withdrawals', ['wallet_id'], unique=False)


def downgrade() -> None:
    """不可逆。

    本文件是压缩后的单一基线，降级等于「删掉全部业务表」。真要回退请从数据目录里迁移前
    自动生成的 ``store.db.pre-migrate-*.bak`` 快照恢复，而不是降级结构。
    """
    raise RuntimeError(
        "0001 不可降级：它是压缩后的单一基线，降级等于删掉全部业务表。"
        "需要回退请从 store.db.pre-migrate-*.bak 快照恢复。"
    )
