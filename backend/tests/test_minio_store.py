"""Runs against a real MinIO when MEETMIND_TEST_MINIO=host:port is set (credentials in MEETMIND_TEST_MINIO_KEY/SECRET)."""
from __future__ import annotations

import os
import uuid

import pytest

from adapters.storage.minio_store import MinioStore

ENDPOINT = os.environ.get("MEETMIND_TEST_MINIO")
pytestmark = pytest.mark.skipif(not ENDPOINT, reason="set MEETMIND_TEST_MINIO to run against a real MinIO")


async def test_put_get_delete_roundtrip():
    store = MinioStore(
        ENDPOINT,
        os.environ.get("MEETMIND_TEST_MINIO_KEY", "meetmind"),
        os.environ.get("MEETMIND_TEST_MINIO_SECRET", "meetmind-secret-1"),
        bucket=f"test-{uuid.uuid4().hex[:8]}",
    )
    await store.ensure_ready()
    await store.ensure_ready()  # idempotent
    key = "orgs/o1/meetings/m1/documents/d1/document.pdf"
    await store.put(key, b"%PDF-1.4 hello")
    assert await store.get(key) == b"%PDF-1.4 hello"
    await store.delete(key)
    await store.delete(key)  # deleting twice is fine
    with pytest.raises(Exception):
        await store.get(key)
