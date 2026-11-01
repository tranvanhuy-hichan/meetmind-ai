from __future__ import annotations

import asyncio
import io

from minio import Minio
from minio.error import S3Error


class MinioStore:
    """Object store on MinIO (or any S3-compatible server). Keys look like paths."""

    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str, secure: bool = False):
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        self._bucket = bucket

    async def ensure_ready(self) -> None:
        def make() -> None:
            if not self._client.bucket_exists(self._bucket):
                self._client.make_bucket(self._bucket)

        await asyncio.to_thread(make)

    async def put(self, key: str, data: bytes) -> None:
        await asyncio.to_thread(
            self._client.put_object, self._bucket, key, io.BytesIO(data), len(data), "application/octet-stream"
        )

    async def get(self, key: str) -> bytes:
        def read() -> bytes:
            response = self._client.get_object(self._bucket, key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()

        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        def remove() -> None:
            try:
                self._client.remove_object(self._bucket, key)
            except S3Error:
                pass  # already gone

        await asyncio.to_thread(remove)
