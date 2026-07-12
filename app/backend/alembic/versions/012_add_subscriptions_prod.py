"""Compatibility step after 007_add_indicators.

The subscription schema and product seed now live in 006_add_subscriptions.
This revision is intentionally a no-op so later migrations that already depend
on 012_add_subscriptions_prod can keep their existing down_revision.
"""

revision = '012_add_subscriptions_prod'
down_revision = '010_add_strategies'
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
