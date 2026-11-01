from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel

from app.container import Container
from app.deps import current_user, get_container
from core.errors import Invalid, NotFound
from core.models import MinutesRecord, User
from core.services.minutes import minutes_to_dict
from core.services.topics import meeting_topic

router = APIRouter(prefix="/api/meetings/{meeting_id}/minutes", tags=["minutes"])


class MinutesBody(BaseModel):
    minutes: dict
    status: str = "draft"


def _view(record: MinutesRecord) -> dict:
    return {"minutes": minutes_to_dict(record.minutes), "status": record.status, "updated_at": record.updated_at}


@router.get("")
async def get_minutes(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict | None:
    await c.access.member(meeting_id, user.id)
    record = await c.minutes.get(meeting_id)
    return _view(record) if record else None


@router.post("/generate")
async def generate_minutes(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.access.manager(meeting_id, user.id)
    record = await c.minutes.generate(meeting_id)
    await c.bus.publish(meeting_topic(meeting_id), {"type": "minutes.ready"})
    return _view(record)


@router.put("")
async def save_minutes(meeting_id: str, body: MinutesBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.access.manager(meeting_id, user.id)
    return _view(await c.minutes.update(meeting_id, body.minutes, body.status))


@router.get("/export")
async def export_minutes(
    meeting_id: str,
    format: str = Query("docx"),
    user: User = Depends(current_user),
    c: Container = Depends(get_container),
) -> Response:
    await c.access.member(meeting_id, user.id)
    exporter = c.exporters.get(format)
    if exporter is None:
        raise Invalid("Định dạng xuất không được hỗ trợ")
    record = await c.minutes.get(meeting_id)
    if record is None:
        raise NotFound("Chưa có biên bản")
    meeting = await c.access.meeting(meeting_id)
    data = exporter.export(meeting, record.minutes, await c.meetings.participants(meeting_id))
    filename = quote(f"Bien-ban-{meeting.title}.{exporter.extension}")
    return Response(
        data,
        media_type=exporter.content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
