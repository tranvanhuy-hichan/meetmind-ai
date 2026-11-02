from __future__ import annotations

from typing import AsyncIterator

from core.models import MeetingEvent, Segment
from core.platforms import MEET, detect_platform
from core.ports import MeetingBot


class PlatformBotRouter:
    """A `MeetingBot` that hands each meeting to the bot of its platform, chosen by the link.

    Which bot serves a meeting is remembered from `join`, so `leave`, `segments` and `events` reach the same one."""

    def __init__(self, bots: dict[str, MeetingBot]):
        self._bots = bots
        self._by_meeting: dict[str, MeetingBot] = {}

    async def join(self, meeting_id: str, meet_url: str) -> None:
        bot = self._bots.get(detect_platform(meet_url) or MEET)
        if bot is None:
            raise ValueError("Chưa cấu hình bot cho nền tảng của link này")
        await bot.join(meeting_id, meet_url)
        self._by_meeting[meeting_id] = bot

    async def leave(self, meeting_id: str) -> None:
        await self._by_meeting[meeting_id].leave(meeting_id)

    def segments(self, meeting_id: str) -> AsyncIterator[Segment]:
        return self._by_meeting[meeting_id].segments(meeting_id)

    def events(self, meeting_id: str) -> AsyncIterator[MeetingEvent]:
        return self._by_meeting[meeting_id].events(meeting_id)

    async def get_recording(self, meeting_id: str) -> str | None:
        return await self._by_meeting[meeting_id].get_recording(meeting_id)

    async def release_orphans(self) -> int:
        released = 0
        for bot in {id(b): b for b in self._bots.values()}.values():
            release = getattr(bot, "release_orphans", None)
            if release:
                released += await release()
        return released
