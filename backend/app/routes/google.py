from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

from app.container import Container
from app.deps import current_user, get_container
from core.errors import DomainError, Invalid
from core.models import User
from core.platforms import LABEL, MEET, ZOOM
from core.services.meet_rooms import MeetRoomService

router = APIRouter(prefix="/api", tags=["google"])

_CONSENT = {MEET: "Google", ZOOM: "Zoom"}


def _rooms(c: Container, platform: str) -> MeetRoomService | None:
    return c.zoom_rooms if platform == ZOOM else c.meet_rooms


@router.post("/meetings/{meeting_id}/meet-room")
async def start_meet_room(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    """Returns the consent URL (Google or Zoom, by the meeting's platform); the browser goes there and the platform
    sends it back to /api/google/callback or /api/zoom/callback."""
    platform = (await c.access.meeting(meeting_id)).platform
    rooms = _rooms(c, platform)
    if rooms is None:
        if platform == ZOOM:
            raise Invalid("Chưa cấu hình tạo cuộc họp Zoom (cần ZOOM_CLIENT_ID và ZOOM_CLIENT_SECRET)")
        raise Invalid("Chưa cấu hình tạo phòng Meet (cần GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET)")
    return {"authorize_url": await rooms.begin(meeting_id, user.id)}


async def _callback(c: Container, platform: str, state: str, code: str, error: str, detail: str = "") -> RedirectResponse:
    """The user comes back from the platform here. Whatever happens, they end up on the meeting page with a short message."""
    app = c.settings.app_url.rstrip("/")
    rooms = _rooms(c, platform)
    if rooms is None:
        return RedirectResponse(f"{app}/?meet=error&msg={quote(f'Chưa cấu hình tạo phòng {LABEL[platform]}')}")
    try:
        if error or not code:
            raise Invalid(
                f"Bạn đã từ chối cấp quyền tạo phòng {LABEL[platform]}"
                if error == "access_denied"
                else f"{_CONSENT[platform]} không trả về mã xác nhận" + (f" ({error}: {detail})" if error else "")
                + ("" if state else ". Hãy bắt đầu lại từ nút tạo phòng trong MeetMind")
            )
        meeting_id = await rooms.complete(state, code)
    except DomainError as exc:
        meeting_id = _meeting_of(rooms, state)
        target = f"{app}/meetings/{meeting_id}" if meeting_id else f"{app}/"
        return RedirectResponse(f"{target}?meet=error&msg={quote(str(exc))}")
    return RedirectResponse(f"{app}/meetings/{meeting_id}?meet=ok")


@router.get("/google/callback")
async def google_callback(
    state: str = Query(""), code: str = Query(""), error: str = Query(""), c: Container = Depends(get_container)
) -> RedirectResponse:
    return await _callback(c, MEET, state, code, error)


@router.get("/zoom/callback")
async def zoom_callback(
    state: str = Query(""),
    code: str = Query(""),
    error: str = Query(""),
    error_description: str = Query(""),
    c: Container = Depends(get_container),
) -> RedirectResponse:
    return await _callback(c, ZOOM, state, code, error, error_description)


def _meeting_of(rooms: MeetRoomService, state: str) -> str | None:
    """The meeting named in a (valid) state, so an error can be shown where the user started."""
    try:
        return rooms._verify(state)["m"]
    except DomainError:
        return None
