"""Sign-in by emailed code, organizations, and access granted through email invitations."""
from __future__ import annotations

import pytest

from tests.conftest import Session, sign_in

pytestmark = pytest.mark.timeout(30)


def _verify(client, email, code, name=None):
    return client.post("/api/auth/verify", json={"email": email, "code": code, "name": name})


def test_wrong_code_is_rejected_and_locks_after_five_tries(client):
    sent = client.post("/api/auth/request-code", json={"email": "a@example.com"}).json()
    wrong = "000000" if sent["dev_code"] != "000000" else "111111"
    for _ in range(4):
        assert _verify(client, "a@example.com", wrong).status_code == 400
    assert "quá nhiều" in _verify(client, "a@example.com", wrong).json()["detail"]
    # the real code no longer works either: a fresh one has to be requested
    assert _verify(client, "a@example.com", sent["dev_code"]).status_code == 400


def test_code_is_single_use_and_requests_are_throttled(client):
    sent = client.post("/api/auth/request-code", json={"email": "a@example.com"}).json()
    again = client.post("/api/auth/request-code", json={"email": "a@example.com"})
    assert again.status_code == 400  # asked twice within seconds
    assert _verify(client, "a@example.com", sent["dev_code"], "An").status_code == 200
    assert _verify(client, "a@example.com", sent["dev_code"]).status_code == 400
    assert client.post("/api/auth/request-code", json={"email": "not-an-email"}).status_code == 400


def test_email_is_case_insensitive_and_name_defaults_to_local_part(client):
    first = sign_in(client, "Lan.Pham@Example.com", None)
    assert first["user"]["email"] == "lan.pham@example.com" and first["user"]["name"] == "Lan.Pham".lower()
    client.post("/api/auth/request-code", json={"email": "other@example.com"})  # unrelated pending code
    assert sign_in(client, "LAN.PHAM@example.COM", "Ignored")["user"]["id"] == first["user"]["id"]


def test_code_email_is_sent(client, outbox):
    client.post("/api/auth/request-code", json={"email": "a@example.com"})
    assert len(outbox) == 1 and outbox[0].to == "a@example.com"
    assert "Mã đăng nhập" in outbox[0].subject


def test_organization_invites(client, make_user, make_org, outbox):
    owner = make_user("owner@example.com", "Chủ sở hữu")
    existing = make_user("existing@example.com", "Đã có tài khoản")
    org = make_org(owner)
    outbox.clear()

    res = client.post(
        f"/api/orgs/{org}/invitations",
        json={"emails": ["existing@example.com", "NEW@example.com", "new@example.com", "owner@example.com"]},
        headers=owner.headers,
    ).json()
    assert res["added"] == ["existing@example.com"]  # has an account: member right away
    assert res["invited"] == ["new@example.com"]  # no account yet: waits for the first sign-in (duplicates collapsed)
    assert res["skipped"] == ["owner@example.com"]
    assert {m.to for m in outbox} == {"existing@example.com", "new@example.com"}
    assert all("login?email=" in m.body for m in outbox)

    detail = client.get(f"/api/orgs/{org}", headers=owner.headers).json()
    assert [p["email"] for p in detail["pending"]] == ["new@example.com"]
    assert client.get(f"/api/orgs/{org}", headers=existing.headers).json()["pending"] == []  # only managers see them

    # the invited address becomes a member by signing in, nothing else needed
    newcomer = Session(client, "new@example.com", "Người mới")
    mine = client.get("/api/orgs", headers=newcomer.headers).json()
    assert [(o["id"], o["role"]) for o in mine] == [(org, "member")]
    assert client.get(f"/api/orgs/{org}", headers=owner.headers).json()["pending"] == []


def test_organization_permissions(client, make_user, make_org):
    owner = make_user("owner@example.com", "Chủ")
    member = make_user("member@example.com", "Thường")
    outsider = make_user("out@example.com", "Ngoài")
    org = make_org(owner)
    client.post(f"/api/orgs/{org}/invitations", json={"emails": ["member@example.com"]}, headers=owner.headers)

    # outsiders cannot even tell the organization exists
    assert client.get(f"/api/orgs/{org}", headers=outsider.headers).status_code == 404
    assert client.get("/api/orgs", headers=outsider.headers).json() == []
    # plain members cannot invite or change roles
    assert client.post(f"/api/orgs/{org}/invitations", json={"emails": ["x@example.com"]}, headers=member.headers).status_code == 403
    assert client.put(f"/api/orgs/{org}/members/{member.user_id}", json={"role": "admin"}, headers=member.headers).status_code == 403
    # an admin can invite members but not other admins
    assert client.put(f"/api/orgs/{org}/members/{member.user_id}", json={"role": "admin"}, headers=owner.headers).status_code == 200
    assert client.post(f"/api/orgs/{org}/invitations", json={"emails": ["x@example.com"]}, headers=member.headers).status_code == 200
    assert client.post(f"/api/orgs/{org}/invitations", json={"emails": ["y@example.com"], "role": "admin"}, headers=member.headers).status_code == 403
    # the last owner cannot demote or remove themselves
    assert client.put(f"/api/orgs/{org}/members/{owner.user_id}", json={"role": "member"}, headers=owner.headers).status_code == 400
    assert client.delete(f"/api/orgs/{org}/members/{owner.user_id}", headers=owner.headers).status_code == 400
    # a member can leave
    assert client.delete(f"/api/orgs/{org}/members/{member.user_id}", headers=member.headers).status_code == 204
    assert client.get(f"/api/orgs/{org}", headers=member.headers).status_code == 404
    # pending invitations can be revoked
    pending = client.get(f"/api/orgs/{org}", headers=owner.headers).json()["pending"]
    assert client.delete(f"/api/orgs/{org}/invitations/{pending[0]['id']}", headers=owner.headers).status_code == 204
    assert client.get(f"/api/orgs/{org}", headers=owner.headers).json()["pending"] == []


def test_meeting_invitation_by_email(client, make_user, make_org, outbox):
    host = make_user("host@example.com", "Chủ trì")
    known = make_user("known@example.com", "Đã có tài khoản")
    org = make_org(host)
    meeting = client.post("/api/meetings", json={"org_id": org, "title": "Họp quý"}, headers=host.headers).json()
    mid = meeting["id"]
    outbox.clear()

    res = client.post(f"/api/meetings/{mid}/invitations", json={"emails": ["known@example.com", "guest@example.com"]}, headers=host.headers).json()
    assert res["added"] == ["known@example.com"] and res["invited"] == ["guest@example.com"]
    assert client.get(f"/api/meetings/{mid}", headers=known.headers).status_code == 200
    assert all(f"/meetings/{mid}" in m.body.replace("%2F", "/") for m in outbox)

    guest = Session(client, "guest@example.com", "Khách")
    detail = client.get(f"/api/meetings/{mid}", headers=guest.headers)
    assert detail.status_code == 200 and detail.json()["me"]["role"] == "member"
    # a guest is in the meeting but not in the organization
    assert client.get("/api/orgs", headers=guest.headers).json() == []

    # only managers invite
    assert client.post(f"/api/meetings/{mid}/invitations", json={"emails": ["z@example.com"]}, headers=guest.headers).status_code == 403
    assert client.post(f"/api/meetings/{mid}/invitations", json={"emails": ["nonsense"]}, headers=host.headers).status_code == 400


def test_organization_basics_and_rename(client, make_user, make_org):
    owner = make_user("owner@example.com", "Chủ")
    member = make_user("member@example.com", "Thường")
    org = make_org(owner, "Công ty A")
    client.post(f"/api/orgs/{org}/invitations", json={"emails": ["member@example.com"]}, headers=owner.headers)

    listed = client.get("/api/orgs", headers=owner.headers).json()[0]
    assert listed["name"] == "Công ty A" and listed["member_count"] == 2 and listed["created_at"]
    assert client.get(f"/api/orgs/{org}", headers=owner.headers).json()["created_at"] == listed["created_at"]

    assert client.patch(f"/api/orgs/{org}", json={"name": "Công ty B"}, headers=member.headers).status_code == 403  # plain members cannot
    assert client.patch(f"/api/orgs/{org}", json={"name": "   "}, headers=owner.headers).status_code == 400
    assert client.patch(f"/api/orgs/{org}", json={"name": " Công ty B "}, headers=owner.headers).json()["name"] == "Công ty B"
    assert client.get("/api/orgs", headers=member.headers).json()[0]["name"] == "Công ty B"
