from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('username', sa.String(255), nullable=False, unique=True),
        sa.Column('password', sa.String(255), nullable=False),  # hashed password
        sa.Column('verified', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('verification_token', sa.String(255), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'user_accounts',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_type', sa.String(50), nullable=False, server_default="paper"),  # for now only paper trading, can be live in the future with regulation lol
        sa.Column('balance', sa.Numeric(18, 8), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(10), nullable=False, server_default="'USD'"),
        sa.Column('status', sa.String(20), nullable=False, server_default="'active'"),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'bots',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('strategy_config', sa.JSON, nullable=False),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('asset_type', sa.String(50), nullable=False),  # equity, crypto, forex
        sa.Column('exchange', sa.String(50), nullable=True),
        sa.Column('timeframe', sa.String(20), nullable=True),    # 1m, 5m, 1h, 1d
        sa.Column('status', sa.String(20), nullable=False, server_default="'stopped'"),  # running, paused, stopped
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'orders',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bot_id', UUID(as_uuid=True), sa.ForeignKey('bots.id', ondelete='SET NULL'), nullable=True),  # null = manual order
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('side', sa.String(10), nullable=False),              # buy, sell
        sa.Column('order_type', sa.String(20), nullable=False),        # market, limit, stop
        sa.Column('quantity', sa.Numeric(18, 8), nullable=False),
        sa.Column('price', sa.Numeric(18, 8), nullable=True),          # null for market orders
        sa.Column('stop_price', sa.Numeric(18, 8), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default="'pending'"),  # pending, filled, cancelled
        sa.Column('external_order_id', sa.String(255), nullable=True), # ID from broker/exchange API
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'positions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bot_id', UUID(as_uuid=True), sa.ForeignKey('bots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('side', sa.String(10), nullable=False),              # long, short
        sa.Column('quantity', sa.Numeric(18, 8), nullable=False),
        sa.Column('entry_order_id', UUID(as_uuid=True), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('exit_order_id', UUID(as_uuid=True), sa.ForeignKey('orders.id'), nullable=True),
        sa.Column('entry_price', sa.Numeric(18, 8), nullable=False),
        sa.Column('exit_price', sa.Numeric(18, 8), nullable=True),     # null until closed
        sa.Column('realised_pnl', sa.Numeric(18, 8), nullable=True),   # null until closed
        sa.Column('status', sa.String(20), nullable=False, server_default="'open'"),  # open, closed
        sa.Column('opened_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('closed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('positions')
    op.drop_table('orders')
    op.drop_table('bots')
    op.drop_table('user_accounts')
    op.drop_table('users')