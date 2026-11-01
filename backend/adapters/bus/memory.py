from __future__ import annotations

import asyncio
from collections import defaultdict


class _Subscription:
    def __init__(self, bus: "MemoryBus", topic: str):
        self._bus = bus
        self._topic = topic
        self.queue: asyncio.Queue[dict] = asyncio.Queue()

    async def get(self) -> dict:
        return await self.queue.get()

    def close(self) -> None:
        self._bus._subs[self._topic].discard(self)


class MemoryBus:
    """In-process pub/sub. Enough for a single API process; swap for Redis to run several."""

    def __init__(self) -> None:
        self._subs: dict[str, set[_Subscription]] = defaultdict(set)

    async def publish(self, topic: str, payload: dict) -> None:
        for sub in list(self._subs[topic]):
            sub.queue.put_nowait(payload)

    def subscribe(self, topic: str) -> _Subscription:
        sub = _Subscription(self, topic)
        self._subs[topic].add(sub)
        return sub
