"""Creating a Meet room from a meeting: the Google calls (mocked), the signed state, and the callback."""
from __future__ import annotations

import json
import time
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from starlette.testclient import TestClient

from adapters.meet.google import GoogleMeetRooms
from app.main import create_app
from app.settings import Settings, load_config
from core.errors import Invalid
from core.services.meet_rooms import MeetRoomService
from tests.conftest import Session

pytestmark = pytest.mark.timeout(30)

REDIRECT = "http://localhost:8000/api/google/callback"


def _rooms(handler) -> GoogleMeetRooms:
    return GoogleMeetRooms("cid.apps.googleusercontent.com", "secret", REDIRECT, "OPEN", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_authorize_url_asks_only_for_the_created_spaces_scope():
    url = _rooms(lambda r: httpx.Response(500)).authorize_url("STATE")
    q = parse_qs(urlparse(url).query)
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert q["client_id"] == ["cid.apps.googleusercontent.com"] and q["redirect_uri"] == [REDIRECT]
    assert q["scope"] == ["https://www.googleapis.com/auth/meetings.space.created"] and q["state"] == ["STATE"]
    assert q["access_type"] == ["online"]  # no refresh token is ever requested


async def test_create_room_exchanges_the_code_then_creates_an_open_space():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.host, request.url.path))
        if request.url.host == "oauth2.googleapis.com":
            form = parse_qs(request.content.decode())
            assert form["code"] == ["the-code"] and form["client_secret"] == ["secret"] and form["redirect_uri"] == [REDIRECT]
            return httpx.Response(200, json={"access_token": "tok"})
        assert request.headers["Authorization"] == "Bearer tok"
        assert json.loads(request.content) == {"config": {"accessType": "OPEN"}}
        return httpx.Response(200, json={"name": "spaces/x", "meetingUri": "https://meet.google.com/abc-defg-hij"})

    assert await _rooms(handler).create_room("the-code") == "https://meet.google.com/abc-defg-hij"
    assert seen == [("oauth2.googleapis.com", "/token"), ("meet.googleapis.com", "/v2/spaces")]


async def test_create_room_explains_what_to_enable_when_google_refuses():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok"})
        return httpx.Response(403, json={"error": {"message": "Google Meet REST API has not been used in project 1 before"}})

    with pytest.raises(Invalid, match="Google Meet REST API"):
        await _rooms(handler).create_room("c")

    with pytest.raises(Invalid, match="từ chối mã"):
        await _rooms(lambda r: httpx.Response(400, json={"error": "invalid_grant", "error_description": "Bad code"})).create_room("c")


class _Access:
    async def manager(self, meeting_id, user_id):
        return None


class _Repo:
    def __init__(self):
        self.updated = {}

    async def update_meeting(self, meeting_id, **fields):
        self.updated[meeting_id] = fields


class _Rooms:
    def authorize_url(self, state):
        return "https://accounts.google.com/x?state=" + state

    async def create_room(self, code):
        return "https://meet.google.com/aaa-bbbb-ccc"


async def test_state_cannot_be_forged_replayed_late_or_swapped():
    repo = _Repo()
    svc = MeetRoomService(repo, _Access(), _Rooms(), "secret-1", ttl_s=600)
    state = (await svc.begin("m1", "u1")).split("state=")[1]

    other = MeetRoomService(repo, _Access(), _Rooms(), "another-secret")
    for bad in ("garbage", state[:-2] + "00", state + "x", ""):
        with pytest.raises(Invalid):
            await svc.complete(bad, "code")
    with pytest.raises(Invalid):  # signed with a different secret
        await other.complete(state, "code")

    expired = MeetRoomService(repo, _Access(), _Rooms(), "secret-1", ttl_s=-1)
    with pytest.raises(Invalid):
        await expired.complete((await expired.begin("m1", "u1")).split("state=")[1], "code")

    assert await svc.complete(state, "code") == "m1"
    assert repo.updated == {"m1": {"meet_url": "https://meet.google.com/aaa-bbbb-ccc"}}


@pytest.fixture
def app_client(tmp_path):
    settings = Settings(
        _env_file=None,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'm.db'}",
        data_dir=tmp_path / "data",
        prompts_dir="prompts",
        jwt_secret="test-secret-test-secret-test-secret-123",
        config_path=tmp_path / "none.yaml",
        google_client_id="cid.apps.googleusercontent.com",
        google_client_secret="secret",
        email_code="on",  # tests sign in with the emailed code, there is no real Google here
        app_url="http://web.test",
    )
    config = load_config(settings.config_path)
    config["bot"] = {"adapter": "fake", "speed": 5000.0}
    with TestClient(create_app(settings, config), follow_redirects=False) as c:
        class FakeRooms(_Rooms):
            async def create_room(self, code):
                if code == "boom":
                    raise Invalid("Google không cho tạo phòng")
                return "https://meet.google.com/new-room-abc"

        c.app.state.container.meet_rooms._rooms = FakeRooms()
        yield c


def test_full_callback_flow_sets_the_link_and_sends_the_browser_back(app_client):
    c = app_client
    host, member = Session(c, "h@example.com", "Chủ trì"), Session(c, "m@example.com", "Thành viên")
    org = c.post("/api/orgs", json={"name": "Công ty"}, headers=host.headers).json()["id"]
    mid = c.post("/api/meetings", json={"org_id": org, "title": "Họp"}, headers=host.headers).json()["id"]
    c.post("/api/meetings/join", json={"invite_code": c.get(f"/api/meetings/{mid}", headers=host.headers).json()["meeting"]["invite_code"]}, headers=member.headers)

    assert c.get("/api/config").json()["meet_rooms"] is True
    assert c.post(f"/api/meetings/{mid}/meet-room", headers=member.headers).status_code == 403  # members cannot

    url = c.post(f"/api/meetings/{mid}/meet-room", headers=host.headers).json()["authorize_url"]
    state = parse_qs(urlparse(url).query)["state"][0] if "accounts.google.com/x" not in url else url.split("state=")[1]

    back = c.get("/api/google/callback", params={"state": state, "code": "good"})
    assert back.status_code == 307 and back.headers["location"] == f"http://web.test/meetings/{mid}?meet=ok"
    assert c.get(f"/api/meetings/{mid}", headers=host.headers).json()["meeting"]["meet_url"] == "https://meet.google.com/new-room-abc"

    failed = c.get("/api/google/callback", params={"state": state, "code": "boom"})
    assert f"/meetings/{mid}?meet=error&msg=" in failed.headers["location"]
    denied = c.get("/api/google/callback", params={"state": state, "error": "access_denied"})
    assert "meet=error" in denied.headers["location"] and "t%E1%BB%AB%20ch%E1%BB%91i" in denied.headers["location"]
    forged = c.get("/api/google/callback", params={"state": "forged", "code": "good"})
    assert forged.headers["location"].startswith("http://web.test/?meet=error")


def test_meet_rooms_are_off_without_the_client_secret(client):
    assert client.get("/api/config").json()["meet_rooms"] is False
    host = Session(client, "h@example.com", "Chủ trì")
    org = client.post("/api/orgs", json={"name": "C"}, headers=host.headers).json()["id"]
    mid = client.post("/api/meetings", json={"org_id": org, "title": "H"}, headers=host.headers).json()["id"]
    assert client.post(f"/api/meetings/{mid}/meet-room", headers=host.headers).status_code == 400
