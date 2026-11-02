from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.container import Container
from app.deps import current_user, get_container
from adapters.meet.zoom import sdk_signature
from core.errors import Invalid
from core.languages import LANGUAGES
from core.models import Meeting, Participant, User
from core.platforms import zoom_meeting_number
from core.services.documents import document_view

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class CreateBody(BaseModel):
    org_id: str
    title: str
    meet_url: str | None = None
    platform: str | None = None
    scheduled_at: datetime | None = None


class JoinBody(BaseModel):
    invite_code: str


class UpdateBody(BaseModel):
    meet_url: str | None = None


class LangBody(BaseModel):
    display_lang: str | None = None


class RoleBody(BaseModel):
    role: str


class InviteBody(BaseModel):
    emails: list[str] = Field(max_length=200)


def meeting_view(meeting: Meeting, role: str) -> dict:
    can_manage = role in ("host", "cohost")
    return {
        "id": meeting.id,
        "org_id": meeting.org_id,
        "title": meeting.title,
        "status": meeting.status,
        "meet_url": meeting.meet_url,
        "platform": meeting.platform,
        "invite_code": meeting.invite_code if can_manage else None,
        "scheduled_at": meeting.scheduled_at,
        "started_at": meeting.started_at,
        "ended_at": meeting.ended_at,
        "created_at": meeting.created_at,
        "role": role,
    }


def participant_view(p: Participant) -> dict:
    return {"user_id": p.user_id, "name": p.name, "email": p.email, "role": p.role, "display_lang": p.display_lang}


@router.get("")
async def list_meetings(user: User = Depends(current_user), c: Container = Depends(get_container)) -> list[dict]:
    return [meeting_view(m, role) for m, role in await c.repo.list_meetings_for_user(user.id)]


@router.post("")
async def create_meeting(body: CreateBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    meeting = await c.meetings.create(user.id, body.org_id, body.title, body.meet_url, body.scheduled_at, body.platform)
    return meeting_view(meeting, "host")


@router.post("/join")
async def join_meeting(body: JoinBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    meeting = await c.meetings.join_by_code(user.id, body.invite_code)
    actor = await c.access.member(meeting.id, user.id)
    return meeting_view(meeting, actor.role.value)


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    actor = await c.access.member(meeting_id, user.id)
    meeting = await c.access.meeting(meeting_id)
    participants = await c.meetings.participants(meeting_id)
    mine = next((p for p in participants if p.user_id == user.id), None)
    return {
        "meeting": meeting_view(meeting, actor.role.value),
        "me": {"user_id": user.id, "name": user.name, "role": actor.role.value, "display_lang": mine.display_lang if mine else None},
        "participants": [participant_view(p) for p in participants],
        "documents": [document_view(d) for d in await c.repo.list_documents(meeting_id)],
        "presenter": c.presenter.state(meeting_id),
        "online": c.presence.online(meeting_id),
        "has_minutes": await c.minutes.get(meeting_id) is not None,
    }


@router.patch("/{meeting_id}")
async def update_meeting(meeting_id: str, body: UpdateBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.meetings.set_meet_url(meeting_id, user.id, body.meet_url)
    actor = await c.access.member(meeting_id, user.id)
    return meeting_view(await c.access.meeting(meeting_id), actor.role.value)


@router.get("/{meeting_id}/zoom-sdk")
async def zoom_sdk(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    """What the browser needs to put a Zoom meeting inside the room page."""
    await c.access.member(meeting_id, user.id)
    meeting = await c.access.meeting(meeting_id)
    number = zoom_meeting_number(meeting.meet_url) if meeting.platform == "zoom" else None
    if number is None:
        raise Invalid("Phiên họp này chưa có link Zoom hợp lệ để nhúng")
    if not (c.settings.zoom_client_id and c.settings.zoom_client_secret):
        raise Invalid("Chưa cấu hình Zoom (cần ZOOM_CLIENT_ID và ZOOM_CLIENT_SECRET)")
    return {
        "sdk_key": c.settings.zoom_client_id,
        "signature": sdk_signature(c.settings.zoom_client_id, c.settings.zoom_client_secret, number),
        "meeting_number": number,
        "password": meeting.zoom_password or "",
        "user_name": user.name,
    }


@router.post("/{meeting_id}/start", status_code=202)
async def start_meeting(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.meetings.start(meeting_id, user.id)
    return {"ok": True}


@router.post("/{meeting_id}/end", status_code=202)
async def end_meeting(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.meetings.end(meeting_id, user.id)
    return {"ok": True}


@router.put("/{meeting_id}/me")
async def set_my_language(meeting_id: str, body: LangBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.meetings.set_display_lang(meeting_id, user.id, body.display_lang)
    return {"ok": True}


@router.post("/{meeting_id}/invitations")
async def invite_by_email(meeting_id: str, body: InviteBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    result = await c.meetings.invite_by_email(meeting_id, user.id, body.emails)
    return {"added": result.added, "invited": result.invited, "skipped": result.skipped, "email_failed": result.email_failed}


@router.put("/{meeting_id}/participants/{user_id}")
async def set_role(meeting_id: str, user_id: str, body: RoleBody, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    await c.meetings.set_role(meeting_id, user.id, user_id, body.role)
    return {"ok": True}


languages_router = APIRouter(prefix="/api", tags=["meta"])


@languages_router.get("/languages")
async def languages() -> list[dict]:
    labels = {
        "vi": "Tiếng Việt", "en": "English", "ja": "日本語", "ko": "한국어", "zh": "中文",
        "fr": "Français", "de": "Deutsch", "es": "Español", "th": "ไทย",
    }
    return [{"code": code, "label": labels.get(code, name)} for code, name in LANGUAGES.items()]


@languages_router.get("/config")
async def public_config(c: Container = Depends(get_container)) -> dict:
    return {
        "demo": c.config["bot"].get("adapter") == "fake",
        "google_client_id": c.settings.google_client_id or None,
        "email_code": c.auth.email_code_enabled,
        "meet_rooms": c.meet_rooms is not None,
        "zoom_rooms": c.zoom_rooms is not None,
    }
