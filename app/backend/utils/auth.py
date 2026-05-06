from datetime import datetime, timedelta
from jose import JWTError, jwt
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.future import select
from database import AsyncSessionLocal
from models.user.user import User
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
from uuid import UUID

def create_access_token(username: str):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": username, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(user_id: str):
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None

async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    if token.startswith("Bearer "):
        token = token[len("Bearer "):]

    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def set_auth_cookie(resp: JSONResponse, access_token: str, refresh_token: str) -> JSONResponse:
    resp.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=60 * ACCESS_TOKEN_EXPIRE_MINUTES,
        path="/",
        secure=True,
        samesite="lax",
    )
    resp.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,
        path="/api/auth/refresh",
        secure=True,
        samesite="lax",
    )
    return resp