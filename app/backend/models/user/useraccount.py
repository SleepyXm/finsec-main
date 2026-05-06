from sqlalchemy import Column, String, Numeric, TIMESTAMP, ForeignKey, Boolean, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class UserAccount(Base):
    __tablename__ = "user_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    account_type = Column(String(50), nullable=False, server_default="paper")
    balance = Column(Numeric(18, 8), nullable=False, server_default='0')
    currency = Column(String(10), nullable=False, server_default="USD")
    status = Column(String(20), nullable=False, server_default="active")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())