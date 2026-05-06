
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from routers.auth.auth import get_current_user
from models.trade.position import Position
from models.user.useraccount import UserAccount

portfolio_router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@portfolio_router.get("/")
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Step 1 — resolve account_id from the current user
    account_result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.id)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        return {"history": [], "stats": {}}

    # Step 2 — fetch all closed positions for that account
    result = await db.execute(
        select(Position).where(
            Position.account_id == account.id,
            Position.status == "closed",
        ).order_by(Position.closed_at.desc())
    )
    positions = result.scalars().all()

    if not positions:
        return {
            "history": [],
            "stats": {
                "total_realised_pnl": 0.0,
                "trade_count":        0,
                "wins":               0,
                "losses":             0,
                "win_rate":           0.0,
                "avg_pnl_per_trade":  0.0,
                "best_trade":         0.0,
                "worst_trade":        0.0,
            }
        }

    history = [
        {
            "id":           str(p.id),
            "symbol":       p.symbol,
            "side":         p.side,
            "quantity":     float(p.quantity),
            "entry_price":  float(p.entry_price),
            "exit_price":   float(p.exit_price) if p.exit_price else None,
            "realised_pnl": float(p.realised_pnl) if p.realised_pnl else None,
            "opened_at":    p.opened_at.isoformat(),
            "closed_at":    p.closed_at.isoformat() if p.closed_at else None,
        }
        for p in positions
    ]

    # Only aggregate positions where realised_pnl was actually recorded
    pnl_values = [float(p.realised_pnl) for p in positions if p.realised_pnl is not None]

    wins   = [v for v in pnl_values if v > 0]
    losses = [v for v in pnl_values if v <= 0]

    stats = {
        "total_realised_pnl": round(sum(pnl_values), 2),
        "trade_count":        len(positions),
        "wins":               len(wins),
        "losses":             len(losses),
        "win_rate":           round(len(wins) / len(pnl_values) * 100, 1) if pnl_values else 0.0,
        "avg_pnl_per_trade":  round(sum(pnl_values) / len(pnl_values), 2) if pnl_values else 0.0,
        "best_trade":         round(max(pnl_values), 2) if pnl_values else 0.0,
        "worst_trade":        round(min(pnl_values), 2) if pnl_values else 0.0,
    }

    return {"history": history, "stats": stats}