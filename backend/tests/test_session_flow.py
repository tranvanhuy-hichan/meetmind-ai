"""End to end: a whole meeting session through the HTTP API and the socket, with the demo adapters."""
from __future__ import annotations

import pytest

from tests.conftest import make_pdf

pytestmark = pytest.mark.timeout(60)


def _create_meeting(client, host, org_id):
    resp = client.post(
        "/api/meetings",
        json={"org_id": org_id, "title": "Họp tiến độ MeetMind", "meet_url": "https://meet.google.com/abc-defg-hij"},
        headers=host.headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _collect_until_ready(ws) -> list[dict]:
    events = []
    while True:
        event = ws.receive_json()
        events.append(event)
        if event.get("type") == "status" and event["status"] == "ready":
            return events


def test_full_session(client, make_user, make_org):
    host = make_user("host@example.com", "Nguyễn Văn A")
    member = make_user("member@example.com", "Trần Văn B")

    meeting = _create_meeting(client, host, make_org(host))
    mid = meeting["id"]
    assert meeting["invite_code"]

    joined = client.post("/api/meetings/join", json={"invite_code": meeting["invite_code"]}, headers=member.headers)
    assert joined.status_code == 200 and joined.json()["role"] == "member"
    assert joined.json()["invite_code"] is None  # members never see the invite code

    # documents: only a host or co-host may upload
    denied = client.post(f"/api/meetings/{mid}/documents", files={"file": ("a.pdf", make_pdf(), "application/pdf")}, headers=member.headers)
    assert denied.status_code == 403
    ok = client.post(f"/api/meetings/{mid}/documents", files={"file": ("Bao cao.pdf", make_pdf(5), "application/pdf")}, headers=host.headers)
    assert ok.status_code == 201 and ok.json()["page_count"] == 5
    assert "original_key" not in ok.json()
    doc_id = ok.json()["id"]
    assert client.get(f"/api/documents/{doc_id}/file", headers=member.headers).content.startswith(b"%PDF")
    assert client.get(f"/api/documents/{doc_id}/download", headers=member.headers).status_code == 403
    client.patch(f"/api/documents/{doc_id}", json={"allow_download": True}, headers=host.headers)
    assert client.get(f"/api/documents/{doc_id}/download", headers=member.headers).status_code == 200
    assert client.post(f"/api/meetings/{mid}/documents", files={"file": ("x.exe", b"MZ", "application/octet-stream")}, headers=host.headers).status_code == 400

    # the member reads in English; Vietnamese lines must be translated for them
    with client.websocket_connect(f"/ws/meetings/{mid}?token={member.token}") as ws:
        assert ws.receive_json()["type"] == "hello"
        ws.send_json({"type": "set_lang", "lang": "en"})
        assert client.post(f"/api/meetings/{mid}/start", headers=host.headers).status_code == 202
        events = _collect_until_ready(ws)

    kinds = {e["type"] for e in events}
    assert {"segment.partial", "segment.final", "segment.translation", "minutes.ready"} <= kinds
    statuses = [e["status"] for e in events if e["type"] == "status"]
    assert statuses == ["bot_joining", "live", "ended", "processing", "ready"]

    transcript = client.get(f"/api/meetings/{mid}/transcript?lang=en", headers=member.headers).json()
    assert len(transcript["segments"]) == 12
    vi_lines = [s for s in transcript["segments"] if s["lang"] == "vi"]
    assert vi_lines and all(s["translation"] for s in vi_lines)
    assert all(s["translation"] is None for s in transcript["segments"] if s["lang"] == "en")

    minutes = client.get(f"/api/meetings/{mid}/minutes", headers=member.headers).json()
    assert len(minutes["minutes"]["decisions"]) == 2
    owners = {a["owner"] for a in minutes["minutes"]["action_items"]}
    assert {"Trần Văn B", "Lê Thị C"} <= owners
    ids = {s["id"] for s in transcript["segments"]}
    assert all(a["evidence_segment_id"] in ids for a in minutes["minutes"]["action_items"])

    # only managers edit the minutes
    edit = {"minutes": minutes["minutes"], "status": "final"}
    assert client.put(f"/api/meetings/{mid}/minutes", json=edit, headers=member.headers).status_code == 403
    assert client.put(f"/api/meetings/{mid}/minutes", json=edit, headers=host.headers).json()["status"] == "final"

    docx = client.get(f"/api/meetings/{mid}/minutes/export?format=docx", headers=member.headers)
    assert docx.status_code == 200 and docx.content[:2] == b"PK"
    md = client.get(f"/api/meetings/{mid}/minutes/export?format=md", headers=member.headers)
    assert "Công việc được giao" in md.text


def test_access_rules(client, make_user, make_org):
    host = make_user("host@example.com", "Chủ trì")
    outsider = make_user("out@example.com", "Người ngoài")
    org = make_org(host)
    meeting = _create_meeting(client, host, org)
    mid = meeting["id"]

    assert client.get(f"/api/meetings/{mid}", headers=outsider.headers).status_code == 403
    assert client.get("/api/meetings").status_code == 401  # no auth header
    assert client.post("/api/meetings/join", json={"invite_code": "NOPE"}, headers=outsider.headers).status_code == 404
    assert client.post("/api/meetings", json={"org_id": org, "title": "x", "meet_url": "http://insecure"}, headers=host.headers).status_code == 400

    no_url = client.post("/api/meetings", json={"org_id": org, "title": "Chưa có link"}, headers=host.headers).json()
    assert client.post(f"/api/meetings/{no_url['id']}/start", headers=host.headers).status_code == 400

    # someone outside the organization cannot open a meeting in it
    assert client.post("/api/meetings", json={"org_id": org, "title": "x"}, headers=outsider.headers).status_code == 403

    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/meetings/{mid}?token={outsider.token}"):
            pass


def test_meeting_platform(client, make_user, make_org):
    host = make_user("plat@example.com", "Chủ trì")
    org = make_org(host)

    def create(**extra):
        return client.post("/api/meetings", json={"org_id": org, "title": "Họp", **extra}, headers=host.headers)

    assert create(meet_url="https://meet.google.com/abc-defg-hij").json()["platform"] == "meet"
    assert create().json()["platform"] == "meet"  # default
    zoom = create(platform="zoom", meet_url="https://us02web.zoom.us/j/123456789?pwd=x")
    assert zoom.status_code == 200 and zoom.json()["platform"] == "zoom"
    assert create(meet_url="https://us02web.zoom.us/j/1").json()["platform"] == "zoom"  # taken from the link

    wrong = create(platform="zoom", meet_url="https://meet.google.com/abc-defg-hij")
    assert wrong.status_code >= 400 and "Zoom" in wrong.text
    assert create(platform="teams").status_code >= 400

    # the link of an existing meeting has to match its platform too
    mid = zoom.json()["id"]
    bad = client.patch(f"/api/meetings/{mid}", json={"meet_url": "https://meet.google.com/abc-defg-hij"}, headers=host.headers)
    assert bad.status_code >= 400
    ok = client.patch(f"/api/meetings/{mid}", json={"meet_url": "https://zoom.us/j/987654321"}, headers=host.headers)
    assert ok.status_code == 200 and ok.json()["meet_url"] == "https://zoom.us/j/987654321"


def test_zoom_sdk_details(client, make_user, make_org):
    host = make_user("sdk@example.com", "Chủ trì")
    org = make_org(host)
    zoom = client.post("/api/meetings", json={"org_id": org, "title": "Họp", "platform": "zoom", "meet_url": "https://us02web.zoom.us/j/84315220467?pwd=x"}, headers=host.headers).json()
    meet = client.post("/api/meetings", json={"org_id": org, "title": "Họp"}, headers=host.headers).json()
    # Zoom is not configured in tests, and a Meet meeting has nothing to embed
    assert client.get(f"/api/meetings/{zoom['id']}/zoom-sdk", headers=host.headers).status_code >= 400
    assert client.get(f"/api/meetings/{meet['id']}/zoom-sdk", headers=host.headers).status_code >= 400
