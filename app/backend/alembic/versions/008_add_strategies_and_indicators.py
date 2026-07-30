# 008_add_strategies_and_indicators.py

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision = '008_strategies_indicators'
down_revision = '007_add_backtests'
branch_labels = None
depends_on = None


def upgrade():
    # users
    op.add_column('users', sa.Column('strategies', postgresql.ARRAY(UUID(as_uuid=True)), nullable=False, server_default=sa.text("'{}'::uuid[]")))
    op.add_column('users', sa.Column('indicators', postgresql.ARRAY(UUID(as_uuid=True)), nullable=False, server_default=sa.text("'{}'::uuid[]")))

    # strategies
    op.create_table(
        'strategies',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_id',   UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',       sa.String(255), nullable=False),
        sa.Column('local_url',  sa.Text, nullable=False),
        sa.Column('prod_url',   sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.UniqueConstraint('owner_id', 'name', name='uq_strategies_owner_name'),
    )

    op.create_index('ix_strategies_owner_id',      'strategies', ['owner_id'])
    op.create_index('ix_strategies_owner_updated', 'strategies', ['owner_id', 'updated_at'])
    op.execute("""
        CREATE TRIGGER trg_strategies_updated_at
        BEFORE UPDATE ON strategies
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    """)

    # backtests
    op.add_column('backtests', sa.Column('strategy_id', UUID(as_uuid=True), sa.ForeignKey('strategies.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_backtests_strategy_id', 'backtests', ['strategy_id'])

    # indicators
    op.create_table(
        'indicators',
        sa.Column('id',         UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_id',   UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',       sa.String(255), nullable=False),
        sa.Column('local_url',  sa.Text, nullable=False),
        sa.Column('prod_url',   sa.Text, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.UniqueConstraint('owner_id', 'name', name='uq_indicators_owner_name'),
    )

    op.create_index('ix_indicators_owner_id',      'indicators', ['owner_id'])
    op.create_index('ix_indicators_owner_updated', 'indicators', ['owner_id', 'updated_at'])
    op.execute("""
        CREATE TRIGGER trg_indicators_updated_at
        BEFORE UPDATE ON indicators
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    """)

    # Keep users.strategies synchronized with owned strategies.
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_user_strategies()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE users
                SET strategies = array_append(strategies, NEW.id)
                WHERE id = NEW.owner_id;
                RETURN NEW;
            END IF;

            UPDATE users
            SET strategies = array_remove(strategies, OLD.id)
            WHERE id = OLD.owner_id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_user_strategies
        AFTER INSERT OR DELETE ON strategies
        FOR EACH ROW EXECUTE FUNCTION sync_user_strategies();
    """)

    # Keep users.indicators synchronized with owned indicators.
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_user_indicators()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE users
                SET indicators = array_append(indicators, NEW.id)
                WHERE id = NEW.owner_id;
                RETURN NEW;
            END IF;

            UPDATE users
            SET indicators = array_remove(indicators, OLD.id)
            WHERE id = OLD.owner_id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_user_indicators
        AFTER INSERT OR DELETE ON indicators
        FOR EACH ROW EXECUTE FUNCTION sync_user_indicators();
    """)


def downgrade():
    op.execute('DROP TRIGGER IF EXISTS trg_sync_user_indicators ON indicators;')
    op.execute('DROP FUNCTION IF EXISTS sync_user_indicators;')
    op.execute('DROP TRIGGER IF EXISTS trg_sync_user_strategies ON strategies;')
    op.execute('DROP FUNCTION IF EXISTS sync_user_strategies;')

    op.execute('DROP TRIGGER IF EXISTS trg_indicators_updated_at ON indicators;')
    op.drop_index('ix_indicators_owner_updated', table_name='indicators')
    op.drop_index('ix_indicators_owner_id', table_name='indicators')
    op.drop_table('indicators')

    op.drop_index('ix_backtests_strategy_id', table_name='backtests')
    op.drop_column('backtests', 'strategy_id')

    op.execute('DROP TRIGGER IF EXISTS trg_strategies_updated_at ON strategies;')
    op.drop_index('ix_strategies_owner_updated', table_name='strategies')
    op.drop_index('ix_strategies_owner_id', table_name='strategies')
    op.drop_table('strategies')

    op.drop_column('users', 'indicators')
    op.drop_column('users', 'strategies')