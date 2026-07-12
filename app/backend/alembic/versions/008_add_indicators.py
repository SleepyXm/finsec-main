"""Add saved indicators, immutable source versions, and applied chart preferences."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID


revision = '008_add_indicators'
down_revision = '007_add_backtests'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'indicators',
        sa.Column('id',          UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('owner_id',    UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name',        sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('visibility',  sa.String(20), nullable=False, server_default=sa.text("'private'")),
        sa.Column('created_at',  sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at',  sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deleted_at',  sa.TIMESTAMP(timezone=True), nullable=True),

        sa.CheckConstraint("visibility IN ('private', 'unlisted', 'public')", name='ck_indicators_visibility'),
    )

    op.create_index('ix_indicators_owner_id',      'indicators', ['owner_id'])
    op.create_index('ix_indicators_owner_updated', 'indicators', ['owner_id', 'updated_at'], postgresql_where=sa.text('deleted_at IS NULL'))

    op.create_table(
        'indicator_versions',
        sa.Column('id',               UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('indicator_id',     UUID(as_uuid=True), sa.ForeignKey('indicators.id', ondelete='CASCADE'), nullable=False),
        sa.Column('version',          sa.Integer(), nullable=False),
        sa.Column('is_current',       sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('language_version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('source_key',       sa.Text(), nullable=False),
        sa.Column('content_hash',     sa.String(64), nullable=False),
        sa.Column('created_at',       sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),

        sa.CheckConstraint('version > 0', name='ck_indicator_versions_version'),
        sa.CheckConstraint('language_version > 0', name='ck_indicator_versions_language_version'),
        sa.CheckConstraint("content_hash ~ '^[0-9a-f]{64}$'", name='ck_indicator_versions_content_hash'),
        sa.UniqueConstraint('indicator_id', 'version', name='uq_indicator_versions_indicator_version'),
        sa.UniqueConstraint('indicator_id', 'content_hash', name='uq_indicator_versions_indicator_hash'),
        sa.UniqueConstraint('source_key', name='uq_indicator_versions_source_key'),
    )

    op.create_index('ix_indicator_versions_current',      'indicator_versions', ['indicator_id'], unique=True, postgresql_where=sa.text('is_current = true'))
    op.create_index('ix_indicator_versions_content_hash', 'indicator_versions', ['content_hash'])

    # Applied indicator instances live with the user's existing chart preferences.
    op.add_column('user_preferences', sa.Column('indicators', postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")))


def downgrade():
    op.drop_column('user_preferences', 'indicators')

    op.drop_index('ix_indicator_versions_content_hash', table_name='indicator_versions')
    op.drop_index('ix_indicator_versions_current', table_name='indicator_versions')
    op.drop_table('indicator_versions')

    op.drop_index('ix_indicators_owner_updated', table_name='indicators')
    op.drop_index('ix_indicators_owner_id', table_name='indicators')
    op.drop_table('indicators')
