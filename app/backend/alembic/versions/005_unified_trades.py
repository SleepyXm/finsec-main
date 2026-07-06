# 005_unified_trades.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '005_unified_trades'
down_revision = '004_update_user_accounts'
branch_labels = None
depends_on = None


def upgrade():
    # Both tables are empty — safe to drop cleanly
    op.drop_table('positions')
    op.drop_table('orders')

    op.create_table(
        'trades',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),

        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('user_accounts.id', ondelete='CASCADE'),  nullable=False),

        # who triggered this trade
        sa.Column('executed_by',       sa.String(10), nullable=False),
        # 'bot' | 'user'
        # bot_id being null is implied for 'user', but explicit is cleaner for queries

        # order intent
        sa.Column('symbol',            sa.String(20),        nullable=False),
        sa.Column('side',              sa.String(10),        nullable=False),   # buy / sell
        sa.Column('order_type',        sa.String(20),        nullable=False),   # market / limit / stop / stop_limit
        sa.Column('quantity',          sa.Numeric(18, 8),    nullable=False),
        sa.Column('price',             sa.Numeric(18, 8),    nullable=True),    # requested limit price — null for market

        # execution + position data (populated as lifecycle progresses)
        sa.Column('entry_price',       sa.Numeric(18, 8),    nullable=True),   # actual fill price — null until filled
        sa.Column('exit_price',        sa.Numeric(18, 8),    nullable=True),   # null until closed
        sa.Column('realised_pnl',      sa.Numeric(18, 8),    nullable=True),   # null until closed

        # risk controls
        sa.Column('stop_loss',         sa.Numeric(18, 8),    nullable=True),
        sa.Column('take_profit',       sa.Numeric(18, 8),    nullable=True),

        # lifecycle:  pending → open → closed
        #             pending → cancelled
        sa.Column('status',            sa.String(20), nullable=False, server_default="'pending'"),

        sa.Column('external_order_id', sa.String(255), nullable=True),  # broker / exchange ref

        sa.Column('created_at',        sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at',        sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('opened_at',         sa.TIMESTAMP(timezone=True), nullable=True),  # when order filled
        sa.Column('closed_at',         sa.TIMESTAMP(timezone=True), nullable=True),  # when position closed

        # enforce valid values at DB level
        sa.CheckConstraint("executed_by IN ('bot', 'user')",                          name='ck_trades_executed_by'),
        sa.CheckConstraint("side IN ('buy', 'sell')",                                 name='ck_trades_side'),
        sa.CheckConstraint("order_type IN ('market', 'limit')",                       name='ck_trades_order_type'),
        sa.CheckConstraint("status IN ('pending', 'open', 'closed', 'cancelled')",    name='ck_trades_status'),
    )

    op.create_index('ix_trades_account_id', 'trades', ['account_id'])
    op.create_index('ix_trades_symbol',     'trades', ['symbol'])
    op.create_index('ix_trades_status',     'trades', ['status'])


def downgrade():
    op.drop_table('trades')

    op.create_table(
        'orders',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True), sa.ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bot_id',     UUID(as_uuid=True), sa.ForeignKey('bots.id', ondelete='SET NULL'),         nullable=True),
        sa.Column('symbol',            sa.String(20),                                                      nullable=False),
        sa.Column('side',              sa.String(10),                                                      nullable=False),
        sa.Column('order_type',        sa.String(20),                                                      nullable=False),
        sa.Column('quantity',          sa.Numeric(18, 8),                                                  nullable=False),
        sa.Column('price',             sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('stop_price',        sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('status',            sa.String(20),                                                      nullable=False, server_default="'pending'"),
        sa.Column('external_order_id', sa.String(255),                                                     nullable=True),
        sa.Column('created_at',        sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'positions',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('account_id', UUID(as_uuid=True),      sa.ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bot_id',     UUID(as_uuid=True),      sa.ForeignKey('bots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('symbol',          sa.String(20),                                                      nullable=False),
        sa.Column('side',            sa.String(10),                                                      nullable=False),
        sa.Column('quantity',        sa.Numeric(18, 8),                                                  nullable=False),
        sa.Column('entry_order_id',  UUID(as_uuid=True), sa.ForeignKey('orders.id'),                     nullable=False),
        sa.Column('exit_order_id',   UUID(as_uuid=True), sa.ForeignKey('orders.id'),                     nullable=True),
        sa.Column('entry_price',     sa.Numeric(18, 8),                                                  nullable=False),
        sa.Column('exit_price',      sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('realised_pnl',    sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('status',          sa.String(20),                                                      nullable=False, server_default="'open'"),
        sa.Column('stop_loss',       sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('take_profit',     sa.Numeric(18, 8),                                                  nullable=True),
        sa.Column('opened_at',       sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('closed_at',       sa.TIMESTAMP(timezone=True),                                        nullable=True),
    )