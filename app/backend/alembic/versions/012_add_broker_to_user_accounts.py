from alembic import op
import sqlalchemy as sa


revision = '012_add_broker_to_user_accounts'
down_revision = '011_optimize_trade_indexes'
branch_labels = None
depends_on = None


def upgrade():
    # user_accounts
    op.add_column('user_accounts', sa.Column('broker',                  sa.String(20), nullable=True))
    op.add_column('user_accounts', sa.Column('broker_environment',      sa.String(10), nullable=True))
    op.add_column('user_accounts', sa.Column('broker_account_id',       sa.String(255), nullable=True))
    op.add_column('user_accounts', sa.Column('broker_connected_at',     sa.TIMESTAMP(timezone=True), nullable=True))

    op.create_check_constraint(
        'ck_user_accounts_broker_connection', 'user_accounts',
        "(broker IS NULL AND broker_environment IS NULL AND broker_account_id IS NULL AND broker_connected_at IS NULL) OR "
        "(broker = 'saxo' AND broker_environment IN ('demo', 'live') AND broker_account_id IS NOT NULL AND broker_connected_at IS NOT NULL)",
    )


def downgrade():
    op.drop_constraint('ck_user_accounts_broker_connection', 'user_accounts', type_='check')

    op.drop_column('user_accounts', 'broker_connected_at')
    op.drop_column('user_accounts', 'broker_account_id')
    op.drop_column('user_accounts', 'broker_environment')
    op.drop_column('user_accounts', 'broker')
