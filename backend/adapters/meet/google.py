from __future__ import annotations

from urllib.parse import urlencode

import httpx

from core.errors import Invalid

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SPACES_URL = "https://meet.googleapis.com/v2/spaces"
SCOPE = "https://www.googleapis.com/auth/meetings.space.created"  # only spaces this app creates


def _reason(resp: httpx.Response) -> str:
    """Google reports errors in two shapes: {"error": {"message": ...}} (APIs) and {"error": "code", "error_description": ...} (OAuth)."""
    try:
        body = resp.json()
    except ValueError:
        return resp.text[:300]
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        return str(error.get("message") or error)[:300]
    if isinstance(body, dict) and body.get("error_description"):
        return str(body["error_description"])[:300]
    return str(error or body)[:300]


class GoogleMeetRooms:
    """Creates Google Meet rooms with the Meet REST API on behalf of the signed-in user.

    The user approves once on Google's consent screen; the authorization code is exchanged for a short-lived
    token that is used a single time to create the room and then discarded (nothing is stored)."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        access_type: str = "OPEN",
        client: httpx.AsyncClient | None = None,
    ):
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._access_type = access_type
        self._http = client or httpx.AsyncClient(timeout=30)

    def authorize_url(self, state: str) -> str:
        return AUTH_URL + "?" + urlencode(
            {
                "client_id": self._client_id,
                "redirect_uri": self._redirect_uri,
                "response_type": "code",
                "scope": SCOPE,
                "access_type": "online",
                "include_granted_scopes": "true",
                "state": state,
            }
        )

    async def create_room(self, code: str) -> str:
        token = await self._http.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "redirect_uri": self._redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token.status_code != 200:
            raise Invalid(f"Google từ chối mã xác nhận: {_reason(token)}")
        access = token.json()["access_token"]

        room = await self._http.post(
            SPACES_URL,
            headers={"Authorization": f"Bearer {access}"},
            json={"config": {"accessType": self._access_type}},
        )
        if room.status_code == 403:
            raise Invalid(
                "Google không cho tạo phòng. Kiểm tra đã bật Google Meet REST API cho project này, đã thêm scope "
                f"meetings.space.created và email của bạn là người dùng thử nghiệm. Chi tiết: {_reason(room)}"
            )
        if room.status_code != 200:
            raise Invalid(f"Không tạo được phòng Meet: {_reason(room)}")
        uri = room.json().get("meetingUri")
        if not uri:
            raise Invalid("Google không trả về link phòng Meet")
        return str(uri)
