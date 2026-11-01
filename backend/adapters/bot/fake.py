from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator

from adapters.demo_data import SCRIPT
from core.models import MeetingEvent, Segment


@dataclass
class _Run:
    segments: asyncio.Queue = field(default_factory=asyncio.Queue)
    events: asyncio.Queue = field(default_factory=asyncio.Queue)
    task: asyncio.Task | None = None
    finished: bool = False


class FakeBot:
    """Plays the demo script as if a bot were sitting in a meeting. `speed` > 1 plays it faster."""

    def __init__(self, speed: float = 1.0, gap_s: float = 3.0, script: list[dict] | None = None):
        self._speed = max(speed, 0.01)
        self._gap = gap_s
        self._script = script if script is not None else SCRIPT
        self._runs: dict[str, _Run] = {}

    async def join(self, meeting_id: str, meet_url: str) -> None:
        run = _Run()
        self._runs[meeting_id] = run
        run.task = asyncio.create_task(self._play(meeting_id, run))

    async def leave(self, meeting_id: str) -> None:
        run = self._runs.get(meeting_id)
        if run is None:
            return
        if run.task:
            run.task.cancel()
        self._finish(run)

    def segments(self, meeting_id: str) -> AsyncIterator[Segment]:
        return self._drain(self._runs[meeting_id].segments)

    def events(self, meeting_id: str) -> AsyncIterator[MeetingEvent]:
        return self._drain(self._runs[meeting_id].events)

    async def get_recording(self, meeting_id: str) -> str | None:
        return None

    async def _play(self, meeting_id: str, run: _Run) -> None:
        try:
            await self._sleep(1.0)
            run.events.put_nowait(MeetingEvent("waiting", "Bot đang đứng ở phòng chờ của Meet. Trong cuộc họp, bấm Cho phép (Admit) để bot vào."))
            await self._sleep(2.0)
            run.events.put_nowait(MeetingEvent("joined"))
            clock_ms = 0
            for line in self._script:
                seg_id = f"seg_{uuid.uuid4().hex[:10]}"
                words = line["text"].split()
                duration_ms = max(1500, len(words) * 380)
                base = dict(
                    id=seg_id,
                    meeting_id=meeting_id,
                    speaker=line["speaker"],
                    lang=line["lang"],
                    start_ms=clock_ms,
                    source="demo",
                )
                half = " ".join(words[: max(1, len(words) // 2)])
                run.segments.put_nowait(Segment(**base, end_ms=clock_ms + duration_ms // 2, text=half, is_final=False))
                await self._sleep(self._gap / 2)
                run.segments.put_nowait(Segment(**base, end_ms=clock_ms + duration_ms, text=line["text"], is_final=True))
                clock_ms += duration_ms + 800
                await self._sleep(self._gap / 2)
            self._finish(run)
        except asyncio.CancelledError:
            pass

    def _finish(self, run: _Run) -> None:
        if run.finished:
            return
        run.finished = True
        run.events.put_nowait(MeetingEvent("ended"))
        run.events.put_nowait(None)
        run.segments.put_nowait(None)

    async def _sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds / self._speed)

    @staticmethod
    async def _drain(queue: asyncio.Queue):
        while (item := await queue.get()) is not None:
            yield item
