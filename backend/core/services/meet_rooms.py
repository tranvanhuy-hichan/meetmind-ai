from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from core.errors import Invalid
from core.ports import MeetRooms, Repository
from core.services.access import AccessService


class MeetRoomService:
    """Creates a Google Meet room for a meeting and stores its link.

    The state value that travels through Google's consent screen is signed and short-lived, so the callback
    cannot be forged and cannot be replayed later or for another meeting."""

    def __init__(self, repo: Repository, access: AccessService, rooms: MeetRooms, secret: str, ttl_s: int = 600):
        self._repo = repo
        self._access = access
        self._rooms = rooms
        self._secret = secret.encode()
        self._ttl = ttl_s

    async def begin(self, meeting_id: str, user_id: str) -> str:
        """Returns the Google URL the browser must open. Only a host or co-host may do this."""
        await self._access.manager(meeting_id, user_id)
        return self._rooms.authorize_url(self._sign({"m": meeting_id, "u": user_id, "e": int(time.time()) + self._ttl}))

    async def complete(self, state: str, code: str) -> str:
        """Called when Google sends the browser back. Returns the meeting id that now has a link."""
        payload = self._verify(state)
        meeting_id = payload["m"]
        await self._access.manager(meeting_id, payload["u"])  # still allowed to manage it
        url = await self._rooms.create_room(code)
        await self._repo.update_meeting(meeting_id, meet_url=url)
        return meeting_id

    def _sign(self, payload: dict) -> str:
        body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
        mac = hmac.new(self._secret, body.encode(), hashlib.sha256).hexdigest()
        return f"{body}.{mac}"

    def _verify(self, state: str) -> dict:
        try:
            body, mac = state.rsplit(".", 1)
            expected = hmac.new(self._secret, body.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(mac, expected):
                raise ValueError("bad signature")
            payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
            if payload["e"] < time.time():
                raise ValueError("expired")
            return payload
        except (ValueError, KeyError, json.JSONDecodeError):
            raise Invalid("Yêu cầu tạo phòng Meet không hợp lệ hoặc đã hết hạn. Hãy thử lại") from None
