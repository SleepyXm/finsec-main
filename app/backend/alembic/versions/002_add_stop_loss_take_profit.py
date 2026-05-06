from alembic import op
import sqlalchemy as sa

revision = '002_add_stop_loss_take_profit'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('positions', sa.Column('stop_loss', sa.Numeric(18, 8), nullable=True))
    op.add_column('positions', sa.Column('take_profit', sa.Numeric(18, 8), nullable=True))


def downgrade():
    op.drop_column('positions', 'stop_loss')
    op.drop_column('positions', 'take_profit')