from alembic import op
import sqlalchemy as sa


revision = '011_optimize_trade_indexes'
down_revision = '010_add_strategies'
branch_labels = None
depends_on = None


def upgrade():
    # user_accounts
    op.create_index('uq_user_accounts_user_id', 'user_accounts', ['user_id'], unique=True)

    # trades
    op.create_index(
        'ix_trades_active_account_id',
        'trades',
        ['account_id'],
        postgresql_where=sa.text("status IN ('pending', 'open')"),
    )
    op.create_index(
        'ix_trades_closed_account_cursor',
        'trades',
        ['account_id', 'closed_at', 'id'],
        postgresql_where=sa.text("status = 'closed'"),
    )
    op.create_index(
        'ix_trades_pending_limit_match',
        'trades',
        ['symbol', 'side', 'price'],
        postgresql_where=sa.text("order_type = 'limit' AND status = 'pending'"),
    )

    op.drop_index('ix_trades_status', table_name='trades')
    op.drop_index('ix_trades_symbol', table_name='trades')


def downgrade():
    op.create_index('ix_trades_symbol', 'trades', ['symbol'])
    op.create_index('ix_trades_status', 'trades', ['status'])

    op.drop_index('ix_trades_pending_limit_match', table_name='trades')
    op.drop_index('ix_trades_closed_account_cursor', table_name='trades')
    op.drop_index('ix_trades_active_account_id', table_name='trades')

    op.drop_index('uq_user_accounts_user_id', table_name='user_accounts')
