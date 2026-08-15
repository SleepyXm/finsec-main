import secrets
from typing import Literal

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, SecretStr
from utils import config

external_provider_router = APIRouter()

SAXO_HORIZONS = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 1440}
IG_RESOLUTIONS = {
    "1m": "MINUTE",
    "5m": "MINUTE_5",
    "15m": "MINUTE_15",
    "30m": "MINUTE_30",
    "1h": "HOUR",
    "1d": "DAY",
}

SAXO_URLS = {
    "demo": "https://gateway.saxobank.com/sim/openapi",
    "live": "https://gateway.saxobank.com/openapi",
}

IG_URLS = {
    "demo": "https://demo-api.ig.com/gateway/deal",
    "live": "https://api.ig.com/gateway/deal",
}


class BrokerChartRequest(BaseModel):
    environment: Literal["demo", "live"]
    access_token: SecretStr
    interval: Literal["1m", "5m", "15m", "30m", "1h", "1d"]

    account_key: str | None = None
    uic: int | None = Field(default=None, gt=0)
    asset_type: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9]{1,39}$")

    account_id: str | None = None
    api_key: SecretStr | None = None
    epic: str | None = Field(default=None, pattern=r"^[A-Za-z0-9._:-]{1,100}$")


@external_provider_router.post("/internal/{broker}/chart")
async def get_broker_chart(
    broker: Literal["saxo", "ig"],
    request: BrokerChartRequest,
    x_internal_secret: str | None = Header(default=None),
):
    configured = config.INTERNAL_SECRET or ""
    if not configured or not x_internal_secret or not secrets.compare_digest(configured, x_internal_secret):
        raise HTTPException(status_code=401, detail="Invalid internal credentials")

    if broker == "saxo":
        return await get_saxo_chart(request)

    return await get_ig_chart(request)


async def get_saxo_chart(request: BrokerChartRequest):
    if not request.account_key or request.uic is None or not request.asset_type:
        raise HTTPException(status_code=400, detail="Saxo account key, UIC, and asset type are required")

    headers = {"Authorization": f"Bearer {request.access_token.get_secret_value()}"}
    params = {
        "AccountKey": request.account_key,
        "AssetType": request.asset_type,
        "Count": 1200,
        "FieldGroups": "Data,ChartInfo,DisplayAndFormat",
        "Horizon": SAXO_HORIZONS[request.interval],
        "Uic": request.uic,
    }

    try:
        async with httpx.AsyncClient(base_url=SAXO_URLS[request.environment], timeout=10.0) as client:
            response = await client.get("/chart/v3/charts", headers=headers, params=params)
    except httpx.RequestError as error:
        raise HTTPException(status_code=502, detail="Saxo chart service is unavailable") from error

    if response.status_code in {401, 403}:
        raise HTTPException(status_code=403, detail="Saxo connection expired")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Saxo rate limit reached")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"Saxo returned HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Saxo returned invalid JSON") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("Data"), list):
        raise HTTPException(status_code=502, detail="Saxo returned invalid chart data")

    return payload


async def get_ig_chart(request: BrokerChartRequest):
    if not request.account_id or not request.epic:
        raise HTTPException(status_code=400, detail="IG account ID and epic are required")

    supplied_api_key = request.api_key.get_secret_value() if request.api_key else ""
    api_key = supplied_api_key or getattr(config, "IG_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="IG API key is not configured")

    headers = {
        "Authorization": f"Bearer {request.access_token.get_secret_value()}",
        "X-IG-API-KEY": api_key,
        "IG-ACCOUNT-ID": request.account_id,
        "Version": "2",
    }

    path = f"/prices/{request.epic}/{IG_RESOLUTIONS[request.interval]}/1200"

    try:
        async with httpx.AsyncClient(base_url=IG_URLS[request.environment], timeout=10.0) as client:
            response = await client.get(path, headers=headers)
    except httpx.RequestError as error:
        raise HTTPException(status_code=502, detail="IG chart service is unavailable") from error

    if response.status_code in {401, 403}:
        raise HTTPException(status_code=403, detail="IG connection expired")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="IG rate limit reached")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"IG returned HTTP {response.status_code}")

    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="IG returned invalid JSON") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("prices"), list):
        raise HTTPException(status_code=502, detail="IG returned invalid chart data")

    return payload