from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.executors.asyncio import AsyncIOExecutor
from database import database
from helpers.structlogger import logger

scheduler = AsyncIOScheduler(executors={"default": AsyncIOExecutor()})

