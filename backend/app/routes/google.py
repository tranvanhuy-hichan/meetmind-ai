from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse

from app.container import Container
from app.deps import current_user, get_container
from core.errors import DomainError, Invalid
from core.models import User

router = APIRouter(prefix="/api", tags=["google"])


@router.post("/meetings/{meeting_id}/meet-room")
async def start_meet_room(meeting_id: str, user: User = Depends(current_user), c: Container = Depends(get_container)) -> dict:
    """Returns the Google consent URL; the browser goes there and Google sends it back to /api/google/callback."""
    if c.meet_rooms is None:
        raise Invalid("Chưa cấu hình tạo phòng Meet (cần GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET)")
    return {"authorize_url": await c.meet_rooms.begin(meeting_id, user.id)}


@router.get("/google/callback")
async def google_callback(
    state: str = Query(""),
    code: str = Query(""),
    error: str = Query(""),
    c: Container = Depends(get_container),
) -> RedirectResponse:
    """The user comes back from Google here. Whatever happens, they end up on the meeting page with a short message."""
    app = c.settings.app_url.rstrip("/")
    if c.meet_rooms is None:
        return RedirectResponse(f"{app}/?meet=error&msg={quote('Chưa cấu hình tạo phòng Meet')}")
    meeting_id = None
    try:
        if error or not code:
            raise Invalid("Bạn đã từ chối cấp quyền tạo phòng Meet" if error == "access_denied" else "Google không trả về mã xác nhận")
        meeting_id = await c.meet_rooms.complete(state, code)
    except DomainError as exc:
        target = f"{app}/meetings/{_meeting_of(c, state)}" if _meeting_of(c, state) else f"{app}/"
        return RedirectResponse(f"{target}?meet=error&msg={quote(str(exc))}")
    return RedirectResponse(f"{app}/meetings/{meeting_id}?meet=ok")


def _meeting_of(c: Container, state: str) -> str | None:
    """The meeting named in a (valid) state, so an error can be shown where the user started."""
    try:
        return c.meet_rooms._verify(state)["m"]  # type: ignore[union-attr]
    except DomainError:
        return None
