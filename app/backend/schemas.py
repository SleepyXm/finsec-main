from pydantic import BaseModel, ValidationError, field_validator
from datetime import datetime
from typing import Optional, Any, Dict, List
from uuid import UUID

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

    @field_validator('email')
    def email_must_contain_symbol(cls, v):
        if '@' not in v:
            raise ValueError('must contain @ symbol')
        return v

class UserLogin(BaseModel):
    email: str
    password: str
    twofa_code: Optional[str] = None


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    password: str
    created_at: datetime

    class Config:
        from_attributes = True

class CheckoutRequest(BaseModel):
    price_id: str


class MessageInput(BaseModel):
    user_input: str

class TradeAction(BaseModel):
    ticker: str
    action: str
    price: float
    quantity: float
    session_id: Optional[str] = None  # if present → backtest trade

class CloseTradeRequest(BaseModel):
    exit_price: float
    realised_pnl: float
    session_id: Optional[str] = None