"""Sign in with Google: the verifier's rules, and what the API does with a verified identity."""
from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from adapters.auth.google import GoogleIdentityVerifier
from app.main import create_app
from app.settings import Settings, load_config
from core.errors import Invalid
from tests.conftest import Session

pytestmark = pytest.mark.timeout(30)

CLIENT_ID = "123-test.apps.googleusercontent.com"


def _claims(email: str, name: str = "", verified: bool = True) -> dict:
    return {"email": email, "name": name, "email_verified": verified}


class FakeGoogle:
    """Stands in for Google's token check: the 'credential' is looked up in a table."""

    def __init__(self, table: dict[str, dict]):
        self.table = table

    def __call__(self, credential: str, client_id: str) -> dict:
        assert client_id == CLIENT_ID
        if credential not in self.table:
            raise ValueError("bad signature")
        return self.table[credential]


async def test_verifier_accepts_a_verified_address_and_normalizes_it():
    verifier = GoogleIdentityVerifier(CLIENT_ID, verify_token=FakeGoogle({"t": _claims("Lan.Pham@Example.com", " Lan Pham ")}))
    who = await verifier.verify("t")
    assert (who.email, who.name) == ("lan.pham@example.com", "Lan Pham")


async def test_verifier_rejects_bad_tokens_unverified_emails_and_other_domains():
    table = {"unverified": _claims("a@example.com", verified=False), "noemail": {"email_verified": True}, "other": _claims("a@other.org")}
    verifier = GoogleIdentityVerifier(CLIENT_ID, ["example.com"], verify_token=FakeGoogle(table))
    for credential in ("garbage", "unverified", "noemail", "other"):
        with pytest.raises(Invalid):
            await verifier.verify(credential)


@pytest.fixture
def google(tmp_path):
    """An app with Google sign-in configured and Google's token check replaced by a table."""
    settings = Settings(
        _env_file=None,  # tests must not depend on a developer's local .env
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'g.db'}",
        data_dir=tmp_path / "data",
        prompts_dir="prompts",
        jwt_secret="test-secret-test-secret-test-secret-123",
        config_path=tmp_path / "missing.yaml",
        google_client_id=CLIENT_ID,
    )
    config = load_config(settings.config_path)
    config["bot"] = {"adapter": "fake", "speed": 5000.0}
    table: dict[str, dict] = {}
    with TestClient(create_app(settings, config)) as c:
        c.app.state.container.identity = GoogleIdentityVerifier(CLIENT_ID, verify_token=FakeGoogle(table))
        c.table = table  # type: ignore[attr-defined]
        yield c


def _sign_in(client, credential: str):
    return client.post("/api/auth/google", json={"credential": credential})


def test_config_advertises_google_and_turns_the_email_code_off(google):
    config = google.get("/api/config").json()
    assert config["google_client_id"] == CLIENT_ID and config["email_code"] is False
    assert google.post("/api/auth/request-code", json={"email": "a@example.com"}).status_code == 400
    assert google.post("/api/auth/verify", json={"email": "a@example.com", "code": "123456"}).status_code == 400


def test_google_sign_in_creates_the_account_once(google):
    google.table["t1"] = _claims("lan@example.com", "Phạm Lan")
    first = _sign_in(google, "t1")
    assert first.status_code == 200
    assert first.json()["user"]["name"] == "Phạm Lan" and first.json()["user"]["email"] == "lan@example.com"
    headers = {"Authorization": f"Bearer {first.json()['token']}"}
    assert google.get("/api/me", headers=headers).json()["email"] == "lan@example.com"

    google.table["t2"] = _claims("LAN@example.com", "Tên khác")  # same address again: same account, name unchanged
    again = _sign_in(google, "t2").json()
    assert again["user"]["id"] == first.json()["user"]["id"] and again["user"]["name"] == "Phạm Lan"


def test_google_sign_in_rejects_what_google_would_not_vouch_for(google):
    google.table["bad"] = _claims("x@example.com", verified=False)
    assert _sign_in(google, "bad").status_code == 400
    assert _sign_in(google, "unknown-token").status_code == 400


def test_invitations_sent_to_an_email_apply_when_that_person_signs_in_with_google(google):
    google.table["host"] = _claims("host@example.com", "Chủ trì")
    host = _sign_in(google, "host").json()
    headers = {"Authorization": f"Bearer {host['token']}"}
    org = google.post("/api/orgs", json={"name": "Công ty"}, headers=headers).json()["id"]
    meeting = google.post("/api/meetings", json={"org_id": org, "title": "Họp"}, headers=headers).json()["id"]
    google.post(f"/api/orgs/{org}/invitations", json={"emails": ["guest@example.com"]}, headers=headers)
    google.post(f"/api/meetings/{meeting}/invitations", json={"emails": ["guest@example.com"]}, headers=headers)

    google.table["guest"] = _claims("guest@example.com", "Khách")
    guest = _sign_in(google, "guest").json()
    gh = {"Authorization": f"Bearer {guest['token']}"}
    assert [o["id"] for o in google.get("/api/orgs", headers=gh).json()] == [org]
    assert google.get(f"/api/meetings/{meeting}", headers=gh).status_code == 200


def test_google_sign_in_is_refused_when_not_configured(client):
    assert client.get("/api/config").json()["google_client_id"] is None
    assert client.post("/api/auth/google", json={"credential": "x"}).status_code == 400
