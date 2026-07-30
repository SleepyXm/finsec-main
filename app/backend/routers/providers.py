from fastapi import APIRouter

provider_router = APIRouter()

FINSEC_PROVIDER = "finsec"
PROVIDERS = [
    {"id": FINSEC_PROVIDER, "name": "Finsec"},
]


def normalize_provider(value: str) -> str:
    provider = value.strip().lower()
    if provider != FINSEC_PROVIDER:
        raise ValueError("Unsupported provider")
    return provider


@provider_router.get("/providers")
async def list_providers():
    return {"providers": PROVIDERS}
