from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from utils.auth import get_current_user
from models.user.useraccount import UserAccount

profile_router = APIRouter()

@profile_router.get("/accounts")
async def get_user_account(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(UserAccount).where(UserAccount.user_id == current_user.id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")

    return {
        "account_type": account.account_type,
        "balance": float(account.balance),
        "currency": account.currency,
        "status": account.status,
    }