"""Add bot configuration fields to user-owned strategies."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '010_add_strategies'
down_revision = '008_strategies_indicators'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('strategies', sa.Column('description', sa.Text, nullable=True))
    op.add_column(
        'strategies',
        sa.Column('strategy_type', sa.String(100), nullable=False, server_default='annotation'),
    )
    op.add_column('strategies', sa.Column('version', sa.Integer, nullable=False, server_default='1'))
    op.add_column('strategies', sa.Column('config', sa.JSON, nullable=False, server_default='{}'))
    op.add_column('strategies', sa.Column('supported_asset_types', sa.ARRAY(sa.String), nullable=True))
    op.add_column('strategies', sa.Column('is_public', sa.Boolean, nullable=False, server_default='false'))

    op.create_index('ix_strategies_type_version', 'strategies', ['strategy_type', 'version'])

    # link bots to strategies — nullable so existing bots using inline strategy_config aren't broken
    op.add_column('bots', sa.Column(
        'strategy_id', UUID(as_uuid=True),
        sa.ForeignKey('strategies.id', ondelete='SET NULL'),
        nullable=True
    ))


def downgrade():
    op.drop_column('bots', 'strategy_id')
    op.drop_index('ix_strategies_type_version', table_name='strategies')
    op.drop_column('strategies', 'is_public')
    op.drop_column('strategies', 'supported_asset_types')
    op.drop_column('strategies', 'config')
    op.drop_column('strategies', 'version')
    op.drop_column('strategies', 'strategy_type')
    op.drop_column('strategies', 'description')
