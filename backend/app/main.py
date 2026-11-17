"""UFAA Compliance Portal API (FastAPI + Motor/MongoDB).

Run from the backend folder:  uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import settings
from .routers import admin_core, admin_data, admin_reports, assets, auth, drafts, letters

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(title="UFAA Compliance Portal API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

for router in (auth.router, assets.router, letters.router, drafts.router,
               admin_core.router, admin_data.router, admin_reports.router):
    app.include_router(router)


@app.get("/api/health")
async def health():
    await db.get_db().command("ping")
    return {"status": "ok"}
