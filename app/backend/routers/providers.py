from fastapi import APIRouter
from routers.externalproviders import external_provider_router
from routers.publish_price import price_router
from routers.search import search_router
from routers.stocks.stocks import stock_router

provider_router = APIRouter()
provider_router.include_router(stock_router)
provider_router.include_router(search_router)
provider_router.include_router(price_router)
provider_router.include_router(external_provider_router)
