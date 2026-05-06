from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models.trade.position import Position

async def get_tracked_tickers(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(Position.symbol).where(
            Position.status == "open",
        ).distinct()
    )
    return [row.symbol for row in result.fetchall()]