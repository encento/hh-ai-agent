from __future__ import annotations

import os
import threading
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException

from settings_store import SettingsStore


RESTART_EXIT_CODE = 75


def create_bootstrap_app() -> FastAPI:
    app = FastAPI(title="HH Job Agent Bootstrap API", version="0.1.0")
    store = SettingsStore()
    api_key = os.environ.get("AGENT_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("AGENT_API_KEY is required")

    async def require_key(x_agent_key: str | None = Header(default=None)) -> None:
        if x_agent_key != api_key:
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "mode": "setup"}

    @app.get("/api/settings", dependencies=[Depends(require_key)])
    async def get_settings() -> dict[str, Any]:
        data = store.public()
        data["setup_mode"] = True
        return data

    @app.put("/api/settings", dependencies=[Depends(require_key)])
    async def save_settings(body: dict[str, Any]) -> dict[str, Any]:
        try:
            result = store.update(body)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        result["setup_mode"] = True
        return result

    @app.post("/api/system/restart", dependencies=[Depends(require_key)])
    async def restart_agent() -> dict[str, Any]:
        threading.Timer(0.6, lambda: os._exit(RESTART_EXIT_CODE)).start()
        return {"ok": True, "message": "restarting"}

    @app.get("/api/stats", dependencies=[Depends(require_key)])
    async def stats() -> dict[str, Any]:
        return {
            "statuses": {},
            "applied_today": 0,
            "available_application_slots": 0,
            "setup_mode": True,
        }

    @app.get("/api/vacancies", dependencies=[Depends(require_key)])
    async def vacancies() -> dict[str, Any]:
        return {"items": [], "setup_mode": True}

    return app
