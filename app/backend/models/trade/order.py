from sqlalchemy import Column, String, Numeric, TIMESTAMP, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    account_id = Column(UUID(as_uuid=True), ForeignKey('user_accounts.id', ondelete='CASCADE'), nullable=False)
    bot_id = Column(UUID(as_uuid=True), nullable=True)
    symbol = Column(String(20), nullable=False)
    side = Column(String(10), nullable=False)
    order_type = Column(String(20), nullable=False)
    quantity = Column(Numeric(18, 8), nullable=False)
    price = Column(Numeric(18, 8), nullable=True)
    stop_price = Column(Numeric(18, 8), nullable=True)
    status = Column(String(20), nullable=False, server_default="'pending'")
    external_order_id = Column(String(255), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())