from __future__ import annotations

import os
from dataclasses import asdict
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from approval import ApprovalService
from config import Settings
from database import Database, Vacancy


class CoverLetterUpdate(BaseModel):
    cover_letter: str = Field(min_length=1, max_length=4000)


def _vacancy_payload(vacancy: Vacancy) -> dict[str, Any]:
    payload = asdict(vacancy)
    payload["status"] = vacancy.status.value
    return payload


def create_api_app(
    settings: Settings,
    database: Database,
    approval_service: ApprovalService,
) -> FastAPI:
    app = FastAPI(title="HH Job Agent Local API", version="0.1.0")
    api_key = os.environ.get("AGENT_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("AGENT_API_KEY is required when AGENT_API_ENABLED=true")

    async def require_key(x_agent_key: str | None = Header(default=None)) -> None:
        if x_agent_key != api_key:
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/stats", dependencies=[Depends(require_key)])
    async def stats() -> dict[str, Any]:
        latest = database.latest_search_run()
        return {
            "statuses": database.stats(),
            "applied_today": database.applied_today(),
            "available_application_slots": database.available_application_slots(
                settings.max_applications_per_day
            ),
            "latest_search_run": asdict(latest) if latest else None,
        }

    @app.get("/api/vacancies", dependencies=[Depends(require_key)])
    async def vacancies(
        status: str | None = None,
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> dict[str, Any]:
        items = database.list_vacancies(status=status, limit=limit, offset=offset)
        return {"items": [_vacancy_payload(item) for item in items]}

    @app.get("/api/vacancies/{job_id}", dependencies=[Depends(require_key)])
    async def vacancy(job_id: str) -> dict[str, Any]:
        item = database.get(job_id)
        if item is None:
            raise HTTPException(status_code=404, detail="vacancy_not_found")
        return _vacancy_payload(item)

    @app.patch("/api/vacancies/{job_id}/cover-letter", dependencies=[Depends(require_key)])
    async def update_cover_letter(job_id: str, body: CoverLetterUpdate) -> dict[str, Any]:
        if not database.update_cover_letter(job_id, body.cover_letter.strip()):
            raise HTTPException(status_code=409, detail="vacancy_not_editable")
        return {"ok": True}

    @app.post("/api/vacancies/{job_id}/apply", dependencies=[Depends(require_key)])
    async def apply(job_id: str) -> dict[str, Any]:
        result = await approval_service.approve_and_apply(job_id, settings.tg_user_id)
        if not result.ok:
            raise HTTPException(status_code=409, detail=result.message)
        return {"ok": True, "message": result.message}

    @app.post("/api/vacancies/{job_id}/skip", dependencies=[Depends(require_key)])
    async def skip(job_id: str) -> dict[str, Any]:
        result = approval_service.skip(job_id, settings.tg_user_id)
        if not result.ok:
            raise HTTPException(status_code=409, detail=result.message)
        return {"ok": True, "message": result.message}

    return app
