# 003_add_preferences_favourites_leverage.py
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

revision = '003_prefs_favs_lvrg'
down_revision = '002_add_stop_loss_take_profit'
branch_labels = None
depends_on = None


# 003 Adding user preferences: Contains chart colour / colour scheme, could work really well as a jsonb cached object on browser
# and only update on changes. Would be a nice touch to have some pre-set themes (dark, light, etc) and then allow users to customise from there if they want. 
# Could also add some other preferences in here in the future like default watchlist, default dashboard layout, etc.


# Adding favourite assets too, so users can easily add them to watchlists / charts etc. without having to search for them every time.
# Could be a simple list of tickers that we can cache on the frontend and update whenever they add/remove from favourites.

# Preference for push notifications. Disclaimer that no links will be sent for security reasons, 
# but we can send basic text notifications for things like price alerts, news alerts, etc. 
# Would be a nice feature to have for active traders who want to stay on top of the markets.

# Default timeframes, so users can set their default intervals on asset view.

# Leverage, quantity


def upgrade():
    op.create_table(
        'assets',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),

        sa.Column('symbol', sa.String(20), nullable=False, unique=True),   # BTCUSD, AAPL, etc
        sa.Column('name', sa.String(100), nullable=True),                  # Bitcoin, Apple Inc.

        sa.Column('asset_type', sa.String(20), nullable=False),            # crypto / stock / forex / etc
        sa.Column('exchange', sa.String(50), nullable=True),               # Binance, NYSE, etc

        sa.Column('base_currency', sa.String(10), nullable=True),          # BTC, USD, EUR
        sa.Column('quote_currency', sa.String(10), nullable=True),         # USD, USDT, etc

        sa.Column('is_active', sa.Boolean, server_default=sa.text('true')),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('ix_assets_symbol', 'assets', ['symbol'])

    # -------------- User Preferences Table -------------- # 
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer, primary_key=True),

        sa.Column(
            'user_id',
            UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
            unique=True
        ),

        # UI / theme
        sa.Column('theme', sa.String(50), server_default='dark'),
        sa.Column('color_scheme', postgresql.JSONB, server_default=sa.text("'{}'")),

        # trading defaults
        sa.Column('default_timeframe', sa.String(10), server_default='1h'),
        sa.Column('default_order_size', sa.Numeric(18, 8), nullable=True),

        # localisation
        sa.Column('timezone', sa.String(50), server_default='UTC'),

        # notifications
        sa.Column('push_notifications_enabled', sa.Boolean, server_default=sa.text('true')),
        sa.Column('price_alerts_enabled', sa.Boolean, server_default=sa.text('true')),
        sa.Column('news_alerts_enabled', sa.Boolean, server_default=sa.text('false')),

        # UI layout state
        sa.Column('dashboard_layout', postgresql.JSONB, server_default=sa.text("'{}'")),

        # future-proof escape hatch
        sa.Column('extra', postgresql.JSONB, server_default=sa.text("'{}'")),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


    # -------------- User Favourites Table -------------- # 

    op.create_table(
        'user_favourite_assets',
        sa.Column(
            'user_id',
            UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            primary_key=True
        ),
        sa.Column(
            'asset_id',
            UUID(as_uuid=True),
            sa.ForeignKey('assets.id', ondelete='CASCADE'),
            primary_key=True
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


    # -------------- User Indexes for Performance -------------- # 
    # indexes for fast lookup (important for UI performance)
    op.create_index(
        'ix_user_favourite_assets_user_id',
        'user_favourite_assets',
        ['user_id']
    )

    op.create_index(
        'ix_user_favourite_assets_asset_id',
        'user_favourite_assets',
        ['asset_id']
    )


    # -------------- Leverage Columns -------------- # 

    op.add_column(
        'user_accounts',
        sa.Column('leverage', sa.Numeric(18, 8), server_default='1.0', nullable=False)
    )

    # optional but recommended for future validation logic
    op.add_column(
        'user_accounts',
        sa.Column('max_leverage', sa.Numeric(18, 8), nullable=True)
    )



def downgrade():
    op.drop_table('user_preferences')
    op.drop_table('user_favourite_assets')
    op.drop_column('user_accounts', 'leverage')
    op.drop_column('user_accounts', 'max_leverage')