"""Adapter for the Attendee meeting-bot API (https://github.com/attendee-labs/attendee).

Checked against Attendee's source code (routes, `Authorization: Token <key>`, bot states, the transcript
serializer, the `updated_after` filter and how caption utterances are saved), and exercised in a real Google Meet.

How it works: create a bot for the meeting URL, then poll the bot's transcript several times a second.
For Google Meet, Attendee transcribes from the platform's own closed captions by default (no provider needed).
Anything under `transcription_settings` in the config is passed on as is.

Streaming: Attendee rewrites a caption utterance in place while the person is still speaking (it uses
update_or_create), so the same utterance is read many times with growing text. Every change is emitted at once as a
partial segment (same id), and the segment becomes final when its text has not changed for `stable_s` seconds
(or when the meeting ends). Only utterances changed since the previous poll are requested (`updated_after`).
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Callable

import httpx

from core.models import MeetingEvent, Segment

log = logging.getLogger(__name__)

_JOINED = {"joined_not_recording", "joined_recording", "joined_recording_paused"}
_GONE = {"ended", "post_processing", "leaving", "data_deleted"}
_OVERLAP = timedelta(seconds=2)  # re-read a little before the last poll so no update falls into a gap


@dataclass
class _Utterance:
    segment_id: str
    speaker: str = ""
    text: str = ""
    start_ms: int = 0
    duration_ms: int = 0
    changed_at: float = 0.0
    final: bool = False


@dataclass
class _Run:
    bot_id: str
    segments: asyncio.Queue = field(default_factory=asyncio.Queue)
    events: asyncio.Queue = field(default_factory=asyncio.Queue)
    poller: asyncio.Task | None = None


class AttendeeBot:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        bot_name: str = "MeetMind",
        poll_interval_s: float = 0.5,
        transcription_settings: dict[str, Any] | None = None,
        stable_s: float = 1.5,
        state_every_s: float = 2.0,
        clock: Callable[[], float] = time.monotonic,
        client: httpx.AsyncClient | None = None,
    ):
        self._bot_name = bot_name
        self._poll = poll_interval_s
        self._transcription = transcription_settings
        self._stable = stable_s
        self._state_every = state_every_s
        self._clock = clock
        self._client = client or httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Token {api_key}"},
            timeout=30,
        )
        self._runs: dict[str, _Run] = {}

    async def join(self, meeting_id: str, meet_url: str) -> None:
        body: dict[str, Any] = {"meeting_url": meet_url, "bot_name": self._bot_name}
        if self._transcription:
            body["transcription_settings"] = self._transcription
        resp = await self._client.post("/api/v1/bots", json=body)
        resp.raise_for_status()
        run = _Run(bot_id=resp.json()["id"])
        self._runs[meeting_id] = run
        run.poller = asyncio.create_task(self._poll_loop(meeting_id, run))

    async def leave(self, meeting_id: str) -> None:
        run = self._runs.get(meeting_id)
        if run is None:
            return
        resp = await self._client.post(f"/api/v1/bots/{run.bot_id}/leave")
        resp.raise_for_status()

    def segments(self, meeting_id: str) -> AsyncIterator[Segment]:
        return self._drain(self._runs[meeting_id].segments)

    def events(self, meeting_id: str) -> AsyncIterator[MeetingEvent]:
        return self._drain(self._runs[meeting_id].events)

    async def get_recording(self, meeting_id: str) -> str | None:
        return None  # downloading recordings is not implemented yet

    async def _poll_loop(self, meeting_id: str, run: _Run) -> None:
        seen: dict[tuple, _Utterance] = {}
        base_ts: int | None = None
        joined = waiting = False
        since: datetime | None = None
        last_state_check = float("-inf")
        try:
            while True:
                now = self._clock()
                if now - last_state_check >= self._state_every:
                    last_state_check = now
                    state = (await self._get(f"/api/v1/bots/{run.bot_id}")).get("state", "")
                    if state == "waiting_room" and not waiting:
                        waiting = True
                        run.events.put_nowait(MeetingEvent("waiting", "Bot đang đứng ở phòng chờ của Meet. Trong cuộc họp, bấm Cho phép (Admit) để bot vào."))
                    if state in _JOINED and not joined:
                        joined = True
                        run.events.put_nowait(MeetingEvent("joined"))
                    if state == "fatal_error":
                        run.events.put_nowait(MeetingEvent("failed", "Bot gặp lỗi"))
                        break
                    if state in _GONE and joined:
                        base_ts = await self._emit_new(meeting_id, run, seen, base_ts, now, None)  # everything, once more
                        self._finish_all(meeting_id, run, seen)
                        run.events.put_nowait(MeetingEvent("ended"))
                        break
                polled_at = datetime.now(timezone.utc)
                base_ts = await self._emit_new(meeting_id, run, seen, base_ts, now, since)
                since = polled_at - _OVERLAP
                self._finalize_idle(meeting_id, run, seen, now)
                await asyncio.sleep(self._poll)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("attendee polling failed for %s", meeting_id)
            run.events.put_nowait(MeetingEvent("failed", "Mất kết nối tới Attendee"))
        finally:
            run.events.put_nowait(None)
            run.segments.put_nowait(None)

    async def _emit_new(
        self, meeting_id: str, run: _Run, seen: dict[tuple, _Utterance], base_ts: int | None, now: float, since: datetime | None
    ) -> int | None:
        try:
            params = {"updated_after": since.isoformat()} if since else None
            utterances = await self._get(f"/api/v1/bots/{run.bot_id}/transcript", params)
        except httpx.HTTPStatusError:
            return base_ts  # no transcript yet
        for u in utterances if isinstance(utterances, list) else []:
            text = ((u.get("transcription") or {}).get("transcript") or "").strip()
            if not text:
                continue
            ts = int(u.get("timestamp_ms") or 0)
            if base_ts is None:
                base_ts = ts if ts > 10**11 else 0  # epoch timestamps -> relative to the first utterance
            key = (u.get("speaker_uuid") or u.get("speaker_name"), u.get("timestamp_ms"))
            utt = seen.get(key)
            if utt is None:
                utt = seen[key] = _Utterance(segment_id=f"seg_{run.bot_id}_{len(seen) + 1}")
            utt.speaker = u.get("speaker_name") or "Người nói"
            utt.start_ms = max(ts - base_ts, 0)
            utt.duration_ms = int(u.get("duration_ms") or 0)
            if text != utt.text:
                utt.text, utt.changed_at, utt.final = text, now, False
                self._emit(meeting_id, run, utt, final=False)
        return base_ts

    def _finalize_idle(self, meeting_id: str, run: _Run, seen: dict[tuple, _Utterance], now: float) -> None:
        """A text that stopped changing is a finished sentence."""
        for utt in seen.values():
            if not utt.final and utt.text and now - utt.changed_at >= self._stable:
                utt.final = True
                self._emit(meeting_id, run, utt, final=True)

    def _finish_all(self, meeting_id: str, run: _Run, seen: dict[tuple, _Utterance]) -> None:
        """The meeting is over: whatever is still a partial is as final as it will get."""
        for utt in seen.values():
            if not utt.final and utt.text:
                utt.final = True
                self._emit(meeting_id, run, utt, final=True)

    @staticmethod
    def _emit(meeting_id: str, run: _Run, utt: _Utterance, final: bool) -> None:
        run.segments.put_nowait(
            Segment(
                id=utt.segment_id,
                meeting_id=meeting_id,
                speaker=utt.speaker,
                start_ms=utt.start_ms,
                end_ms=utt.start_ms + utt.duration_ms,
                text=utt.text,
                lang="",
                is_final=final,
                source="attendee",
            )
        )

    async def _get(self, path: str, params: dict | None = None) -> Any:
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    async def _drain(queue: asyncio.Queue):
        while (item := await queue.get()) is not None:
            yield item
