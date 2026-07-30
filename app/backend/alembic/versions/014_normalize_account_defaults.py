"""Remove quote characters stored by the original account defaults."""

from alembic import op
import sqlalchemy as sa


revision = "014_normalize_account_defaults"
down_revision = "010_add_strategies"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        UPDATE user_accounts
        SET account_type = BTRIM(account_type, ''''),
            currency = BTRIM(currency, ''''),
            status = BTRIM(status, '''')
        WHERE account_type LIKE '''%'''
           OR currency LIKE '''%'''
           OR status LIKE '''%'''
        """
    )
    op.alter_column("user_accounts", "account_type", server_default=sa.text("'paper'"))
    op.alter_column("user_accounts", "currency", server_default=sa.text("'USD'"))
    op.alter_column("user_accounts", "status", server_default=sa.text("'active'"))


def downgrade():
    op.alter_column("user_accounts", "account_type", server_default=sa.text("'''paper'''"))
    op.alter_column("user_accounts", "currency", server_default=sa.text("'''USD'''"))
    op.alter_column("user_accounts", "status", server_default=sa.text("'''active'''"))
