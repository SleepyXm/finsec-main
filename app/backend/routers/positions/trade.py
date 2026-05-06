from fastapi import APIRouter, HTTPException, Depends
from models.trade.order import Order
from models.trade.position import Position
from models.user.useraccount import UserAccount
from routers.backtest.backtest import BACKTEST_SESSION_TTL
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update
from decimal import Decimal
from datetime import datetime, timezone
from database import get_db
from utils.auth import get_current_user
from schemas import TradeAction, CloseTradeRequest
from helpers.redis import redis_client
import uuid, json

trades_router = APIRouter()


@trades_router.post("/trade")
async def place_trade(
    trade: TradeAction,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    if trade.session_id:
        # Redis path
        position = {
            "id":          str(uuid.uuid4()),
            "symbol":      trade.ticker,
            "side":        "long" if trade.action == "buy" else "short",
            "quantity":    trade.quantity,
            "entry_price": trade.price,
            "status":      "open",
            "opened_at":   datetime.now(timezone.utc).isoformat(),
        }
        positions_key = f"backtest:positions:{trade.session_id}"
        cached = await redis_client.get(positions_key)
        positions = json.loads(cached) if cached else []
        positions.append(position)
        await redis_client.setex(positions_key, BACKTEST_SESSION_TTL, json.dumps(positions))
        return {"message": "Trade recorded", "data": position}

    entry_order = Order(
        account_id=account.id,
        bot_id=None,
        symbol=trade.ticker,
        side=trade.action,
        order_type="market",
        quantity=trade.quantity,
        price=trade.price,
        status="filled",
    )
    db.add(entry_order)
    await db.flush()

    position = Position(
        account_id=account.id,
        bot_id=None,
        symbol=trade.ticker,
        side="long" if trade.action == "buy" else "short",
        quantity=trade.quantity,
        entry_order_id=entry_order.id,
        entry_price=trade.price,
        status="open",
    )
    db.add(position)
    await db.commit()
    await db.refresh(position)

    return {
        "message": "Trade recorded",
        "data": {
            "position_id": str(position.id),
            "symbol": trade.ticker,
            "side": position.side,
            "quantity": trade.quantity,
            "entry_price": trade.price,
            "status": "open",
        },
    }


@trades_router.delete("/trade/{trade_id}")
async def close_trade(
    trade_id: str,
    body: CloseTradeRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user)
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Backtest path
    if body.session_id:
        positions_key = f"backtest:positions:{body.session_id}"
        cached = await redis_client.get(positions_key)
        positions = json.loads(cached) if cached else []

        position = next((p for p in positions if p["id"] == trade_id), None)
        if not position:
            raise HTTPException(404, "Position not found")

        position["status"]       = "closed"
        position["exit_price"]   = body.exit_price
        position["realised_pnl"] = body.realised_pnl
        position["closed_at"]    = datetime.now(timezone.utc).isoformat()

        positions = [p for p in positions if p["id"] != trade_id]
        await redis_client.setex(positions_key, BACKTEST_SESSION_TTL, json.dumps(positions))

        trades_key = f"backtest:trades:{body.session_id}"
        cached_trades = await redis_client.get(trades_key)
        trades = json.loads(cached_trades) if cached_trades else []
        trades.append(position)
        await redis_client.setex(trades_key, BACKTEST_SESSION_TTL, json.dumps(trades))

        balance_key = f"backtest:balance:{body.session_id}"
        cached_balance = await redis_client.get(balance_key)
        current_balance = float(cached_balance) if cached_balance else account.balance
        await redis_client.setex(balance_key, BACKTEST_SESSION_TTL, str(float(current_balance) + float(body.realised_pnl)))

        return {"message": "Position closed", "data": position}


    result = await db.execute(
        select(Position).where(
            Position.id == trade_id,
            Position.account_id == account.id,
            Position.status == "open",
        )
    )
    position = result.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    exit_order = Order(
        account_id=account.id,
        bot_id=None,
        symbol=position.symbol,
        side="sell" if position.side == "long" else "buy",
        order_type="market",
        quantity=position.quantity,
        price=body.exit_price,
        status="filled",
    )
    db.add(exit_order)
    await db.flush()

    position.status = "closed"
    position.exit_order_id = exit_order.id
    position.exit_price = body.exit_price
    position.realised_pnl = body.realised_pnl
    position.closed_at = datetime.now(timezone.utc)

    await db.execute(
        update(UserAccount)
        .where(UserAccount.id == account.id)
        .values(balance=UserAccount.balance + Decimal(str(body.realised_pnl)))
    )
    await db.commit()

    return {
        "message": "Position closed",
        "data": {
            "position_id": str(position.id),
            "symbol": position.symbol,
            "side": position.side,
            "exit_price": body.exit_price,
            "realised_pnl": body.realised_pnl,
            "closed_at": position.closed_at,
            "status": "closed",
        },
    }