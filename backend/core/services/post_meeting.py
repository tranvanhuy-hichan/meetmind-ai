from __future__ import annotations

import logging
from dataclasses import replace

from core.models import MeetingStatus
from core.ports import ASR, EventBus, MeetingBot, Repository
from core.services.minutes import MinutesService
from core.services.topics import meeting_topic

log = logging.getLogger(__name__)


class PostMeetingService:
    """After the meeting: make sure a transcript exists, then draft the minutes."""

    def __init__(
        self,
        repo: Repository,
        bot: MeetingBot,
        asr: ASR | None,
        minutes: MinutesService,
        bus: EventBus,
        auto_minutes: bool = True,
    ):
        self._repo = repo
        self._bot = bot
        self._asr = asr
        self._minutes = minutes
        self._bus = bus
        self._auto_minutes = auto_minutes

    async def finalize(self, meeting_id: str) -> None:
        await self._set_status(meeting_id, MeetingStatus.PROCESSING)
        try:
            await self._ensure_transcript(meeting_id)
            if self._auto_minutes:
                await self._minutes.generate(meeting_id)
                await self._bus.publish(meeting_topic(meeting_id), {"type": "minutes.ready"})
        except Exception:
            log.exception("post-meeting processing failed for %s", meeting_id)
        await self._set_status(meeting_id, MeetingStatus.READY)

    async def _ensure_transcript(self, meeting_id: str) -> None:
        """The live transcript is kept as is. Only when it is empty do we fall back to the recording."""
        if await self._repo.list_segments(meeting_id) or self._asr is None:
            return
        path = await self._bot.get_recording(meeting_id)
        if not path:
            return
        for seg in await self._asr.transcribe_file(path):
            await self._repo.add_segment(replace(seg, meeting_id=meeting_id))

    async def _set_status(self, meeting_id: str, status: MeetingStatus) -> None:
        await self._repo.update_meeting(meeting_id, status=status.value)
        await self._bus.publish(meeting_topic(meeting_id), {"type": "status", "status": status.value})
