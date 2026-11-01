from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

from core.models import MeetingStatus
from core.ports import Repository

log = logging.getLogger(__name__)


async def recover_interrupted(
    repo: Repository,
    finalize: Callable[[str], Awaitable[None]],
    release_bots: Callable[[], Awaitable[int]] | None = None,
) -> list[str]:
    """After a restart no meeting can really be 'live': the process that listened to the bot is gone.

    They are closed as ended and go through the normal after-meeting step, so whatever was transcribed
    still becomes minutes. Bots left in rooms are told to leave. Returns the ids that were recovered."""
    stale = await repo.list_meetings_by_status([MeetingStatus.BOT_JOINING.value, MeetingStatus.LIVE.value])
    for meeting in stale:
        await repo.update_meeting(meeting.id, status=MeetingStatus.ENDED.value, ended_at=datetime.now(timezone.utc))
    for meeting in stale:
        try:
            await finalize(meeting.id)
        except Exception:
            log.exception("could not finalize recovered meeting %s", meeting.id)
    if release_bots is not None:
        try:
            released = await release_bots()
            if released:
                log.info("made %d orphaned bot(s) leave their meetings", released)
        except Exception:
            log.exception("could not release orphaned bots")
    return [m.id for m in stale]
