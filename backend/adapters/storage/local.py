from __future__ import annotations

import asyncio
from pathlib import Path


class LocalStore:
    """Object store on the local disk. Keys look like paths: 'meetings/<id>/documents/<id>/document.pdf'."""

    def __init__(self, root: Path):
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if self._root not in path.parents:
            raise ValueError("invalid storage key")
        return path

    async def ensure_ready(self) -> None:
        self._root.mkdir(parents=True, exist_ok=True)

    async def put(self, key: str, data: bytes) -> None:
        path = self._path(key)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(write)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, True)
