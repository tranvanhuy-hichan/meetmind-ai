"""Creating a Zoom meeting from a meeting: the Zoom calls (mocked)."""
from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from adapters.meet.zoom import ZoomMeetRooms
from core.errors import Invalid

pytestmark = pytest.mark.timeout(30)

REDIRECT = "http://localhost:8000/api/zoom/callback"


def _rooms(handler) -> ZoomMeetRooms:
    return ZoomMeetRooms("cid", "secret", REDIRECT, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_authorize_url():
    url = _rooms(lambda r: httpx.Response(500)).authorize_url("STATE")
    q = parse_qs(urlparse(url).query)
    assert url.startswith("https://zoom.us/oauth/authorize?")
    assert q["client_id"] == ["cid"] and q["redirect_uri"] == [REDIRECT] and q["state"] == ["STATE"] and q["response_type"] == ["code"]


async def test_create_room_exchanges_the_code_then_creates_a_meeting():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.host, request.url.path))
        if request.url.host == "zoom.us":
            assert request.headers["Authorization"].startswith("Basic ")  # client id and secret
            form = parse_qs(request.content.decode())
            assert form["code"] == ["the-code"] and form["redirect_uri"] == [REDIRECT]
            return httpx.Response(200, json={"access_token": "tok"})
        assert request.headers["Authorization"] == "Bearer tok"
        body = json.loads(request.content)
        assert body["settings"]["join_before_host"] is True and body["settings"]["waiting_room"] is False
        return httpx.Response(201, json={"join_url": "https://us02web.zoom.us/j/123456789?pwd=x"})

    assert await _rooms(handler).create_room("the-code") == "https://us02web.zoom.us/j/123456789?pwd=x"
    assert seen == [("zoom.us", "/oauth/token"), ("api.zoom.us", "/v2/users/me/meetings")]


async def test_create_room_explains_what_to_check_when_zoom_refuses():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "zoom.us":
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(400, json={"code": 4711, "message": "Invalid access token, does not contain scopes"})

    with pytest.raises(Invalid, match="meeting:write:meeting"):
        await _rooms(handler).create_room("c")


def test_sdk_signature_and_meeting_number():
    import jwt

    from adapters.meet.zoom import sdk_signature
    from core.platforms import zoom_meeting_number

    token = sdk_signature("key", "secret", "123456789")
    claims = jwt.decode(token, "secret", algorithms=["HS256"])
    assert claims["sdkKey"] == claims["appKey"] == "key" and claims["mn"] == "123456789" and claims["role"] == 0
    assert claims["exp"] > claims["iat"]
    assert zoom_meeting_number("https://us02web.zoom.us/j/84315220467?pwd=abc") == "84315220467"
    assert zoom_meeting_number("https://meet.google.com/abc-defg-hij") is None


async def test_create_room_keeps_the_passcode():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "zoom.us":
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(201, json={"join_url": "https://zoom.us/j/123456789?pwd=x", "password": "a1B2c3"})

    link = await _rooms(handler).create_room("c")
    assert str(link) == "https://zoom.us/j/123456789?pwd=x" and link.password == "a1B2c3"
