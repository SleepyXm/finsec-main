# 004_update_user_accounts.py



from alembic import op
import sqlalchemy as sa

revision = '004_update_user_accounts'
down_revision = '003_prefs_favs_lvrg'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_accounts', sa.Column('net_pnl',     sa.Numeric(14, 2), nullable=False, server_default='0'))
    op.add_column('user_accounts', sa.Column('trade_count', sa.Integer(),       nullable=False, server_default='0'))
    op.add_column('user_accounts', sa.Column('wins',        sa.Integer(),       nullable=False, server_default='0'))
    op.add_column('user_accounts', sa.Column('losses',      sa.Integer(),       nullable=False, server_default='0'))
    op.add_column('user_accounts', sa.Column('best_trade',  sa.Numeric(14, 2), nullable=False, server_default='0'))
    op.add_column('user_accounts', sa.Column('worst_trade', sa.Numeric(14, 2), nullable=False, server_default='0'))

    # Backfill from existing closed positions so stats aren't zeroed out
    op.execute("""
        UPDATE user_accounts a
        SET
            net_pnl     = sub.total,
            trade_count = sub.cnt,
            wins        = sub.wins,
            losses      = sub.losses,
            best_trade  = sub.best,
            worst_trade = sub.worst
        FROM (
            SELECT
                account_id,
                SUM(realised_pnl)                         AS total,
                COUNT(*)                                  AS cnt,
                COUNT(*) FILTER (WHERE realised_pnl > 0)  AS wins,
                COUNT(*) FILTER (WHERE realised_pnl <= 0) AS losses,
                MAX(realised_pnl)                         AS best,
                MIN(realised_pnl)                         AS worst
            FROM positions
            WHERE status = 'closed'
              AND realised_pnl IS NOT NULL
            GROUP BY account_id
        ) sub
        WHERE a.id = sub.account_id
    """)


def downgrade() -> None:
    op.drop_column('user_accounts', 'worst_trade')
    op.drop_column('user_accounts', 'best_trade')
    op.drop_column('user_accounts', 'losses')
    op.drop_column('user_accounts', 'wins')
    op.drop_column('user_accounts', 'trade_count')
    op.drop_column('user_accounts', 'net_pnl')