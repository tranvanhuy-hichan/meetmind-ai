from __future__ import annotations

import asyncio
import logging
from collections import deque
from dataclasses import asdict, replace
from datetime import datetime, timezone
from typing import Awaitable, Callable

from core.errors import Invalid
from core.languages import guess_lang
from core.models import MeetingEvent, MeetingStatus, Segment
from core.ports import EventBus, MeetingBot, Repository
from core.services.presence import PresenceRegistry
from core.services.topics import meeting_topic
from core.services.translation import TranslationService

log = logging.getLogger(__name__)

FinalizeHook = Callable[[str], Awaitable[None]]


class LivePipeline:
    """bot -> segments -> store -> broadcast -> translate for whoever is reading another language."""

    def __init__(
        self,
        bot: MeetingBot,
        repo: Repository,
        bus: EventBus,
        presence: PresenceRegistry,
        translation: TranslationService,
        on_ended: FinalizeHook | None = None,
        context_size: int = 4,
    ):
        self._bot = bot
        self._repo = repo
        self._bus = bus
        self._presence = presence
        self._translation = translation
        self._on_ended = on_ended
        self._context_size = context_size
        self._runs: dict[str, tuple[asyncio.Task, asyncio.Task]] = {}
        self._context: dict[str, deque[Segment]] = {}
        self._background: set[asyncio.Task] = set()

    def is_running(self, meeting_id: str) -> bool:
        return meeting_id in self._runs

    async def start(self, meeting_id: str, meet_url: str) -> None:
        if self.is_running(meeting_id):
            raise Invalid("Bot đã được gọi vào cuộc họp này")
        await self._set_status(meeting_id, MeetingStatus.BOT_JOINING)
        try:
            await self._bot.join(meeting_id, meet_url)
        except Exception as exc:
            await self._set_status(meeting_id, MeetingStatus.BOT_FAILED)
            raise Invalid(f"Không thể gọi bot vào cuộc họp: {exc}") from exc
        self._context[meeting_id] = deque(maxlen=self._context_size + 1)
        seg_task = asyncio.create_task(self._consume_segments(meeting_id))
        evt_task = asyncio.create_task(self._consume_events(meeting_id, seg_task))
        self._runs[meeting_id] = (seg_task, evt_task)

    async def stop(self, meeting_id: str) -> None:
        if not self.is_running(meeting_id):
            raise Invalid("Bot chưa ở trong cuộc họp")
        await self._bot.leave(meeting_id)

    async def shutdown(self) -> None:
        for seg_task, evt_task in list(self._runs.values()):
            seg_task.cancel()
            evt_task.cancel()
        for task in list(self._background):
            task.cancel()
        self._runs.clear()

    async def _consume_segments(self, meeting_id: str) -> None:
        try:
            async for seg in self._bot.segments(meeting_id):
                await self._on_segment(meeting_id, seg)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("segment stream failed for %s", meeting_id)

    async def _consume_events(self, meeting_id: str, seg_task: asyncio.Task) -> None:
        try:
            async for event in self._bot.events(meeting_id):
                if await self._on_event(meeting_id, event, seg_task):
                    break
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("event stream failed for %s", meeting_id)
        finally:
            self._runs.pop(meeting_id, None)
            self._context.pop(meeting_id, None)

    async def _on_event(self, meeting_id: str, event: MeetingEvent, seg_task: asyncio.Task) -> bool:
        """Returns True when the meeting is over and the event loop should stop."""
        if event.type == "joined":
            await self._repo.update_meeting(meeting_id, started_at=datetime.now(timezone.utc))
            await self._set_status(meeting_id, MeetingStatus.LIVE)
        elif event.type == "waiting":
            await self._publish(meeting_id, {"type": "bot.waiting", "detail": event.detail})
        elif event.type == "failed":
            await self._set_status(meeting_id, MeetingStatus.BOT_FAILED)
            return True
        elif event.type == "ended":
            await asyncio.wait({seg_task}, timeout=30)  # let the last segments drain
            await self._repo.update_meeting(meeting_id, ended_at=datetime.now(timezone.utc))
            await self._set_status(meeting_id, MeetingStatus.ENDED)
            if self._on_ended:
                self._spawn(self._on_ended(meeting_id))
            return True
        return False

    async def _on_segment(self, meeting_id: str, seg: Segment) -> None:
        if not seg.lang:
            seg = replace(seg, lang=guess_lang(seg.text))
        kind = "segment.final" if seg.is_final else "segment.partial"
        if seg.is_final:
            await self._repo.add_segment(seg)
        await self._publish(meeting_id, {"type": kind, "segment": asdict(seg)})
        context = list(self._context.get(meeting_id, []))[-self._context_size :]
        if not seg.is_final:
            for lang in self._presence.languages(meeting_id) - {seg.lang}:
                self._spawn(self._translation.translate_partial(seg, lang, context))  # live, while the person is still speaking
            return
        self._context.setdefault(meeting_id, deque(maxlen=self._context_size + 1)).append(seg)
        for lang in self._presence.languages(meeting_id) - {seg.lang}:
            self._spawn(self._translation.translate_and_publish(seg, lang, context))

    async def _set_status(self, meeting_id: str, status: MeetingStatus) -> None:
        await self._repo.update_meeting(meeting_id, status=status.value)
        await self._publish(meeting_id, {"type": "status", "status": status.value})

    async def _publish(self, meeting_id: str, payload: dict) -> None:
        await self._bus.publish(meeting_topic(meeting_id), payload)

    def _spawn(self, coro) -> None:
        task = asyncio.create_task(coro)
        self._background.add(task)
        task.add_done_callback(self._background.discard)
