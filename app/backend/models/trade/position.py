from sqlalchemy import Column, String, Numeric, TIMESTAMP, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Position(Base):
    __tablename__ = "positions"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    account_id = Column(UUID(as_uuid=True), ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False)
    bot_id = Column(UUID(as_uuid=True), nullable=True)
    symbol = Column(String(20), nullable=False)
    side = Column(String(10), nullable=False)              # long, short
    quantity = Column(Numeric(18, 8), nullable=False)
    entry_order_id = Column(UUID(as_uuid=True), ForeignKey('orders.id'), nullable=False)
    exit_order_id = Column(UUID(as_uuid=True), ForeignKey('orders.id'), nullable=True)
    entry_price = Column(Numeric(18, 8), nullable=False)
    exit_price = Column(Numeric(18, 8), nullable=True)
    realised_pnl = Column(Numeric(18, 8), nullable=True)
    status = Column(String(20), nullable=False, server_default="'open'")
    opened_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    closed_at = Column(TIMESTAMP(timezone=True), nullable=True)