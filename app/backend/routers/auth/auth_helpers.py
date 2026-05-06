from database import get_db
import httpx, uuid, resend, os, hashlib, base64
from fastapi import Response
from fastapi.responses import RedirectResponse
from utils.auth import create_access_token, set_auth_cookie
from utils.security import encrypt, decrypt
from utils.config import RESEND_API_KEY, DEV_SERVER_BACKEND, DEV_SERVER

def auth_redirect(user_id: str) -> Response:
    token = create_access_token(user_id)
    resp = RedirectResponse(f"{DEV_SERVER}/login/callback")
    return set_auth_cookie(resp, token)



async def send_verification_email(email: str, token: str):
    verification_url = f"{DEV_SERVER_BACKEND}/auth/verify?token={token}"
    resend.Emails.send({
        "from": "team@devolib.com",
        "to": email,
        "subject": "Verify your email",
        "html": f"""
            <h2>Welcome!</h2>
            <p>Click the link below to verify your email:</p>
            <a href="{verification_url}">Verify Email</a>
            <p>This link expires in 24 hours.</p>
        """
    })