from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision = '006_add_subscriptions'
down_revision = '005_unified_trades'
branch_labels = None
depends_on = None


TEST_PRODUCTS = [
    {'stripe_product_id': 'there_isnt_a_real_product_id_for_free_tier', 'stripe_price_id': 'there_isnt_a_real_price_id_for_free_tier', 'name': 'Free',                   'tier': 'free',         'amount': 0,     'billing_interval': 'month'},
    {'stripe_product_id': 'prod_Ur7SEvl41ewdeX',                       'stripe_price_id': 'price_1TrPDNGUL6ygYkqqQUP5PIIk',             'name': 'Premium (Monthly)',      'tier': 'premium',      'amount': 1499,  'billing_interval': 'month'},
    {'stripe_product_id': 'prod_Ur7TvFJzszwFWq',                       'stripe_price_id': 'price_1TrPEBGUL6ygYkqqHIVNCJri',             'name': 'Professional (Monthly)', 'tier': 'professional', 'amount': 3499,  'billing_interval': 'month'},
    {'stripe_product_id': 'prod_Ur7UOijTsiRpY1',                       'stripe_price_id': 'price_1TrPFFGUL6ygYkqqMTNqNrhk',             'name': 'Enterprise (Monthly)',   'tier': 'enterprise',   'amount': 99999, 'billing_interval': 'month'},
]


def upgrade():
    # users
    op.add_column('users', sa.Column('stripe_customer_id', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('subscription_tier', sa.String(20), nullable=False, server_default=sa.text("'free'")))
    op.create_index('ix_users_stripe_customer_id', 'users', ['stripe_customer_id'])
    op.create_check_constraint('ck_users_subscription_tier', 'users', "subscription_tier IN ('free', 'premium', 'professional', 'enterprise')")

    # shared updated_at trigger function
    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # products
    op.create_table(
        'products',
        sa.Column('id',                UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('stripe_product_id', sa.String(255), nullable=False, unique=True),
        sa.Column('stripe_price_id',   sa.String(255), nullable=False, unique=True),
        sa.Column('name',              sa.String(255), nullable=False),
        sa.Column('description',       sa.Text, nullable=True),
        sa.Column('tier',              sa.String(20), nullable=False),
        sa.Column('amount',            sa.Integer, nullable=False),
        sa.Column('currency',          sa.String(3), nullable=False, server_default=sa.text("'usd'")),
        sa.Column('billing_interval',  sa.String(20), nullable=False),  # renamed from reserved 'interval'
        sa.Column('interval_count',    sa.Integer, nullable=False, server_default=sa.text('1')),
        sa.Column('active',            sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('metadata',          postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at',        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',        sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.CheckConstraint("tier IN ('free', 'premium', 'professional', 'enterprise')", name='ck_products_tier'),
        sa.CheckConstraint("billing_interval IN ('month', 'year')", name='ck_products_billing_interval'),
    )

    op.create_index('ix_products_stripe_price_id', 'products', ['stripe_price_id'])
    op.create_index('ix_products_tier',            'products', ['tier'])
    op.create_index('ix_products_active',          'products', ['active'])
    op.execute("""
        CREATE TRIGGER trg_products_updated_at
        BEFORE UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    """)

    for product in TEST_PRODUCTS:
        op.execute(
            sa.text("""
                INSERT INTO products (
                    stripe_product_id, stripe_price_id, name, tier,
                    amount, billing_interval, active
                )
                VALUES (
                    :stripe_product_id, :stripe_price_id, :name, :tier,
                    :amount, :billing_interval, true
                )
                ON CONFLICT (stripe_price_id) DO UPDATE
                    SET name             = EXCLUDED.name,
                        tier             = EXCLUDED.tier,
                        amount           = EXCLUDED.amount,
                        billing_interval = EXCLUDED.billing_interval,
                        active           = true,
                        updated_at       = NOW()
            """).bindparams(**product)
        )

    # subscriptions
    op.create_table(
        'subscriptions',
        sa.Column('id',                     UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id',                UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('product_id',             UUID(as_uuid=True), sa.ForeignKey('products.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('stripe_customer_id',     sa.String(255), nullable=False),
        sa.Column('stripe_subscription_id', sa.String(255), nullable=False, unique=True),
        sa.Column('stripe_price_id',        sa.String(255), nullable=False),
        sa.Column('status',                 sa.String(50), nullable=False, server_default=sa.text("'incomplete'")),
        sa.Column('quantity',               sa.Integer, nullable=False, server_default=sa.text('1')),
        sa.Column('current_period_start',   sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('current_period_end',     sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('trial_start',            sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('trial_end',              sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('cancel_at_period_end',   sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('cancel_at',              sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('canceled_at',            sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('ended_at',               sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('metadata',               postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at',             sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',             sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.CheckConstraint("status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')", name='ck_subscriptions_status'),
    )

    op.create_index('ix_subscriptions_user_id',            'subscriptions', ['user_id'])
    op.create_index('ix_subscriptions_product_id',         'subscriptions', ['product_id'])
    op.create_index('ix_subscriptions_stripe_customer_id', 'subscriptions', ['stripe_customer_id'])
    op.create_index('ix_subscriptions_status',             'subscriptions', ['status'])
    op.create_index('ix_subscriptions_current_period_end', 'subscriptions', ['current_period_end'])
    op.execute("""
        CREATE TRIGGER trg_subscriptions_updated_at
        BEFORE UPDATE ON subscriptions
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    """)

    # Keep users.subscription_tier synchronized with subscription lifecycle changes.
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_user_subscription_tier()
        RETURNS TRIGGER AS $$
        DECLARE
            v_tier TEXT;
        BEGIN
            IF NEW.status IN ('active', 'trialing') THEN
                SELECT tier INTO v_tier FROM products WHERE id = NEW.product_id;
                UPDATE users SET subscription_tier = v_tier WHERE id = NEW.user_id;

            ELSIF NEW.status IN ('canceled', 'incomplete_expired', 'unpaid', 'paused') THEN
                UPDATE users SET subscription_tier = 'free' WHERE id = NEW.user_id;

            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_subscription_tier
        AFTER INSERT OR UPDATE ON subscriptions
        FOR EACH ROW EXECUTE FUNCTION sync_user_subscription_tier();
    """)


def downgrade():
    op.execute('DROP TRIGGER IF EXISTS trg_sync_subscription_tier ON subscriptions;')
    op.execute('DROP FUNCTION IF EXISTS sync_user_subscription_tier;')
    op.execute('DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;')
    op.drop_index('ix_subscriptions_current_period_end', table_name='subscriptions')
    op.drop_index('ix_subscriptions_status', table_name='subscriptions')
    op.drop_index('ix_subscriptions_stripe_customer_id', table_name='subscriptions')
    op.drop_index('ix_subscriptions_product_id', table_name='subscriptions')
    op.drop_index('ix_subscriptions_user_id', table_name='subscriptions')
    op.drop_table('subscriptions')

    op.execute('DROP TRIGGER IF EXISTS trg_products_updated_at ON products;')
    op.drop_index('ix_products_active', table_name='products')
    op.drop_index('ix_products_tier', table_name='products')
    op.drop_index('ix_products_stripe_price_id', table_name='products')
    op.drop_table('products')

    op.execute('DROP FUNCTION IF EXISTS set_updated_at;')

    op.drop_constraint('ck_users_subscription_tier', 'users', type_='check')
    op.drop_index('ix_users_stripe_customer_id', table_name='users')
    op.drop_column('users', 'subscription_tier')
    op.drop_column('users', 'stripe_customer_id')
