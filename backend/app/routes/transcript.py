from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, Query

from app.container import Container
from app.deps import current_user, get_container
from core.models import User
from core.services.meetings import validate_lang

router = APIRouter(prefix="/api/meetings/{meeting_id}/transcript", tags=["transcript"])


@router.get("")
async def get_transcript(
    meeting_id: str,
    lang: str | None = Query(None),
    user: User = Depends(current_user),
    c: Container = Depends(get_container),
) -> dict:
    await c.access.member(meeting_id, user.id)
    lang = validate_lang(lang)
    segments = await c.repo.list_segments(meeting_id)
    translations = await c.repo.list_translations(meeting_id, lang) if lang else {}
    return {
        "lang": lang,
        "segments": [
            {**asdict(s), "translation": translations[s.id].text if s.id in translations else None}
            for s in segments
        ],
    }


@router.post("/translate", status_code=202)
async def translate_transcript(
    meeting_id: str,
    lang: str = Query(...),
    user: User = Depends(current_user),
    c: Container = Depends(get_container),
) -> dict:
    """Translate whatever is still missing for `lang`. Runs in the background; results arrive over the socket."""
    await c.access.member(meeting_id, user.id)
    target = validate_lang(lang)
    if target:
        c.spawn(c.translation.backfill(meeting_id, target, limit=1000))
    return {"ok": True}
