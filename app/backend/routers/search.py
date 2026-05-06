from fastapi import APIRouter, Query
import httpx

search_router = APIRouter()

YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search?q="

@search_router.get("/search")
async def search_assets(q: str = Query(..., description="")):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/114.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{YAHOO_SEARCH_URL}{q}", headers=headers)
            response.raise_for_status()
            data = response.json()
            return {
                "quotes": data.get("quotes", [])
            }
        except httpx.RequestError as e:
            return {"error": f"Request failed: {str(e)}"}
        except Exception as e:
            return {"error": f"Something went wrong: {str(e)}"}