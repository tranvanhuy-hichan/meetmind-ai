from __future__ import annotations

import time
from urllib.parse import urlencode

import httpx
import jwt

from core.errors import Invalid
from core.platforms import MeetingLink

AUTH_URL = "https://zoom.us/oauth/authorize"
TOKEN_URL = "https://zoom.us/oauth/token"
MEETINGS_URL = "https://api.zoom.us/v2/users/me/meetings"


def _reason(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:300]
    if isinstance(body, dict):
        return str(body.get("message") or body.get("reason") or body.get("error") or body)[:300]
    return str(body)[:300]


def sdk_signature(sdk_key: str, sdk_secret: str, meeting_number: str, role: int = 0, ttl_s: int = 2 * 3600) -> str:
    """The signed token the Zoom Meeting SDK needs to join a meeting. Role 0 joins as a participant."""
    now = int(time.time())
    return jwt.encode(
        {"appKey": sdk_key, "sdkKey": sdk_key, "mn": meeting_number, "role": role, "iat": now, "exp": now + ttl_s, "tokenExp": now + ttl_s},
        sdk_secret,
        algorithm="HS256",
    )


class ZoomMeetRooms:
    """Creates Zoom meetings with the Zoom API on behalf of the signed-in user (same shape as `GoogleMeetRooms`).

    The user approves once on Zoom's consent screen; the authorization code is exchanged for a short-lived token that
    is used a single time to create the meeting and then discarded (nothing is stored)."""

    def __init__(self, client_id: str, client_secret: str, redirect_uri: str, client: httpx.AsyncClient | None = None):
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._http = client or httpx.AsyncClient(timeout=30)

    def authorize_url(self, state: str) -> str:
        return AUTH_URL + "?" + urlencode(
            {"response_type": "code", "client_id": self._client_id, "redirect_uri": self._redirect_uri, "state": state}
        )

    async def create_room(self, code: str) -> str:
        token = await self._http.post(
            TOKEN_URL,
            auth=(self._client_id, self._client_secret),
            data={"grant_type": "authorization_code", "code": code, "redirect_uri": self._redirect_uri},
        )
        if token.status_code != 200:
            raise Invalid(f"Zoom từ chối mã xác nhận: {_reason(token)}")
        access = token.json()["access_token"]

        room = await self._http.post(
            MEETINGS_URL,
            headers={"Authorization": f"Bearer {access}"},
            json={
                "topic": "MeetMind",
                "type": 3,  # recurring, no fixed time: the room stays valid until the host ends it, like a Meet room
                "settings": {
                    "join_before_host": True,  # nobody has to be there first for the bot to get in
                    "waiting_room": False,
                    "approval_type": 2,
                    "meeting_authentication": False,
                },
            },
        )
        if room.status_code in (400, 401, 403):
            raise Invalid(
                "Zoom không cho tạo cuộc họp. Kiểm tra app Zoom đã có scope meeting:write:meeting và redirect URL "
                f"khớp với cấu hình. Chi tiết: {_reason(room)}"
            )
        if room.status_code not in (200, 201):
            raise Invalid(f"Không tạo được cuộc họp Zoom: {_reason(room)}")
        url = room.json().get("join_url")
        if not url:
            raise Invalid("Zoom không trả về link cuộc họp")
        return MeetingLink(str(url), room.json().get("password") or None)
