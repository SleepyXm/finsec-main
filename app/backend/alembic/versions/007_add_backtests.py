# 007_add_backtests.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision = '007_add_backtests'
down_revision = '006_add_subscriptions'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'backtests',
        sa.Column('id',               UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id',          UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),

        # historical replay range
        sa.Column('ticker',           sa.String(20), nullable=False),
        sa.Column('interval',         sa.String(10), nullable=False),
        sa.Column('date_from',        sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('date_to',          sa.TIMESTAMP(timezone=True), nullable=False),

        # compact session snapshot — all PnL and stats are derived on the frontend
        sa.Column('starting_balance', sa.Numeric(18, 8), nullable=False),
        sa.Column('current_candle',   sa.Integer, nullable=False, server_default=sa.text('0')),
        sa.Column('positions',        postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),

        # sessions cannot live for longer than three days
        sa.Column('created_at',       sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',       sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at',       sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now() + interval '3 days'")),

        sa.CheckConstraint('date_to > date_from', name='ck_backtests_date_range'),
        sa.CheckConstraint('starting_balance >= 0', name='ck_backtests_starting_balance'),
        sa.CheckConstraint('current_candle >= 0', name='ck_backtests_current_candle'),
        sa.CheckConstraint("jsonb_typeof(positions) = 'array'", name='ck_backtests_positions_array'),
        sa.CheckConstraint("expires_at > created_at AND expires_at <= created_at + interval '3 days'", name='ck_backtests_three_day_expiry'),
    )

    op.create_index('ix_backtests_user_id',    'backtests', ['user_id'])
    op.create_index('ix_backtests_expires_at', 'backtests', ['expires_at'])
    op.execute("""
        CREATE TRIGGER trg_backtests_updated_at
        BEFORE UPDATE ON backtests
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    """)


def downgrade():
    op.execute('DROP TRIGGER IF EXISTS trg_backtests_updated_at ON backtests;')
    op.drop_index('ix_backtests_expires_at', table_name='backtests')
    op.drop_index('ix_backtests_user_id', table_name='backtests')
    op.drop_table('backtests')
