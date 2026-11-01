from __future__ import annotations

import asyncio
import io
import os

import pytest
from pypdf import PdfWriter
from starlette.testclient import TestClient

from adapters.db.sql import SqlRepository
from app.main import create_app
from app.settings import Settings, load_config


def make_pdf(pages: int = 3) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _fresh_database(tmp_path) -> str:
    """SQLite file per test; or an empty schema in the server named by MEETMIND_TEST_DATABASE_URL (e.g. Postgres)."""
    url = os.environ.get("MEETMIND_TEST_DATABASE_URL")
    if not url:
        return f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"

    async def reset() -> None:
        repo = SqlRepository(url)
        await repo.drop_schema()
        await repo.dispose()

    asyncio.run(reset())
    return url


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        _env_file=None,  # tests must not depend on a developer's local .env
        database_url=_fresh_database(tmp_path),
        data_dir=tmp_path / "data",
        prompts_dir="prompts",
        jwt_secret="test-secret-test-secret-test-secret-123",
        config_path=tmp_path / "missing.yaml",
    )
    config = load_config(settings.config_path)
    config["bot"] = {"adapter": "fake", "speed": 5000.0, "gap_s": 3.0}
    with TestClient(create_app(settings, config)) as c:
        yield c


def sign_in(client: TestClient, email: str, name: str | None = None) -> dict:
    """Email sign-in as the product does it: ask for a code, then confirm it (the console mailer reveals the code)."""
    sent = client.post("/api/auth/request-code", json={"email": email})
    assert sent.status_code == 200, sent.text
    resp = client.post("/api/auth/verify", json={"email": email, "code": sent.json()["dev_code"], "name": name})
    assert resp.status_code == 200, resp.text
    return resp.json()


class Session:
    """A signed-in user for tests."""

    def __init__(self, client: TestClient, email: str, name: str):
        body = sign_in(client, email, name)
        self.token = body["token"]
        self.user_id = body["user"]["id"]
        self.email = email
        self.headers = {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def make_user(client):
    return lambda email, name: Session(client, email, name)


@pytest.fixture
def make_org(client):
    def create(owner: Session, name: str = "Công ty Mẫu") -> str:
        resp = client.post("/api/orgs", json={"name": name}, headers=owner.headers)
        assert resp.status_code == 200, resp.text
        return resp.json()["id"]

    return create


@pytest.fixture
def outbox(client):
    return client.app.state.container.mailer.outbox
