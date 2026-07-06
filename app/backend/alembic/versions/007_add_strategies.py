# 007_add_strategies.py

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '007_add_strategies'
down_revision = '005_unified_trades'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'strategies',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),

        # e.g. 'moving_average_crossover', 'rsi_bands', 'custom'
        sa.Column('strategy_type', sa.String(100), nullable=False),

        # versioning — bump version when config shape changes meaningfully
        sa.Column('version', sa.Integer, nullable=False, server_default='1'),

        # the actual strategy parameters (indicators, thresholds, etc.)
        sa.Column('config', sa.JSON, nullable=False, server_default='{}'),

        # optional: which asset classes this strategy is valid for
        sa.Column('supported_asset_types', sa.ARRAY(sa.String), nullable=True),

        sa.Column('is_public', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('ix_strategies_type_version', 'strategies', ['strategy_type', 'version'])
    op.create_index('ix_strategies_created_by', 'strategies', ['created_by'])

    # link bots to strategies — nullable so existing bots using inline strategy_config aren't broken
    op.add_column('bots', sa.Column(
        'strategy_id', UUID(as_uuid=True),
        sa.ForeignKey('strategies.id', ondelete='SET NULL'),
        nullable=True
    ))


def downgrade():
    op.drop_column('bots', 'strategy_id')
    op.drop_index('ix_strategies_created_by', table_name='strategies')
    op.drop_index('ix_strategies_type_version', table_name='strategies')
    op.drop_table('strategies')