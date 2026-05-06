from jose import JWTError, jwt
from fastapi import Request, HTTPException
from utils.config import SECRET_KEY, ALGORITHM, REFRESH_TOKEN_EXPIRE_DAYS
from sqlalchemy.future import select
from database import AsyncSessionLocal
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from uuid import UUID
from helpers.redis import redis_client


def decode_refresh_token(token: str) -> str:
    """Returns user_id or raises HTTPException."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        return payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid or expired refresh token")



async def get_stored_refresh_token(token: str) -> str:
    user_id = await redis_client.get(f"refresh:{token}")
    if not user_id:
        raise HTTPException(401, "Refresh token invalid or expired")
    return user_id



async def store_refresh_token(user_id: str, token: str):
    key = f"refresh:{token}"
    ttl = 60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS
    await redis_client.setex(key, ttl, user_id)





async def verify_refresh_token(token: str) -> str:
    """Returns user_id if valid, raises 401 otherwise."""
    key = f"refresh:{token}"
    user_id = await redis_client.get(key)
    if not user_id:
        raise HTTPException(401, "Refresh token invalid or expired")
    return user_id






async def revoke_refresh_token(token: str):
    await redis_client.delete(f"refresh:{token}")

