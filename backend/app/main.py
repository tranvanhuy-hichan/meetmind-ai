from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import ws
from app.container import build_container
from app.routes import auth, documents, google, meetings, minutes, orgs, transcript
from app.settings import DEV_SECRET, Settings, load_config
from core.errors import DomainError, Invalid, NotFound, PermissionDenied

log = logging.getLogger("meetmind")

_STATUS = {NotFound: 404, PermissionDenied: 403, Invalid: 400}


def create_app(settings: Settings | None = None, config: dict[str, Any] | None = None) -> FastAPI:
    settings = settings or Settings()
    config = config or load_config(settings.config_path)
    if settings.jwt_secret == DEV_SECRET:
        log.warning("MEETMIND_JWT_SECRET is not set: using the insecure development secret")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        container = build_container(settings, config)
        await container.repo.create_schema()
        await container.store.ensure_ready()
        recovered = await container.recover_interrupted()
        if recovered:
            log.info("closed %d meeting(s) that were live when the server stopped", len(recovered))
        app.state.container = container
        yield
        await container.close()

    app = FastAPI(title="MeetMind API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=_STATUS.get(type(exc), 400))

    for module in (auth, orgs, meetings, documents, transcript, minutes, google):
        app.include_router(module.router)
    app.include_router(meetings.languages_router)
    app.include_router(ws.router)

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app
