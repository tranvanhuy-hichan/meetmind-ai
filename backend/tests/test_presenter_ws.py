"""Follow mode over the socket: who may present, and what followers receive."""
from __future__ import annotations

import pytest

from tests.conftest import make_pdf

pytestmark = pytest.mark.timeout(30)


def _wait_for(ws, kind: str, limit: int = 30) -> dict:
    for _ in range(limit):
        event = ws.receive_json()
        if event["type"] == kind:
            return event
    raise AssertionError(f"never received {kind}")


def test_presenter_flow(client, make_user, make_org):
    host = make_user("host@example.com", "Chủ trì")
    member = make_user("member@example.com", "Thành viên")
    meeting = client.post("/api/meetings", json={"org_id": make_org(host), "title": "Đọc tài liệu"}, headers=host.headers).json()
    mid = meeting["id"]
    client.post("/api/meetings/join", json={"invite_code": meeting["invite_code"]}, headers=member.headers)
    doc = client.post(
        f"/api/meetings/{mid}/documents", files={"file": ("a.pdf", make_pdf(10), "application/pdf")}, headers=host.headers
    ).json()

    with client.websocket_connect(f"/ws/meetings/{mid}?token={host.token}") as hws, client.websocket_connect(
        f"/ws/meetings/{mid}?token={member.token}"
    ) as mws:
        assert hws.receive_json()["type"] == "hello"
        assert mws.receive_json()["type"] == "hello"

        # a member cannot steer when nobody presents
        mws.send_json({"type": "presenter.move", "position": {"doc_id": doc["id"], "page": 2}})
        assert _wait_for(mws, "error")["message"]

        hws.send_json({"type": "presenter.claim"})
        assert _wait_for(mws, "presenter.changed")["presenter"]["user_id"] == host.user_id

        hws.send_json({"type": "presenter.move", "position": {"doc_id": doc["id"], "page": 99, "y_ratio": 0.4, "zoom": 1.25}})
        moved = _wait_for(mws, "presenter.position")
        assert moved["position"] == {"doc_id": doc["id"], "page": 10, "y_ratio": 0.4, "zoom": 1.25}  # page clamped
        assert moved["seq"] == 1

        # a member who asks to take over only sends a request, and only the presenter/host sees it
        mws.send_json({"type": "presenter.claim"})
        assert _wait_for(hws, "presenter.request")["user_id"] == member.user_id

        hws.send_json({"type": "presenter.grant", "user_id": member.user_id})
        assert _wait_for(mws, "presenter.changed")["presenter"]["user_id"] == member.user_id

        # the old presenter can no longer move the page
        hws.send_json({"type": "presenter.move", "position": {"doc_id": doc["id"], "page": 1}})
        assert _wait_for(hws, "error")["message"]
        mws.send_json({"type": "presenter.release"})
        assert _wait_for(hws, "presenter.changed")["presenter"] is None


def test_clients_see_documents_added_and_removed_live(client, make_user, make_org):
    host = make_user("host@example.com", "Chủ trì")
    member = make_user("member@example.com", "Thành viên")
    meeting = client.post("/api/meetings", json={"org_id": make_org(host), "title": "Tài liệu trực tiếp"}, headers=host.headers).json()
    mid = meeting["id"]
    client.post("/api/meetings/join", json={"invite_code": meeting["invite_code"]}, headers=member.headers)

    with client.websocket_connect(f"/ws/meetings/{mid}?token={member.token}") as mws:
        assert mws.receive_json()["type"] == "hello"
        doc = client.post(
            f"/api/meetings/{mid}/documents", files={"file": ("a.pdf", make_pdf(2), "application/pdf")}, headers=host.headers
        ).json()
        added = _wait_for(mws, "doc.added")["document"]
        assert added["id"] == doc["id"] and added["page_count"] == 2 and "original_key" not in added

        client.patch(f"/api/documents/{doc['id']}", json={"allow_download": True}, headers=host.headers)
        assert _wait_for(mws, "doc.updated")["document"]["allow_download"] is True

        client.delete(f"/api/documents/{doc['id']}", headers=host.headers)
        assert _wait_for(mws, "doc.removed")["doc_id"] == doc["id"]
