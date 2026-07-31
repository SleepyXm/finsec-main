# 010_add_strategies.py

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision = '010_add_strategies'
down_revision = '008_strategies_indicators'
branch_labels = None
depends_on = None


def upgrade():
    # strategies
    op.add_column('strategies', sa.Column('description',           sa.Text,                       nullable=True))
    op.add_column('strategies', sa.Column('strategy_type',         sa.String(100),                nullable=False, server_default=sa.text("'annotation'")))
    op.add_column('strategies', sa.Column('version',               sa.Integer,                    nullable=False, server_default=sa.text('1')))
    op.add_column('strategies', sa.Column('config',                postgresql.JSONB,              nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column('strategies', sa.Column('supported_asset_types', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('strategies', sa.Column('is_public',             sa.Boolean,                    nullable=False, server_default=sa.text('false')))

    op.create_check_constraint('ck_strategies_version', 'strategies', 'version > 0')

    op.create_index('ix_strategies_type_version',   'strategies', ['strategy_type', 'version'])
    op.create_index('ix_strategies_public_updated', 'strategies', ['updated_at'], postgresql_where=sa.text('is_public = true') )

    # bots
    op.add_column(
        'bots',
        sa.Column('strategy_id', UUID(as_uuid=True), sa.ForeignKey('strategies.id', ondelete='SET NULL'), nullable=True ))
    op.create_index('ix_bots_strategy_id', 'bots', ['strategy_id'])


def downgrade():
    op.drop_index('ix_bots_strategy_id', table_name='bots')
    op.drop_column('bots', 'strategy_id')

    op.drop_index('ix_strategies_public_updated', table_name='strategies')
    op.drop_index('ix_strategies_type_version', table_name='strategies')
    op.drop_constraint('ck_strategies_version', 'strategies', type_='check')

    op.drop_column('strategies', 'is_public')
    op.drop_column('strategies', 'supported_asset_types')
    op.drop_column('strategies', 'config')
    op.drop_column('strategies', 'version')
    op.drop_column('strategies', 'strategy_type')
    op.drop_column('strategies', 'description')