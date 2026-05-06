from fastapi import APIRouter, Depends
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from utils.auth import get_current_user
from models.trade.position import Position
from models.user.useraccount import UserAccount

positions_router = APIRouter()

@positions_router.get("/positions")
async def get_open_positions(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.id)
    )
    account = result.scalar_one_or_none()
    if not account:
        return []

    result = await db.execute(
        select(Position).where(
            Position.account_id == account.id,
            Position.status == "open",
        )
    )
    positions = result.scalars().all()

    return [
        {
            "position_id": str(p.id),
            "symbol": p.symbol,
            "side": p.side,
            "quantity": float(p.quantity),
            "entry_price": float(p.entry_price),
            "status": p.status,
            "opened_at": p.opened_at,
        }
        for p in positions
    ]