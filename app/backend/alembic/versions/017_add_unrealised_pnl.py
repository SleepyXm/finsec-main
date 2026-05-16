# 017_add_unrealised_pnl.py
from alembic import op
import sqlalchemy as sa

revision = '017_add_unrealised_pnl'
down_revision = '002_add_stop_loss_take_profit'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('positions', sa.Column(
        'unrealised_pnl', sa.Numeric(18, 8), nullable=True
    ))
    op.add_column('positions', sa.Column(
        'last_price', sa.Numeric(18, 8), nullable=True   # price used for last unrealised_pnl calc
    ))
    op.add_column('positions', sa.Column(
        'pnl_updated_at', sa.TIMESTAMP(timezone=True), nullable=True
    ))


def downgrade():
    op.drop_column('positions', 'pnl_updated_at')
    op.drop_column('positions', 'last_price')
    op.drop_column('positions', 'unrealised_pnl')