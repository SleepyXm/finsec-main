from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi import Response
from sqlalchemy.future import select
from sqlalchemy import update
from database import AsyncSessionLocal
from models.user.user import User
from models.user.useraccount import UserAccount
from utils.auth import create_access_token, create_refresh_token, get_current_user, set_auth_cookie
from utils.security import hash_password, verify_password, DUMMY_PASSWORD_HASH
from routers.auth.auth_helpers import send_verification_email
from schemas import UserCreate, UserLogin
from helpers.limiter import limiter
from utils.config import DEV_SERVER
from utils.tokens import decode_refresh_token, get_stored_refresh_token, revoke_refresh_token, store_refresh_token
import uuid, secrets

auth_router = APIRouter()


@auth_router.post("/signup")
@limiter.limit("5/minute")
async def signup(request: Request, user: UserCreate):
    for field, value in [("password", user.password), ("email", user.email), ("username", user.username)]:
        if value is None:
            raise HTTPException(status_code=400, detail=f"{field} can't be empty")

    async with AsyncSessionLocal() as db:
        existing_user = await db.execute(select(User).where(User.username == user.username))
        if existing_user.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Username taken, try another.")

        existing_email = await db.execute(select(User).where(User.email == user.email))
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")

        hashed_pw = hash_password(user.password)
        verification_token = secrets.token_urlsafe(32)

        new_user = User(
            id=uuid.uuid4(),
            username=user.username,
            email=user.email,
            password=hashed_pw,
            verification_token=verification_token,
            verified=False,
        )
        db.add(new_user)
        await db.flush()

        new_account = UserAccount(
            id=uuid.uuid4(),
            user_id=new_user.id,
            account_type="paper",
            balance=100000,
            currency="USD",
            status="active",
        )
        db.add(new_account)
        await db.commit()

    await send_verification_email(user.email, verification_token)
    return {"message": "User created successfully"}


@auth_router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, user: UserLogin):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == user.email))
        db_user = result.scalar_one_or_none()

    password_hash = db_user.password if db_user is not None else DUMMY_PASSWORD_HASH
    if not verify_password(user.password, password_hash) or db_user is None:
        raise HTTPException(400, "Email or Password Incorrect")

    user_id = str(db_user.id)
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)
    await store_refresh_token(user_id, refresh_token)

    resp = JSONResponse(content={
        "message": "Login successful",
        "email": db_user.email,
        "username": db_user.username,
    })
    return set_auth_cookie(resp, access_token, refresh_token)



@auth_router.post("/refresh")
async def refresh(request: Request):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Missing refresh token")

    user_id = decode_refresh_token(token)
    stored = await get_stored_refresh_token(token)
    await revoke_refresh_token(stored)

    new_access = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)
    await store_refresh_token(user_id, new_refresh)

    resp = JSONResponse(content={"message": "Token refreshed"})
    return set_auth_cookie(resp, new_access, new_refresh)


@auth_router.get("/verify")
async def verify_email(token: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.verification_token == token))
        user = result.scalar_one_or_none()

        if not user:
            return RedirectResponse(f"{DEV_SERVER}/login?error=invalid_token")

        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(verified=True, verification_token=None)
        )
        await db.commit()

    return RedirectResponse(f"{DEV_SERVER}/login?verified=true")


@auth_router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserAccount).where(UserAccount.user_id == current_user.id)
        )
        account = result.scalar_one_or_none()

    return {
        "user": {
            "username": current_user.username,
            "email": current_user.email,
        },
        "account": {
            "account_type": account.account_type,
            "balance": str(account.balance),
            "currency": account.currency,
            "status": account.status,
        } if account else None
    }

@auth_router.post("/logout")
async def logout(request: Request):
    token = request.cookies.get("refresh_token")
    if token:
        await revoke_refresh_token(token)

    resp = JSONResponse(content={"message": "Logged out"})
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/api/auth/refresh")
    return resp


@auth_router.get("/hi")
async def hi():
    return {"message": "Auth router is working!"}