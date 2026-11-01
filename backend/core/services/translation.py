from __future__ import annotations

import asyncio
import logging
from collections import deque

from core.models import Segment
from core.ports import EventBus, Repository, Translator
from core.services.topics import meeting_topic

log = logging.getLogger(__name__)


class TranslationService:
    """Translates segments, stores the final result and tells connected clients.

    While somebody is still speaking, the growing text is translated too (`translate_partial`) so the reader sees
    the translation build up with the speech. Those live translations are shown but never stored, and at most one
    is in flight per segment and language: while it runs, newer text just replaces the one waiting."""

    def __init__(
        self,
        translator: Translator,
        repo: Repository,
        bus: EventBus,
        max_concurrency: int = 4,
        partials: bool = True,
        min_partial_chars: int = 4,
    ):
        self._translator = translator
        self._repo = repo
        self._bus = bus
        self._sem = asyncio.Semaphore(max_concurrency)
        self._partials = partials
        self._min_partial = min_partial_chars
        self._waiting: dict[tuple[str, str], Segment] = {}  # (segment, language) -> newest text not yet translated
        self._finished: set[str] = set()  # segments whose final translation has started
        self._finished_order: deque[str] = deque(maxlen=1000)

    async def translate_partial(self, seg: Segment, lang: str, context: list[Segment] | None = None) -> None:
        if not self._partials or seg.lang == lang or len(seg.text.strip()) < self._min_partial:
            return
        key = (seg.id, lang)
        if key in self._waiting:
            self._waiting[key] = seg  # the running call comes back for this newer text
            return
        self._waiting[key] = seg
        try:
            while True:
                current = self._waiting[key]
                async with self._sem:
                    result = (await self._translator.translate([current], lang, context))[0]
                if seg.id in self._finished:
                    return  # the sentence is complete: its final translation owns the display now
                await self._publish(seg, lang, result.text, partial=True)
                if self._waiting[key] is current:
                    return
        except Exception:
            log.exception("live translation failed for %s -> %s", seg.id, lang)
        finally:
            self._waiting.pop(key, None)

    async def translate_and_publish(
        self, seg: Segment, lang: str, context: list[Segment] | None = None
    ) -> None:
        self._mark_finished(seg.id)
        if not seg.text.strip() or seg.lang == lang:
            return
        try:
            async with self._sem:
                result = (await self._translator.translate([seg], lang, context))[0]
            await self._repo.save_translation(result)
            await self._publish(seg, lang, result.text, partial=False)
        except Exception:
            log.exception("translation failed for %s -> %s", seg.id, lang)

    async def backfill(self, meeting_id: str, lang: str, limit: int = 50) -> None:
        """Translate the most recent segments a reader who just switched language is missing."""
        segments = await self._repo.list_segments(meeting_id)
        have = await self._repo.list_translations(meeting_id, lang)
        missing = [s for s in segments if s.lang != lang and s.id not in have][-limit:]
        for i, seg in enumerate(missing):
            await self.translate_and_publish(seg, lang, missing[max(0, i - 3) : i])

    async def _publish(self, seg: Segment, lang: str, text: str, partial: bool) -> None:
        await self._bus.publish(
            meeting_topic(seg.meeting_id),
            {"type": "segment.translation", "segment_id": seg.id, "lang": lang, "text": text, "partial": partial},
        )

    def _mark_finished(self, segment_id: str) -> None:
        if segment_id in self._finished:
            return
        if len(self._finished_order) == self._finished_order.maxlen:
            self._finished.discard(self._finished_order[0])
        self._finished_order.append(segment_id)
        self._finished.add(segment_id)
