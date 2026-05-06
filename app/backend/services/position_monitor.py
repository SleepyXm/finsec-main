import asyncio
import redis.asyncio as redis
import json
import os
from decimal import Decimal
from sqlalchemy.future import select
from sqlalchemy import update
from database import AsyncSessionLocal
from models.trade.position import Position
from models.trade.order import Order
from models.user.useraccount import UserAccount
from datetime import datetime, timezone
import uuid
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

async def close_position(db, position, current_price: float, reason: str):
    exit_order = Order(
        id=uuid.uuid4(),
        account_id=position.account_id,
        bot_id=position.bot_id,
        symbol=position.symbol,
        side="sell" if position.side == "long" else "buy",
        order_type="market",
        quantity=position.quantity,
        price=Decimal(str(current_price)),
        status="filled",
    )
    db.add(exit_order)
    await db.flush()

    direction = 1 if position.side == "long" else -1
    pnl = float(position.quantity) * (current_price - float(position.entry_price)) * direction

    await db.execute(
        update(Position)
        .where(Position.id == position.id)
        .values(
            status="closed",
            exit_price=Decimal(str(current_price)),
            exit_order_id=exit_order.id,
            realised_pnl=Decimal(str(pnl)),
            closed_at=datetime.now(timezone.utc),
        )
    )

    # settle pnl into account balance
    await db.execute(
        update(UserAccount)
        .where(UserAccount.id == position.account_id)
        .values(balance=UserAccount.balance + Decimal(str(pnl)))
    )

    await db.commit()
    return pnl


async def monitor_positions(r: redis.Redis):
    pubsub = r.pubsub()
    await pubsub.psubscribe("price:*")

    async for message in pubsub.listen():
        if message["type"] != "pmessage":
            continue

        try:
            data = json.loads(message["data"])
            symbol = message["channel"].split(":", 1)[1]
            current_price = float(data["close"])
        except Exception:
            continue

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Position).where(
                    Position.symbol == symbol,
                    Position.status == "open",
                )
            )
            positions = result.scalars().all()

        # group unrealised PnL by account
        account_unrealised: dict[str, float] = {}

        for position in positions:
            direction = 1 if position.side == "long" else -1
            unrealised = float(position.quantity) * (current_price - float(position.entry_price)) * direction

            # check exit trigger
            if position.exit_price is not None:
                target = float(position.exit_price)
                hit = (
                    position.side == "long" and current_price >= target
                ) or (
                    position.side == "short" and current_price <= target
                )

                if hit:
                    async with AsyncSessionLocal() as db:
                        result = await db.execute(select(Position).where(Position.id == position.id))
                        fresh = result.scalar_one_or_none()
                        if not fresh or fresh.status != "open":
                            continue
                        pnl = await close_position(db, fresh, current_price, "exit_price")

                    await r.publish(f"position:closed:{position.account_id}", json.dumps({
                        "position_id": str(position.id),
                        "symbol": symbol,
                        "pnl": pnl,
                        "reason": "exit_price",
                    }))
                    continue  # don't add unrealised for a just-closed position

            account_id = str(position.account_id)
            account_unrealised[account_id] = account_unrealised.get(account_id, 0) + unrealised

            # per-position update to whoever is watching
            await r.publish(f"position:pnl:{position.id}", json.dumps({
                "position_id": str(position.id),
                "symbol": symbol,
                "unrealised_pnl": round(unrealised, 8),
                "current_price": current_price,
            }))

        # account-level rollup
        for account_id, total_unrealised in account_unrealised.items():
            await r.publish(f"account:pnl:{account_id}", json.dumps({
                "account_id": account_id,
                "unrealised_pnl": round(total_unrealised, 8),
            }))


async def main():
    r = redis.from_url(REDIS_URL)
    await monitor_positions(r)


if __name__ == "__main__":
    asyncio.run(main())